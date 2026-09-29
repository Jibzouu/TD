// ── BANDEAU DE RÉSUMÉ (dérivé des vraies données, vérifiable) ───────
function renderSummaryBanner() {
  const trades = analysisTrades();
  const banner = document.getElementById('summary-banner');
  const textEl = document.getElementById('summary-banner-text');
  if (!banner || !textEl) return;
  const closed = trades.filter(t => ['TP','SL','BE'].includes(t.res));
  if (closed.length < 5) { banner.style.display = 'none'; return; }

  const eurArr = trades.filter(t => t.pnlEur !== null && t.pnlEur !== undefined);
  const totalEur = eurArr.reduce((s,t) => s+t.pnlEur, 0);

  const WD_NAMES = {0:'dimanche',1:'lundi',2:'mardi',3:'mercredi',4:'jeudi',5:'vendredi',6:'samedi'};
  const wdMap = {};
  trades.forEach(t => {
    if (!t.date || t.pnl === null || t.pnl === undefined) return;
    const d = new Date(t.date + 'T00:00:00');
    if (isNaN(d)) return;
    const dow = d.getDay();
    wdMap[dow] = (wdMap[dow] || 0) + t.pnl;
  });
  let bestDow = null, bestDowVal = -Infinity;
  Object.entries(wdMap).forEach(([dow,v]) => { if (v > bestDowVal) { bestDowVal = v; bestDow = dow; } });

  const hMap = {};
  trades.forEach(t => {
    if (!t.entry || t.pnl === null || t.pnl === undefined) return;
    const h = parseInt(t.entry.split(':')[0], 10);
    if (isNaN(h)) return;
    hMap[h] = (hMap[h] || 0) + t.pnl;
  });
  let bestHour = null, bestHourVal = -Infinity;
  Object.entries(hMap).forEach(([h,v]) => { if (v > bestHourVal) { bestHourVal = v; bestHour = h; } });

  let tiltCost = 0, tiltCount = 0;
  if (typeof computeTiltTrades === 'function') {
    const { flagged } = computeTiltTrades();
    tiltCount = flagged.length;
    tiltCost = flagged.reduce((s,f) => s + (f.trade.pnlEur < 0 ? Math.abs(f.trade.pnlEur) : 0), 0);
  }

  const goToBilan = `event.preventDefault();showPage('bilan', document.querySelector('.nav-item[onclick*=bilan]'))`;
  const goToStats = `event.preventDefault();showPage('stats', document.querySelector('.nav-item[onclick*=stats]'))`;
  const linkStyle = 'text-decoration:underline;cursor:pointer';

  const parts = [];
  const eurTxt = fmtEUR(totalEur, true);
  parts.push(`Tu es <strong style="color:${totalEur>=0?'var(--green)':'var(--red)'}">${eurTxt}</strong> sur l'ensemble de ton historique (${trades.length} trades).`);
  if (bestDow !== null && bestDowVal > 0) {
    parts.push(`Ton meilleur jour est le <a onclick="${goToBilan}" style="${linkStyle};color:var(--blue)">${WD_NAMES[bestDow]}</a> (${bestDowVal>=0?'+':''}${bestDowVal.toFixed(1)}R cumulé).`);
  }
  if (bestHour !== null && bestHourVal > 0) {
    parts.push(`Ta meilleure heure d'entrée est <a onclick="${goToBilan}" style="${linkStyle};color:var(--blue)">${String(bestHour).padStart(2,'0')}h</a>.`);
  }
  if (tiltCount > 0 && tiltCost > 0) {
    parts.push(`<a onclick="${goToStats}" style="${linkStyle};color:var(--amber)">${tiltCount} trade(s) signalé(s) par le Tilt Meter</a> t'ont coûté environ ${tiltCost.toFixed(0)} €.`);
  }

  textEl.innerHTML = parts.join(' ');
  banner.style.display = 'block';
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

