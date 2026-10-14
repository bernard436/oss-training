# Platform issues

What you think is wrong or missing in `platform/`, with the evidence. The platform team reads this file; you do not patch the platform.

| Tool | What we saw | Why it matters on the floor | What we did meanwhile |
|---|---|---|---|
| | | | |
| Model gateway (`harness/llm.mjs`) | `callForTool` only accepts tools listed in `platform/tools.json`; the ontology assistant needs a `propose_change` tool | The assistant cannot propose model changes through the platform gateway | `architecture/llm_ext.mjs` mirrors the gateway (guard on role and tool, redaction, forced tool use, audit) with `architecture/tools_ext.json`. Please add `propose_change` to the platform registry so we can delete our copy |
