// Lyon Planner core: the application state and every operation on it. The same file runs in the browser (local demo)
// and in the Node server (shared team instance). Operations check the actor's permissions before they change anything.
(function (root) {
const isNode = typeof module !== 'undefined' && module.exports;
const ENG = isNode ? require('./engine.js') : root.LyonEngine;
const DATA = isNode ? require('./data.js') : root.LyonPlannerData;

const ACTORS = {
  corinne: { name: 'Corinne', role: 'Planner', grants: ['plan.run', 'plan.publish', 'plan.override', 'event.apply', 'event.whatif', 'rule.propose', 'rule.validate', 'rule.retire', 'feedback.write', 'eval.snapshot', 'scorecard.edit'] },
  sylvie: { name: 'Sylvie', role: 'Event desk', grants: ['event.apply', 'event.whatif', 'rule.propose', 'feedback.write', 'eval.snapshot', 'scorecard.edit'] },
  stephane: { name: 'Stéphane', role: 'Key accounts', grants: ['event.whatif', 'eval.snapshot', 'scorecard.edit'] },
  kevin: { name: 'Kevin', role: 'Night shift leader', grants: ['feedback.write', 'rule.propose', 'event.whatif'] },
  nadia: { name: 'Nadia', role: 'IT manager', grants: ['source.toggle', 'killswitch'] },
};
const SOURCES = [
  { id: 'sap', name: 'SAP ECC, SD and PP', what: 'Open orders, customers, products, promise dates', mode: 'read', refresh: 'every 15 min', owner: 'Group IT', connector: 'SAP reader, platform', enabled: true },
  { id: 'sap_wb', name: 'SAP process orders, write-back', what: 'The published plan: line, sequence, start, end', mode: 'write', refresh: 'at every publish', owner: 'Nadia', connector: 'Built with group IT', enabled: false, gated: true },
  { id: 'linelog', name: 'LineLog', what: 'What ran, stops, changeovers, comments', mode: 'read', refresh: 'CSV at 06:00', owner: 'Nadia', connector: 'File reader, platform', enabled: true },
  { id: 'lab', name: 'Lab database', what: 'Holds and releases, by batch', mode: 'read', refresh: 'nightly copy', owner: 'Amina', connector: 'Lab mapping, built for Lyon', enabled: true },
  { id: 'maintpro', name: 'MaintPro', what: 'Preventive windows, breakdowns', mode: 'read', refresh: 'every 15 min', owner: 'Patrick', connector: 'REST reader, platform', enabled: true },
  { id: 'mailbox', name: 'Planning mailbox', what: 'Customer changes, rush orders, cancellations', mode: 'read', refresh: 'live', owner: 'Stéphane', connector: 'Mailbox reader, platform', enabled: true },
  { id: 'hr', name: 'HR calendar and carriers', what: 'Holiday staffing, transport times', mode: 'read', refresh: 'monthly', owner: 'Didier, Stéphane', connector: 'File reader, platform', enabled: true },
];
const clone = (x) => JSON.parse(JSON.stringify(x));
const nowIso = () => new Date().toISOString();

function initial() {
  const s = { version: 1, mode: 'demo', scorecard: clone(DEFAULT_SCORECARD), killswitch: false, products: clone(DATA.products), lines: clone(DATA.lines), orders: clone(DATA.orders), rules: clone(DATA.rules), events: DATA.events.map((e) => ({ ...e, status: 'inbox' })), sources: clone(SOURCES), draft: null, published: null, feedback: [], evals: [], audit: [], horizon_start: '2026-05-11 06:00', clock: '2026-05-11 05:30' };
  const st = baseState(s); const R = compiled(s);
  const seqs = Object.fromEntries(Object.keys(s.lines).map((l) => [l, []]));
  for (const r of DATA.humanRows) seqs[r.line].push(r.order_id);
  const ev = ENG.evaluate(seqs, st, R);
  s.baseline = { kind: 'human', label: "Corinne's Friday plan", seqs, timed: ev.timed, kpis: ENG.kpis(ev, st, R), violations: ev.violations, moves: [] };
  addEval(s, s.baseline, 'system');
  return s;
}
const baseState = (s) => ({ horizon_start: s.horizon_start, lines: s.lines, orders: s.orders });
const downRules = (s) => s.events.filter((e) => e.status === 'applied' && e.type === 'machine_down').map((e) => ({ id: 'EV-' + e.event_id, type: 'blackout', params: { line: e.line, start: e.from, end: e.to }, status: 'active' }));
const compiled = (s, extra = []) => ENG.compile([...s.rules, ...downRules(s), ...extra], s.products);
function can(actor, g) { const a = ACTORS[actor]; return !!a && a.grants.includes(g); }
function need(s, actor, g) {
  if (s.killswitch && g !== 'killswitch') throw new Error('Kill switch engaged by Nadia: every change is refused.');
  if (!can(actor, g)) throw new Error((ACTORS[actor]?.name || actor) + ' may not ' + g.replace('.', ' '));
}
function log(s, actor, what, detail) { s.audit.unshift({ at: nowIso(), actor, what, detail }); s.audit = s.audit.slice(0, 300); s.version++; }

// The scorecard: each measure scores 0 at its worst acceptable value ("floor") and 100 at its target, linearly.
// A plan's score is the weighted average of the measures that apply to it. A plan that breaks a guardrail fails.
const DEFAULT_SCORECARD = {
  measures: [
    { id: 'codra', label: 'Codra on time', metric: 'codra_on_time_pct', unit: '%', floor: 80, target: 95, weight: 30, on: true, why: 'Codra decides in September: 95%, three months running' },
    { id: 'ontime', label: 'All orders on time', metric: 'on_time_pct', unit: '%', floor: 80, target: 95, weight: 20, on: true, why: 'Every customer, not only Codra' },
    { id: 'co', label: 'Changeover hours', metric: 'changeover_hours', unit: ' h', floor: 95, target: 55, weight: 20, on: true, why: 'Capacity and start-up scrap' },
    { id: 'late', label: 'Late orders', metric: 'late', unit: '', floor: 12, target: 2, weight: 10, on: true, why: 'Each one is a call to a customer' },
    { id: 'moves', label: 'Orders moved by a repair', metric: 'moves', unit: '', floor: 25, target: 5, weight: 10, on: true, repairOnly: true, why: 'Kevin: the plan at 22:00 has not changed twice' },
    { id: 'viol', label: 'Rule violations', metric: 'violations', unit: '', floor: 5, target: 0, weight: 10, on: true, why: 'Each one is a rule the floor will break or refuse' },
    { id: 'cos', label: 'Number of changeovers', metric: 'changeovers', unit: '', floor: 90, target: 50, weight: 0, on: false, why: 'Crew workload, every purge checked' },
  ],
  guards: [
    { id: 'hard', label: 'Forbidden transitions, capabilities and qualifications broken', metric: 'hard', unit: '', max: 0, on: true },
    { id: 'codra_min', label: 'Codra on time', metric: 'codra_on_time_pct', unit: '%', min: 85, on: true },
  ],
};
const HARD = ['forbidden_transition', 'line_capability', 'customer_line_qualification', 'changeover_table', 'changeover_override'];
function metricVal(e, m) {
  if (m === 'moves') return e.moves;
  if (m === 'hard') return e.hard != null ? e.hard : (e.checks && e.checks[0] && e.checks[0].pass === false ? 1 : 0);
  return e.kpis ? e.kpis[m] : undefined;
}
function scoreAgainst(e, sc) {
  sc = sc || DEFAULT_SCORECARD;
  const repair = e.kind === 'short' || e.kind === 'override';
  const rows = sc.measures.filter((m) => m.on).map((m) => {
    const v = metricVal(e, m.metric), f = +m.floor, t = +m.target, w = Math.max(0, +m.weight || 0);
    if ((m.repairOnly && !repair) || v == null || isNaN(v) || isNaN(f) || isNaN(t)) return { id: m.id, label: m.label, value: v, status: 'na', pts: null, w, max: 0, contrib: 0 };
    const q = t === f ? (v === t ? 1 : 0) : Math.max(0, Math.min(1, (v - f) / (t - f))), pts = Math.round(q * 100);
    return { id: m.id, label: m.label, value: v, pts, w, status: pts >= 100 ? 'met' : pts <= 0 ? 'miss' : 'partial' };
  });
  const app = rows.filter((r) => r.status !== 'na'), W = app.reduce((x, r) => x + r.w, 0);
  app.forEach((r) => { r.max = W ? r.w / W * 100 : 0; r.contrib = r.max * r.pts / 100; });
  const guards = (sc.guards || []).filter((g) => g.on).map((g) => { const v = metricVal(e, g.metric), hasMax = g.max != null && g.max !== '';
    return { id: g.id, label: g.label, value: v, pass: v == null || isNaN(v) ? true : hasMax ? v <= +g.max : v >= +g.min }; });
  return { score: W ? Math.round(app.reduce((x, r) => x + r.contrib, 0)) : 0, rows, guards, pass: guards.every((g) => g.pass) };
}
function addEval(s, p, actor, label) {
  const hard = (p.violations || []).filter((v) => HARD.includes((s.rules.find((r) => r.id === v.rule) || {}).type)).length;
  const e = { id: 'P' + String(s.evals.length + 1).padStart(3, '0'), at: nowIso(), label: label || p.label || p.kind, kind: p.kind, by: actor, kpis: { on_time_pct: p.kpis.on_time_pct, codra_on_time_pct: p.kpis.codra_on_time_pct, changeover_hours: p.kpis.changeover_hours, changeovers: p.kpis.changeovers, late: p.kpis.late.length, violations: (p.violations || []).length }, moves: (p.moves || []).filter((m) => m.kind !== 'time').length, hard };
  e.score = scoreAgainst(e, s.scorecard).score; s.evals.unshift(e);
}

const OPS = {
  runDaily(s, actor, { now }) {
    need(s, actor, 'plan.run');
    const R = compiled(s); let st = baseState(s), opts = {};
    if (s.published) { const rf = ENG.rollForward(s.published, st, now, R.freezeMinutes); st = rf.state; opts = { keep: rf.keep, fixed: rf.fixed }; s.orders = st.orders; s.lines = st.lines; s.horizon_start = st.horizon_start; }
    const res = ENG.longSolve(st, R, { timeBudgetMs: 2500, ...opts });
    s.draft = { kind: 'long', label: 'Daily plan, ' + now, created_at: now, by: actor, seqs: res.seqs, timed: res.timed, kpis: res.kpis, violations: res.violations, moves: [], runtime_ms: res.runtime_ms, before: s.published ? s.published.kpis : s.baseline.kpis };
    s.clock = now; addEval(s, s.draft, actor); log(s, actor, 'Daily plan drafted', res.runtime_ms + ' ms, ' + res.kpis.on_time_pct + '% on time');
  },
  publish(s, actor) {
    need(s, actor, 'plan.publish'); if (!s.draft) throw new Error('Nothing to publish');
    s.published = { ...s.draft, published_at: nowIso(), published_by: actor }; s.draft = null;
    const wb = s.sources.find((x) => x.id === 'sap_wb'); if (wb.enabled) { wb.last = nowIso(); wb.rows = Object.values(s.published.timed).flat().length; }
    log(s, actor, 'Plan published', s.published.label + (wb.enabled ? '; written to SAP' : '; SAP write-back off'));
  },
  discard(s, actor, { reason }) { need(s, actor, 'plan.publish'); s.draft = null; if (reason) s.feedback.unshift(fb(s, 'override', actor, { text: 'Draft discarded: ' + reason })); log(s, actor, 'Draft discarded', reason || ''); },
  applyEvent(s, actor, { id, at }) {
    need(s, actor, 'event.apply'); if (!s.published) throw new Error('Publish a plan first: repairs start from the published plan.');
    const e = s.events.find((x) => x.event_id === id); if (!e || e.status === 'applied') throw new Error('Event not available');
    const evt = { ...e, at: at || e.at };
    const a = ENG.applyEvent(baseState(s), evt); const R = compiled(s, a.rulesAdded);
    const res = ENG.fastRepair(s.published, a.state, R, { now: evt.at, changed: a.changed, removed: a.removed, linesAffected: a.linesAffected, horizonHours: 48, timeBudgetMs: 800 });
    s.orders = a.state.orders; e.status = 'applied'; e.applied_by = actor; e.applied_at = evt.at;
    s.draft = { kind: 'short', label: 'Repair after ' + id + ', ' + e.type.replace('_', ' '), created_at: evt.at, by: actor, event_id: id, seqs: res.seqs, timed: res.timed, kpis: res.kpis, violations: res.violations, moves: res.moves, runtime_ms: res.runtime_ms, before: s.published.kpis };
    s.clock = evt.at; addEval(s, s.draft, actor); log(s, actor, 'Event applied, repair drafted', id + ': ' + res.runtime_ms + ' ms, ' + res.moves.filter((m) => m.kind !== 'time').length + ' orders moved');
  },
  whatIf(s, actor, { id }) {
    need(s, actor, 'event.whatif'); if (!s.published) throw new Error('Publish a plan first');
    const e = s.events.find((x) => x.event_id === id); const a = ENG.applyEvent(baseState(s), e); const R = compiled(s, a.rulesAdded);
    const res = ENG.fastRepair(s.published, a.state, R, { now: e.at, changed: a.changed, removed: a.removed, linesAffected: a.linesAffected });
    const row = a.changed[0] ? Object.values(res.timed).flat().find((r) => r.order_id === a.changed[0]) : null;
    s.lastWhatIf = { id, at: nowIso(), by: actor, order: row ? { order_id: row.order_id, line: row.line, end: ENG.fmtTime(row.end), due: row.due } : null, moved: res.moves.filter((m) => m.kind !== 'time').length, on_time: res.kpis.on_time_pct, codra: res.kpis.codra_on_time_pct };
    log(s, actor, 'What-if', id);
  },
  override(s, actor, { order_id, line, position, reason }) {
    need(s, actor, 'plan.override'); if (!reason || reason.trim().length < 5) throw new Error('An override needs a reason: it is how the rules we miss are found.');
    const base = s.draft || s.published; if (!base) throw new Error('No plan');
    const seqs = clone(base.seqs); for (const l of Object.keys(seqs)) seqs[l] = seqs[l].filter((x) => x !== order_id);
    const pos = Math.max(0, Math.min(seqs[line].length, (+position || 1) - 1)); seqs[line].splice(pos, 0, order_id);
    const st = baseState(s), R = compiled(s), ev = ENG.evaluate(seqs, st, R);
    s.draft = { kind: 'override', label: 'Override of ' + order_id + ' to ' + line, created_at: s.clock, by: actor, seqs, timed: ev.timed, kpis: ENG.kpis(ev, st, R), violations: ev.violations, moves: [{ order_id, kind: 'override', to: { line, position: pos + 1 } }], before: base.kpis };
    s.feedback.unshift(fb(s, 'override', actor, { order_id, text: reason, detail: 'Moved to ' + line + ', position ' + (pos + 1) }));
    addEval(s, s.draft, actor); log(s, actor, 'Override', order_id + ' to ' + line + ': ' + reason);
  },
  deviation(s, actor, { order_id, what, why, cls, told_by }) {
    need(s, actor, 'feedback.write'); if (!what) throw new Error('Say what happened');
    s.feedback.unshift(fb(s, 'deviation', actor, { order_id, text: what, whys: why ? [why] : [], cls: cls || 'rule missing', told_by })); log(s, actor, 'Deviation recorded', order_id + ': ' + what);
  },
  feedbackSave(s, actor, { id, whys, root, outcome, rule }) {
    need(s, actor, 'feedback.write'); const f = s.feedback.find((x) => x.id === id); if (!f) throw new Error('No item ' + id);
    f.whys = whys || f.whys; f.root = root ?? f.root;
    if (outcome) {
      if ((f.whys || []).filter(Boolean).length === 0) throw new Error('Ask at least one why before you decide.');
      f.outcome = outcome; f.status = 'closed';
      if (outcome === 'rule') { need(s, actor, 'rule.propose'); const r = newRule(s, actor, rule, f); f.rule_id = r.id; f.status = 'rule ' + r.id; }
    }
    log(s, actor, 'Feedback ' + (outcome ? 'closed as ' + outcome : 'updated'), id);
  },
  ruleAdd(s, actor, { rule }) { need(s, actor, 'rule.propose'); newRule(s, actor, rule); },
  ruleStatus(s, actor, { id, status }) {
    need(s, actor, status === 'active' ? 'rule.validate' : 'rule.retire');
    const r = s.rules.find((x) => x.id === id); if (!r) throw new Error('No rule ' + id);
    const prev = r.status; r.status = status;
    try { compiled(s); } catch (e) { r.status = prev; throw new Error('The rule does not compile: ' + e.message); }
    if (status === 'active') { r.validated_by = ACTORS[actor].name; r.validated_on = new Date().toISOString().slice(0, 10); }
    if (status === 'retired') r.retired_on = new Date().toISOString().slice(0, 10);
    log(s, actor, 'Rule ' + status, id);
  },
  sourceToggle(s, actor, { id }) { need(s, actor, 'source.toggle'); const x = s.sources.find((y) => y.id === id); x.enabled = !x.enabled; log(s, actor, (x.enabled ? 'Enabled ' : 'Disabled ') + x.name, ''); },
  killswitch(s, actor) { need(s, actor, 'killswitch'); s.killswitch = !s.killswitch; log(s, actor, s.killswitch ? 'Kill switch engaged' : 'Kill switch released', ''); },
  scorecardSet(s, actor, { scorecard }) {
    need(s, actor, 'scorecard.edit'); const sc = clone(scorecard);
    for (const m of sc.measures) { for (const k of ['floor', 'target', 'weight']) { if (m[k] === '' || isNaN(+m[k])) throw new Error(m.label + ': ' + (k === 'floor' ? 'worst value' : k) + ' must be a number'); m[k] = +m[k]; } if (m.floor === m.target) throw new Error(m.label + ': the worst value and the target must differ'); }
    for (const g of sc.guards) { const k = g.max != null && g.max !== '' ? 'max' : 'min'; if (g[k] === '' || isNaN(+g[k])) throw new Error(g.label + ': the limit must be a number'); g[k] = +g[k]; }
    if (!sc.measures.some((m) => m.on && m.weight > 0)) throw new Error('At least one measure needs a weight above zero');
    s.scorecard = sc; s.scorecardMeta = { by: ACTORS[actor].name, at: nowIso() };
    for (const e of s.evals) e.score = scoreAgainst(e, sc).score;
    log(s, actor, 'Scorecard saved', sc.measures.filter((m) => m.on).map((m) => m.label + ' ' + m.weight).join(', '));
  },
  snapshot(s, actor) { need(s, actor, 'eval.snapshot'); const p = s.draft || s.published; if (!p) throw new Error('No plan'); addEval(s, p, actor, (s.draft ? 'Draft: ' : 'Published: ') + p.label); log(s, actor, 'Plan scored', ''); },
};
function fb(s, kind, actor, x) { return { id: (kind === 'override' ? 'OV' : 'DV') + String(s.feedback.filter((f) => f.kind === kind).length + 1).padStart(3, '0'), kind, at: nowIso(), by: actor, status: 'open', whys: [], root: '', ...x }; }
function newRule(s, actor, rule, f) {
  if (!rule || !rule.type || !rule.statement || !rule.owner) throw new Error('A rule needs a type, a statement and an owner.');
  let params = rule.params; if (typeof params === 'string') { try { params = JSON.parse(params); } catch (e) { throw new Error('Parameters are not valid JSON'); } }
  const n = Math.max(...s.rules.map((r) => parseInt(r.id.slice(1), 10) || 0)) + 1;
  const r = { id: 'R' + n, category: rule.category || 'Captured', type: rule.type, statement: rule.statement, params, source: rule.source || (ACTORS[actor].name + ', ' + new Date().toISOString().slice(0, 10)), owner: rule.owner, status: 'proposed', proposed_by: ACTORS[actor].name, discovery: f ? { from: f.id, whys: f.whys, root: f.root } : null };
  s.rules.push(r); log(s, actor, 'Rule proposed', r.id + ': ' + r.statement); return r;
}
function apply(state, op, actor, args) {
  if (!OPS[op]) throw new Error('Unknown operation ' + op);
  const s = clone(state); OPS[op](s, actor, args || {}); return s;
}
const api = { initial, apply, scoreAgainst, DEFAULT_SCORECARD, ACTORS, can, ENG, DATA };
if (isNode) module.exports = api; else root.LyonCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
