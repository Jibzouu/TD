// ── TABLE ────────────────────────────────────────────────────────────
// ── FILTRES / TRI / GROUPEMENT ──────────────────────────────────────
let tableSortKey = null, tableSortDir = 1;
let groupByDayMode = false;

function filterTrades() {
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
  const bc = t.res==='TP'?'b-tp':t.res==='SL'?'b-sl':t.res==='BE'?'b-be':'b-open';
  const rsrc = rSource(t), approx = (rsrc === 'risque' || rsrc === 'defaut') ? '≈' : '', rtitle = esc(R_SRC_LABELS[rsrc]);
  const pnlStr = t.pnl != null ? (t.pnl>0?`<span class="pnl-p" title="${rtitle}">${approx}+${t.pnl.toFixed(1)}R</span>`:t.pnl<0?`<span class="pnl-n" title="${rtitle}">${approx}${t.pnl.toFixed(1)}R</span>`:`<span class="pnl-z" title="${rtitle}">0R</span>`) : '—';
  const pnlEurStr = (t.pnlEur!==null && t.pnlEur!==undefined) ? (t.pnlEur>0?`<span class="pnl-p">${fmtEUR(t.pnlEur,true,2)}</span>`:t.pnlEur<0?`<span class="pnl-n">${fmtEUR(t.pnlEur,false,2)}</span>`:`<span class="pnl-z">0 €</span>`) : '—';
  const dir = t.dir ? `<span class="badge ${t.dir==='Long'?'b-long':'b-short'}">${esc(t.dir)}</span>` : '—';
  const icons = [
    t.cap ? '<span title="Capture disponible">📷</span>' : '',
    t.emotion ? `<span title="Humeur ${esc(t.emotion)}/5" style="color:${t.emotion>=4?'var(--green)':t.emotion>=3?'var(--amber)':'var(--red)'}">●</span>` : ''
  ].filter(Boolean).join(' ');
  return `<tr class="trade-row" onclick="openTradeDetail(${t.id})">
    <td style="color:var(--txt3)">${num}</td>
    <td>${esc(t.date||'—')}</td>
    <td style="font-weight:500">${esc(t.asset||'—')}</td>
    <td>${dir}</td>
    <td><span class="badge ${bc}">${esc(t.res)}</span></td>
    <td>${t.rr?esc(t.rr)+'R':'—'}</td>
    <td>${pnlStr}</td>
    <td>${pnlEurStr}</td>
    <td style="text-align:center">${icons}</td>
    <td><button class="del-btn row-del" onclick="event.stopPropagation();deleteTrade(${t.id})" title="Supprimer">×</button></td>
  </tr>`;
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

  // Mini-stats for the filtered set.
  const miniEl = document.getElementById('trades-minibar');
  if (miniEl) {
    if (filtered.length === 0) {
      miniEl.innerHTML = '';
    } else {
      const closed = filtered.filter(t => ['TP','SL','BE'].includes(t.res));
      const wins = filtered.filter(t => t.res === 'TP').length;
      const winRate = closed.length ? (wins/closed.length*100) : null;
      const totalR = filtered.reduce((s,t) => s + (t.pnl||0), 0);
      const eurArr = filtered.filter(t => t.pnlEur!==null && t.pnlEur!==undefined);
      const totalEur = eurArr.reduce((s,t) => s + t.pnlEur, 0);
      miniEl.innerHTML = `
        <div class="mb-item"><span class="mb-label">Trades</span><span class="mb-val">${filtered.length}</span></div>
        <div class="mb-item"><span class="mb-label">Win rate</span><span class="mb-val" style="color:${winRate===null?'var(--txt3)':winRate>=50?'var(--green)':'var(--red)'}">${winRate===null?'—':winRate.toFixed(0)+'%'}</span></div>
        <div class="mb-item"><span class="mb-label">P&L (R)</span><span class="mb-val" style="color:${totalR>=0?'var(--green)':'var(--red)'}">${totalR>=0?'+':''}${totalR.toFixed(1)}R</span></div>
        <div class="mb-item"><span class="mb-label">P&L (€)</span><span class="mb-val" style="color:${totalEur>=0?'var(--green)':'var(--red)'}">${fmtEUR(totalEur, true)}</span></div>
      `;
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
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10">
      <div style="padding:36px 20px;text-align:center">
        <div style="font-size:28px;margin-bottom:10px;opacity:.5">📭</div>
        <div style="font-size:13px;color:var(--txt2);margin-bottom:14px">${hasAnyTrades ? "Aucun trade ne correspond à ces filtres" : "Ton journal est vide pour l'instant"}</div>
        ${hasAnyTrades
          ? `<button class="btn-ghost" onclick="resetTradeFilters()">Réinitialiser les filtres</button>`
          : `<button class="btn-primary" onclick="showPage('dashboard', document.querySelector('.nav-item[data-page=dashboard]'))">+ Ajouter ton premier trade</button>`}
      </div>
    </td></tr>`;
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
}

// ── DÉTAIL D'UN TRADE (tiroir latéral) ───────────────────────────────
function openTradeDetail(id) {
  const t = trades.find(x => x.id === id);
  if (!t) return;
  const bc = t.res==='TP'?'b-tp':t.res==='SL'?'b-sl':t.res==='BE'?'b-be':'b-open';
  const dir = t.dir ? `<span class="badge ${t.dir==='Long'?'b-long':'b-short'}">${esc(t.dir)}</span>` : '—';
  const pnlStr = t.pnl != null ? (t.pnl>0?`<span class="pnl-p">+${t.pnl.toFixed(1)}R</span>`:t.pnl<0?`<span class="pnl-n">${t.pnl.toFixed(1)}R</span>`:`<span class="pnl-z">0R</span>`) : '—';
  const pnlEurStr = (t.pnlEur!==null && t.pnlEur!==undefined) ? (t.pnlEur>0?`<span class="pnl-p">${fmtEUR(t.pnlEur,true,2)}</span>`:t.pnlEur<0?`<span class="pnl-n">${fmtEUR(t.pnlEur,false,2)}</span>`:`<span class="pnl-z">0 €</span>`) : '—';
  const qual = t.rr ? (t.rr>=3?`<div class="qual q-ap">A+</div>`:t.rr>=2?`<div class="qual q-a">A</div>`:t.rr>=1.5?`<div class="qual q-b">B</div>`:`<div class="qual q-c">C</div>`) : '<span style="color:var(--txt3);font-size:12px">—</span>';
  const emotionStars = t.emotion ? '★'.repeat(t.emotion)+'☆'.repeat(5-t.emotion) : '—';

  const checkedLabels = tradeChecklistLabels(t);
  const checklistHtml = checkedLabels.length
    ? checkedLabels.map(label => `<div style="font-size:12px;color:var(--green);padding:3px 0">✓ ${esc(label)}</div>`).join('')
    : '<div style="font-size:12px;color:var(--txt3)">Aucune checklist cochée</div>';

  const mistakesHtml = (Array.isArray(t.mistakes) && t.mistakes.length)
    ? t.mistakes.map(m => `<span class="badge" style="background:rgba(244,114,182,.12);color:#f472b6;margin:2px 4px 2px 0;display:inline-block">${esc(m)}</span>`).join('')
    : '<div style="font-size:12px;color:var(--txt3)">Aucune erreur taguée</div>';

  const capSrc = safeImgSrc(t.cap);
  const capHtml = capSrc
    ? `<img src="${capSrc}" style="width:100%;border-radius:var(--r);border:1px solid var(--border);cursor:pointer;margin-top:8px" onclick="openLightboxById(${t.id})">`
    : (t.cap ? '<div style="font-size:12px;color:var(--txt3);margin-top:8px">Capture invalide — ignorée par sécurité</div>' : '<div style="font-size:12px;color:var(--txt3);margin-top:8px">Aucune capture</div>');

  const hasDistR = computeDistanceR(t.entryPrice, t.slPrice, t.exitPrice, t.dir) !== null;
  const rMethod = ({
    prix: { txt: '📐 R calculé par distance de prix (exact)', col: 'var(--green)' },
    manuel: { txt: '✍️ R saisi', col: 'var(--green)' },
    risque: { txt: '💶 R estimé : P&L € ÷ risque configuré (' + DEFAULT_RISK_EUR + ' €)', col: 'var(--blue)' },
    defaut: { txt: '⚠️ R FICTIF : RR par défaut, aucune base réelle (exclu des stats en R)', col: 'var(--amber)' },
    aucun: { txt: 'Pas de R', col: 'var(--txt3)' }
  })[rSource(t)];
  const priceLevelsHtml = (t.entryPrice || t.slPrice || t.tpPrice || t.exitPrice) ? `
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--txt3)">Prix entrée</span><span>${esc(t.entryPrice ?? '—')}</span></div>
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--txt3)">Stop Loss</span><span>${esc(t.slPrice ?? '—')}</span></div>
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--txt3)">Take Profit</span><span>${esc(t.tpPrice ?? '—')}</span></div>
    <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--txt3)">Prix sortie</span><span>${esc(t.exitPrice ?? '—')}</span></div>` : '';

  document.getElementById('trade-drawer').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
      <div>
        <div style="font-size:11px;font-family:var(--mono);color:var(--txt3)">${esc(t.date||'—')} · ${esc(t.tf||'—')}</div>
        <div style="font-size:20px;font-weight:600;margin-top:4px">${esc(t.asset||'—')} ${dir}</div>
      </div>
      <button class="btn-ghost" onclick="closeTradeDetail()" style="padding:6px 10px">×</button>
    </div>
    <div style="font-size:11px;font-family:var(--mono);color:${rMethod.col};margin-bottom:16px">${rMethod.txt}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:12px">
        <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:4px">Résultat</div>
        <span class="badge ${bc}" style="font-size:13px">${esc(t.res)}</span>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:12px">
        <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:4px">Qualité</div>
        ${qual}
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:12px">
        <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:4px">RR / P&amp;L</div>
        <div style="font-family:var(--mono);font-size:13px">${t.rr?esc(t.rr)+'R':'—'} · ${pnlStr}</div>
        <div style="font-family:var(--mono);font-size:12px;margin-top:2px">${pnlEurStr}</div>
      </div>
      <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:12px">
        <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:4px">Humeur</div>
        <div style="font-size:13px">${emotionStars}</div>
      </div>
    </div>
    <div style="margin-bottom:16px;font-size:12px;font-family:var(--mono);color:var(--txt2)">
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--txt3)">Session</span><span>${esc(t.session||'—')}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--txt3)">Entrée</span><span>${esc(t.entry||'—')}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--txt3)">Sortie</span><span>${esc(t.exit||'—')}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span style="color:var(--txt3)">Taille</span><span>${esc(t.size||'—')}</span></div>
      ${priceLevelsHtml}
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:8px">Description / setup</div>
      <div style="font-size:12.5px;color:var(--txt2);line-height:1.6;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:10px">${t.desc ? esc(t.desc) : '<span style="color:var(--txt3)">—</span>'}</div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:8px">Checklist respectée</div>
      ${checklistHtml}
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:8px">Erreurs taguées</div>
      ${mistakesHtml}
    </div>
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:8px">Capture</div>
      ${capHtml}
    </div>
    <div style="display:flex;gap:10px">
      <button style="flex:1;border-radius:var(--r);padding:10px;font-family:var(--mono);font-size:12px;cursor:pointer;background:var(--bg3);color:var(--txt);border:1px solid var(--border2)" onclick="startEditTrade(${t.id})">✏️ Modifier</button>
      <button style="flex:1;border-radius:var(--r);padding:10px;font-family:var(--mono);font-size:12px;cursor:pointer;background:var(--red);color:#fff;border:none" onclick="closeTradeDetail();deleteTrade(${t.id})">Supprimer</button>
    </div>
  `;
  document.getElementById('trade-drawer-overlay').classList.add('show');
}
function closeTradeDetail() {
  const el = document.getElementById('trade-drawer-overlay');
  if (el) el.classList.remove('show');
}

