// Endpoints publicos de Roblox: no necesitan cookie ni API key.
// Verificados contra los dominios publicos games./thumbnails./apis.roblox.com.
// Si Roblox cambia un endpoint, cada funcion falla sola sin tumbar el resto.
import { getJson } from './http.js';

/** placeId -> universeId */
export async function universeFromPlace(placeId) {
  const data = await getJson(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
  return data?.universeId ? String(data.universeId) : null;
}

/** Datos del universo: nombre, visitas totales, jugando ahora, favoritos, creador. */
export async function universeDetails(universeId) {
  const data = await getJson(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
  const g = data?.data?.[0];
  if (!g) return null;
  return {
    universeId: String(g.id),
    rootPlaceId: g.rootPlaceId != null ? String(g.rootPlaceId) : null,
    name: g.name,
    description: g.description,
    playing: Number(g.playing) || 0,
    visits: Number(g.visits) || 0,
    favorites: Number(g.favoritedCount) || 0,
    maxPlayers: Number(g.maxPlayers) || 0,
    created: g.created,
    updated: g.updated,
    creator: g.creator?.name || null,
    creatorType: g.creator?.type || null,
    creatorId: g.creator?.id != null ? String(g.creator.id) : null,
  };
}

/** Likes / dislikes. */
export async function universeVotes(universeId) {
  const data = await getJson(`https://games.roblox.com/v1/games/votes?universeIds=${universeId}`);
  const v = data?.data?.[0];
  if (!v) return null;
  const up = Number(v.upVotes) || 0;
  const down = Number(v.downVotes) || 0;
  return { likes: up, dislikes: down, ratio: up + down ? up / (up + down) : 0 };
}

/** Icono del juego (para la cabecera del dashboard). */
export async function universeIcon(universeId) {
  const data = await getJson(
    `https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=256x256&format=Png&isCircular=false`,
  );
  return data?.data?.[0]?.imageUrl || null;
}

/** Nombres de usuario en lote: [{id, name, displayName}] */
export async function usersByIds(userIds) {
  const ids = [...new Set(userIds.map(Number).filter(Boolean))].slice(0, 100);
  if (!ids.length) return [];
  const data = await getJson('https://users.roblox.com/v1/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userIds: ids, excludeBannedUsers: false }),
  });
  return (data?.data || []).map((u) => ({
    id: String(u.id),
    name: u.name,
    displayName: u.displayName || u.name,
  }));
}

/** Avatares en lote: { userId: url } */
export async function avatarsByIds(userIds) {
  const ids = [...new Set(userIds.map(Number).filter(Boolean))].slice(0, 100);
  if (!ids.length) return {};
  const data = await getJson(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${ids.join(',')}&size=150x150&format=Png&isCircular=true`,
  );
  const out = {};
  for (const row of data?.data || []) if (row.imageUrl) out[String(row.targetId)] = row.imageUrl;
  return out;
}

/** Info de un developer product / gamepass para enriquecer el feed. */
export async function developerProductInfo(productId) {
  const data = await getJson(`https://apis.roblox.com/developer-products/v1/developer-products/${productId}`);
  return data ? { name: data.Name || data.name, price: data.PriceInRobux ?? data.priceInRobux } : null;
}
