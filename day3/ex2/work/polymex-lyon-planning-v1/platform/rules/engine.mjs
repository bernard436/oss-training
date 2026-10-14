// Polymex platform: rules engine (expert system). Deterministic. Every rule has an id, a type, params, a source, an owner and a status.
// Only rules with status "active" are applied. Types are listed in platform/TOOLS.md.

export const BASE_RATE_T_PER_H = 2.02; // 2.30 t/h ideal x 0.88 performance
export const FAMILY_RANK = { PPN: 0, PPW: 1, PPC: 2, PPK: 3, PPG: 4, PA6: 5 };
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;

export const parseTime = (s) => typeof s === 'number' ? s : Date.parse(String(s).replace(' ', 'T') + (String(s).length <= 16 ? ':00Z' : 'Z'));
export const fmtTime = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const weekday = (t) => new Date(t).getUTCDay(); // 0 Sunday ... 6 Saturday
const minutesOfDay = (t) => new Date(t).getUTCHours() * 60 + new Date(t).getUTCMinutes();
const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
export function shiftOf(t) { const h = new Date(t).getUTCHours(); const s = h >= 6 && h < 14 ? 'A' : h >= 14 && h < 22 ? 'B' : 'C'; const day = fmtTime(t - (h < 6 ? DAY : 0)).slice(0, 10); return day + ' ' + s; }

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

export function compile(rules, products) {
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
export function timeLine(line, seq, R, ctx) {
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
export const COST = { latePerOrderWeight: 400, latePerWeightedHour: 40, changeoverPerMinute: 1, forbidden: 100000, capability: 100000, maxCoExcess: 300, gap: 300 };
export function lineCost(line, rows, orders, R) {
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

export function gapViolations(timed, R) {
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
