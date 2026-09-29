// ── MODAL DE CONFIRMATION (accessible) ───────────────────────────────
// Le bouton s'adapte à l'action : rouge « Supprimer / Vider / Réinitialiser » pour une action destructive,
// sinon « Confirmer ». Le focus va sur le bouton d'annulation (choix sûr) et revient ensuite là où il était.
function openModal(title, msg, onConfirm, opts = {}) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-msg').textContent = msg;
  const btn = document.getElementById('modal-confirm');
  const destructive = opts.destructive ?? /^(supprimer|vider|réinitialiser|effacer)/i.test(title);
  btn.textContent = opts.confirmLabel || (destructive ? (title.match(/^(\S+)/)[1].replace(/\W+$/, '') || 'Confirmer') : 'Confirmer');
  btn.className = destructive ? 'btn-danger' : 'btn-primary';
  btn.onclick = () => { closeModal(); onConfirm(); };
  rememberFocus();
  document.getElementById('modal').classList.add('open');
  setTimeout(() => { const c = document.querySelector('#modal .btn-cancel'); if (c) c.focus(); }, 30);
}
function closeModal() {
  const m = document.getElementById('modal');
  if (!m.classList.contains('open')) return;
  m.classList.remove('open');
  restoreFocus();
}
document.getElementById('modal').addEventListener('click', e => { if (e.target === document.getElementById('modal')) closeModal(); });

// ── TOAST ────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}
