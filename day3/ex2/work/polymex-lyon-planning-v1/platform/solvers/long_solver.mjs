// Polymex platform tool: LONG SOLVER. Sequences every open order on every line over the horizon.
// Run once a day. Deterministic. Objective: weighted lateness (priority rule), then changeover minutes, under the active rules.
// Input:  state { horizon_start, lines, orders }, compiled rules R, options { timeBudgetMs, keep: { line: [order_id] }, fixed: { order_id: { co_start, start, end } } }
//         keep and fixed come from rollForward(): orders already running or inside the freeze stay first on their line, at their times.
// Output: { seqs, timed, kpis, violations, runtime_ms, iterations }
import { FAMILY_RANK, parseTime } from '../rules/engine.mjs';
import { evaluate, kpis } from './plan.mjs';

export function longSolve(state, R, options = {}) {
  const t0 = Date.now(), budget = options.timeBudgetMs ?? 3000;
  const lines = Object.keys(state.lines);
  const ordersById = Object.fromEntries(state.orders.map((o) => [o.order_id, o]));
  const keep = options.keep || {}, fixed = options.fixed || {}, kept = new Set(Object.values(keep).flat());
  const seqs = Object.fromEntries(lines.map((l) => [l, [...(keep[l] || [])]]));
  const k0 = (l) => (keep[l] || []).length;
  const cache = {};
  const ev = (s) => evaluate(s, state, R, { ordersById, cache, fixed }).cost;
  const allowed = (o) => lines.filter((l) => R.canRun(o, l).ok);

  // 1. Construction: earliest due first, light to dark, cheapest insertion.
  const order = state.orders.filter((o) => !kept.has(o.order_id)).sort((a, b) => parseTime(a.due) - parseTime(b.due) || FAMILY_RANK[R.fam(a.product_code)] - FAMILY_RANK[R.fam(b.product_code)] || a.order_id.localeCompare(b.order_id));
  for (const o of order) {
    let best = null;
    for (const l of allowed(o)) for (let p = k0(l); p <= seqs[l].length; p++) {
      const s = { ...seqs, [l]: [...seqs[l].slice(0, p), o.order_id, ...seqs[l].slice(p)] };
      const c = ev(s); if (!best || c < best.c) best = { c, l, p };
    }
    if (!best) throw new Error('No line can run ' + o.order_id);
    seqs[best.l] = [...seqs[best.l].slice(0, best.p), o.order_id, ...seqs[best.l].slice(best.p)];
  }

  // 2. Improvement: relocate and swap, first improvement, until no gain or the time budget is spent.
  let cur = ev(seqs), it = 0, improved = true;
  while (improved && Date.now() - t0 < budget) {
    improved = false;
    for (const l of lines) for (let i = k0(l); i < seqs[l].length && Date.now() - t0 < budget; i++) {
      const id = seqs[l][i], o = ordersById[id];
      const without = seqs[l].filter((_, k) => k !== i);
      for (const m of allowed(o)) {
        const base = m === l ? without : seqs[m];
        for (let p = k0(m); p <= base.length; p++) {
          if (m === l && p === i) continue;
          const s = { ...seqs, [l]: without, [m]: [...base.slice(0, p), id, ...base.slice(p)] };
          if (m === l) s[l] = [...without.slice(0, p), id, ...without.slice(p)];
          const c = ev(s); it++;
          if (c < cur - 1e-6) { Object.assign(seqs, s); cur = c; improved = true; break; }
        }
        if (improved) break;
      }
      if (improved) break;
    }
    if (!improved) for (const l of lines) for (let i = k0(l); i + 1 < seqs[l].length && !improved; i++) {
      const s = { ...seqs, [l]: [...seqs[l]] }; [s[l][i], s[l][i + 1]] = [s[l][i + 1], s[l][i]];
      const c = ev(s); it++; if (c < cur - 1e-6) { Object.assign(seqs, s); cur = c; improved = true; }
    }
  }
  const e = evaluate(seqs, state, R, { ordersById, fixed });
  return { seqs, timed: e.timed, kpis: kpis(e, state, R), violations: e.violations, runtime_ms: Date.now() - t0, iterations: it };
}
