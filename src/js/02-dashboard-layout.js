// ── DASHBOARD : widgets déplaçables / redimensionnables ─────────────
// Disposition v2 (charte « Terminal pro ») : l'équité en tête, puis les analyses. L'ancienne disposition sauvegardée
// (clé dash_layout) référençait des widgets qui n'existent plus : elle est ignorée.
// Disposition v3 : trois sections titrées (Performance / Où je gagne / Comment je trade). Les titres de section sont des
// éléments de la grille comme les autres (pleine largeur, sans poignée) : les blocs peuvent être glissés de l'une à l'autre.
const DASH_WIDGET_ORDER_DEFAULT = ['sec-perf','year-progress','winrate','r-distribution','sec-where','asset-bars','monthly-returns','heatmap-dh','sec-how','radar'];
const DASH_WIDGET_DEFAULTS = {
  'year-progress':  { width: 'w-full',  h: 260, w: null },
  'winrate':        { width: 'w-half',  h: null, w: null },
  'r-distribution': { width: 'w-half',  h: 210, w: null },
  'asset-bars':     { width: 'w-half',  h: null, w: null },
  'monthly-returns':{ width: 'w-half',  h: null, w: null },
  'heatmap-dh':     { width: 'w-full',  h: null, w: null },
  'radar':          { width: 'w-full',  h: null, w: null }
};

function loadDashLayout() {
  try { return JSON.parse(DB.getItem((JP + 'dash_layout_v2')) || 'null'); } catch (e) { return null; }
}
function saveDashLayout(layout) { DB.setItem((JP + 'dash_layout_v2'), JSON.stringify(layout)); }

function getCurrentDashLayout() {
  const grid = document.getElementById('dash-grid');
  if (!grid) return null;
  const widgets = [...grid.querySelectorAll(':scope > .dash-widget')];
  const order = widgets.map(w => w.dataset.widget);
  const widths = {}, sizes = {};
  widgets.forEach(w => {
    const id = w.dataset.widget;
    widths[id] = ['w-third','w-half','w-full'].find(c => w.classList.contains(c)) || 'w-third';
    const wrap = document.getElementById('wrap-' + id) || document.getElementById(id);
    if (wrap) sizes[id] = { h: parseInt(wrap.style.height, 10) || null, w: wrap.style.width ? (parseInt(wrap.style.width, 10) || null) : null };
  });
  return { order, widths, sizes };
}
function persistDashLayout() {
  const layout = getCurrentDashLayout();
  if (layout) saveDashLayout(layout);
}
function applyDashLayout(layout) {
  const grid = document.getElementById('dash-grid');
  if (!grid || !layout) return;
  // Disposition enregistrée avant l'arrivée des sections : on garde seulement les hauteurs réglées à la main,
  // l'ordre et les largeurs repartent des nouveaux réglages par défaut (sinon des blocs resteraient orphelins).
  const legacy = !(layout.order || []).includes('sec-perf');
  const order = legacy ? DASH_WIDGET_ORDER_DEFAULT : layout.order;
  order.forEach(id => {
    const el = grid.querySelector(`.dash-widget[data-widget="${id}"]`);
    if (el) grid.appendChild(el);
  });
  Object.entries(legacy ? {} : (layout.widths || {})).forEach(([id, cls]) => {
    const el = grid.querySelector(`.dash-widget[data-widget="${id}"]`);
    if (!el) return;
    el.classList.remove('w-third','w-half','w-full');
    el.classList.add(cls);
    const sel = el.querySelector('.widget-width-select');
    if (sel) sel.value = cls;
  });
  Object.entries(layout.sizes || {}).forEach(([id, sz]) => {
    const wrap = document.getElementById('wrap-' + id) || document.getElementById(id);
    if (!wrap) return;
    if (sz.h) wrap.style.height = sz.h + 'px';
    if (sz.w && wrap.style.width) wrap.style.width = sz.w + 'px';
  });
}
function initDashLayoutDefaults() {
  document.querySelectorAll('#dash-grid .widget-width-select').forEach(sel => {
    const widget = sel.closest('.dash-widget');
    if (widget) sel.value = ['w-third','w-half','w-full'].find(c => widget.classList.contains(c)) || 'w-third';
  });
}
function setWidgetWidth(widgetId, widthClass) {
  const grid = document.getElementById('dash-grid');
  const el = grid && grid.querySelector(`.dash-widget[data-widget="${widgetId}"]`);
  if (!el) return;
  el.classList.remove('w-third','w-half','w-full');
  el.classList.add(widthClass);
  persistDashLayout();
}
function resetDashboardLayout() {
  DB.removeItem((JP + 'dash_layout_v2'));
  const grid = document.getElementById('dash-grid');
  if (!grid) return;
  DASH_WIDGET_ORDER_DEFAULT.forEach(id => {
    const el = grid.querySelector(`.dash-widget[data-widget="${id}"]`);
    if (el) grid.appendChild(el);
  });
  Object.entries(DASH_WIDGET_DEFAULTS).forEach(([id, def]) => {
    const el = grid.querySelector(`.dash-widget[data-widget="${id}"]`);
    if (el) {
      el.classList.remove('w-third','w-half','w-full');
      el.classList.add(def.width);
      const sel = el.querySelector('.widget-width-select');
      if (sel) sel.value = def.width;
    }
    const wrap = document.getElementById('wrap-' + id) || document.getElementById(id);
    if (wrap) {
      if (def.h) wrap.style.height = def.h + 'px';
      if (def.w) wrap.style.width = def.w + 'px';
    }
  });
  showToast('Disposition réinitialisée', 'success');
}

function getDashDropTarget(container, x, y) {
  const items = [...container.querySelectorAll(':scope > .dash-widget:not(.dragging)')];
  let closest = null, closestDist = Infinity;
  items.forEach(item => {
    const rect = item.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    const dist = Math.hypot(x-cx, y-cy);
    if (dist < closestDist) { closestDist = dist; closest = item; }
  });
  if (!closest) return null;
  const rect = closest.getBoundingClientRect();
  return { closest, before: x < rect.left + rect.width/2 };
}
function initDashWidgetDrag() {
  const grid = document.getElementById('dash-grid');
  if (!grid) return;
  grid.querySelectorAll('.widget-grip').forEach(grip => {
    if (grip.dataset.dragInit) return;
    grip.dataset.dragInit = '1';
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      const widget = grip.closest('.dash-widget');
      if (!widget) return;
      widget.classList.add('dragging');
      function onMove(ev) {
        const target = getDashDropTarget(grid, ev.clientX, ev.clientY);
        if (target && target.closest !== widget) {
          if (target.before) grid.insertBefore(widget, target.closest);
          else grid.insertBefore(widget, target.closest.nextSibling);
        }
      }
      function onUp() {
        widget.classList.remove('dragging');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        persistDashLayout();
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}
function initDashWidgetResize() {
  const grid = document.getElementById('dash-grid');
  if (!grid) return;
  grid.querySelectorAll('.widget-resize-handle').forEach(handle => {
    if (handle.dataset.dragInit) return;
    handle.dataset.dragInit = '1';
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      const widget = handle.closest('.dash-widget');
      const widgetId = widget && widget.dataset.widget;
      const wrap = widgetId ? (document.getElementById('wrap-' + widgetId) || document.getElementById(widgetId)) : null;
      if (!wrap) return;
      widget.classList.add('resizing');
      const startX = e.clientX, startY = e.clientY;
      const startRect = wrap.getBoundingClientRect();
      const hasFixedWidth = !!wrap.style.width;
      function onMove(ev) {
        const newH = Math.max(90, startRect.height + (ev.clientY - startY));
        wrap.style.height = newH + 'px';
        if (hasFixedWidth) {
          const newW = Math.max(90, startRect.width + (ev.clientX - startX));
          wrap.style.width = newW + 'px';
        }
      }
      function onUp() {
        widget.classList.remove('resizing');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        persistDashLayout();
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}
function initDashboardLayout() {
  const grid = document.getElementById('dash-grid');
  if (!grid) return;
  const saved = loadDashLayout();
  if (saved) applyDashLayout(saved);
  initDashLayoutDefaults();   // aligne les sélecteurs de largeur sur la disposition réelle
  initDashWidgetDrag();
  initDashWidgetResize();
}

let yearProgressChartInst = null;
let rDistChartInst = null;

