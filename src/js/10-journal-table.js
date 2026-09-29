// ── TABLE ────────────────────────────────────────────────────────────
// ── FILTRES / TRI / GROUPEMENT ──────────────────────────────────────
let tableSortKey = null, tableSortDir = 1;
let groupByDayMode = false;

function filterTrades() {
  const trades = viewTrades();   // vue filtrée (filtre global), puis filtres propres au tableau
  const filterRes = document.getElementById('filter-res')?.value || '';
  const filterAsset = document.getElementById('filter-asset')?.value || '';
  const filterSession = document.getElementById('filter-session')?.value || '';
  const dateFrom = document.getElementById('filter-date-from')?.value || '';
  const dateTo = document.getElementById('filter-date-to')?.value || '';
  const search = (document.getElementById('filter-search')?.value || '').toLowerCase().trim();

  return trades.filter(t => {
    if (filterRes && t.res !== filterRes) return false;
    if (filterAsset && t.asset !== filterAsset) return false;
    if (filterSession && t.session !== filterSession) return false;
    if (dateFrom && t.date && t.date < dateFrom) return false;
    if (dateTo && t.date && t.date > dateTo) return false;
    if (search) {
      const hay = [t.asset, t.desc, t.dir, t.session, ...(Array.isArray(t.mistakes) ? t.mistakes : [])].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function sortTable(key) {
  if (tableSortKey === key) tableSortDir *= -1; else { tableSortKey = key; tableSortDir = 1; }
  renderTable();
}
function toggleGroupByDay() {
  groupByDayMode = !groupByDayMode;
  const btn = document.getElementById('btn-group-day');
  if (btn) btn.classList.toggle('style-btn-active', groupByDayMode);
  renderTable();
}
function resetTradeFilters() {
  ['filter-search', 'filter-date-from', 'filter-date-to'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['filter-res', 'filter-asset', 'filter-session'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderTable();
}

function tradeRowHtml(t, num) {
  const rsrc = rSource(t), approx = (rsrc === 'risque' || rsrc === 'defaut') ? '≈' : '';
  const nImg = tradeImages(t).length;
  const id = raw(t.id);
  return String(html`<tr class="trade-row" tabindex="0" onclick="openTradeDetail(${id})" onkeydown="if(event.key==='Enter'){openTradeDetail(${id})}" aria-label="Trade du ${t.date || '—'} sur ${t.asset || '—'}">
    <td class="muted-num">${num}</td>
    <td>${t.date || '—'}</td>
    <td><span class="row-asset">${t.asset || '—'}</span>${t.setup ? html`<span class="row-setup">${t.setup}</span>` : ''}</td>
    <td>${t.dir ? html`<span class="badge ${raw(t.dir === 'Long' ? 'b-long' : 'b-short')}">${t.dir}</span>` : '—'}</td>
    <td>${UI.badgeRes(t.res)}</td>
    <td>${t.rr ? t.rr + 'R' : '—'}</td>
    <td title="${R_SRC_LABELS[rsrc]}">${t.pnl != null ? html`${approx}${UI.pnl(t.pnl, 'R')}` : '—'}</td>
    <td>${UI.pnl(t.pnlEur, '€')}</td>
    <td class="row-icons">${nImg ? html`<span title="${nImg} capture(s)">📷${nImg > 1 ? nImg : ''}</span>` : ''}${Array.isArray(t.tags) && t.tags.length ? html` <span title="${t.tags.map(x => '#' + x).join(' ')}">#</span>` : ''}${t.review ? html` <span title="Note après coup">✎</span>` : ''}${t.emotion ? html` <span title="Humeur ${t.emotion}/5" style="color:${raw(t.emotion >= 4 ? 'var(--green)' : t.emotion >= 3 ? 'var(--amber)' : 'var(--red)')}">●</span>` : ''}</td>
    <td><button class="del-btn row-del" onclick="event.stopPropagation();deleteTrade(${id})" title="Supprimer" aria-label="Supprimer ce trade">×</button></td>
  </tr>`);
}

function renderTable() {
  let filtered = filterTrades();

  const tbody = document.getElementById('tbody');
  const count = document.getElementById('tbl-count');
  if (count) count.textContent = filtered.length + ' trade' + (filtered.length !== 1 ? 's' : '');

  // Stable trade numbers (oldest = #1), independent of current sort/filter.
  const chronological = [...trades].reverse();
  const numberMap = new Map();
  chronological.forEach((t, i) => numberMap.set(t.id, i + 1));

  const sub = document.getElementById('trades-subtitle');
  if (sub) sub.textContent = trades.length + ' trade' + (trades.length !== 1 ? 's' : '') + ' enregistré' + (trades.length !== 1 ? 's' : '') + (filterActive() ? ' · ' + viewTrades().length + ' dans le filtre global' : '') + ' · clique une ligne pour ouvrir la fiche (← → pour naviguer)';

  // Mini-statistiques de la sélection affichée.
  const miniEl = document.getElementById('trades-minibar');
  if (miniEl) {
    if (filtered.length === 0) {
      miniEl.innerHTML = '';
    } else {
      const W = winStats(filtered), be = breakevenWinRate(filtered);
      const an = analysisTrades(), ids = new Set(filtered.map(t => t.id));
      const totalR = an.filter(t => ids.has(t.id) && t.pnl != null).reduce((s, t) => s + t.pnl, 0);
      const eurArr = filtered.filter(t => t.pnlEur != null);
      const totalEur = eurArr.reduce((s, t) => s + t.pnlEur, 0);
      mount(miniEl, html`
        ${UI.stat('Trades', String(filtered.length), { compact: true })}
        ${UI.stat('Win rate', W.n ? (W.rate * 100).toFixed(0) + ' %' : '—', { compact: true, color: !W.n || be === null ? null : (W.rate >= be ? 'var(--green)' : 'var(--red)'), sub: be !== null && W.n ? 'seuil ' + Math.round(be * 100) + ' %' : '' })}
        ${UI.stat('P&L (R)', (totalR >= 0 ? '+' : '') + totalR.toFixed(1) + 'R', { compact: true, color: totalR >= 0 ? 'var(--green)' : 'var(--red)' })}
        ${UI.stat('P&L (€)', eurArr.length ? fmtEUR(totalEur, true) : '—', { compact: true, color: totalEur >= 0 ? 'var(--green)' : 'var(--red)' })}`);
    }
  }

  // Sort-arrow indicators.
  document.querySelectorAll('th.sortable').forEach(th => {
    const key = th.dataset.sort;
    th.classList.toggle('sorted', key === tableSortKey);
    const arrow = th.querySelector('.sort-arrow');
    if (arrow) arrow.textContent = (key === tableSortKey) ? (tableSortDir === 1 ? '▾' : '▴') : '▾';
  });

  if (!filtered.length) {
    const hasAnyTrades = trades.length > 0;
    tbody.innerHTML = String(html`<tr class="empty-row"><td colspan="10">${hasAnyTrades
      ? UI.empty('🔎', 'Aucun trade ne correspond', 'Élargis la période ou retire un filtre (barre du haut ou filtres du tableau).', { label: 'Effacer tous les filtres', onclick: 'resetTradeFilters();resetGlobalFilter()' })
      : UI.empty('📒', 'Ton journal est vide pour l\'instant', 'Ajoute ton premier trade (touche N) ou importe un CSV TradingView depuis Export / Import.', { label: '+ Ajouter un trade', onclick: 'openQuickAdd()' })}</td></tr>`);
    drawerOrder = [];
    return;
  }

  if (tableSortKey) {
    filtered = filtered.slice().sort((a,b) => {
      let av = a[tableSortKey], bv = b[tableSortKey];
      if (tableSortKey === 'date') { av = av || ''; bv = bv || ''; }
      else { av = (av===null||av===undefined) ? -Infinity : av; bv = (bv===null||bv===undefined) ? -Infinity : bv; }
      if (av < bv) return -1 * tableSortDir;
      if (av > bv) return 1 * tableSortDir;
      return 0;
    });
  }

  if (groupByDayMode) {
    const byDay = {};
    filtered.forEach(t => { const d = t.date || 'Sans date'; (byDay[d] = byDay[d] || []).push(t); });
    const dayKeys = Object.keys(byDay).sort((a,b) => b.localeCompare(a));
    tbody.innerHTML = dayKeys.map(day => {
      const dayTrades = byDay[day];
      const dayR = dayTrades.reduce((s,t) => s+(t.pnl||0), 0);
      const dayEur = dayTrades.filter(t=>t.pnlEur!==null&&t.pnlEur!==undefined).reduce((s,t)=>s+t.pnlEur, 0);
      const col = dayR >= 0 ? 'var(--green)' : 'var(--red)';
      const header = `<tr class="day-group-row"><td colspan="10" style="color:${col}">${day} — ${dayTrades.length} trade(s) · ${dayR>=0?'+':''}${dayR.toFixed(1)}R · ${fmtEUR(dayEur, true)}</td></tr>`;
      return header + dayTrades.map(t => tradeRowHtml(t, numberMap.get(t.id))).join('');
    }).join('');
  } else {
    tbody.innerHTML = filtered.map(t => tradeRowHtml(t, numberMap.get(t.id))).join('');
  }
  drawerOrder = groupByDayMode ? Object.keys(filtered.reduce((m, t) => ((m[t.date || 'Sans date'] = 1), m), {})).sort((a, b) => b.localeCompare(a)).flatMap(d => filtered.filter(t => (t.date || 'Sans date') === d).map(t => t.id)) : filtered.map(t => t.id);
}

// ── FICHE D'UN TRADE (tiroir latéral) ────────────────────────────────
// Navigation ←/→ dans l'ordre affiché par le tableau (filtres et tri compris), captures en galerie annotable,
// profil du trade (SL / entrée / sortie / TP, excursions MAE-MFE), tags, et note « après coup » modifiable sur place.
let drawerOrder = [];          // ids dans l'ordre du dernier tableau affiché
let drawerTradeId = null;
function drawerNavList() { return drawerOrder.length ? drawerOrder : viewTrades().map(t => t.id); }
function stepTradeDetail(d) {
  const list = drawerNavList(), i = list.indexOf(drawerTradeId);
  if (i < 0) return;
  const n = i + d;
  if (n >= 0 && n < list.length) openTradeDetail(list[n]);
}
// Profil du trade : où se situent entrée, sortie, stop et objectif (en prix), ou excursions MAE/MFE (en €).
// Repères du profil : triés par position, étiquettes alternées dessus/dessous, bords recalés pour ne jamais déborder.
function tpMarks(marks) {
  return [...marks].sort((a, b) => a[3] - b[3]).map((m, i) => {
    const cls = 'tp-mark' + (i % 2 ? ' up' : '') + (m[3] < 12 ? ' edge-l' : m[3] > 88 ? ' edge-r' : '');
    return html`<div class="${cls}" style="left:${raw(m[3])}%;--c:${raw(m[2])}"><span class="tp-lbl">${m[0]}<b>${m[1]}</b></span></div>`;
  });
}
function tradeProfileHtml(t) {
  const pts = [['SL', t.slPrice, 'var(--red)'], ['Entrée', t.entryPrice, 'var(--txt2)'], ['Sortie', t.exitPrice, 'var(--accent)'], ['TP', t.tpPrice, 'var(--green)']].filter(p => p[1] != null && isFinite(p[1]));
  if (pts.length >= 2 && t.entryPrice != null) {
    const vals = pts.map(p => p[1]), lo = Math.min(...vals), hi = Math.max(...vals), span = (hi - lo) || 1;
    const x = v => ((v - lo) / span * 92 + 4).toFixed(1);
    const short = t.dir === 'Short';
    const planned = t.slPrice != null && t.tpPrice != null && Math.abs(t.entryPrice - t.slPrice) > 0 ? Math.abs(t.tpPrice - t.entryPrice) / Math.abs(t.entryPrice - t.slPrice) : null;
    const done = computeDistanceR(t.entryPrice, t.slPrice, t.exitPrice, t.dir);
    return html`<div class="tp-profile" role="img" aria-label="Profil du trade : ${pts.map(p => p[0] + ' ' + p[1]).join(', ')}">
      <div class="tp-track">${t.exitPrice != null ? raw(`<div class="tp-move" style="left:${Math.min(x(t.entryPrice), x(t.exitPrice))}%;width:${Math.abs(x(t.exitPrice) - x(t.entryPrice))}%;background:${(short ? t.exitPrice < t.entryPrice : t.exitPrice > t.entryPrice) ? 'var(--green)' : 'var(--red)'}"></div>`) : ''}
      ${tpMarks(pts.map(p => [p[0], p[1], p[2], x(p[1])]))}</div>
      <div class="tp-foot"><span>${short ? 'Short ↓' : 'Long ↑'}</span><span>R visé ${planned != null ? planned.toFixed(2) + 'R' : '—'} · R réalisé ${done != null ? (done >= 0 ? '+' : '') + done.toFixed(2) + 'R' : '—'}${planned && done != null ? html` · <b>${Math.round(done / planned * 100)} %</b> de l'objectif` : ''}</span></div>
    </div>`;
  }
  if (t.mfe != null || t.mae != null) {
    const mae = -(Math.abs(t.mae) || 0), mfe = Math.abs(t.mfe) || 0, res = t.pnlEur || 0;
    const lo = Math.min(mae, res, 0), hi = Math.max(mfe, res, 0), span = (hi - lo) || 1, x = v => ((v - lo) / span * 92 + 4).toFixed(1);
    return html`<div class="tp-profile"><div class="tp-track">
      <div class="tp-move" style="left:${raw(x(mae))}%;width:${raw((x(mfe) - x(mae)).toFixed(1))}%;background:color-mix(in srgb,var(--txt3) 35%,transparent)"></div>
      ${tpMarks([['MAE', fmtEUR(mae), 'var(--red)', x(mae)], ['Entrée', '0 €', 'var(--txt2)', x(0)], ['Sortie', fmtEUR(res, true), 'var(--accent)', x(res)], ['MFE', fmtEUR(mfe, true), 'var(--green)', x(mfe)]])}
    </div><div class="tp-foot"><span>Excursions pendant le trade</span><span>${mfe > 0 ? html`Capturé <b>${Math.max(0, Math.round(res / mfe * 100))} %</b> du mouvement favorable` : ''}</span></div></div>`;
  }
  return html`<div class="ui-muted">Renseigne les prix (entrée, stop, objectif, sortie) pour voir le profil du trade.</div>`;
}
function tradeDuration(t) {
  const m = s => { const [h, mm] = String(s || '').split(':').map(Number); return isNaN(h) || isNaN(mm) ? null : h * 60 + mm; };
  const a = m(t.entry), b = m(t.exit); if (a === null || b === null || b < a) return '—';
  const d = b - a; return d >= 60 ? Math.floor(d / 60) + ' h ' + String(d % 60).padStart(2, '0') : d + ' min';
}
function openTradeDetail(id) {
  const t = trades.find(x => x.id === id);
  if (!t) return;
  drawerTradeId = id;
  const list = drawerNavList(), pos = list.indexOf(id);
  const imgs = tradeImages(t);
  const rMethod = ({
    prix: ['📐 R calculé par distance de prix (exact)', 'var(--green)'], manuel: ['✍️ R saisi', 'var(--green)'],
    risque: ['💶 R estimé : P&L € ÷ risque configuré (' + DEFAULT_RISK_EUR + ' €)', 'var(--blue)'],
    defaut: ['⚠️ R FICTIF : RR par défaut, aucune base réelle (exclu des stats en R)', 'var(--amber)'], aucun: ['Pas de R', 'var(--txt3)']
  })[rSource(t)];
  const quality = t.rr ? (t.rr >= 3 ? 'A+' : t.rr >= 2 ? 'A' : t.rr >= 1.5 ? 'B' : 'C') : '—';
  const checked = tradeChecklistLabels(t);
  const body = html`
    <div class="dw-head">
      <div>
        <div class="dw-meta">${fmtDateFR(t.date, true)}${t.tf ? ' · ' + t.tf : ''}${t.session ? ' · ' + t.session : ''}</div>
        <h2 class="dw-title" id="dw-title">${t.asset || '—'} ${t.dir ? html`<span class="badge ${raw(t.dir === 'Long' ? 'b-long' : 'b-short')}">${t.dir}</span>` : ''} ${UI.badgeRes(t.res)}</h2>
        ${t.setup ? html`<div class="dw-setup">Setup : <b>${t.setup}</b></div>` : ''}
      </div>
      <div class="dw-nav">
        <button class="btn-ghost" onclick="stepTradeDetail(-1)" ${raw(pos <= 0 ? 'disabled' : '')} aria-label="Trade précédent" title="Trade précédent (←)">←</button>
        <span class="dw-pos">${pos >= 0 ? (pos + 1) + ' / ' + list.length : ''}</span>
        <button class="btn-ghost" onclick="stepTradeDetail(1)" ${raw(pos < 0 || pos >= list.length - 1 ? 'disabled' : '')} aria-label="Trade suivant" title="Trade suivant (→)">→</button>
        <button class="btn-ghost" onclick="closeTradeDetail()" aria-label="Fermer la fiche">✕</button>
      </div>
    </div>
    <div class="dw-rsrc" style="color:${raw(rMethod[1])}">${rMethod[0]}</div>
    <div class="dw-stats">
      ${UI.stat('P&L', UI.pnl(t.pnlEur, '€'))}
      ${UI.stat('Résultat en R', UI.pnl(t.pnl, 'R'))}
      ${UI.stat('Qualité (RR)', t.rr ? quality + ' · ' + t.rr + 'R' : '—')}
      ${UI.stat('Humeur', t.emotion ? '★'.repeat(t.emotion) + '☆'.repeat(5 - t.emotion) : '—')}
    </div>
    ${UI.section('Profil du trade', tradeProfileHtml(t))}
    ${UI.kv([['Entrée', t.entry || '—'], ['Sortie', t.exit || '—'], ['Durée', tradeDuration(t)], ['Taille', t.size ?? '—'],
      t.entryPrice != null ? ['Prix d\'entrée', t.entryPrice] : null, t.slPrice != null ? ['Stop loss', t.slPrice] : null, t.tpPrice != null ? ['Take profit', t.tpPrice] : null, t.exitPrice != null ? ['Prix de sortie', t.exitPrice] : null])}
    ${Array.isArray(t.tags) && t.tags.length ? UI.section('Tags', UI.chips(t.tags.map(x => '#' + x))) : ''}
    ${UI.section('Description / confluences', html`<div class="dw-text">${t.desc || html`<span class="ui-muted">—</span>`}</div>`)}
    ${UI.section('Note après coup', html`<textarea class="dw-review" id="dw-review" placeholder="Avec le recul : qu'ai-je bien fait, que referais-je différemment ?" onchange="saveTradeReview(${raw(t.id)}, this.value)">${t.review || ''}</textarea><div class="ui-muted" style="margin-top:4px">Enregistré automatiquement quand tu quittes le champ.</div>`)}
    ${UI.section('Checklist respectée', checked.length ? html`${checked.map(c => html`<div class="dw-check">✓ ${c}</div>`)}` : html`<div class="ui-muted">Aucune checklist cochée</div>`)}
    ${UI.section('Erreurs taguées', Array.isArray(t.mistakes) && t.mistakes.length ? UI.chips(t.mistakes, 'chip-mistake') : html`<div class="ui-muted">Aucune erreur taguée</div>`)}
    ${UI.section('Captures (' + imgs.length + ')', imgs.length ? html`<div class="drawer-caps">${imgs.map((src, i) => html`<img src="${raw(safeImgSrc(src))}" alt="Capture ${i + 1}" onclick="openLightboxById(${raw(t.id)}, ${raw(i)})">`)}</div><div class="ui-muted" style="margin-top:6px">Clique une capture pour l'agrandir et l'annoter.</div>` : html`<div class="ui-muted">Aucune capture — ajoute-les via « Modifier ».</div>`)}
    <div class="dw-actions">
      <button class="btn-ghost" onclick="startEditTrade(${raw(t.id)})">✏️ Modifier</button>
      <button class="btn-ghost" onclick="duplicateTrade(${raw(t.id)})">⧉ Dupliquer</button>
      <button class="btn-danger" onclick="closeTradeDetail();deleteTrade(${raw(t.id)})">Supprimer</button>
    </div>`;
  mount('trade-drawer', body);
  const ov = document.getElementById('trade-drawer-overlay');
  if (!ov.classList.contains('show')) { ov.classList.add('show'); rememberFocus(); }
  setTimeout(() => { const f = document.querySelector('#trade-drawer .dw-nav .btn-ghost:not([disabled])'); if (f && !document.getElementById('trade-drawer').contains(document.activeElement)) f.focus(); }, 60);
}
function saveTradeReview(id, value) {
  const t = trades.find(x => x.id === id); if (!t) return;
  const prev = t.review; t.review = String(value || '').trim();
  if (!save()) { t.review = prev; return; }
  DATA_VERSION++;
  showToast('Note après coup enregistrée ✓', 'success');
}
function duplicateTrade(id) {
  const t = trades.find(x => x.id === id); if (!t) return;
  startEditTrade(id);
  // Mode « nouveau trade » pré-rempli : même contexte, date du jour, résultat et captures à renseigner.
  editingTradeId = null;
  document.getElementById('f-date').value = localDateStr();
  ['f-res', 'f-pnleur', 'f-pnl', 'f-rr', 'f-exit', 'f-exit-price', 'f-review'].forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
  clearImg();
  document.getElementById('edit-trade-banner').style.display = 'none';
  document.getElementById('form-title-text').textContent = 'Nouveau trade (copie de ' + (t.asset || '') + ')';
  document.getElementById('trade-submit-btn-text').textContent = 'Enregistrer le trade';
}

function closeTradeDetail() {
  const el = document.getElementById('trade-drawer-overlay');
  if (!el || !el.classList.contains('show')) return;
  el.classList.remove('show');
  drawerTradeId = null;
  restoreFocus();
}

