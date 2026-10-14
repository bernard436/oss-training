// Plant planning mini-app: a local server, no dependencies. `npm start`, then http://localhost:3000
// The UI sends the acting person in the x-actor header; the harness decides what that person may do.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as O from '../architecture/orchestrator.mjs';
import * as store from '../platform/store.mjs';
import { guard, audit, readAudit, permissions } from '../platform/harness/harness.mjs';
import { compile } from '../platform/rules/engine.mjs';
import { evaluate, kpis, toRows } from '../platform/solvers/plan.mjs';
import { readHumanPlan, readInbox, readOrders, readLines } from '../platform/connectors/connectors.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 3000);
const RULE_TYPES = JSON.parse(fs.readFileSync(path.join(HERE, '../platform/rule_types.json'), 'utf8'));

function body(req) { return new Promise((ok, ko) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { ko(e); } }); }); }
function send(res, code, v) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); }

// Corinne's Friday plan for week 20, evaluated under today's rules: the human baseline on the same orders.
function humanBaseline() {
  const st = { horizon_start: '2026-05-11 06:00', lines: readLines(), orders: readOrders() }; const seqs = Object.fromEntries(Object.keys(st.lines).map((l) => [l, []]));
  for (const r of readHumanPlan()) seqs[r.line].push(r.order_id);
  const R = compile(store.read('rules').filter((r) => !String(r.id).startsWith('EV-')), store.read('products'));
  return kpis(evaluate(seqs, st, R), st, R);
}

const routes = {
  'GET /api/state': () => ({ state: store.read('state'), products: store.read('products'), published: store.read('published'), draft: store.read('draft'), actors: Object.keys(permissions().actors).filter((a) => a.startsWith('human:')) }),
  'GET /api/rule-types': () => RULE_TYPES,
  'POST /api/plan/daily': (b, actor) => O.dailyRun({ now: b.now || '2026-05-11 05:30', actor: actor === 'human:corinne' ? 'service:long-solver' : actor }),
  'POST /api/plan/publish': (b, actor) => O.publish({ actor, note: b.note }),
  'POST /api/plan/discard': (b, actor) => { guard(actor, 'write', 'plan:published'); store.write('draft', null); audit(actor, 'plan.draft.discarded', { reason: b.reason || '' }); return { ok: true }; },
  'POST /api/plan/override': (b, actor) => {
    guard(actor, 'write', 'plan:published');
    if (!b.reason || b.reason.trim().length < 5) throw Object.assign(new Error('An override needs a reason: it is how we find the rules we are missing.'), { status: 400 });
    const d = store.read('draft') || store.read('published'); const seqs = JSON.parse(JSON.stringify(d.seqs));
    for (const l of Object.keys(seqs)) seqs[l] = seqs[l].filter((id) => id !== b.order_id);
    const pos = Math.max(0, Math.min(seqs[b.line].length, (+b.position || 1) - 1)); seqs[b.line].splice(pos, 0, b.order_id);
    const st = store.read('state'); const R = compile(store.read('rules'), store.read('products')); const e = evaluate(seqs, st, R);
    const draft = { ...d, kind: 'override', seqs, timed: e.timed, kpis: kpis(e, st, R), violations: e.violations, before: d.kpis, moves: [{ order_id: b.order_id, kind: 'override', to: { line: b.line, position: pos + 1 } }] };
    store.write('draft', draft);
    const ov = store.read('overrides'); const o = { id: 'OV' + String(ov.length + 1).padStart(3, '0'), at: new Date().toISOString(), by: actor, order_id: b.order_id, line: b.line, position: pos + 1, reason: b.reason, cost_delta: Math.round(draft.kpis.cost - d.kpis.cost), status: 'open' };
    ov.push(o); store.write('overrides', ov); audit(actor, 'plan.override', o);
    return { draft, override: o };
  },
  'GET /api/plan/explain': (b, actor) => O.explain({}),
  'GET /api/plan/rows': () => { const p = store.read('draft') || store.read('published'); return p ? toRows(p) : []; },
  'GET /api/events': () => store.read('events'),
  'GET /api/inbox': () => readInbox('2026-05-11'),
  'POST /api/events/read': (b) => O.readEvent({ text: b.text, source: b.source }),
  'POST /api/events/manual': (b, actor) => { guard(actor, 'write', 'event:proposed'); const ev = store.read('events'); const e = { ...b.event, event_id: store.nextId('E', ev), status: 'proposed', proposed_by: actor, raw: b.raw || '' }; ev.push(e); store.write('events', ev); audit(actor, 'event.proposed', { event_id: e.event_id, type: e.type }); return e; },
  'POST /api/events/confirm': (b, actor) => O.onEvent({ event: b.event, actor }),
  'POST /api/events/reject': (b, actor) => { guard(actor, 'write', 'event:confirmed'); const ev = store.read('events'); const e = ev.find((x) => x.event_id === b.event_id); e.status = 'rejected'; e.rejected_reason = b.reason; store.write('events', ev); audit(actor, 'event.rejected', { event_id: b.event_id, reason: b.reason }); return e; },
  'POST /api/whatif': (b, actor) => O.whatIf({ event: b.event, actor }),
  'GET /api/rules': () => store.read('rules'),
  'POST /api/rules': (b, actor) => {
    guard(actor, 'write', 'rule:proposed');
    const rules = store.read('rules'); const r = { id: store.nextId('R', rules), category: b.category || 'Captured', type: b.type, statement: b.statement, params: b.params, source: b.source, owner: b.owner, status: 'proposed', proposed_by: actor, proposed_on: new Date().toISOString().slice(0, 10), discovery: b.discovery || null, links: b.links || [] };
    if (!RULE_TYPES[r.type]) throw Object.assign(new Error('Unknown rule type ' + r.type), { status: 400 });
    rules.push(r); store.write('rules', rules); audit(actor, 'rule.proposed', { id: r.id, type: r.type });
    if (b.links?.length) { const ov = store.read('overrides'); ov.forEach((o) => { if (b.links.includes(o.id)) { o.status = 'rule ' + r.id; } }); store.write('overrides', ov); const ex = store.read('execution'); ex.forEach((x) => { if (b.links.includes(x.id)) x.status = 'rule ' + r.id; }); store.write('execution', ex); }
    return r;
  },
  'POST /api/rules/status': (b, actor) => {
    guard(actor, 'write', b.status === 'active' ? 'rule:validated' : 'rule:proposed');
    const rules = store.read('rules'); const r = rules.find((x) => x.id === b.id); if (!r) throw Object.assign(new Error('No rule ' + b.id), { status: 404 });
    if (b.params) r.params = b.params;
    r.status = b.status; if (b.status === 'active') { r.validated_by = actor.replace('human:', ''); r.validated_on = new Date().toISOString().slice(0, 10); }
    if (b.status === 'active') compile(rules, store.read('products'));
    store.write('rules', rules); audit(actor, 'rule.' + b.status, { id: r.id }); return r;
  },
  'GET /api/execution': () => store.read('execution'),
  'POST /api/execution': (b, actor) => { guard(actor, 'write', 'execution'); const ex = store.read('execution'); const x = { id: 'X' + String(ex.length + 1).padStart(3, '0'), at: new Date().toISOString(), by: actor, ...b, status: 'open' }; ex.push(x); store.write('execution', ex); audit(actor, 'execution.recorded', { id: x.id, order_id: x.order_id, classification: x.classification }); return x; },
  'GET /api/overrides': () => store.read('overrides'),
  'GET /api/scorecard': () => {
    const p = store.read('published'), ev = store.read('events'), rules = store.read('rules'), ov = store.read('overrides'), ex = store.read('execution');
    const applied = ev.filter((e) => e.status === 'applied');
    return { human_plan_w20: humanBaseline(), published: p?.kpis || null, events: { total: ev.length, applied: applied.length, proposed: ev.filter((e) => e.status === 'proposed').length }, rules: { active: rules.filter((r) => r.status === 'active').length, proposed: rules.filter((r) => r.status === 'proposed').length, retired: rules.filter((r) => r.status === 'retired').length }, overrides: { total: ov.length, with_rule: ov.filter((o) => String(o.status).startsWith('rule')).length }, deviations: { total: ex.length, open: ex.filter((x) => x.status === 'open').length } };
  },
  'GET /api/audit': () => readAudit(300),
  'POST /api/reset': (b, actor) => { guard(actor, 'write', 'plan:published'); store.reset(); audit(actor, 'reset', {}); return { ok: true }; },
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const key = req.method + ' ' + url.pathname; const actor = req.headers['x-actor'] || 'human:corinne';
  if (routes[key]) {
    try { const b = req.method === 'POST' ? await body(req) : Object.fromEntries(url.searchParams); send(res, 200, await routes[key](b, actor)); }
    catch (e) { send(res, e.status || 500, { error: e.message }); }
    return;
  }
  const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const p = path.join(HERE, 'public', path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (fs.existsSync(p) && fs.statSync(p).isFile()) { res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'text/plain' }); fs.createReadStream(p).pipe(res); }
  else { res.writeHead(404); res.end('Not found'); }
}).listen(PORT, () => console.log('Plant planning app on http://localhost:' + PORT));
