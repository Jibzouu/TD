// ── MODAL ────────────────────────────────────────────────────────────
function openModal(title, msg, onConfirm) {
  document.querySelector('.modal h3').textContent = title;
  document.getElementById('modal-msg').textContent = msg;
  document.getElementById('modal-confirm').onclick = () => { onConfirm(); closeModal(); };
  document.getElementById('modal').classList.add('open');
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }
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

