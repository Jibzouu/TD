// ── COMPTES : sélecteur, création, renommage, suppression ─────────────
// Chaque compte a ses propres trades et réglages (préfixe de stockage = id du compte). Changer de compte recharge
// la page sur le compte choisi ; l'apparence est commune à tous les comptes.
function accountBadge(type) { const t = ACCOUNT_TYPES[type]; return html`<span class="acc-type tone-${raw(t.color)}">${t.label}</span>`; }
function applyJournalIdentity() {
  const j = JOURNALS[JOURNAL_ID];
  const t = document.getElementById('jr-title'), sub = document.getElementById('jr-sub');
  if (t) t.textContent = j.title;
  if (sub) sub.textContent = j.sub;
  const cur = document.getElementById('acc-current');
  if (cur) mount(cur, html`<span class="acc-dot fill-${raw(ACCOUNT_TYPES[JOURNAL_TYPE].color)}"></span><span class="acc-name">${j.title}</span>${accountBadge(JOURNAL_TYPE)}<span class="acc-caret" aria-hidden="true">▾</span>`);
  renderAccountMenu();
  document.body.dataset.journal = JOURNAL_ID;
  document.body.dataset.accountType = JOURNAL_TYPE;
  // Le suivi Prop Firm n'existe que dans un compte de type « Prop firm ».
  if (!IS_PROPFIRM) {
    const pn = document.querySelector('.nav-item[data-page="propfirm"]');
    if (pn) pn.remove();
  }
  const w3 = document.getElementById('welcome-step3');
  if (w3) w3.textContent = IS_PROPFIRM ? 'Solde, limite de perte journalière et règles de ton challenge (onglet Prop Firm).' : 'Solde et limite de perte journalière.';
}
function renderAccountMenu() {
  const menu = document.getElementById('acc-menu');
  if (!menu) return;
  mount(menu, html`${ACCOUNTS.map(a => html`<button class="acc-item${raw(a.id === JOURNAL_ID ? ' on' : '')}" role="option" aria-selected="${a.id === JOURNAL_ID ? 'true' : 'false'}" onclick="switchJournal('${raw(a.id)}')"><span class="acc-dot fill-${raw(ACCOUNT_TYPES[a.type].color)}"></span><span class="acc-name">${a.name}</span>${accountBadge(a.type)}</button>`)}
    <div class="acc-sep"></div>
    <button class="acc-item acc-action" onclick="openNewAccount()">＋ Nouveau compte</button>
    <button class="acc-item acc-action" onclick="closeAccountMenu();showPage('parametres', document.querySelector('.nav-item[data-page=parametres]'));setTimeout(() => { const c = document.getElementById('accounts-card'); if (c) c.scrollIntoView({ block: 'start' }); }, 50)">⚙ Gérer mes comptes</button>`);
}
function toggleAccountMenu(force) {
  const menu = document.getElementById('acc-menu'), btn = document.getElementById('acc-current');
  if (!menu || !btn) return;
  const open = force !== undefined ? force : menu.hidden;
  menu.hidden = !open;
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
function closeAccountMenu() { toggleAccountMenu(false); }
document.addEventListener('pointerdown', e => { const sw = document.getElementById('acc-switch'); if (sw && !sw.contains(e.target)) closeAccountMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAccountMenu(); });

function currentPageId() {
  const p = document.querySelector('.page.active');
  return p ? p.id.replace('page-', '') : 'dashboard';
}
function journalFormDirty() {
  return editingTradeId !== null || ['f-asset', 'f-res', 'f-pnleur', 'f-desc'].some(id => {
    const el = document.getElementById(id);
    return el && String(el.value || '').trim() !== '';
  });
}
function doSwitchJournal(id) {
  try { sessionStorage.setItem('journal_return_page', currentPageId()); } catch (e) {}
  DB.setItem('journal_active', id);
  DB.flush().then(() => location.reload());
}
function switchJournal(id) {
  closeAccountMenu();
  if (!JOURNALS[id] || id === JOURNAL_ID) return;
  if (journalFormDirty()) openModal('Changer de compte ?', 'Le formulaire de trade en cours de saisie sera perdu.', () => doSwitchJournal(id));
  else doSwitchJournal(id);
}

// ── Création / renommage / suppression ──
function saveAccounts(list) { DB.setItem('g_journals', JSON.stringify(list)); }
function newAccountId() {
  const taken = new Set(ACCOUNTS.map(a => a.id).concat(['g', 'tj', 'bt', 'pf']));
  let id;
  do { id = 'a' + Math.random().toString(36).slice(2, 7); } while (taken.has(id) || DB.keys().some(k => k.indexOf(id + '_') === 0));
  return id;
}
function accountForm(name, type) {
  return html`<div class="acc-form">
    <label class="field"><span>Nom du compte</span><input type="text" id="acc-f-name" maxlength="40" value="${name || ''}" placeholder="ex. FTMO 100k, Compte perso…"></label>
    <label class="field"><span>Type</span><select id="acc-f-type">${Object.entries(ACCOUNT_TYPES).map(([k, t]) => html`<option value="${k}"${raw(k === (type || 'live') ? ' selected' : '')}>${t.label} — ${t.sub}</option>`)}</select></label>
  </div>`;
}
function readAccountForm() {
  const name = (document.getElementById('acc-f-name').value || '').trim().slice(0, 40);
  const type = document.getElementById('acc-f-type').value;
  if (!name) { showToast('Donne un nom au compte', 'error'); return null; }
  if (!ACCOUNT_TYPES[type]) return null;
  return { name, type };
}
function openNewAccount() {
  closeAccountMenu();
  let form = null;
  openModal('Nouveau compte', 'Chaque compte a ses propres trades, son plan, son scaling et ses réglages.', () => {
    const list = ACCOUNTS.slice(), id = newAccountId();
    list.push({ id, name: form.name, type: form.type, createdAt: Date.now() });
    saveAccounts(list);
    doSwitchJournal(id);
  }, { body: accountForm('', 'live'), confirmLabel: 'Créer et ouvrir', validate: () => !!(form = readAccountForm()) });
}
function openRenameAccount(id) {
  const a = ACCOUNTS.find(x => x.id === id);
  if (!a) return;
  let form = null;
  openModal('Modifier le compte', 'Le type « Prop firm » active le suivi de challenge pour ce compte.', () => {
    saveAccounts(ACCOUNTS.map(x => x.id === id ? Object.assign({}, x, form) : x));
    DB.flush().then(() => location.reload());
  }, { body: accountForm(a.name, a.type), confirmLabel: 'Enregistrer', validate: () => !!(form = readAccountForm()) });
}
function deleteAccount(id) {
  const a = ACCOUNTS.find(x => x.id === id);
  if (!a) return;
  if (ACCOUNTS.length <= 1) { showToast('Il faut garder au moins un compte', 'error'); return; }
  const n = (() => { try { return (JSON.parse(DB.getItem(id + '_trades') || '[]') || []).length; } catch (e) { return 0; } })();
  openModal('Supprimer le compte « ' + a.name + ' » ?', (n ? n + ' trade(s), leurs captures, ' : '') + 'son plan, son scaling et ses réglages seront supprimés définitivement. Pense à exporter un backup avant.', () => {
    DB.keys().filter(k => k.indexOf(id + '_') === 0).forEach(k => DB.removeItem(k));
    saveAccounts(ACCOUNTS.filter(x => x.id !== id));
    if (id === JOURNAL_ID) DB.setItem('journal_active', ACCOUNTS.find(x => x.id !== id).id);
    DB.flush().then(() => location.reload());
  }, { destructive: true, confirmLabel: 'Supprimer' });
}
// Carte « Mes comptes » (Paramètres).
function renderAccountsCard() {
  const cont = document.getElementById('accounts-list');
  if (!cont) return;
  const count = id => { try { return (JSON.parse(DB.getItem(id + '_trades') || '[]') || []).length; } catch (e) { return 0; } };
  mount(cont, html`${ACCOUNTS.map(a => html`<div class="acc-row${raw(a.id === JOURNAL_ID ? ' on' : '')}">
      <span class="acc-dot fill-${raw(ACCOUNT_TYPES[a.type].color)}"></span>
      <span class="acc-name">${a.name}${a.id === JOURNAL_ID ? html` <small class="tone-muted">· ouvert</small>` : ''}</span>
      ${accountBadge(a.type)}
      <span class="acc-count tone-muted">${count(a.id)} trade${count(a.id) > 1 ? 's' : ''}</span>
      ${a.id !== JOURNAL_ID ? html`<button class="btn-ghost btn-sm" onclick="switchJournal('${raw(a.id)}')">Ouvrir</button>` : ''}
      <button class="btn-ghost btn-sm" onclick="openRenameAccount('${raw(a.id)}')">Modifier</button>
      <button class="del-btn" onclick="deleteAccount('${raw(a.id)}')" title="Supprimer ce compte" aria-label="Supprimer le compte ${a.name}">×</button>
    </div>`)}
    <button class="btn-ghost btn-add" onclick="openNewAccount()">＋ Nouveau compte</button>`);
}
applyJournalIdentity();
onReady(renderAccountsCard);
// Après un changement de compte, on revient sur la page où l'on était.
onReady(() => {
  let ret = null;
  try { ret = sessionStorage.getItem('journal_return_page'); sessionStorage.removeItem('journal_return_page'); } catch (e) {}
  if (ret && ret !== 'dashboard' && document.getElementById('page-' + ret)) showPage(ret, document.querySelector('.nav-item[data-page="' + ret + '"]'));
});

// Keyboard shortcut : Escape closes modal, lightbox, trade drawer, search and mobile sidebar
// (la sidebar n'est refermée que sur mobile : sur grand écran elle est permanente, Échap ne doit pas la masquer)
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeLightbox(); closeTradeDetail(); closeGlobalSearch(); if (window.matchMedia('(max-width: 860px)').matches) closeMobileSidebar(); } });
