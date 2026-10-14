# Polymex Lyon: the planning system, first full version

FDE School, Day 3 afternoon. Lab kit for Exercises 3 and 4. Node.js 20 or later, no dependencies to install. Open the folder in Claude Code and read `CLAUDE.md` first.

## What is already here, and what is yours

| Folder | What it is | Yours to edit? |
|---|---|---|
| `platform/` | The core platform: rules engine, long solver, fast solver, plan evaluation, harness (permissions, audit, secrets, redaction), model gateway, store, connectors. Read `platform/TOOLS.md`. | No. You use it. If you think a tool is wrong, write it in `architecture/PLATFORM_ISSUES.md` |
| `config/` | Who may do what (`permissions.json`), when the loops run (`schedule.json`), which model for which role (`llm.json`) | Yes |
| `architecture/` | Your target architecture from this morning, as code (`orchestrator.mjs`) and as a page (`ARCHITECTURE.md`) | Yes, this is the exercise |
| `app/` | The planning mini-app: plan, events, rules capture with five whys, execution capture, scorecard, audit | You may extend it |
| `data/` | Week 20 open orders from SAP, line states on Monday 11 May 06:00, the rule register (110 rules: 101 active, 4 proposed, 5 retired; see `data/RULES_REGISTER.md`), Corinne's Friday plan, Monday's planning mailbox, Monday's events | No. The trainer will change facts during Exercise 4 |
| `tests/` | `platform.test.mjs` (green from the start) and `architecture.test.mjs` (green when your orchestrator and permissions are right) | Add your own |
| `docs/RUNBOOK.md` | Nadia's condition before go-live | Yes |

## Commands

```
npm run reset     # start again from data/ (deletes .state/)
npm test          # platform and architecture tests
npm run day       # the long loop on week 20, compared with Corinne's Friday plan
npm run replay    # Monday's ten events through the short loop, then Tuesday's 05:30 long loop
npm start         # the mini-app on http://localhost:3000
```

## Exercise 3. Put the platform tools into your target architecture (70 minutes)

1. Read `platform/TOOLS.md`. List, for each step of your to-be from this morning, the platform tool it uses. Put it in `architecture/ARCHITECTURE.md` (10 min).
2. Write `config/permissions.json`: every actor of your architecture, human, agent and service, with the least grants that let it do its job. Who publishes? Who confirms an event? What may the event reader write? Is the SAP write-back on? (15 min)
3. Implement `architecture/orchestrator.mjs`: `dailyRun`, `onEvent`, `whatIf`, `publish`. Every function starts with a `guard` and ends with an `audit` (30 min).
4. Run `npm test`, `npm run day` and `npm run replay`. Fill the entitlement column of this morning's scorecard with the result of `npm run day` (10 min).
5. Stretch: `readEvent` with the model gateway on `data/inbox/2026-05-11/`, and `explain`. Without a key, the app falls back to the manual form.

**Done means.** `npm test` green. `npm run replay` shows, for each event, the repair time, the orders moved and the on-time rate. You can say what the long loop recovered on Tuesday morning that the short loop could not.

## Exercise 4. Build the first full version and run it with Corinne (75 minutes)

`npm start`. The trainer plays Corinne. She uses your app on her plan, as she would on Monday. She will disagree, bring news from the floor, and change facts in the data.

1. Run the daily plan, show it to Corinne, publish it only if she agrees.
2. Every time she disagrees, ask why, five times, and capture the answer in **Rules**: the five whys, the rule in her words, its type and parameters, its source, its owner. Corinne validates it, or not.
3. Every time she tells you what really happened on the floor, record it in **Execution** with a classification: rule missing, rule wrong, data wrong, one-off, human preference.
4. Re-run the daily plan or the next repair with the new rules. Show her the difference.
5. Demo at 16:55: three minutes, live, on your app. What did you learn about the plant in one hour, and what does the scorecard say?

**Done means.** Every override has a reason. Every reason has either a rule, a data fix, or a decision that it is not a rule. Corinne has validated at least three new rules.
