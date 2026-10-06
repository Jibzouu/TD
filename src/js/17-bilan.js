// ── BILAN JOURNALIER ─────────────────────────────────────────────────
// ← → : journée tradée précédente / suivante (les options sont triées du plus récent au plus ancien).
function stepBilanDate(dir) {
  const sel = document.getElementById('bilan-date-select');
  if (!sel || !sel.options.length) return;
  const i = Math.max(0, Math.min(sel.options.length - 1, sel.selectedIndex + dir));
  if (i === sel.selectedIndex) return;
  sel.selectedIndex = i;
  renderBilan();
}
function renderBilan() {
  const trades = viewTrades();   // vue filtrée (filtre global)
  const sel = document.getElementById('bilan-date-select');
  if (!sel) return;

  // Populate date options. Si la date précédemment sélectionnée n'existe plus dans les
  // données actuelles (nouvel import, restauration, changement de jeu de données…),
  // on retombe sur la plus récente au lieu de garder une sélection fantôme.
  // Aujourd'hui et les jours avec un journal de séance sont aussi proposés (préparer sa séance avant le premier trade).
  const today = localDateStr(), daily = loadDaily(), traded = new Set(trades.map(t => t.date));
  const dates = [...new Set([...traded, today, ...Object.keys(daily).filter(d => dailyHasContent(daily[d]))])].filter(Boolean).sort().reverse();
  const curVal = (sel.value && dates.includes(sel.value)) ? sel.value : (dates[0]||'');
  const optLabel = d => fmtDateFR(d, true) + (traded.has(d) ? '' : d === today ? ' · aujourd’hui' : ' · journal');
  mount(sel, html`${dates.map(d => html`<option value="${d}"${raw(d === curVal ? ' selected' : '')}>${optLabel(d)}</option>`)}`);
  renderDailyJournal(curVal || today);

  const ix = dates.indexOf(curVal);
  const prevB = document.getElementById('bilan-prev'), nextB = document.getElementById('bilan-next');
  if (prevB) prevB.disabled = ix < 0 || ix >= dates.length - 1;
  if (nextB) nextB.disabled = ix <= 0;
  const dayTrades = curVal ? trades.filter(t => t.date === curVal) : [];
  const content = document.getElementById('bilan-content');
  if (!curVal) {
    mount(content, html`<p class="bl-empty">Aucun trade enregistré.</p>`);
  } else if (!dayTrades.length) {
    mount(content, html`<p class="bl-empty">Aucun trade ce jour${curVal === today ? ' pour l’instant — remplis ta préparation ci-dessous avant d’ouvrir les graphiques' : ''}.</p>`);
  } else {
  const tp = dayTrades.filter(t=>t.res==='TP').length;
  const sl = dayTrades.filter(t=>t.res==='SL').length;
  const be = dayTrades.filter(t=>t.res==='BE').length;
  const pnlR = dayTrades.filter(t=>t.pnl != null).reduce((s,t)=>s+t.pnl,0);
  const eurDay = dayTrades.filter(t=>t.pnlEur!=null);
  const pnlEur = eurDay.reduce((s,t)=>s+t.pnlEur,0);
  const wr = (tp+sl)>0 ? fmtRate(tp/(tp+sl)*100, 0) : '—';
  const withEmo = dayTrades.filter(t=>t.emotion);
  const avgEmotion = withEmo.length ? fmtNum(withEmo.reduce((s,t)=>s+t.emotion,0)/withEmo.length, 1) : '—';
  const emoTone = e => e >= 4 ? 'green' : e >= 3 ? 'amber' : 'red';
  const kpis = [
    ['Trades', dayTrades.length, ''],
    ['TP', tp, 'green'],
    ['SL', sl, 'red'],
    ['Win Rate', wr, tp/(tp+sl||1) >= .5 ? 'green' : 'red'],
    ['P&L (€)', eurDay.length ? fmtEUR(pnlEur,true) : '—', !eurDay.length ? 'muted' : pnlEur >= 0 ? 'green' : 'red'],
    ['P&L (R)', fmtR(pnlR, 2), pnlR >= 0 ? 'green' : 'red'],
    ['Humeur moy.', avgEmotion+'/5', avgEmotion !== '—' ? emoTone(avgEmotion) : 'muted'],
  ];
  const HEAD = ['Asset', 'TF', 'Session', 'Entrée', 'Sortie', 'Dir.', 'Résultat', 'RR', 'P&L', 'Humeur', 'Capture'];
  const row = t => {
    const src = tradeImages(t)[0] || '';
    return html`<tr>
      <td class="strong">${t.asset}</td><td class="c2">${t.tf}</td><td class="c3">${t.session || '—'}</td>
      <td class="c2">${t.entry || '—'}</td><td class="c2">${t.exit || '—'}</td><td>${t.dir || '—'}</td>
      <td><span class="bl-res res-${raw(['TP','SL','BE'].includes(t.res) ? t.res : 'OPEN')}">${t.res}</span></td>
      <td class="c2">${t.rr ? t.rr + 'R' : '—'}</td>
      <td class="strong tone-${raw(t.pnl > 0 ? 'green' : t.pnl < 0 ? 'red' : 'muted')}">${t.pnl != null ? fmtR(t.pnl, 1) : '—'}</td>
      <td class="tone-${raw(t.emotion ? emoTone(t.emotion) : 'muted')}">${t.emotion ? '★'.repeat(t.emotion) + '☆'.repeat(5 - t.emotion) : '—'}</td>
      <td>${src ? html`<img class="bl-cap" src="${src}" alt="Capture" onclick="openLightboxById(${raw(t.id)})">` : '—'}</td>
    </tr>`;
  };
  mount(content, html`
    <div class="bl-kpis">${kpis.map(([l, v, tone]) => html`<div class="kpi"><div class="kpi-label">${l}</div><div class="kpi-val bl-kpi-val${raw(tone ? ' tone-' + tone : '')}">${v}</div></div>`)}</div>
    <div class="bl-card"><div class="bl-card-title">Trades du jour</div>
      <table class="bl-table"><thead><tr>${HEAD.map(h => html`<th>${h}</th>`)}</tr></thead><tbody>${dayTrades.map(row)}</tbody></table>
    </div>`);
  }

}

// ── HEATMAP ──────────────────────────────────────────────────────────
let bilanHourChartInst = null;
function renderHeatmap() {
  const wrap = document.getElementById('heatmap-wrap');
  if (!wrap) return;
  const list = analysisTrades().filter(t => t.entry && ['TP','SL','BE'].includes(t.res));
  const useEur = list.some(t => t.pnlEur != null);
  const val = t => useEur ? (t.pnlEur != null ? t.pnlEur : 0) : (t.pnl || 0);
  const hMap = {};
  list.forEach(t => { const h = parseInt(t.entry, 10); if (isNaN(h)) return; const g = hMap[h] = hMap[h] || { n: 0, w: 0, l: 0, net: 0 }; g.n++; g.net += val(t); if (t.res === 'TP') g.w++; else if (t.res === 'SL') g.l++; });
  const hs = Object.keys(hMap).map(Number).sort((a, b) => a - b);
  if (bilanHourChartInst) { bilanHourChartInst.destroy(); bilanHourChartInst = null; }
  if (!hs.length) { mount(wrap, html`<p class="empty-note">Renseigne l'heure d'entrée de tes trades pour voir tes meilleures heures.</p>`); return; }
  if (!document.getElementById('bilanHourChart')) mount(wrap, html`<div class="chart-wrap h-220"><canvas id="bilanHourChart"></canvas></div>`);
  if (!chartsAvailable('bilanHourChart')) return;
  const hours = []; for (let h = hs[0]; h <= hs[hs.length - 1]; h++) hours.push(h);
  const t = chartTokens(), data = hours.map(h => hMap[h] ? +hMap[h].net.toFixed(2) : 0);
  const fmtV = v => useEur ? fmtEUR(v, true, 0) : fmtR(v, 2);
  bilanHourChartInst = new Chart(document.getElementById('bilanHourChart').getContext('2d'), {
    type: 'bar',
    data: { labels: hours.map(h => String(h).padStart(2, '0') + 'h'), datasets: [{ data, backgroundColor: data.map((v, i) => withAlpha(v >= 0 ? t.green : t.red, hMap[hours[i]] && hMap[hours[i]].n < 3 ? .45 : 1)), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24, barPercentage: .85 }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { tooltip: proTooltip({ displayColors: false, callbacks: {
        title: items => items[0] ? items[0].label + ' – ' + String((hours[items[0].dataIndex] + 1) % 24).padStart(2, '0') + 'h' : '',
        label: c => 'Résultat net  ' + fmtV(c.raw),
        afterLabel: c => { const g = hMap[hours[c.dataIndex]]; return g ? [g.n + ' trade(s)' + (g.w + g.l ? ' · win rate ' + Math.round(g.w / (g.w + g.l) * 100) + ' %' : '')] : ['aucun trade']; }
      } }) },
      scales: proScales({ xTicks: 24, y: { ticks: { callback: v => useEur ? fmtEURCompact(v) : v + 'R' } } })
    },
    plugins: [refLinePlugin('hourZero', 0, '')]
  });
  const sub = document.getElementById('heatmap-sub');
  const best = hs.filter(h => hMap[h].n >= 3).sort((a, b) => hMap[b].net - hMap[a].net)[0];
  if (sub) sub.textContent = (useEur ? 'Résultat net en €' : 'R cumulé') + ' par heure d\'entrée, toutes journées confondues' + (best !== undefined ? ' · meilleure heure : ' + String(best).padStart(2, '0') + 'h (' + fmtV(hMap[best].net) + ')' : '') + ' · barres pâles : moins de 3 trades';
}

// Ligne « nom · jauge win rate · WR · n · net » commune aux sessions et aux jours.
function perfRowHtml(name, v, useEur, tag) {
  const total = v.tp + v.sl, rate = total ? v.tp / total : 0, low = v.n < 10, be = breakevenWinRate();
  return html`<div class="asset-row${raw(low ? ' low' : '')}" title="${low ? 'Échantillon trop faible pour conclure (n < 10)' : ''}">
    <span class="asset-name sans">${name}${tag || ''}</span>
    ${UI.meter(rate * 100, 'accent', { tick: be !== null ? be * 100 : null })}
    <span class="asset-num">${Math.round(rate * 100)} %</span>
    <span class="asset-num muted">${v.n}${low ? ' ⚠' : ''}</span>
    <span class="asset-num tone-${raw(v.net >= 0 ? 'green' : 'red')}">${useEur ? fmtEUR(v.net, true, 0) : fmtR(v.net, 1)}</span>
  </div>`;
}

const perfHead = first => html`<div class="asset-row head"><span>${first}</span><span>Win rate</span><span>Win</span><span>n</span><span>Net</span></div>`;

// ── SESSION BARS ─────────────────────────────────────────────────────
function renderSessionBars() {
  const cont = document.getElementById('session-bars');
  if (!cont) return;
  const trades = analysisTrades();
  const useEur = trades.some(t => t.pnlEur !== null && t.pnlEur !== undefined);
  const val = t => useEur ? (t.pnlEur !== null && t.pnlEur !== undefined ? t.pnlEur : 0) : (t.pnl || 0);
  const sessions = ['Asie','Overlap Asie/Londres','Londres','Overlap LDN/NY','New York','Hors session'];
  const sMap = {};
  trades.filter(t => t.session && ['TP','SL','BE'].includes(t.res)).forEach(t => {
    if (!sMap[t.session]) sMap[t.session] = { tp:0, sl:0, be:0, net:0, n:0 };
    sMap[t.session].n++;
    if (t.res==='TP') sMap[t.session].tp++;
    else if (t.res==='SL') sMap[t.session].sl++;
    else if (t.res==='BE') sMap[t.session].be++;
    sMap[t.session].net += val(t);
  });
  const hasSessions = sessions.some(s=>sMap[s]);
  if (!hasSessions) { mount(cont, html`<p class="empty-note">Renseigne les sessions pour voir les stats par session.</p>`); return; }
  mount(cont, html`${perfHead('Session')}${sessions.filter(x => sMap[x]).map(x => perfRowHtml(x, sMap[x], useEur))}`);
}

function renderWeekdayBars() {
  const cont = document.getElementById('weekday-bars');
  if (!cont) return;
  const trades = analysisTrades();
  const useEur = trades.some(t => t.pnlEur !== null && t.pnlEur !== undefined);
  const val = t => useEur ? (t.pnlEur !== null && t.pnlEur !== undefined ? t.pnlEur : 0) : (t.pnl || 0);
  const order = [1,2,3,4,5,6,0]; // Lundi → Dimanche
  const names = LANG === 'en' ? {0:'Sunday',1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday'} : {0:'Dimanche',1:'Lundi',2:'Mardi',3:'Mercredi',4:'Jeudi',5:'Vendredi',6:'Samedi'};
  const map = {};
  trades.forEach(t => {
    if (!t.date || !['TP','SL','BE'].includes(t.res)) return;
    const d = new Date(t.date + 'T00:00:00');
    if (isNaN(d)) return;
    const dow = d.getDay();
    if (!map[dow]) map[dow] = { tp:0, sl:0, be:0, net:0, n:0 };
    map[dow].n++;
    if (t.res === 'TP') map[dow].tp++;
    else if (t.res === 'SL') map[dow].sl++;
    else if (t.res === 'BE') map[dow].be++;
    map[dow].net += val(t);
  });
  const active = order.filter(d => map[d]);
  if (!active.length) { mount(cont, html`<p class="empty-note">Pas encore assez de trades datés pour ce classement.</p>`); return; }
  let bestDay = null, worstDay = null;
  active.forEach(d => {
    if (bestDay === null || map[d].net > map[bestDay].net) bestDay = d;
    if (worstDay === null || map[d].net < map[worstDay].net) worstDay = d;
  });
  mount(cont, html`${perfHead('Jour')}${active.map(d => perfRowHtml(names[d], map[d], useEur,
    d === bestDay ? html`<span class="tag-chip tone-green">meilleur</span>` : (d === worstDay && active.length > 1 ? html`<span class="tag-chip tone-red">pire</span>` : '')))}`);
}

