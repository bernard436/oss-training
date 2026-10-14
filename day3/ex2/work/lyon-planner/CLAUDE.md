# Context for Claude Code

This is the Lyon Planner, a working planning system for a fictional plant, used in FDE School. Read README.md.

- Do not change `public/engine.js`: it is the platform. Extend through `public/core.js` (operations and permissions) or through the read-only API.
- Every new operation checks a grant with `need(s, actor, grant)` and writes an audit line with `log(...)`.
- Sequencing and feasibility are computed by the engine, never by a model.
- Keep the state JSON-serializable: the server writes it to state.json after every operation.
