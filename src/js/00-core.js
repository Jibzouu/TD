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
// (localDateStr, parseNumCSV, computeDistanceR… : voir 00a-calc.js, le module de calculs purs testé unitairement)
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
      note.textContent = 'Graphique indisponible hors ligne (Chart.js non chargé) — tes données sont intactes.';
      canvas.parentNode.appendChild(note);
    }
    canvas.style.display = ok ? '' : 'none';
    if (ok && note) note.remove();
  }
  return ok;
}
// Normalise un trade venant du stockage ou d'un fichier importé : types attendus, valeurs inconnues neutralisées.
// Empêche qu'un backup ou un CSV piégé injecte du HTML/JS via un champ affiché (heure, taille, prix, résultat…).
const TRADE_NUM_FIELDS = ['rr', 'pnl', 'pnlEur', 'size', 'ddUsed', 'emotion', 'entryPrice', 'slPrice', 'tpPrice', 'exitPrice', 'mfe', 'mae', 'fxRate', 'checklistTotal'];
const TRADE_STR_FIELDS = ['asset', 'tf', 'dir', 'session', 'desc', 'tvKey', 'rSrc', 'ccy', 'setup', 'review'];
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
  if ('tags' in o) o.tags = Array.isArray(o.tags) ? o.tags.map(v => String(v).slice(0, 30)).filter(Boolean).slice(0, 12) : [];
  o.cap = safeImgSrc(o.cap);
  if ('caps' in o) o.caps = Array.isArray(o.caps) ? o.caps.map(safeImgSrc).filter(Boolean).slice(0, 8) : [];
  if (o.caps && o.caps.length && !o.cap) o.cap = o.caps[0];
  // Modèle prêt pour la synchronisation : identifiant universel, dates de création / modification, captures par référence.
  o.uid = /^[\w-]{6,64}$/.test(String(o.uid || '')) ? String(o.uid) : '';
  ['createdAt', 'updatedAt'].forEach(k => { const v = Number(o[k]); o[k] = isFinite(v) && v > 0 ? v : 0; });
  o.imgs = Array.isArray(o.imgs) ? o.imgs.map(String).filter(id => /^i[0-9a-z]{6,40}$/i.test(id)).slice(0, 8) : [];
  return o;
}
function sanitizeTrades(arr) { return (Array.isArray(arr) ? arr : []).map(sanitizeTrade).filter(Boolean); }

// ── DATA ────────────────────────────────────────────────────────────
let _atCache = null;   // cache de la vue « analyse » (déclaré ici : sortTradesChrono() est appelée dès le chargement)
let _viewCache = null; // cache de la vue filtrée (filtre global) — voir 03b-state.js
let trades = sanitizeTrades(loadJSON(JP + 'trades', []));
sortTradesChrono();
let watchData = loadJSON(JP + 'watch', null);
let planData = loadJSON(JP + 'plan', null);
let accountSize = parseFloat(DB.getItem((JP + 'account')) || '10000');

// Décalage (en heures) entre l'heure de tes exports et ton propre fuseau — sinon les sessions (Asie/Londres/NY) sont calculées sur la mauvaise heure.
let TZ_OFFSET_HOURS = parseFloat(DB.getItem((JP + 'tz_offset_hours')) || '0');
function saveTZOffset() {
  const v = parseFloat(document.getElementById('tz-offset-hours').value);
  TZ_OFFSET_HOURS = isNaN(v) ? 0 : v;
  DB.setItem((JP + 'tz_offset_hours'), TZ_OFFSET_HOURS);
}
// Recalcule la session de tous les trades importés (dont l'heure d'entrée est connue) avec le décalage courant.
function recalcSessions() {
  const touched = TradeStore.mutate(list => list.filter(t => {
    if (!t.entry) return false;
    const h = parseInt(t.entry.split(':')[0], 10);
    if (isNaN(h)) return false;
    const ns = sessionFromHour(h);
    if (ns && ns !== t.session) { t.session = ns; return true; }
    return false;
  }));
  if (touched === null) return;
  if (touched.length) { renderAll(); showToast(touched.length + ' session(s) recalculée(s) ✓', 'success'); }
  else showToast('Aucune session à recalculer — déjà à jour');
}

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
// Réglages d'import repliés par défaut, mais ouverts dès qu'un réglage n'est pas neutre (pour qu'il reste visible).
function openImportSettingsIfUsed() {
  const d = document.getElementById('import-settings');
  if (d && (TZ_OFFSET_HOURS !== 0 || IMPORT_FX_RATE !== 1)) d.open = true;
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
    const ids = new Set(known.concat(legacy).map(t => t.id));
    const done = TradeStore.mutate(list => list.filter(t => ids.has(t.id)).map(t => {
      const old = t.fxRate || 1;
      const conv = v => (v === null || v === undefined) ? v : Math.round(v / old * rate * 100) / 100;
      t.pnlEur = conv(t.pnlEur); t.mfe = conv(t.mfe); t.mae = conv(t.mae);
      if (!t.ccy) t.ccy = 'USD';
      t.fxRate = rate;
      // R estimé à partir du P&L € (ancien réglage « risque € ») : il suit la conversion dans la même proportion.
      if (rSource(t) === 'risque' && t.pnl != null) { t.pnl = Math.round(t.pnl / old * rate * 100) / 100; t.rr = t.pnl; }
      return t;
    }));
    if (!done) return;
    renderAll();
    showToast((known.length + legacy.length) + ' trade(s) convertis ✓', 'success');
  });
}
function computeRealR(pnlEur, res, priceCtx) { return computeRWithSource(pnlEur, res, priceCtx).r; }

