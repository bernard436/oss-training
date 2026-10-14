// Vercel function: runs the Lyon Planner v1 (day3/ex2/work/polymex-lyon-planning-v1) online, as a DEMO.
// The app keeps its data in files. On Vercel only /tmp is writable, so at cold start the app is copied to /tmp and runs
// from there, unchanged (platform/ is not edited). Data lives as long as the instance: it resets now and then.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'day3/ex2/work/polymex-lyon-planning-v1');
const DST = path.join(process.env.PLANNER_TMP || '/tmp', 'polymex-v1');
let app;

async function load() {
  if (app) return app;
  if (!fs.existsSync(path.join(DST, 'app/server.mjs'))) {
    fs.cpSync(SRC, DST, { recursive: true, filter: (s) => !/[\\/](\.state|out|node_modules|\.env)([\\/]|$)/.test(s) });
  }
  app = await import(pathToFileURL(path.join(DST, 'app/server.mjs')).href);
  return app;
}

export default async function handler(req, res) {
  const { handle } = await load();
  const u = new URL(req.url, 'http://x');
  const route = u.searchParams.get('route'); u.searchParams.delete('route');
  const pathname = route === '__ui' ? '/' : route ? '/api/' + route : u.pathname;
  const qs = u.searchParams.toString();
  req.url = pathname + (qs ? '?' + qs : '');
  return handle(req, res);
}
