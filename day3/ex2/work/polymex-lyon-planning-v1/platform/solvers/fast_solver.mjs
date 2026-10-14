// Polymex platform tool: FAST SOLVER. Repairs a published plan after one event, in seconds.
// Keeps everything that starts before now + freeze, touches as few orders as possible, looks only `horizonHours` ahead for improvements.
// Input:  plan { seqs, timed }, state (orders and lines AFTER the event was applied), compiled rules R,
//         { now, changed: [order_id], removed: [order_id], linesAffected: [line], horizonHours = 48, freezeMinutes = R.freezeMinutes, timeBudgetMs = 800 }
// Output: { seqs, timed, kpis, violations, moves: [{ order_id, from, to }], frozen: [order_id], runtime_ms }
import { parseTime, fmtTime } from '../rules/engine.mjs';
import { evaluate, kpis } from './plan.mjs';

// Stability matters to the floor: every move costs, more so close to now.
export const MOVE_PENALTY = { line: 120, position: 40 };

export function fastRepair(plan, state, R, a) {
  const t0 = Date.now(), now = parseTime(a.now), freeze = (a.freezeMinutes ?? R.freezeMinutes) * 60e3, horizon = (a.horizonHours ?? 48) * 3600e3, budget = a.timeBudgetMs ?? 800;
  const ordersById = Object.fromEntries(state.orders.map((o) => [o.order_id, o]));
  const lines = Object.keys(state.lines);
  const where = {}; for (const [l, ids] of Object.entries(plan.seqs)) ids.forEach((id, i) => (where[id] = { line: l, seq: i }));
  const startOf = {}; for (const rows of Object.values(plan.timed)) for (const r of rows) startOf[r.order_id] = r;

  // A changed order already inside the freeze stays in place (its times are recomputed); other changed orders are re-inserted.
  const inFreeze = (id) => startOf[id] && startOf[id].start < now + freeze;
  const changed = (a.changed || []).filter((id) => !inFreeze(id));
  const removed = new Set([...(a.removed || []), ...changed]);
  const seqs = Object.fromEntries(lines.map((l) => [l, (plan.seqs[l] || []).filter((id) => !removed.has(id) && ordersById[id])]));
  // Frozen prefix: every order that starts before now + freeze keeps its line and position; unchanged ones keep their times.
  const fixed = {}, frozenCount = {}, frozen = [];
  for (const l of lines) {
    let k = 0, recompute = (a.linesAffected || []).includes(l);
    for (const id of seqs[l]) { const r = startOf[id]; if (!r || r.start >= now + freeze) break; if ((a.changed || []).includes(id)) recompute = true; if (!recompute) fixed[id] = { co_start: r.co_start, start: r.start, end: r.end }; frozen.push(id); k++; }
    frozenCount[l] = k;
  }
  const cache = {};
  const movePenalty = (s) => { let p = 0; for (const [l, ids] of Object.entries(s)) ids.forEach((id, i) => { const w = where[id]; if (!w) return; if (w.line !== l) p += MOVE_PENALTY.line; else if (w.seq !== i) p += MOVE_PENALTY.position; }); return p; };
  const ev = (s) => evaluate(s, state, R, { ordersById, cache, fixed }).cost + movePenalty(s);
  const allowed = (o) => lines.filter((l) => R.canRun(o, l).ok);

  // 1. Re-insert changed and new orders at the cheapest position after the frozen prefix.
  for (const id of changed.filter((x) => ordersById[x])) {
    const o = ordersById[id]; let best = null;
    for (const l of allowed(o)) for (let p = frozenCount[l]; p <= seqs[l].length; p++) {
      const s = { ...seqs, [l]: [...seqs[l].slice(0, p), id, ...seqs[l].slice(p)] }; const c = ev(s);
      if (!best || c < best.c) best = { c, l, p };
    }
    if (best) seqs[best.l] = [...seqs[best.l].slice(0, best.p), id, ...seqs[best.l].slice(best.p)];
  }

  // 2. Local improvement inside the horizon, on the affected lines first.
  const focus = new Set([...(a.linesAffected || []), ...lines.filter((l) => seqs[l].some((id) => (a.changed || []).includes(id)))]);
  const inHorizon = (id) => { const r = startOf[id]; return !r || r.start < now + horizon; };
  let cur = ev(seqs), improved = true;
  while (improved && Date.now() - t0 < budget) {
    improved = false;
    for (const l of [...focus]) for (let i = frozenCount[l]; i < seqs[l].length && !improved && Date.now() - t0 < budget; i++) {
      const id = seqs[l][i]; if (!inHorizon(id)) continue;
      const without = seqs[l].filter((_, k) => k !== i);
      for (const m of allowed(ordersById[id])) {
        const base = m === l ? without : seqs[m];
        for (let p = frozenCount[m]; p <= base.length; p++) {
          if (m === l && p === i) continue;
          const s = { ...seqs, [l]: without, [m]: [...base.slice(0, p), id, ...base.slice(p)] };
          if (m === l) s[l] = [...without.slice(0, p), id, ...without.slice(p)];
          const c = ev(s); if (c < cur - 1e-6) { Object.assign(seqs, s); cur = c; improved = true; break; }
        }
        if (improved) break;
      }
    }
  }
  const e = evaluate(seqs, state, R, { ordersById, fixed });
  const after = {}; for (const rows of Object.values(e.timed)) for (const r of rows) after[r.order_id] = r;
  const moves = [];
  for (const [id, r] of Object.entries(after)) {
    const b = startOf[id];
    if (!b) { moves.push({ order_id: id, kind: 'new', from: null, to: { line: r.line, start: fmtTime(r.start) } }); continue; }
    const w = where[id], nw = { line: r.line, seq: e.timed[r.line].indexOf(r) };
    const kind = w.line !== nw.line ? 'line' : w.seq !== nw.seq ? 'sequence' : 'time';
    if (kind !== 'time' || Math.abs(b.start - r.start) > 30 * 60e3) moves.push({ order_id: id, kind, from: { line: b.line, start: fmtTime(b.start) }, to: { line: r.line, start: fmtTime(r.start) } });
  }
  for (const id of Object.keys(startOf)) if (!after[id]) moves.push({ order_id: id, kind: 'removed', from: { line: startOf[id].line, start: fmtTime(startOf[id].start) }, to: null });
  return { seqs, timed: e.timed, kpis: kpis(e, state, R), violations: e.violations, moves, frozen, runtime_ms: Date.now() - t0 };
}

// Apply a structured event to the state. Returns { state, changed, removed, linesAffected, rulesAdded }.
export function applyEvent(state, evt) {
  const s = { ...state, orders: state.orders.map((o) => ({ ...o })), lines: JSON.parse(JSON.stringify(state.lines)) };
  const find = (id) => { const o = s.orders.find((x) => x.order_id === id); if (!o) throw new Error('Unknown order ' + id); return o; };
  const r = { state: s, changed: [], removed: [], linesAffected: [], rulesAdded: [] };
  switch (evt.type) {
    case 'quantity_change': find(evt.order_id).tonnes = evt.tonnes; r.changed.push(evt.order_id); break;
    case 'date_change': find(evt.order_id).due = evt.due; r.changed.push(evt.order_id); break;
    case 'rush_order': s.orders.push({ order_id: evt.order_id, customer: evt.customer, product_code: evt.product_code, tonnes: evt.tonnes, due: evt.due, available_from: evt.available_from || '' }); r.changed.push(evt.order_id); break;
    case 'cancellation': s.orders = s.orders.filter((o) => o.order_id !== evt.order_id); r.removed.push(evt.order_id); break;
    case 'material_late': find(evt.order_id).available_from = evt.available_from; r.changed.push(evt.order_id); break;
    case 'quality_hold': { const o = find(evt.order_id); const id = evt.order_id + 'R'; s.orders.push({ ...o, order_id: id, due: evt.due || o.due }); r.changed.push(id); break; }
    case 'machine_down': r.rulesAdded.push({ id: 'EV-' + (evt.event_id || Date.now()), type: 'blackout', statement: evt.line + ' down ' + evt.from + ' to ' + evt.to, params: { line: evt.line, start: evt.from, end: evt.to }, source: evt.source || 'event', owner: 'Patrick', status: 'active' }); r.linesAffected.push(evt.line); break;
    default: throw new Error('Unknown event type ' + evt.type);
  }
  return r;
}
