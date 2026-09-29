// ── RECHERCHE GLOBALE (Ctrl/Cmd+K) ───────────────────────────────────
const SEARCH_PAGES = [
  { page:'dashboard', icon:'🏠', label:'Dashboard' },
  { page:'calendrier', icon:'📅', label:'Calendrier' },
  { page:'stats', icon:'📊', label:'Statistiques' },
  { page:'bilan', icon:'🕐', label:'Bilan journalier' },
  { page:'revue', icon:'🗒️', label:'Revue hebdomadaire' },
  { page:'trades', icon:'📋', label:'Journal des trades' },
  { page:'plan', icon:'📝', label:'Plan de trading' },
  { page:'watchlist', icon:'👁️', label:'Watchlist' },
  { page:'propfirm', icon:'🛡️', label:'Prop Firm' },
  { page:'scaling', icon:'📈', label:'Scaling Account' },
  { page:'export', icon:'💾', label:'Export / Import' },
  { page:'parametres', icon:'⚙️', label:'Paramètres' },
];
const SEARCH_ACTIONS = [
  { icon:'⚡', label:'Saisie rapide d\'un trade (N)', run: () => { closeGlobalSearch(); openQuickAdd(); } },
  { icon:'⌨️', label:'Raccourcis clavier (?)', run: () => { closeGlobalSearch(); openShortcutsHelp(); } },
  { icon:'➕', label:'Ajouter un trade complet', run: () => { closeGlobalSearch(); showPage('dashboard', document.querySelector('.nav-item[data-page=dashboard]')); setTimeout(() => document.getElementById('trade-form-card')?.scrollIntoView({behavior:'smooth'}), 100); } },
  { icon:'💾', label:'Exporter mes données', run: () => { closeGlobalSearch(); exportData(); } },
  { icon:'📅', label:'Aller à aujourd\'hui (Calendrier)', run: () => { closeGlobalSearch(); showPage('calendrier', document.querySelector('.nav-item[data-page=calendrier]')); calToday(); } },
  { icon:'🎨', label:'Changer de thème', run: () => { closeGlobalSearch(); showPage('parametres', document.querySelector('.nav-item[data-page=parametres]')); } },
];
Object.keys(JOURNALS).filter(k => k !== JOURNAL_ID).forEach(k => SEARCH_ACTIONS.push({ icon: '🔀', label: 'Passer au journal ' + JOURNALS[k].tab, run: () => { closeGlobalSearch(); switchJournal(k); } }));

if (JOURNAL_ID !== 'pf') { const pi = SEARCH_PAGES.findIndex(p => p.page === 'propfirm'); if (pi > -1) SEARCH_PAGES.splice(pi, 1); }

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
    cont.innerHTML = `<p style="padding:20px;text-align:center;font-size:12px;color:var(--txt3)">Aucun résultat pour "${esc(query)}"</p>`;
    return;
  }

  let html = '';
  if (pageMatches.length) {
    html += `<div class="search-group-label">Pages</div>`;
    pageMatches.forEach(p => { const i = searchCurrentItems.findIndex(x=>x.type==='page'&&x.page===p.page); html += searchItemHtml(i, p.icon, p.label, ''); });
  }
  if (actionMatches.length) {
    html += `<div class="search-group-label">Actions</div>`;
    actionMatches.forEach(a => { const i = searchCurrentItems.findIndex(x=>x.type==='action'&&x.label===a.label); html += searchItemHtml(i, a.icon, a.label, ''); });
  }
  if (tradeMatches.length) {
    html += `<div class="search-group-label">Trades</div>`;
    tradeMatches.forEach(t => {
      const i = searchCurrentItems.findIndex(x=>x.type==='trade'&&x.trade.id===t.id);
      const sub = `${t.date||''} · ${t.res||''} ${t.pnl != null?(t.pnl>=0?'+':'')+t.pnl.toFixed(1)+'R':''}`;
      html += searchItemHtml(i, '📈', t.asset||'—', sub);
    });
  }
  cont.innerHTML = html;
  updateSearchSelection();
}
function searchItemHtml(index, icon, label, sub) {
  return `<div class="search-item" data-idx="${index}" onclick="activateSearchItem(${index})">
    <span class="si-icon">${icon}</span>
    <span class="si-label">${esc(label)}</span>
    ${sub ? `<span class="si-sub">${esc(sub)}</span>` : ''}
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

