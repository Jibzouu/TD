// ── ÉTAT CENTRAL : filtre global + rendu ciblé ───────────────────────
// Une seule source pour toutes les analyses : viewTrades() = les trades du journal passés au filtre global
// (période, actif, session, setup, sens). analysisTrades() en dérive (R non retenus masqués).
// Prop Firm, Scaling et le bandeau de drawdown du jour restent volontairement calculés sur TOUS les trades :
// une règle de challenge ne se juge pas sur un sous-ensemble.
const FILTER_DEFAULT = { period: 'all', from: '', to: '', asset: '', session: '', setup: '', dir: '' };
let FILTER = Object.assign({}, FILTER_DEFAULT, loadJSON(JP + 'global_filter', {}));
const FILTERED_PAGES = ['dashboard', 'trades', 'stats', 'calendrier', 'bilan', 'revue'];
const PERIOD_LABELS = { all: 'Tout l\'historique', '7d': '7 derniers jours', '30d': '30 derniers jours', '90d': '3 derniers mois', month: 'Mois en cours', ytd: 'Année en cours', custom: 'Période personnalisée' };

// Bornes de dates (AAAA-MM-JJ, incluses) de la période choisie ; null = pas de borne.
function filterDateRange(f) {
  f = f || FILTER;
  const today = new Date(), iso = d => localDateStr(d);
  const back = n => { const d = new Date(today); d.setDate(d.getDate() - (n - 1)); return iso(d); };
  switch (f.period) {
    case '7d': return { from: back(7), to: iso(today) };
    case '30d': return { from: back(30), to: iso(today) };
    case '90d': return { from: back(90), to: iso(today) };
    case 'month': return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today) };
    case 'ytd': return { from: today.getFullYear() + '-01-01', to: iso(today) };
    case 'custom': return { from: f.from || null, to: f.to || null };
    default: return { from: null, to: null };
  }
}
function tradeMatchesFilter(t, f) {
  f = f || FILTER;
  const r = filterDateRange(f);
  if (r.from && (!t.date || t.date < r.from)) return false;
  if (r.to && (!t.date || t.date > r.to)) return false;
  if (f.asset && t.asset !== f.asset) return false;
  if (f.session && t.session !== f.session) return false;
  if (f.setup && (t.setup || '') !== f.setup) return false;
  if (f.dir && t.dir !== f.dir) return false;
  return true;
}
function filterActive(f) { f = f || FILTER; return Object.keys(FILTER_DEFAULT).some(k => k !== 'from' && k !== 'to' && f[k] !== FILTER_DEFAULT[k]); }
function viewTrades() {
  if (!_viewCache) _viewCache = filterActive() ? trades.filter(t => tradeMatchesFilter(t)) : trades;
  return _viewCache;
}
function invalidateViews() { _viewCache = null; _atCache = null; }
// Solde au début de la période filtrée : solde de départ + P&L de tous les trades antérieurs.
function balanceBeforeFilter() {
  const r = filterDateRange();
  if (!r.from) return accountSize || 0;
  return (accountSize || 0) + trades.filter(t => t.date && t.date < r.from && t.pnlEur != null).reduce((s, t) => s + t.pnlEur, 0);
}
function setGlobalFilter(patch) {
  FILTER = Object.assign({}, FILTER, patch);
  if (FILTER.period !== 'custom') { FILTER.from = ''; FILTER.to = ''; }
  DB.setItem(JP + 'global_filter', JSON.stringify(FILTER));
  renderAll();
}
function resetGlobalFilter() { FILTER = Object.assign({}, FILTER_DEFAULT); DB.setItem(JP + 'global_filter', JSON.stringify(FILTER)); renderAll(); }

// Barre de filtres : options construites depuis les trades existants ; masquée sur les pages non filtrées.
function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  const page = currentPage();
  bar.style.display = FILTERED_PAGES.includes(page) ? '' : 'none';
  const opts = (id, values, allLabel, cur) => {
    const el = document.getElementById(id); if (!el) return;
    const list = values.includes(cur) || !cur ? values : values.concat([cur]);
    el.innerHTML = `<option value="">${allLabel}</option>` + list.map(v => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
    el.value = cur || '';
    el.classList.toggle('on', !!cur);
  };
  const uniq = key => [...new Set(trades.map(t => t[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  opts('gf-asset', uniq('asset'), 'Tous', FILTER.asset);
  opts('gf-session', uniq('session'), 'Toutes', FILTER.session);
  opts('gf-setup', typeof knownSetups === 'function' ? knownSetups() : uniq('setup'), 'Tous', FILTER.setup);
  const p = document.getElementById('gf-period'); if (p) { p.value = FILTER.period; p.classList.toggle('on', FILTER.period !== 'all'); }
  const d = document.getElementById('gf-dir'); if (d) { d.value = FILTER.dir || ''; d.classList.toggle('on', !!FILTER.dir); }
  const custom = document.getElementById('gf-custom'); if (custom) custom.style.display = FILTER.period === 'custom' ? 'inline-flex' : 'none';
  const r = filterDateRange();
  const f = document.getElementById('gf-from'), t = document.getElementById('gf-to');
  if (f && document.activeElement !== f) f.value = FILTER.period === 'custom' ? FILTER.from : (r.from || '');
  if (t && document.activeElement !== t) t.value = FILTER.period === 'custom' ? FILTER.to : (r.to || '');
  const on = filterActive(), n = viewTrades().length;
  const sum = document.getElementById('gf-summary');
  if (sum) sum.textContent = on ? n + ' trade' + (n > 1 ? 's' : '') + ' sur ' + trades.length : trades.length + ' trade' + (trades.length > 1 ? 's' : '');
  const reset = document.getElementById('gf-reset'); if (reset) reset.style.display = on ? '' : 'none';
  bar.classList.toggle('active', on);
}

// ── Rendu ciblé : seule la page affichée est recalculée ; les autres sont marquées « à redessiner »
// et le seront à l'ouverture. DATA_VERSION augmente à chaque changement de données, de filtre ou de réglage.
let DATA_VERSION = 1;
const pageRenderedVersion = {};
const PAGE_RENDERERS = {
  dashboard: () => [renderKPIs, renderKpiSparklines, renderSummaryBanner, renderWelcomeCard, renderRCoverage, applyChartDefaults, renderYearProgress, renderWinRateMeters, renderRDistribution, renderHeatmapDH, renderMonthlyReturnsTable, renderRadar, renderAssetBars, renderDDBanner],
  trades: () => [renderTable],
  stats: () => [applyChartDefaults, renderStats, restoreStatsSubtab],
  calendrier: () => [renderCalendrier],
  bilan: () => [applyChartDefaults, renderBilan],
  propfirm: () => JOURNAL_ID === 'pf' ? [applyChartDefaults, renderPropFirm] : [],
  scaling: () => [fillScalingForm, renderScalingZones, () => renderScaling({ center: true })],
  export: () => [renderTrashUI, renderBackupSettings],
  revue: () => typeof renderWeeklyReview === 'function' ? [applyChartDefaults, renderWeeklyReview] : [],
};
function currentPage() { const p = document.querySelector('.page.active'); return p ? p.id.replace('page-', '') : 'dashboard'; }
function renderPage(id, force) {
  if (!force && pageRenderedVersion[id] === DATA_VERSION) return;
  pageRenderedVersion[id] = DATA_VERSION;
  (PAGE_RENDERERS[id] ? PAGE_RENDERERS[id]() : []).forEach(fn => safeRun(fn, fn.name || id));
}
