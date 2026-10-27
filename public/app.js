const $ = (id) => document.getElementById(id);
const api = (path) => fetch(path).then((r) => r.json());

const nf = new Intl.NumberFormat('es-MX');
const fmt = (n) => (n == null || Number.isNaN(n) ? '—' : nf.format(Math.round(n)));
const rs = (n) => (n == null ? '—' : `${fmt(n)} R$`);
const pct = (n) => (n == null ? '—' : `${n.toFixed(1)}%`);

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

// ───────────────────────── charts (SVG a mano, sin librerias) ─────────────────────────
const W = 1000;

function svgWrap(inner, height = 300) {
  return `<svg viewBox="0 0 ${W} ${height}" preserveAspectRatio="none" role="img">
    <defs>
      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#38e08a"/><stop offset="100%" stop-color="#1b7f66"/>
      </linearGradient>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(56,224,138,.45)"/><stop offset="100%" stop-color="rgba(56,224,138,0)"/>
      </linearGradient>
    </defs>${inner}</svg>`;
}

function axes(max, height, pad) {
  let out = '';
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ((height - pad.t - pad.b) * i) / 4;
    const value = max * (1 - i / 4);
    out += `<line class="gridline" x1="${pad.l}" y1="${y}" x2="${W - pad.r}" y2="${y}"/>`;
    out += `<text class="axis" x="4" y="${y - 4}">${fmt(value)}</text>`;
  }
  return out;
}

function barChart(el, data, { height = 300, labelEvery = 1, valueKey = 'robux' } = {}) {
  if (!data?.length) { el.innerHTML = '<p class="empty">Sin datos todavía</p>'; return; }
  const pad = { t: 14, r: 8, b: 26, l: 8 };
  const max = Math.max(1, ...data.map((d) => d[valueKey] || 0));
  const plotH = height - pad.t - pad.b;
  const step = (W - pad.l - pad.r) / data.length;
  const bw = Math.max(2, step * 0.62);

  let bars = '';
  data.forEach((d, i) => {
    const v = d[valueKey] || 0;
    const h = (v / max) * plotH;
    const x = pad.l + i * step + (step - bw) / 2;
    const y = pad.t + plotH - h;
    bars += `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, h).toFixed(1)}" rx="3">
      <title>${d.label}: ${fmt(v)}</title></rect>`;
    if (i % labelEvery === 0) {
      bars += `<text class="axis" x="${(x + bw / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle">${d.label}</text>`;
    }
  });
  el.innerHTML = svgWrap(axes(max, height, pad) + bars, height);
}

function areaChart(el, points, { height = 300, yKey = 'playing' } = {}) {
  if (!points || points.length < 2) { el.innerHTML = '<p class="empty">Recolectando datos…</p>'; return; }
  const pad = { t: 14, r: 8, b: 24, l: 8 };
  const max = Math.max(1, ...points.map((p) => p[yKey] || 0));
  const min = 0;
  const plotH = height - pad.t - pad.b;
  const t0 = points[0].ts;
  const span = Math.max(1, points[points.length - 1].ts - t0);
  const X = (ts) => pad.l + ((ts - t0) / span) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + plotH - ((v - min) / (max - min)) * plotH;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(p.ts).toFixed(1)},${Y(p[yKey]).toFixed(1)}`).join('');
  const area = `${line}L${X(points[points.length - 1].ts).toFixed(1)},${pad.t + plotH}L${X(t0).toFixed(1)},${pad.t + plotH}Z`;

  const last = points[points.length - 1];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const ts = t0 + span * f;
    const d = new Date(ts);
    return `<text class="axis" x="${X(ts).toFixed(1)}" y="${height - 6}" text-anchor="middle">${String(d.getHours()).padStart(2, '0')}:00</text>`;
  }).join('');

  el.innerHTML = svgWrap(
    axes(max, height, pad) +
    `<path d="${area}" fill="url(#areaGrad)"/>` +
    `<path d="${line}" fill="none" stroke="#38e08a" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<circle cx="${X(last.ts).toFixed(1)}" cy="${Y(last[yKey]).toFixed(1)}" r="4" fill="#38e08a"/>` +
    ticks,
    height,
  );
}

function table(el, rows, columns) {
  if (!rows.length) { el.innerHTML = '<p class="empty">Sin datos todavía</p>'; return; }
  el.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr>${columns.map((c) => `<th style="text-align:${c.align || 'left'};padding:8px 10px;color:#7e93a8;font-weight:500;font-size:11px;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid rgba(255,255,255,.08)">${c.title}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td style="text-align:${c.align || 'left'};padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.04);font-family:${c.mono ? 'var(--mono)' : 'inherit'}">${c.value(r)}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

// ───────────────────────── render ─────────────────────────
let cfg = {};

function kpi(label, value, foot = '') {
  return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-foot">${foot}</div></div>`;
}

function renderGoal(g) {
  $('goal-target').textContent = fmt(g.target);
  $('goal-pct').textContent = `${g.pct.toFixed(1)}%`;
  $('goal-earned').textContent = rs(g.earned);
  $('goal-remaining').textContent = rs(g.remaining);
  $('goal-perday').textContent = fmt(g.perDay);
  $('goal-eta').textContent = g.etaDays == null
    ? '—'
    : g.etaDays > 400 ? '+1 año' : `${g.etaDays} días`;
  $('goal-bar').style.width = `${g.pct}%`;
  const C = 2 * Math.PI * 68;
  $('ring').style.strokeDashoffset = String(C * (1 - g.pct / 100));
}

function renderOverview(o) {
  if (o.game?.name) { $('game-name').textContent = o.game.name; document.title = `${o.game.name} · Robux`; }
  if (o.game?.icon) { const img = $('game-icon'); img.src = o.game.icon; img.hidden = false; }
  $('universe-id').textContent = o.game?.universeId ? `universe ${o.game.universeId}` : (cfg.demo ? 'modo demo' : 'sin universeId');
  $('now-playing').textContent = fmt(o.playing);
  $('now-today').textContent = fmt(o.robuxToday);

  const delta = o.robuxDeltaPct;
  const deltaHtml = delta == null ? '' :
    `<span class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(0)}% vs ayer</span>`;

  $('kpis').innerHTML = [
    kpi('Robux hoy', fmt(o.robuxToday), deltaHtml),
    kpi('Ventas hoy', fmt(o.salesToday), `${fmt(o.salesLast24h)} en 24h`),
    kpi('Jugando ahora', fmt(o.playing), `pico hoy ${fmt(o.peakToday)}`),
    kpi('Visitas hoy', fmt(o.visitsToday), `${fmt(o.visits)} totales`),
    kpi('Robux histórico', fmt(o.robuxAllTime), 'registrado por el dashboard'),
    kpi('Pendiente', fmt(o.pendingRobux), 'Robux en espera (3-7 días)'),
    kpi('Saldo', fmt(o.balance), 'disponible ahora'),
    kpi('Visitas / venta', fmt(o.visitsPerSale), o.arpu ? `${o.arpu.toFixed(2)} R$ por visita hoy` : ''),
  ].join('');

  $('total-visits').textContent = fmt(o.visits);
  $('visits-rate').textContent = o.visitsLast24h ? (o.visitsLast24h / 1440).toFixed(1) : '—';
  $('visit-kpis').innerHTML = [
    kpi('Jugando ahora', fmt(o.playing), 'en todos los servidores'),
    kpi('Visitas hoy', fmt(o.visitsToday), 'desde medianoche'),
    kpi('Visitas 24h', fmt(o.visitsLast24h), 'últimas 24 horas'),
    kpi('Pico hoy', fmt(o.peakToday), 'máximo simultáneo'),
    kpi('Favoritos', fmt(o.favorites), ''),
    kpi('Like ratio', o.likeRatio == null ? '—' : pct(o.likeRatio * 100), `${fmt(o.likes)} 👍 · ${fmt(o.dislikes)} 👎`),
  ].join('');
}

function feedItem(e) {
  const buyer = e.username || (e.userId ? `user ${e.userId}` : 'anónimo');
  return `<li data-id="${e.id}">
    <span class="amount ${e.robux >= 200 ? 'big' : ''}">+${fmt(e.robux)}<small> R$</small></span>
    <span class="pname">${escapeHtml(e.productName)}<br><span class="pbuyer">${escapeHtml(buyer)}</span></span>
    <span class="ptime">${ago(Date.now() - e.ts)}</span>
  </li>`;
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderFeed(rows) {
  $('feed').innerHTML = rows.map(feedItem).join('');
  $('feed-mini').innerHTML = rows.slice(0, 8).map(feedItem).join('');
  const today = new Date().setHours(0, 0, 0, 0);
  $('feed-count').textContent = fmt(rows.filter((r) => r.ts >= today).length);
}

function prependFeed(e) {
  for (const list of [$('feed'), $('feed-mini')]) {
    if (!list) continue;
    list.insertAdjacentHTML('afterbegin', feedItem(e));
    list.firstElementChild.classList.add('new');
    while (list.children.length > (list.id === 'feed-mini' ? 8 : 80)) list.lastElementChild.remove();
  }
  toast(`+${fmt(e.robux)} R$ · ${e.productName}`);
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b>${escapeHtml(text.split('·')[0])}</b>${escapeHtml(text.slice(text.indexOf('·')))}`;
  $('toasts').append(el);
  setTimeout(() => el.remove(), 4500);
}

function renderSpenders(rows) {
  const max = Math.max(1, ...rows.map((r) => r.robux));
  $('spenders').innerHTML = rows.length ? rows.map((r, i) => `
    <div class="row">
      <span class="rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
      <div class="row-main">
        <div class="row-title">${escapeHtml(r.username || `user ${r.userId}`)}</div>
        <div class="row-sub">${fmt(r.purchases)} compras · último hace ${ago(Date.now() - r.lastTs)}</div>
        <div class="row-bar"><div style="width:${(r.robux / max) * 100}%"></div></div>
      </div>
      <span class="row-val">${fmt(r.robux)} R$</span>
    </div>`).join('') : '<p class="empty">Sin compras registradas todavía</p>';
}

function renderProducts(rows) {
  const max = Math.max(1, ...rows.map((r) => r.robux));
  $('products').innerHTML = rows.length ? rows.map((r, i) => `
    <div class="row">
      <span class="rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
      <div class="row-main">
        <div class="row-title">${escapeHtml(r.name)}</div>
        <div class="row-sub">${fmt(r.sales)} ventas · ${fmt(r.avg)} R$ promedio · ${r.share.toFixed(1)}% del total</div>
        <div class="row-bar"><div style="width:${(r.robux / max) * 100}%"></div></div>
      </div>
      <span class="row-val">${fmt(r.robux)} R$</span>
    </div>`).join('') : '<p class="empty">Sin ventas registradas todavía</p>';
}

// ───────────────────────── carga ─────────────────────────
async function loadAll() {
  const [{ overview, goal }, feed, players] = await Promise.all([
    api('/api/overview'), api('/api/feed?limit=80'), api('/api/players?hours=24'),
  ]);
  renderOverview(overview);
  renderGoal(goal);
  renderFeed(feed);
  areaChart($('chart-players'), players, { height: 190 });
  areaChart($('chart-players-big'), players, { height: 290 });

  const hourly = await api('/api/hourly?hours=24');
  barChart($('chart-rev24'), hourly, { height: 190, labelEvery: 3 });
  $('rev24-sum').textContent = `${fmt(hourly.reduce((a, b) => a + b.robux, 0))} R$ en 24h`;

  $('footer').textContent = `Actualizado ${new Date().toLocaleTimeString('es-MX')} · ${cfg.demo ? 'MODO DEMO' : 'datos en vivo'}`;
}

const loaders = {
  spenders: async () => renderSpenders(await api('/api/spenders?limit=25&days=30')),
  products: async () => renderProducts(await api('/api/products?days=30')),
  hourly: async () => {
    const rows = await api('/api/hourly?hours=24');
    barChart($('chart-hourly'), rows, { height: 290, labelEvery: 2 });
    table($('table-hourly'), rows.slice().reverse(), [
      { title: 'Hora', value: (r) => new Date(r.ts).toLocaleString('es-MX', { hour: '2-digit', day: '2-digit', month: 'short' }), mono: true },
      { title: 'Robux', align: 'right', mono: true, value: (r) => fmt(r.robux) },
      { title: 'Ventas', align: 'right', mono: true, value: (r) => fmt(r.sales) },
      { title: 'Pico jug.', align: 'right', mono: true, value: (r) => fmt(r.players) },
    ]);
  },
  daily: async () => {
    const rows = await api('/api/daily?days=30');
    barChart($('chart-daily'), rows, { height: 290, labelEvery: 3 });
    table($('table-daily'), rows.slice().reverse(), [
      { title: 'Día', value: (r) => r.label, mono: true },
      { title: 'Robux', align: 'right', mono: true, value: (r) => fmt(r.robux) },
      { title: 'Ventas', align: 'right', mono: true, value: (r) => fmt(r.sales) },
      { title: 'Visitas', align: 'right', mono: true, value: (r) => fmt(r.visits) },
      { title: 'Pico', align: 'right', mono: true, value: (r) => fmt(r.peak) },
    ]);
  },
};

// tabs
$('tabs').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
  const name = btn.dataset.tab;
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
  loaders[name]?.();
});

// SSE
function connect() {
  const es = new EventSource('/api/stream');
  es.onopen = () => { $('live-dot').classList.add('on'); $('live-text').textContent = 'en vivo'; };
  es.onerror = () => { $('live-dot').classList.remove('on'); $('live-text').textContent = 'reconectando'; };
  es.addEventListener('purchase', (ev) => {
    const e = JSON.parse(ev.data);
    prependFeed(e);
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
  await loadAll();
  connect();
  setInterval(loadAll, 60_000);
  // Refresca las etiquetas "hace X" sin volver a pedir datos.
  setInterval(() => api('/api/feed?limit=80').then(renderFeed), 30_000);
})();
