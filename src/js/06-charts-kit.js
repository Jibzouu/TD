// ── KPI SPARKLINES & TENDANCES ──────────────────────────────────────
// Mini-courbe « tendance + seuil » : la couleur dit le sens (évolution sur les 10 derniers trades : vert monte,
// rouge baisse, gris stable), le pointillé nommé dit la référence (seuil de rentabilité, 0R, 1,0) et tout ce qui
// passe sous ce seuil est rouge. Dessinée à la taille réelle du SVG (le texte du seuil n'est pas déformé).
function renderSparklineInto(svgId, values, opts) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  if (!values || values.length < 2) { mount(svg, ''); return; }
  opts = opts || {};
  const cs = getComputedStyle(svg);
  const W = Math.max(60, Math.round(parseFloat(cs.width) || 100)), H = Math.max(16, Math.round(parseFloat(cs.height) || 24)), P = 3;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const hasRef = opts.ref !== null && opts.ref !== undefined && isFinite(opts.ref);
  const lo = Math.min(...values, hasRef ? opts.ref : Infinity), hi = Math.max(...values, hasRef ? opts.ref : -Infinity), range = (hi - lo) || 1;
  const x = i => P + i * (W - 2 * P) / (values.length - 1), y = v => H - P - (v - lo) / range * (H - 2 * P);
  const line = values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  const tone = { up: 'green', down: 'red' }[opts.trend] || 'muted';
  const y0 = hasRef ? y(opts.ref) : H, off = Math.max(0, Math.min(1, y0 / H)).toFixed(3);
  const last = values[values.length - 1], lx = x(values.length - 1), ly = y(last);
  const below = hasRef && last < opts.ref;
  const id = 'sp-' + svgId;
  mount(svg, html`<defs>
      <linearGradient id="${id}-f" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="0" class="sp-c-${raw(tone)}" stop-opacity=".38"/><stop offset="${off}" class="sp-c-${raw(tone)}" stop-opacity=".05"/><stop offset="${off}" class="sp-c-red" stop-opacity=".1"/><stop offset="1" class="sp-c-red" stop-opacity=".4"/></linearGradient>
      <linearGradient id="${id}-s" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="${off}" class="sp-c-${raw(tone)}"/><stop offset="${off}" class="sp-c-red"/></linearGradient>
    </defs>
    <path d="${line} L${lx.toFixed(1)},${y0.toFixed(1)} L${P},${y0.toFixed(1)} Z" fill="url(#${id}-f)"/>
    ${hasRef ? html`<line class="sp-ref" x1="0" x2="${W}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}"/><text class="sp-ref-lbl" x="${W - 1}" y="${Math.max(9, y0 - 3).toFixed(1)}" text-anchor="end">${opts.refLabel || ''}</text>` : ''}
    <path d="${line}" fill="none" stroke="url(#${id}-s)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle class="sp-end fill-${raw(below ? 'red' : tone)}" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="3.5"/>`);
  svg.setAttribute('aria-label', (opts.label || 'Évolution') + (hasRef ? ' · seuil ' + (opts.refLabel || opts.ref) : '') + ' · tendance ' + ({ up: 'en hausse', down: 'en baisse' }[opts.trend] || 'stable'));
}
function chronoClosedTrades() {
  return [...analysisTrades()].reverse().filter(t => ['TP','SL','BE'].includes(t.res));
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
// Effets de la courbe d'équité (tous les thèmes) : remplissage qui s'estompe vers la ligne de départ, lueur de la
// couleur d'accent sous la ligne, point qui pulse (élément HTML, voir .fx-pulse) quand le dernier point est un plus haut.
function fxFadeFill(ctx, color, a, reverse) {
  const h = ctx.canvas.clientHeight || ctx.canvas.height || 300, g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, withAlpha(color, reverse ? 0.01 : a)); g.addColorStop(1, withAlpha(color, reverse ? a : 0.01));
  return g;
}
function fxGlowPlugin(color) {
  return {
    id: 'fxGlow',
    beforeDatasetDraw(ch, args) { if (args.index !== 0) return; const c = ch.ctx; c.save(); c.shadowColor = withAlpha(color, .55); c.shadowBlur = 14; c.shadowOffsetY = 3; },
    afterDatasetDraw(ch, args) { if (args.index === 0) ch.ctx.restore(); }
  };
}
function fxPeakPulsePlugin(idx) {
  const drop = ch => { const el = ch.canvas.parentNode && ch.canvas.parentNode.querySelector('.fx-pulse'); if (el) el.remove(); };
  return {
    id: 'fxPeakPulse',
    afterDraw(ch) {
      const wrap = ch.canvas.parentNode, pt = idx >= 0 && ch.getDatasetMeta(0).data[idx];
      if (!wrap || !pt || typeof fxOn !== 'function' || !fxOn()) { drop(ch); return; }
      let el = wrap.querySelector('.fx-pulse');
      if (!el) { el = document.createElement('span'); el.className = 'fx-pulse'; el.setAttribute('aria-hidden', 'true'); wrap.appendChild(el); }
      el.style.left = (ch.canvas.offsetLeft + pt.x) + 'px'; el.style.top = (ch.canvas.offsetTop + pt.y) + 'px';
    },
    beforeDestroy: drop
  };
}
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
  Chart.defaults.font.size = 12;
  Chart.defaults.color = t.txt3;
  Chart.defaults.borderColor = t.border;
  Chart.defaults.animation.duration = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350;
  Chart.defaults.plugins.legend.display = false;
  if (LANG !== 'fr' && !Chart.registry.plugins.get('i18n')) Chart.register(I18N_CHART_PLUGIN);
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
        label = tr(label);
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
  text = tr(text);
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
  if (a >= 1e6) return sign + (a / 1e6).toLocaleString(UI_LOCALE, { maximumFractionDigits: 1 }) + ' M€';
  if (a >= 1e4) return sign + (a / 1e3).toLocaleString(UI_LOCALE, { maximumFractionDigits: 1 }) + ' k€';
  return sign + Math.round(a).toLocaleString(UI_LOCALE) + ' €';
}
function fmtDateFR(iso, withYear) {
  const d = new Date(String(iso) + 'T00:00:00');
  if (isNaN(d)) return String(iso || '');
  const s = d.toLocaleDateString(UI_LOCALE, withYear ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: '2-digit', month: '2-digit' });
  return s.replace(/,/g, '');   // « Wed, 17 Jun 2026 » → « Wed 17 Jun 2026 » (même forme dans toutes les langues)
}
// Date et heure courtes (« 17/06/2026 16:00 »), même forme dans toutes les langues.
function fmtDateTime(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(UI_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString(UI_LOCALE, { hour: '2-digit', minute: '2-digit' });
}
// Cellule de tableau : barre divergente autour de zéro (vert à droite, rouge à gauche) + valeur alignée.
function divBarCell(v, maxAbs, label) {
  const w = maxAbs > 0 ? Math.min(Math.abs(v) / maxAbs, 1) * 50 : 0;
  return html`<div class="cell-bar"><div class="div-bar"><span class="${raw(v >= 0 ? 'pos' : 'neg')}" style="${raw('width:' + w + '%')}"></span></div><span class="cb-val tone-${raw(v > 0 ? 'green' : v < 0 ? 'red' : 'txt2')}">${label}</span></div>`;
}
// Cellule de tableau : jauge de win rate (0–100 %) avec repère du seuil de rentabilité.
function wrBarCell(rate, thr, n) {
  if (rate === null || rate === undefined || isNaN(rate)) return '—';
  const tone = thr === null || thr === undefined ? 'accent' : (rate >= thr ? 'green' : 'red');
  return html`<div class="cell-bar"><div class="meter"><div class="meter-fill fill-${raw(tone)}${raw(n < 10 ? ' dim' : '')}" style="${raw('width:' + rate * 100 + '%')}"></div>${thr != null ? html`<div class="meter-tick cb-tick" style="${raw(`left:calc(${thr * 100}% - 1px)`)}"></div>` : ''}</div><span class="cb-val">${fmtNum(rate * 100, 1)} %</span></div>`;
}
// Formats FR uniques : virgule décimale, espace avant % (« 53,3 % »), R signé (« +1,80R »).
function fmtNum(v, d) { return Number(v).toLocaleString(UI_LOCALE, { minimumFractionDigits: d ?? 0, maximumFractionDigits: d ?? 0 }); }
function fmtR(v, d, noSign) { if (v === null || v === undefined || isNaN(v)) return '—'; return (!noSign && v > 0 ? '+' : v < 0 ? '−' : '') + fmtNum(Math.abs(v), d ?? 2) + 'R'; }
// Date numérique FR : « 15/06/2026 ».
function fmtDateNum(iso) { const d = new Date(String(iso) + 'T00:00:00'); return isNaN(d) ? String(iso || '—') : d.toLocaleDateString(UI_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function fmtRate(v, d) { return (v === null || v === undefined || isNaN(v)) ? '—' : fmtNum(v, d ?? 0) + ' %'; }
function fmtPct(v, digits) { return (v >= 0 ? '+' : '') + v.toLocaleString(UI_LOCALE, { minimumFractionDigits: digits ?? 1, maximumFractionDigits: digits ?? 1 }) + ' %'; }
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
    const b = document.createElement('b'); b.textContent = v; if (col) b.className = 'tone-' + col;
    r.appendChild(a); r.appendChild(b); tip.appendChild(r);
  });
  tip.classList.add('show'); positionCalTooltip(e);
}
function fmtEUR(n, showPlus, decimals) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  decimals = decimals || 0;
  const sign = n < 0 ? '-' : (showPlus ? '+' : '');
  return sign + Math.abs(n).toLocaleString(UI_LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' €';
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
// Badge d'évolution d'une carte : variation sur les 10 derniers trades (vs les 10 précédents).
function trendBadge(elId, delta, suffix, digits, title, dirOverride) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (delta === null || delta === undefined || isNaN(delta)) { el.textContent = ''; el.className = 'kpi-trend'; el.removeAttribute('title'); return; }
  const dir = dirOverride || (Math.abs(delta) < 0.05 ? 'flat' : (delta > 0 ? 'up' : 'down'));
  el.textContent = (dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : '→ ') + (delta >= 0 ? '+' : '−') + fmtNum(Math.abs(delta), digits ?? 1) + (suffix || '');
  el.className = 'kpi-trend ' + dir;
  el.title = title || '';
}

// Mini-courbes des cartes : valeur glissante (fenêtre de trades) pour une tendance lisible, pas un zigzag par paquet.
const KPI_WINDOW = 10;
// Les mini-courbes sont dessinées au pixel près : on les redessine quand la largeur des cartes change.
let __sparkResizeT = null;
window.addEventListener('resize', () => { clearTimeout(__sparkResizeT); __sparkResizeT = setTimeout(() => { if (currentPage() === 'dashboard') safeRun(renderKpiSparklines, 'renderKpiSparklines'); }, 150); });
function renderKpiSparklines() {
  const closed = chronoClosedTrades();
  // Forme récente : les 10 derniers trades clos, du plus ancien au plus récent.
  mount('k-form-dots', html`${closed.slice(-10).map(t => html`<span class="${raw(t.res === 'TP' ? 'fill-green' : t.res === 'SL' ? 'fill-red' : 'fill-amber')}" title="${t.date || ''} · ${t.res}"></span>`)}`);
  const ids = ['wr', 'pnl', 'rr', 'pf'];
  if (closed.length < KPI_WINDOW + 2) {
    ids.forEach(k => { mount('k-' + k + '-spark', ''); trendBadge('k-' + k + '-trend', null); });
    return;
  }
  const eurOf = t => (t.pnlEur !== null && t.pnlEur !== undefined) ? t.pnlEur : 0;
  const win = (i, w) => closed.slice(Math.max(0, i - w), i);
  const wrAt = i => { const b = win(i, KPI_WINDOW * 2), w = b.filter(t => t.res === 'TP').length, l = b.filter(t => t.res === 'SL').length; return w + l ? w / (w + l) * 100 : 0; };
  const cum = []; closed.reduce((c, t, i) => (cum[i + 1] = c + (t.pnl || 0)), 0); cum[0] = 0;
  const payoffAt = i => { const b = win(i, KPI_WINDOW * 2), w = b.filter(t => t.res === 'TP'), l = b.filter(t => t.res === 'SL'); const aw = w.length ? w.reduce((s, t) => s + eurOf(t), 0) / w.length : 0, al = l.length ? Math.abs(l.reduce((s, t) => s + eurOf(t), 0) / l.length) : 0; return al > 0 ? Math.min(aw / al, 6) : null; };
  const pfAt = i => { const b = win(i, KPI_WINDOW * 2), gw = b.filter(t => t.res === 'TP').reduce((s, t) => s + eurOf(t), 0), gl = Math.abs(b.filter(t => t.res === 'SL').reduce((s, t) => s + eurOf(t), 0)); return gl > 0 ? Math.min(gw / gl, 5) : null; };
  // Au plus ~30 points, régulièrement espacés, du KPI_WINDOW-ième trade au dernier.
  const n = closed.length, steps = Math.min(30, n - KPI_WINDOW + 1);
  const at = [...new Set(Array.from({ length: steps }, (_, j) => Math.round(KPI_WINDOW + (n - KPI_WINDOW) * j / Math.max(1, steps - 1))))];
  const series = f => at.map(f).filter(v => v !== null);
  const prev = n - KPI_WINDOW, T = ' sur les ' + KPI_WINDOW + ' derniers trades, comparé aux ' + KPI_WINDOW + ' précédents';
  const d = (f) => { const a = f(n), b = f(prev); return a === null || b === null ? null : a - b; };
  const be = breakevenWinRate(), beP = be !== null ? Math.round(be * 100) : 50;
  // Chaque carte : [clé, série, variation récente, suffixe, décimales, info-bulle, seuil, libellé du seuil, écart « stable » du badge]
  [['wr', wrAt, d(wrAt), ' pts', 0, 'Win rate (20 trades glissants)' + T, beP, be !== null ? 'seuil ' + beP + ' %' : '50 %', 0.5],
   ['pnl', i => cum[i], cum[n] - cum[prev], 'R', 1, 'R gagnés sur les ' + KPI_WINDOW + ' derniers trades', 0, '0R', 0.05],
   ['rr', payoffAt, d(payoffAt), '', 2, 'Payoff (20 trades glissants)' + T, 1, '1,0', 0.05],
   ['pf', pfAt, d(pfAt), '', 2, 'Profit factor (20 trades glissants)' + T, 1, '1,0', 0.05]
  ].forEach(([k, f, delta, suf, dig, title, ref, refLabel, flat]) => {
    const trend = delta === null || Math.abs(delta) < flat ? 'flat' : delta > 0 ? 'up' : 'down';
    renderSparklineInto('k-' + k + '-spark', series(f), { ref, refLabel, trend, label: title });
    trendBadge('k-' + k + '-trend', delta, suf, dig, title, trend);
  });
}

