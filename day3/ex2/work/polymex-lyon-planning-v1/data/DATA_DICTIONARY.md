# Data dictionary

All times are plant local time, written `YYYY-MM-DD HH:MM`. Week 20 runs from Monday 11 May 2026 06:00 to Monday 18 May 06:00. Shifts: A 06:00 to 14:00, B 14:00 to 22:00, C 22:00 to 06:00.

- `sap_open_orders_w20.csv`: the open orders from SAP on Monday 06:00. `due` is the promise date to the customer; `available_from` is when the material is there, empty if it is.
- `lines_state_2026-05-11.json`: for each line, the product running at 06:00 and when the line is free for the next order.
- `products.csv`: product code, family (PPN natural, PPW white, PPC colored, PPK black, PPG glass-filled, PA6 polyamide), color.
- `rules.json`: the rule register after the rules workshop of 6 May: 110 rules in twelve categories, 101 active, 4 proposed, 5 retired, each with a source and an owner. R01 is the changeover matrix from Corinne's whiteboard. `RULES_REGISTER.md` is the same register, readable.
- `due` is the promise date at the customer's site. The lab, packing and transport times between the end of production and that date are rules (category Release and transport).
- `corinne_plan_w20_v1.csv`: Corinne's Friday plan for week 20, version 1, from her workbook. The same orders.
- `inbox/2026-05-11/`: Monday's messages to the planning mailbox and the phone notes Sylvie typed.
- `replay/events_2026-05-11.jsonl`: the same nine events, structured and checked by Sylvie, for `npm run replay`.
- Run rate: 2.02 t per hour on every line (2.30 ideal, 88% performance), unless a rule says otherwise.
