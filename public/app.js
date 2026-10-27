const $ = (id) => document.getElementById(id);
const api = (path, init) => fetch(path, init).then((r) => r.json());

const nf = new Intl.NumberFormat('es-MX');
const fmt = (n) => (n == null || Number.isNaN(n) ? '—' : nf.format(Math.round(n)));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return 'ahora';
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Anima un número de su valor actual al nuevo. */
const counters = new WeakMap();
function count(el, value, suffix = '') {
  if (!el) return;
  if (value == null || Number.isNaN(value)) { el.textContent = '—'; counters.set(el, 0); return; }
  const from = counters.get(el) ?? 0;
  const to = Math.round(value);
  counters.set(el, to);
  if (from === to) { el.textContent = fmt(to) + suffix; return; }
  const dur = Math.min(900, 240 + Math.abs(to - from) * 0.4);
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const eased = 1 - (1 - k) ** 3;
    el.textContent = fmt(from + (to - from) * eased) + suffix;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ───────────────────────── gráficas (SVG propio) ─────────────────────────
const W = 1000;

const defs = `<defs>
  <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#4fe3ab"/><stop offset="100%" stop-color="#1f7f66"/>
  </linearGradient>
  <linearGradient id="barHot" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#9d8cff"/><stop offset="100%" stop-color="#4a3fa8"/>
  </linearGradient>
  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="rgba(53,215,154,.38)"/><stop offset="100%" stop-color="rgba(53,215,154,0)"/>
  </linearGradient>
</defs>`;

function grid(max, h, pad) {
  let out = '';
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ((h - pad.t - pad.b) * i) / 4;
    out += `<line class="gridline" x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}"/>`
         + `<text class="axis" x="2" y="${y - 5}">${fmt(max * (1 - i / 4))}</text>`;
  }
  return out;
}

function barChart(el, data, { height = 300, labelEvery = 1, key = 'robux' } = {}) {
  if (!data?.length) { el.innerHTML = '<p class="empty">Sin datos todavía</p>'; return; }
  const pad = { t: 16, r: 6, b: 28, l: 6 };
  const max = Math.max(1, ...data.map((d) => d[key] || 0));
  const plotH = height - pad.t - pad.b;
  const step = (W - pad.l - pad.r) / data.length;
  const bw = Math.max(3, step * 0.58);
  const best = data.reduce((a, b) => ((b[key] || 0) > (a[key] || 0) ? b : a), data[0]);

  let out = '';
  data.forEach((d, i) => {
    const v = d[key] || 0;
    const h = Math.max(v > 0 ? 3 : 1, (v / max) * plotH);
    const x = pad.l + i * step + (step - bw) / 2;
    const y = pad.t + plotH - h;
    out += `<g class="bar"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"
      rx="${Math.min(5, bw / 2).toFixed(1)}" fill="url(#${d === best && v > 0 ? 'barHot' : 'bar'})"
      style="animation-delay:${(i * 14)}ms"><title>${esc(d.label)} · ${fmt(v)} R$</title></rect></g>`;
    if (i % labelEvery === 0) {
      out += `<text class="axis" x="${(x + bw / 2).toFixed(1)}" y="${height - 9}" text-anchor="middle">${esc(d.label)}</text>`;
    }
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${height}" preserveAspectRatio="none">${defs}${grid(max, height, pad)}${out}</svg>`;
}

function areaChart(el, points, { height = 300, key = 'playing' } = {}) {
  if (!points || points.length < 2) {
    el.innerHTML = '<p class="empty">Recolectando datos… deja el servidor encendido unos minutos</p>';
    return;
  }
  const pad = { t: 16, r: 6, b: 26, l: 6 };
  const max = Math.max(1, ...points.map((p) => p[key] || 0));
  const plotH = height - pad.t - pad.b;
  const t0 = points[0].ts;
  const span = Math.max(1, points.at(-1).ts - t0);
  const X = (ts) => pad.l + ((ts - t0) / span) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + plotH - (v / max) * plotH;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.ts).toFixed(1)},${Y(p[key]).toFixed(1)}`).join('');
  const area = `${line}L${X(points.at(-1).ts).toFixed(1)},${pad.t + plotH}L${X(t0).toFixed(1)},${pad.t + plotH}Z`;
  const last = points.at(-1);

  const ticks = [0, .25, .5, .75, 1].map((f) => {
    const ts = t0 + span * f;
    return `<text class="axis" x="${X(ts).toFixed(1)}" y="${height - 7}" text-anchor="middle">${String(new Date(ts).getHours()).padStart(2, '0')}:00</text>`;
  }).join('');

  el.innerHTML = `<svg viewBox="0 0 ${W} ${height}" preserveAspectRatio="none">${defs}${grid(max, height, pad)}
    <path d="${area}" fill="url(#area)"/>
    <path class="spark" d="${line}" fill="none" stroke="#35d79a" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${X(last.ts).toFixed(1)}" cy="${Y(last[key]).toFixed(1)}" r="4.5" fill="#35d79a"/>
    <circle cx="${X(last.ts).toFixed(1)}" cy="${Y(last[key]).toFixed(1)}" r="9" fill="rgba(53,215,154,.22)"/>
    ${ticks}</svg>`;
}

function table(el, rows, cols) {
  if (!rows.length) { el.innerHTML = '<p class="empty">Sin datos todavía</p>'; return; }
  el.innerHTML = `<div style="overflow-x:auto"><table>
    <thead><tr>${cols.map((c) => `<th class="${c.right ? 't-right' : ''}">${c.title}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.right ? 't-right' : ''} ${c.mono ? 't-mono' : ''}">${c.value(r)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

// ───────────────────────── render ─────────────────────────
let cfg = {};

const kpi = (label, id, foot, accent) =>
  `<div class="kpi" style="--accent:${accent}"><div class="kpi-label">${label}</div>
   <div class="kpi-value num" data-k="${id}">0</div><div class="kpi-foot">${foot}</div></div>`;

function fillKpis(root, spec) {
  root.innerHTML = spec.map((s) => kpi(s.label, s.id, s.foot ?? '', s.accent || 'var(--sky)')).join('');
  for (const s of spec) count(root.querySelector(`[data-k="${s.id}"]`), s.value, s.suffix || '');
}

function renderGoal(g) {
  count($('goal-pct'), null);
  $('goal-pct').textContent = `${g.pct.toFixed(1)}%`;
  $('goal-target').textContent = `${fmt(g.target)} R$`;
  count($('goal-earned'), g.earned);
  count($('goal-remaining'), g.remaining);
  count($('goal-perday'), g.perDay);
  $('goal-eta').textContent = g.etaDays == null ? '—' : g.etaDays > 400 ? 'más de 1 año' : `${g.etaDays} días`;
  $('goal-bar').style.width = `${g.pct}%`;
  $('ring').style.strokeDashoffset = String(2 * Math.PI * 70 * (1 - g.pct / 100));
}

function renderOverview(o) {
  if (o.game?.name) { $('game-name').textContent = o.game.name; document.title = `${o.game.name} · Robux`; }
  if (o.game?.icon) $('game-icon').src = o.game.icon;
  $('universe-id').textContent = o.game?.universeId ? `universe ${o.game.universeId}` : (cfg.demo ? 'modo demo' : 'sin universeId');
  count($('now-playing'), o.playing);
  count($('now-today'), o.robuxToday);

  const d = o.robuxDeltaPct;
  const delta = d == null ? '' : `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}% vs ayer</span>`;

  fillKpis($('kpis'), [
    { label: 'Robux hoy', id: 'rt', value: o.robuxToday, foot: delta, accent: 'var(--mint)' },
    { label: 'Ventas hoy', id: 'st', value: o.salesToday, foot: `${fmt(o.salesLast24h)} en 24 h`, accent: 'var(--mint)' },
    { label: 'Jugando ahora', id: 'pl', value: o.playing, foot: `pico hoy ${fmt(o.peakToday)}`, accent: 'var(--sky)' },
    { label: 'Visitas hoy', id: 'vt', value: o.visitsToday, foot: `${fmt(o.visits)} totales`, accent: 'var(--sky)' },
    { label: 'Robux histórico', id: 'ra', value: o.robuxAllTime, foot: 'registrado aquí', accent: 'var(--violet)' },
    { label: 'Pendiente', id: 'pe', value: o.pendingRobux, foot: 'en espera 3-7 días', accent: 'var(--gold)' },
    { label: 'Saldo', id: 'ba', value: o.balance, foot: 'disponible ahora', accent: 'var(--gold)' },
    { label: 'Visitas / venta', id: 'vs', value: o.visitsPerSale, foot: o.arpu ? `${o.arpu.toFixed(2)} R$ por visita` : '', accent: 'var(--violet)' },
  ]);

  count($('total-visits'), o.visits);
  $('visits-rate').textContent = o.visitsLast24h ? (o.visitsLast24h / 1440).toFixed(1) : '—';
  fillKpis($('visit-kpis'), [
    { label: 'Jugando ahora', id: 'v1', value: o.playing, foot: 'en todos los servidores', accent: 'var(--mint)' },
    { label: 'Visitas hoy', id: 'v2', value: o.visitsToday, foot: 'desde medianoche', accent: 'var(--sky)' },
    { label: 'Visitas 24 h', id: 'v3', value: o.visitsLast24h, foot: 'últimas 24 horas', accent: 'var(--sky)' },
    { label: 'Pico hoy', id: 'v4', value: o.peakToday, foot: 'máximo simultáneo', accent: 'var(--violet)' },
    { label: 'Favoritos', id: 'v5', value: o.favorites, foot: '', accent: 'var(--gold)' },
    { label: 'Like ratio', id: 'v6', value: o.likeRatio == null ? null : o.likeRatio * 100, suffix: '%',
      foot: `${fmt(o.likes)} 👍 · ${fmt(o.dislikes)} 👎`, accent: 'var(--rose)' },
  ]);
}

function feedItem(e) {
  const manual = e.source === 'manual';
  const who = manual ? 'Añadido por ti' : (e.username || (e.userId ? `user ${e.userId}` : 'anónimo'));
  const initial = esc((manual ? '+' : (e.username || '?')).trim().charAt(0).toUpperCase());
  return `<li data-id="${esc(e.id)}">
    <span class="av ${manual ? 'manual' : ''}">${initial}</span>
    <span class="pbody">
      <span class="pname">${esc(e.productName)}</span>
      <span class="pbuyer">${esc(who)}${manual ? '<i class="tag">manual</i>' : ''}</span>
    </span>
    <span class="amount ${e.robux >= 200 ? 'big' : ''}">+${fmt(e.robux)}</span>
    <span class="ptime">${ago(Date.now() - e.ts)}</span>
  </li>`;
}

function renderFeed(rows) {
  $('feed').innerHTML = rows.map(feedItem).join('') || '<p class="empty">Todavía no hay compras registradas</p>';
  $('feed-mini').innerHTML = rows.slice(0, 8).map(feedItem).join('') || '<p class="empty">Sin compras aún</p>';
  const today = new Date().setHours(0, 0, 0, 0);
  $('feed-count').textContent = fmt(rows.filter((r) => r.ts >= today).length);
}

function prependFeed(e) {
  for (const list of [$('feed'), $('feed-mini')]) {
    if (!list) continue;
    list.querySelector('.empty')?.remove();
    list.insertAdjacentHTML('afterbegin', feedItem(e));
    list.firstElementChild.classList.add('is-new');
    const cap = list.id === 'feed-mini' ? 8 : 80;
    while (list.children.length > cap) list.lastElementChild.remove();
  }
}

function toast(amount, text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b>+${fmt(amount)} R$</b><span>${esc(text)}</span>`;
  $('toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 4200);
}

function rankRows(el, rows, render) {
  const max = Math.max(1, ...rows.map((r) => r.robux));
  el.innerHTML = rows.length
    ? rows.map((r, i) => render(r, i, (r.robux / max) * 100)).join('')
    : '<p class="empty">Sin datos todavía — conecta las ventas o añade Robux a mano</p>';
}

const renderSpenders = (rows) => rankRows($('spenders'), rows, (r, i, w) => `
  <div class="row">
    <span class="rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
    <div class="row-main">
      <div class="row-title">${esc(r.username || `user ${r.userId}`)}</div>
      <div class="row-sub">${fmt(r.purchases)} compras · último hace ${ago(Date.now() - r.lastTs)}</div>
      <div class="row-bar"><div style="--w:${w}%"></div></div>
    </div>
    <span class="row-val">${fmt(r.robux)} R$</span>
  </div>`);

const renderProducts = (rows) => rankRows($('products'), rows, (r, i, w) => `
  <div class="row">
    <span class="rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
    <div class="row-main">
      <div class="row-title">${esc(r.name)}</div>
      <div class="row-sub">${fmt(r.sales)} ventas · ${fmt(r.avg)} R$ promedio · ${r.share.toFixed(1)}% del total</div>
      <div class="row-bar"><div style="--w:${w}%"></div></div>
    </div>
    <span class="row-val">${fmt(r.robux)} R$</span>
  </div>`);

// ───────────────────────── carga ─────────────────────────
async function loadAll() {
  const [{ overview, goal }, feed, players, hourly] = await Promise.all([
    api('/api/overview'), api('/api/feed?limit=80'), api('/api/players?hours=24'), api('/api/hourly?hours=24'),
  ]);
  renderOverview(overview);
  renderGoal(goal);
  renderFeed(feed);
  areaChart($('chart-players'), players, { height: 200 });
  areaChart($('chart-players-big'), players, { height: 300 });
  barChart($('chart-rev24'), hourly, { height: 200, labelEvery: 3 });
  $('rev24-sum').innerHTML = `<b>${fmt(hourly.reduce((a, b) => a + b.robux, 0))}</b> R$ en 24 h`;
  $('footer').textContent = `Actualizado ${new Date().toLocaleTimeString('es-MX')} · ${cfg.demo ? 'modo demo' : 'datos en vivo'}`;
}

const loaders = {
  spenders: async () => renderSpenders(await api('/api/spenders?limit=25&days=30')),
  products: async () => renderProducts(await api('/api/products?days=30')),
  hourly: async () => {
    const rows = await api('/api/hourly?hours=24');
    barChart($('chart-hourly'), rows, { height: 300, labelEvery: 2 });
    table($('table-hourly'), rows.slice().reverse(), [
      { title: 'Hora', mono: true, value: (r) => new Date(r.ts).toLocaleString('es-MX', { hour: '2-digit', day: '2-digit', month: 'short' }) },
      { title: 'Robux', right: true, mono: true, value: (r) => fmt(r.robux) },
      { title: 'Ventas', right: true, mono: true, value: (r) => fmt(r.sales) },
      { title: 'Pico jug.', right: true, mono: true, value: (r) => fmt(r.players) },
    ]);
  },
  daily: async () => {
    const rows = await api('/api/daily?days=30');
    barChart($('chart-daily'), rows, { height: 300, labelEvery: 3 });
    table($('table-daily'), rows.slice().reverse(), [
      { title: 'Día', mono: true, value: (r) => r.label },
      { title: 'Robux', right: true, mono: true, value: (r) => fmt(r.robux) },
      { title: 'Ventas', right: true, mono: true, value: (r) => fmt(r.sales) },
      { title: 'Visitas', right: true, mono: true, value: (r) => fmt(r.visits) },
      { title: 'Pico', right: true, mono: true, value: (r) => fmt(r.peak) },
    ]);
  },
};

// ───────────────────────── tabs ─────────────────────────
function movePill(btn) {
  const pill = $('tab-pill');
  pill.style.width = `${btn.offsetWidth}px`;
  pill.style.transform = `translateX(${btn.offsetLeft - 5}px)`;
}

$('tabs').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === btn));
  const name = btn.dataset.tab;
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${name}`));
  movePill(btn);
  loaders[name]?.();
});
addEventListener('resize', () => movePill(document.querySelector('.tab.is-active')));

// ───────────────────────── modal "añadir Robux" ─────────────────────────
const modal = {
  open() {
    $('modal-bg').hidden = false;
    $('modal-err').textContent = '';
    setTimeout(() => $('amount').focus(), 60);
  },
  close() {
    $('modal-bg').hidden = true;
    $('amount').value = '';
    $('note').value = '';
    document.querySelectorAll('.quick button').forEach((b) => b.classList.remove('on'));
  },
};

$('fab').addEventListener('click', modal.open);
$('modal-x').addEventListener('click', modal.close);
$('modal-bg').addEventListener('click', (e) => { if (e.target === $('modal-bg')) modal.close(); });
addEventListener('keydown', (e) => {
  if ($('modal-bg').hidden) return;
  if (e.key === 'Escape') modal.close();
  if (e.key === 'Enter') save();
});

$('quick').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('.quick button').forEach((b) => b.classList.toggle('on', b === btn));
  $('amount').value = btn.dataset.amt;
  $('amount').focus();
});

async function save() {
  const robux = Number($('amount').value);
  if (!Number.isFinite(robux) || robux < 1) { $('modal-err').textContent = 'Escribe una cantidad mayor que 0.'; return; }
  $('save').disabled = true;
  try {
    const res = await api('/api/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ robux, note: $('note').value }),
    });
    if (res.error) { $('modal-err').textContent = res.error; return; }
    renderGoal(res.goal);
    modal.close();
    await loadAll();
  } catch (err) {
    $('modal-err').textContent = `No se pudo guardar: ${err.message}`;
  } finally {
    $('save').disabled = false;
  }
}
$('save').addEventListener('click', save);

$('undo').addEventListener('click', async () => {
  const res = await api('/api/manual/undo', { method: 'POST' });
  if (!res.ok) { $('modal-err').textContent = 'No hay registros manuales que deshacer.'; return; }
  renderGoal(res.goal);
  modal.close();
  await loadAll();
});

// ───────────────────────── tiempo real ─────────────────────────
function connect() {
  const es = new EventSource('/api/stream');
  const chip = $('live-chip');
  es.onopen = () => { chip.classList.add('on'); $('live-text').textContent = 'en vivo'; };
  es.onerror = () => { chip.classList.remove('on'); $('live-text').textContent = 'reconectando'; };
  es.addEventListener('purchase', (ev) => {
    const e = JSON.parse(ev.data);
    prependFeed(e);
    toast(e.robux, e.productName);
    api('/api/overview').then(({ overview, goal }) => { renderOverview(overview); renderGoal(goal); });
  });
  es.addEventListener('snapshot', (ev) => {
    const d = JSON.parse(ev.data);
    if (d.overview) renderOverview(d.overview);
    if (d.goal) renderGoal(d.goal);
  });
}

(async function main() {
  cfg = await api('/api/config');
  movePill(document.querySelector('.tab.is-active'));
  await loadAll();
  connect();
  setInterval(loadAll, 60_000);
  setInterval(() => api('/api/feed?limit=80').then(renderFeed), 30_000);
})();
