# Rule register: Lyon planning

110 rules after the rules workshop of 6 May 2026: 101 active, 4 proposed, 5 retired. Owner is the person who can change the rule. Only active rules apply.

| Category | Rules |
|---|---|
| Changeover | 23 |
| Forbidden transition | 6 |
| Line capability | 9 |
| Shared resource | 4 |
| Changeovers per shift | 5 |
| Changeover window | 12 |
| Freeze and priority | 5 |
| Customer qualification | 4 |
| Line availability | 13 |
| Run rate | 7 |
| Release and transport | 13 |
| Line preference | 9 |

## Changeover

| Id | Rule | Type and parameters | Source | Owner | Status |
|---|---|---|---|---|---|
| R01 | Changeover minutes from one family to another. Same family 25, same family other color 60, same product 0. Empty means forbidden. | `changeover_table` matrix 6 x 6 | Corinne's whiteboard, photo of 30 April 2026; Jean-Pierre N1 p.40 | Corinne | active |
| R10 | Blue to red: 45 minutes, light to dark | `changeover_override` from_product PPC-3110; to_product PPC-3120; minutes 45 | Corinne, rules workshop, 6 May 2026; Jean-Pierre N2 p.12 | Corinne | active |
| R11 | Red to blue: 75 minutes, purge until no pink | `changeover_override` from_product PPC-3120; to_product PPC-3110; minutes 75 | Corinne, rules workshop, 6 May 2026; Jean-Pierre N2 p.12 | Corinne | active |
| R12 | Blue to green: 50 minutes | `changeover_override` from_product PPC-3110; to_product PPC-3140; minutes 50 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R13 | Green to blue: 70 minutes | `changeover_override` from_product PPC-3140; to_product PPC-3110; minutes 70 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R14 | Red to green: 80 minutes, red shows in green for an hour | `changeover_override` from_product PPC-3120; to_product PPC-3140; minutes 80 | Corinne, rules workshop, 6 May 2026; Amina, color claims 2025 | Corinne | active |
| R15 | Green to red: 55 minutes | `changeover_override` from_product PPC-3140; to_product PPC-3120; minutes 55 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R16 | Natural 1010 to natural 1020: 15 minutes, grade change only | `changeover_override` from_product PPN-1010; to_product PPN-1020; minutes 15 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R17 | Natural 1020 to natural 1010: 20 minutes | `changeover_override` from_product PPN-1020; to_product PPN-1010; minutes 20 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R18 | White 2010 to high-gloss white 2030: 20 minutes | `changeover_override` from_product PPW-2010; to_product PPW-2030; minutes 20 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R19 | High-gloss white 2030 to white 2010: 35 minutes, melt filter change | `changeover_override` from_product PPW-2030; to_product PPW-2010; minutes 35 | Corinne, rules workshop, 6 May 2026; Patrick, 6 May | Patrick | active |
| R20 | Black 4010 to conductive black 4040: 20 minutes | `changeover_override` from_product PPK-4010; to_product PPK-4040; minutes 20 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R21 | Conductive black 4040 to black 4010: 40 minutes, carbon residue | `changeover_override` from_product PPK-4040; to_product PPK-4010; minutes 40 | Corinne, rules workshop, 6 May 2026; Amina | Corinne | active |
| R22 | Black glass 5030 to natural glass 5031: 120 minutes | `changeover_override` from_product PPG-5030; to_product PPG-5031; minutes 120 | Jean-Pierre N2 p.9 | Corinne | active |
| R23 | Natural glass 5031 to black glass 5030: 35 minutes | `changeover_override` from_product PPG-5031; to_product PPG-5030; minutes 35 | Jean-Pierre N2 p.9 | Corinne | active |
| R24 | Black PA6 to natural PA6: 120 minutes | `changeover_override` from_product PA6-6040; to_product PA6-6010; minutes 120 | Jean-Pierre N3 p.20 | Corinne | active |
| R25 | Natural PA6 to black PA6: 30 minutes | `changeover_override` from_product PA6-6010; to_product PA6-6040; minutes 30 | Jean-Pierre N3 p.20 | Corinne | active |
| R26 | On M07, white to colored: 25 minutes, quick-change die | `changeover_override` line M07; from_family PPW; to_family PPC; minutes 25 | Corinne, rules workshop, 6 May 2026; Bruno, automation | Corinne | active |
| R27 | On M07, natural to white: 20 minutes, quick-change die | `changeover_override` line M07; from_family PPN; to_family PPW; minutes 20 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R28 | On M04, black to colored: 150 minutes, the worn screw holds black | `changeover_override` line M04; from_family PPK; to_family PPC; minutes 150 | Patrick, 6 May | Patrick | active |
| R29 | On M01, glass-filled to natural: 75 minutes, vented barrel cleans faster | `changeover_override` line M01; from_family PPG; to_family PPN; minutes 75 | Patrick, 6 May | Patrick | active |
| R30 | On M03, PA6 to black: 120 minutes, purge with black PP | `changeover_override` line M03; from_family PA6; to_family PPK; minutes 120 | Jean-Pierre N4 p.3 | Corinne | active |
| R103 | ERP standard: 60 minutes for every changeover | `changeover_table` flat 60 minutes, SAP routings 2011 | SAP routings, 2011 | Group IT | retired: Replaced by R01 and the product overrides |

## Forbidden transition

| Id | Rule | Type and parameters | Source | Owner | Status |
|---|---|---|---|---|---|
| R02 | Never white straight after glass-filled: streaks for hours | `forbidden_transition` from_family PPG; to_family PPW | Jean-Pierre N2 p.31; Corinne, 4 May | Corinne | active |
| R31 | Never food-contact natural straight after conductive black | `forbidden_transition` from_product PPK-4040; to_product PPN-1020 | Amina, food-contact procedure QP-12 | Amina | active |
| R32 | On M02, never natural straight after glass-filled: streaks | `forbidden_transition` line M02; from_family PPG; to_family PPN | Jean-Pierre N2 p.33 | Corinne | active |
| R33 | Never food-contact natural straight after black PA6 | `forbidden_transition` from_product PA6-6040; to_product PPN-1020 | Amina, QP-12 | Amina | active |
| R34 | On M04, never white straight after black: black specks from the worn screw | `forbidden_transition` line M04; from_family PPK; to_family PPW | Patrick, 6 May | Patrick | active |
| R35 | Never high-gloss white straight after red: pink tint | `forbidden_transition` from_product PPC-3120; to_product PPW-2030 | Amina, Duval claim Q1 2026 | Amina | active |

## Line capability

| Id | Rule | Type and parameters | Source | Owner | Status |
|---|---|---|---|---|---|
| R03 | Glass-filled only on M01, M02, M05: hardened screws since 2013 | `line_capability` family PPG; lines M01 M02 M05 | Jean-Pierre N2 p.7 | Patrick | active |
| R04 | PA6 only on M03 and M06: the dryer is connected there | `line_capability` family PA6; lines M03 M06 | Jean-Pierre N3 p.18 | Patrick | active |
| R36 | Food-contact natural 1020 only on BRC-certified lines M02, M03, M05, M07 | `line_capability` product_code PPN-1020; lines M02 M03 M05 M07 | BRC certificate 2025; Amina | Amina | active |
| R37 | High-gloss white 2030 only on lines with the 40 µm melt filter: M01, M03, M05, M07 | `line_capability` product_code PPW-2030; lines M01 M03 M05 M07 | Patrick, 6 May | Patrick | active |
| R38 | Conductive black 4040 never on M07: no carbon feeder | `line_capability` product_code PPK-4040; lines M01 M02 M03 M04 M05 M06 | Bruno, automation | Patrick | active |
| R39 | Green 3140 only on lines with a gravimetric feeder: M01, M02, M04, M05, M07 | `line_capability` product_code PPC-3140; lines M01 M02 M04 M05 M07 | Bruno, automation | Patrick | active |
| R40 | Natural glass 5031 only on M01 and M05 | `line_capability` product_code PPG-5031; lines M01 M05 | Jean-Pierre N2 p.9 | Corinne | active |
| R41 | Standard white 2010 never on M06: PA6 residue yellows it | `line_capability` product_code PPW-2010; lines M01 M02 M03 M04 M05 M07 | Amina, 2024 claim | Amina | active |
| R105 | Glass-filled allowed on M04 | `line_capability` family PPG; lines M01 M02 M04 M05 | Before 2012 | Patrick | retired: The 2012 screw damage; replaced by R03 |

## Shared resource

| Id | Rule | Type and parameters | Source | Owner | Status |
|---|---|---|---|---|---|
| R05 | Two PA6 starts on M03 and M06 at least four hours apart: one dryer | `shared_resource_gap` family PA6; lines M03 M06; gap_minutes 240 | Jean-Pierre N3 p.18; Corinne, 4 May | Corinne | active |
| R46 | Color dosing station shared by M01 and M02: two color starts at least 60 minutes apart | `shared_resource_gap` family PPC; lines M01 M02; gap_minutes 60 | Didier, 6 May | Didier | active |
| R47 | Glass fibre silo feeds M01, M02, M05: two glass starts at least 120 minutes apart | `shared_resource_gap` family PPG; lines M01 M02 M05; gap_minutes 120 | Patrick, 6 May | Patrick | active |
| R48 | Black hopper shared by M06 and M07: two black starts at least 45 minutes apart | `shared_resource_gap` family PPK; lines M06 M07; gap_minutes 45 | Kevin, 6 May | Didier | active |

## Changeovers per shift

| Id | Rule | Type and parameters | Source | Owner | Status |
|---|---|---|---|---|---|
| R06 | At most four changeovers per line per shift | `max_changeovers_per_shift` max 4 | Corinne, 4 May. Notebook N3 p.52 says three; Corinne says four since 2025 | Corinne | active |
| R49 | Night shift: at most three changeovers per line | `max_changeovers_per_shift` max 3; shifts C | Kevin, 6 May; Didier | Didier | active |
| R50 | Saturday and Sunday: at most three changeovers per line, reduced crew | `max_changeovers_per_shift` max 3; weekdays 6 0 | Didier, 6 May | Didier | active |
| R51 | M04: at most two changeovers per shift, every purge needs a check | `max_changeovers_per_shift` max 2; line M04 | Patrick, 6 May | Patrick | active |
| R104 | At most three changeovers per line per shift | `max_changeovers_per_shift` max 3 | Jean-Pierre N3 p.52, 2021 | Corinne | retired: Corinne: "4 now", with the retail orders; replaced by R06 |

## Changeover window

| Id | Rule | Type and parameters | Source | Owner | Status |
|---|---|---|---|---|---|
| R07 | Black to natural needs a screw pull: Saturday 06:00 to 14:00 only, maintenance present | `transition_window` from_family PPK; to_family PPN; weekdays 6; from 06:00; to 14:00 | Jean-Pierre N1 p.12; Patrick, 6 May | Patrick | active |
| R52 | PA6 to PPN: polymer change on weekdays 06:00 to 14:00 only, process engineer present | `transition_window` from_family PA6; to_family PPN; weekdays 1 2 3 4 5; from 06:00; to 14:00 | Jean-Pierre N4 p.3; Didier | Didier | active |
| R53 | PA6 to PPW: polymer change on weekdays 06:00 to 14:00 only, process engineer present | `transition_window` from_family PA6; to_family PPW; weekdays 1 2 3 4 5; from 06:00; to 14:00 | Jean-Pierre N4 p.3; Didier | Didier | active |
| R54 | PA6 to PPC: polymer change on weekdays 06:00 to 14:00 only, process engineer present | `transition_window` from_family PA6; to_family PPC; weekdays 1 2 3 4 5; from 06:00; to 14:00 | Jean-Pierre N4 p.3; Didier | Didier | active |
| R55 | PA6 to PPK: polymer change on weekdays 06:00 to 14:00 only, process engineer present | `transition_window` from_family PA6; to_family PPK; weekdays 1 2 3 4 5; from 06:00; to 14:00 | Jean-Pierre N4 p.3; Didier | Didier | active |
| R56 | PPN to PA6: polymer change on weekdays 06:00 to 14:00 only, process engineer present | `transition_window` from_family PPN; to_family PA6; weekdays 1 2 3 4 5; from 06:00; to 14:00 | Jean-Pierre N4 p.3; Didier | Didier | active |
| R57 | PPW to PA6: polymer change on weekdays 06:00 to 14:00 only, process engineer present | `transition_window` from_family PPW; to_family PA6; weekdays 1 2 3 4 5; from 06:00; to 14:00 | Jean-Pierre N4 p.3; Didier | Didier | active |
| R58 | PPC to PA6: polymer change on weekdays 06:00 to 14:00 only, process engineer present | `transition_window` from_family PPC; to_family PA6; weekdays 1 2 3 4 5; from 06:00; to 14:00 | Jean-Pierre N4 p.3; Didier | Didier | active |
| R59 | PPK to PA6: polymer change on weekdays 06:00 to 14:00 only, process engineer present | `transition_window` from_family PPK; to_family PA6; weekdays 1 2 3 4 5; from 06:00; to 14:00 | Jean-Pierre N4 p.3; Didier | Didier | active |
| R60 | Glass-filled to natural: on day shifts only, 06:00 to 22:00, the purge is inspected | `transition_window` from_family PPG; to_family PPN; from 06:00; to 22:00 | Jean-Pierre N2 p.33 | Corinne | active |
| R61 | Black to white: Saturday 06:00 to 14:00, maintenance present | `transition_window` from_family PPK; to_family PPW; weekdays 6; from 06:00; to 14:00 | Patrick, 6 May | Patrick | active |
| R62 | Black to white: also Wednesday 06:00 to 10:00, when maintenance is in for the weekly round | `transition_window` from_family PPK; to_family PPW; weekdays 3; from 06:00; to 10:00 | Patrick, 6 May | Patrick | active |

## Freeze and priority

| Id | Rule | Type and parameters | Source | Owner | Status |
|---|---|---|---|---|---|
| R08 | Never touch the running order and the next one: about four hours | `freeze_window` minutes 240 | Corinne, process walk 5 May | Corinne | active |
| R09 | Codra first since February, Brisol second (contract penalties), then the others | `priority` weights {"Codra Retail":5,"Brisol Automotive":3}; default 1 | Corinne, process walk 5 May; decision by Hervé, February 2026 | Hervé | active |
| R102 | Freeze extends to eight hours on Friday nights | `freeze_window` minutes 480 | Kevin, 6 May: proposed | Corinne | proposed |
| R106 | The plan is frozen for the whole week, Monday 06:00 to Monday 06:00 | `freeze_window` minutes 10080 | PRO-PLN-004, 2021 | Didier | retired: Not applied since 2024 (Didier); replaced by R08 |
| R107 | Lumen first among retail customers | `priority` weights {"Lumen":4}; default 1 | Corinne, 2024 | Hervé | retired: Lumen moved to a competitor in summer 2025 |

## Customer qualification

| Id | Rule | Type and parameters | Source | Owner | Status |
|---|---|---|---|---|---|
| R42 | Codra is supplied only from lines in its 2025 audit: M01, M02, M03, M05, M07 | `customer_line_qualification` customer Codra Retail; lines M01 M02 M03 M05 M07 | Codra supplier audit, November 2025; Stéphane | Stéphane | active |
| R43 | Duval never from M04: the Q1 color claim was traced to M04 | `customer_line_qualification` customer Duval Home; lines M01 M02 M03 M05 M06 M07 | Amina, 8D report Duval Q1 2026 | Amina | active |
| R44 | Kerno only from the lines in its UL file: M03, M06 | `customer_line_qualification` customer Kerno Electrics; lines M03 M06 | UL file E-48211 | Amina | active |
| R45 | Estrel pipe grades only from lines with melt-pressure monitoring: M01, M02, M05, M06 | `customer_line_qualification` customer Estrel Pipes; lines M01 M02 M05 M06 | Estrel specification EP-7; Bruno | Amina | active |

## Line availability

| Id | Rule | Type and parameters | Source | Owner | Status |
|---|---|---|---|---|---|
| R63 | Preventive maintenance on M01 every Tuesday 06:00 to 09:00 | `blackout` line M01; weekdays 2; from 06:00; to 09:00 | MaintPro preventive plan 2026; Patrick | Patrick | active |
| R64 | Preventive maintenance on M02 every Wednesday 06:00 to 12:00 | `blackout` line M02; weekdays 3; from 06:00; to 12:00 | MaintPro preventive plan 2026; Patrick | Patrick | active |
| R65 | Preventive maintenance on M03 every Thursday 14:00 to 17:00 | `blackout` line M03; weekdays 4; from 14:00; to 17:00 | MaintPro preventive plan 2026; Patrick | Patrick | active |
| R66 | Preventive maintenance on M04 every Monday 06:00 to 08:00 | `blackout` line M04; weekdays 1; from 06:00; to 08:00 | MaintPro preventive plan 2026; Patrick | Patrick | active |
| R67 | Preventive maintenance on M05 every Tuesday 14:00 to 17:00 | `blackout` line M05; weekdays 2; from 14:00; to 17:00 | MaintPro preventive plan 2026; Patrick | Patrick | active |
| R68 | Preventive maintenance on M06 every Thursday 14:00 to 18:00 | `blackout` line M06; weekdays 4; from 14:00; to 18:00 | MaintPro preventive plan 2026; Patrick | Patrick | active |
| R69 | Preventive maintenance on M07 every Friday 06:00 to 08:00 | `blackout` line M07; weekdays 5; from 06:00; to 08:00 | MaintPro preventive plan 2026; Patrick | Patrick | active |
| R70 | Dryer regeneration on Sunday 06:00 to 10:00: no PA6 on M03 or M06 | `blackout` lines M03 M06; family PA6; weekdays 0; from 06:00; to 10:00 | Patrick; Jean-Pierre N3 p.18 | Patrick | active |
| R71 | Ascension, Thursday 14 May 2026: M07 not staffed | `blackout` line M07; start 2026-05-14 06:00; end 2026-05-15 06:00 | HR holiday staffing plan 2026 | Didier | active |
| R72 | Ascension, Thursday 14 May 2026: M04 not staffed on shifts A and B | `blackout` line M04; start 2026-05-14 06:00; end 2026-05-14 22:00 | HR holiday staffing plan 2026 | Didier | active |
| R73 | Whit Monday, 25 May 2026: M04 and M07 not staffed | `blackout` lines M04 M07; start 2026-05-25 06:00; end 2026-05-26 06:00 | HR holiday staffing plan 2026 | Didier | active |
| R74 | Summer shutdown, 3 to 21 August 2026: all lines | `blackout` lines M01 M02 M03 M04 M05 M06 M07; start 2026-08-03 06:00; end 2026-08-24 06:00 | Hervé, 2026 calendar | Hervé | active |
| R75 | M02 feeder calibration every Friday 14:00 to 15:00 | `blackout` line M02; weekdays 5; from 14:00; to 15:00 | MaintPro; Patrick | Patrick | active |

## Run rate

| Id | Rule | Type and parameters | Source | Owner | Status |
|---|---|---|---|---|---|
| R76 | Glass-filled runs at 85% of the standard rate: fibre feeding | `rate_factor` family PPG; factor 0.85 | LineLog 2025, glass runs; Julien | Corinne | active |
| R77 | PA6 runs at 90%: the dryer limits throughput | `rate_factor` family PA6; factor 0.9 | LineLog 2025; Patrick | Patrick | active |
| R78 | M07 runs at 92% on every product: smaller extruder | `rate_factor` line M07; factor 0.92 | Machine data sheet M07; LineLog 2025 | Patrick | active |
| R79 | On M02, glass-filled runs a further 10% slower: gearbox derating | `rate_factor` line M02; family PPG; factor 0.9 | Patrick, 6 May; MaintPro WO 2291 | Patrick | active |
| R80 | High-gloss white runs at 90%: melt filter | `rate_factor` product_code PPW-2030; factor 0.9 | LineLog 2025 | Corinne | active |
| R81 | Conductive black runs at 92% | `rate_factor` product_code PPK-4040; factor 0.92 | LineLog 2025 | Corinne | active |
| R110 | M05 at 95% in July and August: heat | `rate_factor` line M05; factor 0.95 | Patrick, 6 May: proposed, needs a date window | Patrick | proposed |

## Release and transport

| Id | Rule | Type and parameters | Source | Owner | Status |
|---|---|---|---|---|---|
| R82 | Every lot waits two hours for lab release | `release_lag` kind lab; minutes 120 | Amina, lab procedure QP-03 | Amina | active |
| R83 | PA6 lots wait four hours: moisture test | `release_lag` kind lab; family PA6; minutes 240 | Amina, QP-03 | Amina | active |
| R84 | Food-contact natural waits three hours: migration check | `release_lag` kind lab; product_code PPN-1020; minutes 180 | Amina, QP-12 | Amina | active |
| R85 | Glass-filled waits 150 minutes: ash test for glass content | `release_lag` kind lab; family PPG; minutes 150 | Amina, QP-03 | Amina | active |
| R86 | Transport to Codra Retail (Codra DC, Corbas): 6 hours before the promise date | `release_lag` kind transport; customer Codra Retail; minutes 360 | Logistics, carrier lead times 2026 | Stéphane | active |
| R87 | Transport to Duval Home (Orléans): 8 hours before the promise date | `release_lag` kind transport; customer Duval Home; minutes 480 | Logistics, carrier lead times 2026 | Stéphane | active |
| R88 | Transport to Bricoval (Lille): 10 hours before the promise date | `release_lag` kind transport; customer Bricoval; minutes 600 | Logistics, carrier lead times 2026 | Stéphane | active |
| R89 | Transport to Brisol Automotive (Montbéliard): 6 hours before the promise date | `release_lag` kind transport; customer Brisol Automotive; minutes 360 | Logistics, carrier lead times 2026 | Stéphane | active |
| R90 | Transport to Alvena Packaging (Lyon): 3 hours before the promise date | `release_lag` kind transport; customer Alvena Packaging; minutes 180 | Logistics, carrier lead times 2026 | Stéphane | active |
| R91 | Transport to Estrel Pipes (Toulouse): 9 hours before the promise date | `release_lag` kind transport; customer Estrel Pipes; minutes 540 | Logistics, carrier lead times 2026 | Stéphane | active |
| R92 | Transport to Kerno Electrics (Grenoble): 3 hours before the promise date | `release_lag` kind transport; customer Kerno Electrics; minutes 180 | Logistics, carrier lead times 2026 | Stéphane | active |
| R93 | Packing in big bags: one hour after release | `release_lag` kind packing; minutes 60 | Didier, packing hall | Didier | active |
| R108 | Codra orders finish at least 12 hours before the promise date | `release_lag` kind buffer; customer Codra Retail; minutes 720 | Hervé, 6 May: proposed, not validated by Corinne | Hervé | proposed |

## Line preference

| Id | Rule | Type and parameters | Source | Owner | Status |
|---|---|---|---|---|---|
| R94 | Orders of 30 t and more prefer M01, M02, M05: highest throughput, fewer stops | `line_preference` min_tonnes 30; lines M01 M02 M05; penalty 60 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R95 | Retail lots of 12 t and less prefer M07: quick-change die | `line_preference` max_tonnes 12; lines M07; penalty 40 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R96 | PA6 prefers M06: newer dryer connection | `line_preference` family PA6; lines M06; penalty 30 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R97 | Black prefers M01, M06, M07: keep black away from the light-color lines | `line_preference` family PPK; lines M01 M06 M07; penalty 40 | Corinne, rules workshop, 6 May 2026; Jean-Pierre N1 p.3 | Corinne | active |
| R98 | Natural prefers M02 and M03 | `line_preference` family PPN; lines M02 M03; penalty 30 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R99 | Codra prefers M05 and M07, its audit reference lines | `line_preference` customer Codra Retail; lines M05 M07; penalty 30 | Stéphane, 5 May | Stéphane | active |
| R100 | Glass for Brisol prefers M05 | `line_preference` customer Brisol Automotive; family PPG; lines M05; penalty 30 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R101 | White prefers M03 and M07 | `line_preference` family PPW; lines M03 M07; penalty 20 | Corinne, rules workshop, 6 May 2026 | Corinne | active |
| R109 | Duval prefers M03 for color stability | `line_preference` customer Duval Home; lines M03; penalty 40 | Amina, 6 May: proposed | Amina | proposed |
