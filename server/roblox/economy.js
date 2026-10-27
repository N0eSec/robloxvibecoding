// Economy API: requiere la cookie .ROBLOSECURITY de la cuenta dueña del juego.
// Son endpoints privados de Roblox (los mismos que usa la web de creator):
// pueden cambiar sin aviso, por eso cada llamada se aisla y el dashboard
// sigue funcionando con las demas fuentes si una falla.
import { getJson } from './http.js';
import { config } from '../config.js';

const cookieHeader = () => ({ Cookie: `.ROBLOSECURITY=${config.cookie}` });

export const hasEconomy = () => Boolean(config.cookie && (config.userId || config.groupId));

function owner() {
  return config.groupId
    ? { scope: 'groups', id: config.groupId }
    : { scope: 'users', id: config.userId };
}

/**
 * Ventas recientes. Pagina hasta `maxPages` o hasta encontrar `stopAtId`.
 * Devuelve eventos normalizados listos para store.addEvent().
 */
export async function recentSales({ maxPages = 3, stopAtId = null } = {}) {
  const { scope, id } = owner();
  const out = [];
  let cursor = '';
  for (let page = 0; page < maxPages; page++) {
    const url =
      `https://economy.roblox.com/v2/${scope}/${id}/transactions` +
      `?transactionType=Sale&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await getJson(url, { headers: cookieHeader() });
    const rows = data?.data || [];
    let hitStop = false;
    for (const t of rows) {
      const txId = String(t.id ?? t.purchaseToken ?? '');
      if (stopAtId && txId === String(stopAtId)) { hitStop = true; break; }
      out.push({
        id: `tx-${txId}`,
        ts: t.created ? Date.parse(t.created) : Date.now(),
        userId: t.agent?.id != null ? String(t.agent.id) : null,
        username: t.agent?.name || null,
        productId: t.details?.id != null ? String(t.details.id) : null,
        productName: t.details?.name || 'Producto',
        robux: Math.max(0, Math.round(Number(t.currency?.amount) || 0)),
        kind: t.details?.type || 'Sale',
        source: 'economy',
        pending: Boolean(t.isPending),
      });
    }
    cursor = data?.nextPageCursor || '';
    if (hitStop || !cursor || !rows.length) break;
  }
  return out;
}

/** Totales agregados de Roblox (Day | Week | Month | Year). */
export async function transactionTotals(timeFrame = 'Day') {
  const { scope, id } = owner();
  const url = `https://economy.roblox.com/v2/${scope}/${id}/transaction-totals?timeFrame=${timeFrame}&transactionType=summary`;
  const d = await getJson(url, { headers: cookieHeader() });
  if (!d) return null;
  return {
    timeFrame,
    salesTotal: Number(d.salesTotal) || 0,
    purchasesTotal: Number(d.purchasesTotal) || 0,
    pendingRobuxTotal: Number(d.pendingRobuxTotal) || 0,
    commissionsTotal: Number(d.commissionsTotal) || 0,
    premiumPayoutsTotal: Number(d.premiumPayoutsTotal) || 0,
    groupPayoutsTotal: Number(d.groupPayoutsTotal) || 0,
    currencyPurchasesTotal: Number(d.currencyPurchasesTotal) || 0,
  };
}

/** Resumen de ingresos del grupo (solo grupos). */
export async function groupRevenueSummary(timeFrame = 'Day') {
  if (!config.groupId) return null;
  const url = `https://economy.roblox.com/v1/groups/${config.groupId}/revenue/summary/${timeFrame}`;
  return getJson(url, { headers: cookieHeader() });
}

/** Saldo actual de Robux. */
export async function currentBalance() {
  const { scope, id } = owner();
  const url = `https://economy.roblox.com/v1/${scope}/${id}/currency`;
  const d = await getJson(url, { headers: cookieHeader() });
  return d ? Number(d.robux) || 0 : null;
}
