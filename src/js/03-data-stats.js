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
  _atCache = null;
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
function tradeImages(t) { return [t.cap].concat(Array.isArray(t.caps) ? t.caps : []).filter(Boolean); }
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
  _atCache = null;
  try { DB.setItem((JP + 'trades'), JSON.stringify(trades)); return true; }
  catch (e) { reportStorageError(e); return false; }
}
DB.onError(e => reportStorageError(e));
function reportStorageError(e) {
  console.error('Écriture impossible dans le stockage :', e);
  let el = document.getElementById('storage-error');
  if (!el) {
    el = document.createElement('div'); el.id = 'storage-error'; el.setAttribute('role', 'alert');
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#7f1d1d;color:#fff;padding:12px 18px;font-size:13px;line-height:1.5;display:flex;gap:12px;align-items:center;flex-wrap:wrap;box-shadow:0 4px 18px rgba(0,0,0,.5)';
    document.body.appendChild(el);
  }
  el.innerHTML = '<span style="flex:1;min-width:240px"><b>⚠️ Stockage plein — ta dernière modification n\'a PAS été enregistrée.</b> Libère de la place (compresse ou supprime des captures) ou exporte un backup, puis recommence.</span>' +
    '<button class="btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.5)" onclick="exportData()">Exporter un backup</button>' +
    '<button class="btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.5)" onclick="document.getElementById(\'storage-error\').remove();showPage(\'export\',document.querySelector(\'.nav-item[data-page=export]\'))">Libérer de la place</button>' +
    '<button class="btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.5)" onclick="document.getElementById(\'storage-error\').remove()">Fermer</button>';
}
function renderStorageWarning() {
  const u = storageUsage();
  let el = document.getElementById('storage-warn');
  if (u.pct < 80) { if (el) el.remove(); return; }
  const host = document.getElementById('export-reminder');
  if (!host || !host.parentNode) return;
  if (!el) { el = document.createElement('div'); el.id = 'storage-warn'; host.parentNode.insertBefore(el, host); }
  const red = u.pct >= 92;
  el.style.cssText = 'margin-bottom:14px;padding:11px 16px;border-radius:var(--r);font-size:12.5px;line-height:1.5;cursor:pointer;border:1px solid ' + (red ? 'var(--red)' : 'var(--amber)') + ';background:' + (red ? 'var(--red-d)' : 'var(--amber-d)') + ';color:var(--txt)';
  el.onclick = () => showPage('export', document.querySelector('.nav-item[data-page=export]'));
  el.innerHTML = (red ? '🛑 ' : '⚠️ ') + '<b>Stockage utilisé à ' + u.pct.toFixed(0) + ' %</b> (partagé par les 3 journaux). ' + (red ? 'Les prochains enregistrements peuvent échouer. ' : '') + '<u>Libérer de la place →</u>';
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
  const targets = trades.filter(t => t.cap && safeImgSrc(t.cap) && t.cap.length > 150000);
  if (!targets.length) { showToast('Toutes tes captures sont déjà légères'); return; }
  const before = targets.reduce((n, t) => n + t.cap.length, 0), originals = new Map(targets.map(t => [t.id, t.cap]));
  for (const t of targets) t.cap = await compressDataUrlAsync(t.cap);
  const after = targets.reduce((n, t) => n + t.cap.length, 0);
  if (!save()) { targets.forEach(t => { t.cap = originals.get(t.id); }); return; }
  renderAll(); renderTrashUI();
  showToast(targets.length + ' capture(s) compressée(s) — ' + Math.round((before - after) / 1024) + ' Ko libérés', 'success');
}

// Copie de sécurité avant toute opération qui remplace ou fusionne massivement les données (sans les captures, pour ne pas doubler l'espace).
// Si même cela ne tient pas, un backup complet est téléchargé automatiquement.
function createSafetySnapshot(label) {
  try {
    const snap = { at: Date.now(), label, trades: trades.map(t => t.cap ? Object.assign({}, t, { cap: '' }) : t), planData, watchData, imagesDropped: trades.filter(t => t.cap).length };
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
    const prev = trades.slice();
    trades = sanitizeTrades(snap.trades); sortTradesChrono();
    if (!save()) { trades = prev; return; }
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
  const u = storageUsage(), col = u.pct >= 92 ? 'var(--red)' : (u.pct >= 80 ? 'var(--amber)' : 'var(--green)');
  const kb = n => Math.round(n / 1024).toLocaleString('fr-FR') + ' Ko';
  el.innerHTML = '<div style="height:10px;background:var(--bg4);border-radius:99px;overflow:hidden;margin:10px 0 8px"><div style="height:100%;width:' + Math.min(100, u.pct).toFixed(1) + '%;background:' + col + '"></div></div>' +
    '<div style="font-size:12px;font-family:var(--mono);color:var(--txt2);line-height:1.7"><b style="color:' + col + '">' + u.pct.toFixed(1) + ' %</b> utilisé · ' + kb(u.total) + ' sur ' + (u.limit >= 1024 * 1024 * 1024 ? (u.limit / 1024 / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Go' : kb(u.limit)) + ' disponibles · ' + (u.mode === 'indexeddb' ? 'IndexedDB' : 'localStorage (mode de secours)') + ' · partagé par les 3 journaux<br>Ce journal : ' + kb(u.mine) + ' · dont ' + u.imgCount + ' capture(s) = ' + kb(u.images) + '</div>';
}

// ── STATISTIQUES : définitions uniques pour tout le journal ──────────────────────────
// Win rate = gagnants ÷ trades clos (les break-even comptent au dénominateur). Intervalle de Wilson à 95 %.
function wilsonCI(k, n, z) {
  z = z || 1.96; if (!n) return [0, 0];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - m), Math.min(1, c + m)];
}
function winStats(list) {
  const closed = list.filter(t => ['TP', 'SL', 'BE'].includes(t.res));
  const wins = closed.filter(t => t.res === 'TP').length, losses = closed.filter(t => t.res === 'SL').length;
  const n = closed.length, ci = n ? wilsonCI(wins, n) : [0, 0];
  return { n, wins, losses, be: n - wins - losses, rate: n ? wins / n : null, lo: ci[0], hi: ci[1] };
}
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
// prix = distance de prix (exact) · manuel = saisi · risque = P&L € ÷ risque configuré (estimé) · defaut = RR fixe sans base réelle (FICTIF)
const R_SRC_LABELS = { prix: 'R exact (distance de prix)', manuel: 'R saisi', risque: 'R estimé (P&L € ÷ risque configuré)', defaut: 'R fictif (RR par défaut, aucune base réelle)', aucun: 'pas de R' };
let R_MODE = DB.getItem((JP + 'r_mode')) || 'usable';
function computeRWithSource(pnlEur, res, priceCtx) {
  if (priceCtx) {
    const d = computeDistanceR(priceCtx.entryPrice, priceCtx.slPrice, priceCtx.exitPrice, priceCtx.dir);
    if (d !== null) return { r: d, src: 'prix' };
  }
  if (res === 'BE') return { r: 0, src: 'manuel' };
  if (DEFAULT_RISK_EUR > 0 && pnlEur !== null && pnlEur !== undefined && !isNaN(pnlEur)) return { r: Math.round((pnlEur / DEFAULT_RISK_EUR) * 100) / 100, src: 'risque' };
  return { r: res === 'TP' ? DEFAULT_RR_WIN : (res === 'SL' ? DEFAULT_RR_LOSS : 0), src: 'defaut' };
}
function rSource(t) {
  if (t.pnl === null || t.pnl === undefined) return 'aucun';
  if (t.rSrc && R_SRC_LABELS[t.rSrc]) return t.rSrc;
  if (t.res === 'BE') return 'manuel';
  if (t.entryPrice != null && t.slPrice != null && t.exitPrice != null && computeDistanceR(t.entryPrice, t.slPrice, t.exitPrice, t.dir) !== null) return 'prix';
  if (t.tvKey) return DEFAULT_RISK_EUR > 0 ? 'risque' : 'defaut';
  return 'manuel';
}
// mode « exact » : prix + saisi · « utilisable » (défaut) : + estimé par le risque · « tout » : + R fictifs
function rUsable(t) {
  const src = rSource(t);
  if (src === 'aucun') return false;
  if (R_MODE === 'strict') return src === 'prix' || src === 'manuel';
  if (R_MODE === 'usable') return src !== 'defaut';
  return true;
}
// Vue « analyse » : mêmes trades, mais le R non retenu est masqué (les montants en € ne changent JAMAIS).
function analysisTrades() {
  if (!_atCache) _atCache = trades.map(t => (t.pnl === null || t.pnl === undefined || rUsable(t)) ? t : Object.assign({}, t, { pnl: null, rr: null }));
  return _atCache;
}
function setRMode(m) {
  R_MODE = m; DB.setItem((JP + 'r_mode'), m); _atCache = null;
  renderAll();
}
function migrateRSources() {
  if (DB.getItem((JP + 'rsrc_v1'))) return;
  let changed = false;
  trades.forEach(t => { if (!t.rSrc && t.pnl != null) { t.rSrc = rSource(t); changed = true; } });
  if (changed) { try { DB.setItem((JP + 'trades'), JSON.stringify(trades)); } catch (e) { return; } }
  DB.setItem((JP + 'rsrc_v1'), '1');
}
function renderRCoverage() {
  const el = document.getElementById('r-coverage');
  if (!el) return;
  const closed = trades.filter(t => ['TP', 'SL', 'BE'].includes(t.res));
  const c = { prix: 0, manuel: 0, risque: 0, defaut: 0, aucun: 0 };
  closed.forEach(t => { c[rSource(t)]++; });
  const used = closed.filter(rUsable).length;
  if (!closed.length || (R_MODE === 'usable' && c.defaut === 0 && c.aucun === 0)) { el.innerHTML = ''; return; }
  const parts = [];
  if (c.prix) parts.push(c.prix + ' exact' + (c.prix > 1 ? 's' : ''));
  if (c.manuel) parts.push(c.manuel + ' saisi' + (c.manuel > 1 ? 's' : ''));
  if (c.risque) parts.push(c.risque + ' estimé' + (c.risque > 1 ? 's' : ''));
  if (c.defaut) parts.push(c.defaut + ' par défaut (fictif' + (c.defaut > 1 ? 's' : '') + ')');
  if (c.aucun) parts.push(c.aucun + ' sans R');
  const losses = closed.filter(t => t.res === 'SL' && t.pnlEur < 0);
  const est = losses.length >= 3 ? Math.round(Math.abs(losses.reduce((n, t) => n + t.pnlEur, 0) / losses.length)) : 0;
  const sel = '<select id="r-mode-select" onchange="setRMode(this.value)" style="background:var(--bg3);color:var(--txt);border:1px solid var(--border2);border-radius:var(--r);padding:4px 8px;font-size:11px">' +
    [['strict', 'R exact seulement'], ['usable', 'R exact + estimé'], ['all', 'Tout (y compris R fictifs)']].map(o => '<option value="' + o[0] + '"' + (R_MODE === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
  el.innerHTML = '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-bottom:12px;padding:10px 14px;border:1px solid ' + (c.defaut ? 'var(--amber)' : 'var(--border2)') + ';border-radius:var(--r);background:' + (c.defaut ? 'var(--amber-d)' : 'var(--bg3)') + ';font-size:12px;line-height:1.5">' +
    '<span><b>R pris en compte : ' + used + ' / ' + closed.length + ' trades</b> <span style="color:var(--txt3)">(' + parts.join(' · ') + ')</span></span>' + sel +
    (c.defaut && DEFAULT_RISK_EUR === 0 && est ? '<button class="btn-ghost" style="padding:4px 10px;font-size:11px" onclick="estimateRFromLosses()">Estimer le R des ' + c.defaut + ' trades sans stop avec ' + est + ' € de risque</button>' : '') +
    '<span style="color:var(--txt3);font-size:11px;flex-basis:100%">Les montants en € sont toujours exacts. Le R « fictif » (RR par défaut) n\'a aucune base réelle : il est exclu des statistiques en R tant que tu ne le rends pas explicite.</span></div>';
}
function estimateRFromLosses() {
  const losses = trades.filter(t => t.res === 'SL' && t.pnlEur < 0);
  if (losses.length < 3) { showToast('Pas assez de pertes pour estimer un risque', 'error'); return; }
  const avg = Math.round(Math.abs(losses.reduce((n, t) => n + t.pnlEur, 0) / losses.length));
  openModal('Estimer le R avec ' + avg + ' € de risque ?', 'Le R des trades sans stop-loss sera calculé comme P&L € ÷ ' + avg + ' € (ta perte moyenne). Ces R sont marqués « estimés » et restent exclus si tu choisis « R exact seulement ».', () => {
    DEFAULT_RISK_EUR = avg; DB.setItem((JP + 'default_risk_eur'), avg);
    let k = 0;
    const before = JSON.stringify(trades);
    trades.forEach(t => { if (rSource(t) === 'defaut') { const cr = computeRWithSource(t.pnlEur, t.res); t.pnl = cr.r; t.rr = cr.r; t.rSrc = cr.src; k++; } });
    if (!save()) { trades = JSON.parse(before); return; }
    const inp = document.getElementById('default-risk-eur'); if (inp) inp.value = DEFAULT_RISK_EUR;
    renderAll();
    showToast('R estimé pour ' + k + ' trade(s) avec ' + avg + ' € de risque', 'success');
  });
}
migrateRSources();

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
  const touched = trades.filter(t => Array.isArray(t[field]) && t[field].includes(oldV));
  if (!touched.length) return;
  const before = touched.map(t => t[field].slice());
  touched.forEach(t => { t[field] = [...new Set(t[field].map(v => v === oldV ? newV : v))]; });
  if (!save()) { touched.forEach((t, i) => { t[field] = before[i]; }); return; }
  renderAll();
  showToast('« ' + oldV + ' » renommé dans ' + touched.length + ' trade(s) ✓', 'success');
}

