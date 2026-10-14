// architecture/discovery.mjs: brings the CSVs of the three throwaway discovery apps into the main app.
// Each finding is CONFRONTED with what the app holds today (existing vs measured), Corinne validates, and the validation
// UPDATES the main app:
//   changeover stopwatch -> an active changeover_override rule (compiled first): the next plan uses the real time;
//   material arrival     -> products get material_delay_days: promises to customers include the real supplier delay;
//   night swap reasons   -> the missing field is added to the model (Ontology), and the cause goes to Feedback.
// Anyone who may write feedback can import. Only the approvers of rule_activation (Corinne) validate.
// No names are imported: only line, products, times, kg, reasons, suppliers and dates. Every function: guard first, audit last.
import { compile } from '../platform/rules/engine.mjs';
import { guard, audit, requiresHuman, PermissionError } from '../platform/harness/harness.mjs';
import * as store from '../platform/store.mjs';
import { decideChange } from './assistant.mjs';

const err = (status, message) => Object.assign(new Error(message), { status });
const TARGET = { changeover: 3, night_swap: 20, material: 3 };
const LINES = ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07'];
const SAP_STANDARD_MIN = 60; // SAP routings 2011: flat 60 minutes for every changeover

// Night swap reason -> what the app already logs (event type) and what the model is missing.
const NIGHT = {
  'Material missing': { event: 'material_late', change: { kind: 'add_field', target: 'Order', name: 'material_confirmed', description: 'Yes when the warehouse has confirmed the material is on site (14:00 check)' } },
  'Breakdown': { event: 'machine_down', change: { kind: 'add_field', target: 'Line', name: 'known_weak_part', description: 'The part that fails most often, to plan around it' } },
  'Crew short': { event: null, change: { kind: 'add_field', target: 'Line', name: 'night_crew', description: 'Operators planned on the night shift, a capacity input of the plan' } },
  'Quality hold': { event: 'quality_hold', change: { kind: 'add_link', target: 'Event', name: 'holds lot of', object: 'Order', description: 'A quality hold names the order it comes from' } },
  'Mould or tool not ready': { event: null, change: { kind: 'add_field', target: 'Line', name: 'tool_ready', description: 'Yes when the die and screen pack for the next order are ready' } },
  'Rush order': { event: 'rush_order', change: null },
  'Plan not feasible': { event: null, change: null },
  'Other': { event: null, change: null },
};
// Material -> products that need it.
const MATERIAL = {
  'Masterbatch blue': { products: ['PPC-3110'] }, 'Masterbatch red': { products: ['PPC-3120'] }, 'Masterbatch green': { products: ['PPC-3140'] },
  'Masterbatch black': { family: 'PPK' }, 'Masterbatch white': { family: 'PPW' }, 'Glass fibre': { family: 'PPG' }, 'PA6 resin': { family: 'PA6' },
  'PP homopolymer': { family: 'PPN' }, 'Talc': { family: 'PPG' },
};

const db = () => store.read('discovery') || { imports: [], findings: [] };
const median = (a) => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (x) => Math.round(x * 10) / 10;
const sign = (x) => (x > 0 ? '+' : '') + x;

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
  const R = compile(store.read('rules'), store.read('products'));
  const code = (s) => String(s).split(' ')[0];
  const ok = rows.filter((r) => LINES.includes(r.line) && R.P[code(r.from_product)] && R.P[code(r.to_product)] && +r.minutes > 0);
  const g = {};
  for (const r of ok) { const k = [code(r.from_product), code(r.to_product), r.line].join('|'); (g[k] = g[k] || []).push(r); }
  return Object.entries(g).map(([k, rs]) => {
    const [from, to, line] = k.split('|'); const n = rs.length; const m = median(rs.map((r) => +r.minutes));
    const scrap = r1(avg(rs.map((r) => +r.scrap_kg || 0))); const now = R.changeover(from, to, line);
    const planned = now.minutes; const gap = planned == null ? null : m - planned;
    const differs = planned == null || Math.abs(gap) >= Math.max(10, 0.15 * planned);
    const f = { kind: 'changeover', import_id: importId, n, target: TARGET.changeover, about: `${from} → ${to} on ${line}`,
      existing: planned == null ? `Forbidden in the plan (rule ${now.rule})` : `Plan: ${planned} min (rule ${now.rule}) · SAP routing: ${SAP_STANDARD_MIN} min`,
      measured: `${m} min median of ${n} · start-up scrap ${scrap} kg`, gap: gap == null ? 'runs although forbidden' : sign(gap) + ' min',
      evidence: { measured_median_min: m, planned_min: planned, plan_rule: now.rule, gap_min: gap, scrap_kg_avg: scrap, measures: rs.map((r) => +r.minutes) } };
    if (n < TARGET.changeover) return { ...f, status: 'not enough data', update: `Needs ${TARGET.changeover - n} more measure(s)` };
    if (!differs) return { ...f, status: 'to validate', update: 'Nothing to change: the plan time is confirmed by the floor' };
    return { ...f, status: 'to validate', update: `New active rule: ${Math.round(m)} min for this pair on ${line}. The next plan uses it.`,
      proposal: { type: 'rule', rule_type: 'changeover_override', params: { from_product: from, to_product: to, line, minutes: Math.round(m) }, statement: `${from} to ${to} on ${line}: ${Math.round(m)} minutes (measured, ${n} changeovers, ${scrap} kg start-up scrap)` } };
  });
}

function nightFindings(rows, importId) {
  const ok = rows.filter((r) => r.reason); const n = ok.length; const c = {};
  ok.forEach((r) => { c[r.reason] = (c[r.reason] || 0) + 1; });
  const events = store.read('events') || []; const nev = events.length;
  const enough = n >= TARGET.night_swap;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([reason, v], i) => {
    const map = NIGHT[reason] || NIGHT.Other; const share = Math.round((v / n) * 100);
    const logged = map.event ? events.filter((e) => e.type === map.event).length : null;
    const existing = map.event == null ? 'Not captured anywhere in the app' : nev ? `Event log: ${logged} of ${nev} events are ${map.event} (${Math.round((logged / nev) * 100)}%)` : `Logged as ${map.event} events (none in the log yet)`;
    const lines = {}; ok.filter((r) => r.reason === reason).forEach((r) => { lines[r.line] = (lines[r.line] || 0) + 1; });
    const ch = map.change;
    return { kind: 'night_swap', import_id: importId, n, target: TARGET.night_swap, about: `#${i + 1} ${reason}`, reason,
      existing, measured: `${v} of ${n} night swaps (${share}%) · lines ${Object.entries(lines).map(([l, x]) => l + ' ' + x).join(', ')}`,
      gap: nev && logged != null ? sign(share - Math.round((logged / nev) * 100)) + ' pts' : '–',
      evidence: { count: v, share_pct: share, per_line: lines, logged_events: logged, events_total: nev }, status: enough ? 'to validate' : 'not enough data',
      update: (ch ? `Model: add ${ch.kind === 'add_link' ? 'link' : 'field'} ${ch.target}.${ch.name}. ` : '') + 'Cause added to Feedback for the Friday review.',
      proposal: ch ? { type: 'ontology', ...ch } : { type: 'feedback' } };
  });
}

function productsFor(material, products) {
  const m = MATERIAL[material]; if (!m) return [];
  return products.filter((p) => (m.products || []).includes(p.product_code) || p.family === m.family).map((p) => p.product_code);
}

function materialFindings(rows, importId) {
  const day = (s) => Date.parse(s + 'T00:00:00Z');
  const products = store.read('products'); const st = store.read('state'); const events = store.read('events') || [];
  const done = rows.filter((r) => r.arrived && r.promised).map((r) => ({ ...r, gap: Math.round((day(r.arrived) - day(r.promised)) / 864e5) }));
  const out = [];
  for (const key of ['material', 'supplier']) {
    const g = {}; done.forEach((r) => (g[r[key]] = g[r[key]] || []).push(r));
    for (const [name, rs] of Object.entries(g)) {
      const gaps = rs.map((r) => r.gap); const n = rs.length; const a = r1(avg(gaps)); const onTime = Math.round((gaps.filter((x) => x <= 0).length / n) * 100);
      const days = Math.max(0, Math.ceil(a - 0.25));
      const f = { kind: 'material', import_id: importId, n, target: TARGET.material, about: name + (key === 'supplier' ? ' (supplier)' : ' (material)'),
        measured: `${onTime}% on time · ${sign(a)} d on average · worst ${sign(Math.max(...gaps))} d`, gap: sign(a) + ' d',
        evidence: { on_time_pct: onTime, avg_gap_days: a, worst_gap_days: Math.max(...gaps), gaps, by: key }, status: n >= TARGET.material ? 'to validate' : 'not enough data' };
      if (key === 'supplier') { out.push({ ...f, existing: 'Not in the app (supplier dates live in SAP purchasing)', update: 'Added to Feedback for purchasing', proposal: { type: 'feedback' } }); continue; }
      const codes = productsFor(name, products);
      const now = codes.length ? Math.max(0, ...codes.map((c) => products.find((p) => p.product_code === c).material_delay_days || 0)) : null;
      const open = st.orders.filter((o) => codes.includes(o.product_code)).length;
      const late = events.filter((e) => e.type === 'material_late' && codes.includes((st.orders.find((o) => o.order_id === e.order_id) || {}).product_code)).length;
      if (!codes.length) { out.push({ ...f, existing: 'No product linked to this material', update: 'Added to Feedback', proposal: { type: 'feedback' } }); continue; }
      out.push({ ...f, existing: `Plan assumes ${now} d delay for ${codes.join(', ')} · ${open} open orders · ${late} material_late event(s) logged`,
        update: days === now ? 'Nothing to change: the delay used is confirmed' : `Products ${codes.join(', ')}: material delay ${now} → ${days} d. Customer promises include it.`,
        proposal: { type: 'material_delay', products: codes, days, material: name } });
    }
  }
  return out;
}

export function importCsv({ actor, csv, kind, file = '' }) {
  guard(actor, 'write', 'feedback');
  const rows = parseCsv(csv); if (!rows.length) throw err(400, 'The CSV is empty.');
  const k = kind || detectKind(rows); if (!TARGET[k]) throw err(400, 'Unknown CSV: export it from one of the three discovery apps.');
  const d = db(); const id = 'D' + String(d.imports.length + 1).padStart(3, '0');
  const f = k === 'changeover' ? changeoverFindings(rows, id) : k === 'night_swap' ? nightFindings(rows, id) : materialFindings(rows, id);
  // A new export of the same app replaces the findings not decided yet: the CSV of an app is cumulative.
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

function toFeedback(f, at) {
  const fb = store.read('feedback') || [];
  const item = { id: 'F' + String(fb.length + 1).padStart(3, '0'), at, by: 'discovery:' + f.kind, kind: 'discovery', about: f.about, text: `${f.about}: ${f.measured} (app today: ${f.existing})`, outcome: 'open' };
  fb.push(item); store.write('feedback', fb); return item.id;
}

export function decideFinding({ actor, id, decision, note = '' }) {
  guard(actor, 'write', 'rule:validated');
  const approvers = requiresHuman('rule_activation') || [];
  if (!approvers.includes(actor)) throw new PermissionError(actor + ' is not an approver of discovery findings');
  const d = db(); const f = d.findings.find((x) => x.id === id);
  if (!f || f.status !== 'to validate') throw err(409, 'Nothing to decide on ' + id);
  f.decided_by = actor; f.decided_at = new Date().toISOString(); f.note = note;
  if (decision === 'reject') { f.status = 'rejected'; store.write('discovery', d); audit(actor, 'discovery.rejected', { id }); return f; }
  const p = f.proposal || {}; f.applied = [];
  if (p.type === 'rule') {
    const rules = store.read('rules'); const rid = store.nextId('R', rules);
    rules.push({ id: rid, category: 'Measured on the floor', type: p.rule_type, statement: p.statement, params: p.params, source: 'Discovery ' + f.import_id + ' / ' + f.id + ' (changeover stopwatch)', owner: 'Corinne', status: 'active', validated_by: actor.replace('human:', ''), validated_on: f.decided_at.slice(0, 10) });
    compile(rules, store.read('products')); store.write('rules', rules); f.rule_id = rid; f.applied.push('rule ' + rid + ' active'); f.replan = true;
  }
  if (p.type === 'material_delay') {
    const products = store.read('products');
    for (const x of products) if (p.products.includes(x.product_code)) { x.material_delay_days = p.days; x.material_delay_source = 'Discovery ' + f.id + ' (' + p.material + ', ' + f.n + ' deliveries)'; }
    store.write('products', products); f.applied.push(`material delay ${p.days} d on ${p.products.join(', ')}`); f.replan = true;
  }
  if (p.type === 'ontology') {
    const changes = store.read('changes') || [];
    const c = { id: 'C' + String(changes.length + 1).padStart(3, '0'), at: f.decided_at, asked_by: actor, proposed_by: 'discovery', by: 'night swap reasons (' + f.n + ' swaps)', source: { kind: 'discovery', id: f.id },
      kind: p.kind, target: p.target, name: p.name, object: p.object, description: p.description, rationale: f.measured, evidence: f.existing, problems: [], status: 'proposed' };
    changes.push(c); store.write('changes', changes);
    try { decideChange({ actor, id: c.id, decision: 'apply' }); f.change_id = c.id; f.applied.push(`model: ${p.target}.${p.name}`); }
    catch (e) { f.applied.push('model change not applied: ' + e.message); }
  }
  if (p.type === 'feedback' || p.type === 'ontology') { f.feedback_id = toFeedback(f, f.decided_at); f.applied.push('feedback ' + f.feedback_id); }
  f.status = 'validated'; store.write('discovery', d);
  audit(actor, 'discovery.validated', { id, applied: f.applied });
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

// The plan was redrafted with the validated findings: the banner can go.
export function markReplanned({ actor }) {
  guard(actor, 'write', 'plan:published');
  const d = db(); let n = 0; for (const f of d.findings) if (f.replan && !f.replanned) { f.replanned = new Date().toISOString(); n++; }
  store.write('discovery', d); audit(actor, 'discovery.replanned', { findings: n }); return { findings: n };
}
