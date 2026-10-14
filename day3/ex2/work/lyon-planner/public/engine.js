// Lyon Planner engine: rules engine, long solver, fast solver, plan evaluation. Same code as the FDE platform (v2.3). Works in the browser and in Node.
(function (root) {
// Polymex platform: rules engine (expert system). Deterministic. Every rule has an id, a type, params, a source, an owner and a status.
// Only rules with status "active" are applied. Types are listed in platform/TOOLS.md.

const BASE_RATE_T_PER_H = 2.02; // 2.30 t/h ideal x 0.88 performance
const FAMILY_RANK = { PPN: 0, PPW: 1, PPC: 2, PPK: 3, PPG: 4, PA6: 5 };
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;

const parseTime = (s) => typeof s === 'number' ? s : Date.parse(String(s).replace(' ', 'T') + (String(s).length <= 16 ? ':00Z' : 'Z'));
const fmtTime = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const weekday = (t) => new Date(t).getUTCDay(); // 0 Sunday ... 6 Saturday
const minutesOfDay = (t) => new Date(t).getUTCHours() * 60 + new Date(t).getUTCMinutes();
const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
function shiftOf(t) { const h = new Date(t).getUTCHours(); const s = h >= 6 && h < 14 ? 'A' : h >= 14 && h < 22 ? 'B' : 'C'; const day = fmtTime(t - (h < 6 ? DAY : 0)).slice(0, 10); return day + ' ' + s; }

// Occurrences of a weekly window [from, to) on given weekdays, as absolute intervals overlapping [a, b].
function weeklyIntervals(rule, a, b) {
  const out = []; const days = rule.weekdays ?? (rule.weekday != null ? [rule.weekday] : [0, 1, 2, 3, 4, 5, 6]);
  const f = hm(rule.from ?? '00:00'), to = hm(rule.to ?? '24:00');
  const d0 = Math.floor(a / DAY) * DAY - DAY;
  for (let d = d0; d <= b + DAY; d += DAY) {
    if (!days.includes(weekday(d))) continue;
    const s = d + f * MIN, e = to > f ? d + to * MIN : d + DAY + to * MIN;
    if (e > a && s < b) out.push([s, e]);
  }
  return out;
}

function compile(rules, products) {
  const P = Object.fromEntries(products.map((p) => [p.product_code, p]));
  const active = rules.filter((r) => r.status === 'active');
  const of = (type) => active.filter((r) => r.type === type);
  const table = of('changeover_table')[0];
  if (!table) throw new Error('No active changeover_table rule');
  const overrides = of('changeover_override'), forbidden = of('forbidden_transition'), caps = of('line_capability'), quals = of('customer_line_qualification');
  const gaps = of('shared_resource_gap'), maxCoRules = of('max_changeovers_per_shift'), windows = of('transition_window'), blackouts = of('blackout');
  const rates = of('rate_factor'), lags = of('release_lag'), prefs = of('line_preference');
  const prio = of('priority')[0], freeze = of('freeze_window')[0];
  const fam = (code) => { const p = P[code]; if (!p) throw new Error('Unknown product ' + code); return p.family; };
  const onLine = (p, line) => (!p.line || p.line === line) && (!p.lines || p.lines.includes(line));
  // A transition rule matches on products if given, else on families. More specific rules win.
  const matchT = (p, a, b, pa, pb) => (p.from_product ? p.from_product === pa : !p.from_family || p.from_family === a) && (p.to_product ? p.to_product === pb : !p.to_family || p.to_family === b);
  const spec = (p) => (p.from_product ? 4 : 0) + (p.to_product ? 4 : 0) + (p.line || p.lines ? 2 : 0) + (p.from_family ? 1 : 0) + (p.to_family ? 1 : 0);
  const R0 = Date.UTC(2026, 0, 1), R1 = Date.UTC(2027, 0, 1);
  const intervalsOf = (p) => p.start ? [[parseTime(p.start), parseTime(p.end)]] : weeklyIntervals(p, R0, R1);
  const merge = (iv) => { iv.sort((x, y) => x[0] - y[0]); const out = []; for (const x of iv) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) { l[1] = Math.max(l[1], x[1]); if (!l[2].includes(x[2])) l[2] += ',' + x[2]; } else out.push([x[0], x[1], x[2]]); } return out; };
  const cache = new Map();

  function changeover(prevProduct, product, line) {
    if (!prevProduct || prevProduct === product) return { minutes: 0, rule: null };
    const a = fam(prevProduct), b = fam(product);
    for (const r of forbidden) if (onLine(r.params, line) && matchT(r.params, a, b, prevProduct, product)) return { minutes: null, rule: r.id, forbidden: true };
    let best = null;
    for (const r of overrides) if (onLine(r.params, line) && matchT(r.params, a, b, prevProduct, product) && (!best || spec(r.params) > spec(best.params))) best = r;
    if (best) return { minutes: best.params.minutes, rule: best.id };
    if (a === b) {
      const other = a === 'PPC' && P[prevProduct].color !== P[product].color;
      return { minutes: other ? (table.params.same_family_other_color ?? 60) : (table.params.same_family ?? 25), rule: table.id };
    }
    const m = table.params.matrix?.[a]?.[b];
    if (m == null) return { minutes: null, rule: table.id, forbidden: true };
    return { minutes: m, rule: table.id };
  }
  function canRun(order, line) {
    const ck = 'C|' + line + '|' + order.product_code + '|' + order.customer; if (cache.has(ck)) return cache.get(ck);
    const res = canRun0(order, line); cache.set(ck, res); return res;
  }
  function canRun0(order, line) {
    const f = fam(order.product_code);
    for (const r of caps) { const p = r.params; if ((p.product_code ? p.product_code === order.product_code : p.family === f) && !p.lines.includes(line)) return { ok: false, rule: r.id }; }
    for (const r of quals) { const p = r.params; if (p.customer === order.customer && (!p.family || p.family === f) && (!p.product_code || p.product_code === order.product_code) && !p.lines.includes(line)) return { ok: false, rule: r.id }; }
    return { ok: true };
  }
  // Allowed windows for a changeover: if several rules match the transition on this line, a window of any of them is allowed.
  function transitionWindow(prevProduct, product, t, line) {
    if (!prevProduct || prevProduct === product) return { t };
    const a = fam(prevProduct), b = fam(product), key = 'W|' + line + '|' + prevProduct + '|' + product;
    if (!cache.has(key)) { const ms = windows.filter((w) => onLine(w.params, line) && matchT(w.params, a, b, prevProduct, product)); cache.set(key, ms.length ? merge(ms.flatMap((w) => intervalsOf(w.params).map((x) => [x[0], x[1], w.id]))) : null); }
    const iv = cache.get(key); if (!iv) return { t };
    for (const [s, e, id] of iv) { if (e <= t) continue; return { t: Math.max(s, t), rule: id }; }
    return { t };
  }
  function blackoutPush(line, product, start, durationMs) {
    const f = fam(product), key = 'B|' + line + '|' + product;
    if (!cache.has(key)) cache.set(key, merge(blackouts.filter((r) => onLine(r.params, line) && (!r.params.family || r.params.family === f) && (!r.params.product_code || r.params.product_code === product)).flatMap((r) => intervalsOf(r.params).map((x) => [x[0], x[1], r.id]))));
    let t = start, rule = null;
    for (const [s, e, id] of cache.get(key)) { if (e <= t) continue; if (s >= t + durationMs) break; t = e; rule = id; }
    return { t, rule };
  }
  function rate(line, t, product) {
    let r = BASE_RATE_T_PER_H, rule = null; const f = product ? fam(product) : null;
    for (const x of rates) {
      const p = x.params; if (!onLine(p, line)) continue;
      if (p.family && p.family !== f) continue; if (p.product_code && p.product_code !== product) continue;
      if ((p.weekdays ?? [0, 1, 2, 3, 4, 5, 6]).includes(weekday(t))) { r *= p.factor; rule = rule ? rule + ',' + x.id : x.id; }
    }
    return { rate: r, rule };
  }
  // Lags of the same kind (lab, transport, ...) do not add up: the longest applies. Different kinds add up.
  function releaseLagMinutes(order) {
    const lk = 'L|' + order.product_code + '|' + order.customer; if (cache.has(lk)) return cache.get(lk);
    const res = releaseLag0(order); cache.set(lk, res); return res;
  }
  function releaseLag0(order) {
    const byKind = {}; const f = fam(order.product_code);
    for (const r of lags) {
      const p = r.params;
      if (p.customer && p.customer !== order.customer) continue;
      if (p.product_code && p.product_code !== order.product_code) continue;
      if (p.family && p.family !== f) continue;
      const k = p.kind || 'lab'; if (!byKind[k] || p.minutes > byKind[k].m) byKind[k] = { m: p.minutes, id: r.id };
    }
    const v = Object.values(byKind);
    return { minutes: v.reduce((s, x) => s + x.m, 0), rule: v.map((x) => x.id).join(',') || null };
  }
  function maxCoFor(line, shiftKey) {
    const mk = 'M|' + line + '|' + shiftKey; if (cache.has(mk)) return cache.get(mk);
    const res = maxCo0(line, shiftKey); cache.set(mk, res); return res;
  }
  function maxCo0(line, shiftKey) {
    let m = null, id = null; const s = shiftKey.slice(-1), wd = weekday(parseTime(shiftKey.slice(0, 10) + ' 12:00'));
    for (const r of maxCoRules) { const p = r.params; if (!onLine(p, line)) continue; if (p.shifts && !p.shifts.includes(s)) continue; if (p.weekdays && !p.weekdays.includes(wd)) continue; if (m == null || p.max < m) { m = p.max; id = r.id; } }
    return { max: m, rule: id };
  }
  function preferencePenalty(order, line) {
    const pk = 'P|' + line + '|' + order.product_code + '|' + order.customer + '|' + order.tonnes; if (cache.has(pk)) return cache.get(pk);
    const res = pref0(order, line); cache.set(pk, res); return res;
  }
  function pref0(order, line) {
    let c = 0; const v = [];
    for (const r of prefs) { const p = r.params; const f = fam(order.product_code);
      if (p.family && p.family !== f) continue; if (p.customer && p.customer !== order.customer) continue; if (p.product_code && p.product_code !== order.product_code) continue;
      if (p.min_tonnes && order.tonnes < p.min_tonnes) continue; if (p.max_tonnes && order.tonnes > p.max_tonnes) continue;
      if (!p.lines.includes(line)) { c += p.penalty ?? 60; v.push(r.id); } }
    return { cost: c, rules: v };
  }
  const weight = (order) => prio?.params.weights?.[order.customer] ?? prio?.params.default ?? 1;
  return { P, fam, changeover, canRun, transitionWindow, blackoutPush, rate, releaseLagMinutes, maxCoFor, preferencePenalty, weight, gaps, freezeMinutes: freeze?.params.minutes ?? 240, freezeRule: freeze?.id, active };
}

// Time one line: sequence of orders -> timed rows. ctx: { start: ms, initialProduct, rules (compiled), fixed: {order_id: {start, end, co_start}} }
function timeLine(line, seq, R, ctx) {
  let t = ctx.start, prev = ctx.initialProduct; const rows = [];
  for (const o of seq) {
    const fixed = ctx.fixed?.[o.order_id];
    const co = R.changeover(prev, o.product_code, line);
    const notes = [];
    let coStart = t;
    const w = R.transitionWindow(prev, o.product_code, t, line); if (w.t !== t) notes.push(w.rule); coStart = w.t;
    let start = coStart + (co.minutes ?? 0) * MIN;
    if (o.available_from) { const a = parseTime(o.available_from); if (a > start) { start = a; notes.push('material'); } }
    let rt = R.rate(line, start, o.product_code), dur = o.tonnes / rt.rate * HOUR;
    const b = R.blackoutPush(line, o.product_code, start, dur); if (b.t !== start) { start = b.t; notes.push(b.rule); rt = R.rate(line, start, o.product_code); dur = o.tonnes / rt.rate * HOUR; }
    if (fixed) { coStart = fixed.co_start; start = fixed.start; dur = fixed.end - fixed.start; }
    const end = start + dur;
    rows.push({ order_id: o.order_id, line, product_code: o.product_code, customer: o.customer, tonnes: o.tonnes, due: o.due, co_start: coStart, co_minutes: co.minutes ?? 0, co_rule: co.rule, forbidden: !!co.forbidden, start, end, rate_rule: rt.rule, notes, prev_product: prev });
    t = end; prev = o.product_code;
  }
  return rows;
}

// Cost and violations of one line's timed rows.
const COST = { latePerOrderWeight: 400, latePerWeightedHour: 40, changeoverPerMinute: 1, forbidden: 100000, capability: 100000, maxCoExcess: 300, gap: 300 };
function lineCost(line, rows, orders, R) {
  let cost = 0, coMin = 0, late = 0; const v = [];
  const counts = {};
  for (const r of rows) {
    const o = orders[r.order_id];
    coMin += r.co_minutes;
    if (r.co_minutes > 0) { const k = shiftOf(r.co_start); counts[k] = (counts[k] || 0) + 1; }
    if (r.forbidden) { cost += COST.forbidden; v.push({ rule: r.co_rule, order_id: r.order_id, line, what: 'forbidden transition ' + R.fam(r.prev_product) + ' to ' + R.fam(r.product_code) }); }
    const c = R.canRun(o, line); if (!c.ok) { cost += COST.capability; v.push({ rule: c.rule, order_id: r.order_id, line, what: 'line cannot run this order' }); }
    cost += R.preferencePenalty(o, line).cost;
    const lag = R.releaseLagMinutes(o).minutes * MIN;
    const lh = Math.max(0, (r.end + lag - parseTime(o.due)) / HOUR);
    if (lh > 0) { late += lh * R.weight(o); cost += COST.latePerOrderWeight * R.weight(o); }
  }
  for (const [k, n] of Object.entries(counts)) { const mc = R.maxCoFor(line, k); if (mc.max != null && n > mc.max) { cost += (n - mc.max) * COST.maxCoExcess; v.push({ rule: mc.rule, line, what: n + ' changeovers in shift ' + k }); } }
  cost += late * COST.latePerWeightedHour + coMin * COST.changeoverPerMinute;
  return { cost, coMin, late, violations: v };
}

function gapViolations(timed, R) {
  const v = [];
  for (const g of R.gaps) {
    const starts = [];
    for (const [line, rows] of Object.entries(timed)) if (g.params.lines.includes(line)) {
      for (const r of rows) { const f = R.fam(r.product_code), pf = r.prev_product ? R.fam(r.prev_product) : null; if (f === g.params.family && pf !== f) starts.push({ t: r.start, line, order_id: r.order_id }); }
    }
    starts.sort((a, b) => a.t - b.t);
    for (let i = 1; i < starts.length; i++) if (starts[i].line !== starts[i - 1].line && starts[i].t - starts[i - 1].t < g.params.gap_minutes * MIN) v.push({ rule: g.id, order_id: starts[i].order_id, line: starts[i].line, what: g.params.family + ' starts ' + Math.round((starts[i].t - starts[i - 1].t) / MIN) + ' min after ' + starts[i - 1].order_id + ' on ' + starts[i - 1].line });
  }
  return v;
}

// Polymex platform: plan evaluation shared by both solvers.


// state: { horizon_start, lines: { M01: { initial_product, available_at } }, orders: [...] }
// seqs: { M01: [order_id, ...], ... }
function evaluate(seqs, state, R, opt = {}) {
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

function kpis(ev, state, R) {
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

function toRows(ev) {
  const out = [];
  for (const [line, rows] of Object.entries(ev.timed)) rows.forEach((r, i) => out.push({ line, seq: i + 1, order_id: r.order_id, customer: r.customer, product_code: r.product_code, tonnes: r.tonnes, changeover_start: fmtTime(r.co_start), changeover_minutes: r.co_minutes, changeover_rule: r.co_rule || '', start: fmtTime(r.start), end: fmtTime(r.end), due: r.due, notes: r.notes.filter(Boolean).join(' ') }));
  return out;
}

// Roll a plan forward to `now`: orders that ended are done and leave the state; orders running or starting inside the freeze are kept, at their times.
function rollForward(plan, state, now, freezeMinutes = 240) {
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

// Polymex platform tool: LONG SOLVER. Sequences every open order on every line over the horizon.
// Run once a day. Deterministic. Objective: weighted lateness (priority rule), then changeover minutes, under the active rules.
// Input:  state { horizon_start, lines, orders }, compiled rules R, options { timeBudgetMs, keep: { line: [order_id] }, fixed: { order_id: { co_start, start, end } } }
//         keep and fixed come from rollForward(): orders already running or inside the freeze stay first on their line, at their times.
// Output: { seqs, timed, kpis, violations, runtime_ms, iterations }



function longSolve(state, R, options = {}) {
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

// Polymex platform tool: FAST SOLVER. Repairs a published plan after one event, in seconds.
// Keeps everything that starts before now + freeze, touches as few orders as possible, looks only `horizonHours` ahead for improvements.
// Input:  plan { seqs, timed }, state (orders and lines AFTER the event was applied), compiled rules R,
//         { now, changed: [order_id], removed: [order_id], linesAffected: [line], horizonHours = 48, freezeMinutes = R.freezeMinutes, timeBudgetMs = 800 }
// Output: { seqs, timed, kpis, violations, moves: [{ order_id, from, to }], frozen: [order_id], runtime_ms }



// Stability matters to the floor: every move costs, more so close to now.
const MOVE_PENALTY = { line: 120, position: 40 };

function fastRepair(plan, state, R, a) {
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
function applyEvent(state, evt) {
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

const api = { compile, timeLine, lineCost, gapViolations, evaluate, kpis, toRows, rollForward, longSolve, fastRepair, applyEvent, parseTime, fmtTime, shiftOf, FAMILY_RANK, BASE_RATE_T_PER_H, COST, MOVE_PENALTY };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LyonEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
