# Robux Dashboard

Dashboard local y en tiempo real para tu juego de Roblox: visitas, jugadores online,
ventas, top spenders, productos y una **meta de Robux** (por defecto 300,000 R$).

Inspirado en los dashboards que salen en TikTok/Reels, pero tuyo, sin pagar nada y con
los datos guardados en tu propia máquina.

## Arranque en 30 segundos (modo demo)

```bash
node --version      # necesitas Node 18.17 o más nuevo
npm run demo        # o: DEMO=1 node server/index.js
```

Abre http://localhost:8787 y verás el dashboard completo con datos de ejemplo.
No necesita `npm install`: **cero dependencias**.

## Conectarlo a tu juego de verdad

```bash
cp .env.example .env
# edita .env y pon al menos PLACE_ID o UNIVERSE_ID
npm start
```

Hay 3 fuentes de datos y puedes usar las que quieras. Cuantas más actives, más completo:

| Fuente | Qué te da | Qué necesitas |
|---|---|---|
| **API pública** | visitas, jugando ahora, favoritos, likes/dislikes, icono | solo el `PLACE_ID` |
| **Script en el juego** | feed de compras **en tiempo real** (nombre del jugador y del producto) | pegar `roblox-script/DashboardTelemetry.server.lua` + `INGEST_SECRET` |
| **Economy API** | ventas reales, Robux pendientes, saldo | tu cookie `.ROBLOSECURITY` |
| **Open Cloud** (opcional) | métricas oficiales (DAU, retención) | una API key |

Guía paso a paso, incluido cómo sacar el `universeId`, la cookie y el túnel para que
Roblox pueda hablar con tu PC: **[docs/SETUP.md](docs/SETUP.md)**.

## La meta

En `.env`:

```
GOAL_ROBUX=300000
GOAL_START=2026-10-01   # opcional: desde cuándo cuenta
```

El dashboard calcula el porcentaje, lo que falta, tu ritmo de los últimos 7 días y
**la fecha estimada en la que llegas a la meta**.

## Cómo está hecho

```
server/
  index.js        servidor HTTP + rutas + SSE (sin Express)
  config.js       lee .env
  store.js        persistencia en NDJSON (events + snapshots)
  stats.js        todas las agregaciones (meta, feed, spenders, hourly, daily)
  poller.js       sondeo periódico de las APIs de Roblox
  demo.js         generador de datos para el modo demo
  roblox/
    public.js     endpoints públicos (games, votes, thumbnails, users)
    economy.js    endpoints con cookie (transacciones, totales, saldo)
    opencloud.js  Open Cloud Analytics con API key
public/           el dashboard (HTML + CSS + JS, gráficas SVG a mano)
roblox-script/    el Script que va dentro de tu juego
```

Los datos viven en `data/*.ndjson`. Bórralos y empiezas de cero.

## API del servidor

| Ruta | Devuelve |
|---|---|
| `GET /api/overview` | KPIs + meta |
| `GET /api/feed?limit=80` | últimas compras |
| `GET /api/spenders?days=30` | top spenders |
| `GET /api/products?days=30` | ranking de productos |
| `GET /api/hourly?hours=24` | serie por hora |
| `GET /api/daily?days=30` | serie por día |
| `GET /api/players?hours=24` | jugadores online |
| `GET /api/stream` | SSE en vivo (`purchase`, `snapshot`) |
| `GET /api/health` | estado y errores de cada fuente |
| `POST /api/ingest` | ingesta desde el juego (cabecera `x-ingest-secret`) |

## Seguridad

- El servidor escucha en local. **No lo expongas a internet** tal cual: la cookie de
  Roblox y tus números estarían detrás.
- `.env` y `data/` están en `.gitignore`. Nunca subas tu `.ROBLOSECURITY`: quien la
  tenga entra a tu cuenta. Si se te escapa, cierra sesión en todos los dispositivos
  desde la configuración de Roblox para invalidarla.
- La ruta de ingesta compara el secreto en tiempo constante y rechaza cuerpos > 256 KB.
