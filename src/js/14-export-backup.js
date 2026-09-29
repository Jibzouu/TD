// ── EXPORT / IMPORT ──────────────────────────────────────────────────
const BACKUP_SETTINGS_KEYS = [
  (GP + 'theme'), (GP + 'custom_themes'), (JP + 'nav_order'), (JP + 'account'), (JP + 'calc'),
  (JP + 'dd_limit_pct'), (JP + 'dd_manual'), (JP + 'default_risk_eur'), (JP + 'default_rr_win'), (JP + 'default_rr_loss'),
  (GP + 'cal_heat_intensity'), (GP + 'chart_intensity'), (GP + 'theme_texture'), (GP + 'theme_autosystem'), (JP + 'stats_subtab'),
  (JP + 'pf_enabled'), (JP + 'pf_target_pct'), (JP + 'pf_maxdd_pct'), (JP + 'pf_dd_type'), (JP + 'pf_min_days'), (JP + 'pf_consistency_on'), (JP + 'pf_consistency_pct'),
  (JP + 'last_csv_import'), (JP + 'dash_layout_v2'), (JP + 'scaling'), (JP + 'r_mode'), (JP + 'tz_offset_hours'), (JP + 'import_fx_rate')
];
function collectAllSettings() {
  const out = {};
  BACKUP_SETTINGS_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) out[k] = v;
  });
  return out;
}
function restoreAllSettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  // On compare les réglages par leur NOM (sans préfixe de journal) : un ancien backup (tj_theme…) ou un backup venant
  // d'un autre journal est ainsi rangé au bon endroit — l'apparence va dans le stockage commun, le reste dans ce journal.
  const allowed = new Set(BACKUP_SETTINGS_KEYS.map(k => k.replace(/^(tj|bt|pf|g)_/, '')));
  Object.entries(settings).forEach(([k, v]) => {
    const m = /^(tj|bt|pf|g)_(.+)$/.exec(k);
    if (!m || typeof v !== 'string' || !allowed.has(m[2])) return;
    localStorage.setItem((SHARED_SETTINGS.includes(m[2]) ? GP : JP) + m[2], v);
  });
}
// Après restauration d'un backup : recharge en mémoire les réglages d'import/R (sinon l'ancien réglage restait actif jusqu'au rechargement de la page).
function reloadImportSettings() {
  DEFAULT_RR_WIN = parseFloat(localStorage.getItem((JP + 'default_rr_win')) || '2') || 2;
  DEFAULT_RR_LOSS = -Math.abs(parseFloat(localStorage.getItem((JP + 'default_rr_loss')) || '1') || 1);
  DEFAULT_RISK_EUR = parseFloat(localStorage.getItem((JP + 'default_risk_eur')) || '0') || 0;
  TZ_OFFSET_HOURS = parseFloat(localStorage.getItem((JP + 'tz_offset_hours')) || '0') || 0;
  IMPORT_FX_RATE = parseFloat(localStorage.getItem((JP + 'import_fx_rate')) || '1') || 1;
  R_MODE = localStorage.getItem((JP + 'r_mode')) || 'usable';
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('account-size', accountSize); set('default-rr-win', DEFAULT_RR_WIN); set('default-rr-loss', Math.abs(DEFAULT_RR_LOSS));
  set('default-risk-eur', DEFAULT_RISK_EUR || ''); set('tz-offset-hours', TZ_OFFSET_HOURS); set('import-fx-rate', IMPORT_FX_RATE);
  set('dd-limit-pct', loadDDLimitPct());
}
function isValidTradesArray(arr) {
  if (!Array.isArray(arr)) return false;
  return arr.every(t => t && typeof t === 'object' && (typeof t.id === 'number' || typeof t.id === 'string'));
}

function exportData() {
  const data = { version: 2, journal: JOURNAL_ID, exportedAt: new Date().toISOString(), trades, watchData, planData, settings: collectAllSettings() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'journal-' + JOURNALS[JOURNAL_ID].slug + '-backup-' + localDateStr() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem((JP + 'last_export'), Date.now());
  hideExportReminder();
  showToast('Backup complet téléchargé ✓ (trades + réglages + thèmes)', 'success');
}

// ── SAUVEGARDE AUTOMATIQUE HEBDOMADAIRE (jusqu'à 3 dossiers séparés) ──────────
// Le navigateur ne permet jamais à une page de recevoir un chemin tapé au clavier et d'y écrire
// directement (sécurité) : l'utilisateur choisit chaque dossier une fois via la fenêtre système
// (n'importe quel dossier de son disque), et le navigateur mémorise cette autorisation. Nécessite
// l'API File System Access (Chrome/Edge) sur une origine sécurisée — pas de fichier ouvert en double-clic.
const BACKUP_SLOTS = [1, 2, 3];
const FS_ACCESS_SUPPORTED = typeof window.showDirectoryPicker === 'function';

function openBackupDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('jt_backup_dirs', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('dirs')) req.result.createObjectStore('dirs'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function backupIdbGet(key) {
  try {
    const db = await openBackupDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction('dirs', 'readonly').objectStore('dirs').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return null; }
}
async function backupIdbSet(key, val) {
  const db = await openBackupDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dirs', 'readwrite');
    tx.objectStore('dirs').put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function backupIdbDelete(key) {
  const db = await openBackupDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dirs', 'readwrite');
    tx.objectStore('dirs').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function chooseBackupFolder(slot) {
  if (!FS_ACCESS_SUPPORTED) { showToast('Ton navigateur ne permet pas de choisir un dossier automatiquement (utilise Chrome ou Edge).', 'error'); return; }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await backupIdbSet('slot' + slot, handle);
    showToast('Dossier ' + slot + ' choisi : « ' + handle.name + ' » ✓', 'success');
  } catch (e) { if (e && e.name !== 'AbortError') showToast('Impossible de choisir ce dossier : ' + e.message, 'error'); }
  renderBackupSettings();
}
async function forgetBackupFolder(slot) {
  await backupIdbDelete('slot' + slot);
  renderBackupSettings();
}
async function verifyBackupPermission(handle) {
  if (!handle) return false;
  const opts = { mode: 'readwrite' };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
  } catch (e) {}
  return false;
}
function fullBackupPayload() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); }
  return { version: 'full-backup-v1', app: 'journal-de-trading', exportedAt: new Date().toISOString(), data: out };
}
async function writeBackupToSlot(slot) {
  const handle = await backupIdbGet('slot' + slot);
  if (!handle) return { slot, ok: false, reason: 'non configuré' };
  if (!(await verifyBackupPermission(handle))) return { slot, ok: false, reason: 'permission refusée', name: handle.name };
  try {
    const fname = 'journal-trading-sauvegarde-' + localDateStr() + '.json';
    const fileHandle = await handle.getFileHandle(fname, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(fullBackupPayload(), null, 2));
    await writable.close();
    return { slot, ok: true, name: handle.name, file: fname };
  } catch (e) { return { slot, ok: false, reason: e.message, name: handle.name }; }
}
async function runBackupNow(silent) {
  const results = [];
  for (const slot of BACKUP_SLOTS) results.push(await writeBackupToSlot(slot));
  const okCount = results.filter(r => r.ok).length;
  const anyConfigured = results.some(r => r.reason !== 'non configuré');
  // La date de dernière sauvegarde n'avance que si au moins un dossier a vraiment reçu le fichier : un échec sera retenté à la prochaine ouverture.
  if (okCount > 0) localStorage.setItem((GP + 'last_backup_run'), Date.now());
  localStorage.setItem((GP + 'last_backup_attempt'), Date.now());
  localStorage.setItem((GP + 'last_backup_results'), JSON.stringify(results));
  if (okCount > 0) showToast('Sauvegarde effectuée : ' + okCount + '/' + BACKUP_SLOTS.length + ' dossier(s) ✓', 'success');
  else if (!silent && anyConfigured) showToast('Échec de la sauvegarde — vérifie l\'autorisation des dossiers ci-dessous.', 'error');
  else if (!silent) showToast('Choisis d\'abord au moins un dossier ci-dessous.', 'error');
  renderBackupSettings();
  return results;
}
function getBackupDay() { const v = parseInt(localStorage.getItem((GP + 'backup_weekday'))); return isNaN(v) ? 5 : v; } // vendredi par défaut
function setBackupDay(v) { localStorage.setItem((GP + 'backup_weekday'), v); renderBackupSettings(); }
async function checkAutoBackupDue() {
  if (!FS_ACCESS_SUPPORTED) return;
  const handles = await Promise.all(BACKUP_SLOTS.map(s => backupIdbGet('slot' + s)));
  if (!handles.some(h => h)) return; // aucun dossier configuré : rien à faire
  const last = parseInt(localStorage.getItem((GP + 'last_backup_run'))) || 0;
  const lastTry = parseInt(localStorage.getItem((GP + 'last_backup_attempt'))) || 0;
  const daysSince = (Date.now() - last) / 86400000;
  if (Date.now() - lastTry < 3600000) return;   // pas plus d'une tentative automatique par heure
  // Jour choisi (et pas déjà fait aujourd'hui) OU rattrapage : plus de 7 jours sans sauvegarde réussie (journal pas ouvert le bon jour, échec…).
  if ((new Date().getDay() === getBackupDay() && daysSince >= 1) || daysSince >= 7) await runBackupNow(true);
}
async function renderBackupSettings() {
  const list = document.getElementById('backup-slots-list');
  if (!list) return;
  const unsupported = document.getElementById('backup-fs-unsupported');
  if (unsupported) unsupported.style.display = FS_ACCESS_SUPPORTED ? 'none' : 'block';
  const sel = document.getElementById('backup-weekday-select');
  if (sel) sel.value = String(getBackupDay());
  const handles = await Promise.all(BACKUP_SLOTS.map(s => backupIdbGet('slot' + s)));
  const perms = await Promise.all(handles.map(h => h ? h.queryPermission({ mode: 'readwrite' }).catch(() => 'denied') : null));
  list.innerHTML = BACKUP_SLOTS.map((slot, i) => {
    const h = handles[i], perm = perms[i];
    const status = !h ? '<span style="color:var(--txt3)">non configuré</span>'
      : perm === 'granted' ? '<span style="color:var(--green)">✓ « ' + esc(h.name) + ' »</span>'
      : '<span style="color:var(--amber)">⚠️ « ' + esc(h.name) + ' » — autorisation à renouveler</span>';
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:10px 14px;flex-wrap:wrap">
      <span style="font-size:11.5px;font-family:var(--mono)">Dossier ${slot} : ${status}</span>
      <span style="display:flex;gap:6px">
        <button class="btn-ghost" style="padding:5px 10px;font-size:11px" ${FS_ACCESS_SUPPORTED ? '' : 'disabled'} onclick="chooseBackupFolder(${slot})">${h ? 'Changer' : 'Choisir un dossier…'}</button>
        ${h ? `<button class="btn-ghost" style="padding:5px 10px;font-size:11px" onclick="forgetBackupFolder(${slot})">Oublier</button>` : ''}
      </span>
    </div>`;
  }).join('');
  const info = document.getElementById('backup-last-run-info');
  if (info) {
    const last = parseInt(localStorage.getItem((GP + 'last_backup_run')));
    const lastTry = parseInt(localStorage.getItem((GP + 'last_backup_attempt')));
    if (!last) { info.textContent = lastTry ? 'Aucune sauvegarde réussie pour l\'instant — dernière tentative le ' + new Date(lastTry).toLocaleString('fr-FR') + ' : échec (vérifie l\'autorisation des dossiers).' : 'Aucune sauvegarde automatique effectuée pour l\'instant.'; }
    else {
      let results = []; try { results = JSON.parse(localStorage.getItem((GP + 'last_backup_results')) || '[]'); } catch (e) {}
      const ok = results.filter(r => r.ok).length;
      info.textContent = 'Dernière sauvegarde : ' + new Date(last).toLocaleString('fr-FR') + ' (' + ok + '/' + BACKUP_SLOTS.length + ' dossier(s) réussi(s)). La sauvegarde automatique se déclenche quand le journal est ouvert : le jour choisi, ou dès la prochaine ouverture si plus de 7 jours se sont écoulés.';
    }
  }
}
checkAutoBackupDue();

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!isValidTradesArray(data.trades)) throw new Error('Format invalide');
      const hasSettings = data.settings && typeof data.settings === 'object';
      const other = data.journal && data.journal !== JOURNAL_ID && JOURNALS[data.journal];
      const warn = other ? `⚠️ Ce backup vient du journal « ${other.tab} » alors que tu es dans « ${JOURNALS[JOURNAL_ID].tab} ». ` : '';
      const msg = `${warn}${data.trades.length} trades seront restaurés${hasSettings ? ', ainsi que tes thèmes et réglages' : ''}. Tes données actuelles seront remplacées.`;
      openModal('Importer ce backup ?', msg, () => {
        createSafetySnapshot('avant import de backup');
        const prevTrades = trades.slice();
        trades = sanitizeTrades(data.trades); sortTradesChrono();
        if (!save()) { trades = prevTrades; return; }   // rien n'est modifié si le stockage refuse
        if ((x => x && typeof x === 'object' && !Array.isArray(x))(data.watchData)) { watchData = data.watchData; localStorage.setItem((JP + 'watch'), JSON.stringify(watchData)); }
        if ((x => x && typeof x === 'object' && !Array.isArray(x))(data.planData)) { planData = data.planData; localStorage.setItem((JP + 'plan'), JSON.stringify(planData)); }
        if (hasSettings) restoreAllSettings(data.settings);
        applySavedTheme();
        if (localStorage.getItem((GP + 'theme_texture')) === '1') document.body.classList.add('texture-on');
        else document.body.classList.remove('texture-on');
        applyNavOrder();
        accountSize = parseFloat(localStorage.getItem((JP + 'account'))) || accountSize;
        reloadImportSettings();
        CAL_HEAT_INTENSITY = parseFloat(localStorage.getItem((GP + 'cal_heat_intensity')) || '1');
        CHART_INTENSITY = parseFloat(localStorage.getItem((GP + 'chart_intensity')) || '2');
        const savedLayout = loadDashLayout();
        if (savedLayout) applyDashLayout(savedLayout);
        scalingState = null;
        fillScalingForm();
        renderAll();
        initPlan();
        renderWatchlist();
        renderSettingsPage();
        showToast('Import réussi — '+trades.length+' trades'+(hasSettings?' + réglages':''), 'success');
      });
    } catch { showToast('Fichier invalide ou corrompu', 'error'); }
  };
  reader.readAsText(file);
  input.value = '';
}

function confirmReset() {
  openModal('Réinitialiser le journal ?', 'Tous tes trades seront supprimés. Une copie de sécurité sera gardée localement (restaurable depuis cette page) au cas où.', () => {
    if (trades.length > 0) {
      try { localStorage.setItem((JP + 'reset_backup'), JSON.stringify({ trades, at: Date.now() })); }
      catch (e) {
        // Pas la place de garder une copie locale : on télécharge un backup complet AVANT d'effacer quoi que ce soit.
        try { exportData(); } catch (e2) { showToast('Impossible de sauvegarder avant réinitialisation — rien n\'a été effacé', 'error'); return; }
      }
    }
    const prevTrades = trades;
    trades = [];
    if (!save()) { trades = prevTrades; return; }
    renderAll();
    renderTrashUI();
    showToast('Journal réinitialisé — sauvegarde disponible dans Export/Import');
  });
}

function loadResetBackup() {
  try { return JSON.parse(localStorage.getItem((JP + 'reset_backup')) || 'null'); } catch(e) { return null; }
}
function restoreResetBackup() {
  const backup = loadResetBackup();
  if (!backup || !backup.trades) return;
  openModal('Restaurer cette sauvegarde ?', backup.trades.length + ' trades vont remplacer ton journal actuel.', () => {
    const prevTrades = trades;
    trades = sanitizeTrades(backup.trades); sortTradesChrono();
    if (!save()) { trades = prevTrades; return; }
    localStorage.removeItem((JP + 'reset_backup'));   // restaurée : la copie de secours n'a plus lieu d'être
    renderAll();
    renderTrashUI();
    showToast('Sauvegarde restaurée — ' + trades.length + ' trades', 'success');
  });
}
function dismissResetBackup() {
  localStorage.removeItem((JP + 'reset_backup'));
  renderTrashUI();
}

// ── CORBEILLE (trades supprimés individuellement) ───────────────────
function loadTrash() {
  try { return JSON.parse(localStorage.getItem((JP + 'trash')) || '[]'); } catch(e) { return []; }
}
function saveTrash(list) { try { localStorage.setItem((JP + 'trash'), JSON.stringify(list)); return true; } catch (e) { console.error('Corbeille non enregistrée :', e); return false; } }

function restoreTrashItem(idx) {
  const trash = loadTrash();
  const entry = trash[idx];
  if (!entry) return;
  const prevTrades = trades.slice();
  const restored = sanitizeTrade(entry.trade);
  if (!restored) return;
  trades.unshift(restored); sortTradesChrono();
  if (!save()) { trades = prevTrades; return; }   // pas restauré : il reste dans la corbeille
  trash.splice(idx, 1);
  saveTrash(trash);
  renderAll();
  renderTrashUI();
  showToast('Trade restauré ✓', 'success');
}
function emptyTrash() {
  openModal('Vider la corbeille ?', 'Les trades de la corbeille seront supprimés définitivement.', () => {
    saveTrash([]);
    renderTrashUI();
    showToast('Corbeille vidée');
  });
}

function renderTrashUI() {
  renderStorageCard();
  const snapCard = document.getElementById('safety-snapshot-card');
  if (snapCard) {
    const snap = loadSafetySnapshot();
    snapCard.style.display = snap ? 'block' : 'none';
    if (snap) document.getElementById('safety-snapshot-info').textContent = snap.trades.length + ' trades · ' + (snap.label || 'avant import') + ' · ' + new Date(snap.at).toLocaleString('fr-FR') + (snap.imagesDropped ? ' · captures non incluses' : '');
  }
  const cont = document.getElementById('trash-list');
  const backupCard = document.getElementById('reset-backup-card');
  if (backupCard) {
    const backup = loadResetBackup();
    backupCard.style.display = backup ? 'block' : 'none';
    if (backup) {
      const dateStr = new Date(backup.at).toLocaleString('fr-FR');
      document.getElementById('reset-backup-info').textContent = backup.trades.length + ' trades · réinitialisé le ' + dateStr;
    }
  }
  if (!cont) return;
  const trash = loadTrash();
  const emptyBtn = document.getElementById('empty-trash-btn');
  if (emptyBtn) emptyBtn.style.display = trash.length ? 'inline-flex' : 'none';
  if (trash.length === 0) {
    cont.innerHTML = `<p style="font-size:12px;color:var(--txt3)">Corbeille vide.</p>`;
    return;
  }
  cont.innerHTML = trash.map((entry, i) => {
    const t = entry.trade;
    const col = t.res === 'TP' ? 'var(--green)' : t.res === 'SL' ? 'var(--red)' : 'var(--txt2)';
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;font-family:var(--mono)">
      <span style="color:var(--txt2)">${esc(t.date||'—')} · ${esc(t.asset||'—')} <span style="color:${col}">${esc(t.res||'')}</span></span>
      <button class="btn-ghost" style="padding:4px 10px;font-size:11px" onclick="restoreTrashItem(${i})">Restaurer</button>
    </div>`;
  }).join('');
}

// ── RAPPEL D'EXPORT ──────────────────────────────────────────────────
function hideExportReminder() {
  const el = document.getElementById('export-reminder');
  if (el) el.style.display = 'none';
}
function dismissExportReminder() {
  sessionStorage.setItem((JP + 'export_reminder_dismissed'), '1');
  hideExportReminder();
}
function checkExportReminder() {
  const el = document.getElementById('export-reminder');
  if (!el) return;
  if (sessionStorage.getItem((JP + 'export_reminder_dismissed'))) { el.style.display = 'none'; return; }
  if (trades.length < 5) { el.style.display = 'none'; return; }
  const last = parseInt(localStorage.getItem((JP + 'last_export')) || '0', 10);
  const days = last ? (Date.now() - last) / 86400000 : Infinity;
  if (days >= 7) {
    document.getElementById('export-reminder-text').textContent = last
      ? `Ça fait ${Math.floor(days)} jours que tu n'as pas exporté de backup — ${trades.length} trades sont uniquement dans ce navigateur.`
      : `${trades.length} trades enregistrés, mais aucun backup exporté pour l'instant — tout vit uniquement dans ce navigateur.`;
    el.style.display = 'flex';
  } else {
    el.style.display = 'none';
  }
}

function hideImportReminder() {
  const el = document.getElementById('import-reminder');
  if (el) el.style.display = 'none';
}
function dismissImportReminder() {
  sessionStorage.setItem((JP + 'import_reminder_dismissed'), '1');
  hideImportReminder();
}
function checkImportReminder() {
  const el = document.getElementById('import-reminder');
  if (!el) return;
  if (sessionStorage.getItem((JP + 'import_reminder_dismissed'))) { el.style.display = 'none'; return; }
  const last = parseInt(localStorage.getItem((JP + 'last_csv_import')) || '0', 10);
  if (!last) { el.style.display = 'none'; return; }
  const days = (Date.now() - last) / 86400000;
  if (days >= 3) {
    document.getElementById('import-reminder-text').textContent =
      `Dernier import CSV il y a ${Math.floor(days)} jour(s) — pense à réimporter tes derniers trades TradingView pour garder le journal à jour.`;
    el.style.display = 'flex';
  } else {
    el.style.display = 'none';
  }
}

