// Open Cloud Analytics (beta): metricas oficiales con API key.
// Crea la key en create.roblox.com -> Credentials, añade tu experiencia y
// activa el permiso universe.analytics:read.
// La consulta es asincrona: devuelve una Operation que hay que sondear.
import { getJson } from './http.js';
import { config } from '../config.js';

export const hasOpenCloud = () => Boolean(config.openCloudKey && config.universeId);

const headers = () => ({ 'x-api-key': config.openCloudKey, 'Content-Type': 'application/json' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} metric  p.ej. DailyActiveUsers, Visits, Revenue, AverageSessionLength, D1Retention
 * @param {object} opts    { granularity: 'OneDay'|'OneHour', startTime, endTime, breakdown: [] }
 */
export async function queryMetric(metric, {
  granularity = 'OneDay',
  startTime,
  endTime,
  breakdown = [],
} = {}) {
  const body = JSON.stringify({
    metric,
    granularity,
    startTime: startTime || new Date(Date.now() - 7 * 864e5).toISOString(),
    endTime: endTime || new Date().toISOString(),
    ...(breakdown.length ? { breakdown } : {}),
  });

  const op = await getJson(
    `https://apis.roblox.com/analytics/v1/universes/${config.universeId}:executeQuery`,
    { method: 'POST', headers: headers(), body },
  );

  if (op?.done) return normalize(op.response);

  // Sondeo de la operacion (maximo ~30s).
  const path = op?.path;
  if (!path) return [];
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const polled = await getJson(`https://apis.roblox.com/cloud/v2/${path}`, { headers: headers() });
    if (polled?.done) return normalize(polled.response);
  }
  return [];
}

function normalize(response) {
  const out = [];
  for (const value of response?.values || []) {
    const label = (value.breakdowns || []).map((b) => `${b.key ?? b.dimension}:${b.value}`).join(' / ') || 'total';
    for (const dp of value.dataPoints || []) {
      out.push({ label, ts: Date.parse(dp.startTime || dp.time || 0) || null, value: Number(dp.value) || 0 });
    }
  }
  return out;
}
