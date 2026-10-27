import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// .env minimalista: KEY=VALUE, # comentarios, comillas opcionales.
function loadDotenv() {
  const file = resolve(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotenv();

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  port: num(process.env.PORT, 8787),
  // --demo funciona igual en Windows (CMD/PowerShell) que en Mac/Linux.
  demo: process.env.DEMO === '1' || process.env.DEMO === 'true' || process.argv.includes('--demo'),

  gameName: process.env.GAME_NAME || 'Mi Juego',
  universeId: (process.env.UNIVERSE_ID || '').trim(),
  placeId: (process.env.PLACE_ID || '').trim(),

  goalRobux: num(process.env.GOAL_ROBUX, 300000),
  goalStart: (process.env.GOAL_START || '').trim(),

  ingestSecret: (process.env.INGEST_SECRET || '').trim(),

  cookie: (process.env.ROBLOSECURITY || '').trim(),
  userId: (process.env.ROBLOX_USER_ID || '').trim(),
  groupId: (process.env.ROBLOX_GROUP_ID || '').trim(),

  openCloudKey: (process.env.OPENCLOUD_API_KEY || '').trim(),

  pollPublicSec: num(process.env.POLL_PUBLIC_SEC, 60),
  pollEconomySec: num(process.env.POLL_ECONOMY_SEC, 120),

  dataDir: resolve(ROOT, 'data'),
  publicDir: resolve(ROOT, 'public'),
};

export function configSummary() {
  return {
    gameName: config.gameName,
    universeId: config.universeId || null,
    goalRobux: config.goalRobux,
    goalStart: config.goalStart || null,
    demo: config.demo,
    sources: {
      publicApi: Boolean(config.universeId || config.placeId),
      ingest: Boolean(config.ingestSecret),
      economy: Boolean(config.cookie && (config.userId || config.groupId)),
      openCloud: Boolean(config.openCloudKey && config.universeId),
    },
  };
}
