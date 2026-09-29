// ── ACCESSIBILITÉ : focus des fenêtres ───────────────────────────────
// Chaque fenêtre (modale, fiche trade, recherche, visionneuse, saisie rapide) mémorise l'élément qui avait le focus
// et le lui rend à la fermeture ; Tab reste piégé dans la fenêtre ouverte (on ne se perd pas derrière le voile).
const __focusStack = [];
function rememberFocus() { __focusStack.push(document.activeElement); }
function restoreFocus() { const el = __focusStack.pop(); if (el && typeof el.focus === 'function' && document.contains(el)) setTimeout(() => el.focus(), 0); }
function openDialogEl() {
  const sel = ['#nt-panel:not([hidden])', '#shortcuts-help.open .modal', '#quick-add.open .modal', '#modal.open .modal', '#lightbox.open', '#search-overlay.show .search-modal', '#trade-drawer-overlay.show .drawer'];
  for (const s of sel) { const el = document.querySelector(s); if (el) return el; }
  return null;
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const box = openDialogEl(); if (!box) return;
  const f = [...box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// ── SAISIE RAPIDE (touche N, ou bouton) ──────────────────────────────
let quickRes = '';
function openQuickAdd() {
  const box = document.getElementById('quick-add'); if (!box) return;
  quickRes = '';
  ['qa-asset', 'qa-pnl', 'qa-setup'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('qa-dir').value = '';
  document.getElementById('qa-date').value = localDateStr();
  const assets = [...new Set(SEED_ASSETS.concat(trades.map(t => t.asset).filter(Boolean)))].sort();
  mount('qa-asset-list', html`${assets.map(a => html`<option value="${a}"></option>`)}`);
  // Dernier actif tradé proposé par défaut : c'est le plus probable.
  if (trades[0] && trades[0].asset) document.getElementById('qa-asset').value = trades[0].asset;
  setQuickRes('');
  rememberFocus();
  box.classList.add('open');
  setTimeout(() => { const a = document.getElementById('qa-asset'); a.focus(); a.select(); }, 30);
}
function closeQuickAdd() { const b = document.getElementById('quick-add'); if (b && b.classList.contains('open')) { b.classList.remove('open'); restoreFocus(); } }
function setQuickRes(r) {
  quickRes = r;
  document.querySelectorAll('.qa-res .seg-btn').forEach(b => { const on = b.dataset.res === r; b.classList.toggle('active', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
}
function saveQuickAdd() {
  const asset = document.getElementById('qa-asset').value.trim().slice(0, 30);
  const pnlRaw = document.getElementById('qa-pnl').value;
  const pnlEur = pnlRaw !== '' ? parseFloat(pnlRaw) : null;
  let res = quickRes;
  if (!res && pnlEur !== null) res = pnlEur > 0 ? 'TP' : pnlEur < 0 ? 'SL' : 'BE';
  if (!asset || !res) { showToast('Indique au moins l\'actif et le résultat (ou un P&L)', 'error'); return; }
  const now = new Date(), hh = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const date = document.getElementById('qa-date').value || localDateStr();
  const cr = computeRWithSource(pnlEur, res);
  const t = sanitizeTrade({ id: Date.now(), date, asset, dir: document.getElementById('qa-dir').value, res, pnlEur, pnl: cr.r, rr: Math.abs(cr.r) || null, rSrc: cr.src,
    setup: document.getElementById('qa-setup').value.trim().slice(0, 60), entry: date === localDateStr() ? hh : '', session: date === localDateStr() ? sessionFromHour(now.getHours(), 0) : '', emotion: null, tf: '', desc: '' });
  const prev = trades.slice();
  trades.unshift(t); sortTradesChrono();
  if (!save()) { trades = prev; return; }
  closeQuickAdd();
  refreshAssetDropdowns();
  renderAll();
  showToast('Trade ajouté ✓ — complète-le quand tu veux depuis le Journal', 'success');
}
document.addEventListener('keydown', e => {
  const qa = document.getElementById('quick-add');
  if (!qa || !qa.classList.contains('open')) return;
  if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); saveQuickAdd(); }
});

// ── RACCOURCIS CLAVIER ───────────────────────────────────────────────
const SHORTCUTS = [
  ['N', 'Saisie rapide d\'un trade'], ['Maj + N', 'Nouveau trade (formulaire complet)'], ['/', 'Recherche (pages, actions, trades)'], ['Ctrl/⌘ + K', 'Recherche'],
  ['1 … 9', 'Aller à la page n° 1 à 9 du menu'], ['F', 'Aller au filtre global'], ['← / →', 'Trade précédent / suivant (fiche ouverte) · capture précédente / suivante'],
  ['E', 'Modifier le trade ouvert'], ['Échap', 'Fermer la fenêtre ouverte'], ['?', 'Afficher cette aide']
];
function openShortcutsHelp() {
  mount('sh-grid', html`${SHORTCUTS.map(([k, d]) => html`<kbd>${k}</kbd><span>${d}</span>`)}`);
  rememberFocus();
  document.getElementById('shortcuts-help').classList.add('open');
  setTimeout(() => document.querySelector('#shortcuts-help .btn-primary').focus(), 30);
}
function closeShortcutsHelp() { const b = document.getElementById('shortcuts-help'); if (b.classList.contains('open')) { b.classList.remove('open'); restoreFocus(); } }
function isTyping(e) { const t = e.target; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  // Flèches : navigation dans la visionneuse ou la fiche trade ouverte.
  if (document.getElementById('lightbox').classList.contains('open')) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); galleryStep(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); galleryStep(1); }
    return;
  }
  const drawerOpen = document.getElementById('trade-drawer-overlay').classList.contains('show');
  if (drawerOpen && !isTyping(e)) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepTradeDetail(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); stepTradeDetail(1); return; }
    if (e.key === 'e' || e.key === 'E') { e.preventDefault(); if (drawerTradeId !== null) startEditTrade(drawerTradeId); return; }
  }
  if (isTyping(e) || openDialogEl()) return;
  if (e.key === 'N' && e.shiftKey) { e.preventDefault(); openTradePanel(); }
  else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openQuickAdd(); }
  else if (e.key === '/') { e.preventDefault(); openGlobalSearch(); }
  else if (e.key === '?') { e.preventDefault(); openShortcutsHelp(); }
  else if (e.key === 'f' || e.key === 'F') { const s = document.getElementById('gf-period'); if (s && s.offsetParent) { e.preventDefault(); s.focus(); } }
  else if (/^[1-9]$/.test(e.key)) {
    const items = [...document.querySelectorAll('.nav > .nav-item')];   // dans l'ordre du menu (personnalisable par glisser-déposer)
    const b = items[parseInt(e.key, 10) - 1];
    if (b) { e.preventDefault(); showPage(b.dataset.page, b); }
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeQuickAdd(); closeShortcutsHelp(); } });
