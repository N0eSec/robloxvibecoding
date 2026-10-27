# Guía de configuración

Todo esto es opcional: el dashboard arranca sin nada con `npm run demo`.
Activa las fuentes que te interesen.

---

## 1. Datos públicos (visitas, jugadores, likes) — 1 minuto

Es lo más fácil y no necesita permisos.

1. Abre tu juego en Roblox. La URL es `https://www.roblox.com/games/<PLACE_ID>/nombre`.
2. Copia ese número en `.env`:

```
PLACE_ID=1234567890
```

El servidor resuelve solo el `universeId` llamando a
`https://apis.roblox.com/universes/v1/places/<PLACE_ID>/universe`.
Si ya lo sabes, ponlo directo en `UNIVERSE_ID` y se salta ese paso.

Con esto el dashboard ya muestra: jugando ahora, visitas totales, visitas por día
(calculadas por diferencia entre lecturas), pico de jugadores, favoritos y like ratio.

> El contador de "visitas hoy" necesita que el servidor lleve un rato encendido:
> se calcula restando el total de visitas al principio y al final del día.

---

## 2. Feed de compras en tiempo real — recomendado

Esta es la parte que hace que el dashboard se sienta vivo, y además es la fuente
**más precisa**: cada compra llega en segundos, con el nombre del jugador y del producto.

### a) Inventa un secreto

```
INGEST_SECRET=una-frase-larga-que-solo-tu-sepas-9f2k
```

### b) Pega el script en tu juego

1. Studio → **ServerScriptService** → nuevo `Script`.
2. Copia el contenido de `roblox-script/DashboardTelemetry.server.lua`.
3. Cambia arriba `SECRET` (igual al `INGEST_SECRET`) y `DASHBOARD_URL`.
4. **Game Settings → Security → Allow HTTP Requests: ON**.

⚠️ Si tu juego **ya tiene** un `MarketplaceService.ProcessReceipt`, pon
`INSTALL_PROCESS_RECEIPT = false` y, dentro del tuyo, añade:

```lua
_G.DashboardReport(player, receipt.ProductId, receipt.CurrencySpent)
```

Si dejas los dos, el del dashboard pisa al tuyo y los jugadores pagarían sin recibir
el producto.

### c) Que Roblox pueda llegar a tu PC

Los servidores de Roblox están en internet y tu dashboard en `localhost`, así que
necesitas un túnel:

```bash
ngrok http 8787
# te da algo como https://a1b2c3.ngrok-free.app
```

Pon esa URL en `DASHBOARD_URL` dentro del script. Alternativas: `cloudflared tunnel
--url http://localhost:8787`, o un VPS.

En **Studio** (botón Play) basta con `http://localhost:8787`, sin túnel.

### d) Comprueba que llega

```bash
curl -X POST http://localhost:8787/api/ingest \
  -H "x-ingest-secret: TU_SECRETO" \
  -H "content-type: application/json" \
  -d '{"userId":"1","username":"Prueba","productId":"9","productName":"Test","robux":100}'
```

Debe responder `{"ok":true,"saved":1}` y aparecer al instante en el Live Feed.

---

## 3. Economy API (ventas reales, pendientes, saldo)

Roblox **no tiene** una API pública y oficial de ingresos para desarrolladores. Los
endpoints que usa la propia web de creators funcionan con la cookie de tu sesión:

- `GET economy.roblox.com/v2/users/{userId}/transactions?transactionType=Sale`
- `GET economy.roblox.com/v2/users/{userId}/transaction-totals?timeFrame=Day&transactionType=summary`
- `GET economy.roblox.com/v1/users/{userId}/currency`
- Para grupos, lo mismo con `/groups/{groupId}/…` más
  `GET economy.roblox.com/v1/groups/{groupId}/revenue/summary/{Day|Week|Month|Year}`

### Sacar la cookie

1. Entra a roblox.com con la cuenta **dueña del juego**.
2. F12 → Application → Cookies → `https://www.roblox.com` → `.ROBLOSECURITY`.
3. Copia el valor completo (empieza con `_|WARNING:-DO-NOT-SHARE-THIS…`) en `.env`.

```
ROBLOSECURITY=_|WARNING:-DO-NOT-SHARE-THIS...
ROBLOX_USER_ID=123456        # si el juego es tuyo
# ROBLOX_GROUP_ID=7654321    # si es de un grupo (usa este en vez del user)
```

**Esa cookie es tu cuenta entera.** No la subas a GitHub, no la pegues en Discord y no
expongas el servidor a internet. Si se filtra: Roblox → Configuración → cerrar sesión
en todos los dispositivos (invalida la cookie). Mejor aún, actívala solo cuando uses
el dashboard.

Estos endpoints son internos: Roblox puede cambiarlos sin aviso. Si uno falla, el
dashboard sigue funcionando con las demás fuentes y lo verás en `/api/health`.

---

## 4. Open Cloud Analytics (opcional)

API oficial con key, en beta. Da métricas agregadas (DAU, retención, ingresos por
plataforma), no compras individuales ni jugadores en vivo.

1. create.roblox.com → **Credentials** → Create API Key.
2. Añade tu experiencia en Access Permissions y activa `universe.analytics:read`.
3. Guarda la key en `OPENCLOUD_API_KEY`.

El cliente está en `server/roblox/opencloud.js` (`queryMetric('DailyActiveUsers', …)`).
La consulta es asíncrona: devuelve una operación que el cliente sondea hasta que
termina. Como es beta, el formato puede cambiar; por eso está aislado del resto.

---

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| Todo en `—` | falta `PLACE_ID`/`UNIVERSE_ID`, o el server lleva < 1 minuto |
| "Visitas hoy" vacío | hacen falta al menos 2 lecturas del día; espera unos minutos |
| El feed no se mueve | el script no llega a tu PC: revisa el túnel y `Allow HTTP Requests` |
| `401` en `/api/ingest` | el `SECRET` del script no coincide con `INGEST_SECRET` |
| Economy da `401`/`403` | la cookie caducó (cerraste sesión) o el `userId`/`groupId` no es el dueño |
| `/api/health` muestra errores | ahí sale el mensaje exacto de cada fuente |
