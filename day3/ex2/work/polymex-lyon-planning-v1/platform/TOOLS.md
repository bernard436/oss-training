# Platform tools

These are the tools the platform team maintains for every FDE deployment. They are tested, versioned and reused across plants. You compose them; you do not rewrite them. Version 2.3, May 2026.

## Decision tools

| Tool | File | Call | What it guarantees | Typical runtime |
|---|---|---|---|---|
| Rules engine | `rules/engine.mjs` | `compile(rules, products)` returns the compiled rule set `R` | Only rules with status `active` apply. Every decision carries the id of the rule behind it. Types: see `rule_types.json` | Instant |
| Long solver | `solvers/long_solver.mjs` | `longSolve(state, R, { timeBudgetMs, keep, fixed })` | Sequences every open order on every line over the horizon. Minimizes late orders and lateness weighted by priority (rule type `priority`), then changeover minutes, under every hard rule. Deterministic | 0.5 to 4 s for a week of Lyon |
| Fast solver | `solvers/fast_solver.mjs` | `applyEvent(state, event)` then `fastRepair(plan, state, R, { now, changed, removed, linesAffected, horizonHours, timeBudgetMs })` | Repairs a published plan after one event. Keeps every order that starts before `now` plus the freeze (rule type `freeze_window`). Re-inserts what changed at the cheapest place, improves only inside the horizon, and penalizes every move. Returns the list of moves | 5 to 50 ms |
| Plan tools | `solvers/plan.mjs` | `evaluate(seqs, state, R)`, `kpis(ev, state, R)`, `rollForward(plan, state, now, freezeMinutes)`, `toRows(plan)` | The same evaluation for every plan, human or machine. `rollForward` removes finished orders and keeps what is running before a new long run | Instant |

Events understood by `applyEvent`: `quantity_change`, `date_change`, `rush_order`, `cancellation`, `material_late`, `quality_hold` (creates a re-run order), `machine_down` (creates a blackout rule).

## Harness

| Tool | File | Call | What it does |
|---|---|---|---|
| Permissions | `harness/harness.mjs` | `guard(actor, action, resource)` | Refuses anything not granted in `config/permissions.json`. Honors the kill switch |
| Audit | `harness/harness.mjs` | `audit(actor, what, payload)` | One line per decision, tool call and write in `.state/audit.jsonl` |
| Secrets | `harness/harness.mjs` | `secret('ANTHROPIC_API_KEY')` | Reads the environment only |
| Redaction | `harness/harness.mjs` | `redact(text)` | Removes email addresses and phone numbers before a prompt leaves the plant |
| Model gateway | `harness/llm.mjs` | `callForTool({ actor, role, system, user, tool })` | The only way to call a model. Checks the actor may call that role and that tool, forces a structured answer through a tool from `tools.json`, redacts, logs model, tokens and latency |

## Data

| Tool | File | Call |
|---|---|---|
| Store | `store.mjs` | `read(name)`, `write(name, value)`, `reset()`, `nextId(prefix, list)`. Names: `state`, `rules`, `products`, `events`, `published`, `draft`, `overrides`, `execution` |
| Connectors | `connectors/connectors.mjs` | `readOrders()`, `readLines()`, `readProducts()`, `readRules()`, `readHumanPlan()`, `readInbox(day)`. Read-only, from the exports Nadia agreed |

## Model tools

`tools.json` holds the schemas a model may answer with: `submit_event` (one structured planning event with a confidence and the evidence) and `write_explanation` (a short text for the shift leader). A model never calls a solver directly: it proposes, code checks, a person decides.
