import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

import { config, configSummary } from './config.js';
import { initStore, addEvent, events, snapshots, removeLastBySource } from './store.js';
import { bus, startPolling, status } from './poller.js';
import { startDemo } from './demo.js';
import * as stats from './stats.js';

initStore();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const json = (res, data, code = 200) => {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};

function secretMatches(given) {
  if (!config.ingestSecret) return false;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(config.ingestSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { fail(new Error('body demasiado grande')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

// ───────── SSE ─────────
const clients = new Set();

function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch { clients.delete(res); }
  }
}
bus.on('purchase', (row) => broadcast('purchase', row));
bus.on('snapshot', (row) => broadcast('snapshot', { ...row, overview: stats.overview(), goal: stats.goal() }));

function sse(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });
  res.write(`retry: 3000\n\n`);
  clients.add(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* cerrado */ } }, 25_000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
}

// ───────── estaticos ─────────
function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = resolve(join(config.publicDir, normalize(rel)));
  if (!file.startsWith(config.publicDir) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
    return;
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}

// ───────── rutas ─────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  const q = (k, d) => Number(url.searchParams.get(k)) || d;

  try {
    if (p === '/api/ingest' && req.method === 'POST') {
      if (!secretMatches(req.headers['x-ingest-secret'])) return json(res, { error: 'secreto invalido' }, 401);
      const body = JSON.parse((await readBody(req)) || '{}');
      const list = Array.isArray(body) ? body : Array.isArray(body.purchases) ? body.purchases : [body];
      const saved = [];
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const row = addEvent({ ...item, source: 'ingest' });
        if (row) { saved.push(row); bus.emit('purchase', row); }
      }
      return json(res, { ok: true, saved: saved.length });
    }

    // Alta manual de Robux desde el botón del dashboard. Sin secreto: solo local.
    if (p === '/api/manual' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      const robux = Math.round(Number(body.robux));
      if (!Number.isFinite(robux) || robux < 1 || robux > 10_000_000) {
        return json(res, { error: 'cantidad inválida (1 a 10,000,000)' }, 400);
      }
      const row = addEvent({
        ts: Date.now(),
        username: body.note?.trim() || 'Registro manual',
        productName: body.note?.trim() || 'Robux añadidos a mano',
        robux,
        kind: 'Manual',
        source: 'manual',
      });
      if (row) bus.emit('purchase', row);
      return json(res, { ok: true, event: row, goal: stats.goal() });
    }

    if (p === '/api/manual/undo' && req.method === 'POST') {
      const removed = removeLastBySource('manual');
      bus.emit('snapshot', { ts: Date.now() });
      return json(res, { ok: Boolean(removed), removed, goal: stats.goal() });
    }

    if (p === '/api/stream') return sse(req, res);

    if (p.startsWith('/api/')) {
      switch (p) {
        case '/api/config':   return json(res, configSummary());
        case '/api/overview': return json(res, { overview: stats.overview(), goal: stats.goal() });
        case '/api/goal':     return json(res, stats.goal());
        case '/api/feed':     return json(res, stats.feed(q('limit', 60)));
        case '/api/spenders': return json(res, stats.spenders(q('limit', 25), q('days', 30) * 864e5));
        case '/api/products': return json(res, stats.products(q('days', 30) * 864e5));
        case '/api/hourly':   return json(res, stats.hourly(q('hours', 24)));
        case '/api/daily':    return json(res, stats.daily(q('days', 30)));
        case '/api/players':  return json(res, stats.playersSeries(q('hours', 24)));
        case '/api/health':
          return json(res, {
            ok: true,
            demo: config.demo,
            status,
            counts: { events: events().length, snapshots: snapshots().length, sseClients: clients.size },
          });
        default: return json(res, { error: 'ruta no encontrada' }, 404);
      }
    }

    return serveStatic(req, res, p);
  } catch (err) {
    console.error(err);
    return json(res, { error: err.message }, 500);
  }
});

server.listen(config.port, () => {
  const s = configSummary();
  console.log(`\n  ${s.gameName} — dashboard en http://localhost:${config.port}`);
  console.log(`  meta: ${s.goalRobux.toLocaleString('es-MX')} R$`);
  console.log(`  fuentes: ${Object.entries(s.sources).filter(([, v]) => v).map(([k]) => k).join(', ') || 'ninguna'}${config.demo ? ' (MODO DEMO)' : ''}\n`);
  if (config.demo) startDemo(); else startPolling();
});
