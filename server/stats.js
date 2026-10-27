import { config } from './config.js';
import { events, snapshots, lastSnapshot } from './store.js';

const HOUR = 3600_000;
const DAY = 86_400_000;

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const since = (ms) => events().filter((e) => e.ts >= Date.now() - ms);

/** Inicio del dia local en ms. */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function goal() {
  const from = config.goalStart ? Date.parse(`${config.goalStart}T00:00:00`) : 0;
  const counted = events().filter((e) => e.ts >= from);
  const earned = sum(counted, (e) => e.robux);
  const target = config.goalRobux;
  const pct = target ? Math.min(100, (earned / target) * 100) : 0;

  // Ritmo de los ultimos 7 dias para estimar la fecha de llegada.
  const week = sum(since(7 * DAY), (e) => e.robux);
  const perDay = week / 7;
  const remaining = Math.max(0, target - earned);
  const daysLeft = perDay > 0 ? remaining / perDay : null;

  return {
    target,
    earned,
    remaining,
    pct,
    perDay: Math.round(perDay),
    etaDays: daysLeft == null ? null : Math.ceil(daysLeft),
    etaDate: daysLeft == null ? null : new Date(Date.now() + daysLeft * DAY).toISOString(),
    since: config.goalStart || null,
  };
}

export function overview() {
  const snap = lastSnapshot() || {};
  const today = events().filter((e) => e.ts >= startOfToday());
  const prevDay = events().filter((e) => e.ts >= Date.now() - 2 * DAY && e.ts < Date.now() - DAY);
  const last24 = since(DAY);

  const robuxToday = sum(today, (e) => e.robux);
  const robuxPrev = sum(prevDay, (e) => e.robux);

  return {
    game: {
      name: snap.name || config.gameName,
      icon: snap.icon || null,
      universeId: config.universeId || snap.universeId || null,
    },
    playing: snap.playing ?? null,
    visits: snap.visits ?? null,
    visitsToday: visitsDelta(startOfToday()),
    visitsLast24h: visitsDelta(Date.now() - DAY),
    favorites: snap.favorites ?? null,
    likes: snap.likes ?? null,
    dislikes: snap.dislikes ?? null,
    likeRatio: snap.likes != null && snap.dislikes != null && snap.likes + snap.dislikes > 0
      ? snap.likes / (snap.likes + snap.dislikes)
      : null,
    peakToday: peakPlaying(startOfToday()),
    robuxToday,
    robuxYesterday: robuxPrev,
    robuxDeltaPct: robuxPrev > 0 ? ((robuxToday - robuxPrev) / robuxPrev) * 100 : null,
    robuxLast24h: sum(last24, (e) => e.robux),
    robuxAllTime: sum(events(), (e) => e.robux),
    salesToday: today.length,
    salesLast24h: last24.length,
    pendingRobux: snap.pendingRobux ?? null,
    balance: snap.balance ?? null,
    visitsPerSale: snap.visits && events().length ? Math.round(snap.visits / events().length) : null,
    arpu: visitsDelta(startOfToday()) > 0 ? robuxToday / visitsDelta(startOfToday()) : null,
    updatedAt: snap.ts || null,
  };
}

/** Visitas acumuladas en una ventana, a partir del contador total de los snapshots. */
function visitsDelta(fromTs) {
  const rows = snapshots().filter((s) => s.visits != null);
  if (rows.length < 2) return null;
  const inside = rows.filter((s) => s.ts >= fromTs);
  if (inside.length < 2) return null;
  return Math.max(0, inside[inside.length - 1].visits - inside[0].visits);
}

function peakPlaying(fromTs) {
  const rows = snapshots().filter((s) => s.ts >= fromTs && s.playing != null);
  return rows.length ? Math.max(...rows.map((s) => s.playing)) : null;
}

export function feed(limit = 60) {
  return events()
    .slice(-limit)
    .reverse()
    .map((e) => ({ ...e, ago: Date.now() - e.ts }));
}

export function spenders(limit = 25, windowMs = 30 * DAY) {
  const map = new Map();
  for (const e of since(windowMs)) {
    if (!e.userId) continue;
    const row = map.get(e.userId) || { userId: e.userId, username: e.username, robux: 0, purchases: 0, lastTs: 0 };
    row.robux += e.robux;
    row.purchases += 1;
    row.username = row.username || e.username;
    row.lastTs = Math.max(row.lastTs, e.ts);
    map.set(e.userId, row);
  }
  return [...map.values()].sort((a, b) => b.robux - a.robux).slice(0, limit);
}

export function products(windowMs = 30 * DAY) {
  const map = new Map();
  for (const e of since(windowMs)) {
    const key = e.productId || e.productName;
    const row = map.get(key) || { productId: e.productId, name: e.productName, robux: 0, sales: 0 };
    row.robux += e.robux;
    row.sales += 1;
    map.set(key, row);
  }
  const list = [...map.values()].sort((a, b) => b.robux - a.robux);
  const total = sum(list, (p) => p.robux) || 1;
  return list.map((p) => ({ ...p, share: (p.robux / total) * 100, avg: Math.round(p.robux / p.sales) }));
}

/** Serie por horas de las ultimas `hours` horas. */
export function hourly(hours = 24) {
  const now = Date.now();
  const base = Math.floor(now / HOUR) * HOUR;
  const buckets = [];
  for (let i = hours - 1; i >= 0; i--) {
    const start = base - i * HOUR;
    buckets.push({ ts: start, label: new Date(start).getHours() + 'h', robux: 0, sales: 0, players: null });
  }
  const index = new Map(buckets.map((b, i) => [b.ts, i]));
  for (const e of events()) {
    const key = Math.floor(e.ts / HOUR) * HOUR;
    const i = index.get(key);
    if (i != null) { buckets[i].robux += e.robux; buckets[i].sales += 1; }
  }
  for (const s of snapshots()) {
    if (s.playing == null) continue;
    const i = index.get(Math.floor(s.ts / HOUR) * HOUR);
    if (i != null) buckets[i].players = Math.max(buckets[i].players ?? 0, s.playing);
  }
  return buckets;
}

/** Serie por dias de los ultimos `days` dias. */
export function daily(days = 30) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const ts = start.getTime() - i * DAY;
    buckets.push({
      ts,
      label: new Date(ts).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }),
      robux: 0,
      sales: 0,
      visits: null,
      peak: null,
    });
  }
  const index = new Map(buckets.map((b, i) => [b.ts, i]));
  const dayKey = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

  for (const e of events()) {
    const i = index.get(dayKey(e.ts));
    if (i != null) { buckets[i].robux += e.robux; buckets[i].sales += 1; }
  }
  const byDay = new Map();
  for (const s of snapshots()) {
    const k = dayKey(s.ts);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(s);
  }
  for (const [k, rows] of byDay) {
    const i = index.get(k);
    if (i == null) continue;
    const withVisits = rows.filter((r) => r.visits != null);
    if (withVisits.length >= 2) {
      buckets[i].visits = Math.max(0, withVisits[withVisits.length - 1].visits - withVisits[0].visits);
    }
    const withPlaying = rows.filter((r) => r.playing != null);
    if (withPlaying.length) buckets[i].peak = Math.max(...withPlaying.map((r) => r.playing));
  }
  return buckets;
}

/** Serie de jugadores online para la grafica grande. */
export function playersSeries(hours = 24) {
  const from = Date.now() - hours * HOUR;
  return snapshots()
    .filter((s) => s.ts >= from && s.playing != null)
    .map((s) => ({ ts: s.ts, playing: s.playing }));
}
