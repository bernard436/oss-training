// The platform's own tests. Green from the start. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, timeLine, parseTime } from '../platform/rules/engine.mjs';
import { longSolve } from '../platform/solvers/long_solver.mjs';
import { fastRepair, applyEvent } from '../platform/solvers/fast_solver.mjs';
import { readProducts, readOrders, readLines, readRules } from '../platform/connectors/connectors.mjs';

const products = readProducts(), rules = readRules();
const R = compile(rules, products);
const o = (id, p, t, due = '2026-05-20 06:00', customer = 'Alvena Packaging') => ({ order_id: id, product_code: p, tonnes: t, due, customer });

test('changeover table: black to natural 240, natural to black 30, same product 0', () => {
  assert.equal(R.changeover('PPK-4010', 'PPN-1010').minutes, 240);
  assert.equal(R.changeover('PPN-1010', 'PPK-4010').minutes, 30);
  assert.equal(R.changeover('PPN-1010', 'PPN-1010').minutes, 0);
  assert.equal(R.changeover('PPC-3110', 'PPC-3120').minutes, 45); // R10, product override
  assert.equal(R.changeover('PPW-2010', 'PPC-3110', 'M07').minutes, 25); // R26, line override
  assert.equal(R.changeover('PPW-2010', 'PPC-3110', 'M01').minutes, 40); // R01
});
test('R02: glass-filled to white is forbidden', () => assert.equal(R.changeover('PPG-5030', 'PPW-2010').forbidden, true));
test('rule register: at least 100 rules, each with a source and an owner', () => {
  assert.ok(rules.length >= 100);
  for (const r of rules) { assert.ok(r.source, r.id + ' has no source'); assert.ok(r.owner, r.id + ' has no owner'); }
});
test('R03, R04: capabilities', () => {
  assert.equal(R.canRun(o('a', 'PPG-5030', 10), 'M04').ok, false);
  assert.equal(R.canRun(o('a', 'PPG-5030', 10), 'M05').ok, true);
  assert.equal(R.canRun(o('a', 'PA6-6010', 10), 'M01').ok, false);
});
test('R07: black to natural waits for Saturday 06:00', () => {
  const rows = timeLine('M01', [o('a', 'PPK-4010', 2), o('b', 'PPN-1010', 2)], R, { start: parseTime('2026-05-12 06:00'), initialProduct: 'PPK-4010' });
  assert.equal(rows[1].co_start, parseTime('2026-05-16 06:00'));
});
test('long solver: every order planned, no hard violation, deterministic', () => {
  const state = { horizon_start: '2026-05-11 06:00', lines: readLines(), orders: readOrders() };
  const a = longSolve(state, R, { timeBudgetMs: 20000 }), b = longSolve(state, R, { timeBudgetMs: 20000 }); // converges well before the budget
  assert.equal(Object.values(a.seqs).flat().length, state.orders.length);
  assert.equal(a.violations.filter((v) => ['R02', 'R03', 'R04'].includes(v.rule)).length, 0);
  assert.deepEqual(a.seqs, b.seqs);
});
test('fast solver: frozen orders do not move', () => {
  const state = { horizon_start: '2026-05-11 06:00', lines: readLines(), orders: readOrders() };
  const plan = longSolve(state, R, { timeBudgetMs: 1000 });
  const ev = { type: 'machine_down', line: 'M02', from: '2026-05-11 10:00', to: '2026-05-11 14:00', event_id: 'T1' };
  const a = applyEvent(state, ev); const R2 = compile([...rules, ...a.rulesAdded], products);
  const r = fastRepair(plan, a.state, R2, { now: '2026-05-11 09:20', changed: a.changed, removed: a.removed, linesAffected: a.linesAffected });
  for (const id of r.frozen) { const before = Object.values(plan.timed).flat().find((x) => x.order_id === id); const after = Object.values(r.timed).flat().find((x) => x.order_id === id); assert.equal(after.line, before.line); }
  assert.ok(r.runtime_ms < 2000);
});
