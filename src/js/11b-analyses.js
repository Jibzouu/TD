// ── ANALYSES PRO : Monte-Carlo, MAE/MFE, R réalisé vs visé, équité par setup ─────
let mcChartInst = null, maeMfeChartInst = null, rvrChartInst = null, smChartInsts = [];
function renderProAnalyses() {
  [renderMonteCarlo, renderMaeMfeScatter, renderRealizedVsPlanned, renderSmallMultiples].forEach(fn => safeRun(fn, fn.name));
}
const stat2 = (l, v, tone) => UI.stat(l, v, { compact: true, tone });

// Monte-Carlo : tirages avec remise dans les résultats réels (en € si disponibles, sinon en R).
function renderMonteCarlo() {
  const canvas = document.getElementById('mcChart'); if (!canvas) return;
  if (mcChartInst) { mcChartInst.destroy(); mcChartInst = null; }
  const closed = viewTrades().filter(t => ['TP', 'SL', 'BE'].includes(t.res));
  const eur = closed.filter(t => t.pnlEur != null).map(t => t.pnlEur);
  const useEur = eur.length >= closed.length * .8 && eur.length > 0;
  const vals = useEur ? eur : analysisTrades().filter(t => ['TP', 'SL', 'BE'].includes(t.res) && t.pnl != null).map(t => t.pnl);
  const statsEl = document.getElementById('mc-stats');
  if (vals.length < 20) { mount(statsEl, html`<p class="ui-muted">Il faut au moins 20 trades clos pour une simulation crédible (tu en as ${vals.length}).</p>`); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); return; }
  const n = parseInt(document.getElementById('mc-n').value, 10) || 100, ddPct = parseInt(document.getElementById('mc-dd').value, 10) || 10;
  const start = useEur ? (balanceBeforeFilter() + viewTrades().filter(t => t.pnlEur != null).reduce((s, t) => s + t.pnlEur, 0)) : 0;
  const R = monteCarlo(vals, n, 1000, start, useEur ? ddPct / 100 : null, vals.length * 7919 + n);
  const f = v => useEur ? fmtEUR(v, false, 0) : fmtR(v, 1);
  const tk = chartTokens();
  mount(statsEl, html`
    ${stat2('Médiane après ' + n + ' trades', f(percentile(R.finals, .5)), percentile(R.finals, .5) >= start ? 'green' : 'red')}
    ${stat2('Scénario défavorable (5 %)', f(percentile(R.finals, .05)))}
    ${stat2('Scénario favorable (95 %)', f(percentile(R.finals, .95)))}
    ${stat2('Probabilité de finir en perte', Math.round(R.negative * 100) + ' %', R.negative > .25 ? 'red' : null)}
    ${useEur ? stat2('Risque de toucher −' + ddPct + ' %', Math.round(R.hitDD * 100) + ' %', R.hitDD > .2 ? 'red' : R.hitDD > .05 ? 'amber' : 'green') : ''}
    ${useEur ? stat2('Drawdown max médian', fmtPct(R.medianMaxDD * 100)) : ''}`);
  const sub = document.getElementById('mc-sub');
  if (sub) sub.textContent = '1 000 futurs possibles de ' + n + ' trades, tirés dans tes ' + vals.length + ' résultats réels (' + (useEur ? 'en €' : 'en R') + ')' + (filterActive() ? ' · filtre actif' : '');
  if (!chartsAvailable('mcChart')) return;
  const labels = [...Array(n + 1).keys()];
  const B = R.bands, band = (data, fill, extra) => Object.assign({ data: data.map(v => +v.toFixed(2)), borderWidth: 0, pointRadius: 0, pointHoverRadius: 0, tension: 0, fill, backgroundColor: 'transparent' }, extra || {});
  mcChartInst = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [
      band(B.p95, false, { label: '95e centile' }),
      band(B.p05, '-1', { label: '5e centile', backgroundColor: withAlpha(tk.accent, chartFillAlpha(.1)) }),
      band(B.p75, false, { label: '75e centile' }),
      band(B.p25, '-1', { label: '25e centile', backgroundColor: withAlpha(tk.accent, chartFillAlpha(.2)) }),
      { label: 'Médiane', data: B.p50.map(v => +v.toFixed(2)), borderColor: tk.accent, borderWidth: chartBorderW(2), pointRadius: 0, pointHoverRadius: 4, tension: 0, fill: false }
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { tooltip: proTooltip({ itemSort: (a, b) => b.raw - a.raw, filter: i => [0, 2, 4, 3, 1].includes(i.datasetIndex), callbacks: { title: it => 'Après ' + it[0].label + ' trade(s)', label: c => c.dataset.label + '  ' + f(c.raw) } }) },
      scales: proScales({ xTicks: 6, x: { ticks: { callback: function (v) { return this.getLabelForValue(v) + ' tr.'; } } }, y: { ticks: { callback: v => useEur ? fmtEURCompact(v) : v + 'R' } } })
    },
    plugins: [refLinePlugin('mcStart', start, useEur ? 'Aujourd\'hui ' + fmtEUR(start) : '0R')].concat(useEur ? [refLinePlugin('mcDD', start * (1 - ddPct / 100), '−' + ddPct + ' %')] : [])
  });
}

// Nuage MAE / MFE (€) : gagnants et perdants en couleurs distinctes + légende (jamais la couleur seule).
function renderMaeMfeScatter() {
  const canvas = document.getElementById('maeMfeChart'); if (!canvas) return;
  if (maeMfeChartInst) { maeMfeChartInst.destroy(); maeMfeChartInst = null; }
  const pts = viewTrades().filter(t => t.mae != null && t.mfe != null && ['TP', 'SL', 'BE'].includes(t.res));
  const statsEl = document.getElementById('maemfe-stats');
  if (pts.length < 3) { mount(statsEl, html`<p class="ui-muted">Pas encore de données d'excursion. Elles viennent des exports TradingView (colonnes « Excursion favorable / adverse »).</p>`); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); return; }
  const win = pts.filter(t => t.res === 'TP'), loss = pts.filter(t => t.res !== 'TP');
  const avg = (a, k) => a.length ? a.reduce((s, t) => s + Math.abs(t[k]), 0) / a.length : null;
  const lossWithProfit = loss.filter(t => Math.abs(t.mfe) > Math.abs(t.pnlEur || 0) * .5 && Math.abs(t.mfe) > 0).length;
  const tk = chartTokens();
  mount(statsEl, html`${stat2('MAE moy. gagnants', fmtEUR(avg(win, 'mae')))}${stat2('MAE moy. perdants', fmtEUR(avg(loss, 'mae')))}${stat2('Perdants passés en profit', loss.length ? Math.round(lossWithProfit / loss.length * 100) + ' %' : '—', lossWithProfit / Math.max(1, loss.length) > .4 ? 'amber' : null)}`);
  if (!chartsAvailable('maeMfeChart')) return;
  const ds = (list, label, color) => ({ label, data: list.map(t => ({ x: +Math.abs(t.mae).toFixed(2), y: +Math.abs(t.mfe).toFixed(2), t })), backgroundColor: withAlpha(color, .75), borderColor: tk.bg2, borderWidth: 1.5, pointRadius: 4.5, pointHoverRadius: 6, pointHitRadius: 10 });
  maeMfeChartInst = new Chart(canvas.getContext('2d'), {
    type: 'scatter',
    data: { datasets: [ds(win, 'Gagnants', tk.green), ds(loss, 'Perdants / BE', tk.red)] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'top', align: 'end', labels: { color: tk.txt2, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8, font: { family: cssVar('--sans', 'Inter'), size: 11.5 } } },
        tooltip: proTooltip({ callbacks: { title: it => { const t = it[0].raw.t; return (t.asset || '—') + ' · ' + fmtDateFR(t.date, true); }, label: c => 'MAE ' + fmtEUR(-c.raw.x) + ' · MFE ' + fmtEUR(c.raw.y, true) + ' · résultat ' + fmtEUR(c.raw.t.pnlEur, true) } })
      },
      scales: proScales({ yWidth: 64, x: { type: 'linear', grid: { display: true, color: tk.border }, title: { display: true, text: 'Excursion adverse (MAE, €)', color: tk.txt3, font: { size: 11 } }, ticks: { callback: v => fmtEURCompact(v) } }, y: { title: { display: true, text: 'Excursion favorable (MFE, €)', color: tk.txt3, font: { size: 11 } }, ticks: { callback: v => fmtEURCompact(v) } } })
    }
  });
}

// R réalisé vs R visé : diagonale = objectif atteint ; sous la diagonale = sortie avant l'objectif.
function renderRealizedVsPlanned() {
  const canvas = document.getElementById('rvrChart'); if (!canvas) return;
  if (rvrChartInst) { rvrChartInst.destroy(); rvrChartInst = null; }
  const pts = viewTrades().map(t => ({ t, p: plannedR(t), r: computeDistanceR(t.entryPrice, t.slPrice, t.exitPrice, t.dir) })).filter(o => o.p !== null && o.r !== null);
  const statsEl = document.getElementById('rvr-stats');
  if (pts.length < 3) { mount(statsEl, html`<p class="ui-muted">Renseigne prix d'entrée, stop, objectif et sortie sur au moins 3 trades (section « Prix & Stop Loss » du formulaire).</p>`); canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); return; }
  const winners = pts.filter(o => o.r > 0);
  const capture = winners.length ? winners.reduce((s, o) => s + Math.min(o.r / o.p, 1.5), 0) / winners.length : null;
  const reached = pts.filter(o => o.r >= o.p - 1e-9).length;
  const left = winners.reduce((s, o) => s + Math.max(0, o.p - o.r), 0);
  const tk = chartTokens();
  mount(statsEl, html`${stat2('Objectif atteint', Math.round(reached / pts.length * 100) + ' % des trades')}${stat2('Part de l\'objectif capturée', capture === null ? '—' : Math.round(capture * 100) + ' %', capture !== null && capture < .7 ? 'amber' : null)}${stat2('R laissés sur la table', left.toFixed(1) + 'R')}`);
  if (!chartsAvailable('rvrChart')) return;
  const maxP = Math.max(...pts.map(o => o.p), 1) * 1.1;
  rvrChartInst = new Chart(canvas.getContext('2d'), {
    type: 'scatter',
    data: { datasets: [
      { label: 'Trades', data: pts.map(o => ({ x: o.p, y: o.r, t: o.t })), backgroundColor: pts.map(o => withAlpha(o.r >= o.p ? tk.green : o.r > 0 ? tk.accent : tk.red, .8)), borderColor: tk.bg2, borderWidth: 1.5, pointRadius: 4.5, pointHoverRadius: 6, pointHitRadius: 10 },
      { type: 'line', label: 'Objectif atteint (réalisé = visé)', data: [{ x: 0, y: 0 }, { x: maxP, y: maxP }], borderColor: tk.txt3, borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false }
    ] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { tooltip: proTooltip({ filter: i => i.datasetIndex === 0, callbacks: { title: it => { const t = it[0].raw.t; return t ? (t.asset || '—') + ' · ' + fmtDateFR(t.date, true) : ''; }, label: c => 'Visé ' + c.raw.x.toFixed(2) + 'R · réalisé ' + (c.raw.y >= 0 ? '+' : '') + c.raw.y.toFixed(2) + 'R' } }) },
      scales: proScales({ yWidth: 48, x: { type: 'linear', min: 0, max: +maxP.toFixed(1), grid: { display: true, color: tk.border }, title: { display: true, text: 'R visé', color: tk.txt3, font: { size: 11 } }, ticks: { callback: v => v + 'R' } }, y: { title: { display: true, text: 'R réalisé', color: tk.txt3, font: { size: 11 } }, ticks: { callback: v => v + 'R' } } })
    },
    plugins: [refLinePlugin('rvrZero', 0, '')]
  });
}

// Petits multiples : une mini-courbe d'équité par setup (à défaut par actif), toutes à la même échelle.
function renderSmallMultiples() {
  const cont = document.getElementById('small-multiples'); if (!cont) return;
  smChartInsts.forEach(c => c.destroy()); smChartInsts = [];
  const list = [...viewTrades()].reverse().filter(t => t.pnlEur != null || t.pnl != null);
  const bySetup = list.some(t => t.setup);
  const key = t => bySetup ? (t.setup || 'Sans setup') : (t.asset || '—');
  const useEur = list.some(t => t.pnlEur != null);
  const groups = {};
  list.forEach(t => { (groups[key(t)] = groups[key(t)] || []).push(t); });
  const top = Object.entries(groups).sort((a, b) => b[1].length - a[1].length).slice(0, 6).filter(([, g]) => g.length >= 2);
  const sub = document.getElementById('sm-sub');
  if (sub) sub.textContent = (bySetup ? 'Par setup' : 'Par actif (renseigne un setup sur tes trades pour les comparer)') + ' · ' + (useEur ? '€ cumulés' : 'R cumulés') + ' · mêmes échelles pour comparer d\'un coup d\'œil';
  if (!top.length) { mount(cont, UI.empty('📈', 'Pas encore assez de trades par groupe', 'Il faut au moins 2 trades dans un setup (ou un actif) pour tracer sa courbe.', null)); return; }
  const series = top.map(([k, g]) => { let c = 0; return { k, n: g.length, w: g.filter(t => t.res === 'TP').length, pts: [0].concat(g.map(t => (c += useEur ? (t.pnlEur || 0) : (t.pnl || 0)))) }; });
  const all = series.flatMap(s => s.pts), yMin = Math.min(0, ...all), yMax = Math.max(0, ...all), xMax = Math.max(...series.map(s => s.pts.length - 1));
  mount(cont, html`${series.map((s, i) => html`<div class="sm-cell"><div class="sm-head"><b>${s.k}</b><span>${s.n} trades · ${Math.round(s.w / s.n * 100)} %</span></div><div class="sm-val tone-${raw(s.pts[s.pts.length - 1] >= 0 ? 'green' : 'red')}">${useEur ? fmtEUR(s.pts[s.pts.length - 1], true) : (s.pts[s.pts.length - 1] >= 0 ? '+' : '') + s.pts[s.pts.length - 1].toFixed(1) + 'R'}</div><div class="chart-wrap h-90"><canvas id="sm-${raw(i)}"></canvas></div></div>`)}`);
  if (typeof Chart === 'undefined') return;
  const tk = chartTokens();
  series.forEach((s, i) => {
    smChartInsts.push(new Chart(document.getElementById('sm-' + i).getContext('2d'), {
      type: 'line',
      data: { datasets: [{ data: s.pts.map((v, j) => ({ x: j, y: +v.toFixed(2) })), borderColor: tk.accent, borderWidth: 1.75, tension: 0, pointRadius: 0, pointHoverRadius: 3, fill: { target: { value: 0 }, above: withAlpha(tk.green, .12), below: withAlpha(tk.red, .14) } }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
        plugins: { tooltip: proTooltip({ displayColors: false, callbacks: { title: it => 'Après ' + it[0].raw.x + ' trade(s)', label: c => (useEur ? fmtEUR(c.raw.y, true) : c.raw.y + 'R') } }) },
        scales: { x: { display: false, min: 0, max: xMax, type: 'linear' }, y: { display: false, min: yMin, max: yMax } } },
      plugins: [refLinePlugin('smZero' + i, 0, '')]
    }));
  });
}
