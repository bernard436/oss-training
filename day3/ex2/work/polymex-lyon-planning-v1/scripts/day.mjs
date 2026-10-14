// npm run day: the long loop on week 20, compared with Corinne's Friday plan on the same orders, under the same rules.
import * as store from '../platform/store.mjs';
import * as O from '../architecture/orchestrator.mjs';
import { compile } from '../platform/rules/engine.mjs';
import { evaluate, kpis, toRows } from '../platform/solvers/plan.mjs';
import { readHumanPlan } from '../platform/connectors/connectors.mjs';
import fs from 'node:fs';

store.reset();
const st = store.read('state'), R = compile(store.read('rules'), store.read('products'));
const seqs = Object.fromEntries(Object.keys(st.lines).map((l) => [l, []]));
for (const r of readHumanPlan()) seqs[r.line].push(r.order_id);
const human = kpis(evaluate(seqs, st, R), st, R);
const d = await O.dailyRun({ now: '2026-05-11 05:30' });
const rows = [['On time, all orders', 'on_time_pct', '%'], ['On time, Codra', 'codra_on_time_pct', '%'], ['Changeovers', 'changeovers', ''], ['Changeover hours', 'changeover_hours', ' h'], ['Late orders', null, ''], ['Rule violations', 'violations', '']];
console.log('\nWeek 20, ' + st.orders.length + ' orders, ' + human.tonnes + ' t\n');
console.log('Measure'.padEnd(24) + "Corinne's Friday plan".padEnd(24) + 'Long solver');
for (const [l, k, u] of rows) console.log(l.padEnd(24) + String((k ? human[k] : human.late.length) + u).padEnd(24) + (k ? d.kpis[k] : d.kpis.late.length) + u);
const gain = 100 * (1 - d.kpis.changeover_hours / human.changeover_hours);
console.log('\nEntitlement on changeover hours, same orders, no events: -' + gain.toFixed(0) + '%. Long solver ran in ' + d.runtime_ms + ' ms.');
fs.mkdirSync(new URL('../out/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../out/plan_w20_long.json', import.meta.url), JSON.stringify(toRows(d), null, 1));
console.log('Plan written to out/plan_w20_long.json. The draft is in the app: npm start.');
