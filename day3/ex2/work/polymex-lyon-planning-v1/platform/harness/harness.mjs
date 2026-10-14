import { fileURLToPath } from 'node:url';
// Polymex platform: harness. Permissions, audit trail and secrets. Every tool call and every write goes through here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PERMS = path.join(ROOT, 'config/permissions.json');
const AUDIT = path.join(ROOT, '.state/audit.jsonl');

export class PermissionError extends Error { constructor(m) { super(m); this.status = 403; } }

let cache = null, mtime = 0;
export function permissions() {
  const st = fs.statSync(PERMS);
  if (!cache || st.mtimeMs !== mtime) { cache = JSON.parse(fs.readFileSync(PERMS, 'utf8')); mtime = st.mtimeMs; }
  return cache;
}

// guard('human:corinne', 'write', 'plan:published') throws unless the actor holds the grant.
// Grants are "read:<resource>" / "write:<resource>" / "call:<tool>"; "*" in a resource matches anything after it.
export function guard(actor, action, resource) {
  const p = permissions();
  if (p.kill_switch?.engaged) throw new PermissionError('Kill switch engaged by ' + (p.kill_switch.owner || 'IT') + ': every write and every tool call is refused.');
  const a = p.actors?.[actor];
  if (!a) throw new PermissionError('Unknown actor ' + actor);
  if (a.enabled === false) throw new PermissionError(actor + ' is disabled');
  const want = action + ':' + resource;
  const ok = (a.grants || []).some((g) => g === want || (g.endsWith('*') && want.startsWith(g.slice(0, -1))));
  if (!ok) throw new PermissionError(actor + ' may not ' + action + ' ' + resource);
  return true;
}

export function requiresHuman(gate) {
  const g = permissions().gates?.[gate];
  return g ? g.approvers : null;
}

export function audit(actor, what, payload = {}) {
  fs.mkdirSync(path.dirname(AUDIT), { recursive: true });
  const line = { at: new Date().toISOString(), actor, what, payload, hash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 12) };
  fs.appendFileSync(AUDIT, JSON.stringify(line) + '\n');
  return line;
}
export function readAudit(n = 200) {
  if (!fs.existsSync(AUDIT)) return [];
  return fs.readFileSync(AUDIT, 'utf8').trim().split('\n').filter(Boolean).slice(-n).map((l) => JSON.parse(l)).reverse();
}

// Secrets are read from the environment only. Never from a file in the repository.
export function secret(name) {
  const v = process.env[name];
  if (!v) return null;
  return v;
}

// Remove what must not leave the plant in a prompt: email addresses and phone numbers.
export function redact(text) {
  return String(text).replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').replace(/(\+33|0)[1-9](?:[\s.-]?\d{2}){4}/g, '[phone]');
}
