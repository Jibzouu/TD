// ── SAUVEGARDES : fichier protégé par mot de passe, sauvegarde automatique restaurable ──
// - « Sauvegarde protégée » : le backup complet chiffré (AES-GCM, clé tirée du mot de passe) ; sans le mot de passe,
//   le fichier est illisible. Restauration et fusion le reconnaissent et demandent le mot de passe.
// - Les fichiers de la sauvegarde automatique hebdomadaire (tous les comptes) se restaurent avec « Restaurer ».
const bkL = (fr, en) => LANG === 'en' ? en : fr;
const isFullBackup = d => !!(d && d.version === 'full-backup-v1' && d.data && typeof d.data === 'object' && !Array.isArray(d.data));
const BK_KEY_OK = k => /^[a-z0-9]{1,12}_[\w.-]{1,80}$/i.test(k) || k === 'journal_active';

// Fichier chiffré → demande le mot de passe puis appelle next(objet déchiffré) ; sinon next(objet) tout de suite.
function bkUnseal(parsed, next) {
  if (!JTC.isSealed(parsed)) return next(parsed);
  if (!JTC.ok()) { showToast(bkL('Ton navigateur ne sait pas déchiffrer ce fichier.', 'Your browser cannot decrypt this file.'), 'error'); return; }
  let pass = '';
  openModal(bkL('Fichier protégé par mot de passe', 'Password-protected file'), bkL('Entre le mot de passe choisi lors de l’export.', 'Enter the password chosen at export.'), async () => {
    try { next(JSON.parse(await JTC.openText(pass, parsed))); }
    catch (e) { showToast(bkL('Mot de passe incorrect ou fichier abîmé.', 'Wrong password or damaged file.'), 'error'); }
  }, { body: html`<label class="field"><span>${bkL('Mot de passe', 'Password')}</span><input type="password" id="bk-pass-in" autocomplete="current-password"></label>`, confirmLabel: bkL('Déchiffrer', 'Decrypt'),
    validate: () => { pass = (document.getElementById('bk-pass-in') || {}).value || ''; return pass.length > 0; } });
}
function exportEncrypted() {
  if (!JTC.ok()) { showToast(bkL('Ton navigateur ne permet pas le chiffrement.', 'Your browser does not support encryption.'), 'error'); return; }
  let pass = '';
  openModal(bkL('Sauvegarde protégée par mot de passe', 'Password-protected backup'), bkL('Le fichier sera illisible sans ce mot de passe. Note-le bien : s’il est perdu, la sauvegarde ne pourra pas être ouverte.', 'The file will be unreadable without this password. Write it down: if it is lost, the backup cannot be opened.'), async () => {
    const box = await JTC.sealText(pass, JSON.stringify(backupData()));
    const blob = new Blob([JSON.stringify(box)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'journal-' + JOURNALS[JOURNAL_ID].slug + '-backup-protege-' + localDateStr() + '.json'; a.click();
    URL.revokeObjectURL(url);
    DB.setItem(JP + 'last_export', Date.now());
    hideExportReminder();
    showToast(bkL('Sauvegarde protégée téléchargée ✓', 'Protected backup downloaded ✓'), 'success');
  }, { body: html`<label class="field"><span>${bkL('Mot de passe (8 caractères ou plus)', 'Password (8+ characters)')}</span><input type="password" id="bk-pass-1" autocomplete="new-password"></label>
      <label class="field"><span>${bkL('Confirmer', 'Confirm')}</span><input type="password" id="bk-pass-2" autocomplete="new-password"></label>`, confirmLabel: bkL('Chiffrer et télécharger', 'Encrypt and download'),
    validate: () => {
      const a = (document.getElementById('bk-pass-1') || {}).value || '', b = (document.getElementById('bk-pass-2') || {}).value || '';
      if (a.length < 8) { showToast(bkL('8 caractères minimum', '8 characters minimum'), 'error'); return false; }
      if (a !== b) { showToast(bkL('Les deux mots de passe ne sont pas identiques', 'The two passwords do not match'), 'error'); return false; }
      pass = a; return true;
    } });
}
// Sauvegarde automatique (copie brute de tout le journal : tous les comptes et réglages) → remplace toutes les données.
function restoreFullBackup(d) {
  const keys = Object.keys(d.data).filter(k => BK_KEY_OK(k) && typeof d.data[k] === 'string');
  const accts = new Set(keys.filter(k => /_trades$/.test(k)).map(k => k.split('_')[0])).size;
  openModal(bkL('Restaurer la sauvegarde complète ?', 'Restore the full backup?'), bkL('Sauvegarde du ', 'Backup from ') + (d.exportedAt ? fmtDateTime(Date.parse(d.exportedAt)) : '?') + ' : ' + accts + bkL(' compte(s), tous les réglages. TOUTES tes données actuelles (tous les comptes) seront remplacées ; une copie de sécurité du compte ouvert est gardée.', ' account(s), all settings. ALL your current data (every account) will be replaced; a safety copy of the open account is kept.'), async () => {
    createSafetySnapshot('avant restauration de la sauvegarde complète');
    const snap = DB.getItem(JP + 'safety_snapshot');
    // Les captures des trades de la copie de sécurité sont gardées : « Annuler » doit les retrouver.
    const snapImgs = [...snapshotImageIds()].map(id => [ImageStore.key(id), DB.getItem(ImageStore.key(id))]).filter(([, v]) => v);
    DB.keys().forEach(k => DB.removeItem(k));
    keys.forEach(k => DB.setItem(k, d.data[k]));
    if (snap) DB.setItem(JP + 'safety_snapshot', snap);
    snapImgs.forEach(([k, v]) => { if (DB.getItem(k) === null) DB.setItem(k, v); });
    await DB.flush();
    showToast(bkL('Sauvegarde restaurée ✓ — rechargement…', 'Backup restored ✓ — reloading…'), 'success');
    setTimeout(() => location.reload(), 600);
  }, { confirmLabel: bkL('Tout restaurer', 'Restore everything'), destructive: true });
}
