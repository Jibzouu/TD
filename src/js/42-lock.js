// ── CODE DE VERROUILLAGE (Paramètres → Mode et sécurité) ─────────────────
// Le chiffrement lui-même vit dans le stockage (boot/db.js) : ici, seulement les réglages.
const lkL = (fr, en) => LANG === 'en' ? en : fr;
function renderLockSettings() {
  const el = document.getElementById('lock-settings');
  if (!el) return;
  if (DB.mode !== 'indexeddb' || !JTC.ok()) { mount(el, html`<p class="ui-muted">🔒 ${lkL('Le code de verrouillage n’est pas disponible dans ce navigateur (stockage ou chiffrement indisponible).', 'The lock code is not available in this browser (storage or encryption unavailable).')}</p>`); return; }
  mount(el, DB.locked
    ? html`<div class="lk-set"><span class="tone-green">🔒 ${lkL('Code de verrouillage activé : tes données sont chiffrées sur cet appareil.', 'Lock code on: your data is encrypted on this device.')}</span>
        <label class="lk-auto">${lkL('Verrouillage automatique après', 'Auto-lock after')} <select class="filter-select" id="lk-auto-sel" onchange="setAutoLock(this.value)">${[0, 5, 15, 30, 60].map(n => html`<option value="${n}" ${raw(n === autoLockMinutes() ? 'selected' : '')}>${n ? n + ' min' : lkL('jamais', 'never')}</option>`)}</select> ${lkL('sans activité', 'of inactivity')}</label>
        <span class="lk-btns"><button type="button" class="btn-ghost" onclick="lockNow()">${lkL('Verrouiller maintenant', 'Lock now')}</button><button type="button" class="btn-ghost" onclick="lockChange()">${lkL('Changer le code', 'Change code')}</button><button type="button" class="btn-ghost" onclick="lockDisable()">${lkL('Désactiver', 'Turn off')}</button></span></div>`
    : html`<div class="lk-set"><span>🔓 <b>${lkL('Code de verrouillage', 'Lock code')}</b> : ${lkL('demande un code à l’ouverture et chiffre tes données sur cet appareil (utile sur un ordinateur partagé).', 'asks for a code when opening and encrypts your data on this device (useful on a shared computer).')}</span>
        <span class="lk-btns"><button type="button" class="btn-primary" onclick="lockEnable()">${lkL('Activer un code', 'Set a code')}</button></span></div>`);
}
function lockCodeForm(withOld) {
  return html`${withOld ? html`<label class="field"><span>${lkL('Code actuel', 'Current code')}</span><input type="password" id="lk-old" inputmode="numeric" autocomplete="off"></label>` : ''}
    <label class="field"><span>${lkL('Nouveau code (4 caractères ou plus)', 'New code (4+ characters)')}</span><input type="password" id="lk-new1" inputmode="numeric" autocomplete="off"></label>
    <label class="field"><span>${lkL('Confirmer le code', 'Confirm the code')}</span><input type="password" id="lk-new2" inputmode="numeric" autocomplete="off"></label>`;
}
function readNewCode() {
  const a = (document.getElementById('lk-new1') || {}).value || '', b = (document.getElementById('lk-new2') || {}).value || '';
  if (a.length < 4) { showToast(lkL('4 caractères minimum', '4 characters minimum'), 'error'); return null; }
  if (a !== b) { showToast(lkL('Les deux codes ne sont pas identiques', 'The two codes do not match'), 'error'); return null; }
  return a;
}
function lockEnable() {
  let code = null;
  openModal(lkL('Activer le code de verrouillage', 'Set a lock code'), lkL('Important : si tu oublies ce code, tes données ne pourront plus être lues (pas de récupération possible). Fais d’abord une sauvegarde et note ton code.', 'Important: if you forget this code, your data can no longer be read (no recovery possible). Make a backup first and write your code down.'), async () => {
    try { await DB.enableLock(code); armAutoLock(); showToast(lkL('Code activé : données chiffrées ✓', 'Code set: data encrypted ✓'), 'success'); }
    catch (e) { showToast(lkL('Impossible d’activer le code : ', 'Could not set the code: ') + e.message, 'error'); }
    renderLockSettings();
  }, { body: lockCodeForm(false), confirmLabel: lkL('Activer et chiffrer', 'Set and encrypt'), validate: () => !!(code = readNewCode()) });
}
function lockDisable() {
  let old = '';
  openModal(lkL('Désactiver le code ?', 'Turn the code off?'), lkL('Tes données seront de nouveau enregistrées en clair sur cet appareil.', 'Your data will be stored unencrypted on this device again.'), async () => {
    if (await DB.disableLock(old)) showToast(lkL('Code désactivé', 'Code turned off'), 'success');
    else showToast(lkL('Code incorrect', 'Wrong code'), 'error');
    renderLockSettings();
  }, { body: html`<label class="field"><span>${lkL('Code actuel', 'Current code')}</span><input type="password" id="lk-old" inputmode="numeric" autocomplete="off"></label>`, confirmLabel: lkL('Désactiver', 'Turn off'),
    validate: () => (old = (document.getElementById('lk-old') || {}).value || '').length > 0 });
}
function lockChange() {
  let old = '', code = null;
  openModal(lkL('Changer le code', 'Change the code'), lkL('Les données sont rechiffrées avec le nouveau code.', 'Data is re-encrypted with the new code.'), async () => {
    if (!(await DB.disableLock(old))) { showToast(lkL('Code actuel incorrect', 'Current code is wrong'), 'error'); return; }
    await DB.enableLock(code);
    showToast(lkL('Nouveau code enregistré ✓', 'New code saved ✓'), 'success');
    renderLockSettings();
  }, { body: lockCodeForm(true), confirmLabel: lkL('Changer', 'Change'),
    validate: () => { old = (document.getElementById('lk-old') || {}).value || ''; return old.length > 0 && !!(code = readNewCode()); } });
}

// ── Verrouillage automatique après inactivité (journal verrouillé seulement) ──
// Aucune action (souris, clavier, toucher, défilement) pendant N minutes, ou onglet caché plus longtemps que ça :
// le journal enregistre tout puis se recharge sur l'écran de code. N = 0 : jamais.
const LOCK_AUTO_KEY = 'g_autolock_min';
function autoLockMinutes() { const n = parseInt(DB.getItem(LOCK_AUTO_KEY) || '15', 10); return isFinite(n) && n >= 0 ? n : 15; }
function setAutoLock(v) { DB.setItem(LOCK_AUTO_KEY, String(parseInt(v, 10) || 0)); armAutoLock(); renderLockSettings(); }
let autoLockTimer = null, hiddenAt = 0;
async function lockNow() { try { await DB.flush(); } catch (e) {} location.reload(); }
function armAutoLock() {
  clearTimeout(autoLockTimer);
  const min = autoLockMinutes();
  if (!DB.locked || !min) return;
  autoLockTimer = setTimeout(lockNow, min * 60000);
}
['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'].forEach(ev => document.addEventListener(ev, () => { if (autoLockTimer) armAutoLock(); }, { passive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
  const min = autoLockMinutes();
  if (DB.locked && min && hiddenAt && Date.now() - hiddenAt >= min * 60000) lockNow();
  hiddenAt = 0;
});
onReady(armAutoLock);
