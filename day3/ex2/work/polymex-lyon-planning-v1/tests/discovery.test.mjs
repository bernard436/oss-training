// Tests for the discovery import: CSVs from the three throwaway apps become findings that only Corinne can validate.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../platform/store.mjs';
import { compile } from '../platform/rules/engine.mjs';
import * as D from '../architecture/discovery.mjs';

const CO = `line,from_product,to_product,start,end,minutes,scrap_kg
M01,PPK-4010,PPN-1010,2026-06-01T06:00:00Z,2026-06-01T09:00:00Z,180,40
M01,PPK-4010,PPN-1010,2026-06-03T06:00:00Z,2026-06-03T09:10:00Z,190,35
M01,PPK-4010,PPN-1010,2026-06-05T06:00:00Z,2026-06-05T08:50:00Z,170,30
M02,PPC-3110 blue,PPC-3120 red,2026-06-02T06:00:00Z,2026-06-02T07:00:00Z,60,8`;
const NIGHT = 'at,line,reason\n' + Array.from({ length: 20 }, (_, i) => `2026-06-0${(i % 9) + 1}T23:00:00Z,M0${(i % 7) + 1},${i < 9 ? 'Material missing' : i < 15 ? 'Breakdown' : 'Crew short'}`).join('\n');
const MAT = `supplier,material,promised,arrived,gap_days,checks
Supplier A,Masterbatch blue,2026-06-01,2026-06-03,2,
Supplier A,Masterbatch red,2026-06-04,2026-06-06,2,
Supplier A,Masterbatch blue,2026-06-08,2026-06-09,1,
Supplier B,PP homopolymer,2026-06-02,2026-06-02,0,`;

test('a changeover CSV gives one rule proposal per pair measured 3 times, and the rule is active once Corinne validates', () => {
  store.reset();
  const r = D.importCsv({ actor: 'human:sylvie', csv: CO });
  assert.equal(r.kind, 'changeover');
  const { findings } = D.listDiscovery({ actor: 'human:corinne' });
  const f = findings.find((x) => x.about.startsWith('PPK-4010 → PPN-1010'));
  assert.equal(f.status, 'to validate'); assert.equal(f.proposal.params.minutes, 180);
  assert.equal(findings.find((x) => x.about.startsWith('PPC-3110')).status, 'not enough data');
  assert.throws(() => D.decideFinding({ actor: 'human:sylvie', id: f.id, decision: 'validate' }));
  const v = D.decideFinding({ actor: 'human:corinne', id: f.id, decision: 'validate' });
  assert.ok(v.rule_id);
  const R = compile(store.read('rules'), store.read('products'));
  assert.equal(R.changeover('PPK-4010', 'PPN-1010', 'M01').minutes, 180);
});

test('night swaps are ranked, and a validated cause lands in Feedback', () => {
  D.importCsv({ actor: 'human:kevin', csv: NIGHT });
  const f = D.listDiscovery({ actor: 'human:corinne' }).findings.filter((x) => x.kind === 'night_swap');
  assert.equal(f[0].about, 'Material missing'); assert.equal(f[0].evidence.share_pct, 45);
  const v = D.decideFinding({ actor: 'human:corinne', id: f[0].id, decision: 'validate' });
  assert.ok((store.read('feedback') || []).find((x) => x.id === v.feedback_id && x.kind === 'discovery'));
});

test('material arrivals give the gap per supplier, and purging keeps only decided findings', () => {
  D.importCsv({ actor: 'human:sylvie', csv: MAT });
  const f = D.listDiscovery({ actor: 'human:corinne' }).findings.filter((x) => x.kind === 'material');
  const a = f.find((x) => x.about === 'Supplier A (supplier)');
  assert.equal(a.evidence.avg_gap_days, 1.7); assert.equal(a.status, 'to validate');
  assert.equal(f.find((x) => x.about === 'Supplier B (supplier)').status, 'not enough data');
  assert.throws(() => D.purgeRaw({ actor: 'human:kevin' }));
  D.purgeRaw({ actor: 'human:corinne' });
  const d = D.listDiscovery({ actor: 'human:corinne' });
  assert.ok(d.imports.every((i) => !i.raw_kept));
  assert.ok(d.findings.every((x) => ['validated', 'rejected'].includes(x.status)));
});

test('an unknown CSV is refused', () => {
  assert.throws(() => D.importCsv({ actor: 'human:sylvie', csv: 'a,b\n1,2' }), /Unknown CSV/);
});
