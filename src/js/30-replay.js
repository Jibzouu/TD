// ── REPLAY (BACKTEST) : DONNÉES ET INTERFACE ─────────────────────────
// Rejoue le marché bougie par bougie sans montrer le futur : graphique en chandeliers (Lightweight Charts),
// lecture pas à pas ou automatique, ticket d'ordre avec calculateur de position (risque % ou montant → quantité),
// stop / objectif déplaçables sur le graphique, positions, ordres en attente, historique et statistiques de séance.
// Chaque trade clôturé part dans le journal (compte ouvert) avec son R exact, ses frais, son MAE / MFE et une capture.
// Données : crypto via l'API publique de Binance (gratuite, sans clé) ; ou un fichier de bougies importé (CSV).
const RP_KEY = () => JP + 'replay';
const RP_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const RP_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT'];
const RP_TF = [['1m', 60, 'M1'], ['3m', 180, 'M3'], ['5m', 300, 'M5'], ['15m', 900, 'M15'], ['30m', 1800, 'M30'], ['1h', 3600, 'H1'], ['4h', 14400, 'H4'], ['1d', 86400, 'D1']];
const RP_SPEEDS = [1, 2, 4, 8, 16];
const RP_HISTORY = 300, RP_BATCH = 1000;

let RP = null;          // séance en cours (état sauvegardé)
let RPC = [];           // bougies chargées (temps UTC en secondes)
let RP_CHART = null, RP_SERIES = null, RP_TIMER = null, RP_LOADING = false, RP_END = false, RP_FILE = null;
let RP_LINES = { preview: {}, pos: {}, draw: [] };
let RP_TICKET = { side: 'long', type: 'market', price: '', sl: '', tp: '', slMode: 'price', tpMode: 'price', riskMode: 'pct', riskValue: 1, manualQty: false, qty: '', setup: '' };

function rpTf(id) { return RP_TF.find(t => t[0] === id) || RP_TF[2]; }
function rpTfSec(id) { return rpTf(id)[1]; }
function rpAsset(sym) { const m = /^(.+?)(USDT|USDC|BUSD|FDUSD|BTC|ETH|EUR|USD)$/.exec(sym || ''); return m ? m[1] + '/' + m[2] : (sym || '—'); }
function rpBase(sym) { return rpAsset(sym).split('/')[0]; }
function rpCur() { return RPC[RP ? RP.cursor : 0]; }
function rpFx() { return typeof IMPORT_FX_RATE === 'number' && IMPORT_FX_RATE > 0 ? IMPORT_FX_RATE : 1; }
function rpMoney(v, d) { if (v == null || isNaN(v)) return '—'; const s = Math.abs(v).toLocaleString(UI_LOCALE, { minimumFractionDigits: d ?? 2, maximumFractionDigits: d ?? 2 }); return (v < 0 ? '−' : '') + s + ' $'; }
function rpPrice(v, ref) { if (v == null || isNaN(v)) return '—'; const b = ref || v, d = b >= 1000 ? 2 : b >= 1 ? 4 : 6; return (+v).toLocaleString(UI_LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d }); }
function rpQtyFmt(q) { return (+q).toLocaleString(UI_LOCALE, { maximumFractionDigits: 6 }); }
function rpLocalShift(t) { return t - new Date(t * 1000).getTimezoneOffset() * 60; }   // le graphique affiche l'heure locale
function rpDateLabel(t) { const d = new Date(t * 1000); return d.toLocaleDateString(UI_LOCALE, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).replace(/,/g, '') + ' ' + d.toLocaleTimeString(UI_LOCALE, { hour: '2-digit', minute: '2-digit' }); }

// ── Données ──
async function rpFetchKlines(symbol, interval, params) {
  const qs = Object.entries(Object.assign({ symbol, interval, limit: RP_BATCH }, params)).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  let lastErr = null;
  for (const host of RP_HOSTS) {
    try {
      const r = await fetch(host + '/api/v3/klines?' + qs);
      if (!r.ok) { lastErr = new Error('HTTP ' + r.status); if (r.status === 400) break; continue; }
      const a = await r.json();
      if (!Array.isArray(a)) throw new Error('réponse inattendue');
      return a.map(k => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('indisponible');
}
// Fichier de bougies (TradingView, MetaTrader, export générique) : temps + open / high / low / close.
function rpParseCandleFile(text) {
  const rows = parseCSVGeneric(text);
  if (!rows.length) return [];
  const head = rows[0].map(h => String(h).toLowerCase().replace(/[<>"]/g, '').trim());
  const hasHead = head.some(h => /open|high|close/.test(h));
  const idx = name => head.findIndex(h => h === name || h.startsWith(name));
  let iT = hasHead ? Math.max(idx('time'), idx('date'), idx('timestamp'), idx('datetime')) : 0;
  const iTime2 = hasHead ? idx('time') : -1, iDate = hasHead ? idx('date') : -1;
  const iO = hasHead ? idx('open') : 1, iH = hasHead ? idx('high') : 2, iL = hasHead ? idx('low') : 3, iC = hasHead ? idx('close') : 4;
  const iV = hasHead ? Math.max(idx('volume'), idx('tickvol'), idx('vol')) : 5;
  const toTime = (a, b) => {
    let s = String(a).trim();
    if (b != null && b !== '' && !/[ T]\d/.test(s)) s += ' ' + String(b).trim();
    if (/^\d{9,13}$/.test(s)) { const n = +s; return n > 1e11 ? Math.floor(n / 1000) : n; }
    s = s.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3');
    const d = new Date(s.replace(' ', 'T'));
    return isNaN(d) ? null : Math.floor(d.getTime() / 1000);
  };
  const out = [];
  rows.slice(hasHead ? 1 : 0).forEach(r => {
    const t = (iDate > -1 && iTime2 > -1 && iDate !== iTime2) ? toTime(r[iDate], r[iTime2]) : toTime(r[iT]);
    const c = { time: t, open: parseNumCSV(r[iO]), high: parseNumCSV(r[iH]), low: parseNumCSV(r[iL]), close: parseNumCSV(r[iC]), volume: iV > -1 ? (parseNumCSV(r[iV]) || 0) : 0 };
    if (t != null && [c.open, c.high, c.low, c.close].every(v => v != null && isFinite(v))) out.push(c);
  });
  out.sort((a, b) => a.time - b.time);
  return out.filter((c, i) => i === 0 || c.time !== out[i - 1].time);
}
function rpGuessTf(candles) {
  const gaps = candles.slice(1, 200).map((c, i) => c.time - candles[i].time).filter(g => g > 0).sort((a, b) => a - b);
  const g = gaps[Math.floor(gaps.length / 2)] || 300;
  return (RP_TF.find(t => t[1] === g) || RP_TF.reduce((b, t) => Math.abs(t[1] - g) < Math.abs(b[1] - g) ? t : b))[0];
}

// ── Séance ──
function rpLoadSaved() { const s = loadJSON(RP_KEY(), null); return s && typeof s === 'object' && s.symbol ? s : null; }
function rpSave() { if (!RP) return; try { DB.setItem(RP_KEY(), JSON.stringify(Object.assign({}, RP, { cursorTime: rpCur() ? rpCur().time : RP.cursorTime }))); } catch (e) { reportStorageError(e); } }
function rpNewSession(o) {
  return { symbol: o.symbol, interval: o.interval, source: o.source || 'binance', startTime: o.startTime, cursorTime: o.startTime, cursor: 0,
    startBalance: o.balance, feeRate: o.feeRate, autosave: o.autosave !== false, capture: o.capture !== false, speed: 2,
    positions: [], orders: [], history: [], lines: [], seq: 0 };
}
function rpBalance() { return RP.startBalance + RP.history.reduce((s, p) => s + p.realized - p.fees, 0) + RP.positions.reduce((s, p) => s + p.realized - p.fees, 0); }
function rpEquity() { const c = rpCur(); return rpBalance() + (c ? RP.positions.reduce((s, p) => s + rpOpenPnl(p, c.close), 0) : 0); }

async function rpStart(fromSaved) {
  const msg = document.getElementById('rp-setup-msg');
  try {
    RP_LOADING = true; RP_END = false;
    if (msg) mount(msg, html`<span class="tone-muted">Chargement des bougies…</span>`);
    if (RP.source === 'file') {
      if (!RP_FILE) throw new Error('Réimporte ton fichier de bougies pour reprendre cette séance.');
      const base = RP_FILE.candles, tfs = rpTfSec(RP.interval);
      const all = tfs > RP_FILE.tfSec ? rpResample(base, tfs) : base;
      const at = Math.max(0, all.findIndex(c => c.time >= RP.cursorTime));
      RPC = all; RP.cursor = Math.max(0, fromSaved ? at : at - 1); RP_END = true;
    } else {
      const startMs = RP.cursorTime * 1000;
      const hist = await rpFetchKlines(RP.symbol, RP.interval, { endTime: startMs - 1, limit: RP_HISTORY });
      const fut = await rpFetchKlines(RP.symbol, RP.interval, { startTime: startMs, limit: RP_BATCH });
      if (!hist.length && !fut.length) throw new Error('Aucune bougie pour ce marché à cette date.');
      RPC = hist.concat(fut.filter(c => !hist.length || c.time > hist[hist.length - 1].time));
      RP.cursor = Math.max(0, hist.length - 1 + (fromSaved ? 1 : 0));
      if (RP.cursor >= RPC.length) RP.cursor = RPC.length - 1;
      RP_END = fut.length < RP_BATCH;
    }
    RP_LOADING = false;
    rpSave();
    rpShowApp(true);
    rpBuildChart();
    renderReplay();
  } catch (e) {
    RP_LOADING = false;
    if (msg) mount(msg, html`<span class="tone-red">⚠️ ${e && e.message ? (/fetch|network|Failed/i.test(e.message) ? 'Impossible de joindre Binance (connexion internet ?). Tu peux aussi importer un fichier de bougies.' : e.message) : 'Chargement impossible'}</span>`);
    rpShowApp(false);
  }
}
// Charge la suite quand on approche du bout des bougies.
async function rpEnsureAhead() {
  if (RP_LOADING || RP_END || !RP || RP.source !== 'binance') return;
  if (RP.cursor < RPC.length - 150) return;
  RP_LOADING = true;
  try {
    const last = RPC[RPC.length - 1];
    const more = await rpFetchKlines(RP.symbol, RP.interval, { startTime: (last.time + 1) * 1000, limit: RP_BATCH });
    const add = more.filter(c => c.time > last.time);
    RPC = RPC.concat(add);
    if (more.length < RP_BATCH) RP_END = true;
  } catch (e) { /* nouvel essai au pas suivant */ }
  RP_LOADING = false;
}

// ── Lecture ──
function rpStep(n) {
  if (!RP || !RPC.length) return false;
  for (let i = 0; i < (n || 1); i++) {
    if (RP.cursor >= RPC.length - 1) { rpPause(); if (RP_END) showToast('Fin des données disponibles'); return false; }
    RP.cursor++;
    const c = RPC[RP.cursor];
    const events = rpStepCandle(RP, c, { feeRate: RP.feeRate });
    if (RP_SERIES) RP_SERIES.update(rpChartCandle(c));
    events.forEach(ev => {
      if (ev.type === 'fill') rpMarker(ev.pos, 'open');
      if (ev.type === 'close') rpOnClosed(ev.pos);
    });
  }
  RP.positions = RP.positions.filter(p => !rpIsClosed(p));
  rpEnsureAhead();
  rpSave();
  rpRefreshUi();
  return true;
}
function rpPlay() {
  if (!RP) return;
  rpPause();
  RP.playing = true;
  RP_TIMER = setInterval(() => { if (!document.getElementById('page-replay').classList.contains('active')) return rpPause(); rpStep(1); }, 1000 / (RP.speed || 2));
  rpRefreshControls();
}
function rpPause() { if (RP_TIMER) clearInterval(RP_TIMER); RP_TIMER = null; if (RP) RP.playing = false; rpRefreshControls(); }
function rpTogglePlay() { if (RP && RP.playing) rpPause(); else rpPlay(); }
function rpSetSpeed(v) { if (!RP) return; RP.speed = +v || 2; if (RP.playing) rpPlay(); rpSave(); }

// ── Ordres ──
function rpTicketCalc() {
  const c = rpCur(); if (!c) return { error: 'data' };
  const T = RP_TICKET, entry = T.type === 'market' ? c.close : +String(T.price).replace(',', '.');
  if (!(entry > 0)) return { error: 'price' };
  const num = v => v === '' || v == null ? null : +String(v).replace(',', '.');
  let sl = num(T.sl), tp = num(T.tp);
  const sgn = T.side === 'short' ? -1 : 1;
  if (sl != null && T.slMode === 'dist') sl = entry - sgn * sl;
  if (sl != null && T.slMode === 'pct') sl = entry * (1 - sgn * sl / 100);
  if (tp != null && T.tpMode === 'rr') tp = sl != null ? entry + sgn * Math.abs(entry - sl) * tp : null;
  if (tp != null && T.tpMode === 'dist') tp = entry + sgn * tp;
  if (sl == null) return { error: 'stop', entry, tp };
  const r = rpSizePosition({ side: T.side, entry, sl, tp, balance: rpBalance(), riskMode: T.riskMode, riskValue: +T.riskValue || 0, qty: T.manualQty ? T.qty : null });
  return Object.assign(r, { entry, sl, tp });
}
function rpPlaceOrder() {
  if (!RP) return;
  const c = rpCur(), r = rpTicketCalc();
  if (r.error) { showToast(r.error === 'stop' ? 'Place un stop loss : il sert à calculer ta taille et ton R' : r.error === 'side' ? 'Le stop doit être sous l’entrée pour un achat, au-dessus pour une vente' : 'Ordre incomplet', 'error'); return; }
  const id = 'r' + Date.now().toString(36) + (++RP.seq);
  const setup = RP_TICKET.setup || '';
  if (RP_TICKET.type === 'market') {
    const pos = rpOpenPosition({ id, side: r.side, qty: r.qty, price: c.close, sl: r.sl, tp: r.tp, time: c.time, setup, feeRate: RP.feeRate });
    RP.positions.push(pos);
    rpMarker(pos, 'open');
    showToast((r.side === 'long' ? 'Achat ' : 'Vente ') + rpQtyFmt(r.qty) + ' ' + rpBase(RP.symbol) + ' à ' + rpPrice(c.close), 'success');
  } else {
    const ok = RP_TICKET.type === 'limit' ? (r.side === 'long' ? r.entry < c.close : r.entry > c.close) : (r.side === 'long' ? r.entry > c.close : r.entry < c.close);
    if (!ok) { showToast(RP_TICKET.type === 'limit' ? 'Un ordre limite d’achat se place sous le prix (de vente : au-dessus)' : 'Un ordre stop d’achat se place au-dessus du prix (de vente : en dessous)', 'error'); return; }
    RP.orders.push({ id, side: r.side, type: RP_TICKET.type, price: r.entry, qty: r.qty, sl: r.sl, tp: r.tp, setup, created: c.time });
    showToast('Ordre ' + (RP_TICKET.type === 'limit' ? 'limite' : 'stop') + ' placé à ' + rpPrice(r.entry), 'success');
  }
  RP_TICKET.sl = ''; RP_TICKET.tp = ''; RP_TICKET.price = '';
  rpSave(); renderReplayTicket(); rpRefreshUi();
}
function rpCancelOrder(id) { RP.orders = RP.orders.filter(o => o.id !== id); rpSave(); rpRefreshUi(); }
function rpClosePos(id, frac) {
  const p = RP.positions.find(x => x.id === id), c = rpCur();
  if (!p || !c) return;
  const q = frac >= 1 ? null : rpFloorStep(p.qty * frac, rpQtyStep(p.entry));
  rpClose(p, c.close, c.time, 'manual', q, RP.feeRate);
  if (rpIsClosed(p)) { rpOnClosed(p); RP.positions = RP.positions.filter(x => x !== p); }
  rpSave(); rpRefreshUi();
}
function rpMoveToBE(id) { const p = RP.positions.find(x => x.id === id); if (p) { p.sl = p.entry; rpSave(); rpRefreshUi(); showToast('Stop au prix d’entrée (break-even)'); } }
function rpSetLevel(id, which, price) {
  const p = RP.positions.find(x => x.id === id) || RP.orders.find(x => x.id === id);
  if (!p || !(price > 0)) return;
  if (which === 'entry' && p.type) p.price = price; else p[which] = price;
  rpSave(); rpRefreshUi();
}
// Position clôturée : historique de séance + enregistrement dans le journal.
function rpOnClosed(p) {
  rpMarker(p, 'close');
  if (!RP.history.some(h => h.id === p.id)) RP.history.push(p);
  if (!RP.autosave) return;
  const fields = rpToJournalTrade(p, { asset: rpAsset(RP.symbol), tf: rpTf(RP.interval)[2], fx: rpFx(), desc: 'Backtest replay · ' + rpAsset(RP.symbol) + ' ' + rpTf(RP.interval)[2] });
  if (trades.some(t => t.tvKey === fields.tvKey)) return;
  let imgs = [];
  if (RP.capture && RP_CHART) { try { imgs = [RP_CHART.takeScreenshot().toDataURL('image/png')]; } catch (e) {} }
  const t = TradeStore.add(fields, imgs);
  if (t) p.journalId = t.id;
}

// ── Graphique ──
function rpChartCandle(c) { return { time: rpLocalShift(c.time), open: c.open, high: c.high, low: c.low, close: c.close }; }
function rpThemeColors() {
  const cs = getComputedStyle(document.documentElement), v = k => cs.getPropertyValue(k).trim();
  return { bg: v('--bg2') || '#121418', txt: v('--txt2') || '#c0c5cf', grid: v('--border') || '#22262e', green: v('--green') || '#3ecf8e', red: v('--red') || '#f2555a', accent: v('--accent') || '#5d6cf6', amber: v('--amber') || '#e8a53a', font: v('--sans') || 'Inter' };
}
function rpBuildChart() {
  const el = document.getElementById('rp-chart');
  if (!el || typeof LightweightCharts === 'undefined') return;
  if (RP_CHART) { RP_CHART.remove(); RP_CHART = null; }
  const k = rpThemeColors();
  RP_CHART = LightweightCharts.createChart(el, {
    autoSize: true,
    layout: { background: { type: 'solid', color: k.bg }, textColor: k.txt, fontFamily: k.font, attributionLogo: true },
    grid: { vertLines: { color: k.grid }, horzLines: { color: k.grid } },
    rightPriceScale: { borderColor: k.grid }, timeScale: { borderColor: k.grid, timeVisible: true, secondsVisible: false, rightOffset: 8 },
    crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    // Langue du journal (et non celle du navigateur, parfois invalide) ; prix au format du journal.
    localization: { locale: UI_LOCALE, priceFormatter: p => rpPrice(p) }
  });
  RP_SERIES = RP_CHART.addCandlestickSeries({ upColor: k.green, downColor: k.red, borderUpColor: k.green, borderDownColor: k.red, wickUpColor: k.green, wickDownColor: k.red });
  RP_SERIES.setData(RPC.slice(0, RP.cursor + 1).map(rpChartCandle));
  RP_LINES = { preview: {}, pos: {}, draw: [] };
  rpRedrawMarkers();
  rpBindChartDrag(el);
  RP_CHART.subscribeClick(rpOnChartClick);
}
let RP_MARKERS = [];
function rpMarker(p, kind) {
  const k = rpThemeColors(), long = p.side !== 'short';
  const t = kind === 'open' ? p.openTime : (p.closeTime || rpCur().time);
  const tf = rpTfSec(RP.interval), barT = Math.floor(t / tf) * tf;
  if (kind === 'open') RP_MARKERS.push({ time: rpLocalShift(barT), position: long ? 'belowBar' : 'aboveBar', color: long ? k.green : k.red, shape: long ? 'arrowUp' : 'arrowDown', text: tr((long ? 'Achat ' : 'Vente ') + rpQtyFmt(p.qty0)) });
  else { const net = p.realized - p.fees; RP_MARKERS.push({ time: rpLocalShift(barT), position: long ? 'aboveBar' : 'belowBar', color: net >= 0 ? k.green : k.red, shape: 'circle', text: (net >= 0 ? '+' : '−') + Math.abs(net).toFixed(0) + ' $' }); }
  rpRedrawMarkers();
}
function rpRedrawMarkers() { if (!RP_SERIES) return; const cur = rpCur(); const lim = cur ? rpLocalShift(cur.time) : Infinity; RP_SERIES.setMarkers(RP_MARKERS.filter(m => m.time <= lim).sort((a, b) => a.time - b.time)); }
// Lignes de prix : aperçu du ticket (entrée / stop / objectif) et niveaux des positions et ordres, déplaçables à la souris.
function rpSyncLines() {
  if (!RP_SERIES) return;
  const k = rpThemeColors();
  const want = [];
  const r = rpTicketCalc();
  if (!r.error || r.error === 'stop') {
    if (RP_TICKET.type !== 'market' && r.entry) want.push({ key: 'pv-entry', price: r.entry, color: k.accent, title: 'Entrée', drag: { kind: 'ticket', which: 'price' } });
    if (r.sl) want.push({ key: 'pv-sl', price: r.sl, color: k.red, title: 'SL ' + (r.risk ? '−' + rpMoney(r.risk, 0) : ''), drag: { kind: 'ticket', which: 'sl' } });
    if (r.tp) want.push({ key: 'pv-tp', price: r.tp, color: k.green, title: 'TP ' + (r.reward ? '+' + rpMoney(r.reward, 0) : ''), drag: { kind: 'ticket', which: 'tp' } });
  }
  RP.positions.forEach(p => {
    want.push({ key: p.id + '-e', price: p.entry, color: k.txt, title: (p.side === 'short' ? 'Vente ' : 'Achat ') + rpQtyFmt(p.qty), style: 0 });
    if (p.sl != null) want.push({ key: p.id + '-sl', price: p.sl, color: k.red, title: 'SL', drag: { kind: 'pos', id: p.id, which: 'sl' } });
    if (p.tp != null) want.push({ key: p.id + '-tp', price: p.tp, color: k.green, title: 'TP', drag: { kind: 'pos', id: p.id, which: 'tp' } });
  });
  RP.orders.forEach(o => {
    want.push({ key: o.id + '-o', price: o.price, color: k.accent, title: (o.type === 'limit' ? 'Limite ' : 'Stop ') + (o.side === 'short' ? 'vente' : 'achat'), drag: { kind: 'pos', id: o.id, which: 'entry' } });
    if (o.sl != null) want.push({ key: o.id + '-sl', price: o.sl, color: k.red, title: 'SL', drag: { kind: 'pos', id: o.id, which: 'sl' } });
    if (o.tp != null) want.push({ key: o.id + '-tp', price: o.tp, color: k.green, title: 'TP', drag: { kind: 'pos', id: o.id, which: 'tp' } });
  });
  (RP.lines || []).forEach((p, i) => want.push({ key: 'draw-' + i, price: p, color: k.amber, title: '', style: 2, drag: { kind: 'draw', i } }));
  const keep = new Set(want.map(w => w.key));
  Object.keys(RP_LINES.pos).forEach(key => { if (!keep.has(key)) { RP_SERIES.removePriceLine(RP_LINES.pos[key].line); delete RP_LINES.pos[key]; } });
  want.forEach(w => {
    const opts = { price: w.price, color: w.color, lineWidth: 1, lineStyle: w.style ?? (w.drag ? 2 : 0), axisLabelVisible: true, title: tr(w.title) };
    if (RP_LINES.pos[w.key]) RP_LINES.pos[w.key].line.applyOptions(opts);
    else RP_LINES.pos[w.key] = { line: RP_SERIES.createPriceLine(opts) };
    RP_LINES.pos[w.key].w = w;
  });
}
function rpBindChartDrag(el) {
  let drag = null;
  const yOf = e => { const r = el.getBoundingClientRect(); return (e.touches ? e.touches[0].clientY : e.clientY) - r.top; };
  const find = y => Object.values(RP_LINES.pos).filter(x => x.w.drag).find(x => { const py = RP_SERIES.priceToCoordinate(x.w.price); return py != null && Math.abs(py - y) <= 6; });
  el.addEventListener('mousemove', e => {
    if (drag) {
      const price = RP_SERIES.coordinateToPrice(yOf(e));
      if (price > 0) { drag.w.price = price; drag.line.applyOptions({ price }); rpDragApply(drag.w.drag, price, false); }
      return;
    }
    el.style.cursor = find(yOf(e)) ? 'ns-resize' : (RP_DRAW_MODE ? 'crosshair' : '');
  });
  el.addEventListener('mousedown', e => {
    const hit = find(yOf(e));
    if (!hit) return;
    drag = hit; e.preventDefault(); e.stopPropagation();
    RP_CHART.applyOptions({ handleScroll: false, handleScale: false });
  }, true);
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    rpDragApply(drag.w.drag, drag.w.price, true);
    drag = null;
    RP_CHART && RP_CHART.applyOptions({ handleScroll: true, handleScale: true });
  });
}
function rpRound(p) { const d = p >= 1000 ? 2 : p >= 1 ? 4 : 6; return +p.toFixed(d); }
function rpDragApply(d, price, done) {
  price = rpRound(price);
  if (d.kind === 'ticket') {
    if (d.which === 'price') RP_TICKET.price = price;
    if (d.which === 'sl') { RP_TICKET.slMode = 'price'; RP_TICKET.sl = price; }
    if (d.which === 'tp') { RP_TICKET.tpMode = 'price'; RP_TICKET.tp = price; }
    if (done) renderReplayTicket(); else renderReplayTicketSummary();
  } else if (d.kind === 'pos' && done) rpSetLevel(d.id, d.which, price);
  else if (d.kind === 'draw' && done) { RP.lines[d.i] = price; rpSave(); }
}
// Outil « ligne horizontale » : un clic sur le graphique pose une ligne ; un clic sur une ligne existante la retire.
let RP_DRAW_MODE = false;
function rpToggleDraw() { RP_DRAW_MODE = !RP_DRAW_MODE; rpRefreshControls(); }
function rpOnChartClick(param) {
  if (!RP_DRAW_MODE || !param || !param.point) return;
  const price = RP_SERIES.coordinateToPrice(param.point.y);
  if (!(price > 0)) return;
  const near = (RP.lines || []).findIndex(p => Math.abs(RP_SERIES.priceToCoordinate(p) - param.point.y) <= 6);
  RP.lines = RP.lines || [];
  if (near > -1) RP.lines.splice(near, 1); else RP.lines.push(rpRound(price));
  rpSave(); rpSyncLines();
}
function rpClearLines() { RP.lines = []; rpSave(); rpSyncLines(); }

// ── Rendu ──
function rpShowApp(on) {
  const app = document.getElementById('rp-app'), setup = document.getElementById('rp-setup');
  if (app) app.hidden = !on;
  if (setup) setup.hidden = !!on;
}
function renderReplay() {
  const page = document.getElementById('page-replay');
  if (!page) return;
  if (!RP) {
    rpShowApp(false);
    renderReplaySetup();
    return;
  }
  rpShowApp(true);
  if (!RP_CHART && RPC.length) rpBuildChart();
  renderReplayTicket();
  rpRefreshUi();
}
function renderReplaySetup() {
  const saved = rpLoadSaved();
  const res = document.getElementById('rp-resume');
  if (res) {
    res.hidden = !saved;
    if (saved) mount(res, html`<div class="rp-resume-txt"><b>Séance en cours</b> · ${rpAsset(saved.symbol)} ${rpTf(saved.interval)[2]} · ${rpDateLabel(saved.cursorTime)} · ${(saved.history || []).length} trade(s)</div>
      <div class="rp-resume-act"><button class="btn-primary" onclick="rpResume()">Reprendre</button><button class="btn-ghost" onclick="rpDiscard()">Abandonner</button></div>`);
  }
  const sym = document.getElementById('rp-symbol');
  if (sym && !sym.options.length) mount(sym, html`${RP_SYMBOLS.map(s => html`<option value="${s}">${rpAsset(s)}</option>`)}<option value="__custom">Autre paire…</option>`);
  const tf = document.getElementById('rp-interval');
  if (tf && !tf.options.length) { mount(tf, html`${RP_TF.map(t => html`<option value="${t[0]}">${t[2]}</option>`)}`); tf.value = '5m'; }
  const st = document.getElementById('rp-start');
  if (st && !st.value) { const d = new Date(Date.now() - 30 * 86400000); d.setHours(9, 0, 0, 0); st.value = localDateStr(d) + 'T09:00'; }
  const bal = document.getElementById('rp-balance');
  if (bal && !bal.value) bal.value = accountSize > 0 ? accountSize : 10000;
}
function rpOnSymbolChange(sel) {
  const c = document.getElementById('rp-symbol-custom');
  if (c) { c.hidden = sel.value !== '__custom'; if (!c.hidden) c.focus(); }
}
function rpLaunch() {
  const symSel = document.getElementById('rp-symbol').value;
  const symbol = symSel === '__custom' ? String(document.getElementById('rp-symbol-custom').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '') : symSel;
  const interval = document.getElementById('rp-interval').value;
  const start = new Date(document.getElementById('rp-start').value);
  const balance = parseFloat(String(document.getElementById('rp-balance').value).replace(',', '.'));
  const fee = parseFloat(String(document.getElementById('rp-fee').value).replace(',', '.')) || 0;
  if (!symbol) { showToast('Choisis une paire', 'error'); return; }
  if (isNaN(start) || start.getTime() > Date.now() - rpTfSec(interval) * 1000) { showToast('Choisis une date de départ dans le passé', 'error'); return; }
  if (!(balance > 0)) { showToast('Indique un solde de départ', 'error'); return; }
  RP = rpNewSession({ symbol, interval, startTime: Math.floor(start.getTime() / 1000), balance, feeRate: fee / 100,
    autosave: document.getElementById('rp-autosave').checked, capture: document.getElementById('rp-capture').checked });
  RP_MARKERS = [];
  rpStart(false);
}
function rpResume() { RP = rpLoadSaved(); RP_MARKERS = []; (RP.history || []).forEach(p => { rpMarkerSilent(p, 'open'); rpMarkerSilent(p, 'close'); }); RP.positions.forEach(p => rpMarkerSilent(p, 'open')); rpStart(true); }
function rpMarkerSilent(p, kind) { const s = RP_SERIES; RP_SERIES = null; rpMarker(p, kind); RP_SERIES = s; }
function rpDiscard() {
  openModal('Abandonner la séance ?', 'La séance de replay en cours est effacée. Les trades déjà enregistrés dans ton journal restent.', () => {
    DB.removeItem(RP_KEY()); RP = null; RPC = []; if (RP_CHART) { RP_CHART.remove(); RP_CHART = null; RP_SERIES = null; } renderReplay();
  }, { confirmLabel: 'Abandonner', destructive: true });
}
function rpEndSession() {
  openModal('Terminer la séance ?', 'Les positions encore ouvertes sont clôturées au prix actuel ; le récapitulatif reste dans l’historique de séance.', () => {
    rpPause();
    RP.positions.slice().forEach(p => rpClosePos(p.id, 1));
    RP.orders = [];
    rpSave();
    const st = rpSessionStats();
    showToast('Séance terminée — ' + st.n + ' trade(s), ' + (st.r >= 0 ? '+' : '') + st.r.toFixed(2) + 'R', 'success');
    DB.removeItem(RP_KEY()); RP = null; RPC = []; if (RP_CHART) { RP_CHART.remove(); RP_CHART = null; RP_SERIES = null; }
    renderReplay();
  }, { confirmLabel: 'Terminer' });
}
async function rpImportFile(input) {
  const f = input.files && input.files[0]; input.value = '';
  if (!f) return;
  const candles = rpParseCandleFile(await f.text());
  if (candles.length < 50) { showToast('Fichier non reconnu : il faut au moins 50 bougies (temps, open, high, low, close)', 'error'); return; }
  const interval = rpGuessTf(candles);
  RP_FILE = { name: f.name, candles, tfSec: rpTfSec(interval) };
  const sym = (f.name.match(/[A-Z]{3,}[A-Z0-9]*/i) || ['FICHIER'])[0].toUpperCase();
  const balance = parseFloat(document.getElementById('rp-balance').value) || 10000;
  const startIdx = Math.min(RP_HISTORY, Math.floor(candles.length / 3));
  RP = rpNewSession({ symbol: sym, interval, source: 'file', startTime: candles[startIdx].time, balance, feeRate: (parseFloat(document.getElementById('rp-fee').value) || 0) / 100,
    autosave: document.getElementById('rp-autosave').checked, capture: document.getElementById('rp-capture').checked });
  RP_MARKERS = [];
  showToast(candles.length + ' bougies importées (' + rpTf(interval)[2] + ')', 'success');
  rpStart(false);
}
async function rpChangeInterval(v) {
  if (!RP || v === RP.interval) return;
  rpPause();
  const cur = rpCur(), oldSec = rpTfSec(RP.interval), newSec = rpTfSec(v);
  const nowEnd = cur.time + oldSec;   // instant atteint : aucune bougie de la nouvelle unité ne doit le dépasser
  RP.interval = v;
  if (RP.source === 'file') {
    const all = newSec >= RP_FILE.tfSec ? rpResample(RP_FILE.candles, newSec) : RP_FILE.candles;
    RPC = all; RP.cursor = Math.max(0, all.findIndex(c => c.time + newSec > nowEnd) - 1); if (RP.cursor < 0) RP.cursor = all.length - 1;
  } else {
    try {
      const hist = (await rpFetchKlines(RP.symbol, v, { endTime: nowEnd * 1000 - 1, limit: RP_HISTORY })).filter(c => c.time + newSec <= nowEnd);
      const fut = await rpFetchKlines(RP.symbol, v, { startTime: (hist.length ? hist[hist.length - 1].time + newSec : nowEnd) * 1000, limit: RP_BATCH });
      RPC = hist.concat(fut); RP.cursor = Math.max(0, hist.length - 1); RP_END = fut.length < RP_BATCH;
    } catch (e) { showToast('Changement d’unité de temps impossible (connexion)', 'error'); return; }
  }
  rpSave(); rpBuildChart(); rpRefreshUi();
}

function rpSessionStats() {
  const h = RP ? RP.history : [];
  const rs = h.map(p => p.risk0 > 0 ? (p.realized - p.fees) / p.risk0 : 0);
  const wins = rs.filter(r => r >= 0.1).length;
  const net = h.reduce((s, p) => s + p.realized - p.fees, 0);
  let peak = RP ? RP.startBalance : 0, bal = peak, dd = 0;
  h.forEach(p => { bal += p.realized - p.fees; peak = Math.max(peak, bal); dd = Math.min(dd, bal - peak); });
  return { n: h.length, wins, wr: h.length ? wins / h.length * 100 : null, r: rs.reduce((a, b) => a + b, 0), net, dd };
}
function rpRefreshControls() {
  const play = document.getElementById('rp-play');
  if (play) { play.textContent = RP && RP.playing ? '⏸ Pause' : '▶ Lecture'; play.classList.toggle('on', !!(RP && RP.playing)); }
  const draw = document.getElementById('rp-draw');
  if (draw) draw.classList.toggle('on', RP_DRAW_MODE);
}
function rpRefreshUi() {
  if (!RP) return;
  const c = rpCur();
  const info = document.getElementById('rp-info');
  if (info && c) mount(info, html`<b>${rpAsset(RP.symbol)}</b> <span class="rp-chip">${rpTf(RP.interval)[2]}</span> <span class="rp-date">${rpDateLabel(c.time)}</span> <span class="rp-last tone-${raw(c.close >= c.open ? 'green' : 'red')}">${rpPrice(c.close)}</span>`);
  const tfSel = document.getElementById('rp-tf'); if (tfSel && !tfSel.options.length) mount(tfSel, html`${RP_TF.map(t => html`<option value="${t[0]}">${t[2]}</option>`)}`);
  if (tfSel) tfSel.value = RP.interval;
  const sp = document.getElementById('rp-speed'); if (sp && !sp.options.length) mount(sp, html`${RP_SPEEDS.map(s => html`<option value="${s}">${s} bougie${s > 1 ? 's' : ''}/s</option>`)}`);
  if (sp) sp.value = RP.speed || 2;
  rpRefreshControls();
  // Compte
  const bal = rpBalance(), eq = rpEquity(), st = rpSessionStats();
  const acc = document.getElementById('rp-account');
  if (acc) mount(acc, html`
    <div class="rp-kv"><span>Solde</span><b>${rpMoney(bal)}</b></div>
    <div class="rp-kv"><span>Équité</span><b class="tone-${raw(eq >= bal ? 'green' : 'red')}">${rpMoney(eq)}</b></div>
    <div class="rp-kv"><span>Résultat séance</span><b class="tone-${raw(st.net >= 0 ? 'green' : 'red')}">${rpMoney(st.net)}</b></div>
    <div class="rp-kv"><span>Trades</span><b>${st.n}${st.wr != null ? html` · ${fmtRate(st.wr, 0)}` : ''}</b></div>
    <div class="rp-kv"><span>R cumulé</span><b class="tone-${raw(st.r >= 0 ? 'green' : 'red')}">${fmtR(st.r, 2)}</b></div>`);
  // Positions / ordres / historique
  const pos = document.getElementById('rp-positions');
  if (pos) mount(pos, RP.positions.length ? html`<table class="rp-table"><thead><tr><th>Sens</th><th>Quantité</th><th>Entrée</th><th>Stop</th><th>Objectif</th><th>Latent</th><th></th></tr></thead><tbody>${RP.positions.map(p => {
      const u = c ? rpOpenPnl(p, c.close) : 0, R = p.risk0 > 0 ? (u + p.realized - p.fees) / p.risk0 : null;
      return html`<tr><td><span class="badge ${raw(p.side === 'short' ? 'b-sl' : 'b-tp')}">${p.side === 'short' ? 'Vente' : 'Achat'}</span></td><td>${rpQtyFmt(p.qty)}</td><td>${rpPrice(p.entry)}</td><td>${p.sl != null ? rpPrice(p.sl) : '—'}</td><td>${p.tp != null ? rpPrice(p.tp) : '—'}</td>
        <td class="tone-${raw(u >= 0 ? 'green' : 'red')} fw-700">${rpMoney(u)}${R != null ? html` <small>${fmtR(R, 2)}</small>` : ''}</td>
        <td class="rp-acts"><button class="btn-ghost" onclick="rpMoveToBE('${raw(p.id)}')" title="Stop au prix d'entrée">BE</button><button class="btn-ghost" onclick="rpClosePos('${raw(p.id)}', 0.5)">50 %</button><button class="btn-ghost" onclick="rpClosePos('${raw(p.id)}', 1)">Fermer</button></td></tr>`;
    })}</tbody></table>` : html`<p class="rp-empty">Aucune position ouverte.</p>`);
  const ord = document.getElementById('rp-orders');
  if (ord) mount(ord, RP.orders.length ? html`<table class="rp-table"><thead><tr><th>Type</th><th>Sens</th><th>Prix</th><th>Quantité</th><th>Stop</th><th>Objectif</th><th></th></tr></thead><tbody>${RP.orders.map(o => html`<tr><td>${o.type === 'limit' ? 'Limite' : 'Stop'}</td><td>${o.side === 'short' ? 'Vente' : 'Achat'}</td><td>${rpPrice(o.price)}</td><td>${rpQtyFmt(o.qty)}</td><td>${o.sl != null ? rpPrice(o.sl) : '—'}</td><td>${o.tp != null ? rpPrice(o.tp) : '—'}</td><td class="rp-acts"><button class="btn-ghost" onclick="rpCancelOrder('${raw(o.id)}')">Annuler</button></td></tr>`)}</tbody></table>` : html`<p class="rp-empty">Aucun ordre en attente.</p>`);
  const hist = document.getElementById('rp-history');
  if (hist) mount(hist, RP.history.length ? html`<table class="rp-table"><thead><tr><th>Ouverture</th><th>Sens</th><th>Entrée</th><th>Sortie</th><th>Résultat</th><th>R</th><th></th></tr></thead><tbody>${RP.history.slice().reverse().map(p => {
      const net = p.realized - p.fees, R = p.risk0 > 0 ? net / p.risk0 : null;
      return html`<tr><td>${rpDateLabel(p.openTime)}</td><td>${p.side === 'short' ? 'Vente' : 'Achat'}</td><td>${rpPrice(p.entry)}</td><td>${rpPrice(rpExitPrice(p))}</td><td class="tone-${raw(net >= 0 ? 'green' : 'red')}">${rpMoney(net)}</td><td>${R != null ? fmtR(R, 2) : '—'}</td>
        <td>${p.journalId ? html`<button class="link-btn" onclick="openTradeDetail(${raw(p.journalId)})">Fiche →</button>` : ''}</td></tr>`;
    })}</tbody></table>` : html`<p class="rp-empty">Les trades clôturés de la séance apparaîtront ici${RP.autosave ? ' — et dans ton journal' : ''}.</p>`);
  const tabsCount = document.querySelectorAll('#rp-app .rp-tab');
  tabsCount.forEach(b => { const n = b.dataset.tab === 'positions' ? RP.positions.length : b.dataset.tab === 'orders' ? RP.orders.length : RP.history.length; const s = b.querySelector('.rp-n'); if (s) s.textContent = n ? String(n) : ''; });
  // Prix affiché sur les boutons Achat / Vente du ticket.
  document.querySelectorAll('#rp-ticket .rp-side b').forEach(b => { b.textContent = c ? rpPrice(c.close) : '—'; });
  const cnt = document.getElementById('trade-total-count'); if (cnt) cnt.textContent = trades.length;
  rpRedrawMarkers();
  rpSyncLines();
  renderReplayTicketSummary();
}
function rpShowTab(id) {
  document.querySelectorAll('#rp-app .rp-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('#rp-app .rp-pane').forEach(p => p.classList.toggle('active', p.dataset.tab === id));
}

// ── Ticket d'ordre (calculateur de position) ──
function rpTicketSet(k, v) {
  RP_TICKET[k] = v;
  if (k === 'side' || k === 'type' || k === 'slMode' || k === 'tpMode' || k === 'riskMode' || k === 'manualQty') renderReplayTicket(); else renderReplayTicketSummary();
}
// Stop proposé : 1 % sous / au-dessus du prix, pour démarrer vite (déplaçable sur le graphique).
function rpSuggestStop() {
  const c = rpCur(); if (!c) return;
  const sgn = RP_TICKET.side === 'short' ? -1 : 1, e = RP_TICKET.type === 'market' ? c.close : (+RP_TICKET.price || c.close);
  RP_TICKET.slMode = 'price'; RP_TICKET.sl = rpRound(e * (1 - sgn * 0.01));
  if (RP_TICKET.tp === '') { RP_TICKET.tpMode = 'rr'; RP_TICKET.tp = 2; }
  renderReplayTicket();
}
function renderReplayTicket() {
  const el = document.getElementById('rp-ticket');
  if (!el || !RP) return;
  const T = RP_TICKET, c = rpCur();
  const seg = (k, opts) => html`<div class="rp-seg">${opts.map(([v, l, cls]) => html`<button class="${raw((T[k] === v ? 'on ' : '') + (cls || ''))}" onclick="rpTicketSet('${raw(k)}', '${raw(v)}')">${l}</button>`)}</div>`;
  const setups = typeof knownSetups === 'function' ? knownSetups() : [];
  mount(el, html`
    <div class="rp-sides">
      <button class="rp-side buy${raw(T.side === 'long' ? ' on' : '')}" onclick="rpTicketSet('side','long')"><span>Achat</span><b>${c ? rpPrice(c.close) : '—'}</b></button>
      <button class="rp-side sell${raw(T.side === 'short' ? ' on' : '')}" onclick="rpTicketSet('side','short')"><span>Vente</span><b>${c ? rpPrice(c.close) : '—'}</b></button>
    </div>
    ${seg('type', [['market', 'Marché'], ['limit', 'Limite'], ['stop', 'Stop']])}
    ${T.type !== 'market' ? html`<label class="rp-f"><span>Prix de l'ordre</span><input type="number" step="any" value="${T.price}" placeholder="${c ? rpRound(c.close) : ''}" oninput="rpTicketSet('price', this.value)"></label>` : ''}
    <div class="rp-f"><span>Stop loss <button class="link-btn" onclick="rpSuggestStop()">proposer</button></span>
      <div class="rp-inrow"><input type="number" step="any" value="${T.sl}" placeholder="${T.slMode === 'price' ? 'prix' : T.slMode === 'pct' ? '%' : 'écart'}" oninput="rpTicketSet('sl', this.value)">${seg('slMode', [['price', 'Prix'], ['dist', 'Écart'], ['pct', '%']])}</div></div>
    <div class="rp-f"><span>Take profit</span>
      <div class="rp-inrow"><input type="number" step="any" value="${T.tp}" placeholder="${T.tpMode === 'rr' ? 'RR (ex. 2)' : T.tpMode === 'price' ? 'prix' : 'écart'}" oninput="rpTicketSet('tp', this.value)">${seg('tpMode', [['price', 'Prix'], ['dist', 'Écart'], ['rr', 'RR']])}</div></div>
    <div class="rp-f"><span>Risque</span>
      <div class="rp-inrow"><input type="number" step="any" min="0" value="${T.riskValue}" oninput="rpTicketSet('riskValue', this.value)">${seg('riskMode', [['pct', '% du solde'], ['amount', '$']])}</div></div>
    <label class="rp-check"><input type="checkbox" ${raw(T.manualQty ? 'checked' : '')} onchange="rpTicketSet('manualQty', this.checked)"> Quantité manuelle</label>
    ${T.manualQty ? html`<label class="rp-f"><span>Quantité (${rpBase(RP.symbol)})</span><input type="number" step="any" min="0" value="${T.qty}" oninput="rpTicketSet('qty', this.value)"></label>` : ''}
    <label class="rp-f"><span>Setup</span><select onchange="rpTicketSet('setup', this.value)"><option value="">—</option>${setups.map(s => html`<option value="${s}"${raw(s === T.setup ? ' selected' : '')}>${s}</option>`)}</select></label>
    <div class="rp-sum" id="rp-ticket-sum"></div>
    <button class="rp-go ${raw(T.side === 'short' ? 'sell' : 'buy')}" id="rp-go" onclick="rpPlaceOrder()">—</button>`);
  renderReplayTicketSummary();
}
function renderReplayTicketSummary() {
  const el = document.getElementById('rp-ticket-sum'), go = document.getElementById('rp-go');
  if (!el || !RP) return;
  const r = rpTicketCalc(), fx = rpFx(), base = rpBase(RP.symbol);
  if (r.error) {
    mount(el, html`<p class="rp-hint">${r.error === 'stop' ? 'Place un stop (ou « proposer ») : la quantité se calcule selon ton risque.' : r.error === 'side' ? '⚠️ Stop du mauvais côté de l’entrée.' : 'Renseigne le prix de l’ordre.'}</p>`);
    if (go) { go.textContent = (RP_TICKET.side === 'short' ? 'Vendre' : 'Acheter'); go.disabled = true; }
  } else {
    mount(el, html`
      <div class="rp-kv"><span>Quantité</span><b>${rpQtyFmt(r.qty)} ${base}</b></div>
      <div class="rp-kv"><span>Valeur</span><b>${rpMoney(r.notional, 0)}</b></div>
      <div class="rp-kv"><span>Levier</span><b class="${raw(r.leverage > 10 ? 'tone-red' : r.leverage > 3 ? 'tone-amber' : '')}">×${fmtNum(r.leverage || 0, 1)}</b></div>
      <div class="rp-kv"><span>Distance au stop</span><b>${rpPrice(r.distance, r.entry)} · ${fmtNum(r.distancePct, 2)} %</b></div>
      <div class="rp-kv"><span>Risque</span><b class="tone-red">−${rpMoney(r.risk)} · ${fmtNum(r.riskPct || 0, 2)} %${fx !== 1 ? html` <small>≈ ${fmtEUR(r.risk * fx, false, 2)}</small>` : ''}</b></div>
      <div class="rp-kv"><span>Gain visé</span><b class="tone-green">${r.reward != null ? '+' + rpMoney(r.reward) : '—'}${r.rr != null ? html` · RR ${fmtNum(r.rr, 2)}` : ''}</b></div>`);
    if (go) { go.disabled = false; go.textContent = (RP_TICKET.side === 'short' ? 'Vendre ' : 'Acheter ') + rpQtyFmt(r.qty) + ' ' + base + (RP_TICKET.type === 'market' ? '' : RP_TICKET.type === 'limit' ? ' (limite)' : ' (stop)'); }
  }
  rpSyncLines();
}

// Raccourcis clavier du replay : Espace = lecture / pause, → = bougie suivante, Maj + → = 10 bougies.
document.addEventListener('keydown', e => {
  const page = document.getElementById('page-replay');
  if (!page || !page.classList.contains('active') || !RP || !document.getElementById('rp-app') || document.getElementById('rp-app').hidden) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || '') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); rpTogglePlay(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); rpStep(e.shiftKey ? 10 : 1); }
}, true);
