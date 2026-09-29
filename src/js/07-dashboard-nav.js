// ── CONSTATS (barre « Aujourd'hui ») : dérivés des vraies données, chacun mène à la page qui le détaille ──
function renderSummaryBanner() {
  const trades = analysisTrades();
  const box = document.getElementById('summary-banner'), strip = document.getElementById('today-strip');
  if (!box) return;
  const closed = trades.filter(t => ['TP','SL','BE'].includes(t.res));
  const WD_NAMES = { 0: 'dimanche', 1: 'lundi', 2: 'mardi', 3: 'mercredi', 4: 'jeudi', 5: 'vendredi', 6: 'samedi' };
  const best = map => Object.entries(map).reduce((b, [k, v]) => (b === null || v > b[1]) ? [k, v] : b, null);
  const wdMap = {}, hMap = {};
  trades.forEach(t => {
    if (t.pnl === null || t.pnl === undefined) return;
    const d = t.date ? new Date(t.date + 'T00:00:00') : null;
    if (d && !isNaN(d)) wdMap[d.getDay()] = (wdMap[d.getDay()] || 0) + t.pnl;
    const h = t.entry ? parseInt(t.entry.split(':')[0], 10) : NaN;
    if (!isNaN(h)) hMap[h] = (hMap[h] || 0) + t.pnl;
  });
  const bDow = best(wdMap), bHour = best(hMap);
  const tilt = typeof computeTiltTrades === 'function' ? computeTiltTrades().flagged : [];
  const tiltCost = tilt.reduce((s, f) => s + (f.trade.pnlEur < 0 ? Math.abs(f.trade.pnlEur) : 0), 0);
  const fmtR = v => (v >= 0 ? '+' : '') + v.toFixed(1).replace('.', ',') + 'R';
  const goBilan = "showPage('bilan', document.querySelector('.nav-item[data-page=bilan]'))";
  const goTilt = "showPage('stats', document.querySelector('.nav-item[data-page=stats]'));showStatsSubtab('behavior')";
  const chip = (icon, key, val, extra, tone, go) => html`<button class="insight" onclick="${raw(go)}"><span class="insight-ic" aria-hidden="true">${icon}</span><span class="insight-txt"><span class="insight-k">${key}</span><b>${val}</b>${extra ? html` <span class="tone-${raw(tone)}">${extra}</span>` : ''}</span></button>`;
  const chips = [];
  if (closed.length >= 5) {
    if (bDow && bDow[1] > 0) chips.push(chip('📅', 'Meilleur jour', WD_NAMES[bDow[0]], fmtR(bDow[1]), 'green', goBilan));
    if (bHour && bHour[1] > 0) chips.push(chip('🕐', "Meilleure heure d'entrée", String(bHour[0]).padStart(2, '0') + 'h', fmtR(bHour[1]), 'green', goBilan));
    if (tilt.length && tiltCost > 0) chips.push(chip('⚠️', 'Tilt', tilt.length + ' trade' + (tilt.length > 1 ? 's' : '') + ' signalé' + (tilt.length > 1 ? 's' : ''), '−' + fmtEUR(tiltCost), 'amber', goTilt));
  }
  mount(box, html`${chips}`);
  if (strip) strip.classList.toggle('no-insights', !chips.length);
}

function renderWelcomeCard() {
  const card = document.getElementById('welcome-card');
  if (!card) return;
  const dismissed = DB.getItem((JP + 'welcome_dismissed')) === '1';
  card.style.display = (!dismissed && trades.length === 0) ? 'block' : 'none';
}
function dismissWelcome() {
  DB.setItem((JP + 'welcome_dismissed'), '1');
  const card = document.getElementById('welcome-card');
  if (card) card.style.display = 'none';
}

function renderAll() {
  invalidateViews();
  DATA_VERSION++;
  // Seule la page affichée est recalculée tout de suite ; les autres le seront à leur ouverture (renderPage).
  // Chaque bloc reste isolé (safeRun) : une erreur dans un graphique n'empêche jamais le reste de s'afficher.
  renderPage(currentPage(), true);
  [updateSidebarCount, renderStorageWarning, refreshSetupList, renderFilterBar, checkExportReminder, checkImportReminder].forEach(fn => safeRun(fn, fn.name));
}

// ── NAVIGATION ───────────────────────────────────────────────────────
function initSidebarState() {
  const wide = window.matchMedia('(min-width: 861px)').matches;
  document.body.classList.toggle('sidebar-open', wide);
}
function toggleMobileSidebar() {
  document.body.classList.toggle('sidebar-open');
}
function closeMobileSidebar() {
  document.body.classList.remove('sidebar-open');
}
function showPage(id, btn) {
  if (id === 'propfirm' && JOURNAL_ID !== 'pf') { id = 'dashboard'; btn = document.querySelector('.nav-item[data-page="dashboard"]'); }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  if (window.matchMedia('(max-width: 860px)').matches) closeMobileSidebar();
  // Pages dont le contenu vit hors du journal (réglages, sauvegardes) : toujours rafraîchies à l'ouverture.
  renderPage(id, ['scaling', 'export', 'propfirm'].includes(id));
  safeRun(renderFilterBar, 'renderFilterBar');
  window.scrollTo({ top: 0 });
}

function showStatsSubtab(id) {
  document.querySelectorAll('.subtab-panel').forEach(p => p.classList.toggle('active', p.dataset.subtab === id));
  document.querySelectorAll('.subtab-btn').forEach(b => b.classList.toggle('active', b.dataset.subtab === id));
  DB.setItem((JP + 'stats_subtab'), id);
  if (id === 'analyses') { applyChartDefaults(); renderProAnalyses(); }
}
function restoreStatsSubtab() {
  const saved = DB.getItem((JP + 'stats_subtab'));
  if (saved && document.querySelector(`.subtab-panel[data-subtab="${saved}"]`)) showStatsSubtab(saved);
}

