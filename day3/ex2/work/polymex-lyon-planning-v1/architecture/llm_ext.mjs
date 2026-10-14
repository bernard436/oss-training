// Our own model gateway for tools that are not in platform/tools.json (see PLATFORM_ISSUES.md).
// Same guarantees as platform/harness/llm.mjs: guard on role and tool, redaction, forced tool use, audit line. No secret in files.
import fs from 'node:fs';
import { guard, audit, secret, redact } from '../platform/harness/harness.mjs';

const cfg = () => JSON.parse(fs.readFileSync(new URL('../config/llm.json', import.meta.url), 'utf8'));
const TOOLS = () => JSON.parse(fs.readFileSync(new URL('./tools_ext.json', import.meta.url), 'utf8'));

export const hasKey = () => !!secret('ANTHROPIC_API_KEY');

export async function callExtTool({ actor, role, system, user, tool }) {
  guard(actor, 'call', 'llm:' + role);
  guard(actor, 'call', 'tool:' + tool);
  const key = secret('ANTHROPIC_API_KEY');
  if (!key) throw Object.assign(new Error('No ANTHROPIC_API_KEY in the environment.'), { status: 503 });
  const c = cfg(); const model = c.models?.[role] || c.default_model; const def = TOOLS().find((t) => t.name === tool);
  const body = { model, max_tokens: c.max_tokens || 1024, system, tools: [def], tool_choice: { type: 'tool', name: tool }, messages: [{ role: 'user', content: redact(user) }] };
  const t0 = Date.now();
  const res = await fetch(c.endpoint || 'https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
  const j = await res.json();
  if (!res.ok) { audit(actor, 'llm.error', { role, model, status: res.status, error: j.error?.message }); throw new Error('Model call failed: ' + (j.error?.message || res.status)); }
  const use = (j.content || []).find((b) => b.type === 'tool_use');
  audit(actor, 'llm.call', { role, model, tool, ms: Date.now() - t0, input_tokens: j.usage?.input_tokens, output_tokens: j.usage?.output_tokens });
  if (!use) throw new Error('The model did not call ' + tool);
  return use.input;
}
