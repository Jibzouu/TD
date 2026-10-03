// ── REPLAY : GRAPHIQUE FAÇON TRADINGVIEW ─────────────────────────────
// Types de graphique (bougies, bougies creuses, barres, ligne, zone, Heikin Ashi), volume, indicateurs
// (moyennes mobiles simples / exponentielles, Bollinger, VWAP), légende OHLC qui suit la souris, filigrane du symbole,
// échelle automatique / logarithmique et bouton « revenir au dernier cours ».
// Les indicateurs ne sont calculés que sur les bougies déjà affichées : jamais de futur.

const RPC_UP = '#089981', RPC_DOWN = '#f23645';
const RPC_TYPES = [
  ['candles', 'Bougies', '<path d="M9 6v4M9 18v4M19 4v5M19 19v5"/><rect x="6.5" y="10" width="5" height="8" rx=".5" fill="currentColor"/><rect x="16.5" y="9" width="5" height="10" rx=".5"/>'],
  ['hollow', 'Bougies creuses', '<path d="M9 6v4M9 18v4M19 4v5M19 19v5"/><rect x="6.5" y="10" width="5" height="8" rx=".5"/><rect x="16.5" y="9" width="5" height="10" rx=".5"/>'],
  ['bars', 'Barres', '<path d="M9 5v18M6 9h3M9 19h3M19 4v18M16 17h3M19 8h3"/>'],
  ['line', 'Ligne', '<path d="M4 20l6-7 5 4 9-11"/>'],
  ['area', 'Zone', '<path d="M4 20l6-7 5 4 9-11v18H4z" fill="currentColor" fill-opacity=".25"/><path d="M4 20l6-7 5 4 9-11"/>'],
  ['ha', 'Heikin Ashi', '<path d="M9 5v5M9 18v5M19 4v5M19 19v5"/><rect x="6.5" y="10" width="5" height="8" rx="1.5" fill="currentColor"/><rect x="16.5" y="9" width="5" height="10" rx="1.5" fill="currentColor" fill-opacity=".4"/>']
];
const RPC_INDS = [
  { id: 'vol', label: 'Volume' },
  { id: 'sma20', label: 'Moyenne mobile 20', short: 'MM 20', type: 'sma', len: 20, color: '#2962ff' },
  { id: 'sma50', label: 'Moyenne mobile 50', short: 'MM 50', type: 'sma', len: 50, color: '#ff9800' },
  { id: 'sma200', label: 'Moyenne mobile 200', short: 'MM 200', type: 'sma', len: 200, color: '#e91e63' },
  { id: 'ema9', label: 'Moyenne mobile exponentielle 9', short: 'MME 9', type: 'ema', len: 9, color: '#00bcd4' },
  { id: 'ema21', label: 'Moyenne mobile exponentielle 21', short: 'MME 21', type: 'ema', len: 21, color: '#9c27b0' },
  { id: 'ema200', label: 'Moyenne mobile exponentielle 200', short: 'MME 200', type: 'ema', len: 200, color: '#f7c948' },
  { id: 'bb', label: 'Bandes de Bollinger (20, 2)', short: 'BB 20 2', type: 'bb', len: 20, mult: 2, color: '#2962ff' },
  { id: 'vwap', label: 'VWAP (séance du jour)', short: 'VWAP', type: 'vwap', color: '#ff6d00' }
];
let RPC_S = { vol: null, ind: {}, cache: {} };

function rpcType() { return (RP && RP.chartType) || 'candles'; }
function rpcInds() { if (!RP) return []; if (!Array.isArray(RP.inds)) RP.inds = ['vol']; return RP.inds; }
function rpcAlpha(c, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
const RPC_FONT = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, "Segoe UI", sans-serif';

function rpcChartOptions(k) {
  return {
    autoSize: true,
    layout: { background: { type: 'solid', color: k.bg }, textColor: k.txt, fontFamily: RPC_FONT, fontSize: 12, attributionLogo: true },
    grid: { vertLines: { color: rpcAlpha(k.grid, 0.55) }, horzLines: { color: rpcAlpha(k.grid, 0.55) } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: rpcInds().includes('vol') ? 0.2 : 0.08 } },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 12, barSpacing: 8, minBarSpacing: 1.5 },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: '#758696', width: 1, style: LightweightCharts.LineStyle.LargeDashed, labelBackgroundColor: '#363a45' },
      horzLine: { color: '#758696', width: 1, style: LightweightCharts.LineStyle.LargeDashed, labelBackgroundColor: '#363a45' }
    },
    watermark: { visible: true, text: rpAsset(RP.symbol) + ' · ' + rpTf(RP.interval)[2], fontSize: 54, fontFamily: RPC_FONT, fontStyle: '600', color: rpcAlpha(k.txt.startsWith('#') ? k.txt : '#9598a1', 0.05), horzAlign: 'center', vertAlign: 'center' },
    localization: { locale: UI_LOCALE, priceFormatter: p => rpPrice(p) },
    kineticScroll: { touch: true, mouse: false }
  };
}

// ── Données ──
function rpcBars() { return RPC.slice(0, RP.cursor + 1); }
// Heikin Ashi : bougie lissée i (dépend de la précédente).
function rpcHA(bars, i, prev) {
  const c = bars[i], close = (c.open + c.high + c.low + c.close) / 4;
  const open = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
  return { time: c.time, open, high: Math.max(c.high, open, close), low: Math.min(c.low, open, close), close };
}
function rpcPoint(c, ha) {
  const t = rpLocalShift(c.time), type = rpcType(), b = ha || c;
  if (type === 'line' || type === 'area') return { time: t, value: c.close };
  const p = { time: t, open: b.open, high: b.high, low: b.low, close: b.close };
  if (type === 'hollow') { const up = b.close >= b.open; p.color = up ? 'rgba(0,0,0,0)' : RPC_DOWN; p.borderColor = up ? RPC_UP : RPC_DOWN; p.wickColor = up ? RPC_UP : RPC_DOWN; }
  return p;
}
function rpcVolPoint(c) { return { time: rpLocalShift(c.time), value: c.volume || 0, color: c.close >= c.open ? rpcAlpha(RPC_UP, 0.45) : rpcAlpha(RPC_DOWN, 0.45) }; }

// Indicateurs : valeurs alignées sur l'index des bougies (null tant que la fenêtre n'est pas pleine).
function rpcCalc(ind, bars) {
  const n = bars.length, out = new Array(n).fill(null);
  if (ind.type === 'sma' || ind.type === 'bb') {
    let sum = 0, sq = 0;
    for (let i = 0; i < n; i++) {
      const v = bars[i].close; sum += v; sq += v * v;
      if (i >= ind.len) { const o = bars[i - ind.len].close; sum -= o; sq -= o * o; }
      if (i >= ind.len - 1) {
        const m = sum / ind.len;
        out[i] = ind.type === 'sma' ? m : { m, sd: Math.sqrt(Math.max(0, sq / ind.len - m * m)) };
      }
    }
  } else if (ind.type === 'ema') {
    const k = 2 / (ind.len + 1); let e = null, sum = 0;
    for (let i = 0; i < n; i++) {
      const v = bars[i].close;
      if (i < ind.len) { sum += v; if (i === ind.len - 1) { e = sum / ind.len; out[i] = e; } continue; }
      e = v * k + e * (1 - k); out[i] = e;
    }
  } else if (ind.type === 'vwap') {
    let day = null, pv = 0, vv = 0;
    for (let i = 0; i < n; i++) {
      const c = bars[i], d = Math.floor(c.time / 86400), tp = (c.high + c.low + c.close) / 3, vol = c.volume || 1;
      if (d !== day) { day = d; pv = 0; vv = 0; }
      pv += tp * vol; vv += vol; out[i] = pv / vv;
    }
  }
  return out;
}
function rpcLineData(bars, vals, f) {
  const out = [];
  for (let i = 0; i < bars.length; i++) { const v = vals[i]; if (v != null) out.push({ time: rpLocalShift(bars[i].time), value: f ? f(v) : v }); }
  return out;
}

// ── Séries ──
function rpcBuild(k) {
  const type = rpcType();
  const base = { priceLineVisible: true, priceLineStyle: LightweightCharts.LineStyle.Dotted, priceLineWidth: 1, lastValueVisible: true };
  if (type === 'bars') RP_SERIES = RP_CHART.addBarSeries(Object.assign({ upColor: RPC_UP, downColor: RPC_DOWN, thinBars: false }, base));
  else if (type === 'line') RP_SERIES = RP_CHART.addLineSeries(Object.assign({ color: '#2962ff', lineWidth: 2 }, base));
  else if (type === 'area') RP_SERIES = RP_CHART.addAreaSeries(Object.assign({ lineColor: '#2962ff', topColor: 'rgba(41,98,255,.28)', bottomColor: 'rgba(41,98,255,.02)', lineWidth: 2 }, base));
  else RP_SERIES = RP_CHART.addCandlestickSeries(Object.assign({ upColor: RPC_UP, downColor: RPC_DOWN, borderUpColor: RPC_UP, borderDownColor: RPC_DOWN, wickUpColor: RPC_UP, wickDownColor: RPC_DOWN }, base));
  RPC_S = { vol: null, ind: {}, cache: {}, ha: [] };
  if (rpcInds().includes('vol')) {
    RPC_S.vol = RP_CHART.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
    RP_CHART.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
  }
  rpcInds().forEach(id => {
    const ind = RPC_INDS.find(x => x.id === id);
    if (!ind || id === 'vol') return;
    const opt = { color: ind.color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    RPC_S.ind[id] = ind.type === 'bb'
      ? [RP_CHART.addLineSeries(Object.assign({}, opt, { lineWidth: 1 })), RP_CHART.addLineSeries(Object.assign({}, opt, { color: '#f23645', lineWidth: 1 })), RP_CHART.addLineSeries(Object.assign({}, opt, { lineWidth: 1 }))]
      : [RP_CHART.addLineSeries(opt)];
  });
  rpcSetAll();
}
function rpcSetAll() {
  const bars = rpcBars(), type = rpcType();
  if (type === 'ha') { const ha = []; bars.forEach((c, i) => ha.push(rpcHA(bars, i, ha[i - 1]))); RPC_S.ha = ha; RP_SERIES.setData(bars.map((c, i) => rpcPoint(c, ha[i]))); }
  else RP_SERIES.setData(bars.map(c => rpcPoint(c)));
  if (RPC_S.vol) RPC_S.vol.setData(bars.map(rpcVolPoint));
  Object.keys(RPC_S.ind).forEach(id => {
    const ind = RPC_INDS.find(x => x.id === id), vals = rpcCalc(ind, bars), s = RPC_S.ind[id];
    RPC_S.cache[id] = vals;
    if (ind.type === 'bb') { s[0].setData(rpcLineData(bars, vals, v => v.m + ind.mult * v.sd)); s[1].setData(rpcLineData(bars, vals, v => v.m)); s[2].setData(rpcLineData(bars, vals, v => v.m - ind.mult * v.sd)); }
    else s[0].setData(rpcLineData(bars, vals));
  });
}
// Nouvelle bougie affichée (lecture) : mise à jour incrémentale.
function rpcPush(c) {
  if (!RP_SERIES) return;
  const i = RP.cursor;
  if (rpcType() === 'ha') { const h = rpcHA(RPC, i, RPC_S.ha[i - 1]); RPC_S.ha[i] = h; RP_SERIES.update(rpcPoint(c, h)); }
  else RP_SERIES.update(rpcPoint(c));
  if (RPC_S.vol) RPC_S.vol.update(rpcVolPoint(c));
  Object.keys(RPC_S.ind).forEach(id => {
    const ind = RPC_INDS.find(x => x.id === id), s = RPC_S.ind[id], cache = RPC_S.cache[id] || [];
    let v = null;
    if (ind.type === 'ema') { const prev = cache[i - 1]; v = prev != null ? c.close * (2 / (ind.len + 1)) + prev * (1 - 2 / (ind.len + 1)) : rpcCalc(ind, RPC.slice(0, i + 1))[i]; }
    else if (ind.type === 'vwap') v = rpcCalc(ind, RPC.slice(Math.max(0, i - 1500), i + 1)).pop();
    else v = rpcCalc(ind, RPC.slice(Math.max(0, i - ind.len + 1), i + 1)).pop();
    cache[i] = v; RPC_S.cache[id] = cache;
    if (v == null) return;
    const t = rpLocalShift(c.time);
    if (ind.type === 'bb') { s[0].update({ time: t, value: v.m + ind.mult * v.sd }); s[1].update({ time: t, value: v.m }); s[2].update({ time: t, value: v.m - ind.mult * v.sd }); }
    else s[0].update({ time: t, value: v });
  });
}

// ── Légende (en haut à gauche) ──
function rpcFmtVol(v) { return v >= 1e9 ? fmtNum(v / 1e9, 2) + ' B' : v >= 1e6 ? fmtNum(v / 1e6, 2) + ' M' : v >= 1e3 ? fmtNum(v / 1e3, 2) + ' K' : fmtNum(v, 2); }
function rpcLegend(idx) {
  const el = document.getElementById('rp-legend');
  if (!el || !RP || !RPC.length) return;
  const i = idx == null ? RP.cursor : Math.max(0, Math.min(RP.cursor, idx)), c = RPC[i], prev = RPC[i - 1] || c;
  const b = rpcType() === 'ha' && RPC_S.ha[i] ? RPC_S.ha[i] : c;
  const up = b.close >= b.open, col = up ? RPC_UP : RPC_DOWN, ch = c.close - prev.close;
  const v = (l, x) => '<span class="rp-lg-k">' + l + '</span><span class="rp-lg-v" style="color:' + col + '">' + rpPrice(x) + '</span>';
  let h = '<div class="rp-lg-row rp-lg-main"><span class="rp-lg-sym">' + escHtmlAttr(rpAsset(RP.symbol)) + '</span><span class="rp-lg-dot">·</span><span>' + rpTf(RP.interval)[2] + '</span><span class="rp-lg-dot">·</span><span class="rp-lg-src">' + (RP.source === 'file' ? escHtmlAttr(tr('Fichier')) : 'Binance') + '</span>'
    + '<span class="rp-lg-ohlc">' + v('O', b.open) + v('H', b.high) + v(LANG === 'en' ? 'L' : 'B', b.low) + v('C', b.close)
    + '<span class="rp-lg-v" style="color:' + (ch >= 0 ? RPC_UP : RPC_DOWN) + '">' + (ch >= 0 ? '+' : '−') + rpPrice(Math.abs(ch), c.close) + ' (' + (ch >= 0 ? '+' : '−') + fmtNum(Math.abs(ch / prev.close * 100), 2) + ' %)</span></span></div>';
  rpcInds().forEach(id => {
    const ind = RPC_INDS.find(x => x.id === id); if (!ind) return;
    let val = '';
    if (id === 'vol') val = '<span class="rp-lg-v" style="color:' + col + '">' + rpcFmtVol(c.volume || 0) + '</span>';
    else {
      const x = (RPC_S.cache[id] || [])[i];
      if (x != null) val = ind.type === 'bb'
        ? ['m', 'u', 'l'].map(k2 => '<span class="rp-lg-v" style="color:' + (k2 === 'm' ? '#f23645' : ind.color) + '">' + rpPrice(k2 === 'm' ? x.m : k2 === 'u' ? x.m + ind.mult * x.sd : x.m - ind.mult * x.sd) + '</span>').join('')
        : '<span class="rp-lg-v" style="color:' + ind.color + '">' + rpPrice(x) + '</span>';
    }
    h += '<div class="rp-lg-row rp-lg-ind"><span class="rp-lg-name">' + escHtmlAttr(tr(id === 'vol' ? 'Vol' : ind.short)) + '</span>' + val
      + '<button type="button" class="rp-lg-x" title="' + escHtmlAttr(tr('Retirer')) + '" aria-label="' + escHtmlAttr(tr('Retirer')) + '" onclick="rpcToggleInd(\'' + id + '\')">×</button></div>';
  });
  el.innerHTML = h;
}
function rpcOnCrosshair(param) {
  const l = param && param.point && param.logical != null ? Math.round(param.logical) : null;
  rpcLegend(l != null && l <= RP.cursor && l >= 0 ? l : null);
}

// ── Menus : type de graphique, indicateurs ──
function rpcSetType(t) { if (!RP) return; RP.chartType = t; rpSave(); rpcCloseMenus(); rpBuildChart(); rpRefreshUi(); }
function rpcToggleInd(id) {
  if (!RP) return;
  const list = rpcInds(), i = list.indexOf(id);
  if (i > -1) list.splice(i, 1); else list.push(id);
  rpSave(); rpBuildChart(); rpRefreshUi(); rpcRenderMenus();
}
function rpcCloseMenus() { document.querySelectorAll('.rp-dd').forEach(m => { m.hidden = true; }); }
function rpcOpen(id, btn) {
  const m = document.getElementById(id); if (!m) return;
  const was = !m.hidden;
  rpcCloseMenus();
  if (was) return;
  rpcRenderMenus();
  m.hidden = false;
  const r = btn.getBoundingClientRect(), pr = m.offsetParent ? m.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
  m.style.left = (r.left - pr.left) + 'px'; m.style.top = (r.bottom - pr.top + 4) + 'px';
}
function rpcRenderMenus() {
  const ty = document.getElementById('rp-dd-type');
  if (ty) ty.innerHTML = RPC_TYPES.map(([id, l, ic]) => '<button type="button" class="rp-dd-it' + (rpcType() === id ? ' on' : '') + '" onclick="rpcSetType(\'' + id + '\')"><svg viewBox="0 0 28 28" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">' + ic + '</svg>' + escHtmlAttr(tr(l)) + '</button>').join('');
  const ind = document.getElementById('rp-dd-ind');
  if (ind) ind.innerHTML = '<div class="rp-dd-title">' + escHtmlAttr(tr('Indicateurs')) + '</div>' + RPC_INDS.map(x => '<label class="rp-dd-it rp-dd-chk"><input type="checkbox" ' + (rpcInds().includes(x.id) ? 'checked' : '') + ' onchange="rpcToggleInd(\'' + x.id + '\')"><span class="rp-dd-sw" style="background:' + (x.color || '#8a8f98') + '"></span>' + escHtmlAttr(tr(x.label)) + '</label>').join('');
  const tb = document.getElementById('rp-type-btn');
  if (tb) { const t = RPC_TYPES.find(x => x[0] === rpcType()); tb.innerHTML = '<svg viewBox="0 0 28 28" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">' + t[2] + '</svg>'; tb.title = tr('Type de graphique') + ' : ' + tr(t[1]); }
}
document.addEventListener('pointerdown', e => { if (!e.target.closest('.rp-dd') && !e.target.closest('[data-dd]')) rpcCloseMenus(); });

// ── Échelle : automatique, logarithmique, retour au dernier cours ──
function rpcScale(k) {
  if (!RP_CHART || !RP) return;
  if (k === 'log') RP.logScale = !RP.logScale;
  if (k === 'auto') RP_CHART.priceScale('right').applyOptions({ autoScale: true });
  RP_CHART.priceScale('right').applyOptions({ mode: RP.logScale ? 1 : 0 });
  rpSave(); rpcScaleUi();
}
function rpcScaleUi() {
  const lg = document.getElementById('rp-sc-log'); if (lg) lg.classList.toggle('on', !!(RP && RP.logScale));
  const au = document.getElementById('rp-sc-auto');
  if (au && RP_CHART) { let a = true; try { a = RP_CHART.priceScale('right').options().autoScale; } catch (e) {} au.classList.toggle('on', a !== false); }
}
function rpcRealtime() { if (RP_CHART) RP_CHART.timeScale().scrollToRealTime(); }
function rpcOnRange(r) {
  const b = document.getElementById('rp-to-rt');
  if (b && RP) b.hidden = !r || r.to >= RP.cursor - 1;
  rpcScaleUi();
}
function rpcAttach() {
  RP_CHART.subscribeCrosshairMove(rpcOnCrosshair);
  RP_CHART.timeScale().subscribeVisibleLogicalRangeChange(rpcOnRange);
  if (RP.logScale) RP_CHART.priceScale('right').applyOptions({ mode: 1 });
  rpcRenderMenus(); rpcLegend(); rpcScaleUi();
}
