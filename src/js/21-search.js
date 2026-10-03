// ── RECHERCHE GLOBALE (Ctrl/Cmd+K) ───────────────────────────────────
const SEARCH_PAGES = [
  { page:'dashboard', icon:'🏠' },
  { page:'calendrier', icon:'📅' },
  { page:'stats', icon:'📊' },
  { page:'bilan', icon:'🕐' },
  { page:'revue', icon:'🗒️', key:'nav.revue_long' },
  { page:'trades', icon:'📋' },
  { page:'plan', icon:'📝' },
  { page:'playbooks', icon:'📘' },
  { page:'replay', icon:'🕹️' },
  { page:'watchlist', icon:'👁️' },
  { page:'propfirm', icon:'🛡️' },
  { page:'scaling', icon:'📈' },
  { page:'export', icon:'💾' },
  { page:'parametres', icon:'⚙️' },
].map(p => Object.assign(p, { label: t(p.key || 'nav.' + p.page) }));
const SEARCH_ACTIONS = [
  { icon:'⚡', label:'Saisie rapide d\'un trade (N)', run: () => { closeGlobalSearch(); openQuickAdd(); } },
  { icon:'⌨️', label:'Raccourcis clavier (?)', run: () => { closeGlobalSearch(); openShortcutsHelp(); } },
  { icon:'➕', label:'Ajouter un trade complet', run: () => { closeGlobalSearch(); openTradePanel(); } },
  { icon:'💾', label:'Exporter mes données', run: () => { closeGlobalSearch(); exportData(); } },
  { icon:'📅', label:'Aller à aujourd\'hui (Calendrier)', run: () => { closeGlobalSearch(); showPage('calendrier', document.querySelector('.nav-item[data-page=calendrier]')); calToday(); } },
  { icon:'🎨', label:'Changer de thème', run: () => { closeGlobalSearch(); showPage('parametres', document.querySelector('.nav-item[data-page=parametres]')); } },
];
Object.keys(JOURNALS).filter(k => k !== JOURNAL_ID).forEach(k => SEARCH_ACTIONS.push({ icon: '🔀', label: 'Passer au compte ' + JOURNALS[k].tab, run: () => { closeGlobalSearch(); switchJournal(k); } }));

if (!IS_PROPFIRM) { const pi = SEARCH_PAGES.findIndex(p => p.page === 'propfirm'); if (pi > -1) SEARCH_PAGES.splice(pi, 1); }
if (JOURNAL_TYPE !== 'backtest') { const ri = SEARCH_PAGES.findIndex(p => p.page === 'replay'); if (ri > -1) SEARCH_PAGES.splice(ri, 1); }

let searchSelectedIndex = 0;
let searchCurrentItems = [];

function openGlobalSearch() {
  const overlay = document.getElementById('search-overlay');
  const input = document.getElementById('search-input');
  if (!overlay || !input) return;
  if (!overlay.classList.contains('show')) rememberFocus();
  overlay.classList.add('show');
  input.value = '';
  renderGlobalSearchResults('');
  setTimeout(() => input.focus(), 50);
}
function closeGlobalSearch() {
  const overlay = document.getElementById('search-overlay');
  if (!overlay || !overlay.classList.contains('show')) return;
  overlay.classList.remove('show');
  restoreFocus();
}
function toggleGlobalSearch() {
  const overlay = document.getElementById('search-overlay');
  if (overlay && overlay.classList.contains('show')) closeGlobalSearch();
  else openGlobalSearch();
}

function renderGlobalSearchResults(query) {
  const q = query.trim().toLowerCase();
  const cont = document.getElementById('search-results');
  if (!cont) return;

  const pageMatches = SEARCH_PAGES.filter(p => !q || p.label.toLowerCase().includes(q));
  const actionMatches = SEARCH_ACTIONS.filter(a => !q || a.label.toLowerCase().includes(q));
  let tradeMatches = [];
  if (q.length >= 2) {
    tradeMatches = trades.filter(t => {
      const hay = [t.asset, t.desc, t.date, t.session, t.dir].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).slice(0, 8);
  }

  searchCurrentItems = [
    ...pageMatches.map(p => ({ type:'page', ...p })),
    ...actionMatches.map(a => ({ type:'action', ...a })),
    ...tradeMatches.map(t => ({ type:'trade', trade:t })),
  ];
  searchSelectedIndex = 0;

  if (!searchCurrentItems.length) {
    mount(cont, html`<p class="search-empty">Aucun résultat pour "${query}"</p>`);
    return;
  }

  const idx = pred => searchCurrentItems.findIndex(pred);
  mount(cont, html`${pageMatches.length ? html`<div class="search-group-label">Pages</div>${pageMatches.map(p => searchItemHtml(idx(x => x.type === 'page' && x.page === p.page), p.icon, p.label, ''))}` : ''}${actionMatches.length ? html`<div class="search-group-label">Actions</div>${actionMatches.map(a => searchItemHtml(idx(x => x.type === 'action' && x.label === a.label), a.icon, a.label, ''))}` : ''}${tradeMatches.length ? html`<div class="search-group-label">Trades</div>${tradeMatches.map(t => searchItemHtml(idx(x => x.type === 'trade' && x.trade.id === t.id), '📈', t.asset || '—', `${t.date || ''} · ${t.res || ''} ${t.pnl != null ? (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(1) + 'R' : ''}`))}` : ''}`);
  updateSearchSelection();
}
function searchItemHtml(index, icon, label, sub) {
  return html`<div class="search-item" data-idx="${index}" onclick="activateSearchItem(${raw(index)})">
    <span class="si-icon">${icon}</span>
    <span class="si-label">${label}</span>
    ${sub ? html`<span class="si-sub">${sub}</span>` : ''}
  </div>`;
}
function updateSearchSelection() {
  document.querySelectorAll('.search-item').forEach(el => {
    el.classList.toggle('selected', parseInt(el.dataset.idx,10) === searchSelectedIndex);
  });
  const sel = document.querySelector('.search-item.selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}
function activateSearchItem(index) {
  const item = searchCurrentItems[index];
  if (!item) return;
  if (item.type === 'page') {
    closeGlobalSearch();
    showPage(item.page, document.querySelector(`.nav-item[data-page=${item.page}]`));
  } else if (item.type === 'action') {
    item.run();
  } else if (item.type === 'trade') {
    closeGlobalSearch();
    showPage('trades', document.querySelector('.nav-item[data-page=trades]'));
    setTimeout(() => openTradeDetail(item.trade.id), 150);
  }
}
onReady(() => {
  const input = document.getElementById('search-input');
  if (input) {
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); searchSelectedIndex = Math.min(searchSelectedIndex+1, searchCurrentItems.length-1); updateSearchSelection(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); searchSelectedIndex = Math.max(searchSelectedIndex-1, 0); updateSearchSelection(); }
      else if (e.key === 'Enter') { e.preventDefault(); activateSearchItem(searchSelectedIndex); }
    });
  }
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    toggleGlobalSearch();
  }
});

