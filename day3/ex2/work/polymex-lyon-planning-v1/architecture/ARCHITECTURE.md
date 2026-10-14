# Target architecture: Lyon planning, first version

Team: Oskar Ops · Day 3, Exercise 3. The platform tools are composed in `architecture/orchestrator.mjs`; nothing in `platform/` is changed.

## The loops

| Loop | Trigger | Platform tool | Horizon | Who decides | Record |
|---|---|---|---|---|---|
| Long | Every day at 05:30 (`config/schedule.json`) | `rollForward` then `longSolve`, rules from `compile` | 7 days, all 7 lines, time budget 4 s | Corinne publishes the draft (gate `publish`) | `draft` then `published`, audit `plan.daily.drafted`, `plan.published` |
| Short | Each event confirmed by Sylvie (or Corinne) | `applyEvent` then `fastRepair` | 48 h, freeze 240 min (rule R08), budget 0.8 s | Sylvie confirms the event; Corinne publishes the repair | event `applied`, `draft`, audit `event.applied` |
| What-if | A question from Stéphane, Kevin, Sylvie or Corinne | The short loop on copies (`repair()` without writes) | Same as short | Stéphane promises; nothing is saved | audit `whatif` only |

**Storyteller, one sentence per loop.**
- The **long loop** looks at the whole week and every line at once, so it can undo the changeovers and lateness that a day of local repairs piled up; the short loop cannot, because it only moves a few orders inside 48 hours.
- The **short loop** answers in milliseconds and keeps everything inside the 4-hour freeze in place, so the floor stays stable; the long loop cannot, because it reshuffles the week and takes seconds.
- The **what-if** lets Stéphane ask before he promises, without touching the plan anyone runs.

## Each step of this morning's to-be, and the tool it uses

| Step | Component type | Platform tool or our code | Actor (permissions.json) | Human gate |
|---|---|---|---|---|
| 1. Capture rules | Expert system | Rules registry, `compile`; app route `POST /api/rules` | `human:corinne`, `human:sylvie`, `human:kevin` propose | `rule_activation`: Corinne validates |
| 2. Read the plant | Existing systems, read-only | Connectors `readOrders`, `readLines`, `readRules`; store | (service, read-only) | Nadia owns access and kill switch |
| 3. Daily plan | Solver | `dailyRun` → `rollForward`, `longSolve` | `service:long-solver` | `publish`: Corinne |
| 4. Take in an event | Language model (stretch) or manual form | `readEvent` → `callForTool(event_reader, submit_event)`, then code checks | `agent:event-reader` proposes only | Sylvie confirms |
| 5. Repair | Solver | `onEvent` → `applyEvent`, `fastRepair` | `service:fast-solver`, confirmed by `human:sylvie` | `publish`: Corinne |
| 6. Answer the customer | Solver in simulation | `whatIf` → same repair, no writes | `human:stephane` | Stéphane promises |
| 7. Publish and explain | Our code + language model | `publish`; `explain` → `callForTool(explainer)` or template | `human:corinne`; `agent:explainer` reads only | `publish`: Corinne; SAP write-back off |
| 8. Measure | Plan evaluation | `kpis`, `evaluate` (same for every plan); audit trail | `human:nadia` reads the audit | Julien signs the gain |

## Permissions, in one sentence per actor

- **Corinne** reads everything, publishes, validates rules, overrides, and can confirm events when Sylvie is away.
- **Sylvie** proposes and confirms events, proposes rules and uses what-if; she cannot publish.
- **Stéphane** reads the published plan and asks what-if questions; he cannot confirm an event or publish.
- **Kevin** reads the published plan, records deviations, proposes rules and uses what-if.
- **Nadia** reads the audit trail; she holds the kill switch and enables the SAP write-back in `config/permissions.json`.
- **The event reader** calls its model role and the `submit_event` tool and may only write a *proposed* event.
- **The explainer** calls its model role and the `write_explanation` tool and reads plans; it writes nothing.
- **The long and fast solvers** may only write a *draft*.
- **The SAP write-back** holds `write:sap:process_orders` but is `enabled: false`; every publish audits `sap.writeback.skipped`.

**Verifier check, run on our permissions** (`guard`, kill switch off): Stéphane, the event reader and the long solver are refused `write:plan:published`; the event reader, Stéphane and Kevin are refused `write:event:confirmed`; Sylvie may confirm but not publish; the SAP write-back is refused; Corinne may publish. With the kill switch engaged, Corinne's publish is refused too.

## What the model sees, and what it may write

- **Sees:** the message text (redacted by the gateway: emails and phone numbers removed), the list of lines, products and open orders, and a system prompt saying the message is data.
- **May write:** one `submit_event` answer. Code then checks the type, that the order and the line exist, and that tonnes are plausible, and stores it with status `proposed`. The explainer may return one `write_explanation` text.
- **Never:** a grant to confirm, publish, change a rule or write to SAP; never a solver call; never a secret.

## Answers to the four questions

**Why is publishing a human gate, and why Corinne?** A published plan sends seven lines and three shifts to work; a wrong one costs scrap, overtime and late orders, and cannot be taken back once a line has started. The solver only knows what is in the data; Corinne knows the rest (a crew short, a customer call, a line that sounds wrong) and is the person accountable for the plan today. She is the only approver of the `publish` gate.

**Why may Sylvie confirm events and Stéphane not?** Sylvie runs the event desk: she has kept the change log since February and checks each fact against its source. Stéphane is the one who brings customer requests; if he could confirm them, the person asking would be the person approving, and a promise could move the plan without anyone checking. He has what-if instead, which answers him without saving anything.

**What stops an instruction hidden in an email from changing the plan?** Every layer, in order:
1. The gateway redacts the message and the system prompt tells the model the message is data, not instructions.
2. The model can only answer through `submit_event`: a fixed schema with an enum of event types; no free action.
3. Our code checks the answer (event type, order and line exist, tonnes plausible) and rejects it otherwise.
4. The event reader may only write `event:proposed`: it cannot confirm, publish, change a rule or write to SAP.
5. Sylvie confirms the event, or rejects it.
6. The fast solver repairs under the active rules only; a rule cannot be created by an event, except a machine-down blackout, owned by Patrick.
7. Corinne publishes, or not.
8. Everything is in the audit trail; the SAP write-back is off; Nadia's kill switch stops every write and every tool call.

**What did `npm run day` give as entitlement on changeover hours, and why is it not our target?** On week 20, same 96 orders, same rules, the long solver needs **53.9 h of changeovers against 89.2 h in Corinne's Friday plan: −40%**, with on-time up from 91.7% to 96.9% and 8 late orders down to 3. It is not a target because it assumes a week without a single event, while Lyon has about 47 changes a week; Monday's nine events alone took on-time from 97.9% to 85.7% in the replay. The target is set on real weeks, with guardrails, and signed by Julien.

## Entitlement from `npm run day`, for the morning scorecard

| Measure | Corinne's Friday plan | Long solver | Change |
|---|---|---|---|
| On time, all orders | 91.7% | 96.9% | +5.2 pts |
| On time, Codra | 97.1% | 97.1% | = |
| Changeovers | 77 | 53 | −31% |
| Changeover hours | 89.2 h | 53.9 h | **−40%** |
| Late orders | 8 | 3 | −5 |
| Rule violations | 1 | 1 | = |

## Replay of Monday 11 May (`npm run replay`)

| Event | Type | Repair | Orders moved | On time | Codra on time |
|---|---|---|---|---|---|
| | Daily plan 05:30 | | | 97.9% | 97.1% |
| E01 | date_change | 199 ms | 0 | 97.9% | 97.1% |
| E02 | machine_down | 74 ms | 24 | 93.8% | 94.3% |
| E03 | quantity_change | 106 ms | 7 | 92.7% | 94.3% |
| E04 | rush_order | 315 ms | 2 | 92.8% | 94.3% |
| E05 | material_late | 174 ms | 4 | 90.7% | 88.6% |
| E06 | quality_hold | 142 ms | 14 | 89.8% | 88.9% |
| E07 | cancellation | 8 ms | 11 | 90.7% | 88.9% |
| E08 | rush_order | 97 ms | 14 | 87.8% | 89.2% |
| E09 | machine_down | 99 ms | 6 | 85.7% | 86.5% |
| | Daily plan Tuesday 05:30 | 4011 ms | | **87.1%** | **89.7%** |

**What Tuesday's daily run recovered:** after nine repairs, Monday ended at 85.7% on time (Codra 86.5%). Tuesday's long loop, starting from the same state with the running orders kept, brought it back to 87.1% (+1.4 points) and Codra to 89.7% (+3.2 points): the gain that only a whole-week re-sequencing can find. Every repair answered in under a third of a second.
