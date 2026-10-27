import { EventEmitter } from 'node:events';
import { config } from './config.js';
import { addEvent, addSnapshot, getState, setState, lastSnapshot } from './store.js';
import * as pub from './roblox/public.js';
import * as eco from './roblox/economy.js';

export const bus = new EventEmitter();
bus.setMaxListeners(100);

export const status = {
  universeId: config.universeId || null,
  lastPublicOk: null,
  lastEconomyOk: null,
  errors: {},
};

function fail(source, err) {
  status.errors[source] = { message: err?.message || String(err), at: Date.now() };
  console.warn(`[${source}] ${err?.message || err}`);
}
function ok(source) {
  delete status.errors[source];
  if (source === 'public') status.lastPublicOk = Date.now();
  if (source === 'economy') status.lastEconomyOk = Date.now();
}

async function resolveUniverse() {
  if (status.universeId) return status.universeId;
  if (!config.placeId) return null;
  try {
    status.universeId = await pub.universeFromPlace(config.placeId);
    console.log(`universeId resuelto desde placeId: ${status.universeId}`);
  } catch (err) {
    fail('public', err);
  }
  return status.universeId;
}

let iconCache = null;

async function pollPublic() {
  const universeId = await resolveUniverse();
  if (!universeId) return;
  try {
    const [details, votes] = await Promise.all([
      pub.universeDetails(universeId),
      pub.universeVotes(universeId).catch(() => null),
    ]);
    if (!details) return;
    if (iconCache === null) iconCache = await pub.universeIcon(universeId).catch(() => null);

    const snap = addSnapshot({
      universeId,
      name: details.name,
      icon: iconCache,
      playing: details.playing,
      visits: details.visits,
      favorites: details.favorites,
      likes: votes?.likes ?? null,
      dislikes: votes?.dislikes ?? null,
      pendingRobux: lastSnapshot()?.pendingRobux ?? null,
      balance: lastSnapshot()?.balance ?? null,
    });
    ok('public');
    bus.emit('snapshot', snap);
  } catch (err) {
    fail('public', err);
  }
}

async function pollEconomy() {
  if (!eco.hasEconomy()) return;
  try {
    const stopAtId = getState('lastTxId');
    const sales = await eco.recentSales({ maxPages: stopAtId ? 2 : 5, stopAtId });
    // Van de mas nuevo a mas viejo: insertamos en orden cronologico.
    const fresh = [];
    for (const sale of sales.slice().reverse()) {
      const row = addEvent(sale);
      if (row) fresh.push(row);
    }
    if (sales.length) setState('lastTxId', String(sales[0].id).replace(/^tx-/, ''));
    for (const row of fresh) bus.emit('purchase', row);

    const [totals, balance] = await Promise.all([
      eco.transactionTotals('Day').catch(() => null),
      eco.currentBalance().catch(() => null),
    ]);
    if (totals || balance != null) {
      const { ts: _prevTs, ...prev } = lastSnapshot() || {};
      const snap = addSnapshot({
        ...prev,
        pendingRobux: totals?.pendingRobuxTotal ?? prev.pendingRobux ?? null,
        salesTotalDay: totals?.salesTotal ?? null,
        balance: balance ?? prev.balance ?? null,
      });
      bus.emit('snapshot', snap);
    }
    ok('economy');
  } catch (err) {
    fail('economy', err);
  }
}

export function startPolling() {
  if (config.demo) return;
  pollPublic();
  pollEconomy();
  setInterval(pollPublic, config.pollPublicSec * 1000);
  setInterval(pollEconomy, config.pollEconomySec * 1000);
}
