// ── REPLAY : GRAPHIQUE FAÇON TRADINGVIEW ─────────────────────────────
// Types de graphique (bougies, bougies creuses, barres, ligne, zone, Heikin Ashi), indicateurs sur le graphique
// et en panneaux séparés sous le graphique (synchronisés : défilement, zoom, réticule), légende OHLC qui suit la souris,
// filigrane, couleurs personnalisables, échelle auto / log, retour au dernier cours, disposition à 2 graphiques
// (unité de temps supérieure), plein écran et panneau d'ordre masquable.
// Les indicateurs ne sont calculés que sur les bougies déjà affichées : jamais de futur.

const RPC_TYPES = [
  ['candles', 'Bougies', '<path d="M9 6v4M9 18v4M19 4v5M19 19v5"/><rect x="6.5" y="10" width="5" height="8" rx=".5" fill="currentColor"/><rect x="16.5" y="9" width="5" height="10" rx=".5"/>'],
  ['hollow', 'Bougies creuses', '<path d="M9 6v4M9 18v4M19 4v5M19 19v5"/><rect x="6.5" y="10" width="5" height="8" rx=".5"/><rect x="16.5" y="9" width="5" height="10" rx=".5"/>'],
  ['bars', 'Barres', '<path d="M9 5v18M6 9h3M9 19h3M19 4v18M16 17h3M19 8h3"/>'],
  ['line', 'Ligne', '<path d="M4 20l6-7 5 4 9-11"/>'],
  ['area', 'Zone', '<path d="M4 20l6-7 5 4 9-11v18H4z" fill="currentColor" fill-opacity=".25"/><path d="M4 20l6-7 5 4 9-11"/>'],
  ['ha', 'Heikin Ashi', '<path d="M9 5v5M9 18v5M19 4v5M19 19v5"/><rect x="6.5" y="10" width="5" height="8" rx="1.5" fill="currentColor"/><rect x="16.5" y="9" width="5" height="10" rx="1.5" fill="currentColor" fill-opacity=".4"/>']
];
const RPC_FONT = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, "Segoe UI", sans-serif';
const RPC_STYLE_DEF = { up: '#089981', down: '#f23645', borderUp: '#089981', borderDown: '#f23645', wickUp: '#089981', wickDown: '#f23645', bg: '', grid: true, watermark: true, volUp: '#089981', volDown: '#f23645' };
let RPC_S = { ser: {}, cache: {}, ha: [] };   // séries et valeurs des indicateurs du graphique principal (par instance)
let RPC_PANES = [];                           // panneaux d'oscillateurs : { inst, el, chart, ser }
let RPC_2 = null;                             // second graphique (unité de temps supérieure)
let RPC_SYNC = 0, RPC_ST = RPC_STYLE_DEF;

function rpcType() { return (RP && RP.chartType) || 'candles'; }
function rpcStyle() { const s = loadJSON('g_rp_style', null); return Object.assign({}, RPC_STYLE_DEF, s && typeof s === 'object' ? s : {}); }
function rpcAlpha(c, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
function rpcFmtVol(v) { const a = Math.abs(v), s = v < 0 ? '−' : ''; return s + (a >= 1e9 ? fmtNum(a / 1e9, 2) + ' B' : a >= 1e6 ? fmtNum(a / 1e6, 2) + ' M' : a >= 1e3 ? fmtNum(a / 1e3, 2) + ' K' : fmtNum(a, 2)); }

function rpcChartOptions(k, pane) {
  const st = RPC_ST, bg = st.bg || k.bg, fmt = pane ? RPI_DEFS[pane.id].fmt : null;
  return {
    autoSize: true,
    layout: { background: { type: 'solid', color: bg }, textColor: k.txt, fontFamily: RPC_FONT, fontSize: 12, attributionLogo: !pane },
    grid: { vertLines: { color: rpcAlpha(k.grid, 0.55), visible: st.grid }, horzLines: { color: rpcAlpha(k.grid, 0.55), visible: st.grid } },
    rightPriceScale: { borderVisible: false, minimumWidth: 78, scaleMargins: pane ? { top: 0.12, bottom: 0.08 } : { top: 0.1, bottom: rpcInds().some(x => x.id === 'vol' && !x.hidden) ? 0.2 : 0.08 } },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 12, barSpacing: 8, minBarSpacing: 1.5, visible: !pane },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: '#758696', width: 1, style: LightweightCharts.LineStyle.LargeDashed, labelBackgroundColor: '#363a45' },
      horzLine: { color: '#758696', width: 1, style: LightweightCharts.LineStyle.LargeDashed, labelBackgroundColor: '#363a45' }
    },
    watermark: { visible: !pane && st.watermark, text: rpAsset(RP.symbol) + ' · ' + rpTf(RP.interval)[2], fontSize: 54, fontFamily: RPC_FONT, fontStyle: '600', color: rpcAlpha(k.txt.startsWith('#') ? k.txt : '#9598a1', 0.05), horzAlign: 'center', vertAlign: 'center' },
    localization: { locale: UI_LOCALE, priceFormatter: fmt === 'vol' ? rpcFmtVol : fmt === 2 ? (p => fmtNum(p, 2)) : pane ? (p => rpPrice(p, RPC[RP.cursor] ? RPC[RP.cursor].close : p)) : (p => rpPrice(p)) },
    kineticScroll: { touch: true, mouse: false }
  };
}

// ── Données ──
function rpcBars() { return RPC.slice(0, RP.cursor + 1); }
function rpcHA(bars, i, prev) {
  const c = bars[i], close = (c.open + c.high + c.low + c.close) / 4;
  const open = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
  return { time: c.time, open, high: Math.max(c.high, open, close), low: Math.min(c.low, open, close), close };
}
function rpcPoint(c, ha) {
  const t = rpLocalShift(c.time), type = rpcType(), b = ha || c, st = RPC_ST;
  if (type === 'line' || type === 'area') return { time: t, value: c.close };
  const p = { time: t, open: b.open, high: b.high, low: b.low, close: b.close };
  if (type === 'hollow') { const up = b.close >= b.open; p.color = up ? 'rgba(0,0,0,0)' : st.down; p.borderColor = up ? st.borderUp : st.borderDown; p.wickColor = up ? st.wickUp : st.wickDown; }
  return p;
}
// Temps de l'index j (au-delà de la dernière bougie : prolongé à pas réguliers, pour les tracés décalés vers l'avant).
function rpcTimeAt(j) { const n = RP.cursor; return j <= n ? RPC[j].time : RPC[n].time + (j - n) * rpTfSec(RP.interval); }
function rpcOffsets(inst) { const d = RPI_DEFS[inst.id]; return d.offsets ? d.offsets(inst.p) : {}; }
function rpcPlotPoint(inst, k, vals, i, off) {
  const t = rpLocalShift(rpcTimeAt(i + off)), v = vals[i], d = RPI_DEFS[inst.id];
  if (v == null || isNaN(v)) return { time: t };
  const pt = { time: t, value: v };
  if (inst.id === 'vol') { const c = RPC[i]; pt.color = rpcAlpha(c.close >= c.open ? RPC_ST.volUp : RPC_ST.volDown, 0.45); }
  else if (d.histColor && k === 'hist') pt.color = d.histColor(vals, i);
  return pt;
}
function rpcPlotData(inst, k, vals) {
  const off = rpcOffsets(inst)[k] || 0, out = [];
  for (let i = 0; i < vals.length; i++) {
    if (i + off < 0) continue;
    const pt = rpcPlotPoint(inst, k, vals, i, off);
    if (pt.value == null && off) continue;   // pas d'espace vide pour les tracés décalés
    out.push(pt);
  }
  return out;
}

// ── Séries ──
function rpcMakeSeries(ch, inst, pane) {
  const d = RPI_DEFS[inst.id], out = {};
  d.plots.forEach(pl => {
    const st = inst.st[pl.k] || {};
    if (st.on === false) return;
    const common = { priceLineVisible: false, lastValueVisible: !!pane, crosshairMarkerVisible: false };
    if (inst.id === 'vol') out[pl.k] = ch.addHistogramSeries(Object.assign(common, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false }));
    else if (pl.type === 'hist') out[pl.k] = ch.addHistogramSeries(Object.assign(common, { color: st.color }));
    else if (pl.type === 'points') out[pl.k] = ch.addLineSeries(Object.assign(common, { color: st.color, lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: st.width || 2 }));
    else out[pl.k] = ch.addLineSeries(Object.assign(common, { color: st.color, lineWidth: st.width || 1 }));
  });
  if (inst.id === 'vol' && out.vol) ch.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
  const first = Object.values(out)[0];
  if (pane && first) (inst.lv || []).forEach(l => { if (l.on !== false) first.createPriceLine({ price: l.v, color: '#787b86', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dashed, axisLabelVisible: false }); });
  return out;
}
function rpcBuild(k) {
  RPC_ST = rpcStyle();
  const type = rpcType(), st = RPC_ST;
  const base = { priceLineVisible: true, priceLineStyle: LightweightCharts.LineStyle.Dotted, priceLineWidth: 1, lastValueVisible: true };
  if (type === 'bars') RP_SERIES = RP_CHART.addBarSeries(Object.assign({ upColor: st.up, downColor: st.down, thinBars: false }, base));
  else if (type === 'line') RP_SERIES = RP_CHART.addLineSeries(Object.assign({ color: '#2962ff', lineWidth: 2 }, base));
  else if (type === 'area') RP_SERIES = RP_CHART.addAreaSeries(Object.assign({ lineColor: '#2962ff', topColor: 'rgba(41,98,255,.28)', bottomColor: 'rgba(41,98,255,.02)', lineWidth: 2 }, base));
  else RP_SERIES = RP_CHART.addCandlestickSeries(Object.assign({ upColor: st.up, downColor: st.down, borderUpColor: st.borderUp, borderDownColor: st.borderDown, wickUpColor: st.wickUp, wickDownColor: st.wickDown }, base));
  rpcDestroyPanes();
  RPC_S = { ser: {}, cache: {}, ha: [] };
  rpcInds().forEach(inst => {
    if (inst.hidden || !RPI_DEFS[inst.id]) return;
    if (RPI_DEFS[inst.id].cat === 'pane') rpcMakePane(inst, k);
    else RPC_S.ser[inst.uid] = rpcMakeSeries(RP_CHART, inst, false);
  });
  rpcSetAll();
  // Échelle de temps en bas du dernier panneau (comme TradingView).
  RP_CHART.applyOptions({ timeScale: { visible: !RPC_PANES.length } });
  RPC_PANES.forEach((p, i) => p.chart.applyOptions({ timeScale: { visible: i === RPC_PANES.length - 1 } }));
  const mp = document.querySelector('.rp-pane-main'); if (mp) mp.classList.toggle('no-time', RPC_PANES.length > 0);
  rpc2Build(k);
}
function rpcSetAll() {
  const bars = rpcBars();
  if (rpcType() === 'ha') { const ha = []; bars.forEach((c, i) => ha.push(rpcHA(bars, i, ha[i - 1]))); RPC_S.ha = ha; RP_SERIES.setData(bars.map((c, i) => rpcPoint(c, ha[i]))); }
  else RP_SERIES.setData(bars.map(c => rpcPoint(c)));
  rpcEachInd((inst, ser) => {
    const vals = RPI_DEFS[inst.id].calc(bars, inst.p);
    RPC_S.cache[inst.uid] = vals;
    Object.keys(ser).forEach(k => ser[k].setData(rpcPlotData(inst, k, vals[k])));
  });
  RPC_PANES.forEach(p => { try { p.chart.timeScale().setVisibleLogicalRange(RP_CHART.timeScale().getVisibleLogicalRange()); } catch (e) {} });
}
function rpcEachInd(f) {
  rpcInds().forEach(inst => {
    if (inst.hidden || !RPI_DEFS[inst.id]) return;
    const pn = RPC_PANES.find(p => p.inst.uid === inst.uid), ser = pn ? pn.ser : RPC_S.ser[inst.uid];
    if (ser) f(inst, ser);
  });
}
// Nouvelle bougie affichée (lecture) : mise à jour incrémentale.
function rpcPush(c) {
  if (!RP_SERIES) return;
  const i = RP.cursor;
  if (rpcType() === 'ha') { const h = rpcHA(RPC, i, RPC_S.ha[i - 1]); RPC_S.ha[i] = h; RP_SERIES.update(rpcPoint(c, h)); }
  else RP_SERIES.update(rpcPoint(c));
  const bars = rpcBars();
  rpcEachInd((inst, ser) => {
    const vals = RPI_DEFS[inst.id].calc(bars, inst.p), offs = rpcOffsets(inst);
    RPC_S.cache[inst.uid] = vals;
    Object.keys(ser).forEach(k => {
      const off = offs[k] || 0;
      if (off) ser[k].setData(rpcPlotData(inst, k, vals[k]));
      else ser[k].update(rpcPlotPoint(inst, k, vals[k], i, 0));
    });
  });
  rpc2Push(c);
}

// ── Panneaux d'oscillateurs (un graphique par panneau, synchronisé avec le principal) ──
function rpcDestroyPanes() {
  RPC_PANES.forEach(p => { try { p.chart.remove(); } catch (e) {} });
  RPC_PANES = [];
  const host = document.getElementById('rp-panes'); if (host) host.innerHTML = '';
}
function rpcMakePane(inst, k) {
  const host = document.getElementById('rp-panes'); if (!host) return;
  const el = document.createElement('div');
  el.className = 'rp-pane-ind'; el.dataset.uid = inst.uid;
  el.innerHTML = '<div class="rp-pane-chart"></div><div class="rp-legend rp-pane-lg"></div>';
  host.appendChild(el);
  const chart = LightweightCharts.createChart(el.firstChild, rpcChartOptions(k, inst));
  const ser = rpcMakeSeries(chart, inst, true);
  RPC_PANES.push({ inst, el, chart, ser });
}
function rpcCharts() { return [RP_CHART].concat(RPC_PANES.map(p => p.chart)).filter(Boolean); }
// Défilement / zoom identiques partout ; réticule et légendes suivent la souris d'un panneau à l'autre.
function rpcLink() {
  rpcCharts().forEach(src => {
    src.timeScale().subscribeVisibleLogicalRangeChange(r => {
      if (!r || RPC_SYNC) return;
      RPC_SYNC++;
      try {
        rpcCharts().forEach(dst => {
          if (dst === src) return;
          const cur = dst.timeScale().getVisibleLogicalRange();
          if (!cur || Math.abs(cur.from - r.from) > 1e-3 || Math.abs(cur.to - r.to) > 1e-3) dst.timeScale().setVisibleLogicalRange(r);
        });
      } finally { RPC_SYNC--; }
      if (src === RP_CHART) rpcOnRange(r);
    });
    src.subscribeCrosshairMove(param => rpcCross(src, param));
  });
}
function rpcCross(src, param) {
  if (RPC_SYNC) return;
  const l = param && param.point && param.logical != null ? Math.round(param.logical) : null;
  rpcLegend(l != null && l >= 0 && l <= RP.cursor ? l : null);
  if (!RPC_PANES.length) return;
  RPC_SYNC++;
  try {
    const idx = l != null ? Math.max(0, Math.min(RP.cursor, l)) : null;
    rpcCharts().forEach(ch => {
      if (ch === src) return;
      if (param && param.time != null && idx != null) {
        let s = RP_SERIES, v = RPC[idx].close;
        if (ch !== RP_CHART) {
          const pn = RPC_PANES.find(p => p.chart === ch), k = Object.keys(pn.ser)[0];
          s = pn.ser[k]; v = ((RPC_S.cache[pn.inst.uid] || {})[k] || [])[idx];
        }
        if (s && v != null) ch.setCrosshairPosition(v, param.time, s); else ch.clearCrosshairPosition();
      } else ch.clearCrosshairPosition();
    });
  } finally { RPC_SYNC--; }
}

// ── Légendes ──
function rpcIndRow(inst, i) {
  const d = RPI_DEFS[inst.id], vals = RPC_S.cache[inst.uid] || {}, offs = rpcOffsets(inst);
  let v = '';
  if (!inst.hidden) d.plots.forEach(pl => {
    if ((inst.st[pl.k] || {}).on === false) return;
    const arr = vals[pl.k] || [], j = i - (offs[pl.k] || 0), x = j >= 0 && j <= RP.cursor ? arr[j] : null;
    let col = (inst.st[pl.k] || {}).color || pl.color;
    if (inst.id === 'vol') col = RPC[i] && RPC[i].close >= RPC[i].open ? RPC_ST.volUp : RPC_ST.volDown;
    else if (d.histColor && pl.k === 'hist' && x != null) col = d.histColor(arr, j);
    v += '<span class="rp-lg-v" style="color:' + col + '">' + rpiFmt(inst, x) + '</span>';
  });
  const b = (act, label, ic) => '<button type="button" class="rp-lg-b" title="' + escHtmlAttr(tr(label)) + '" aria-label="' + escHtmlAttr(tr(label)) + '" onclick="' + act + '">' + ic + '</button>';
  return '<div class="rp-lg-row rp-lg-ind' + (inst.hidden ? ' off' : '') + '"><span class="rp-lg-name">' + escHtmlAttr(rpiLabel(inst)) + '</span>' + v
    + '<span class="rp-lg-btns">' + b("rpiToggle('" + inst.uid + "')", inst.hidden ? 'Afficher' : 'Masquer', inst.hidden ? '◌' : '👁')
    + (d.inputs.length || d.plots.length ? b("rpiSettings('" + inst.uid + "')", 'Paramètres', '⚙') : '') + b("rpiRemove('" + inst.uid + "')", 'Retirer', '×') + '</span></div>';
}
function rpcLegend(idx) {
  const el = document.getElementById('rp-legend');
  if (!el || !RP || !RPC.length) return;
  const i = idx == null ? RP.cursor : Math.max(0, Math.min(RP.cursor, idx)), c = RPC[i], prev = RPC[i - 1] || c;
  const b = rpcType() === 'ha' && RPC_S.ha[i] ? RPC_S.ha[i] : c, st = RPC_ST;
  const col = b.close >= b.open ? st.up : st.down, ch = c.close - prev.close;
  const v = (l, x) => '<span class="rp-lg-k">' + l + '</span><span class="rp-lg-v" style="color:' + col + '">' + rpPrice(x) + '</span>';
  let h = '<div class="rp-lg-row rp-lg-main"><span class="rp-lg-sym">' + escHtmlAttr(rpAsset(RP.symbol)) + '</span><span class="rp-lg-dot">·</span><span>' + rpTf(RP.interval)[2] + '</span><span class="rp-lg-dot">·</span><span class="rp-lg-src">' + (RP.source === 'file' ? escHtmlAttr(tr('Fichier')) : 'Binance') + '</span>'
    + '<span class="rp-lg-ohlc">' + v('O', b.open) + v('H', b.high) + v(LANG === 'en' ? 'L' : 'B', b.low) + v('C', b.close)
    + '<span class="rp-lg-v" style="color:' + (ch >= 0 ? st.up : st.down) + '">' + (ch >= 0 ? '+' : '−') + rpPrice(Math.abs(ch), c.close) + ' (' + (ch >= 0 ? '+' : '−') + fmtNum(Math.abs(ch / prev.close * 100), 2) + ' %)</span></span></div>';
  rpcInds().forEach(inst => { if (RPI_DEFS[inst.id] && RPI_DEFS[inst.id].cat === 'main') h += rpcIndRow(inst, i); });
  el.innerHTML = h;
  // Panneaux : leur ligne de légende ; indicateurs de panneau masqués listés sous le graphique principal.
  RPC_PANES.forEach(p => { const lg = p.el.querySelector('.rp-pane-lg'); if (lg) lg.innerHTML = rpcIndRow(p.inst, i); });
  rpcInds().forEach(inst => { if (inst.hidden && RPI_DEFS[inst.id] && RPI_DEFS[inst.id].cat === 'pane') el.insertAdjacentHTML('beforeend', rpcIndRow(inst, i)); });
}

// ── Menus de l'en-tête ──
function rpcSetType(t) { if (!RP) return; RP.chartType = t; rpSave(); rpcCloseMenus(); rpBuildChart(); rpRefreshUi(); }
function rpcCloseMenus() { document.querySelectorAll('.rp-dd').forEach(m => { m.hidden = true; }); }
function rpcOpen(id, btn) {
  const m = document.getElementById(id); if (!m) return;
  const was = !m.hidden;
  rpcCloseMenus();
  if (was) return;
  rpcRenderMenus();
  m.hidden = false;
  const r = btn.getBoundingClientRect(), pr = m.offsetParent ? m.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
  m.style.left = Math.min(r.left - pr.left, pr.width - m.offsetWidth - 4) + 'px'; m.style.top = (r.bottom - pr.top + 4) + 'px';
}
function rpcRenderMenus() {
  const svg = ic => '<svg viewBox="0 0 28 28" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5">' + ic + '</svg>';
  const ty = document.getElementById('rp-dd-type');
  if (ty) ty.innerHTML = RPC_TYPES.map(([id, l, ic]) => '<button type="button" class="rp-dd-it' + (rpcType() === id ? ' on' : '') + '" onclick="rpcSetType(\'' + id + '\')">' + svg(ic) + escHtmlAttr(tr(l)) + '</button>').join('');
  const tb = document.getElementById('rp-type-btn');
  if (tb) { const t = RPC_TYPES.find(x => x[0] === rpcType()); tb.innerHTML = svg(t[2]); tb.title = tr('Type de graphique') + ' : ' + tr(t[1]); }
  const lay = document.getElementById('rp-dd-layout');
  if (lay && RP) lay.innerHTML = [[1, 'Un graphique', '<rect x="5" y="6" width="18" height="16" rx="1.5"/>'], [2, 'Deux graphiques (unité supérieure à droite)', '<rect x="4" y="6" width="9" height="16" rx="1.5"/><rect x="15" y="6" width="9" height="16" rx="1.5"/>']]
    .map(([n, l, ic]) => '<button type="button" class="rp-dd-it' + ((RP.layout || 1) === n ? ' on' : '') + '" onclick="rpcLayout(' + n + ')">' + svg(ic) + escHtmlAttr(tr(l)) + '</button>').join('');
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
  rpcLink();
  if (RP.logScale) RP_CHART.priceScale('right').applyOptions({ mode: 1 });
  rpcRenderMenus(); rpcLegend(); rpcScaleUi(); rpcLayoutUi();
}

// ── Second graphique : même marché, unité de temps supérieure, construit à partir des bougies déjà jouées ──
function rpc2Tfs() { const s = rpTfSec(RP.interval); return RP_TF.filter(t => t[1] > s && t[1] % s === 0); }
function rpc2Tf() {
  const list = rpc2Tfs(); if (!list.length) return null;
  if (!list.some(t => t[0] === RP.tf2)) RP.tf2 = (list.find(t => t[1] >= rpTfSec(RP.interval) * 6) || list[list.length - 1])[0];
  return rpTf(RP.tf2);
}
function rpc2Bar(t0, sec) {   // bougie de l'unité supérieure commencée à t0, limitée au curseur
  let o = null, h = -Infinity, l = Infinity, c = null, v = 0;
  for (let j = RP.cursor; j >= 0 && RPC[j].time >= t0; j--) { const b = RPC[j]; if (c == null) c = b.close; o = b.open; h = Math.max(h, b.high); l = Math.min(l, b.low); v += b.volume || 0; }
  return c == null ? null : { time: t0, open: o, high: h, low: l, close: c, volume: v };
}
function rpc2Build(k) {
  if (RPC_2) { try { RPC_2.chart.remove(); } catch (e) {} RPC_2 = null; }
  const box = document.getElementById('rp-second'), on = RP.layout === 2;
  if (box) box.hidden = !on;
  const wrap = document.querySelector('.rp-chart-wrap'); if (wrap) wrap.classList.toggle('two', on);
  if (!on || !box) return;
  const tf = rpc2Tf(), el = document.getElementById('rp-chart2'), lg = document.getElementById('rp-lg2');
  if (!tf) { el.innerHTML = '<p class="rp-empty rp-2-none">' + escHtmlAttr(tr('Pas d’unité de temps supérieure disponible.')) + '</p>'; if (lg) lg.innerHTML = ''; return; }
  el.innerHTML = '';
  const st = RPC_ST, opts = rpcChartOptions(k);
  opts.watermark.text = rpAsset(RP.symbol) + ' · ' + tf[2];
  opts.rightPriceScale.scaleMargins = { top: 0.1, bottom: 0.08 };
  const chart = LightweightCharts.createChart(el, opts);
  const s = chart.addCandlestickSeries({ upColor: st.up, downColor: st.down, borderUpColor: st.borderUp, borderDownColor: st.borderDown, wickUpColor: st.wickUp, wickDownColor: st.wickDown, priceLineStyle: LightweightCharts.LineStyle.Dotted });
  s.setData(rpResample(rpcBars(), tf[1]).map(c => ({ time: rpLocalShift(c.time), open: c.open, high: c.high, low: c.low, close: c.close })));
  RPC_2 = { chart, s, tf, lines: [] };
  if (lg) lg.innerHTML = '<div class="rp-lg-row"><span class="rp-lg-sym">' + escHtmlAttr(rpAsset(RP.symbol)) + '</span><span class="rp-2-tfs">' + rpc2Tfs().map(t => '<button type="button" class="rp-tf' + (t[0] === tf[0] ? ' on' : '') + '" onclick="rpc2SetTf(\'' + t[0] + '\')">' + rpTfShort(t) + '</button>').join('') + '</span></div>';
  rpc2Lines();
}
function rpc2Push(c) {
  if (!RPC_2) return;
  const sec = RPC_2.tf[1], t0 = Math.floor(c.time / sec) * sec, b = rpc2Bar(t0, sec);
  if (b) RPC_2.s.update({ time: rpLocalShift(b.time), open: b.open, high: b.high, low: b.low, close: b.close });
}
function rpc2SetTf(id) { RP.tf2 = id; rpSave(); rpc2Build(rpThemeColors()); }
// Positions et ordres reportés sur le second graphique (lignes simples).
function rpc2Lines() {
  if (!RPC_2) return;
  RPC_2.lines.forEach(l => { try { RPC_2.s.removePriceLine(l); } catch (e) {} });
  RPC_2.lines = [];
  const add = (price, color, title, dash) => RPC_2.lines.push(RPC_2.s.createPriceLine({ price, color, lineWidth: 1, lineStyle: dash ? LightweightCharts.LineStyle.Dashed : LightweightCharts.LineStyle.Solid, axisLabelVisible: true, title }));
  RP.positions.forEach(p => { add(p.entry, p.side === 'short' ? '#f23645' : '#2962ff', tr(p.side === 'short' ? 'VENTE' : 'ACHAT')); if (p.sl != null) add(p.sl, '#f23645', 'SL', 1); if (p.tp != null) add(p.tp, '#089981', 'TP', 1); });
  RP.orders.forEach(o => add(o.price, o.side === 'short' ? '#f23645' : '#2962ff', tr(o.type === 'limit' ? 'LIMITE' : 'STOP'), 1));
}
function rpcLayout(n) { if (!RP) return; RP.layout = n; rpSave(); rpcCloseMenus(); rpc2Build(rpThemeColors()); rpcLayoutUi(); }

// ── Plein écran, panneau d'ordre masquable ──
let RPC_FS = false;
function rpcFullscreen(force) {
  RPC_FS = force != null ? force : !RPC_FS;
  const app = document.getElementById('rp-app');
  if (app) app.classList.toggle('rp-fs', RPC_FS);
  document.documentElement.classList.toggle('rp-fs-on', RPC_FS);
  rpcLayoutUi();
}
function rpcTogglePanel() { if (!RP) return; RP.hidePanel = !RP.hidePanel; rpSave(); rpcLayoutUi(); }
function rpcLayoutUi() {
  const main = document.querySelector('#rp-app .rp-main'); if (main && RP) main.classList.toggle('no-panel', !!RP.hidePanel);
  const fs = document.getElementById('rp-fs-btn'); if (fs) { fs.classList.toggle('on', RPC_FS); fs.title = tr(RPC_FS ? 'Quitter le plein écran (Échap)' : 'Plein écran'); }
  const pb = document.getElementById('rp-panel-btn'); if (pb && RP) { pb.classList.toggle('on', !RP.hidePanel); pb.title = tr(RP.hidePanel ? 'Afficher le panneau d’ordre' : 'Masquer le panneau d’ordre'); }
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && RPC_FS && !document.getElementById('rp-modal') && !/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || '')) rpcFullscreen(false);
});

// ── Paramètres du graphique (couleurs), gardés pour toutes les séances ──
function rpcSettings() {
  const s = rpcStyle(), k = rpThemeColors();
  const col = (key, label) => '<label class="rp-set-row"><span>' + escHtmlAttr(tr(label)) + '</span><input type="color" data-st="' + key + '" value="' + escHtmlAttr(s[key] || k.bg) + '"></label>';
  const chk = (key, label) => '<label class="rp-set-row"><span>' + escHtmlAttr(tr(label)) + '</span><input type="checkbox" data-stc="' + key + '"' + (s[key] ? ' checked' : '') + '></label>';
  const body = '<div class="rp-set-sub">' + escHtmlAttr(tr('Bougies haussières')) + '</div>' + col('up', 'Corps') + col('borderUp', 'Bordure') + col('wickUp', 'Mèche')
    + '<div class="rp-set-sub">' + escHtmlAttr(tr('Bougies baissières')) + '</div>' + col('down', 'Corps') + col('borderDown', 'Bordure') + col('wickDown', 'Mèche')
    + '<div class="rp-set-sub">' + escHtmlAttr(tr('Volume')) + '</div>' + col('volUp', 'Hausse') + col('volDown', 'Baisse')
    + '<div class="rp-set-sub">' + escHtmlAttr(tr('Fond et repères')) + '</div>'
    + '<label class="rp-set-row"><span>' + escHtmlAttr(tr('Fond')) + '</span><span class="rp-set-inl"><label class="rp-set-chk"><input type="checkbox" data-bgtheme' + (s.bg ? '' : ' checked') + '>' + escHtmlAttr(tr('Couleur du thème')) + '</label><input type="color" data-st="bg" value="' + escHtmlAttr(s.bg || (k.bg.startsWith('#') ? k.bg : '#131722')) + '"></span></label>'
    + chk('grid', 'Grille') + chk('watermark', 'Filigrane du symbole');
  const foot = '<button type="button" class="btn-ghost" onclick="rpcSettingsReset()">' + escHtmlAttr(tr('Par défaut')) + '</button><span class="rp-sp"></span><button type="button" class="btn-ghost" onclick="rpCloseModal()">' + escHtmlAttr(tr('Annuler')) + '</button><button type="button" class="btn-primary" onclick="rpcSettingsApply()">OK</button>';
  rpModal(tr('Paramètres du graphique'), body, foot, 'rp-modal-set');
}
function rpcSettingsApply() {
  const m = document.getElementById('rp-modal'); if (!m) return;
  const s = rpcStyle();
  m.querySelectorAll('[data-st]').forEach(el => { s[el.dataset.st] = el.value; });
  m.querySelectorAll('[data-stc]').forEach(el => { s[el.dataset.stc] = el.checked; });
  if (m.querySelector('[data-bgtheme]').checked) s.bg = '';
  try { DB.setItem('g_rp_style', JSON.stringify(s)); } catch (e) {}
  rpCloseModal(); rpBuildChart(); rpRefreshUi();
}
function rpcSettingsReset() { try { DB.removeItem('g_rp_style'); } catch (e) {} rpCloseModal(); rpBuildChart(); rpRefreshUi(); }
