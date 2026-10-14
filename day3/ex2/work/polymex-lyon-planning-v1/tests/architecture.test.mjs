// Acceptance tests for your architecture. Green when orchestrator.mjs and config/permissions.json are right. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../platform/store.mjs';
import * as O from '../architecture/orchestrator.mjs';

const ev1 = { event_id: 'E001', at: '2026-05-11 08:40', type: 'date_change', order_id: 'O59057', due: '2026-05-12 18:00' };

test('the long loop drafts, only Corinne publishes', async () => {
  store.reset();
  const d = await O.dailyRun({ now: '2026-05-11 05:30' });
  assert.equal(d.kind, 'long'); assert.ok(d.kpis.orders > 90);
  await assert.rejects(() => O.publish({ actor: 'human:stephane' }));
  await assert.rejects(() => O.publish({ actor: 'agent:event-reader' }));
  await assert.rejects(() => O.publish({ actor: 'service:long-solver' }));
  const p = await O.publish({ actor: 'human:corinne' });
  assert.ok(store.read('published')); assert.equal(store.read('draft'), null); assert.equal(p.published_by, 'human:corinne');
});
test('the short loop repairs and keeps the freeze', async () => {
  const before = store.read('published');
  const d = await O.onEvent({ event: ev1, actor: 'human:sylvie' });
  assert.equal(d.kind, 'short'); assert.ok(d.runtime_ms < 2000);
  const now = Date.parse('2026-05-11T08:40:00Z'), freeze = 240 * 60e3;
  const startsSoon = Object.values(before.timed).flat().filter((r) => r.start < now + freeze);
  for (const r of startsSoon) { const a = Object.values(d.timed).flat().find((x) => x.order_id === r.order_id); assert.equal(a.line, r.line, r.order_id + ' moved inside the freeze'); }
  assert.equal(store.read('events').find((e) => e.event_id === 'E001').status, 'applied');
});
test('an agent cannot confirm an event; Stéphane cannot confirm either', async () => {
  await assert.rejects(() => O.onEvent({ event: { ...ev1, event_id: 'E002' }, actor: 'agent:event-reader' }));
  await assert.rejects(() => O.onEvent({ event: { ...ev1, event_id: 'E003' }, actor: 'human:stephane' }));
});
test('what-if saves nothing', async () => {
  const s0 = JSON.stringify(store.read('state')), d0 = JSON.stringify(store.read('draft'));
  const r = await O.whatIf({ event: { at: '2026-05-11 11:00', type: 'rush_order', order_id: 'OW1', customer: 'Codra Retail', product_code: 'PPW-2010', tonnes: 18, due: '2026-05-14 12:00' }, actor: 'human:stephane' });
  assert.ok(r.order); assert.equal(typeof r.feasible, 'boolean');
  assert.equal(JSON.stringify(store.read('state')), s0); assert.equal(JSON.stringify(store.read('draft')), d0);
});
test('the SAP write-back stays off until Nadia enables it', async () => {
  await O.publish({ actor: 'human:corinne' });
  const { readAudit } = await import('../platform/harness/harness.mjs');
  assert.ok(readAudit(20).some((l) => l.what === 'sap.writeback.skipped'));
});
