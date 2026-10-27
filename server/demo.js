// Modo demo: genera datos creibles para ver el dashboard sin configurar nada.
import { addEvent, addSnapshot, events } from './store.js';
import { bus } from './poller.js';

const PRODUCTS = [
  { id: '1001', name: 'Steal $100K From Another Player!', price: 54 },
  { id: '1002', name: 'Make Player Lose $250K', price: 72 },
  { id: '1003', name: 'Steal $50K From A Player', price: 39 },
  { id: '1004', name: 'Halloween Pack!', price: 270 },
  { id: '1005', name: '700 cards', price: 129 },
  { id: '1006', name: 'Make Player Lose $50,000', price: 29 },
  { id: '1007', name: 'Galaxy Banner', price: 69 },
  { id: '1008', name: 'Steal $250K From Another Player', price: 76 },
  { id: '1009', name: 'Green Dragon Pet', price: 79 },
  { id: '1010', name: 'Wizard Outfit', price: 59 },
  { id: '1011', name: 'Flying Carpet', price: 94 },
];
const NAMES = ['xXDragonXx', 'noobmaster69', 'Lia_Plays', 'ElMatador', 'KingKota', 'ZeroTwo', 'Pixelito',
  'SrPapas', 'blox_queen', 'Tanjiro', 'Mateo_RBLX', 'VoidWalker', 'sofi123', 'TacoGamer'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const jitter = (v, p = 0.25) => Math.max(1, Math.round(v * (1 - p + Math.random() * 2 * p)));

/** Curva de actividad por hora (madrugada baja, tarde/noche alta). */
const curve = (h) => 0.25 + 0.75 * Math.sin(Math.max(0, (h - 6)) / 18 * Math.PI) ** 1.5;

let visits = 674_410;
let playing = 303;

export function seedDemo() {
  if (events().length) return; // ya hay historial
  const now = Date.now();
  const days = 21;
  let v = visits - 180_000;
  for (let d = days; d >= 0; d--) {
    for (let h = 0; h < 24; h++) {
      const ts = now - (d * 24 + (23 - h)) * 3600_000;
      if (ts > now) continue;
      const intensity = curve(h) * (1 + (days - d) / days);
      const sales = Math.round(jitter(4.6 * intensity, 0.5));
      for (let i = 0; i < sales; i++) {
        const p = pick(PRODUCTS);
        const uid = 100000 + Math.floor(Math.random() * 60);
        // Mismo userId -> mismo nombre, para que el ranking se vea coherente.
        addEvent({
          id: `demo-${ts}-${i}`,
          ts: Math.min(now - 1000, ts + Math.floor(Math.random() * 3600_000)),
          userId: String(uid),
          username: NAMES[uid % NAMES.length],
          productId: p.id,
          productName: p.name,
          robux: p.price,
          source: 'demo',
        });
      }
      v += Math.round(jitter(620 * intensity, 0.4));
      addSnapshot({
        ts,
        universeId: 'demo',
        name: 'Game Of Life',
        playing: Math.round(jitter(300 * intensity, 0.3)),
        visits: v,
        favorites: 9_841,
        likes: 880 + (days - d) * 7,
        dislikes: 1_531 + (days - d) * 4,
        pendingRobux: 12_400,
        balance: 48_920,
      });
    }
  }
  visits = v;
}

export function startDemo() {
  seedDemo();

  setInterval(() => {
    const p = pick(PRODUCTS);
    const uid = 100000 + Math.floor(Math.random() * 60);
    const row = addEvent({
      ts: Date.now(),
      userId: String(uid),
      username: NAMES[uid % NAMES.length],
      productId: p.id,
      productName: p.name,
      robux: p.price,
      source: 'demo',
    });
    if (row) bus.emit('purchase', row);
  }, 4000 + Math.random() * 6000);

  setInterval(() => {
    playing = Math.max(40, Math.round(playing + (Math.random() - 0.48) * 18));
    visits += Math.round(Math.random() * 30);
    const snap = addSnapshot({
      universeId: 'demo',
      name: 'Game Of Life',
      playing,
      visits,
      favorites: 9_841,
      likes: 884,
      dislikes: 1_533,
      pendingRobux: 12_400,
      balance: 48_920,
    });
    bus.emit('snapshot', snap);
  }, 15_000);
}
