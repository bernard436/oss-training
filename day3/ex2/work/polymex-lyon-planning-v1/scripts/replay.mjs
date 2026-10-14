// npm run replay: Monday 11 May. Publish the daily plan, then each event through the short loop (Corinne approves each repair),
// then Tuesday's 05:30 long loop. Prints what each loop costs and recovers.
import * as store from '../platform/store.mjs';
import * as O from '../architecture/orchestrator.mjs';
import fs from 'node:fs';

store.reset();
const events = fs.readFileSync(new URL('../data/replay/events_2026-05-11.jsonl', import.meta.url), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
await O.dailyRun({ now: '2026-05-11 05:30' });
let pub = await O.publish({ actor: 'human:corinne', note: 'Monday daily plan' });
const line = (a, b, c, d, e, f) => console.log(String(a).padEnd(6) + String(b).padEnd(18) + String(c).padEnd(9) + String(d).padEnd(9) + String(e).padEnd(10) + f);
console.log('');
line('Event', 'Type', 'Repair', 'Moved', 'On time', 'Codra on time');
line('', 'Daily plan 05:30', '', '', pub.kpis.on_time_pct + '%', pub.kpis.codra_on_time_pct + '%');
for (const e of events) {
  const d = await O.onEvent({ event: e, actor: 'human:sylvie' });
  pub = await O.publish({ actor: 'human:corinne', note: 'repair ' + e.event_id });
  line(e.event_id, e.type, d.runtime_ms + ' ms', d.moves.filter((m) => m.kind !== 'time').length, d.kpis.on_time_pct + '%', d.kpis.codra_on_time_pct + '%');
}
const t = await O.dailyRun({ now: '2026-05-12 05:30' });
line('', 'Daily plan Tue', t.runtime_ms + ' ms', '', t.kpis.on_time_pct + '%', t.kpis.codra_on_time_pct + '%');
console.log('\nThe short loop keeps the floor stable and answers in milliseconds; the long loop recovers what a day of repairs lost. Both are needed.');
console.log('The Tuesday draft is in the app (npm start). It is not published.');
