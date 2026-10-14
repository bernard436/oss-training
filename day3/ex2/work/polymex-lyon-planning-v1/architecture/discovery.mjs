// architecture/discovery.mjs: brings the CSVs of the three throwaway discovery apps into the main app, for validation.
// Anyone who may write feedback can import a CSV. The import only PROPOSES findings. Corinne validates (gate rule_activation).
// A validated changeover finding becomes an active changeover_override rule (compiled first). A validated insight becomes a
// feedback item, so the existing loop (Feedback tab, AI, Friday review) picks it up. Raw rows are purged once validated.
// No names are ever imported: only line, products, times, kg, reasons, suppliers and dates. Every function: guard first, audit last.
import { compile } from '../platform/rules/engine.mjs';
import { guard, audit, requiresHuman, PermissionError } from '../platform/harness/harness.mjs';
import * as store from '../platform/store.mjs';

const err = (status, message) => Object.assign(new Error(message), { status });
const TARGET = { changeover: 3, night_swap: 20, material: 3 };
const LINES = ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07'];
const NIGHT_ACTION = {
  'Material missing': 'Check masterbatch on site before the night (warehouse ✓ at 14:00, field Order.material_confirmed)',
  'Breakdown': 'Plan around the weak part of the line (Line.known_weak_part, MaintPro windows)',
  'Crew short': 'Make night crew size a capacity input of the plan',
  'Quality hold': 'Link lab holds to the order so the plan sees them',
  'Mould or tool not ready': 'Tool readiness check before the shift starts',
  'Rush order': 'Check that the freeze window was respected',
  'Plan not feasible': 'A rule is missing: Corinne to name it in the Friday review',
  'Other': 'Read the free remarks in the Friday review',
};

const db = () => store.read('discovery') || { imports: [], findings: [] };
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (x) => Math.round(x * 10) / 10;

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x !== '')) rows.push(row);
  if (!rows.length) return [];
  const h = rows[0].map((x) => x.trim());
  return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export function detectKind(rows) {
  const k = Object.keys(rows[0] || {});
  if (k.includes('from_product') && k.includes('minutes')) return 'changeover';
  if (k.includes('reason')) return 'night_swap';
  if (k.includes('supplier') && k.includes('promised')) return 'material';
  return null;
}

function changeoverFindings(rows, importId) {
  const products = store.read('products'); const R = compile(store.read('rules'), products);
  const code = (s) => String(s).split(' ')[0];
  const ok = rows.filter((r) => LINES.includes(r.line) && R.P[code(r.from_product)] && R.P[code(r.to_product)] && +r.minutes > 0);
  const g = {};
  for (const r of ok) { const k = [code(r.from_product), code(r.to_product), r.line].join('|'); (g[k] = g[k] || []).push(r); }
  return Object.entries(g).map(([k, rs]) => {
    const [from, to, line] = k.split('|'); const n = rs.length; const m = median(rs.map((r) => +r.minutes));
    const scrap = avg(rs.map((r) => +r.scrap_kg || 0)); const planned = R.changeover(from, to, line).minutes;
    const gap = planned == null ? null : m - planned;
    const differs = planned != null && Math.abs(gap) >= Math.max(10, 0.15 * planned);
    const base = { kind: 'changeover', import_id: importId, n, target: TARGET.changeover, about: `${from} → ${to} on ${line}`,
      evidence: { measured_median_min: m, planned_min: planned, gap_min: gap, scrap_kg_avg: r1(scrap), measures: rs.map((r) => +r.minutes) } };
    if (n < TARGET.changeover) return { ...base, statement: `${n} of ${TARGET.changeover} measures so far: median ${m} min, plan uses ${planned ?? 'forbidden'} min`, status: 'not enough data' };
    if (!differs) return { ...base, statement: `Confirmed: real median ${m} min, plan uses ${planned} min. Start-up scrap ${r1(scrap)} kg on average`, status: 'to validate' };
    return { ...base, statement: `Plan uses ${planned} min, real median is ${m} min (${gap > 0 ? '+' : ''}${gap} min). Start-up scrap ${r1(scrap)} kg on average`, status: 'to validate',
      proposal: { rule_type: 'changeover_override', params: { from_product: from, to_product: to, line, minutes: Math.round(m) }, statement: `${from} to ${to} on ${line}: ${Math.round(m)} minutes (measured, ${n} changeovers)` } };
  });
}

function nightFindings(rows, importId) {
  const ok = rows.filter((r) => r.reason); const n = ok.length; const c = {};
  ok.forEach((r) => { c[r.reason] = (c[r.reason] || 0) + 1; });
  const enough = n >= TARGET.night_swap;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([reason, v], i) => {
    const lines = {}; ok.filter((r) => r.reason === reason).forEach((r) => { lines[r.line] = (lines[r.line] || 0) + 1; });
    return { kind: 'night_swap', import_id: importId, n, target: TARGET.night_swap, about: reason,
      statement: `#${i + 1} cause of night swaps: ${reason}, ${v} of ${n} (${Math.round((v / n) * 100)}%). Next step: ${NIGHT_ACTION[reason] || NIGHT_ACTION.Other}`,
      evidence: { count: v, share_pct: Math.round((v / n) * 100), per_line: lines }, status: enough ? 'to validate' : 'not enough data' };
  });
}

function materialFindings(rows, importId) {
  const day = (s) => Date.parse(s + 'T00:00:00Z');
  const done = rows.filter((r) => r.arrived && r.promised).map((r) => ({ ...r, gap: Math.round((day(r.arrived) - day(r.promised)) / 864e5) }));
  const out = [];
  for (const key of ['supplier', 'material']) {
    const g = {}; done.forEach((r) => (g[r[key]] = g[r[key]] || []).push(r));
    for (const [name, rs] of Object.entries(g)) {
      const gaps = rs.map((r) => r.gap); const n = rs.length; const a = avg(gaps); const onTime = gaps.filter((x) => x <= 0).length;
      const late = a > 0.5;
      out.push({ kind: 'material', import_id: importId, n, target: TARGET.material, about: name + (key === 'supplier' ? ' (supplier)' : ' (material)'),
        statement: `${name}: ${Math.round((onTime / n) * 100)}% on time, ${a > 0 ? '+' : ''}${r1(a)} d on average, worst ${Math.max(...gaps) > 0 ? '+' : ''}${Math.max(...gaps)} d.` + (late ? ` Next step: plan orders that need it with a ${Math.ceil(a)} d buffer and check it on site the day before.` : ' Deliveries can be trusted.'),
        evidence: { on_time_pct: Math.round((onTime / n) * 100), avg_gap_days: r1(a), worst_gap_days: Math.max(...gaps), gaps, by: key }, status: n >= TARGET.material ? 'to validate' : 'not enough data' });
    }
  }
  return out.sort((x, y) => y.evidence.avg_gap_days - x.evidence.avg_gap_days);
}

export function importCsv({ actor, csv, kind, file = '' }) {
  guard(actor, 'write', 'feedback');
  const rows = parseCsv(csv); if (!rows.length) throw err(400, 'The CSV is empty.');
  const k = kind || detectKind(rows); if (!TARGET[k]) throw err(400, 'Unknown CSV: export it from one of the three discovery apps.');
  const d = db(); const id = 'D' + String(d.imports.length + 1).padStart(3, '0');
  const f = k === 'changeover' ? changeoverFindings(rows, id) : k === 'night_swap' ? nightFindings(rows, id) : materialFindings(rows, id);
  // A new export of the same app replaces the findings not decided yet: the CSV is cumulative.
  d.findings = d.findings.filter((x) => x.kind !== k || ['validated', 'rejected'].includes(x.status));
  let next = Math.max(0, ...d.findings.map((x) => +x.id.slice(2) || 0));
  for (const x of f) d.findings.push({ id: 'DF' + String(++next).padStart(3, '0'), at: new Date().toISOString(), ...x });
  d.imports.push({ id, kind: k, at: new Date().toISOString(), by: actor, file, rows: rows.length, raw: rows });
  store.write('discovery', d);
  audit(actor, 'discovery.imported', { id, kind: k, rows: rows.length, findings: f.length });
  return { id, kind: k, rows: rows.length, findings: f.length, to_validate: f.filter((x) => x.status === 'to validate').length };
}

export function listDiscovery({ actor }) {
  guard(actor, 'read', 'ontology');
  const d = db();
  return { imports: d.imports.map(({ raw, ...x }) => ({ ...x, raw_kept: !!raw })), findings: d.findings, targets: TARGET };
}

export function decideFinding({ actor, id, decision, note = '' }) {
  guard(actor, 'write', 'rule:validated');
  const approvers = requiresHuman('rule_activation') || [];
  if (!approvers.includes(actor)) throw new PermissionError(actor + ' is not an approver of discovery findings');
  const d = db(); const f = d.findings.find((x) => x.id === id);
  if (!f || f.status !== 'to validate') throw err(409, 'Nothing to decide on ' + id);
  f.decided_by = actor; f.decided_at = new Date().toISOString(); f.note = note;
  if (decision === 'reject') { f.status = 'rejected'; store.write('discovery', d); audit(actor, 'discovery.rejected', { id }); return f; }
  if (f.proposal) {
    const rules = store.read('rules'); const rid = store.nextId('R', rules);
    rules.push({ id: rid, category: 'Measured on the floor', type: f.proposal.rule_type, statement: f.proposal.statement, params: f.proposal.params, source: 'Discovery ' + f.import_id + ' / ' + f.id + ' (changeover stopwatch)', owner: 'Corinne', status: 'active', validated_by: actor.replace('human:', ''), validated_on: f.decided_at.slice(0, 10) });
    compile(rules, store.read('products')); store.write('rules', rules); f.rule_id = rid;
  } else {
    const fb = store.read('feedback') || [];
    const item = { id: 'F' + String(fb.length + 1).padStart(3, '0'), at: f.decided_at, by: 'discovery:' + f.kind, kind: 'discovery', about: f.about, text: f.statement, outcome: 'open' };
    fb.push(item); store.write('feedback', fb); f.feedback_id = item.id;
  }
  f.status = 'validated'; store.write('discovery', d);
  audit(actor, 'discovery.validated', { id, rule_id: f.rule_id || null, feedback_id: f.feedback_id || null });
  return f;
}

// End of a study: the raw rows go, the validated findings stay (they are the answer).
export function purgeRaw({ actor, kind }) {
  guard(actor, 'write', 'rule:validated');
  const d = db(); let n = 0;
  for (const i of d.imports) if ((!kind || i.kind === kind) && i.raw) { n += i.raw.length; delete i.raw; }
  d.findings = d.findings.filter((x) => (kind && x.kind !== kind) || ['validated', 'rejected'].includes(x.status));
  store.write('discovery', d); audit(actor, 'discovery.purged', { kind: kind || 'all', rows: n });
  return { purged_rows: n };
}
