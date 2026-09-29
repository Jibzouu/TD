// ── JOURNAUX : Live · Backtest · PropFirm (un seul fichier, trois jeux de données isolés) ─────────
const JOURNALS = {
  tj: { tab: 'Live',     title: 'Journal de Trading',  sub: 'Trades réels · Forex · Indices',   slug: 'live' },
  bt: { tab: 'Backtest', title: 'Journal de Backtest', sub: 'Stratégies · Historique testé',     slug: 'backtest' },
  pf: { tab: 'PropFirm', title: 'Journal PropFirm',    sub: 'Challenges · Comptes financés',     slug: 'propfirm' }
};
const JOURNAL_ID = (() => { try { const v = DB.getItem('journal_active'); return JOURNALS[v] ? v : 'tj'; } catch (e) { return 'tj'; } })();
const JP = JOURNAL_ID + '_';   // préfixe de stockage : tj_ (live) · bt_ (backtest) · pf_ (propfirm)
document.title = JOURNALS[JOURNAL_ID].title;

// ── APPARENCE COMMUNE aux trois journaux (thème, thèmes enregistrés, grain, auto clair/sombre, intensités) ──
const GP = 'g_';
const SHARED_SETTINGS = ['theme', 'custom_themes', 'theme_texture', 'theme_autosystem', 'chart_intensity', 'cal_heat_intensity'];
// Migration (une seule fois) : avant, chaque journal avait son propre thème. On reprend celui du journal Live
// (à défaut Backtest, puis PropFirm) et on fusionne les thèmes personnalisés enregistrés dans les journaux.
(function migrateSharedAppearance() {
  try {
    if (DB.getItem('g_appearance_migrated')) return;
    const order = ['tj', 'bt', 'pf'];
    const nonEmpty = v => { if (v === null) return false; try { const o = JSON.parse(v); return o !== null && (typeof o !== 'object' || Object.keys(o).length > 0); } catch (e) { return v !== ''; } };
    SHARED_SETTINGS.forEach(k => {
      if (DB.getItem(GP + k) !== null) return;
      if (k === 'custom_themes') {
        const seen = new Set(), merged = [];
        order.forEach(j => { try { (JSON.parse(DB.getItem(j + '_' + k) || '[]') || []).forEach(t => { if (t && !seen.has(t.id)) { seen.add(t.id); merged.push(t); } }); } catch (e) {} });
        if (merged.length) DB.setItem(GP + k, JSON.stringify(merged));
        return;
      }
      for (const j of order) { const v = DB.getItem(j + '_' + k); if (nonEmpty(v)) { DB.setItem(GP + k, v); break; } }
    });
    DB.setItem('g_appearance_migrated', '1');
  } catch (e) {}
})();

// ── OUTILS DE ROBUSTESSE ─────────────────────────────────────────────
// Date du jour au format AAAA-MM-JJ dans le fuseau LOCAL (toISOString() donne la date UTC : entre 0 h et 2 h en France, c'était la veille).
function localDateStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// Lecture JSON protégée : une donnée corrompue ne doit jamais empêcher le journal de démarrer.
// La valeur illisible est mise de côté (clé *_corrupt_backup) au lieu d'être écrasée à la prochaine sauvegarde.
function loadJSON(key, fallback) {
  const raw = DB.getItem(key);
  if (raw === null || raw === '') return fallback;
  try { const v = JSON.parse(raw); return v === null || v === undefined ? fallback : v; }
  catch (e) {
    console.error('Donnée illisible dans « ' + key + ' » :', e);
    try { DB.setItem(key + '_corrupt_backup', raw); } catch (e2) {}
    window._corruptKeys = (window._corruptKeys || []).concat(key);
    return fallback;
  }
}
// Exécute une étape de rendu sans que son éventuelle erreur bloque les suivantes.
function safeRun(fn, label) {
  try { return fn(); } catch (e) { console.error('Erreur dans ' + (label || fn.name || 'rendu') + ' :', e); }
}
// Chart.js absent (hors ligne, CDN bloqué) : message à la place du graphique au lieu de faire planter toute l'application.
function chartsAvailable(canvasId) {
  const canvas = document.getElementById(canvasId);
  const ok = typeof Chart !== 'undefined';
  if (canvas) {
    let note = canvas.parentNode && canvas.parentNode.querySelector(':scope > .chart-offline-note');
    if (!ok && !note && canvas.parentNode) {
      note = document.createElement('div');
      note.className = 'chart-offline-note';
      note.style.cssText = 'height:100%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:11px;font-family:var(--mono);color:var(--txt3);padding:8px';
      note.textContent = 'Graphique indisponible hors ligne (Chart.js non chargé) — tes données sont intactes.';
      canvas.parentNode.appendChild(note);
    }
    canvas.style.display = ok ? '' : 'none';
    if (ok && note) note.remove();
  }
  return ok;
}
// Nombre lu dans un CSV : accepte la virgule décimale (12,5), les séparateurs de milliers (1 234,56 · 1,234.56 · 1.234,56),
// les symboles monétaires, le signe moins typographique et les parenthèses comptables. Renvoie NaN si ce n'est pas un nombre.
function parseNumCSV(raw) {
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).trim().replace(/[\s  ']/g, '').replace(/−/g, '-').replace(/[€$£%]/g, '').replace(/^(USD|EUR|GBP|CHF)|(USD|EUR|GBP|CHF)$/i, '');
  if (s === '') return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  const v = Number(s);
  return neg ? -v : v;
}
// Normalise un trade venant du stockage ou d'un fichier importé : types attendus, valeurs inconnues neutralisées.
// Empêche qu'un backup ou un CSV piégé injecte du HTML/JS via un champ affiché (heure, taille, prix, résultat…).
const TRADE_NUM_FIELDS = ['rr', 'pnl', 'pnlEur', 'size', 'ddUsed', 'emotion', 'entryPrice', 'slPrice', 'tpPrice', 'exitPrice', 'mfe', 'mae', 'fxRate', 'checklistTotal'];
const TRADE_STR_FIELDS = ['asset', 'tf', 'dir', 'session', 'desc', 'tvKey', 'rSrc', 'ccy'];
function sanitizeTrade(t) {
  if (!t || typeof t !== 'object') return null;
  const o = Object.assign({}, t);
  const idNum = Number(o.id);
  o.id = isFinite(idNum) && idNum > 0 ? idNum : Date.now() + Math.floor(Math.random() * 1e6);
  TRADE_NUM_FIELDS.forEach(k => {
    if (!(k in o)) return;
    const v = o[k] === '' || o[k] === null || o[k] === undefined ? null : Number(o[k]);
    o[k] = v === null || !isFinite(v) ? null : v;
  });
  if (!('pnl' in o)) o.pnl = null;
  if (!('pnlEur' in o)) o.pnlEur = null;
  if (o.emotion !== null && o.emotion !== undefined) o.emotion = Math.min(5, Math.max(1, Math.round(o.emotion)));
  TRADE_STR_FIELDS.forEach(k => { if (k in o && o[k] !== null && o[k] !== undefined) o[k] = String(o[k]); });
  // Date : on garde toute date « inoffensive » (chiffres, lettres, / . - : , espaces) même si elle n'est pas au format ISO, pour ne rien perdre.
  o.date = /^[\w\s\/.:,\-]{0,40}$/.test(String(o.date || '')) ? String(o.date || '') : '';
  ['entry', 'exit'].forEach(k => { o[k] = /^\d{1,2}:\d{2}(:\d{2})?$/.test(String(o[k] || '')) ? String(o[k]) : ''; });
  o.res = ['TP', 'SL', 'BE', 'OPEN'].includes(o.res) ? o.res : 'OPEN';
  if (o.dir && !['Long', 'Short'].includes(o.dir)) o.dir = '';
  if ('checklist' in o) o.checklist = Array.isArray(o.checklist) ? o.checklist.map(Number).filter(n => Number.isInteger(n) && n >= 0) : [];
  if ('checklistLabels' in o) o.checklistLabels = Array.isArray(o.checklistLabels) ? o.checklistLabels.map(String) : [];
  if ('mistakes' in o) o.mistakes = Array.isArray(o.mistakes) ? o.mistakes.map(String) : [];
  o.cap = safeImgSrc(o.cap);
  return o;
}
function sanitizeTrades(arr) { return (Array.isArray(arr) ? arr : []).map(sanitizeTrade).filter(Boolean); }

// ── DATA ────────────────────────────────────────────────────────────
let _atCache = null;   // cache de la vue « analyse » (déclaré ici : sortTradesChrono() est appelée dès le chargement)
let trades = sanitizeTrades(loadJSON(JP + 'trades', []));
sortTradesChrono();
let watchData = loadJSON(JP + 'watch', null);
let planData = loadJSON(JP + 'plan', null);
let accountSize = parseFloat(DB.getItem((JP + 'account')) || '10000');
let currentImgBase64 = '';

// Default R multiples applied to imported trades when the source file only
// gives a €/$ P&L and no real R value (e.g. TradingView's "List of trades" export).
// Adjustable from the Export / Import page.
let DEFAULT_RR_WIN = parseFloat(DB.getItem((JP + 'default_rr_win')) || '2');
// Décalage (en heures) entre l'heure de tes exports et ton propre fuseau — sinon les sessions (Asie/Londres/NY) sont calculées sur la mauvaise heure.
let TZ_OFFSET_HOURS = parseFloat(DB.getItem((JP + 'tz_offset_hours')) || '0');
function saveTZOffset() {
  const v = parseFloat(document.getElementById('tz-offset-hours').value);
  TZ_OFFSET_HOURS = isNaN(v) ? 0 : v;
  DB.setItem((JP + 'tz_offset_hours'), TZ_OFFSET_HOURS);
}
// Recalcule la session de tous les trades importés (dont l'heure d'entrée est connue) avec le décalage courant.
function recalcSessions() {
  let n = 0;
  const before = trades.map(t => t.session);
  trades.forEach(t => {
    if (!t.entry) return;
    const h = parseInt(t.entry.split(':')[0], 10);
    if (isNaN(h)) return;
    const ns = sessionFromHour(h);
    if (ns && ns !== t.session) { t.session = ns; n++; }
  });
  if (n > 0) {
    if (!save()) { trades.forEach((t, i) => { t.session = before[i]; }); return; }
    renderAll(); showToast(n + ' session(s) recalculée(s) ✓', 'success');
  }
  else showToast('Aucune session à recalculer — déjà à jour');
}

let DEFAULT_RR_LOSS = -Math.abs(parseFloat(DB.getItem((JP + 'default_rr_loss')) || '1'));
function saveDefaultRR() {
  const w = parseFloat(document.getElementById('default-rr-win').value);
  const l = parseFloat(document.getElementById('default-rr-loss').value);
  if (!isNaN(w) && w > 0) { DEFAULT_RR_WIN = w; DB.setItem((JP + 'default_rr_win'), w); }
  if (!isNaN(l) && l > 0) { DEFAULT_RR_LOSS = -Math.abs(l); DB.setItem((JP + 'default_rr_loss'), l); }
}

// Real risk per trade in €. When set, imported R multiples are computed as
// (real €P&L ÷ risk€) instead of a flat default — a much truer picture than
// assuming every winner is worth exactly the same R.
let DEFAULT_RISK_EUR = parseFloat(DB.getItem((JP + 'default_risk_eur')) || '0');
// Taux appliqué aux montants importés dans une autre devise que l'euro (1 unité étrangère = IMPORT_FX_RATE €).
let IMPORT_FX_RATE = parseFloat(DB.getItem((JP + 'import_fx_rate')) || '1') || 1;
function saveImportFxRate() {
  const v = parseFloat(document.getElementById('import-fx-rate').value);
  IMPORT_FX_RATE = (!isNaN(v) && v > 0) ? v : 1;
  DB.setItem((JP + 'import_fx_rate'), IMPORT_FX_RATE);
}
// Devise lue dans un nom de colonne (« P&L net USD », « Profit (EUR) »…). '' si aucune devise n'est indiquée.
function detectCcyFromHeader(h) {
  const n = String(h || '').toUpperCase();
  const m = n.match(/(?:^|[^A-Z])(USD|EUR|GBP|CHF|JPY|CAD|AUD)(?:[^A-Z]|$)/) || n.match(/(USD|EUR|GBP|CHF|JPY|CAD|AUD)$/);
  if (m) return m[1];
  if (/\$/.test(n)) return 'USD';
  if (/€/.test(n)) return 'EUR';
  return '';
}
function fxForCcy(ccy) { return ccy && ccy !== 'EUR' ? IMPORT_FX_RATE : 1; }
// Ré-applique le taux courant aux trades importés en devise étrangère (et, après confirmation, aux anciens imports TradingView sans devise connue).
function reconvertImportedTrades() {
  const rate = IMPORT_FX_RATE;
  const known = trades.filter(t => t.ccy && t.ccy !== 'EUR' && t.pnlEur != null);
  const legacy = trades.filter(t => !t.ccy && t.tvKey && t.pnlEur != null);
  if (!known.length && !legacy.length) { showToast('Aucun trade importé en devise étrangère'); return; }
  const msg = known.length + ' trade(s) importé(s) en devise étrangère' + (legacy.length ? ' et ' + legacy.length + ' ancien(s) import(s) TradingView (devise non enregistrée, supposée USD)' : '') + ' seront recalculés avec 1 = ' + rate + ' €.';
  openModal('Appliquer le taux de conversion ?', msg, () => {
    const before = JSON.stringify(trades);
    known.concat(legacy).forEach(t => {
      const old = t.fxRate || 1;
      const conv = v => (v === null || v === undefined) ? v : Math.round(v / old * rate * 100) / 100;
      t.pnlEur = conv(t.pnlEur); t.mfe = conv(t.mfe); t.mae = conv(t.mae);
      if (!t.ccy) t.ccy = 'USD';
      t.fxRate = rate;
      if (rSource(t) === 'risque' && DEFAULT_RISK_EUR > 0) { t.pnl = Math.round(t.pnlEur / DEFAULT_RISK_EUR * 100) / 100; t.rr = t.pnl; }
    });
    if (!save()) { trades = JSON.parse(before); return; }
    renderAll();
    showToast((known.length + legacy.length) + ' trade(s) convertis ✓', 'success');
  });
}
function saveDefaultRiskEur() {
  const v = parseFloat(document.getElementById('default-risk-eur').value);
  DEFAULT_RISK_EUR = (!isNaN(v) && v > 0) ? v : 0;
  DB.setItem((JP + 'default_risk_eur'), DEFAULT_RISK_EUR);
}
// Central place all import paths use to get an R multiple for a trade.
function computeDistanceR(entryPrice, slPrice, exitPrice, dir) {
  if (entryPrice === null || entryPrice === undefined || isNaN(entryPrice)) return null;
  if (slPrice === null || slPrice === undefined || isNaN(slPrice)) return null;
  if (exitPrice === null || exitPrice === undefined || isNaN(exitPrice)) return null;
  const riskDist = Math.abs(entryPrice - slPrice);
  if (riskDist <= 0) return null;
  const traveled = dir === 'Short' ? (entryPrice - exitPrice) : (exitPrice - entryPrice);
  return Math.round((traveled / riskDist) * 100) / 100;
}
function computeRealR(pnlEur, res, priceCtx) { return computeRWithSource(pnlEur, res, priceCtx).r; }

