// ── BASCULE ENTRE JOURNAUX ───────────────────────────────────────────
function applyJournalIdentity() {
  const j = JOURNALS[JOURNAL_ID];
  const t = document.getElementById('jr-title'), sub = document.getElementById('jr-sub');
  if (t) t.textContent = j.title;
  if (sub) sub.textContent = j.sub;
  document.querySelectorAll('#jr-tabs .jr-tab').forEach(b => {
    const on = b.dataset.journal === JOURNAL_ID;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.body.dataset.journal = JOURNAL_ID;
  // Le suivi Prop Firm n'existe que dans le journal PropFirm : on retire son bouton du menu des deux autres.
  if (JOURNAL_ID !== 'pf') {
    const pn = document.querySelector('.nav-item[data-page="propfirm"]');
    if (pn) pn.remove();
  }
  const w3 = document.getElementById('welcome-step3');
  if (w3) w3.textContent = JOURNAL_ID === 'pf' ? 'Solde, limite de perte journalière et règles de ton challenge (onglet Prop Firm).' : 'Solde et limite de perte journalière.';
}
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
  location.reload();
}
function switchJournal(id) {
  if (!JOURNALS[id] || id === JOURNAL_ID) return;
  if (journalFormDirty()) openModal('Changer de journal ?', 'Le formulaire de trade en cours de saisie sera perdu.', () => doSwitchJournal(id));
  else doSwitchJournal(id);
}
applyJournalIdentity();
// Après un changement de journal, on revient sur la page où l'on était.
onReady(() => {
  let ret = null;
  try { ret = sessionStorage.getItem('journal_return_page'); sessionStorage.removeItem('journal_return_page'); } catch (e) {}
  if (ret && ret !== 'dashboard' && document.getElementById('page-' + ret)) showPage(ret, document.querySelector('.nav-item[data-page="' + ret + '"]'));
});

// Keyboard shortcut : Escape closes modal, lightbox, trade drawer, search and mobile sidebar
// (la sidebar n'est refermée que sur mobile : sur grand écran elle est permanente, Échap ne doit pas la masquer)
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeLightbox(); closeTradeDetail(); closeGlobalSearch(); if (window.matchMedia('(max-width: 860px)').matches) closeMobileSidebar(); } });
