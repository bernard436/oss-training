// Polymex platform: plan evaluation shared by both solvers.
import { timeLine, lineCost, gapViolations, COST, parseTime, fmtTime } from '../rules/engine.mjs';

// state: { horizon_start, lines: { M01: { initial_product, available_at } }, orders: [...] }
// seqs: { M01: [order_id, ...], ... }
export function evaluate(seqs, state, R, opt = {}) {
  const orders = opt.ordersById || Object.fromEntries(state.orders.map((o) => [o.order_id, o]));
  const timed = {}, per = {}; let cost = 0, coMin = 0, late = 0; const violations = [];
  for (const line of Object.keys(state.lines)) {
    const L = state.lines[line];
    const rows = (opt.cache && opt.cache[line] && opt.cache[line].key === seqs[line].join(',')) ? opt.cache[line].rows : timeLine(line, (seqs[line] || []).map((id) => orders[id]), R, { start: Math.max(parseTime(state.horizon_start), parseTime(L.available_at || state.horizon_start)), initialProduct: L.initial_product, fixed: opt.fixed });
    const c = (opt.cache && opt.cache[line] && opt.cache[line].key === seqs[line].join(',')) ? opt.cache[line].c : lineCost(line, rows, orders, R);
    if (opt.cache) opt.cache[line] = { key: seqs[line].join(','), rows, c };
    timed[line] = rows; per[line] = c; cost += c.cost; coMin += c.coMin; late += c.late; violations.push(...c.violations);
  }
  const gv = gapViolations(timed, R); cost += gv.length * COST.gap; violations.push(...gv);
  return { timed, cost, coMin, late, violations };
}

export function kpis(ev, state, R) {
  const orders = Object.fromEntries(state.orders.map((o) => [o.order_id, o]));
  let n = 0, onTime = 0, codraN = 0, codraOn = 0, changeovers = 0, tonnes = 0; const lateList = [];
  for (const rows of Object.values(ev.timed)) for (const r of rows) {
    const o = orders[r.order_id]; n++; tonnes += o.tonnes; if (r.co_minutes > 0) changeovers++;
    const lag = R.releaseLagMinutes(o).minutes * 60e3; const ok = r.end + lag <= parseTime(o.due);
    if (ok) onTime++; else lateList.push({ order_id: o.order_id, customer: o.customer, hours_late: +((r.end + lag - parseTime(o.due)) / 3600e3).toFixed(1) });
    if (o.customer === 'Codra Retail') { codraN++; if (ok) codraOn++; }
  }
  return { orders: n, tonnes: Math.round(tonnes), on_time_pct: n ? +(100 * onTime / n).toFixed(1) : 0, codra_on_time_pct: codraN ? +(100 * codraOn / codraN).toFixed(1) : null, changeovers, changeover_hours: +(ev.coMin / 60).toFixed(1), weighted_late_hours: +ev.late.toFixed(1), violations: ev.violations.length, cost: Math.round(ev.cost), late: lateList.sort((a, b) => b.hours_late - a.hours_late) };
}

export function toRows(ev) {
  const out = [];
  for (const [line, rows] of Object.entries(ev.timed)) rows.forEach((r, i) => out.push({ line, seq: i + 1, order_id: r.order_id, customer: r.customer, product_code: r.product_code, tonnes: r.tonnes, changeover_start: fmtTime(r.co_start), changeover_minutes: r.co_minutes, changeover_rule: r.co_rule || '', start: fmtTime(r.start), end: fmtTime(r.end), due: r.due, notes: r.notes.filter(Boolean).join(' ') }));
  return out;
}

// Roll a plan forward to `now`: orders that ended are done and leave the state; orders running or starting inside the freeze are kept, at their times.
export function rollForward(plan, state, now, freezeMinutes = 240) {
  const t = parseTime(now), f = t + freezeMinutes * 60e3;
  const done = new Set(), keep = {}, fixed = {}; const lines = JSON.parse(JSON.stringify(state.lines));
  for (const [line, rows] of Object.entries(plan.timed)) {
    keep[line] = [];
    for (const r of rows) {
      if (r.end <= t) { done.add(r.order_id); lines[line] = { initial_product: r.product_code, available_at: fmtTime(r.end) }; continue; }
      if (r.start < f) { keep[line].push(r.order_id); fixed[r.order_id] = { co_start: r.co_start, start: r.start, end: r.end }; continue; }
      break;
    }
    if (!lines[line].available_at || parseTime(lines[line].available_at) < t) lines[line].available_at = fmtTime(t);
  }
  return { state: { ...state, horizon_start: fmtTime(t), lines, orders: state.orders.filter((o) => !done.has(o.order_id)) }, keep, fixed, done: [...done] };
}
