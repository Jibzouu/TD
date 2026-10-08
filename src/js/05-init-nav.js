// ── INIT ─────────────────────────────────────────────────────────────
onReady(() => {
  safeRun(migrateChecklistLabels, 'migrateChecklistLabels');   // ici et pas plus haut : la checklist par défaut (const) n'est définie que plus bas dans le script
  initSidebarState();
  initDashboardLayout();
  applySavedTheme();
  if (DB.getItem((GP + 'theme_texture')) !== '0') document.body.classList.add('texture-on');   // grain fin actif par défaut
  if (DB.getItem((GP + 'theme_autosystem')) === '1') applySystemTheme();
  applyNavOrder();
  initNavDragDrop();
  document.getElementById('f-date').value = localDateStr();
  document.getElementById('account-size').value = accountSize;
  document.getElementById('dd-date').value = localDateStr();
  document.getElementById('dd-limit-pct').value = loadDDLimitPct();
  const tzInp = document.getElementById('tz-offset-hours'); if (tzInp) tzInp.value = TZ_OFFSET_HOURS;
  const fxInp = document.getElementById('import-fx-rate'); if (fxInp) fxInp.value = IMPORT_FX_RATE;
  openImportSettingsIfUsed();
  [initPlan, initWatchlist, renderTradeChecklist, renderTradeMistakes, loadPositionCalc, renderAll, refreshAssetDropdowns, renderSettingsPage].forEach(fn => safeRun(fn, fn.name));
  if (window._corruptKeys && window._corruptKeys.length) {
    showToast('⚠️ Donnée illisible ignorée (' + window._corruptKeys.join(', ') + ') — copie gardée sous « …_corrupt_backup »', 'error');
  }
});

// ── RÉORGANISATION DE LA SIDEBAR (glisser-déposer) ──────────────────
function applyNavOrder() {
  try {
    const order = JSON.parse(DB.getItem((JP + 'nav_order')) || 'null');
    if (!order) return;
    // Ordre enregistré avant les groupes titrés (Trading, Analyse…) : abandonné une fois, le menu repart rangé par groupes.
    if (!['grp-trading', 'grp-analyse', 'grp-prep', 'grp-data'].every(id => order.includes(id))) {
      DB.removeItem((JP + 'nav_order'));
      return;
    }
    const nav = document.querySelector('.nav');
    if (!nav) return;
    // Onglets absents de l'ordre sauvegardé (ex : ajoutés depuis) : on les replace après leur voisin d'origine.
    const defaultIds = [...nav.querySelectorAll(':scope > [data-navid]')].map(e => e.dataset.navid);
    order.forEach(id => {
      const el = nav.querySelector(`[data-navid="${id}"]`);
      if (el) nav.appendChild(el);
    });
    defaultIds.forEach((id, idx) => {
      if (order.includes(id)) return;
      const el = nav.querySelector(`[data-navid="${id}"]`);
      if (!el) return;
      let prev = null;
      for (let j = idx - 1; j >= 0 && !prev; j--) prev = nav.querySelector(`[data-navid="${defaultIds[j]}"]`);
      if (prev) nav.insertBefore(el, prev.nextSibling);
      else nav.insertBefore(el, nav.firstChild);
    });
  } catch (e) {}
}
function saveNavOrder() {
  const order = [...document.querySelectorAll('.nav > [data-navid]')].map(el => el.dataset.navid);
  DB.setItem((JP + 'nav_order'), JSON.stringify(order));
}
function getNavDragAfterElement(container, y) {
  const items = [...container.querySelectorAll('[data-navid]:not(.dragging)')];
  return items.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity }).element;
}
function setupNavDraggable(item, nav, isClickable) {
  if (item.dataset.dragInit) return;
  item.dataset.dragInit = '1';

  if (isClickable && !item.querySelector('.nav-grip')) {
    const grip = document.createElement('span');
    grip.className = 'nav-grip';
    mount(grip, html`<svg viewBox="0 0 10 16" fill="currentColor" width="10" height="16"><circle cx="3" cy="3" r="1.3"/><circle cx="7" cy="3" r="1.3"/><circle cx="3" cy="8" r="1.3"/><circle cx="7" cy="8" r="1.3"/><circle cx="3" cy="13" r="1.3"/><circle cx="7" cy="13" r="1.3"/></svg>`);
    item.insertBefore(grip, item.firstChild);
  }

  let originalClick = null;
  if (isClickable) { originalClick = item.onclick; item.onclick = null; }

  let startX = 0, startY = 0, dragging = false, moved = false;

  item.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return; // left click / primary touch only
    startX = e.clientX; startY = e.clientY;
    dragging = false; moved = false;

    const onMove = ev => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > (isClickable ? 6 : 2)) {
        dragging = true; moved = true;
        item.classList.add('dragging');
      }
      if (dragging) {
        ev.preventDefault();
        const after = getNavDragAfterElement(nav, ev.clientY);
        if (after == null) { if (nav.lastElementChild !== item) nav.appendChild(item); }
        else if (after !== item) nav.insertBefore(item, after);
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (dragging) {
        item.classList.remove('dragging');
        saveNavOrder();
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });

  if (isClickable) {
    item.addEventListener('click', e => {
      if (moved) { e.preventDefault(); moved = false; return; }
      if (originalClick) originalClick.call(item, e);
    });
  }
}
function initNavDragDrop() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  nav.querySelectorAll('.nav-item').forEach(item => setupNavDraggable(item, nav, true));
  nav.querySelectorAll('.nav-sep').forEach(sep => setupNavDraggable(sep, nav, false));
}

