import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';

const EVENTS = resolve(config.dataDir, 'events.ndjson');
const SNAPSHOTS = resolve(config.dataDir, 'snapshots.ndjson');
const STATE = resolve(config.dataDir, 'state.json');

const MAX_EVENTS = 50_000;      // en memoria
const MAX_SNAPSHOTS = 20_000;   // ~2 semanas a 1/min

/** @type {{events: any[], snapshots: any[], state: any, seen: Set<string>}} */
const db = { events: [], snapshots: [], state: {}, seen: new Set() };

function readNdjson(file, limit) {
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const slice = lines.slice(-limit);
  const out = [];
  for (const line of slice) {
    try { out.push(JSON.parse(line)); } catch { /* linea corrupta: se ignora */ }
  }
  return out;
}

export function initStore() {
  if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
  db.events = readNdjson(EVENTS, MAX_EVENTS);
  db.snapshots = readNdjson(SNAPSHOTS, MAX_SNAPSHOTS);
  db.state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
  for (const e of db.events) if (e.id) db.seen.add(e.id);
}

export function getState(key, fallback = null) {
  return key in db.state ? db.state[key] : fallback;
}

export function setState(key, value) {
  db.state[key] = value;
  writeFileSync(STATE, JSON.stringify(db.state, null, 2));
}

/**
 * Guarda una compra. Devuelve false si ya existia (dedupe por id).
 * Forma: { id, ts, userId, username, productId, productName, robux, source, kind }
 */
export function addEvent(event) {
  const id = String(event.id ?? `${event.ts}-${event.userId}-${event.productId}-${event.robux}`);
  if (db.seen.has(id)) return false;
  const row = {
    id,
    ts: Number(event.ts) || Date.now(),
    userId: event.userId != null ? String(event.userId) : null,
    username: event.username || null,
    productId: event.productId != null ? String(event.productId) : null,
    productName: event.productName || 'Producto',
    robux: Math.max(0, Math.round(Number(event.robux) || 0)),
    kind: event.kind || 'DeveloperProduct',
    source: event.source || 'ingest',
  };
  db.seen.add(id);
  db.events.push(row);
  if (db.events.length > MAX_EVENTS) db.events.splice(0, db.events.length - MAX_EVENTS);
  appendFileSync(EVENTS, JSON.stringify(row) + '\n');
  return row;
}

export function addSnapshot(snap) {
  const row = { ts: Date.now(), ...snap };
  db.snapshots.push(row);
  if (db.snapshots.length > MAX_SNAPSHOTS) db.snapshots.splice(0, db.snapshots.length - MAX_SNAPSHOTS);
  appendFileSync(SNAPSHOTS, JSON.stringify(row) + '\n');
  return row;
}

/** Borra el último evento de una fuente (para el botón de deshacer). */
export function removeLastBySource(source) {
  for (let i = db.events.length - 1; i >= 0; i--) {
    if (db.events[i].source !== source) continue;
    const [removed] = db.events.splice(i, 1);
    db.seen.delete(removed.id);
    // El NDJSON es append-only: lo reescribimos entero (son pocos miles de líneas).
    writeFileSync(EVENTS, db.events.map((e) => JSON.stringify(e)).join('\n') + '\n');
    return removed;
  }
  return null;
}

export const events = () => db.events;
export const snapshots = () => db.snapshots;
export const lastSnapshot = () => db.snapshots[db.snapshots.length - 1] || null;
