// Lyon Planner server: one shared instance for a team. No dependencies. Node 18 or later.
// npm start, then open http://localhost:3000 on every laptop of the team (or http://<your-ip>:3000).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const core = require('./public/core.js');

const PORT = +(process.env.PORT || 3000);
const FILE = path.join(__dirname, 'state.json');
const PUB = path.join(__dirname, 'public');
let state = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : core.initial();
if (!state.scorecard) state.scorecard = JSON.parse(JSON.stringify(core.DEFAULT_SCORECARD));
const save = () => fs.writeFileSync(FILE, JSON.stringify(state));
save();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' };
const send = (res, code, v) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
const body = (req) => new Promise((ok, ko) => { let s = ''; req.on('data', (c) => (s += c)); req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { ko(e); } }); });
const plan = () => state.draft || state.published;

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  try {
    if (p === '/api/health') return send(res, 200, { ok: true, version: state.version });
    if (p === '/api/state') return send(res, 200, { state });
    if (p === '/api/op' && req.method === 'POST') {
      const { op, actor, args } = await body(req);
      const t0 = Date.now(); state = core.apply(state, op, actor, args); save();
      console.log(new Date().toISOString().slice(11, 19), actor, op, (Date.now() - t0) + ' ms');
      return send(res, 200, { state });
    }
    if (p === '/api/reset' && req.method === 'POST') { state = core.initial(); save(); return send(res, 200, { ok: true }); }
    // Read-only API for your own code: plug a script, a notebook or an agent on the same data.
    if (p === '/api/plan') { const x = plan(); return send(res, 200, x ? core.ENG.toRows(x) : []); }
    if (p === '/api/kpis') { const x = plan(); return send(res, 200, x ? { label: x.label, kpis: x.kpis, violations: x.violations } : null); }
    if (p === '/api/rules') return send(res, 200, state.rules);
    if (p === '/api/orders') return send(res, 200, state.orders);
    if (p === '/api/events') return send(res, 200, state.events);
    if (p === '/api/feedback') return send(res, 200, state.feedback);
    if (p === '/api/evals') return send(res, 200, state.evals.map((e) => ({ ...e, scorecard: core.scoreAgainst(e, state.scorecard) })));
    if (p === '/api/scorecard') return send(res, 200, state.scorecard);
    if (p === '/api/audit') return send(res, 200, state.audit);
    let f = p === '/' ? 'index.html' : decodeURIComponent(p.slice(1));
    const fp = path.join(PUB, path.normalize(f).replace(/^(\.\.[\\/])+/, ''));
    if (fp.startsWith(PUB) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(fp)] || 'application/octet-stream' }); return fs.createReadStream(fp).pipe(res); }
    res.writeHead(404); res.end('Not found');
  } catch (e) { send(res, e.status || 400, { error: e.message }); }
}).listen(PORT, () => console.log('Lyon Planner on http://localhost:' + PORT + '  (state in state.json; npm run reset to start again)'));
