// Comprueba que el dashboard puede leer tu juego: node scripts/check.mjs
import { config } from '../server/config.js';
import * as pub from '../server/roblox/public.js';
import * as eco from '../server/roblox/economy.js';

const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => console.log(`  ❌ ${m}`);
const info = (m) => console.log(`     ${m}`);

console.log('\n── Comprobando configuración ──\n');

let universeId = config.universeId;

if (!universeId && !config.placeId) {
  bad('No hay PLACE_ID ni UNIVERSE_ID en tu .env');
  info('Copia .env.example a .env y pon el número que sale en la URL de tu juego.');
  process.exit(1);
}

if (!universeId) {
  try {
    universeId = await pub.universeFromPlace(config.placeId);
    ok(`placeId ${config.placeId} → universeId ${universeId}`);
  } catch (err) {
    bad(`No pude resolver el placeId ${config.placeId}: ${err.message}`);
    info('¿El número es correcto? Es el de https://www.roblox.com/games/<AQUI>/nombre');
    process.exit(1);
  }
}

try {
  const d = await pub.universeDetails(universeId);
  if (!d) throw new Error('respuesta vacía');
  ok(`Juego encontrado: "${d.name}" de ${d.creator} (${d.creatorType})`);
  info(`visitas: ${d.visits.toLocaleString('es-MX')} · jugando ahora: ${d.playing} · favoritos: ${d.favorites.toLocaleString('es-MX')}`);
  if (d.creatorType === 'Group') {
    info(`Es de un grupo. Para las ventas usa ROBLOX_GROUP_ID=${d.creatorId} en el .env.`);
  } else {
    info(`Es de tu cuenta. Para las ventas usa ROBLOX_USER_ID=${d.creatorId} en el .env.`);
  }
} catch (err) {
  bad(`API pública falló: ${err.message}`);
}

try {
  const v = await pub.universeVotes(universeId);
  if (v) ok(`Likes ${v.likes.toLocaleString('es-MX')} · dislikes ${v.dislikes.toLocaleString('es-MX')} (${(v.ratio * 100).toFixed(1)}%)`);
} catch (err) {
  bad(`Votos: ${err.message}`);
}

console.log('');
if (config.ingestSecret) ok('INGEST_SECRET configurado (feed en vivo listo)');
else info('⚪ Sin INGEST_SECRET: no habrá feed de compras en vivo (ver docs/SETUP.md paso 2)');

if (eco.hasEconomy()) {
  try {
    const totals = await eco.transactionTotals('Day');
    ok(`Economy API OK · ventas hoy: ${(totals?.salesTotal ?? 0).toLocaleString('es-MX')} R$ · pendiente: ${(totals?.pendingRobuxTotal ?? 0).toLocaleString('es-MX')} R$`);
  } catch (err) {
    bad(`Economy API: ${err.message}`);
    info('La cookie pudo caducar, o el ROBLOX_USER_ID / ROBLOX_GROUP_ID no es el dueño del juego.');
  }
} else {
  info('⚪ Sin cookie: no habrá Robux pendientes ni saldo (ver docs/SETUP.md paso 3)');
}

console.log('\nListo. Arranca con:  npm start   →  http://localhost:' + config.port + '\n');
