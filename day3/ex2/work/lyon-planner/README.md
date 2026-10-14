# Lyon Planner: the planning system, running

FDE School, Day 3. A working planning SaaS for the Polymex Lyon plant (fictional): ontology, rules, planning, data sources, feedback, eval and architecture, on the week 20 data. Node.js 18 or later; nothing to install.

```
npm start            # http://localhost:3000
npm run reset        # back to Monday 11 May 05:30 (deletes state.json)
```

One instance per team: start it on one laptop, the others open `http://<that laptop's IP>:3000`. Every action is shared and written to `state.json`. Opening `public/index.html` directly from disk also works, in local demo mode (state kept in the browser).

## What to try, in order

1. **Planning.** As Corinne, run the daily plan (about 2 seconds: the long solver on 96 orders and 101 rules), then publish it.
2. Apply Monday's events one by one, as Sylvie. Each repair takes milliseconds; publish each one as Corinne. Try a What-if as Stéphane first.
3. **Eval.** The scorecard: each measure scores 0 at its worst acceptable value and 100 at its target, weighted; guardrails fail a plan whatever its score. Change a weight or a target and watch how Corinne's Friday plan, the daily plan and each repair fare. Save it to share it with the team (Corinne, Sylvie or Stéphane).
4. Click an order in the Gantt and override it with a reason. **Feedback**: ask why five times, then decide: a rule, a data fix, or not a rule.
5. **Rules.** Validate the rule you proposed (as Corinne). Run the daily plan again for Tuesday 05:30 and see what changed in Eval.
6. **Data sources.** As Nadia, enable the SAP write-back, then engage the kill switch and try to publish as Corinne.
7. **Ontology.** Click Rule, Line, Customer: what binds what, and which rules constrain each object.

## Who may do what

| Person | May |
|---|---|
| Corinne, planner | Run and publish plans, override, apply events, validate and retire rules |
| Sylvie, event desk | Apply events, what-if, propose rules, write feedback |
| Stéphane, key accounts | What-if |
| Kevin, night shift | Record deviations, propose rules, what-if |
| Nadia, IT | Toggle data sources, the kill switch |

## Read-only API for your own code

`GET /api/plan`, `/api/kpis`, `/api/rules`, `/api/orders`, `/api/events`, `/api/feedback`, `/api/evals`, `/api/audit`. Every change goes through `POST /api/op` with `{ op, actor, args }`; operations and permissions are in `public/core.js`.

## Files

| File | What it is |
|---|---|
| `server.cjs` | The server: state, API, static files |
| `public/index.html` | The application |
| `public/core.js` | State and operations, with permissions: the same code in the browser and on the server |
| `public/engine.js` | The FDE platform engine: rules engine, long solver, fast solver, plan evaluation |
| `public/data.js` | Week 20 data: orders, lines, 110 rules, Monday's events, Corinne's Friday plan, the ontology |
