// ── SAVE ─────────────────────────────────────────────────────────────

// ── SÉCURITÉ DES DONNÉES : échappement, tri chronologique, stockage ──────────────────
function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
// Une capture n'est affichée que si c'est une vraie image en base64 (jamais javascript:, data:text/html, URL externe…).
function safeImgSrc(src) { return (typeof src === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(src)) ? src : ''; }

// Ordre canonique : du plus récent au plus ancien, sur (date, heure de sortie), puis heure d'entrée, puis id.
// Tous les graphiques lisent [...trades].reverse() comme « ordre chronologique » : cet ordre doit donc être exact.
function tradeTimeKey(t) { return (t.date || '') + ' ' + (t.exit || t.entry || ''); }
function sortTradesChrono() {
  invalidateViews();
  trades.sort((a, b) => {
    const ka = tradeTimeKey(a), kb = tradeTimeKey(b);
    if (ka !== kb) return ka < kb ? 1 : -1;
    const ea = a.entry || '', eb = b.entry || '';
    if (ea !== eb) return ea < eb ? 1 : -1;
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
}

// Stockage : IndexedDB (place accordée par le navigateur, souvent plusieurs centaines de Mo) ; en repli localStorage ≈ 5 Mo.
// La place est PARTAGÉE par les trois journaux.
const STORAGE_LIMIT_CHARS = 5 * 1024 * 1024;
function storageUsage() {
  let total = 0, mine = 0;
  DB.keys().forEach(k => { const n = k.length + (DB.getItem(k) || '').length; total += n; if (k.indexOf(JP) === 0) mine += n; });
  let images = 0, imgCount = 0;
  trades.forEach(t => tradeImages(t).forEach(c => { images += c.length; imgCount++; }));
  const idb = DB.mode === 'indexeddb' && DB.quota;
  // En IndexedDB : quota réel du navigateur (au plus 2 Go affichés, le reste n'a pas de sens pour un journal).
  const limit = idb ? Math.min(DB.quota, 2 * 1024 * 1024 * 1024) : STORAGE_LIMIT_CHARS;
  const used = idb ? Math.max(DB.usage || 0, total) : total;
  return { total: used, mine, images, imgCount, limit, pct: used / limit * 100, mode: DB.mode };
}
function save() {
  invalidateViews();
  try { DB.setItem((JP + 'trades'), JSON.stringify(trades)); return true; }
  catch (e) { reportStorageError(e); return false; }
}
DB.onError(e => reportStorageError(e));
function reportStorageError(e) {
  console.error('Écriture impossible dans le stockage :', e);
  let el = document.getElementById('storage-error');
  if (!el) {
    el = document.createElement('div'); el.id = 'storage-error'; el.className = 'storage-error'; el.setAttribute('role', 'alert');
    document.body.appendChild(el);
  }
  mount(el, html`<span class="storage-error-msg"><b>⚠️ Stockage plein — ta dernière modification n'a PAS été enregistrée.</b> Libère de la place (compresse ou supprime des captures) ou exporte un backup, puis recommence.</span>
    <button class="btn-ghost" onclick="exportData()">Exporter un backup</button>
    <button class="btn-ghost" onclick="document.getElementById('storage-error').remove();showPage('export',document.querySelector('.nav-item[data-page=export]'))">Libérer de la place</button>
    <button class="btn-ghost" onclick="document.getElementById('storage-error').remove()">Fermer</button>`);
}
function renderStorageWarning() {
  const u = storageUsage();
  let el = document.getElementById('storage-warn');
  if (u.pct < 80) { if (el) el.remove(); return; }
  const host = document.getElementById('export-reminder');
  if (!host || !host.parentNode) return;
  if (!el) { el = document.createElement('div'); el.id = 'storage-warn'; host.parentNode.insertBefore(el, host); }
  const red = u.pct >= 92;
  el.className = 'storage-warn' + (red ? ' red' : '');
  el.onclick = () => showPage('export', document.querySelector('.nav-item[data-page=export]'));
  mount(el, html`${red ? '🛑 ' : '⚠️ '}<b>Stockage utilisé à ${fmtRate(u.pct, 0)}</b> (partagé par les 3 journaux). ${red ? 'Les prochains enregistrements peuvent échouer. ' : ''}<u>Libérer de la place →</u>`);
}

// Images : réduites (1400 px max) et recompressées en JPEG avant stockage : ~100–200 Ko au lieu de plusieurs Mo.
const IMG_MAX_DIM = 1400, IMG_QUALITY = 0.78;
function compressDataUrl(dataUrl, cb) {
  const img = new Image();
  img.onload = () => {
    try {
      const k = Math.min(1, IMG_MAX_DIM / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
      const out = c.toDataURL('image/jpeg', IMG_QUALITY);
      cb(out.length < dataUrl.length ? out : dataUrl);
    } catch (e) { cb(dataUrl); }
  };
  img.onerror = () => cb(dataUrl);
  img.src = dataUrl;
}
function compressDataUrlAsync(dataUrl) { return new Promise(res => compressDataUrl(dataUrl, res)); }
async function recompressStoredImages() {
  const targets = ImageStore.allIds().map(id => [id, ImageStore.get(id)]).filter(([, src]) => src && src.length > 150000);
  if (!targets.length) { showToast('Toutes tes captures sont déjà légères'); return; }
  let before = 0, after = 0;
  for (const [id, src] of targets) {
    const out = await compressDataUrlAsync(src);
    if (out && out.length < src.length) { try { ImageStore.replace(id, out); before += src.length; after += out.length; } catch (e) { reportStorageError(e); break; } }
  }
  renderAll(); renderTrashUI();
  showToast(targets.length + ' capture(s) compressée(s) — ' + Math.round((before - after) / 1024) + ' Ko libérés', 'success');
}

// Copie de sécurité avant toute opération qui remplace ou fusionne massivement les données (sans les captures, pour ne pas doubler l'espace).
// Si même cela ne tient pas, un backup complet est téléchargé automatiquement.
function createSafetySnapshot(label) {
  try {
    // Les captures restent dans le magasin d'images (non effacées par un import) : la copie ne garde que leurs références.
    const snap = { at: Date.now(), label, trades, planData, watchData, imagesDropped: 0 };
    DB.setItem((JP + 'safety_snapshot'), JSON.stringify(snap));
    return true;
  } catch (e) {
    try { exportData(); } catch (e2) {}
    return false;
  }
}
function loadSafetySnapshot() { try { return JSON.parse(DB.getItem((JP + 'safety_snapshot')) || 'null'); } catch (e) { return null; } }
function restoreSafetySnapshot() {
  const snap = loadSafetySnapshot();
  if (!snap || !Array.isArray(snap.trades)) return;
  openModal('Annuler la dernière importation ?', snap.trades.length + ' trades seront restaurés (état « ' + (snap.label || 'avant import') + ' »)' + (snap.imagesDropped ? ' — les ' + snap.imagesDropped + ' capture(s) d\'écran ne sont pas incluses dans cette copie.' : '.'), () => {
    if (!TradeStore.replaceAll(snap.trades)) return;
    if (snap.planData) { planData = snap.planData; DB.setItem((JP + 'plan'), JSON.stringify(planData)); }
    if (snap.watchData) { watchData = snap.watchData; DB.setItem((JP + 'watch'), JSON.stringify(watchData)); }
    DB.removeItem((JP + 'safety_snapshot'));
    renderAll(); initPlan(); renderWatchlist(); renderTrashUI(); refreshAssetDropdowns();
    showToast('Importation annulée — ' + trades.length + ' trades restaurés', 'success');
  });
}
function dismissSafetySnapshot() { DB.removeItem((JP + 'safety_snapshot')); renderTrashUI(); }
function renderStorageCard() {
  const el = document.getElementById('storage-card-body');
  if (!el) return;
  const u = storageUsage(), tone = u.pct >= 92 ? 'red' : (u.pct >= 80 ? 'amber' : 'green');
  const kb = n => Math.round(n / 1024).toLocaleString('fr-FR') + ' Ko';
  const limit = u.limit >= 1024 * 1024 * 1024 ? (u.limit / 1024 / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Go' : kb(u.limit);
  mount(el, html`<div class="stor-bar"><div class="fill-${raw(tone)}" style="${raw('width:' + Math.min(100, u.pct).toFixed(1) + '%')}"></div></div>
    <div class="stor-txt"><b class="tone-${raw(tone)}">${fmtRate(u.pct, 1)}</b> utilisé · ${kb(u.total)} sur ${limit} disponibles · ${u.mode === 'indexeddb' ? 'IndexedDB' : 'localStorage (mode de secours)'} · partagé par les 3 journaux<br>Ce journal : ${kb(u.mine)} · dont ${u.imgCount} capture(s) = ${kb(u.images)}</div>`);
}

// ── STATISTIQUES : définitions uniques pour tout le journal ──────────────────────────
// Win rate = gagnants ÷ trades clos (les break-even comptent au dénominateur). Intervalle de Wilson à 95 %.
// (wilsonCI et winStats : voir 00a-calc.js)
function fmtWinLine(w) { return w.wins + ' G · ' + w.losses + ' P' + (w.be ? ' · ' + w.be + ' BE' : ''); }
function fmtCI(w) { return w.n ? 'IC 95 % : ' + Math.round(w.lo * 100) + '–' + Math.round(w.hi * 100) + ' %' : ''; }
// P&L net par jour, en € (le R n'est utilisé que si aucun montant en € n'existe dans le journal)
function dayNet(list) {
  const useEur = list.some(t => t.pnlEur !== null && t.pnlEur !== undefined), by = {};
  list.forEach(t => {
    if (!t.date) return;
    const v = useEur ? t.pnlEur : t.pnl;
    if (v === null || v === undefined) return;
    by[t.date] = (by[t.date] || 0) + v;
  });
  return by;
}

// ── ORIGINE DU R ─────────────────────────────────────────────────────────────────────
// prix = distance de prix (exact) · manuel = saisi · risque = ancien R estimé (P&L € ÷ risque, conservé tel quel)
// Un trade sans prix ni R saisi n'a pas de R : son P&L en € reste compté partout.
const R_SRC_LABELS = { prix: 'R exact (distance de prix)', manuel: 'R saisi', risque: 'R estimé (P&L € ÷ risque)', aucun: 'pas de R' };
let R_MODE = DB.getItem((JP + 'r_mode')) === 'strict' ? 'strict' : 'usable';
// Ancien réglage « risque € par trade » (supprimé) : lu une dernière fois pour classer les très anciens imports.
const LEGACY_RISK_EUR = parseFloat(DB.getItem((JP + 'default_risk_eur')) || '0') || 0;
function computeRWithSource(pnlEur, res, priceCtx) {
  if (priceCtx) {
    const d = computeDistanceR(priceCtx.entryPrice, priceCtx.slPrice, priceCtx.exitPrice, priceCtx.dir);
    if (d !== null) return { r: d, src: 'prix' };
  }
  if (res === 'BE') return { r: 0, src: 'manuel' };
  return { r: null, src: undefined };
}
function rSource(t) {
  if (t.pnl === null || t.pnl === undefined) return 'aucun';
  if (t.rSrc && R_SRC_LABELS[t.rSrc]) return t.rSrc;
  if (t.res === 'BE') return 'manuel';
  if (t.entryPrice != null && t.slPrice != null && t.exitPrice != null && computeDistanceR(t.entryPrice, t.slPrice, t.exitPrice, t.dir) !== null) return 'prix';
  if (t.rSrc === 'defaut') return 'defaut';   // ancien R fictif (RR par défaut) : effacé au démarrage, jamais compté
  if (t.tvKey) return LEGACY_RISK_EUR > 0 ? 'risque' : 'defaut';   // très anciens imports sans origine enregistrée
  return 'manuel';
}
// mode « exact » : prix + saisi · « utilisable » (défaut) : + anciens R estimés par le risque
function rUsable(t) {
  const src = rSource(t);
  if (src === 'aucun' || src === 'defaut') return false;
  if (R_MODE === 'strict') return src === 'prix' || src === 'manuel';
  return true;
}
// Vue « analyse » : mêmes trades, mais le R non retenu est masqué (les montants en € ne changent JAMAIS).
function analysisTrades() {
  if (!_atCache) _atCache = viewTrades().map(t => (t.pnl === null || t.pnl === undefined || rUsable(t)) ? t : Object.assign({}, t, { pnl: null, rr: null }));
  return _atCache;
}
function setRMode(m) {
  R_MODE = m === 'strict' ? 'strict' : 'usable'; DB.setItem((JP + 'r_mode'), R_MODE); invalidateViews();
  renderAll();
}
function migrateRSources() {
  if (DB.getItem((JP + 'rsrc_v1'))) return;
  let changed = false;
  trades.forEach(t => { if (!t.rSrc && t.pnl != null) { t.rSrc = rSource(t); changed = true; } });
  if (changed) { try { DB.setItem((JP + 'trades'), JSON.stringify(trades)); } catch (e) { return; } }
  DB.setItem((JP + 'rsrc_v1'), '1');
}
// Nettoyage unique des R hérités des anciennes versions (remplace les boutons « Corriger » de la page Export) :
//  · R fictifs (RR fixe par défaut, sans base réelle) → effacés, le trade garde son P&L en € ;
//  · R par distance invraisemblable (> 15R : stop remonté au break-even avant l'export) → effacés avec ce stop ;
//  · trades clos sans R mais avec leurs prix → R exact recalculé.
function cleanupLegacyR() {
  if (DB.getItem((JP + 'r_cleanup_v1'))) return;
  const before = JSON.stringify(trades);
  let n = 0;
  trades.forEach(t => {
    if (t.pnl != null && rSource(t) === 'defaut') { t.pnl = null; t.rr = null; delete t.rSrc; n++; return; }
    if (t.pnl != null && Math.abs(t.pnl) > 15 && t.entryPrice != null && t.slPrice != null) { t.pnl = null; t.rr = null; t.slPrice = null; delete t.rSrc; n++; return; }
    if ((t.pnl === null || t.pnl === undefined) && ['TP', 'SL', 'BE'].includes(t.res)) {
      const cr = computeRWithSource(t.pnlEur, t.res, { entryPrice: t.entryPrice, slPrice: t.slPrice, exitPrice: t.exitPrice, dir: t.dir });
      if (cr.r !== null) { t.pnl = cr.r; t.rSrc = cr.src; if (t.rr === null || t.rr === undefined) t.rr = Math.abs(cr.r) || null; n++; }
    }
  });
  if (n) { try { DB.setItem((JP + 'trades'), JSON.stringify(trades)); } catch (e) { trades = JSON.parse(before); return; } }
  ['default_rr_win', 'default_rr_loss', 'default_risk_eur'].forEach(k => DB.removeItem(JP + k));
  DB.setItem((JP + 'r_cleanup_v1'), '1');
}
function renderRCoverage() {
  const el = document.getElementById('r-coverage');
  if (!el) return;
  const closed = trades.filter(t => ['TP', 'SL', 'BE'].includes(t.res));
  const c = { prix: 0, manuel: 0, risque: 0, defaut: 0, aucun: 0 };
  closed.forEach(t => { c[rSource(t)]++; });
  const used = closed.filter(rUsable).length;
  // Visible s'il manque des R, ou pour choisir d'exclure les anciens R estimés.
  if (!closed.length || (c.aucun + c.defaut === 0 && (R_MODE === 'usable' || c.risque === 0))) { mount(el, ''); return; }
  const parts = [];
  if (c.prix) parts.push(c.prix + ' exact' + (c.prix > 1 ? 's' : ''));
  if (c.manuel) parts.push(c.manuel + ' saisi' + (c.manuel > 1 ? 's' : ''));
  if (c.risque) parts.push(c.risque + ' estimé' + (c.risque > 1 ? 's' : ''));
  if (c.aucun + c.defaut) parts.push((c.aucun + c.defaut) + ' sans R');
  const modes = [['strict', 'R exact seulement'], ['usable', 'R exact + estimé']];
  mount(el, html`<div class="rcov">
    <span><b>R pris en compte : ${used} / ${closed.length} trades</b> <span class="tone-muted">(${parts.join(' · ')})</span></span>
    ${c.risque ? html`<select id="r-mode-select" class="rcov-select" onchange="setRMode(this.value)">${modes.map(o => html`<option value="${o[0]}"${raw(R_MODE === o[0] ? ' selected' : '')}>${o[1]}</option>`)}</select>` : ''}
    <span class="rcov-note">Les montants en € sont toujours exacts et comptés partout. Un trade n'a de R que si ses prix (entrée, stop, sortie) ou son R sont renseignés.</span></div>`);
}
migrateRSources();
cleanupLegacyR();

// ── CHECKLIST : historique indépendant des modifications du plan ─────────────────────
// Chaque trade garde le TEXTE des critères cochés (checklistLabels) et le nombre de critères que comptait la checklist
// au moment de la saisie (checklistTotal). Supprimer, réordonner ou ajouter un critère dans le Plan ne réécrit donc plus l'historique.
function tradeHasChecklist(t) { return Array.isArray(t.checklistLabels) || Array.isArray(t.checklist); }
function tradeChecklistLabels(t) {
  if (Array.isArray(t.checklistLabels)) return t.checklistLabels;
  const items = getEntryItems();
  return Array.isArray(t.checklist) ? t.checklist.map(i => items[i]).filter(v => v !== undefined) : [];
}
function tradeChecklistComplete(t) {
  const total = (typeof t.checklistTotal === 'number' && t.checklistTotal > 0) ? t.checklistTotal : getEntryItems().length;
  return total > 0 && tradeChecklistLabels(t).length >= total;
}
function migrateChecklistLabels() {
  if (DB.getItem((JP + 'checklist_v2'))) return;
  const items = getEntryItems();
  let changed = false;
  trades.forEach(t => {
    if (Array.isArray(t.checklist) && !Array.isArray(t.checklistLabels)) {
      t.checklistLabels = t.checklist.map(i => items[i]).filter(v => v !== undefined);
      t.checklistTotal = items.length;
      changed = true;
    }
  });
  if (changed) { try { DB.setItem((JP + 'trades'), JSON.stringify(trades)); } catch (e) { return; } }
  DB.setItem((JP + 'checklist_v2'), '1');
}
// Renommer un critère ou une erreur dans le Plan renomme aussi ce libellé dans les trades déjà saisis (sinon les stats se coupent en deux).
function renameLabelInTrades(field, oldV, newV) {
  if (oldV === undefined || oldV === null || oldV === newV || String(newV).trim() === '') return;
  const touched = TradeStore.mutate(list => list.filter(t => Array.isArray(t[field]) && t[field].includes(oldV)).map(t => { t[field] = [...new Set(t[field].map(v => v === oldV ? newV : v))]; return t; }));
  if (!touched || !touched.length) return;
  renderAll();
  showToast('« ' + oldV + ' » renommé dans ' + touched.length + ' trade(s) ✓', 'success');
}

