import { fileURLToPath } from 'node:url';
// Polymex platform: connectors. Read-only, from the exports Nadia agreed: SAP open orders, line states, products, the rules registry, the planning mailbox.
// In the plant these read SAP through the reporting user and the shared folder. In the lab they read data/.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const D = (p) => path.join(ROOT, 'data', p);

export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...r] = rows.filter((x) => x.length > 1 || x[0]);
  return r.map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] ?? ''])));
}
export const readProducts = () => parseCsv(fs.readFileSync(D('products.csv'), 'utf8'));
export const readOrders = () => parseCsv(fs.readFileSync(D('sap_open_orders_w20.csv'), 'utf8')).map((o) => ({ ...o, tonnes: +o.tonnes }));
export const readLines = () => JSON.parse(fs.readFileSync(D('lines_state_2026-05-11.json'), 'utf8'));
export const readRules = () => JSON.parse(fs.readFileSync(D('rules.json'), 'utf8'));
export const readHumanPlan = () => parseCsv(fs.readFileSync(D('corinne_plan_w20_v1.csv'), 'utf8'));
export function readInbox(day = '2026-05-11') {
  const dir = D('inbox/' + day); if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort().map((f) => ({ id: f.replace('.txt', ''), text: fs.readFileSync(path.join(dir, f), 'utf8') }));
}
