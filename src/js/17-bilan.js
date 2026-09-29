// ── BILAN JOURNALIER ─────────────────────────────────────────────────
function renderBilan() {
  const sel = document.getElementById('bilan-date-select');
  if (!sel) return;

  // Populate date options. Si la date précédemment sélectionnée n'existe plus dans les
  // données actuelles (nouvel import, restauration, changement de jeu de données…),
  // on retombe sur la plus récente au lieu de garder une sélection fantôme.
  const dates = [...new Set(trades.map(t=>t.date))].sort().reverse();
  const curVal = (sel.value && dates.includes(sel.value)) ? sel.value : (dates[0]||'');
  sel.innerHTML = dates.map(d=>`<option value="${esc(d)}" ${d===curVal?'selected':''}>${esc(d)}</option>`).join('');

  const dayTrades = curVal ? trades.filter(t => t.date === curVal) : [];
  if (!curVal) {
    document.getElementById('bilan-content').innerHTML = '<p style="color:var(--txt3);font-size:13px">Aucun trade enregistré.</p>';
  } else if (!dayTrades.length) {
    document.getElementById('bilan-content').innerHTML = '<p style="color:var(--txt3);font-size:13px">Aucun trade ce jour.</p>';
  } else {
  const tp = dayTrades.filter(t=>t.res==='TP').length;
  const sl = dayTrades.filter(t=>t.res==='SL').length;
  const be = dayTrades.filter(t=>t.res==='BE').length;
  const pnlR = dayTrades.filter(t=>t.pnl != null).reduce((s,t)=>s+t.pnl,0);
  const eurDay = dayTrades.filter(t=>t.pnlEur!=null);
  const pnlEur = eurDay.reduce((s,t)=>s+t.pnlEur,0);
  const wr = (tp+sl+be)>0 ? (tp/(tp+sl+be)*100).toFixed(0)+'%' : '—';
  const avgEmotion = dayTrades.filter(t=>t.emotion).length>0 ? (dayTrades.filter(t=>t.emotion).reduce((s,t)=>s+t.emotion,0)/dayTrades.filter(t=>t.emotion).length).toFixed(1) : '—';
  const emotionColor = avgEmotion!=='—' ? (avgEmotion>=4?'var(--green)':avgEmotion>=3?'var(--amber)':'var(--red)') : 'var(--txt3)';

  document.getElementById('bilan-content').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:16px">
      ${[
        ['Trades',''+dayTrades.length,'var(--txt)'],
        ['TP',''+tp,'var(--green)'],
        ['SL',''+sl,'var(--red)'],
        ['Win Rate',wr,tp/(tp+sl+be||1)>=.5?'var(--green)':'var(--red)'],
        ['P&L (€)',eurDay.length?fmtEUR(pnlEur,true):'—',!eurDay.length?'var(--txt3)':pnlEur>=0?'var(--green)':'var(--red)'],
        ['P&L (R)',(pnlR>=0?'+':'')+pnlR.toFixed(2)+'R',pnlR>=0?'var(--green)':'var(--red)'],
        ['Humeur moy.',avgEmotion+'/5',emotionColor],
      ].map(([l,v,c])=>`<div class="kpi" style="padding:14px 16px">
        <div class="kpi-label">${l}</div>
        <div class="kpi-val" style="font-size:22px;color:${c}">${v}</div>
      </div>`).join('')}
    </div>
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--r2);overflow-x:auto">
      <div style="padding:14px 18px;border-bottom:1px solid var(--border);font-size:13px;font-weight:600;color:var(--txt)">Trades du jour</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;font-family:var(--mono)">
        <thead><tr style="background:var(--bg3)">
          <th style="padding:8px 12px;text-align:left;color:var(--txt3)">Asset</th>
          <th style="padding:8px 12px;text-align:left;color:var(--txt3)">TF</th>
          <th style="padding:8px 12px;text-align:left;color:var(--txt3)">Session</th>
          <th style="padding:8px 12px;text-align:left;color:var(--txt3)">Entrée</th>
          <th style="padding:8px 12px;text-align:left;color:var(--txt3)">Sortie</th>
          <th style="padding:8px 12px;text-align:left;color:var(--txt3)">Dir.</th>
          <th style="padding:8px 12px;text-align:left;color:var(--txt3)">Résultat</th>
          <th style="padding:8px 12px;text-align:left;color:var(--txt3)">RR</th>
          <th style="padding:8px 12px;text-align:left;color:var(--txt3)">P&L</th>
          <th style="padding:8px 12px;text-align:left;color:var(--txt3)">Humeur</th>
          <th style="padding:8px 12px;text-align:left;color:var(--txt3)">Capture</th>
        </tr></thead>
        <tbody>${dayTrades.map((t,i)=>{
          const bc=t.res==='TP'?cssVar('--green','#22c55e'):t.res==='SL'?cssVar('--red','#ef4444'):t.res==='BE'?cssVar('--amber','#f59e0b'):cssVar('--blue','#60a5fa');
          const emotionStars=t.emotion?'★'.repeat(t.emotion)+'☆'.repeat(5-t.emotion):'—';
          const emC=t.emotion>=4?'var(--green)':t.emotion>=3?'var(--amber)':'var(--red)';
          const capCell=safeImgSrc(t.cap)
            ?`<img src="${safeImgSrc(t.cap)}" onclick="openLightboxById(${t.id})" style="width:48px;height:36px;object-fit:cover;border-radius:calc(var(--r) * .4);cursor:pointer;vertical-align:middle">`
            :'—';
          return `<tr style="border-top:1px solid var(--border);${i%2?'background:var(--bg3)':''}">
            <td style="padding:8px 12px;font-weight:500;color:var(--txt)">${esc(t.asset)}</td>
            <td style="padding:8px 12px;color:var(--txt2)">${esc(t.tf)}</td>
            <td style="padding:8px 12px;color:var(--txt3)">${esc(t.session||'—')}</td>
            <td style="padding:8px 12px;color:var(--txt2)">${esc(t.entry||'—')}</td>
            <td style="padding:8px 12px;color:var(--txt2)">${esc(t.exit||'—')}</td>
            <td style="padding:8px 12px">${esc(t.dir||'—')}</td>
            <td style="padding:8px 12px"><span style="background:${bc}22;color:${bc};padding:2px 8px;border-radius:calc(var(--r) * .4);font-weight:500">${esc(t.res)}</span></td>
            <td style="padding:8px 12px;color:var(--txt2)">${t.rr?esc(t.rr)+'R':'—'}</td>
            <td style="padding:8px 12px;color:${t.pnl>0?'var(--green)':t.pnl<0?'var(--red)':'var(--txt3)'};font-weight:500">${t.pnl != null?(t.pnl>=0?'+':'')+t.pnl.toFixed(1)+'R':'—'}</td>
            <td style="padding:8px 12px;color:${t.emotion?emC:'var(--txt3)'}">${emotionStars}</td>
            <td style="padding:8px 12px">${capCell}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
  }

  // Heatmap et barres agrégées : toujours à jour, indépendamment du jour sélectionné
  // dans le bilan (sinon elles restent figées si ce jour n'a plus de trade).
  renderHeatmap();
  renderSessionBars();
  renderWeekdayBars();
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
  list.forEach(t => { const h = parseInt(t.entry, 10); if (isNaN(h)) return; const g = hMap[h] = hMap[h] || { n: 0, w: 0, net: 0 }; g.n++; g.net += val(t); if (t.res === 'TP') g.w++; });
  const hs = Object.keys(hMap).map(Number).sort((a, b) => a - b);
  if (bilanHourChartInst) { bilanHourChartInst.destroy(); bilanHourChartInst = null; }
  if (!hs.length) { wrap.innerHTML = '<p class="empty-note">Renseigne l\'heure d\'entrée de tes trades pour voir tes meilleures heures.</p>'; return; }
  if (!document.getElementById('bilanHourChart')) wrap.innerHTML = '<div class="chart-wrap" style="height:220px"><canvas id="bilanHourChart"></canvas></div>';
  if (!chartsAvailable('bilanHourChart')) return;
  const hours = []; for (let h = hs[0]; h <= hs[hs.length - 1]; h++) hours.push(h);
  const t = chartTokens(), data = hours.map(h => hMap[h] ? +hMap[h].net.toFixed(2) : 0);
  const fmtV = v => useEur ? fmtEUR(v, true, 0) : (v >= 0 ? '+' : '') + v.toFixed(2) + 'R';
  bilanHourChartInst = new Chart(document.getElementById('bilanHourChart').getContext('2d'), {
    type: 'bar',
    data: { labels: hours.map(h => String(h).padStart(2, '0') + 'h'), datasets: [{ data, backgroundColor: data.map((v, i) => withAlpha(v >= 0 ? t.green : t.red, hMap[hours[i]] && hMap[hours[i]].n < 3 ? .45 : 1)), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24, barPercentage: .85 }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { tooltip: proTooltip({ displayColors: false, callbacks: {
        title: items => items[0] ? items[0].label + ' – ' + String((hours[items[0].dataIndex] + 1) % 24).padStart(2, '0') + 'h' : '',
        label: c => 'Résultat net  ' + fmtV(c.raw),
        afterLabel: c => { const g = hMap[hours[c.dataIndex]]; return g ? [g.n + ' trade(s) · win rate ' + Math.round(g.w / g.n * 100) + ' %'] : ['aucun trade']; }
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
  const total = v.tp + v.sl + v.be, rate = total ? v.tp / total : 0, low = v.n < 10, be = breakevenWinRate();
  return `<div class="asset-row" style="${low ? 'opacity:.6' : ''}" title="${low ? 'Échantillon trop faible pour conclure (n < 10)' : ''}">
    <span class="asset-name" style="font-family:var(--sans)">${esc(name)}${tag || ''}</span>
    <div class="meter"><div class="meter-fill" style="width:${rate * 100}%;background:var(--accent)"></div>${be !== null ? `<div class="meter-tick" style="left:calc(${be * 100}% - 1px)"></div>` : ''}</div>
    <span class="asset-num">${Math.round(rate * 100)} %</span>
    <span class="asset-num muted">${v.n}${low ? ' ⚠' : ''}</span>
    <span class="asset-num" style="color:${v.net >= 0 ? 'var(--green)' : 'var(--red)'}">${useEur ? fmtEUR(v.net, true, 0) : (v.net >= 0 ? '+' : '') + v.net.toFixed(1) + 'R'}</span>
  </div>`;
}

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
  if (!hasSessions) { cont.innerHTML = '<p style="font-size:12px;color:var(--txt3)">Renseigne les sessions pour voir les stats par session.</p>'; return; }
  cont.innerHTML = `<div class="asset-row head"><span>Session</span><span>Win rate</span><span>Win</span><span>n</span><span>Net</span></div>` + sessions.filter(x => sMap[x]).map(x => perfRowHtml(x, sMap[x], useEur)).join('');
}

function renderWeekdayBars() {
  const cont = document.getElementById('weekday-bars');
  if (!cont) return;
  const trades = analysisTrades();
  const useEur = trades.some(t => t.pnlEur !== null && t.pnlEur !== undefined);
  const val = t => useEur ? (t.pnlEur !== null && t.pnlEur !== undefined ? t.pnlEur : 0) : (t.pnl || 0);
  const order = [1,2,3,4,5,6,0]; // Lundi → Dimanche
  const names = {0:'Dimanche',1:'Lundi',2:'Mardi',3:'Mercredi',4:'Jeudi',5:'Vendredi',6:'Samedi'};
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
  if (!active.length) { cont.innerHTML = '<p style="font-size:12px;color:var(--txt3)">Pas encore assez de trades datés pour ce classement.</p>'; return; }
  let bestDay = null, worstDay = null;
  active.forEach(d => {
    if (bestDay === null || map[d].net > map[bestDay].net) bestDay = d;
    if (worstDay === null || map[d].net < map[worstDay].net) worstDay = d;
  });
  cont.innerHTML = `<div class="asset-row head"><span>Jour</span><span>Win rate</span><span>Win</span><span>n</span><span>Net</span></div>` + active.map(d => perfRowHtml(names[d], map[d], useEur,
    d === bestDay ? '<span class="tag-chip" style="color:var(--green)">meilleur</span>' : (d === worstDay && active.length > 1 ? '<span class="tag-chip" style="color:var(--red)">pire</span>' : ''))).join('');
}

