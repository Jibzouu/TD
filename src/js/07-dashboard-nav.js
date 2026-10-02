// ── CONSTATS (barre « Aujourd'hui ») : dérivés des vraies données, chacun mène à la page qui le détaille ──
function renderSummaryBanner() {
  const trades = analysisTrades();
  const box = document.getElementById('summary-banner'), strip = document.getElementById('today-strip');
  if (!box) return;
  const closed = trades.filter(t => ['TP','SL','BE'].includes(t.res));
  const WD_NAMES = { 0: 'dimanche', 1: 'lundi', 2: 'mardi', 3: 'mercredi', 4: 'jeudi', 5: 'vendredi', 6: 'samedi' };
  // Cumul sur TOUT l'historique filtré (tous les mardis, toutes les entrées à 13h…) : gains ET pertes, en R signé.
  const agg = () => ({ net: 0, win: 0, loss: 0, n: 0, days: new Set() });
  const wdMap = {}, hMap = {};
  trades.forEach(t => {
    if (t.pnl === null || t.pnl === undefined || !['TP', 'SL', 'BE'].includes(t.res)) return;
    const add = (map, k) => { const g = map[k] = map[k] || agg(); g.net += t.pnl; g.n++; g.days.add(t.date); if (t.pnl > 0) g.win += t.pnl; else g.loss += t.pnl; };
    const d = t.date ? new Date(t.date + 'T00:00:00') : null;
    if (d && !isNaN(d)) add(wdMap, d.getDay());
    const h = t.entry ? parseInt(t.entry.split(':')[0], 10) : NaN;
    if (!isNaN(h)) add(hMap, h);
  });
  const best = map => Object.entries(map).reduce((b, e) => (b === null || e[1].net > b[1].net) ? e : b, null);
  const bDow = best(wdMap), bHour = best(hMap);
  const tilt = typeof computeTiltTrades === 'function' ? computeTiltTrades().flagged : [];
  const tiltCost = tilt.reduce((s, f) => s + (f.trade.pnlEur < 0 ? Math.abs(f.trade.pnlEur) : 0), 0);
  const fmtR1 = v => fmtR(v, 1);
  const detail = g => fmtR1(g.win) + ' de gains ' + fmtR1(g.loss).replace('+', '') + ' de pertes = ' + fmtR1(g.net) + ' · ' + g.n + ' trade' + (g.n > 1 ? 's' : '');
  const goBilan = "showPage('bilan', document.querySelector('.nav-item[data-page=bilan]'))";
  const goTilt = "showPage('stats', document.querySelector('.nav-item[data-page=stats]'));showStatsSubtab('behavior')";
  const chip = (icon, key, val, extra, tone, go, note, title) => html`<button class="insight" onclick="${raw(go)}"${raw(title ? ` title="${esc(title)}"` : '')}><span class="insight-ic" aria-hidden="true">${icon}</span><span class="insight-txt"><span class="insight-k">${key}</span><b>${val}</b>${extra ? html` <span class="tone-${raw(tone)}">${extra}</span>` : ''}${note ? html` <span class="insight-note">${note}</span>` : ''}</span></button>`;
  const chips = [];
  if (closed.length >= 5) {
    if (bDow && bDow[1].net > 0) {
      const g = bDow[1], nd = g.days.size, day = WD_NAMES[bDow[0]];
      chips.push(chip('📅', 'Meilleur jour', day, fmtR1(g.net), 'green', goBilan, 'cumul de ' + nd + ' ' + day + (nd > 1 ? 's' : ''), 'Tous tes ' + day + 's réunis (' + nd + ' journée' + (nd > 1 ? 's' : '') + ') : ' + detail(g)));
    }
    if (bHour && bHour[1].net > 0) {
      const g = bHour[1], hh = String(bHour[0]).padStart(2, '0') + 'h';
      chips.push(chip('🕐', "Meilleure heure d'entrée", hh, fmtR1(g.net), 'green', goBilan, 'sur ' + g.n + ' trade' + (g.n > 1 ? 's' : ''), 'Trades entrés entre ' + hh + ' et ' + String((+bHour[0] + 1) % 24).padStart(2, '0') + 'h : ' + detail(g)));
    }
    if (tilt.length && tiltCost > 0) chips.push(chip('⚠️', 'Tilt', tilt.length + ' trade' + (tilt.length > 1 ? 's' : '') + ' signalé' + (tilt.length > 1 ? 's' : ''), '−' + fmtEUR(tiltCost), 'amber', goTilt, '', 'Ré-entrées rapides ou taille augmentée juste après une perte'));
  }
  if (typeof scalingInsightChips === 'function') chips.push(...scalingInsightChips(chip));
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
  renderPage(id, ['scaling', 'export', 'propfirm', 'plan', 'watchlist'].includes(id));
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

