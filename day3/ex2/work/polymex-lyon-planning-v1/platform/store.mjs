import { fileURLToPath } from 'node:url';
// Polymex platform: store. JSON files in .state/, initialised from data/ by `npm run reset`.
// One owner per fact: orders and lines come from the SAP connector, rules from the rules registry, events and plans from the orchestrator.
import fs from 'node:fs';
import path from 'node:path';
import { readProducts, readOrders, readLines, readRules } from './connectors/connectors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, '.state');
const f = (n) => path.join(DIR, n + '.json');

export function reset() {
  fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
  write('products', readProducts());
  write('state', { horizon_start: '2026-05-11 06:00', lines: readLines(), orders: readOrders() });
  write('rules', readRules());
  write('events', []); write('execution', []); write('overrides', []);
  write('published', null); write('draft', null);
}
export function read(name) { if (!fs.existsSync(f('state'))) reset(); return fs.existsSync(f(name)) ? JSON.parse(fs.readFileSync(f(name), 'utf8')) : null; }
export function write(name, v) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(f(name), JSON.stringify(v, null, 1)); return v; }
export function nextId(prefix, list) { const n = list.map((x) => parseInt(String(x.id || x.event_id || '').replace(/\D/g, ''), 10) || 0); return prefix + String(Math.max(0, ...n) + 1).padStart(prefix === 'R' ? 2 : 3, '0'); }
