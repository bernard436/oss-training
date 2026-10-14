import { fileURLToPath } from 'node:url';
// Polymex platform: model gateway. The only place that talks to a language model.
// Structured output through tool use, redaction before sending, an audit line per call, the model chosen in config/llm.json.
import fs from 'node:fs';
import path from 'node:path';
import { guard, audit, secret, redact } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cfg = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'config/llm.json'), 'utf8'));
const TOOLS = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'platform/tools.json'), 'utf8'));

// Ask a model to answer by calling exactly one tool from the registry. Returns the tool input (an object), or throws.
export async function callForTool({ actor, role, system, user, tool }) {
  guard(actor, 'call', 'llm:' + role);
  guard(actor, 'call', 'tool:' + tool);
  const key = secret('ANTHROPIC_API_KEY');
  if (!key) throw Object.assign(new Error('No ANTHROPIC_API_KEY in the environment. Use the manual form, or export the key in your shell.'), { status: 503 });
  const c = cfg(); const model = c.models?.[role] || c.default_model;
  const def = TOOLS().find((t) => t.name === tool);
  if (!def) throw new Error('Tool not in platform/tools.json: ' + tool);
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
