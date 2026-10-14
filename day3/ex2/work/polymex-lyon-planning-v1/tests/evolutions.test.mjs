// Tests for the evolutions aligned with "What good looks like": goal banner, answer time, promise.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../platform/store.mjs';
import * as O from '../architecture/orchestrator.mjs';

test('the goal shows the five measures and the guardrails', async () => {
  store.reset();
  await O.dailyRun({ now: '2026-05-11 05:30' });
  await O.publish({ actor: 'human:corinne' });
  const g = await O.goalStatus({ actor: 'human:corinne' });
  assert.equal(g.measures.length, 5);
  assert.equal(typeof g.measures[0].value, 'number');
  assert.ok(g.guardrails.find((x) => x.label.startsWith('Changeovers')).value <= 4);
});
test('an answer time is recorded, and Kevin may not record one', async () => {
  const d = await O.onEvent({ event: { event_id: 'E001', at: '2026-05-11 08:40', type: 'date_change', order_id: 'O59057', due: '2026-05-12 23:00' }, actor: 'human:sylvie' });
  assert.ok(d.moved_24h >= 0);
  await assert.rejects(() => O.answerEvent({ event_id: 'E001', answered_at: '2026-05-11 09:10', actor: 'human:kevin' }));
  const e = await O.answerEvent({ event_id: 'E001', answered_at: '2026-05-11 09:10', actor: 'human:stephane' });
  assert.equal(e.answer_hours, 0.5);
  const g = await O.goalStatus({ actor: 'human:corinne' });
  assert.equal(g.measures.find((m) => m.id === 'answer_time').value, 0.5);
});
test('a promise gives the earliest date that holds and changes no plan', async () => {
  const s0 = JSON.stringify(store.read('state')), p0 = JSON.stringify(store.read('published'));
  const p = await O.promise({ request: { customer: 'Codra Retail', product_code: 'PPW-2010', tonnes: 18, wished: '2026-05-14 12:00', at: '2026-05-11 11:00' }, actor: 'human:stephane' });
  assert.ok(p.promised_due); assert.ok(p.lead_days > 0);
  assert.equal(JSON.stringify(store.read('state')), s0); assert.equal(JSON.stringify(store.read('published')), p0);
  await assert.rejects(() => O.promise({ request: { customer: 'Codra Retail', product_code: 'PPW-2010', tonnes: 18, wished: '2026-05-14 12:00', at: '2026-05-11 11:00' }, actor: 'human:kevin' }));
});
