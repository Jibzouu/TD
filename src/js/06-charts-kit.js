// ── KPI SPARKLINES & TENDANCES ──────────────────────────────────────
function buildSparklinePath(values, w, h, pad) {
  w = w || 100; h = h || 24; pad = pad || 2;
  if (!values || values.length < 2) return { path: '', lastX: 0, lastY: 0 };
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const step = (w - pad*2) / (values.length - 1);
  let path = '';
  let lastX = 0, lastY = 0;
  values.forEach((v,i) => {
    const x = pad + i*step;
    const y = h - pad - ((v-min)/range) * (h - pad*2);
    path += (i===0?'M':'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    lastX = x; lastY = y;
  });
  return { path: path.trim(), lastX, lastY };
}
function renderSparklineInto(svgId, values, color) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  if (!values || values.length < 2) { svg.innerHTML = ''; return; }
  const { path, lastX, lastY } = buildSparklinePath(values);
  // Tendance en encre discrète, dernier point à l'accent (la couleur de série est réservée aux vrais graphiques).
  // vector-effect : le trait garde son épaisseur malgré l'étirement du SVG ; le point final est un trait de longueur nulle → rond parfait.
  svg.innerHTML = `<path d="${path}" fill="none" style="stroke:var(--txt3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><path d="M${lastX.toFixed(1)},${lastY.toFixed(1)} h0" style="stroke:var(--accent)" stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
}
function chronoClosedTrades() {
  return [...analysisTrades()].reverse().filter(t => ['TP','SL','BE'].includes(t.res));
}
function makeBuckets(arr, count) {
  if (arr.length === 0) return [];
  const n = Math.min(count, arr.length);
  const size = Math.ceil(arr.length / n);
  const buckets = [];
  for (let i = 0; i < arr.length; i += size) buckets.push(arr.slice(i, i+size));
  return buckets;
}
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function chartFontFamily() {
  return cssVar('--mono', "'JetBrains Mono',monospace");
}
// ── KIT GRAPHIQUE « TERMINAL PRO » ───────────────────────────────────
// Intensité réglable dans Paramètres (100 % = valeurs de la charte) ; 200 % est la valeur par défaut historique → 1×.
function chartIntensity() { return (typeof CHART_INTENSITY !== 'undefined' ? CHART_INTENSITY : 2) / 2; }
function chartFillAlpha(base) { return Math.min(base * chartIntensity(), 0.9); }
function chartBorderW(base) { return Math.max(1, Math.min(base * Math.sqrt(chartIntensity()), base * 2)); }
// Couleur avec transparence ; accepte #rgb / #rrggbb (les sélecteurs de couleur), sinon renvoie la couleur telle quelle.
function withAlpha(color, a) { return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(color || '').trim()) ? hexToRgba(color.trim(), a) : color; }
function chartTokens() {
  return {
    accent: cssVar('--accent', '#4c8dff'), green: cssVar('--green', '#26a69a'), red: cssVar('--red', '#ef5350'),
    amber: cssVar('--amber', '#c98500'), txt: cssVar('--txt', '#e6e9ef'), txt2: cssVar('--txt2', '#9aa3b5'),
    txt3: cssVar('--txt3', '#7d879b'), border: cssVar('--border', '#222836'), border2: cssVar('--border2', '#2e3545'),
    bg: cssVar('--bg', '#0a0c10'), bg2: cssVar('--bg2', '#10131a'), bg3: cssVar('--bg3', '#161a23')
  };
}
function chartTheme() {
  const t = chartTokens();
  return { tooltipBg: t.bg2, tooltipBorder: t.border2, tooltipTitle: t.txt2, tooltipBody: t.txt, axisTick: t.txt3, gridLine: t.border, gridLineSoft: t.border };
}
// Infobulle unique pour tous les graphiques : valeur en gras, libellé en retrait, clés en trait (pas en carré).
function proTooltip(extra) {
  const t = chartTokens();
  return Object.assign({
    backgroundColor: t.bg2, borderColor: t.border2, borderWidth: 1, cornerRadius: 8, padding: { x: 12, y: 10 },
    titleColor: t.txt2, bodyColor: t.txt, titleFont: { family: cssVar('--sans', 'Inter'), size: 11.5, weight: '500' },
    bodyFont: { family: chartFontFamily(), size: 12, weight: '600' }, bodySpacing: 5, titleMarginBottom: 7,
    boxWidth: 12, boxHeight: 2, boxPadding: 5, usePointStyle: false, caretSize: 0, displayColors: true
  }, extra || {});
}
// Axes : grille fine pleine (jamais pointillée), graduations en police des chiffres, largeur d'axe Y fixe (alignement des graphiques empilés).
function proScales(opts) {
  const t = chartTokens(), f = { family: chartFontFamily(), size: 11 };
  opts = opts || {};
  // Fusion sur deux niveaux : passer { ticks: { callback } } ne doit pas effacer la couleur, la police ou la rotation des graduations.
  const merge = (base, over) => { const o = Object.assign({}, base); Object.entries(over || {}).forEach(([k, v]) => { o[k] = (v && typeof v === 'object' && !Array.isArray(v) && typeof v !== 'function' && base[k] && typeof base[k] === 'object') ? Object.assign({}, base[k], v) : v; }); return o; };
  const narrow = window.matchMedia && window.matchMedia('(max-width: 600px)').matches;
  return {
    x: merge({ grid: { display: false }, border: { display: true, color: t.border }, ticks: { color: t.txt3, font: f, maxRotation: 0, autoSkip: true, autoSkipPadding: 18, maxTicksLimit: narrow ? 4 : (opts.xTicks || 8) } }, opts.x),
    y: merge({ grid: { color: t.border, lineWidth: 1, drawTicks: false }, border: { display: false }, ticks: { color: t.txt3, font: f, padding: 8, maxTicksLimit: opts.yTicks || 5 }, afterFit: sc => { sc.width = narrow ? Math.min(opts.yWidth || 72, 52) : (opts.yWidth || 72); } }, opts.y)
  };
}
function applyChartDefaults() {
  if (typeof Chart === 'undefined') return;
  const t = chartTokens();
  Chart.defaults.font.family = chartFontFamily();
  Chart.defaults.font.size = 11;
  Chart.defaults.color = t.txt3;
  Chart.defaults.borderColor = t.border;
  Chart.defaults.animation.duration = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350;
  Chart.defaults.plugins.legend.display = false;
  if (!Chart.registry.plugins.get('proCrosshair')) {
    // Ligne verticale qui suit la souris et s'aligne sur la date la plus proche (courbes uniquement).
    Chart.register({
      id: 'proCrosshair',
      afterDatasetsDraw(chart) {
        if (chart.config.type !== 'line') return;
        const act = chart.tooltip && chart.tooltip.getActiveElements ? chart.tooltip.getActiveElements() : [];
        if (!act.length) return;
        const x = act[0].element.x, { top, bottom } = chart.chartArea, c = chart.ctx;
        c.save(); c.strokeStyle = withAlpha(cssVar('--txt3', '#7d879b'), .7); c.lineWidth = 1;
        c.beginPath(); c.moveTo(Math.round(x) + .5, top); c.lineTo(Math.round(x) + .5, bottom); c.stroke(); c.restore();
      }
    });
  }
}
// Ligne de référence horizontale (départ, zéro…) avec étiquette discrète à gauche.
function refLinePlugin(id, value, label) {
  return {
    id,
    afterDatasetsDraw(chart) {
      const y = chart.scales.y; if (!y || value < y.min || value > y.max) return;
      const t = chartTokens(), c = chart.ctx, py = Math.round(y.getPixelForValue(value)) + .5, { left, right } = chart.chartArea;
      c.save(); c.strokeStyle = t.txt3; c.lineWidth = 1; c.setLineDash([4, 4]);
      c.beginPath(); c.moveTo(left, py); c.lineTo(right, py); c.stroke(); c.setLineDash([]);
      if (label) {
        c.font = '500 11px ' + chartFontFamily(); const w = c.measureText(label).width + 10;
        const lx = right - w - 4;   // à droite : l'étiquette ne masque pas le début de la courbe
        c.fillStyle = t.bg2; c.fillRect(lx, py - 8, w, 16);
        c.fillStyle = t.txt2; c.textBaseline = 'middle'; c.fillText(label, lx + 5, py);
      }
      c.restore();
    }
  };
}
// Pastille d'annotation sur un point (plus haut, drawdown max…) : texte en encre neutre, repère coloré à côté.
function drawPointLabel(chart, datasetIndex, index, text, color, above) {
  const meta = chart.getDatasetMeta(datasetIndex); const el = meta && meta.data[index]; if (!el) return;
  const t = chartTokens(), c = chart.ctx; c.save();
  c.font = '600 11px ' + chartFontFamily();
  const w = c.measureText(text).width + 20, h = 18;
  let x = Math.min(Math.max(el.x - w / 2, chart.chartArea.left), chart.chartArea.right - w);
  let y = above ? el.y - h - 9 : el.y + 9;
  y = Math.min(Math.max(y, chart.chartArea.top - 4), chart.chartArea.bottom - h);
  c.fillStyle = t.bg2; c.strokeStyle = t.border2; c.lineWidth = 1;
  if (c.roundRect) { c.beginPath(); c.roundRect(x, y, w, h, 4); c.fill(); c.stroke(); } else { c.fillRect(x, y, w, h); }
  c.fillStyle = color; c.beginPath(); c.arc(x + 8, y + h / 2, 3, 0, Math.PI * 2); c.fill();
  c.fillStyle = t.txt; c.textBaseline = 'middle'; c.fillText(text, x + 14, y + h / 2 + .5);
  c.restore();
}
function fmtEURCompact(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const a = Math.abs(n), sign = n < 0 ? '-' : '';
  if (a >= 1e6) return sign + (a / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M€';
  if (a >= 1e4) return sign + (a / 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k€';
  return sign + Math.round(a).toLocaleString('fr-FR') + ' €';
}
function fmtDateFR(iso, withYear) {
  const d = new Date(String(iso) + 'T00:00:00');
  if (isNaN(d)) return String(iso || '');
  return d.toLocaleDateString('fr-FR', withYear ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: '2-digit', month: '2-digit' });
}
// Cellule de tableau : barre divergente autour de zéro (vert à droite, rouge à gauche) + valeur alignée.
function divBarCell(v, maxAbs, label) {
  const w = maxAbs > 0 ? Math.min(Math.abs(v) / maxAbs, 1) * 50 : 0;
  const col = v >= 0 ? 'var(--green)' : 'var(--red)';
  return `<div class="cell-bar"><div class="div-bar"><span style="${v >= 0 ? 'left:50%' : 'right:50%'};width:${w}%;background:${col}"></span></div><span class="cb-val" style="color:${v > 0 ? 'var(--green)' : v < 0 ? 'var(--red)' : 'var(--txt2)'}">${label}</span></div>`;
}
// Cellule de tableau : jauge de win rate (0–100 %) avec repère du seuil de rentabilité.
function wrBarCell(rate, thr, n) {
  if (rate === null || rate === undefined || isNaN(rate)) return '—';
  const col = thr === null || thr === undefined ? 'var(--accent)' : (rate >= thr ? 'var(--green)' : 'var(--red)');
  return `<div class="cell-bar"><div class="meter"><div class="meter-fill" style="width:${rate * 100}%;background:${col};${n < 10 ? 'opacity:.55' : ''}"></div>${thr != null ? `<div class="meter-tick" style="left:calc(${thr * 100}% - 1px);top:-3px;bottom:-3px;width:1.5px;background:var(--txt2)"></div>` : ''}</div><span class="cb-val">${(rate * 100).toFixed(1).replace('.', ',')} %</span></div>`;
}
function fmtPct(v, digits) { return (v >= 0 ? '+' : '') + v.toLocaleString('fr-FR', { minimumFractionDigits: digits ?? 1, maximumFractionDigits: digits ?? 1 }) + ' %'; }
// Seuil de rentabilité du win rate : avec un payoff P (gain moyen ÷ perte moyenne), on est rentable au-dessus de 1 / (1 + P).
function breakevenWinRate(list) {
  list = list || viewTrades();
  const e = list.filter(t => t.pnlEur != null && ['TP', 'SL'].includes(t.res));
  let w = e.filter(t => t.res === 'TP').map(t => t.pnlEur), l = e.filter(t => t.res === 'SL').map(t => Math.abs(t.pnlEur));
  if (!w.length || !l.length) {
    const r = list.filter(t => t.pnl != null && ['TP', 'SL'].includes(t.res) && rUsable(t));
    w = r.filter(t => t.res === 'TP').map(t => t.pnl); l = r.filter(t => t.res === 'SL').map(t => Math.abs(t.pnl));
  }
  if (!w.length || !l.length) return null;
  const aw = w.reduce((a, b) => a + b, 0) / w.length, al = l.reduce((a, b) => a + b, 0) / l.length;
  return aw + al > 0 ? al / (aw + al) : null;
}
// Infobulle HTML partagée (heatmaps) — construite avec textContent : un libellé importé ne peut jamais injecter de HTML.
function showHtmlTip(e, title, rows) {
  const tip = document.getElementById('cal-tooltip'); if (!tip) return;
  tip.textContent = '';
  const h = document.createElement('div'); h.className = 'tip-title'; h.textContent = title; tip.appendChild(h);
  rows.forEach(([k, v, col]) => {
    const r = document.createElement('div'); r.className = 'tip-row';
    const a = document.createElement('span'); a.textContent = k;
    const b = document.createElement('b'); b.textContent = v; if (col) b.style.color = col;
    r.appendChild(a); r.appendChild(b); tip.appendChild(r);
  });
  tip.classList.add('show'); positionCalTooltip(e);
}
function fmtEUR(n, showPlus, decimals) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  decimals = decimals || 0;
  const sign = n < 0 ? '-' : (showPlus ? '+' : '');
  return sign + Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' €';
}
let lastHeroValue = null;
let heroAnimFrame = null;
function animateHeroValue(target) {
  const el = document.getElementById('k-pnleur');
  if (!el) return;
  const from = lastHeroValue === null ? target : lastHeroValue;
  lastHeroValue = target;
  if (heroAnimFrame) cancelAnimationFrame(heroAnimFrame);
  if (Math.abs(from - target) < 0.005) { el.textContent = fmtEUR(target, true, 2); return; }
  const duration = 550;
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = from + (target - from) * eased;
    el.textContent = fmtEUR(val, true, 2);
    if (t < 1) heroAnimFrame = requestAnimationFrame(step);
    else el.textContent = fmtEUR(target, true, 2);
  }
  heroAnimFrame = requestAnimationFrame(step);
}
function trendBadge(elId, values, suffix) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!values || values.length < 2) { el.textContent = ''; el.className = 'kpi-trend'; return; }
  const delta = values[values.length-1] - values[0];
  const dir = Math.abs(delta) < 0.05 ? 'flat' : (delta > 0 ? 'up' : 'down');
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '→';
  el.textContent = arrow + ' ' + (delta>=0?'+':'') + delta.toFixed(1) + (suffix||'');
  el.className = 'kpi-trend ' + dir;
}

function renderKpiSparklines() {
  const closed = chronoClosedTrades();
  const buckets = makeBuckets(closed, 8);

  if (buckets.length >= 2) {
    const wrSeries = buckets.map(b => b.length ? b.filter(t=>t.res==='TP').length/b.length*100 : 0);
    renderSparklineInto('k-wr-spark', wrSeries, cssVar('--green','#22c55e'));
    trendBadge('k-wr-trend', wrSeries, 'pts');

    let cum = 0;
    const pnlSeries = buckets.map(b => { cum += b.reduce((s,t)=>s+(t.pnl||0),0); return parseFloat(cum.toFixed(2)); });
    renderSparklineInto('k-pnl-spark', pnlSeries, cssVar('--blue','#60a5fa'));
    trendBadge('k-pnl-trend', pnlSeries, 'R');

    const eurOf = t => (t.pnlEur !== null && t.pnlEur !== undefined) ? t.pnlEur : 0;
    const rrSeries = buckets.map(b => { const w = b.filter(t => t.res === 'TP'), l = b.filter(t => t.res === 'SL'); const aw = w.length ? w.reduce((s, t) => s + eurOf(t), 0) / w.length : 0, al = l.length ? Math.abs(l.reduce((s, t) => s + eurOf(t), 0) / l.length) : 0; return al > 0 ? Math.min(aw / al, 6) : 0; });
    renderSparklineInto('k-rr-spark', rrSeries, cssVar('--amber','#f59e0b'));
    trendBadge('k-rr-trend', rrSeries, '');

    const pfSeries = buckets.map(b => {
      const gw = b.filter(t=>t.res==='TP').reduce((s,t)=>s+eurOf(t),0);
      const gl = Math.abs(b.filter(t=>t.res==='SL').reduce((s,t)=>s+eurOf(t),0));
      return Math.min(gl>0 ? gw/gl : (gw>0?3:0), 3);
    });
    renderSparklineInto('k-pf-spark', pfSeries, cssVar('--purple','#a78bfa'));
    trendBadge('k-pf-trend', pfSeries, '');
  } else {
    ['k-wr-spark','k-pnl-spark','k-rr-spark','k-pf-spark'].forEach(id => { const el=document.getElementById(id); if (el) el.innerHTML=''; });
    ['k-wr-trend','k-pnl-trend','k-rr-trend','k-pf-trend'].forEach(id => { const el=document.getElementById(id); if (el) { el.textContent=''; el.className='kpi-trend'; } });
  }

  const dotsEl = document.getElementById('k-form-dots');
  if (dotsEl) {
    const last10 = closed.slice(-10);
    dotsEl.innerHTML = last10.map(t => {
      const color = t.res==='TP' ? 'var(--green)' : t.res==='SL' ? 'var(--red)' : 'var(--amber)';
      return `<span style="background:${color}" title="${esc(t.date||'')} · ${esc(t.res)}"></span>`;
    }).join('');
  }
}

