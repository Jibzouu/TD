// ── REPLAY : DESSINS ET POSITIONS SUR LE GRAPHIQUE (façon TradingView) ──
// Couche dessinée dans le graphique lui-même (primitive Lightweight Charts : suit le zoom, le défilement et part dans les captures).
// · Outils : tendance, rayon, ligne étendue, horizontale, rayon horizontal, verticale, canal parallèle, rectangle,
//   Fibonacci, flèche, texte, pinceau, mesure de prix, position longue / courte (avec simulation du résultat).
// · Sélection, déplacement, poignées, couleur / épaisseur / style, aimant OHLC, annuler, raccourcis Alt + lettre.
// · Trading depuis le graphique : boutons Vente / Achat, bouton « + » et clic droit au prix voulu (limite / stop choisis
//   selon le prix), ordre passé directement depuis l'outil position ; zones vertes / rouges des positions, ordres,
//   aperçu du ticket et trades passés.
// Les points sont enregistrés en temps réel (secondes UTC) + prix : les dessins restent en place quand on change d'unité de temps.

const RPD_TOOLS = [
  { id: 'cursor', label: 'Curseur', key: '' },
  { id: 'trend', label: 'Ligne de tendance', key: 'T', n: 2 },
  { id: 'ray', label: 'Rayon', key: '', n: 2 },
  { id: 'extended', label: 'Ligne étendue', key: '', n: 2 },
  { id: 'hline', label: 'Ligne horizontale', key: 'H', n: 1 },
  { id: 'hray', label: 'Rayon horizontal', key: 'J', n: 1 },
  { id: 'vline', label: 'Ligne verticale', key: 'V', n: 1 },
  { id: 'channel', label: 'Canal parallèle', key: 'C', n: 3 },
  { id: 'rect', label: 'Rectangle', key: 'R', n: 2 },
  { id: 'fib', label: 'Retracement de Fibonacci', key: 'F', n: 2 },
  { id: 'long', label: 'Position longue', key: 'L', n: 1 },
  { id: 'short', label: 'Position courte', key: 'S', n: 1 },
  { id: 'range', label: 'Mesure de prix', key: 'M', n: 2 },
  { id: 'arrow', label: 'Flèche', key: 'A', n: 2 },
  { id: 'text', label: 'Texte', key: 'X', n: 1 },
  { id: 'brush', label: 'Pinceau', key: 'B', n: 0 }
];
const RPD_ICONS = {
  cursor: '<path d="M8 5l12 9-5.5 1.2 3.2 6.3-2.4 1.2-3.2-6.4L8 20z" fill="currentColor" stroke="none"/>',
  trend: '<path d="M7 21L21 7"/><circle cx="7" cy="21" r="2"/><circle cx="21" cy="7" r="2"/>',
  ray: '<path d="M7 21L24 4"/><circle cx="7" cy="21" r="2"/><circle cx="15" cy="13" r="2"/>',
  extended: '<path d="M3 25L25 3"/><circle cx="10" cy="18" r="2"/><circle cx="18" cy="10" r="2"/>',
  hline: '<path d="M3 14h22"/><circle cx="14" cy="14" r="2"/>',
  hray: '<path d="M9 14h16"/><circle cx="9" cy="14" r="2"/>',
  vline: '<path d="M14 3v22"/><circle cx="14" cy="14" r="2"/>',
  channel: '<path d="M4 17L17 5M11 24L24 12"/><path d="M7.5 20.5L20.5 8.5" stroke-dasharray="2 2"/>',
  rect: '<rect x="5" y="8" width="18" height="12" rx="1"/><circle cx="5" cy="8" r="1.8"/><circle cx="23" cy="20" r="1.8"/>',
  fib: '<path d="M4 6h20M4 11h20M4 16h20M4 22h20"/><path d="M6 22L22 6" stroke-dasharray="2 2"/>',
  long: '<rect x="6" y="4" width="16" height="10" fill="#089981" fill-opacity=".35" stroke="#089981"/><rect x="6" y="14" width="16" height="10" fill="#f23645" fill-opacity=".35" stroke="#f23645"/>',
  short: '<rect x="6" y="4" width="16" height="10" fill="#f23645" fill-opacity=".35" stroke="#f23645"/><rect x="6" y="14" width="16" height="10" fill="#089981" fill-opacity=".35" stroke="#089981"/>',
  range: '<path d="M14 5v18M10 9l4-4 4 4M10 19l4 4 4-4M6 5h16M6 23h16"/>',
  arrow: '<path d="M6 22L21 7M13 7h8v8"/>',
  text: '<path d="M7 7h14M14 7v15M11 22h6"/>',
  brush: '<path d="M5 21c3-7 6-1 9-6s5-8 9-9"/>',
  magnet: '<path d="M8 5v9a6 6 0 0012 0V5"/><path d="M8 9h4M16 9h4"/>',
  hist: '<rect x="4" y="6" width="9" height="7" fill="#089981" fill-opacity=".35" stroke="#089981"/><rect x="15" y="15" width="9" height="7" fill="#f23645" fill-opacity=".35" stroke="#f23645"/>',
  eye: '<path d="M3 14s4-7 11-7 11 7 11 7-4 7-11 7S3 14 3 14z"/><circle cx="14" cy="14" r="3"/>',
  undo: '<path d="M10 7L5 12l5 5"/><path d="M5 12h11a6 6 0 010 12h-4"/>',
  trash: '<path d="M6 8h16M11 8V5h6v3M8 8l1 15h10l1-15"/>'
};
const RPD_COLORS = ['#2962ff', '#f23645', '#089981', '#ff9800', '#9c27b0', '#f7c948', '#d1d4dc'];
const RPD_FIB = [[0, '#787b86'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#089981'], [0.786, '#00bcd4'], [1, '#787b86'], [1.618, '#2962ff']];
const RPD_DASH = [[], [6, 4], [2, 3]];

let RPD = { tool: 'cursor', sel: null, draft: null, drag: null, undo: [], el: null, req: null, plusPrice: null, plusTimer: null, keep: false };

function rpdIcon(id) { return '<svg viewBox="0 0 28 28" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (RPD_ICONS[id] || '') + '</svg>'; }
function rpdTool(id) { return RPD_TOOLS.find(t => t.id === id); }
function rpdById(id) { return (RP && RP.drawings || []).find(d => d.id === id); }

// ── Repères : temps ↔ index de bougie (fractionnaire, extrapolé hors des données) ↔ pixels ──
function rpdL(t) {
  const n = RP.cursor, tf = rpTfSec(RP.interval);
  if (!RPC.length) return 0;
  if (t >= RPC[n].time) return n + (t - RPC[n].time) / tf;
  if (t <= RPC[0].time) return (t - RPC[0].time) / tf;
  let lo = 0, hi = n;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (RPC[m].time <= t) lo = m; else hi = m; }
  return lo + (t - RPC[lo].time) / ((RPC[hi].time - RPC[lo].time) || tf);
}
function rpdT(l) {
  const n = RP.cursor, tf = rpTfSec(RP.interval);
  if (l >= n) return RPC[n].time + (l - n) * tf;
  if (l <= 0) return RPC[0].time + l * tf;
  const i = Math.floor(l), f = l - i;
  return RPC[i].time + f * (RPC[i + 1].time - RPC[i].time);
}
function rpdLX(l) {
  const ts = RP_CHART.timeScale(), a = ts.logicalToCoordinate(0), b = ts.logicalToCoordinate(1);
  return a == null || b == null ? null : a + (b - a) * l;
}
function rpdXL(x) {
  const ts = RP_CHART.timeScale(), a = ts.logicalToCoordinate(0), b = ts.logicalToCoordinate(1);
  return a == null || b == null || b === a ? 0 : (x - a) / (b - a);
}
function rpdX(t) { return rpdLX(rpdL(t)); }
function rpdY(p) { const y = RP_SERIES.priceToCoordinate(p); return y == null ? NaN : y; }
function rpdP(y) { return RP_SERIES.coordinateToPrice(y); }
function rpdPane() { try { return RP_CHART.paneSize(); } catch (e) { return { width: 0, height: 0 }; } }
// Point sous la souris : calé sur une bougie ; avec l'aimant, collé à l'ouverture / plus haut / plus bas / clôture proche.
function rpdPoint(x, y, free) {
  let l = rpdXL(x);
  if (!free) l = Math.round(l);
  let p = rpdP(y);
  if (RP.magnet && !free) {
    const c = RPC[Math.round(l)];
    if (c && Math.round(l) <= RP.cursor) {
      let best = null;
      [c.open, c.high, c.low, c.close].forEach(v => { const d = Math.abs(rpdY(v) - y); if (d < 18 && (!best || d < best.d)) best = { d, v }; });
      if (best) p = best.v;
    }
  }
  return { t: Math.round(rpdT(l)), p, l, x, y };
}
function rpdBarSec() { return rpTfSec(RP.interval); }

// ── Primitive Lightweight Charts ──
function rpdAttach(el) {
  if (!RP) return;
  RP.drawings = Array.isArray(RP.drawings) ? RP.drawings : [];
  if (Array.isArray(RP.lines) && RP.lines.length) {   // anciennes lignes horizontales → dessins
    const t = rpCur() ? rpCur().time : 0;
    RP.lines.forEach(p => RP.drawings.push(rpdNew('hline', [{ t, p }])));
  }
  delete RP.lines;
  if (RP.magnet == null) RP.magnet = true;
  if (RP.showHist == null) RP.showHist = true;
  const prim = {
    attached(p) { RPD.req = p.requestUpdate; },
    detached() { RPD.req = null; },
    updateAllViews() {},
    paneViews() { return [{ zOrder: () => 'top', renderer: () => ({ draw: tg => tg.useMediaCoordinateSpace(({ context, mediaSize }) => rpdRender(context, mediaSize)) }) },
      { zOrder: () => 'bottom', renderer: () => ({ draw: tg => tg.useMediaCoordinateSpace(({ context, mediaSize }) => rpdRenderTrades(context, mediaSize)) }) }]; },
    priceAxisViews() { return rpdAxisViews(); }
  };
  RP_SERIES.attachPrimitive(prim);
  RP_CHART.subscribeCrosshairMove(rpdOnCrosshair);
  RPD.el = el;
  if (!el._rpdBound) { rpdBind(el); el._rpdBound = true; }
  renderRpTools(); renderRpStylebar(); renderRpQuick();
}
function rpdRefresh() { if (RPD.req) RPD.req(); renderRpQuick(); }
function rpdSave() { rpSave(); rpdRefresh(); }
function rpdNew(type, pts) {
  const d = { id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type, pts,
    color: type === 'text' ? '#d1d4dc' : type === 'fib' ? '#787b86' : type === 'hline' || type === 'hray' ? '#ff9800' : RPD.lastColor || '#2962ff',
    width: type === 'brush' ? 2 : RPD.lastWidth || 2, dash: 0 };
  const def = rpdTpl().def[type];   // style par défaut choisi pour cet outil
  if (def) Object.assign(d, { color: def.color, width: def.width, dash: def.dash || 0 });
  return d;
}
// Modèles de style des dessins (pour toutes les séances) : { def: { outil: style }, list: { outil: [{ name, color, width, dash }] } }.
function rpdTpl() { const t = loadJSON('g_rp_dtpl', null); return t && typeof t === 'object' ? { def: t.def || {}, list: t.list || {} } : { def: {}, list: {} }; }
function rpdTplSave(t) { try { DB.setItem('g_rp_dtpl', JSON.stringify(t)); } catch (e) {} }
function rpdTplMenu(btn) {
  const m = document.getElementById('rp-tpl-dd'), d = rpdById(RPD.sel);
  if (!m || !d) return;
  if (!m.hidden) { m.hidden = true; return; }
  const t = rpdTpl(), list = t.list[d.type] || [];
  const it = (act, label, cls) => '<button type="button" class="rp-dd-it ' + (cls || '') + '" onclick="' + act + '">' + escHtmlAttr(tr(label)) + '</button>';
  m.innerHTML = it('rpdTplAdd()', 'Enregistrer le style comme modèle…') + it('rpdTplDefault()', 'Utiliser ce style pour les prochains dessins')
    + (t.def[d.type] ? it('rpdTplReset()', 'Revenir au style d’origine') : '')
    + (list.length ? '<div class="rp-dd-title">' + escHtmlAttr(tr('Mes modèles')) + '</div>' + list.map((x, i) => '<div class="rp-tpl-row"><button type="button" class="rp-dd-it" onclick="rpdTplApply(' + i + ')"><span class="rp-dd-sw" style="background:' + escHtmlAttr(x.color) + ';height:' + (x.width || 2) + 'px"></span>' + escHtmlAttr(x.name) + '</button><button type="button" class="rp-lg-b" aria-label="' + escHtmlAttr(tr('Supprimer')) + '" onclick="rpdTplDel(' + i + ')">×</button></div>').join('') : '');
  m.hidden = false;
  const r = btn.getBoundingClientRect(), pr = m.offsetParent.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(r.left - pr.left, pr.width - m.offsetWidth - 4)) + 'px'; m.style.top = (r.bottom - pr.top + 6) + 'px';
}
function rpdTplStyle(d) { return { color: d.color, width: d.width || 2, dash: d.dash || 0 }; }
function rpdTplClose() { const m = document.getElementById('rp-tpl-dd'); if (m) m.hidden = true; }
function rpdTplAdd() {
  const d = rpdById(RPD.sel); if (!d) return;
  const name = (prompt(tr('Nom du modèle'), '') || '').trim(); if (!name) return;
  const t = rpdTpl(); (t.list[d.type] = t.list[d.type] || []).push(Object.assign({ name }, rpdTplStyle(d)));
  rpdTplSave(t); rpdTplClose(); showToast(tr('Modèle enregistré'), 'success');
}
function rpdTplDefault() { const d = rpdById(RPD.sel); if (!d) return; const t = rpdTpl(); t.def[d.type] = rpdTplStyle(d); rpdTplSave(t); rpdTplClose(); showToast(tr('Style par défaut enregistré'), 'success'); }
function rpdTplReset() { const d = rpdById(RPD.sel); if (!d) return; const t = rpdTpl(); delete t.def[d.type]; rpdTplSave(t); rpdTplClose(); }
function rpdTplApply(i) {
  const d = rpdById(RPD.sel); if (!d) return;
  const x = (rpdTpl().list[d.type] || [])[i]; if (!x) return;
  rpdPush(); Object.assign(d, { color: x.color, width: x.width, dash: x.dash || 0 });
  rpdTplClose(); renderRpStylebar(); rpdSave();
}
function rpdTplDel(i) { const d = rpdById(RPD.sel); if (!d) return; const t = rpdTpl(); (t.list[d.type] || []).splice(i, 1); rpdTplSave(t); rpdTplClose(); }
document.addEventListener('pointerdown', e => { if (!e.target.closest('#rp-tpl-dd') && !e.target.closest('.rp-sb-tpl')) rpdTplClose(); });
function rpdPush() { RPD.undo.push(JSON.stringify(RP.drawings)); if (RPD.undo.length > 60) RPD.undo.shift(); }
function rpdUndo() {
  if (!RPD.undo.length) { showToast('Rien à annuler'); return; }
  RP.drawings = JSON.parse(RPD.undo.pop());
  if (RPD.sel && !rpdById(RPD.sel)) RPD.sel = null;
  renderRpStylebar(); rpdSave();
}
function rpdDelete(id) {
  const d = rpdById(id || RPD.sel); if (!d) return;
  rpdPush();
  RP.drawings = RP.drawings.filter(x => x !== d);
  if (RPD.sel === d.id) RPD.sel = null;
  renderRpStylebar(); rpdSave();
}
function rpdClearAll() {
  if (!RP || !RP.drawings.length) return;
  if (!confirm('Effacer tous les dessins de cette séance ?')) return;
  rpdPush(); RP.drawings = []; RPD.sel = null; renderRpStylebar(); rpdSave();
}
function rpdSetTool(id) {
  RPD.tool = RPD.tool === id && id !== 'cursor' ? 'cursor' : id;
  RPD.draft = null;
  if (RPD.tool !== 'cursor') { RPD.sel = null; renderRpStylebar(); }
  renderRpTools(); rpdRefresh();
}
function rpdToggle(k) { RP[k] = !RP[k]; renderRpTools(); rpdSave(); }

// ── Géométrie ──
function rpdSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
}
function rpdExtend(a, b, both) {   // segment prolongé hors de l'écran
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, k = 5000 / len;
  return [both ? { x: a.x - dx * k, y: a.y - dy * k } : a, { x: b.x + dx * k, y: b.y + dy * k }];
}
function rpdXY(pt) { return { x: rpdX(pt.t), y: rpdY(pt.p) }; }
// Prix de la ligne P0–P1 au temps t (canal parallèle).
function rpdLineP(a, b, t) { const la = rpdL(a.t), lb = rpdL(b.t); return lb === la ? a.p : a.p + (b.p - a.p) * (rpdL(t) - la) / (lb - la); }
function rpdChannel(d) {
  const a = rpdXY(d.pts[0]), b = rpdXY(d.pts[1]);
  const off = d.pts[2] ? d.pts[2].p - rpdLineP(d.pts[0], d.pts[1], d.pts[2].t) : 0;
  const a2 = { x: a.x, y: rpdY(d.pts[0].p + off) }, b2 = { x: b.x, y: rpdY(d.pts[1].p + off) };
  return { a, b, a2, b2, off };
}
function rpdBox(d) {   // positions longue / courte
  const x1 = rpdX(d.pts[0].t), x2 = rpdX(d.pts[1].t);
  return { x1, x2: Math.max(x2, x1 + 6), yE: rpdY(d.pts[0].p), yT: rpdY(d.tp), yS: rpdY(d.sl) };
}
function rpdHandles(d) {
  const P = d.pts.map(rpdXY), W = rpdPane().width;
  switch (d.type) {
    case 'hline': return [{ part: 0, x: Math.min(Math.max(P[0].x, 12), W - 12), y: P[0].y }];
    case 'hray': case 'vline': case 'text': return [{ part: 0, x: P[0].x, y: P[0].y }];
    case 'rect': return [{ part: 0, ...P[0] }, { part: 1, ...P[1] }, { part: 'c2', x: P[0].x, y: P[1].y }, { part: 'c3', x: P[1].x, y: P[0].y }];
    case 'channel': { const g = rpdChannel(d); return [{ part: 0, ...g.a }, { part: 1, ...g.b }, { part: 2, x: (g.a2.x + g.b2.x) / 2, y: (g.a2.y + g.b2.y) / 2 }]; }
    case 'long': case 'short': { const b = rpdBox(d); return [{ part: 'entry', x: b.x1, y: b.yE }, { part: 'tp', x: b.x1, y: b.yT }, { part: 'sl', x: b.x1, y: b.yS }, { part: 'end', x: b.x2, y: b.yE }]; }
    case 'brush': return [];
    default: return P.map((p, i) => ({ part: i, ...p }));
  }
}
function rpdHitBody(d, x, y) {
  const P = d.pts.map(rpdXY), T = 6;
  const inRect = (a, b) => x >= Math.min(a.x, b.x) - 3 && x <= Math.max(a.x, b.x) + 3 && y >= Math.min(a.y, b.y) - 3 && y <= Math.max(a.y, b.y) + 3;
  switch (d.type) {
    case 'trend': case 'arrow': return rpdSegDist(x, y, P[0].x, P[0].y, P[1].x, P[1].y) < T;
    case 'ray': case 'extended': { const [a, b] = rpdExtend(P[0], P[1], d.type === 'extended'); return rpdSegDist(x, y, a.x, a.y, b.x, b.y) < T; }
    case 'hline': return Math.abs(y - P[0].y) < T;
    case 'hray': return x >= P[0].x - T && Math.abs(y - P[0].y) < T;
    case 'vline': return Math.abs(x - P[0].x) < T;
    case 'rect': case 'range': return inRect(P[0], P[1]);
    case 'fib': return x >= Math.min(P[0].x, P[1].x) - 3 && x <= Math.max(P[0].x, P[1].x) + 3 && RPD_FIB.some(([lv]) => Math.abs(y - rpdY(d.pts[1].p + (d.pts[0].p - d.pts[1].p) * lv)) < T);
    case 'channel': { const g = rpdChannel(d); const [a, b] = [g.a, g.b], [c, e] = [g.a2, g.b2];
      if (rpdSegDist(x, y, a.x, a.y, b.x, b.y) < T || rpdSegDist(x, y, c.x, c.y, e.x, e.y) < T) return true;
      if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) return false;
      const f = (x - a.x) / ((b.x - a.x) || 1), y1 = a.y + (b.y - a.y) * f, y2 = c.y + (e.y - c.y) * f;
      return y >= Math.min(y1, y2) && y <= Math.max(y1, y2); }
    case 'long': case 'short': { const b = rpdBox(d); return x >= b.x1 && x <= b.x2 && y >= Math.min(b.yT, b.yS) && y <= Math.max(b.yT, b.yS); }
    case 'text': return x >= P[0].x - 3 && x <= P[0].x + (d._w || 40) + 3 && y >= P[0].y - (d._h || 16) - 3 && y <= P[0].y + 3;
    case 'brush': for (let i = 1; i < P.length; i++) if (rpdSegDist(x, y, P[i - 1].x, P[i - 1].y, P[i].x, P[i].y) < T) return true; return false;
  }
  return false;
}
// Ce qu'il y a sous la souris : d'abord les poignées du dessin sélectionné, puis les dessins (le plus récent au-dessus).
function rpdHit(x, y) {
  if (RP.hideDraw) return null;
  const sel = rpdById(RPD.sel);
  if (sel) { const h = rpdHandles(sel).find(h => Math.hypot(h.x - x, h.y - y) <= 8); if (h) return { d: sel, part: h.part }; }
  for (let i = RP.drawings.length - 1; i >= 0; i--) if (rpdHitBody(RP.drawings[i], x, y)) return { d: RP.drawings[i], part: 'body' };
  return null;
}
// Lignes de prix déplaçables (stop / objectif du ticket, des positions et des ordres).
function rpdLineHit(y) {
  return rpdOrderLines().filter(L => L.drag).find(L => Math.abs(rpdY(L.price) - y) <= 5) || null;
}
// Étiquette d'une ligne d'ordre sous la souris : bouton × (fermer / annuler), « +TP », ou le corps (à glisser).
function rpdOlHit(x, y) {
  return (RPD.olHits || []).find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) || null;
}

// ── Lignes d'ordres façon TradingView ──
// Chaque ligne : prix, couleur, étiquette [type / quantité][montant][×], déplaçable si elle a un « drag ».
// Pendant un glissement, le prix en cours remplace celui de la ligne (montants recalculés en direct).
function rpdOrderLines() {
  if (!RP || !RPC.length) return [];
  const c = rpCur(), out = [], BUY = '#2962ff', SELL = '#f23645', TPC = '#089981', SLC = '#f23645';
  const ov = RPD.drag && RPD.drag.ol ? { [RPD.drag.ol]: RPD.drag.price } : {};
  const P = (key, def) => ov[key] != null ? ov[key] : def;
  const money = v => (v >= 0 ? '+' : '−') + rpMoney(Math.abs(v)).replace(/^−/, '');
  const side = s => s === 'short' ? tr('VENTE') : tr('ACHAT');
  // Aperçu du ticket
  const T = RP_TICKET, r = rpTicketCalc();
  if (!r.error || r.error === 'stop') {
    const sgn = T.side === 'short' ? -1 : 1, qty = r.qty || 0;
    if (T.type !== 'market' && r.entry) out.push({ key: 'tk-e', price: P('tk-e', r.entry), color: T.side === 'short' ? SELL : BUY, dash: 1, tag: (T.type === 'limit' ? tr('LIMITE') : tr('STOP')) + ' ' + side(T.side), val: qty ? rpQtyFmt(qty) : '', drag: { kind: 'ticket', which: 'price' } });
    if (r.sl) out.push({ key: 'tk-sl', price: P('tk-sl', r.sl), color: SLC, dash: 1, tag: 'SL', val: qty ? money(-r.risk) : '', valColor: SLC, drag: { kind: 'ticket', which: 'sl' }, close: "rpdTicketClear('sl')" });
    if (r.tp) out.push({ key: 'tk-tp', price: P('tk-tp', r.tp), color: TPC, dash: 1, tag: 'TP', val: qty && r.reward != null ? money(r.reward) : '', valColor: TPC, drag: { kind: 'ticket', which: 'tp' }, close: "rpdTicketClear('tp')" });
  }
  // Positions ouvertes
  RP.positions.forEach(p => {
    const sgn = p.side === 'short' ? -1 : 1, u = c ? rpOpenPnl(p, c.close) : 0;
    out.push({ key: p.id + '-e', price: p.entry, color: p.side === 'short' ? SELL : BUY, tag: side(p.side) + ' ' + rpQtyFmt(p.qty), val: money(u), valColor: u >= 0 ? TPC : SLC, close: "rpClosePos('" + p.id + "', 1)", closeTip: 'Fermer la position', add: p.tp == null ? "rpdAddLevel('" + p.id + "','tp')" : p.sl == null ? "rpdAddLevel('" + p.id + "','sl')" : null, addLabel: p.tp == null ? '+TP' : '+SL' });
    if (p.sl != null) { const pr = P(p.id + '-sl', p.sl); out.push({ key: p.id + '-sl', price: pr, color: SLC, dash: 1, tag: 'SL', val: money((pr - p.entry) * sgn * p.qty), valColor: SLC, drag: { kind: 'pos', id: p.id, which: 'sl' }, close: "rpdRemoveLevel('" + p.id + "','sl')", closeTip: 'Retirer le stop' }); }
    if (p.tp != null) { const pr = P(p.id + '-tp', p.tp); out.push({ key: p.id + '-tp', price: pr, color: TPC, dash: 1, tag: 'TP', val: money((pr - p.entry) * sgn * p.qty), valColor: TPC, drag: { kind: 'pos', id: p.id, which: 'tp' }, close: "rpdRemoveLevel('" + p.id + "','tp')", closeTip: 'Retirer l’objectif' }); }
  });
  // Ordres en attente
  RP.orders.forEach(o => {
    const sgn = o.side === 'short' ? -1 : 1, e = P(o.id + '-o', o.price);
    out.push({ key: o.id + '-o', price: e, color: o.side === 'short' ? SELL : BUY, dash: 2, tag: (o.type === 'limit' ? tr('LIMITE') : tr('STOP')) + ' ' + side(o.side) + ' ' + rpQtyFmt(o.qty), val: rpPrice(e), drag: { kind: 'pos', id: o.id, which: 'entry' }, close: "rpCancelOrder('" + o.id + "')", closeTip: 'Annuler l’ordre' });
    if (o.sl != null) { const pr = P(o.id + '-sl', o.sl); out.push({ key: o.id + '-sl', price: pr, color: SLC, dash: 2, tag: 'SL', val: money((pr - e) * sgn * o.qty), valColor: SLC, drag: { kind: 'pos', id: o.id, which: 'sl' }, close: "rpdRemoveLevel('" + o.id + "','sl')" }); }
    if (o.tp != null) { const pr = P(o.id + '-tp', o.tp); out.push({ key: o.id + '-tp', price: pr, color: TPC, dash: 2, tag: 'TP', val: money((pr - e) * sgn * o.qty), valColor: TPC, drag: { kind: 'pos', id: o.id, which: 'tp' }, close: "rpdRemoveLevel('" + o.id + "','tp')" }); }
  });
  return out;
}
function rpdTicketClear(which) { RP_TICKET[which] = ''; renderReplayTicket(); }
function rpdRemoveLevel(id, which) {
  const p = RP.positions.find(x => x.id === id) || RP.orders.find(x => x.id === id);
  if (!p) return;
  p[which] = null; rpSave(); rpRefreshUi();
}
// « +TP » / « +SL » : niveau ajouté à 2R / 1R de l'entrée (à ajuster ensuite en glissant la ligne).
function rpdAddLevel(id, which) {
  const p = RP.positions.find(x => x.id === id); if (!p) return;
  const sgn = p.side === 'short' ? -1 : 1, dist = (p.risk0 && p.qty0 ? p.risk0 / p.qty0 : 0) || rpATR(14) * 1.5;
  p[which] = rpRound(which === 'tp' ? p.entry + sgn * dist * 2 : p.entry - sgn * dist);
  rpSave(); rpRefreshUi();
}
function rpdRenderOrderLines(ctx, size, k) {
  const lines = rpdOrderLines(), hits = [], H = 20, W = size.width;
  ctx.save();
  ctx.font = rpdFont(11.5, 600); ctx.textBaseline = 'middle';
  lines.forEach(L => {
    const y = Math.round(rpdY(L.price)) + 0.5;
    if (isNaN(y) || y < -H || y > size.height + H) return;
    ctx.strokeStyle = L.color; ctx.lineWidth = 1; ctx.setLineDash(L.dash === 2 ? [2, 3] : L.dash ? [5, 4] : []);
    rpdLine(ctx, { x: 0, y }, { x: W, y });
    ctx.setLineDash([]);
    // Étiquette à droite : [type][montant][×], plus « +TP » à gauche si besoin.
    const segs = [{ t: L.tag, part: 'body', fill: L.color, fg: '#fff' }];
    if (L.val) segs.push({ t: L.val, part: 'body', fill: k.bg, fg: L.valColor || k.txtStrong || '#d1d4dc' });
    if (L.close) segs.push({ t: '×', part: 'close', fill: k.bg, fg: k.txt, act: L.close });
    const ws = segs.map(sg => Math.ceil(ctx.measureText(sg.t).width) + (sg.part === 'close' ? 12 : 14));
    const total = ws.reduce((a, b) => a + b, 0);
    let x = Math.round(W - 64 - total) + 0.5;
    const y0 = Math.round(y - H / 2);
    if (L.add) {
      ctx.font = rpdFont(11, 700);
      const aw = Math.ceil(ctx.measureText(L.addLabel).width) + 12, ax = x - aw - 6;
      ctx.fillStyle = k.bg; ctx.strokeStyle = L.addLabel === '+TP' ? '#089981' : '#f23645';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(ax, y0, aw, H, 3); else ctx.rect(ax, y0, aw, H); ctx.fill(); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.textAlign = 'center'; ctx.fillText(L.addLabel, ax + aw / 2, y0 + H / 2 + 0.5);
      hits.push({ key: L.key, part: 'add', act: L.add, x: ax, y: y0, w: aw, h: H });
      ctx.font = rpdFont(11.5, 600);
    }
    // Contour commun, segments séparés par un filet.
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y0, total, H, 3); else ctx.rect(x, y0, total, H);
    ctx.save(); ctx.clip();
    segs.forEach((sg, i) => {
      ctx.fillStyle = sg.fill; ctx.fillRect(x, y0, ws[i], H);
      ctx.fillStyle = sg.fg; ctx.textAlign = 'center';
      ctx.font = sg.part === 'close' ? rpdFont(14, 400) : rpdFont(11.5, sg === segs[0] ? 600 : 500);
      ctx.fillText(sg.t, x + ws[i] / 2, y0 + H / 2 + (sg.part === 'close' ? 0 : 0.5));
      if (i) { ctx.fillStyle = L.color; ctx.fillRect(x, y0, 1, H); }
      hits.push({ key: L.key, part: sg.part, act: sg.act, x, y: y0, w: ws[i], h: H, L });
      x += ws[i];
    });
    ctx.restore();
    ctx.strokeStyle = L.color; ctx.lineWidth = 1; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x - total, y0, total, H, 3); else ctx.rect(x - total, y0, total, H); ctx.stroke();
    ctx.font = rpdFont(11.5, 600);
  });
  ctx.restore();
  RPD.olHits = hits.map(h => Object.assign(h, { L: h.L || lines.find(l => l.key === h.key) }));
}

// ── Souris / doigt ──
function rpdLocal(e) { const r = RPD.el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function rpdInPane(p) { const s = rpdPane(); return p.x >= 0 && p.y >= 0 && p.x <= s.width && p.y <= s.height; }
function rpdActive() { return RP && RP_CHART && RPC.length && document.getElementById('page-replay').classList.contains('active'); }
function rpdGrab(e) {
  e.preventDefault(); e.stopPropagation();
  RPD.grab = true;
  RP_CHART.applyOptions({ handleScroll: false, handleScale: false });
}
function rpdRelease() {
  if (!RPD.grab) return;
  RPD.grab = false;
  RP_CHART && RP_CHART.applyOptions({ handleScroll: true, handleScale: true });
}
function rpdBind(el) {
  el.addEventListener('pointerdown', rpdDown, true);
  // Le graphique ne doit pas défiler pendant qu'on dessine ou qu'on déplace un objet (doigt).
  el.addEventListener('touchstart', e => { if (RPD.grab) e.stopPropagation(); }, true);
  el.addEventListener('mousedown', e => { if (RPD.grab) e.stopPropagation(); }, true);
  window.addEventListener('pointermove', rpdMove);
  window.addEventListener('pointerup', rpdUp);
  window.addEventListener('pointercancel', rpdUp);
  el.addEventListener('contextmenu', rpdContext);
  el.addEventListener('dblclick', e => {
    if (!rpdActive()) return;
    const p = rpdLocal(e), h = rpdHit(p.x, p.y);
    if (h && h.d.type === 'text') rpdEditText(h.d);
  });
}
function rpdDown(e) {
  if (!rpdActive() || e.button === 2) return;
  const loc = rpdLocal(e);
  if (!rpdInPane(loc)) return;
  rpdCloseMenu();
  if (RPD.draft) { rpdAdvance(rpdPoint(loc.x, loc.y)); rpdGrab(e); return; }
  if (RPD.tool !== 'cursor') { rpdStart(rpdPoint(loc.x, loc.y, RPD.tool === 'brush')); rpdGrab(e); return; }
  const ol = rpdOlHit(loc.x, loc.y);
  if (ol) {
    rpdGrab(e);
    if (ol.part === 'close' || ol.part === 'add') { rpdRelease(); new Function(ol.act)(); return; }
    if (ol.L && ol.L.drag) { RPD.drag = { ol: ol.L.key, line: ol.L, price: ol.L.price }; return; }
    rpdRelease(); return;
  }
  const h = rpdHit(loc.x, loc.y);
  if (h && (h.part !== 'body' || !rpdLineHit(loc.y))) {
    rpdPush();
    RPD.sel = h.d.id;
    RPD.drag = { id: h.d.id, part: h.part, start: rpdPoint(loc.x, loc.y, true), orig: JSON.parse(JSON.stringify(h.d)), moved: false };
    rpdGrab(e); renderRpStylebar(); rpdRefresh();
    return;
  }
  const line = rpdLineHit(loc.y);
  if (line) { RPD.drag = { ol: line.key, line, price: line.price }; rpdGrab(e); return; }
  if (h) { rpdPush(); RPD.sel = h.d.id; RPD.drag = { id: h.d.id, part: 'body', start: rpdPoint(loc.x, loc.y, true), orig: JSON.parse(JSON.stringify(h.d)) }; rpdGrab(e); renderRpStylebar(); rpdRefresh(); return; }
  if (RPD.sel) { RPD.sel = null; renderRpStylebar(); rpdRefresh(); }
}
function rpdMove(e) {
  if (!RPD.el || !rpdActive()) return;
  const loc = rpdLocal(e);
  if (RPD.drag) {
    if (RPD.drag.line) {
      const price = rpdP(loc.y);
      if (price > 0) { RPD.drag.price = price; if (RPD.drag.line.drag.kind === 'ticket') rpDragApply(RPD.drag.line.drag, price, false); rpdRefresh(); }
      return;
    }
    rpdDragTo(rpdPoint(loc.x, loc.y, RPD.drag.part === 'body')); RPD.drag.moved = true;
    return;
  }
  if (RPD.draft) { rpdDraftTo(rpdPoint(loc.x, loc.y, RPD.draft.d.type === 'brush'), loc); return; }
  if (e.target && RPD.el.contains(e.target)) {
    let cur = RPD.tool !== 'cursor' ? 'cross' : '';
    if (!cur && rpdInPane(loc)) {
      const h = rpdHit(loc.x, loc.y);
      const ol = rpdOlHit(loc.x, loc.y);
      if (ol) cur = ol.part === 'body' ? (ol.L && ol.L.drag ? 'ns' : '') : 'pointer';
      else if (h) cur = h.part === 'body' ? 'move' : h.part === 'tp' || h.part === 'sl' ? 'ns' : h.part === 'end' ? 'ew' : 'grab';
      else if (rpdLineHit(loc.y)) cur = 'ns';
    }
    if (RPD.el.dataset.cur !== cur) RPD.el.dataset.cur = cur;
  }
}
function rpdUp() {
  if (RPD.drag) {
    const dr = RPD.drag; RPD.drag = null;
    if (dr.line) rpDragApply(dr.line.drag, dr.price, true);
    else rpSave();
    rpdRelease(); rpdRefresh();
    return;
  }
  if (RPD.draft) {
    const df = RPD.draft;
    if (df.d.type === 'brush') { rpdFinish(); return; }
    // Glisser-déposer : le point suivant est fixé au relâchement ; un simple clic attend le clic suivant.
    if (df.moved) rpdAdvance(null);
    rpdRelease();
    return;
  }
  rpdRelease();
}

// ── Création ──
function rpdStart(pt) {
  const type = RPD.tool, tool = rpdTool(type);
  rpdPush();
  if (type === 'long' || type === 'short') { rpdAddPosition(type, pt); return; }
  const d = rpdNew(type, [{ t: pt.t, p: pt.p }]);
  if (tool.n === 1) {
    RP.drawings.push(d); RPD.sel = d.id;
    if (!RPD.keep) { RPD.tool = 'cursor'; renderRpTools(); }
    renderRpStylebar(); rpdSave();
    if (type === 'text') rpdEditText(d, true);
    return;
  }
  if (type === 'brush') { RP.drawings.push(d); RPD.draft = { d, placed: 1, moved: false }; rpdRefresh(); return; }
  d.pts.push({ t: pt.t, p: pt.p });
  RP.drawings.push(d);
  RPD.draft = { d, placed: 1, moved: false, x: pt.x, y: pt.y, need: tool.n };
  rpdRefresh();
}
function rpdDraftTo(pt, loc) {
  const df = RPD.draft, d = df.d;
  if (d.type === 'brush') {
    const last = d.pts[d.pts.length - 1], ly = rpdY(last.p), lx = rpdX(last.t);
    if (Math.hypot(lx - loc.x, ly - loc.y) > 3) d.pts.push({ t: pt.t, p: pt.p });
    df.moved = true; rpdRefresh(); return;
  }
  if (Math.hypot(loc.x - df.x, loc.y - df.y) > 5) df.moved = true;
  d.pts[df.placed] = { t: pt.t, p: pt.p };
  rpdRefresh();
}
// Fixe le point en cours ; termine le dessin quand tous ses points sont posés.
function rpdAdvance(pt) {
  const df = RPD.draft; if (!df) return;
  if (pt) df.d.pts[df.placed] = { t: pt.t, p: pt.p };
  df.placed++;
  if (df.placed >= df.need) { rpdFinish(); return; }
  const last = df.d.pts[df.placed - 1];
  df.d.pts[df.placed] = { t: last.t, p: last.p };
  df.moved = false;
  rpdRefresh();
}
function rpdFinish() {
  const df = RPD.draft; RPD.draft = null;
  if (!df) return;
  const d = df.d;
  // Un dessin sans étendue (deux fois le même point) est retiré.
  if (d.type !== 'brush' && d.pts.length >= 2 && d.pts[0].t === d.pts[1].t && Math.abs(rpdY(d.pts[0].p) - rpdY(d.pts[1].p)) < 2 && d.type !== 'channel') {
    RP.drawings = RP.drawings.filter(x => x !== d); RPD.undo.pop();
  } else RPD.sel = d.id;
  if (d.type === 'brush' && d.pts.length < 2) RP.drawings = RP.drawings.filter(x => x !== d);
  if (!RPD.keep) RPD.tool = 'cursor';
  rpdRelease(); renderRpTools(); renderRpStylebar(); rpdSave();
}
// Outil position : entrée au point cliqué, stop à 1,5 × ATR, objectif à 2R, sur 20 bougies.
function rpdAddPosition(type, pt) {
  const br = rpDefaultBracket(type, pt.p);
  const sp = (rpdLX(1) - rpdLX(0)) || 6, bars = Math.max(15, Math.round(rpdPane().width * 0.22 / sp));
  const d = rpdNew(type, [{ t: pt.t, p: rpRound(pt.p) }, { t: pt.t + bars * rpdBarSec(), p: rpRound(pt.p) }]);
  d.sl = br.sl; d.tp = br.tp;
  RP.drawings.push(d); RPD.sel = d.id;
  if (!RPD.keep) RPD.tool = 'cursor';
  renderRpTools(); renderRpStylebar(); rpdSave();
  return d;
}

// ── Déplacement ──
function rpdDragTo(pt) {
  const dr = RPD.drag, d = rpdById(dr.id), o = dr.orig;
  if (!d) return;
  const shift = () => {
    const dl = Math.round(pt.l - dr.start.l), dp = pt.p - dr.start.p;
    d.pts = o.pts.map(q => ({ t: Math.round(rpdT(rpdL(q.t) + dl)), p: q.p + dp }));
    if (o.sl != null) { d.sl = o.sl + dp; d.tp = o.tp + dp; }
  };
  const snap = rpdPoint(pt.x, pt.y);
  const long = d.type === 'long';
  switch (dr.part) {
    case 'body': case 'entry': shift(); break;
    case 'tp': d.tp = long ? Math.max(snap.p, d.pts[0].p + 1e-9) : Math.min(snap.p, d.pts[0].p - 1e-9); break;
    case 'sl': d.sl = long ? Math.min(snap.p, d.pts[0].p - 1e-9) : Math.max(snap.p, d.pts[0].p + 1e-9); break;
    case 'end': d.pts[1] = { t: Math.max(snap.t, d.pts[0].t + rpdBarSec()), p: d.pts[0].p }; break;
    case 'c2': d.pts[0] = { t: snap.t, p: d.pts[0].p }; d.pts[1] = { t: d.pts[1].t, p: snap.p }; break;
    case 'c3': d.pts[1] = { t: snap.t, p: d.pts[1].p }; d.pts[0] = { t: d.pts[0].t, p: snap.p }; break;
    default:
      if (d.type === 'hline') d.pts[0] = { t: d.pts[0].t, p: snap.p };
      else if (d.type === 'vline') d.pts[0] = { t: snap.t, p: d.pts[0].p };
      else d.pts[dr.part] = { t: snap.t, p: snap.p };
  }
  if ((d.type === 'long' || d.type === 'short') && (dr.part === 'body' || dr.part === 'entry')) d.pts[1].p = d.pts[0].p;
  rpdRefresh();
}

// ── Rendu ──
function rpdStroke(ctx, d, hl) {
  ctx.strokeStyle = d.color; ctx.lineWidth = d.width || 2; ctx.setLineDash(RPD_DASH[d.dash || 0]);
}
function rpdLine(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
function rpdFont(px, w) { return (w || 600) + ' ' + (px || 11.5) + 'px Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'; }
// Étiquette arrondie (fond plein) centrée sur x, posée au-dessus (v = -1), au milieu (0) ou en dessous (1) de y.
// Plusieurs lignes possibles (« \n ») ; renvoie la boîte dessinée { x, y, w, h }.
function rpdPill(ctx, x, y, text, bg, fg, v, align, border, fs) {
  ctx.save();
  fs = fs || 12;
  ctx.font = rpdFont(fs, 400); ctx.setLineDash([]);
  const lines = String(text).split('\n'), lh = Math.round(fs * 1.25), padX = Math.round(fs / 2), padY = Math.max(2, Math.round(fs / 4));
  const w = Math.ceil(Math.max(...lines.map(l => ctx.measureText(l).width))) + padX * 2, h = lines.length * lh + padY * 2;
  let x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  if (RPD.paneW) x0 = Math.max(2, Math.min(x0, RPD.paneW - w - 2));
  const y0 = Math.round(v < 0 ? y - h - 3 : v > 0 ? y + 3 : y - h / 2);
  x0 = Math.round(x0);
  ctx.fillStyle = bg; ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x0, y0, w, h, 4); else ctx.rect(x0, y0, w, h);
  ctx.fill();
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke(); }
  ctx.fillStyle = fg || '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  lines.forEach((l, i) => ctx.fillText(l, x0 + w / 2, y0 + padY + lh * i + lh / 2 + 0.5));
  ctx.restore();
  return { x: x0, y: y0, w, h };
}
// Étiquette ajustée à la largeur de la boîte : on essaie chaque version du texte (de la plus complète à la plus courte),
// en réduisant la police de 12 à 9 px ; la première qui tient est dessinée.
function rpdPillFit(ctx, x, y, variants, maxW, bg, fg, v, border) {
  ctx.save();
  let pick = null;
  for (const t of variants) {
    for (let fs = 12; fs >= 9; fs -= 0.5) {
      ctx.font = rpdFont(fs, 400);
      const w = Math.max(...String(t).split('\n').map(l => ctx.measureText(l).width)) + fs;
      if (w <= maxW) { pick = { t, fs }; break; }
    }
    if (pick) break;
  }
  ctx.restore();
  if (!pick) pick = { t: variants[variants.length - 1], fs: 9 };
  return rpdPill(ctx, x, y, pick.t, bg, fg, v, 'center', border, pick.fs);
}
function rpdPct(a, b) { return fmtNum((b - a) / a * 100, 2) + ' %'; }
function rpdDistTxt(dist, ref) { return rpIsFx() ? fmtNum(dist / rpPip(), 1) + ' pips' : rpPrice(dist, ref); }
function rpdRiskAmt() { return RP_TICKET.riskMode === 'amount' ? +RP_TICKET.riskValue || 0 : rpBalance() * (+RP_TICKET.riskValue || 0) / 100; }

function rpdRender(ctx, size) {
  if (!RP || !RPC.length) return;
  const k = rpThemeColors();
  RPD.fontFam = k.font; RPD.paneW = size.width;
  rpdRenderTrades(ctx, size, true);
  if (!RP.hideDraw) RP.drawings.forEach(d => { try { rpdDrawOne(ctx, d, size, k); } catch (e) {} });
  const sel = rpdById(RPD.sel);
  if (sel && !RP.hideDraw) {
    const pos = sel.type === 'long' || sel.type === 'short';
    rpdHandles(sel).forEach(h => {
      ctx.save(); ctx.setLineDash([]); ctx.lineWidth = 1.5; ctx.fillStyle = k.bg; ctx.strokeStyle = pos ? '#2962ff' : sel.color;
      ctx.beginPath();
      if (pos && h.part !== 'entry') { if (ctx.roundRect) ctx.roundRect(h.x - 5.5, h.y - 5.5, 11, 11, 2.5); else ctx.rect(h.x - 5.5, h.y - 5.5, 11, 11); }
      else ctx.arc(h.x, h.y, 5.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke(); ctx.restore();
    });
  }
  rpdRenderOrderLines(ctx, size, k);
}
function rpdDrawOne(ctx, d, size, k) {
  const P = d.pts.map(rpdXY), W = size.width;
  ctx.save();
  rpdStroke(ctx, d);
  switch (d.type) {
    case 'trend': rpdLine(ctx, P[0], P[1]); break;
    case 'ray': case 'extended': { const [a, b] = rpdExtend(P[0], P[1], d.type === 'extended'); rpdLine(ctx, a, b); break; }
    case 'arrow': {
      rpdLine(ctx, P[0], P[1]);
      const ang = Math.atan2(P[1].y - P[0].y, P[1].x - P[0].x), L = 10 + (d.width || 2) * 2;
      ctx.setLineDash([]); ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(P[1].x, P[1].y);
      ctx.lineTo(P[1].x - L * Math.cos(ang - 0.45), P[1].y - L * Math.sin(ang - 0.45));
      ctx.lineTo(P[1].x - L * Math.cos(ang + 0.45), P[1].y - L * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
      break;
    }
    case 'hline': rpdLine(ctx, { x: 0, y: P[0].y }, { x: W, y: P[0].y }); break;
    case 'hray': rpdLine(ctx, P[0], { x: W + 10, y: P[0].y }); break;
    case 'vline': rpdLine(ctx, { x: P[0].x, y: 0 }, { x: P[0].x, y: size.height }); break;
    case 'rect': {
      const x = Math.min(P[0].x, P[1].x), y = Math.min(P[0].y, P[1].y), w = Math.abs(P[1].x - P[0].x), h = Math.abs(P[1].y - P[0].y);
      ctx.globalAlpha = 0.14; ctx.fillStyle = d.color; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; ctx.strokeRect(x, y, w, h);
      break;
    }
    case 'channel': {
      const g = rpdChannel(d);
      ctx.globalAlpha = 0.12; ctx.fillStyle = d.color; ctx.beginPath(); ctx.moveTo(g.a.x, g.a.y); ctx.lineTo(g.b.x, g.b.y); ctx.lineTo(g.b2.x, g.b2.y); ctx.lineTo(g.a2.x, g.a2.y); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; rpdLine(ctx, g.a, g.b); rpdLine(ctx, g.a2, g.b2);
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1; rpdLine(ctx, { x: (g.a.x + g.a2.x) / 2, y: (g.a.y + g.a2.y) / 2 }, { x: (g.b.x + g.b2.x) / 2, y: (g.b.y + g.b2.y) / 2 });
      break;
    }
    case 'fib': {
      const x1 = Math.min(P[0].x, P[1].x), x2 = Math.max(P[0].x, P[1].x), p0 = d.pts[0].p, p1 = d.pts[1].p;
      let prevY = null;
      ctx.font = rpdFont(11, 500); ctx.textBaseline = 'bottom';
      RPD_FIB.forEach(([lv, col]) => {
        const price = p1 + (p0 - p1) * lv, y = rpdY(price);
        if (prevY != null) { ctx.globalAlpha = 0.08; ctx.fillStyle = col; ctx.fillRect(x1, Math.min(prevY, y), x2 - x1, Math.abs(y - prevY)); }
        ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([]); rpdLine(ctx, { x: x1, y }, { x: x2, y });
        ctx.fillStyle = col; ctx.fillText(String(lv) + ' (' + rpPrice(price) + ')', x1 + 4, y - 2);
        prevY = y;
      });
      ctx.strokeStyle = d.color; ctx.setLineDash([4, 4]); rpdLine(ctx, P[0], P[1]);
      break;
    }
    case 'range': {
      const up = d.pts[1].p >= d.pts[0].p, col = up ? '#2962ff' : '#f23645';
      const x = Math.min(P[0].x, P[1].x), y = Math.min(P[0].y, P[1].y), w = Math.abs(P[1].x - P[0].x), h = Math.abs(P[1].y - P[0].y);
      ctx.globalAlpha = 0.16; ctx.fillStyle = col; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([]);
      const mx = x + w / 2; rpdLine(ctx, { x: mx, y: P[0].y }, { x: mx, y: P[1].y });
      const ay = P[1].y, dir = up ? 1 : -1; ctx.beginPath(); ctx.moveTo(mx - 5, ay + dir * 6); ctx.lineTo(mx, ay); ctx.lineTo(mx + 5, ay + dir * 6); ctx.stroke();
      const dp = d.pts[1].p - d.pts[0].p, bars = Math.round(Math.abs(rpdL(d.pts[1].t) - rpdL(d.pts[0].t)));
      const txt = (dp >= 0 ? '+' : '−') + rpPrice(Math.abs(dp), d.pts[0].p) + ' (' + rpdPct(d.pts[0].p, d.pts[1].p) + ')' + (rpIsFx() ? ' · ' + fmtNum(Math.abs(dp) / rpPip(), 1) + ' pips' : '') + ' · ' + bars + ' ' + tr(bars > 1 ? 'bougies' : 'bougie');
      rpdPill(ctx, mx, up ? y : y + h, txt, col, '#fff', up ? -1 : 1);
      break;
    }
    case 'text': {
      ctx.font = rpdFont(13 + (d.width || 2) * 2, 600); ctx.textBaseline = 'bottom'; ctx.fillStyle = d.color; ctx.setLineDash([]);
      const lines = String(d.text || '').split('\n'), lh = 16 + (d.width || 2) * 2;
      let w = 0; lines.forEach((ln, i) => { ctx.fillText(ln, P[0].x, P[0].y - (lines.length - 1 - i) * lh); w = Math.max(w, ctx.measureText(ln).width); });
      d._w = w; d._h = lh * lines.length;
      break;
    }
    case 'brush': {
      ctx.setLineDash([]); ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
      break;
    }
    case 'long': case 'short': rpdDrawPosTool(ctx, d, k); break;
  }
  ctx.restore();
}
// Simulation de l'outil position sur les bougies déjà affichées : objectif ou stop touché (stop prioritaire dans la même bougie).
function rpdSim(d) {
  const long = d.type === 'long', l0 = Math.round(rpdL(d.pts[0].t)), l1 = Math.min(RP.cursor, Math.floor(rpdL(d.pts[1].t) + 1e-6));
  if (l1 <= l0) return { state: 'wait' };
  for (let i = Math.max(0, l0 + 1); i <= l1; i++) {
    const c = RPC[i];
    if (long ? c.low <= d.sl : c.high >= d.sl) return { state: 'sl', i, price: d.sl };
    if (long ? c.high >= d.tp : c.low <= d.tp) return { state: 'tp', i, price: d.tp };
  }
  return { state: 'run', i: l1, price: RPC[l1].close };
}
function rpdDrawPosTool(ctx, d, k) {
  const b = rpdBox(d), long = d.type === 'long', e = d.pts[0].p, dist = Math.abs(e - d.sl), rr = Math.abs(d.tp - e) / (dist || 1);
  const G = '#089981', R = '#f23645', w = b.x2 - b.x1;
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.2; ctx.fillStyle = G; ctx.fillRect(b.x1, Math.min(b.yE, b.yT), w, Math.abs(b.yT - b.yE));
  ctx.fillStyle = R; ctx.fillRect(b.x1, Math.min(b.yE, b.yS), w, Math.abs(b.yS - b.yE));
  const sim = rpdSim(d);
  if (sim.state !== 'wait') {   // partie déjà jouée, plus foncée
    const xs = rpdLX(sim.i), yP = rpdY(sim.price);
    ctx.globalAlpha = 0.28; ctx.fillStyle = (long ? sim.price >= e : sim.price <= e) ? G : R;
    ctx.fillRect(b.x1, Math.min(b.yE, yP), Math.max(1, xs - b.x1), Math.abs(yP - b.yE));
    ctx.globalAlpha = 1; ctx.strokeStyle = k.txt; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); rpdLine(ctx, { x: b.x1, y: b.yE }, { x: xs, y: yP }); ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1; ctx.lineWidth = 1;
  ctx.strokeStyle = k.txt; rpdLine(ctx, { x: b.x1, y: b.yE }, { x: b.x2, y: b.yE });
  ctx.strokeStyle = G; rpdLine(ctx, { x: b.x1, y: b.yT }, { x: b.x2, y: b.yT });
  ctx.strokeStyle = R; rpdLine(ctx, { x: b.x1, y: b.yS }, { x: b.x2, y: b.yS });
  // Étiquettes comme TradingView : « Cible » collée au-dessus de la boîte (en dessous pour une vente), « Stop » de l'autre côté,
  // bloc central sur deux lignes posé sur la ligne d'entrée. Distance en prix, en %, en pips (forex) ou en ticks, montant en $.
  // Partie visible de la boîte (elle peut dépasser le bord droit du graphique) : les textes s'y centrent et s'y ajustent.
  const vx1 = Math.max(b.x1, 0), vx2 = Math.min(b.x2, RPD.paneW || b.x2), vw = Math.max(0, vx2 - vx1);
  const qty = dist > 0 ? rpFloorStep(rpdRiskAmt() / dist, rpQtyStep(e)) : 0, mx = (vx1 + vx2) / 2;
  const num = (v, d) => (+v).toLocaleString(UI_LOCALE, { maximumFractionDigits: d ?? 2 });
  const ticks = dd => rpIsFx() ? num(dd / rpPip(), 1) : num(dd * Math.pow(10, rpDecimals(e)), 0);
  const lvl = (name, dd) => [
    tr(name) + ': ' + rpPrice(dd, e) + ' (' + num(dd / e * 100, 3) + '%) ' + ticks(dd) + ', ' + tr('Montant') + ': ' + num(qty * dd, 2),
    tr(name) + ': ' + rpPrice(dd, e) + ' (' + num(dd / e * 100, 2) + '%), ' + tr('Montant') + ': ' + num(qty * dd, 2),
    tr(name) + ': ' + num(dd / e * 100, 2) + '%, ' + num(qty * dd, 0),
    num(qty * dd, 0)];
  const top = long ? b.yT : b.yS, bot = long ? b.yS : b.yT, maxW = Math.max(30, vw - 2);
  rpdPillFit(ctx, mx, top, lvl(long ? 'Cible' : 'Stop', long ? Math.abs(d.tp - e) : dist), maxW, long ? G : R, '#fff', -1);
  rpdPillFit(ctx, mx, bot, lvl(long ? 'Stop' : 'Cible', long ? dist : Math.abs(d.tp - e)), maxW, long ? R : G, '#fff', 1);
  const last = sim.state === 'tp' || sim.state === 'sl' ? sim.price : rpCur().close;
  const pl = long ? last - e : e - last, plName = tr(sim.state === 'tp' || sim.state === 'sl' ? 'Clôturé P&L' : 'Ouverture P&L');
  rpdPillFit(ctx, mx, b.yE, [
    plName + ': ' + rpPrice(pl, e) + ', ' + tr('Qté') + ': ' + rpQtyFmt(qty) + '\n' + tr('Ratio Risque/Récompense') + ': ' + num(rr, 2),
    'P&L: ' + rpPrice(pl, e) + ', ' + tr('Qté') + ': ' + rpQtyFmt(qty) + '\n' + 'R/R: ' + num(rr, 2),
    'P&L: ' + rpPrice(pl, e) + '\nR/R: ' + num(rr, 2),
    'R/R ' + num(rr, 2)], maxW, '#868993', '#131722', 0, '#ffffff');
}

// Zones des trades (sous les bougies) : aperçu du ticket, positions ouvertes, ordres en attente, trades passés.
function rpdZone(ctx, x1, x2, yE, yT, yS, alpha, dashed, k) {
  if (x2 < 0) return;
  const w = Math.max(3, x2 - x1);
  ctx.globalAlpha = alpha;
  if (!isNaN(yT)) { ctx.fillStyle = k.green; ctx.fillRect(x1, Math.min(yE, yT), w, Math.abs(yT - yE)); }
  if (!isNaN(yS)) { ctx.fillStyle = k.red; ctx.fillRect(x1, Math.min(yE, yS), w, Math.abs(yS - yE)); }
  ctx.globalAlpha = Math.min(1, alpha * 4); ctx.lineWidth = 1; ctx.setLineDash(dashed ? [4, 3] : []);
  if (!isNaN(yT)) { ctx.strokeStyle = k.green; ctx.strokeRect(x1, Math.min(yE, yT), w, Math.abs(yT - yE)); }
  if (!isNaN(yS)) { ctx.strokeStyle = k.red; ctx.strokeRect(x1, Math.min(yE, yS), w, Math.abs(yS - yE)); }
  ctx.globalAlpha = 1; ctx.setLineDash([]);
}
function rpdRenderTrades(ctx, size, labels) {
  if (!RP || !RPC.length) return;
  const k = rpThemeColors(), cur = RP.cursor, c = rpCur(), now = rpdLX(cur);
  RPD.fontFam = k.font; RPD.paneW = size.width;
  ctx.save();
  if (RP.showHist) RP.history.forEach(p => {
    const x1 = rpdX(p.openTime), x2 = rpdX(p.closeTime || p.openTime);
    if (x2 < -50 || x1 > size.width + 50) return;
    const net = p.realized - p.fees, R = p.risk0 > 0 ? net / p.risk0 : null, yE = rpdY(p.entry), exit = rpExitPrice(p);
    if (labels) { if (R != null && x2 - x1 > 30) rpdPill(ctx, x2, rpdY(exit), (R >= 0 ? '+' : '−') + fmtNum(Math.abs(R), 2) + 'R', net >= 0 ? k.green : k.red, '#fff', 0, 'left'); return; }
    rpdZone(ctx, x1, x2, yE, p.tp != null ? rpdY(p.tp) : NaN, p.sl0 != null ? rpdY(p.sl0) : NaN, 0.1, false, k);
    if (exit != null) { ctx.strokeStyle = net >= 0 ? k.green : k.red; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); rpdLine(ctx, { x: x1, y: yE }, { x: x2, y: rpdY(exit) }); ctx.setLineDash([]); }
  });
  if (!labels) RP.orders.forEach(o => {
    const x1 = rpdX(o.created);
    rpdZone(ctx, x1, now + 6 * (rpdLX(1) - rpdLX(0)), rpdY(o.price), o.tp != null ? rpdY(o.tp) : NaN, o.sl != null ? rpdY(o.sl) : NaN, 0.07, true, k);
  });
  RP.positions.forEach(p => {
    const x1 = rpdX(p.openTime), sp = rpdLX(1) - rpdLX(0), x2 = now + 6 * sp, yE = rpdY(p.entry);
    const u = c ? rpOpenPnl(p, c.close) : 0, R = p.risk0 > 0 ? (u + p.realized - p.fees) / p.risk0 : null;
    if (!labels) {
      rpdZone(ctx, x1, x2, yE, p.tp != null ? rpdY(p.tp) : NaN, p.sl != null ? rpdY(p.sl) : NaN, 0.17, false, k);
      if (c) { ctx.strokeStyle = u >= 0 ? k.green : k.red; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); rpdLine(ctx, { x: x1, y: yE }, { x: now, y: rpdY(c.close) }); ctx.setLineDash([]); }
    } else if (c) {
    }
  });
  // Aperçu du ticket : la position telle qu'elle sera passée.
  const r = labels ? { error: 1 } : rpTicketCalc();
  if (!r.error) {
    const sp = rpdLX(1) - rpdLX(0), x1 = now + 2 * sp, x2 = now + 16 * sp;
    rpdZone(ctx, x1, x2, rpdY(r.entry), r.tp ? rpdY(r.tp) : NaN, rpdY(r.sl), 0.12, true, k);
  }
  ctx.restore();
}
// Étiquettes sur l'échelle de prix : lignes horizontales, niveaux du dessin sélectionné.
function rpdAxisViews() {
  if (!RP || !RP_SERIES) return [];
  const out = [], mk = (p, col) => out.push({ coordinate: () => rpdY(p), text: () => rpPrice(p), textColor: () => '#fff', backColor: () => col, visible: () => !isNaN(rpdY(p)) });
  if (!RP.hideDraw) RP.drawings.forEach(d => { if (d.type === 'hline' || d.type === 'hray') mk(d.pts[0].p, d.color); });
  rpdOrderLines().forEach(L => mk(L.price, L.color));
  const s = rpdById(RPD.sel);
  if (s) {
    if (s.type === 'long' || s.type === 'short') { mk(s.pts[0].p, '#50535e'); mk(s.tp, '#089981'); mk(s.sl, '#f23645'); }
    else if (s.type !== 'hline' && s.type !== 'hray' && s.type !== 'vline' && s.type !== 'brush') s.pts.slice(0, 2).forEach(p => mk(p.p, s.color));
  }
  return out;
}

// ── Barres d'outils ──
function renderRpTools() {
  const el = document.getElementById('rp-tools');
  if (!el || !RP) return;
  const b = (id, label, on, act, icon, key) => { const l = escHtmlAttr(tr(label) + (key ? ' (Alt+' + key + ')' : '')); return '<button type="button" class="rp-tool' + (on ? ' on' : '') + '" data-tool="' + id + '" title="' + l + '" aria-label="' + l + '" aria-pressed="' + (on ? 'true' : 'false') + '" onclick="' + act + '">' + rpdIcon(icon || id) + '</button>'; };
  el.innerHTML = RPD_TOOLS.map(t => b(t.id, t.label, RPD.tool === t.id, "rpdSetTool('" + t.id + "')", null, t.key)).join('')
    + '<span class="rp-tools-sep"></span>'
    + b('magnet', 'Aimant (colle aux prix des bougies)', RP.magnet, "rpdToggle('magnet')")
    + b('hist', 'Afficher les trades passés', RP.showHist, "rpdToggle('showHist')")
    + b('eye', RP.hideDraw ? 'Afficher les dessins' : 'Masquer les dessins', !RP.hideDraw, "rpdToggle('hideDraw')")
    + b('undo', 'Annuler (Ctrl+Z)', false, 'rpdUndo()')
    + b('trash', 'Effacer tous les dessins', false, 'rpdClearAll()');
}
function escHtmlAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
function renderRpStylebar() {
  const el = document.getElementById('rp-stylebar');
  if (!el) return;
  const d = rpdById(RPD.sel);
  el.hidden = !d;
  if (!d) { rpdTplClose(); return; }
  const pos = d.type === 'long' || d.type === 'short', name = (rpdTool(d.type) || {}).label || '';
  mount(el, html`<span class="rp-sb-name">${name}</span>
    ${!pos && d.type !== 'fib' && d.type !== 'range' ? html`<span class="rp-sb-colors">${RPD_COLORS.map(c => html`<button type="button" class="rp-sw${raw(c === d.color ? ' on' : '')}" style="${raw('background:' + c)}" aria-label="${c}" onclick="${raw("rpdStyle('color','" + c + "')")}"></button>`)}</span>
      <span class="rp-sb-grp">${[1, 2, 3, 4].map(w => html`<button type="button" class="rp-sb-btn${raw(w === (d.width || 2) ? ' on' : '')}" title="${d.type === 'text' ? 'Taille ' + w : 'Épaisseur ' + w}" onclick="${raw("rpdStyle('width'," + w + ')')}"><span class="rp-sb-w" style="${raw('height:' + w + 'px')}"></span></button>`)}</span>
      ${d.type !== 'text' ? html`<span class="rp-sb-grp">${[['0', 'Continu'], ['1', 'Tirets'], ['2', 'Pointillés']].map(([v, l]) => html`<button type="button" class="rp-sb-btn${raw(+v === (d.dash || 0) ? ' on' : '')}" title="${l}" onclick="${raw("rpdStyle('dash'," + v + ')')}"><span class="rp-sb-d${raw(' d' + v)}"></span></button>`)}</span>` : ''}` : ''}
    ${pos ? html`<button type="button" class="btn-primary rp-sb-order" onclick="rpdOrderFromTool()">▶ Passer cet ordre</button><button type="button" class="btn-ghost" onclick="rpdFlip()" title="Inverser long / short">⇅ Inverser</button>` : ''}
    ${d.type === 'text' ? html`<button type="button" class="btn-ghost" onclick="${raw("rpdEditText(rpdById('" + d.id + "'))")}">✎ Texte</button>` : ''}
    ${!pos ? html`<button type="button" class="btn-ghost rp-sb-tpl" onclick="rpdTplMenu(this)" title="Modèles de style">Modèle ▾</button>` : ''}
    <button type="button" class="rp-sb-btn" title="Dupliquer" onclick="rpdDuplicate()">⧉</button>
    <button type="button" class="rp-sb-btn rp-sb-del" title="Supprimer (Suppr)" aria-label="Supprimer" onclick="rpdDelete()">${raw(rpdIcon('trash'))}</button>`);
}
function rpdStyle(k, v) {
  const d = rpdById(RPD.sel); if (!d) return;
  rpdPush(); d[k] = v;
  if (k === 'color') RPD.lastColor = v;
  if (k === 'width') RPD.lastWidth = v;
  renderRpStylebar(); rpdSave();
}
function rpdDuplicate() {
  const d = rpdById(RPD.sel); if (!d) return;
  rpdPush();
  const c = JSON.parse(JSON.stringify(d)), sh = 5 * rpdBarSec();
  c.id = rpdNew(d.type, []).id; c.pts = c.pts.map(p => ({ t: p.t + sh, p: p.p }));
  RP.drawings.push(c); RPD.sel = c.id; renderRpStylebar(); rpdSave();
}
function rpdFlip() {
  const d = rpdById(RPD.sel); if (!d || (d.type !== 'long' && d.type !== 'short')) return;
  rpdPush();
  const e = d.pts[0].p;
  d.type = d.type === 'long' ? 'short' : 'long';
  d.sl = 2 * e - d.sl; d.tp = 2 * e - d.tp;
  renderRpStylebar(); rpdSave();
}
// Outil position → ordre réel : marché si l'entrée est au prix, sinon limite ou stop selon le côté.
function rpdOrderFromTool() {
  const d = rpdById(RPD.sel); if (!d || (d.type !== 'long' && d.type !== 'short')) return;
  const side = d.type, type = rpTypeFor(side, d.pts[0].p);
  rpSubmit({ side, type, entry: d.pts[0].p, sl: rpRound(d.sl), tp: rpRound(d.tp) });
}
// Texte : petit champ posé sur le graphique.
function rpdEditText(d, fresh) {
  const inp = document.getElementById('rp-text-in'); if (!inp || !d) return;
  const p = rpdXY(d.pts[0]);
  inp.hidden = false; inp.value = d.text || '';
  inp.style.left = Math.max(4, p.x) + 'px'; inp.style.top = Math.max(4, p.y - 34) + 'px';
  inp.focus(); inp.select();
  const done = keep => {
    inp.onkeydown = inp.onblur = null; inp.hidden = true;
    if (!keep) { if (fresh) { RP.drawings = RP.drawings.filter(x => x !== d); RPD.sel = null; renderRpStylebar(); rpdSave(); } return; }
    const v = inp.value.trim();
    if (!v) { RP.drawings = RP.drawings.filter(x => x !== d); RPD.sel = null; renderRpStylebar(); }
    else d.text = v;
    rpdSave();
  };
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); done(true); } else if (e.key === 'Escape') done(!fresh && true); };
  inp.onblur = () => done(true);
}

// ── Trading depuis le graphique ──
// Boutons Vente / Achat au marché (en haut à gauche, comme TradingView).
function renderRpQuick() {
  const el = document.getElementById('rp-quick'), c = rpCur();
  if (!el || !RP) return;
  if (!el.firstChild) el.innerHTML = '<button type="button" class="rp-q sell" onclick="rpQuickOrder(\'short\',\'market\')"><span>' + tr('VENTE') + '</span><b></b></button><button type="button" class="rp-q buy" onclick="rpQuickOrder(\'long\',\'market\')"><span>' + tr('ACHAT') + '</span><b></b></button>';
  el.querySelectorAll('b').forEach(b => { b.textContent = c ? rpPrice(c.close) : '—'; });
}
// Bouton « + » sur la droite du graphique, à la hauteur de la souris : ordre à ce prix.
function rpdOnCrosshair(param) {
  const plus = document.getElementById('rp-plus');
  if (!plus || !RP) return;
  if (param && param.point && !RPD.drag && !RPD.draft && RPD.tool === 'cursor') {
    clearTimeout(RPD.plusTimer);
    const s = rpdPane(), price = rpdP(param.point.y);
    if (!(price > 0)) return;
    RPD.plusPrice = price;
    plus.hidden = false;
    plus.style.left = (s.width - 26) + 'px'; plus.style.top = (param.point.y - 10) + 'px';
    plus.title = tr('Passer un ordre à') + ' ' + rpPrice(price);
  } else {
    clearTimeout(RPD.plusTimer);
    RPD.plusTimer = setTimeout(() => { if (!plus.matches(':hover')) plus.hidden = true; }, 200);
  }
}
function rpdPlusClick(e) {
  e.stopPropagation();
  const plus = document.getElementById('rp-plus');
  rpdOpenMenu(parseFloat(plus.style.left) - 210, parseFloat(plus.style.top) + 22, RPD.plusPrice, null, true);
}
function rpdContext(e) {
  if (!rpdActive()) return;
  e.preventDefault();
  const loc = rpdLocal(e);
  if (!rpdInPane(loc)) return;
  rpdOpenMenu(loc.x, loc.y, rpdP(loc.y), loc, false);
}
function rpdOpenMenu(x, y, price, loc, ordersOnly) {
  const m = document.getElementById('rp-menu'); if (!m || !(price > 0)) return;
  price = rpRound(price);
  const tl = t => t === 'limit' ? 'limite' : t === 'stop' ? 'stop' : 'au marché';
  const tb = rpTypeFor('long', price), ts = rpTypeFor('short', price);
  const hit = loc ? rpdHit(loc.x, loc.y) : null;
  RPD.menu = { price, loc };
  const items = [
    ['buy', 'Acheter ' + tl(tb) + ' à {p}', "rpQuickOrder('long','" + tb + "'," + price + ')'],
    ['sell', 'Vendre ' + tl(ts) + ' à {p}', "rpQuickOrder('short','" + ts + "'," + price + ')']
  ];
  if (!ordersOnly) {
    items.push(['sep']);
    items.push(['', 'Position longue ici', "rpdMenuTool('long')"], ['', 'Position courte ici', "rpdMenuTool('short')"], ['', 'Ligne horizontale ici', "rpdMenuTool('hline')"]);
    if (hit) items.push(['sep'], ['del', 'Supprimer ce dessin', "rpdDelete('" + hit.d.id + "')"]);
    if (RP.drawings.length) items.push(['', 'Effacer tous les dessins', 'rpdClearAll()']);
  }
  m.innerHTML = items.map(it => it[0] === 'sep' ? '<div class="rp-menu-sep"></div>' : '<button type="button" class="rp-menu-it ' + it[0] + '" onclick="rpdCloseMenu();' + it[2] + '">' + escHtmlAttr(tr(it[1]).replace('{p}', rpPrice(price))) + '</button>').join('');
  m.hidden = false;
  const W = RPD.el.clientWidth, H = RPD.el.clientHeight;
  m.style.left = Math.max(4, Math.min(x, W - m.offsetWidth - 4)) + 'px';
  m.style.top = Math.max(4, Math.min(y, H - m.offsetHeight - 4)) + 'px';
}
function rpdMenuTool(type) {
  const mn = RPD.menu; if (!mn) return;
  const pt = mn.loc ? rpdPoint(mn.loc.x, mn.loc.y) : { t: rpCur().time, p: mn.price };
  rpdPush();
  if (type === 'hline') { const d = rpdNew('hline', [{ t: pt.t, p: mn.price }]); RP.drawings.push(d); RPD.sel = d.id; renderRpStylebar(); rpdSave(); }
  else rpdAddPosition(type, { t: pt.t, p: mn.price });
}
function rpdCloseMenu() { const m = document.getElementById('rp-menu'); if (m) m.hidden = true; }
document.addEventListener('pointerdown', e => { const m = document.getElementById('rp-menu'); if (m && !m.hidden && !m.contains(e.target)) rpdCloseMenu(); });

// ── Clavier : Alt + lettre (outils), Suppr, Ctrl+Z, Échap ──
document.addEventListener('keydown', e => {
  const page = document.getElementById('page-replay');
  if (!page || !page.classList.contains('active') || !RP || !RP_CHART) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || '')) return;
  if (e.key === 'Escape') {
    if (RPD.draft) { RP.drawings = RP.drawings.filter(x => x !== RPD.draft.d); RPD.draft = null; rpdRelease(); }
    rpdCloseMenu(); RPD.tool = 'cursor'; RPD.sel = null; renderRpTools(); renderRpStylebar(); rpdRefresh();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && RPD.sel) { e.preventDefault(); rpdDelete(); return; }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); rpdUndo(); return; }
  if (e.altKey && !e.ctrlKey && !e.metaKey && /^Key[A-Z]$/.test(e.code)) {
    const t = RPD_TOOLS.find(x => x.key && 'Key' + x.key === e.code);
    if (t) { e.preventDefault(); rpdSetTool(t.id); }
  }
});
