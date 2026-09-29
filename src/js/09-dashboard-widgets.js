// ── KPIs ─────────────────────────────────────────────────────────────
function renderKPIs() {
  const trades = analysisTrades();
  const closed = trades.filter(t => ['TP','SL','BE'].includes(t.res));
  const wins = trades.filter(t => t.res === 'TP');
  const losses = trades.filter(t => t.res === 'SL');
  const n = closed.length;

  // Win Rate
  const W = winStats(trades);
  const wrEl = document.getElementById('k-wr');
  if (W.n > 0) {
    // Vert / rouge selon le seuil de rentabilité réel (payoff), pas selon 50 % : 45 % de réussite peut être très rentable.
    const beWR = breakevenWinRate();
    wrEl.textContent = (W.rate * 100).toFixed(1).replace('.', ',') + ' %';
    wrEl.className = 'kpi-val ' + (beWR === null ? 'neu' : (W.rate >= beWR ? 'pos' : 'neg'));
  } else { wrEl.textContent = '—'; wrEl.className = 'kpi-val neu'; }
  const wrSub = document.getElementById('k-wr-sub');
  const beW = W.n ? breakevenWinRate() : null;
  wrSub.textContent = W.n ? fmtWinLine(W) + (beW !== null ? ' · seuil ' + Math.round(beW * 100) + ' %' : '') + ' · ' + fmtCI(W).replace('IC 95 % : ', 'IC ') : 'aucun trade fermé';
  wrSub.title = W.n ? 'Win rate = gagnants ÷ trades clos (break-even inclus au dénominateur) · ' + fmtCI(W) + ' · n = ' + W.n : '';

  // P&L
  const pnlArr = trades.filter(t => t.pnl != null);
  const total = pnlArr.reduce((s, t) => s + t.pnl, 0);
  const pnlEl = document.getElementById('k-pnl');
  if (pnlArr.length > 0) {
    pnlEl.textContent = (total >= 0 ? '+' : '') + total.toFixed(1) + 'R';
    pnlEl.className = 'kpi-val ' + (total > 0 ? 'pos' : total < 0 ? 'neg' : 'neu');
    const pnlSub = document.getElementById('k-pnl-sub');
    pnlSub.textContent = (total / pnlArr.length).toFixed(2) + 'R / trade · R sur ' + pnlArr.length + '/' + n;
    pnlSub.title = 'Seuls les trades dont le R est retenu (mode « ' + ({ strict: 'R exact seulement', usable: 'R exact + estimé', all: 'Tout' })[R_MODE] + ' ») sont comptés : ' + pnlArr.length + ' sur ' + n + ' trades clos.';
  } else { pnlEl.textContent = '—'; pnlEl.className = 'kpi-val neu'; document.getElementById('k-pnl-sub').textContent = 'en R'; }

  // P&L €
  const eurArr = trades.filter(t => t.pnlEur !== null && t.pnlEur !== undefined);
  const totalEur = eurArr.reduce((s, t) => s + t.pnlEur, 0);
  const eurEl = document.getElementById('k-pnleur');
  if (eurArr.length > 0) {
    animateHeroValue(totalEur);
    eurEl.style.color = totalEur > 0 ? 'var(--green)' : totalEur < 0 ? 'var(--red)' : 'var(--txt)';
    document.getElementById('k-pnleur-sub').textContent = fmtEUR(totalEur / eurArr.length, true, 2) + ' en moyenne par trade · ' + eurArr.length + ' trade(s) avec montant';
    document.title = fmtEUR(totalEur, true) + ' · ' + JOURNALS[JOURNAL_ID].title;
  } else { eurEl.textContent = '—'; lastHeroValue = null; eurEl.style.color = 'var(--txt3)'; document.getElementById('k-pnleur-sub').textContent = 'en euros'; document.title = JOURNALS[JOURNAL_ID].title; }

  // Streak
  const streakEl = document.getElementById('k-streak');
  const closed2 = trades.filter(t => ['TP','SL','BE'].includes(t.res));
  let streak = 0, streakType = '';
  for (const t of closed2) {
    if (streak === 0) { streak = 1; streakType = t.res; }
    else if (t.res === streakType) streak++;
    else break;
  }
  if (closed2.length > 0) {
    streakEl.textContent = (streakType==='TP'?'+':streakType==='SL'?'-':'') + streak;
    streakEl.style.color = streakType==='TP'?'var(--green)':streakType==='SL'?'var(--red)':'var(--amber)';
    document.getElementById('k-streak-sub').textContent = streakType==='TP'?'TP consécutifs':streakType==='SL'?'SL consécutifs':'BE consécutifs';
  } else { streakEl.textContent='—'; streakEl.style.color='var(--txt)'; }

  // DD journalier visuel
  renderDDBanner();

  // Payoff = gain moyen ÷ perte moyenne, en € (exact)
  const eW = eurArr.filter(t => t.res === 'TP'), eL = eurArr.filter(t => t.res === 'SL');
  const avgWinE = eW.length ? eW.reduce((s, t) => s + t.pnlEur, 0) / eW.length : null;
  const avgLossE = eL.length ? Math.abs(eL.reduce((s, t) => s + t.pnlEur, 0) / eL.length) : null;
  const rrEl = document.getElementById('k-rr');
  rrEl.textContent = (avgWinE !== null && avgLossE) ? (avgWinE / avgLossE).toFixed(2) : '—';
  const rrSub = document.getElementById('k-rr-sub');
  if (rrSub) rrSub.textContent = (avgWinE !== null && avgLossE) ? fmtEUR(avgWinE, false, 0) + ' gagné / ' + fmtEUR(avgLossE, false, 0) + ' perdu' : 'gain moyen ÷ perte moyenne';

  // Profit factor : en € (exact) ; en R utilisable seulement si le journal n'a aucun montant en €
  const useEurPF = eurArr.length > 0;
  const gw = useEurPF ? eurArr.filter(t => t.res === 'TP').reduce((s, t) => s + t.pnlEur, 0) : wins.reduce((s, t) => s + (t.pnl || 0), 0);
  const gl = Math.abs(useEurPF ? eurArr.filter(t => t.res === 'SL').reduce((s, t) => s + t.pnlEur, 0) : losses.reduce((s, t) => s + (t.pnl || 0), 0));
  const pfEl = document.getElementById('k-pf');
  if (gl > 0) { pfEl.textContent = (gw/gl).toFixed(2); pfEl.className = 'kpi-val '+(gw/gl>=1?'pos':'neg'); }
  else if (gw > 0) { pfEl.textContent = '∞'; pfEl.className = 'kpi-val pos'; }
  else { pfEl.textContent = '—'; pfEl.className = 'kpi-val neu'; }
  document.getElementById('k-pf-sub').textContent = gl > 0 ? (useEurPF ? '+' + fmtEUR(gw, false, 0) + ' / −' + fmtEUR(gl, false, 0) : '+' + gw.toFixed(1) + 'R / −' + gl.toFixed(1) + 'R') : 'gains / pertes';

  // Subtitle
  const sub = document.getElementById('dash-subtitle');
  sub.textContent = trades.length > 0 ? 'Dernière entrée : ' + trades[0].date + ' · ' + trades[0].asset : 'Aucune entrée pour l\'instant';

  document.getElementById('trades-subtitle').textContent = trades.length + ' trade' + (trades.length !== 1 ? 's' : '') + ' enregistrés';
  updateSidebarCount();
}

function updateSidebarCount() {
  document.getElementById('trade-total-count').textContent = trades.length;
}

// ── COURBE D'ÉQUITÉ + DRAWDOWN (sous l'eau) ─────────────────────────
let PNL_CHART_MODE = 'cumulative';
let underwaterChartInst = null;
function setPnlChartMode(mode) {
  PNL_CHART_MODE = mode;
  document.querySelectorAll('.pnl-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  renderYearProgress();
}
// Série journalière (fin de journée) : solde en € dès qu'un montant en € existe, sinon R cumulé (hors R fictifs).
function equitySeries() {
  const withEur = trades.filter(t => t.pnlEur != null && t.date);
  const useEur = withEur.length > 0;
  const src = useEur ? withEur : analysisTrades().filter(t => t.pnl != null && t.date);
  const byDay = {}, nDay = {};
  src.forEach(t => { byDay[t.date] = (byDay[t.date] || 0) + (useEur ? t.pnlEur : t.pnl); nDay[t.date] = (nDay[t.date] || 0) + 1; });
  const start = useEur ? (accountSize || 0) : 0;
  let cum = start, peak = start;
  const pts = Object.keys(byDay).sort().map(d => {
    cum += byDay[d]; peak = Math.max(peak, cum);
    const ddAbs = cum - peak;
    return { date: d, bal: cum, day: byDay[d], n: nDay[d], peak, ddAbs, ddPct: useEur && peak > 0 ? ddAbs / peak * 100 : null };
  });
  let maxDD = null;
  pts.forEach((p, i) => { const v = useEur ? p.ddPct : p.ddAbs; if (v < 0 && (maxDD === null || v < maxDD.v)) maxDD = { i, v, abs: p.ddAbs, date: p.date }; });
  let peakIdx = -1;
  pts.forEach((p, i) => { if (p.bal > start && (peakIdx < 0 || p.bal > pts[peakIdx].bal)) peakIdx = i; });
  return { useEur, start, pts, maxDD, peakIdx, fmt: v => useEur ? fmtEUR(v, false, 0) : (v >= 0 ? '+' : '') + v.toFixed(2) + 'R', fmtS: v => useEur ? fmtEUR(v, true, 0) : (v >= 0 ? '+' : '') + v.toFixed(2) + 'R' };
}
function renderYearProgress() {
  const canvas = document.getElementById('yearProgressChart');
  if (!canvas) return;
  const E = equitySeries(), P = E.pts, t = chartTokens();
  const last = P.length ? P[P.length - 1] : null;
  const endBal = last ? last.bal : E.start;
  const perf = E.useEur && E.start > 0 ? (endBal - E.start) / E.start * 100 : null;
  const curDD = last ? (E.useEur ? last.ddPct : last.ddAbs) : null;

  // Bandeau de chiffres (et résumé dans le hero)
  const stat = (l, v, c) => `<div class="es-item"><span class="es-label">${l}</span><span class="es-val"${c ? ` style="color:${c}"` : ''}>${v}</span></div>`;
  const statsEl = document.getElementById('equity-stats');
  const sub = document.getElementById('year-progress-sub');
  if (!P.length) {
    if (statsEl) statsEl.innerHTML = '';
    if (sub) sub.textContent = 'Renseigne un P&L (€ ou R) sur tes trades pour voir ta courbe';
  } else {
    if (sub) sub.textContent = (E.useEur ? 'Solde en €, depuis le solde de départ' : 'R cumulé (aucun montant en € saisi)') + ' · ' + fmtDateFR(P[0].date) + ' → ' + fmtDateFR(last.date) + ' · ' + P.length + ' jour(s) tradé(s)';
    if (statsEl) statsEl.innerHTML =
      stat(E.useEur ? 'Solde actuel' : 'R cumulé', E.fmt(endBal)) +
      (perf !== null ? stat('Performance', fmtPct(perf), perf >= 0 ? t.green : t.red) : '') +
      stat('Plus haut', E.fmt(Math.max(E.start, ...P.map(p => p.bal)))) +
      stat('Drawdown max', E.maxDD ? (E.useEur ? fmtPct(E.maxDD.v) : E.maxDD.v.toFixed(2) + 'R') : '0', E.maxDD ? t.red : null) +
      stat('Drawdown actuel', curDD ? (E.useEur ? fmtPct(curDD) : curDD.toFixed(2) + 'R') : 'aucun');
  }
  renderHeroSide(E, endBal, perf);

  if (yearProgressChartInst) { yearProgressChartInst.destroy(); yearProgressChartInst = null; }
  if (!chartsAvailable('yearProgressChart')) { renderUnderwater(E); return; }
  const ctx = canvas.getContext('2d');
  const daily = PNL_CHART_MODE === 'daily';
  const labels = daily ? P.map(p => p.date) : ['Départ', ...P.map(p => p.date)];
  const xFmt = function (v) { const l = this.getLabelForValue(v); return /^\d{4}-\d{2}-\d{2}$/.test(l) ? fmtDateFR(l) : l; };
  const titleCb = items => { const l = items[0] ? items[0].label : ''; return l === 'Départ' ? 'Solde de départ' : fmtDateFR(l, true); };
  const ptOf = i => daily ? P[i] : (i > 0 ? P[i - 1] : null);

  if (daily) {
    yearProgressChartInst = new Chart(ctx, {
      type: 'bar',
      data: { labels, datasets: [{ data: P.map(p => +p.day.toFixed(2)), backgroundColor: P.map(p => p.day >= 0 ? t.green : t.red), hoverBackgroundColor: P.map(p => withAlpha(p.day >= 0 ? t.green : t.red, .8)), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24, barPercentage: .9, categoryPercentage: .85 }] },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { tooltip: proTooltip({ callbacks: { title: titleCb, label: c => 'P&L du jour  ' + E.fmtS(c.raw), afterLabel: c => { const p = ptOf(c.dataIndex); return p ? [p.n + ' trade(s)', 'Solde  ' + E.fmt(p.bal)] : []; } } }) },
        scales: proScales({ x: { ticks: { callback: xFmt } }, y: { ticks: { callback: v => E.useEur ? fmtEURCompact(v) : v + 'R' } } })
      },
      plugins: [refLinePlugin('zeroLine', 0, '')]
    });
  } else {
    const data = [E.start, ...P.map(p => +p.bal.toFixed(2))];
    const peakI = E.peakIdx >= 0 ? E.peakIdx + 1 : -1;
    yearProgressChartInst = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{
        data, borderColor: t.accent, borderWidth: chartBorderW(2), borderDash: currentLineDash(), tension: 0, borderJoinStyle: 'round', borderCapStyle: 'round',
        fill: { target: { value: E.start }, above: withAlpha(t.green, chartFillAlpha(.12)), below: withAlpha(t.red, chartFillAlpha(.14)) },
        pointRadius: data.map((_, i) => i === peakI || i === data.length - 1 ? 4 : 0), pointBackgroundColor: t.accent, pointBorderColor: t.bg2, pointBorderWidth: 2,
        pointHoverRadius: 5, pointHoverBackgroundColor: t.accent, pointHoverBorderColor: t.bg2, pointHoverBorderWidth: 2, pointHitRadius: 12
      }] },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, layout: { padding: { top: 28, right: 6 } },
        plugins: { tooltip: proTooltip({ callbacks: {
          title: titleCb,
          label: c => (E.useEur ? 'Solde  ' : 'R cumulé  ') + E.fmt(c.raw),
          afterLabel: c => { const p = ptOf(c.dataIndex); if (!p) return []; const dd = E.useEur ? p.ddPct : p.ddAbs; return ['Jour  ' + E.fmtS(p.day) + ' · ' + p.n + ' trade(s)', 'Drawdown  ' + (dd ? (E.useEur ? fmtPct(dd) : dd.toFixed(2) + 'R') : '—')]; }
        } }) },
        scales: proScales({ x: { ticks: { callback: xFmt } }, y: { ticks: { callback: v => E.useEur ? fmtEURCompact(v) : v + 'R' } } })
      },
      plugins: [refLinePlugin('startLine', E.start, E.useEur ? 'Départ ' + fmtEUR(E.start) : '0R'), {
        id: 'peakLabel', afterDatasetsDraw(ch) { if (peakI > 0) drawPointLabel(ch, 0, peakI, 'Plus haut ' + E.fmt(data[peakI]), t.accent, true); }
      }]
    });
  }
  renderUnderwater(E, daily);
}
function renderUnderwater(E, daily) {
  if (underwaterChartInst) { underwaterChartInst.destroy(); underwaterChartInst = null; }
  const canvas = document.getElementById('underwaterChart');
  const sub = document.getElementById('drawdown-sub');
  if (sub) sub.textContent = E.maxDD ? 'max ' + (E.useEur ? fmtPct(E.maxDD.v) + ' (' + fmtEUR(E.maxDD.abs) + ')' : E.maxDD.v.toFixed(2) + 'R') + ' le ' + fmtDateFR(E.maxDD.date, true) : (E.pts.length ? 'aucun drawdown' : '');
  if (!canvas || !E.pts.length || !chartsAvailable('underwaterChart')) return;
  const t = chartTokens();
  const dd = E.pts.map(p => +((E.useEur ? p.ddPct : p.ddAbs) || 0).toFixed(2));
  const labels = daily ? E.pts.map(p => p.date) : ['Départ', ...E.pts.map(p => p.date)];
  const data = daily ? dd : [0, ...dd];
  const troughI = E.maxDD ? E.maxDD.i + (daily ? 0 : 1) : -1;
  underwaterChartInst = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: t.red, borderWidth: chartBorderW(1.5), tension: 0, fill: 'origin', backgroundColor: withAlpha(t.red, chartFillAlpha(.16)), pointRadius: data.map((_, i) => i === troughI ? 3.5 : 0), pointBackgroundColor: t.red, pointBorderColor: t.bg2, pointBorderWidth: 2, pointHoverRadius: 4, pointHitRadius: 10 }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { tooltip: proTooltip({ callbacks: { title: items => { const l = items[0] ? items[0].label : ''; return l === 'Départ' ? 'Départ' : fmtDateFR(l, true); }, label: c => 'Drawdown  ' + (E.useEur ? fmtPct(c.raw) : c.raw + 'R') } }) },
      scales: proScales({ x: { display: false }, y: { max: 0, ticks: { maxTicksLimit: 3, callback: v => E.useEur ? Math.round(v * 10) / 10 + ' %' : v + 'R' } } })
    }
  });
}
// Résumé à côté du chiffre principal : solde, rendement, drawdown max + mini-courbe d'équité.
function renderHeroSide(E, endBal, perf) {
  const side = document.getElementById('hero-side'), spark = document.getElementById('hero-spark');
  if (!side || !spark) return;
  if (!E.pts.length) { side.innerHTML = ''; spark.innerHTML = ''; return; }
  const t = chartTokens();
  const it = (l, v, c) => `<div class="hs-item"><span class="hs-label">${l}</span><span class="hs-val"${c ? ` style="color:${c}"` : ''}>${v}</span></div>`;
  side.innerHTML = it(E.useEur ? 'Solde' : 'R cumulé', E.fmt(endBal)) +
    (perf !== null ? it('Rendement', fmtPct(perf), perf >= 0 ? t.green : t.red) : '') +
    it('Drawdown max', E.maxDD ? (E.useEur ? fmtPct(E.maxDD.v) : E.maxDD.v.toFixed(2) + 'R') : '0 %') +
    it('Jours tradés', String(E.pts.length));
  const vals = [E.start, ...E.pts.map(p => p.bal)];
  const { path, lastX, lastY } = buildSparklinePath(vals, 240, 64, 4);
  const min = Math.min(...vals), max = Math.max(...vals), range = (max - min) || 1;
  const baseY = 64 - 4 - ((E.start - min) / range) * 56;
  spark.innerHTML = `<line x1="0" x2="240" y1="${baseY.toFixed(1)}" y2="${baseY.toFixed(1)}" style="stroke:var(--txt3)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>` +
    `<path d="${path} L${lastX.toFixed(1)},64 L4,64 Z" style="fill:var(--accent);opacity:.1"/>` +
    `<path d="${path}" fill="none" style="stroke:var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` +
    `<path d="M${lastX.toFixed(1)},${lastY.toFixed(1)} h0" style="stroke:var(--accent)" stroke-width="7" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
}

// ── TAUX DE RÉUSSITE : jauges comparées au seuil de rentabilité ─────
function renderWinRateMeters() {
  const el = document.getElementById('winrate-body');
  if (!el) return;
  const W = winStats(trades);
  const days = Object.values(dayNet(trades));
  const dW = days.filter(v => v > 1e-6).length, dL = days.filter(v => v < -1e-6).length, dN = days.length;
  const dCI = dN ? wilsonCI(dW, dN) : [0, 0];
  const be = breakevenWinRate();
  const t = chartTokens();
  if (!W.n) { el.innerHTML = '<p class="empty-note">Apparaîtra dès ton premier trade clôturé.</p>'; return; }
  const row = (name, k, n, lo, hi, thr, thrLbl, foot) => {
    const rate = n ? k / n : 0, low = n < 10;
    const ok = thr === null ? null : rate >= thr;
    const col = ok === null ? t.accent : (ok ? t.green : t.red);
    const status = low ? `<span class="wr-status" style="color:var(--txt3)">● échantillon faible (n=${n})</span>`
      : ok === null ? '' : `<span class="wr-status" style="color:${col}">${ok ? '▲ au-dessus' : '▼ en dessous'} du seuil</span>`;
    return `<div class="wr-row">
      <div class="wr-top"><span><span class="wr-name">${name}</span><br><span class="wr-val">${(rate * 100).toFixed(1).replace('.', ',')} %</span></span>${status}</div>
      <div class="meter" title="Intervalle de confiance 95 % : ${Math.round(lo * 100)}–${Math.round(hi * 100)} %">
        <div class="meter-ci" style="left:${lo * 100}%;width:${Math.max(0, (hi - lo) * 100)}%"></div>
        <div class="meter-fill" style="width:${rate * 100}%;background:${col};${low ? 'opacity:.55' : ''}"></div>
        ${thr !== null ? `<div class="meter-tick" style="left:calc(${thr * 100}% - 1px)"></div><div class="meter-tick-lbl" style="left:${Math.min(88, Math.max(12, thr * 100))}%">${thrLbl}</div>` : ''}
      </div>
      <div class="wr-foot"><span>${foot}</span><span>IC 95 % : ${Math.round(lo * 100)}–${Math.round(hi * 100)} %</span></div>
    </div>`;
  };
  el.innerHTML =
    row('Par trade', W.wins, W.n, W.lo, W.hi, be, be !== null ? 'seuil ' + Math.round(be * 100) + ' %' : '', fmtWinLine(W) + (be !== null ? ' · seuil = perte moy. ÷ (gain moy. + perte moy.)' : '')) +
    (dN ? row('Par journée', dW, dN, dCI[0], dCI[1], .5, '50 %', dW + ' jour(s) + · ' + dL + ' jour(s) −' + (dN - dW - dL ? ' · ' + (dN - dW - dL) + ' neutre(s)' : '')) : '');
}

// ── DISTRIBUTION DES R ────────────────────────────────────────────────
function renderRDistribution() {
  const trades = analysisTrades();
  const canvas = document.getElementById('rDistChart');
  const statsEl = document.getElementById('r-distribution-stats');
  if (!canvas) return;
  if (rDistChartInst) { rDistChartInst.destroy(); rDistChartInst = null; }
  const closed = trades.filter(t => ['TP','SL','BE'].includes(t.res) && t.pnl != null);
  if (closed.length < 5) {
    if (statsEl) statsEl.innerHTML = '<p class="empty-note">Il faut au moins 5 trades clos avec un R pour tracer la distribution.</p>';
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const t = chartTokens();
  const rValues = closed.map(t => t.pnl);
  const bw = 0.5;
  const b0 = Math.floor(Math.min(...rValues) / bw) * bw, b1 = Math.ceil(Math.max(...rValues) / bw) * bw;
  const nb = Math.max(1, Math.round((b1 - b0) / bw));
  const buckets = new Array(nb).fill(0);
  rValues.forEach(r => { buckets[Math.max(0, Math.min(nb - 1, Math.floor((r - b0) / bw)))]++; });
  const fmtR = v => (v > 0 ? '+' : '') + v.toFixed(1).replace('.', ',');
  const labels = buckets.map((_, i) => fmtR(b0 + i * bw));
  const colors = buckets.map((_, i) => (b0 + i * bw + bw / 2) >= 0 ? t.green : t.red);
  const wins = rValues.filter(v => v > 0), losses = rValues.filter(v => v < 0);
  const avgW = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null;
  const avgL = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null;
  const exp = rValues.reduce((a, b) => a + b, 0) / rValues.length;
  const stat = (l, v, c) => `<div class="es-item"><span class="es-label">${l}</span><span class="es-val"${c ? ` style="color:${c}"` : ''}>${v}</span></div>`;
  if (statsEl) statsEl.innerHTML = stat('Espérance', fmtR(exp) + 'R / trade', exp >= 0 ? t.green : t.red) + stat('Gain moyen', avgW !== null ? fmtR(avgW) + 'R' : '—') + stat('Perte moyenne', avgL !== null ? fmtR(avgL) + 'R' : '—') + stat('Trades', String(closed.length));
  if (!chartsAvailable('rDistChart')) return;
  const idxOf = v => Math.max(0, Math.min(nb - 1, (v - b0) / bw - .5));   // position continue (au centre des classes)
  rDistChartInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ data: buckets, backgroundColor: colors, hoverBackgroundColor: colors.map(c => withAlpha(c, .8)), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24, barPercentage: .92, categoryPercentage: .92 }] },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 26 } },
      plugins: { tooltip: proTooltip({ displayColors: false, callbacks: { title: items => items[0] ? 'De ' + items[0].label + 'R à ' + fmtR(b0 + (items[0].dataIndex + 1) * bw) + 'R' : '', label: c => c.raw + ' trade' + (c.raw !== 1 ? 's' : '') + ' · ' + Math.round(c.raw / closed.length * 100) + ' %' } }) },
      scales: proScales({ xTicks: 12, yWidth: 40, x: { ticks: { callback: function (v) { return this.getLabelForValue(v) + 'R'; } } }, y: { ticks: { precision: 0 } } })
    },
    plugins: [{
      id: 'rMarkers',
      afterDatasetsDraw(chart) {
        const { ctx: c, chartArea: a, scales } = chart;
        const px = v => { const x = scales.x, i = idxOf(v), lo = Math.floor(i), hi = Math.min(nb - 1, lo + 1); return x.getPixelForValue(lo) + (x.getPixelForValue(hi) - x.getPixelForValue(lo)) * (i - lo); };
        const mark = (v, color, label, row) => {
          if (v === null) return;
          const x = Math.round(px(v)) + .5; c.save();
          c.strokeStyle = color; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x, a.top); c.lineTo(x, a.bottom); c.stroke(); c.setLineDash([]);
          c.font = '500 11px ' + chartFontFamily(); const w = c.measureText(label).width + 18, bx = Math.min(Math.max(x - w / 2, a.left), a.right - w), by = a.top - 22 + row * 0;
          c.fillStyle = t.bg2; c.fillRect(bx, by, w, 17); c.fillStyle = color; c.beginPath(); c.arc(bx + 7, by + 8.5, 3, 0, Math.PI * 2); c.fill();
          c.fillStyle = t.txt2; c.textBaseline = 'middle'; c.fillText(label, bx + 13, by + 9); c.restore();
        };
        mark(avgL, t.red, 'moy. perte', 0); mark(avgW, t.green, 'moy. gain', 0); mark(exp, t.accent, 'espérance', 0);
      }
    }]
  });
}

// ── RENDEMENTS MENSUELS : P&L € et % du solde en début de mois ──────
function renderMonthlyReturnsTable() {
  const cont = document.getElementById('monthly-returns-table');
  if (!cont) return;
  const byMonth = {};
  trades.forEach(t => { if (!/^\d{4}-\d{2}/.test(t.date || '') || t.pnlEur == null) return; const k = t.date.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + t.pnlEur; });
  const keys = Object.keys(byMonth).sort();
  if (!keys.length) { cont.innerHTML = '<p class="empty-note">Pas encore de données mensuelles (il faut des P&amp;L en €).</p>'; return; }
  // Solde au début de chaque mois = solde de départ + P&L des mois précédents.
  const startBal = {}; let bal = accountSize || 0;
  keys.forEach(k => { startBal[k] = bal; bal += byMonth[k]; });
  const years = [...new Set(keys.map(k => k.slice(0, 4)))];
  const yearStart = {}; years.forEach(y => { yearStart[y] = startBal[keys.find(k => k.startsWith(y))]; });
  const maxAbs = Math.max(...Object.values(byMonth).map(Math.abs), 1);
  const M = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  const pctTxt = (v, base) => base > 0 ? fmtPct(v / base * 100) : '';
  let html = '<div style="overflow-x:auto"><table style="min-width:760px"><thead><tr><th>Année</th>' + M.map(m => `<th style="text-align:center">${m}</th>`).join('') + '<th style="text-align:right">Année</th></tr></thead><tbody>';
  years.slice().reverse().forEach(y => {
    let tot = 0;
    html += `<tr><td style="font-family:var(--mono);font-weight:600">${y}</td>`;
    for (let m = 1; m <= 12; m++) {
      const k = y + '-' + String(m).padStart(2, '0'), v = byMonth[k];
      if (v === undefined) { html += '<td style="text-align:center;color:var(--txt3)">—</td>'; continue; }
      tot += v;
      const hc = heatColors(v, maxAbs);
      html += `<td style="padding:5px 3px"><div class="mr-cell" style="background:${hc.bg};color:${hc.strong ? hc.onFill : 'var(--txt)'}" title="${esc(M[m - 1] + ' ' + y)} : ${fmtEUR(v, true, 2)}"><b>${fmtEURCompact(v).replace(/^(?!-)/, v > 0 ? '+' : '')}</b><span>${pctTxt(v, startBal[k])}</span></div></td>`;
    }
    html += `<td style="text-align:right;font-family:var(--mono);font-weight:600;color:${tot >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtEUR(tot, true)}<div style="font-size:11px;font-weight:400;color:var(--txt3)">${pctTxt(tot, yearStart[y])}</div></td></tr>`;
  });
  cont.innerHTML = html + '</tbody></table></div>';
}

// ── HEATMAP JOUR × HEURE D'ENTRÉE ────────────────────────────────────
let heatDHCells = [];
function renderHeatmapDH() {
  const cont = document.getElementById('heatmap-dh'), sub = document.getElementById('heatmap-dh-sub');
  if (!cont) return;
  const list = analysisTrades().filter(t => ['TP','SL','BE'].includes(t.res) && t.entry && /^\d{4}-\d{2}-\d{2}$/.test(t.date || ''));
  const useEur = list.some(t => t.pnlEur != null);
  const val = t => useEur ? (t.pnlEur != null ? t.pnlEur : 0) : (t.pnl || 0);
  const grid = {}; let minH = 24, maxH = -1; const dows = new Set();
  list.forEach(t => {
    const h = parseInt(t.entry, 10); if (isNaN(h)) return;
    const dow = (new Date(t.date + 'T00:00:00').getDay() + 6) % 7;   // 0 = lundi
    const k = dow + '-' + h; const g = grid[k] = grid[k] || { n: 0, w: 0, net: 0 };
    g.n++; g.net += val(t); if (t.res === 'TP') g.w++;
    minH = Math.min(minH, h); maxH = Math.max(maxH, h); dows.add(dow);
  });
  if (maxH < 0) { cont.innerHTML = '<p class="empty-note">Renseigne l\'heure d\'entrée de tes trades pour voir tes meilleurs créneaux.</p>'; if (sub) sub.textContent = ''; return; }
  const days = [0, 1, 2, 3, 4].concat([5, 6].filter(d => dows.has(d)));
  const DN = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], DL = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const hours = []; for (let h = minH; h <= maxH; h++) hours.push(h);
  const maxAbs = Math.max(...Object.values(grid).map(g => Math.abs(g.net)), 1e-9);
  const fmtV = v => useEur ? fmtEUR(v, true, 0) : (v >= 0 ? '+' : '') + v.toFixed(2) + 'R';
  heatDHCells = [];
  let html = `<div class="hm-grid" style="grid-template-columns:40px repeat(${hours.length},minmax(26px,1fr))"><div></div>` + hours.map(h => `<div class="hm-collbl">${String(h).padStart(2, '0')}h</div>`).join('');
  days.forEach(d => {
    html += `<div class="hm-rowlbl">${DN[d]}</div>`;
    hours.forEach(h => {
      const g = grid[d + '-' + h];
      if (!g) { html += '<div class="hm-cell"></div>'; return; }
      const hc = heatColors(g.net, maxAbs), i = heatDHCells.length;
      heatDHCells.push({ title: DL[d] + ' · ' + String(h).padStart(2, '0') + 'h – ' + String((h + 1) % 24).padStart(2, '0') + 'h', g });
      html += `<div class="hm-cell has" tabindex="0" data-i="${i}" style="background:${hc.bg}${g.n < 3 ? ';opacity:.6' : ''}" aria-label="${esc(heatDHCells[i].title)} : ${esc(fmtV(g.net))}, ${g.n} trade(s)"></div>`;
    });
  });
  const t = chartTokens(), scale = [-1, -.6, -.25, .25, .6, 1].map(r => `<span style="background:${heatColors(r * maxAbs, maxAbs).bg}"></span>`).join('');
  html += `</div><div class="hm-legend"><span>Perte</span><span class="hm-scale">${scale}</span><span>Gain</span><span style="margin-left:12px">Cases pâles : moins de 3 trades · survole une case pour le détail</span></div>`;
  cont.innerHTML = html;
  const ranked = heatDHCells.filter(c => c.g.n >= 3).sort((a, b) => b.g.net - a.g.net);
  if (sub) sub.textContent = ranked.length ? 'Meilleur créneau : ' + ranked[0].title + ' (' + fmtV(ranked[0].g.net) + ', ' + ranked[0].g.n + ' trades)' + (ranked.length > 1 && ranked[ranked.length - 1].g.net < 0 ? ' · le plus coûteux : ' + ranked[ranked.length - 1].title + ' (' + fmtV(ranked[ranked.length - 1].g.net) + ')' : '') : (useEur ? 'Résultat net en € par créneau' : 'R cumulé par créneau');
  const show = (e, el) => {
    const c = heatDHCells[+el.dataset.i]; if (!c) return;
    const ev = e && e.clientX !== undefined ? e : (() => { const r = el.getBoundingClientRect(); return { clientX: r.right, clientY: r.bottom }; })();
    showHtmlTip(ev, c.title.charAt(0).toUpperCase() + c.title.slice(1), [['Résultat net', fmtV(c.g.net), c.g.net >= 0 ? t.green : t.red], ['Trades', String(c.g.n)], ['Win rate', Math.round(c.g.w / c.g.n * 100) + ' %']]);
  };
  cont.querySelectorAll('.hm-cell.has').forEach(el => {
    el.addEventListener('mouseenter', e => show(e, el));
    el.addEventListener('mousemove', positionCalTooltip);
    el.addEventListener('mouseleave', hideCalTooltip);
    el.addEventListener('focus', () => show(null, el));
    el.addEventListener('blur', hideCalTooltip);
  });
}

// ── RADAR ────────────────────────────────────────────────────────────
// Chaque critère mesure un comportement (pas un résultat). Un critère non suivi est affiché comme tel et exclu de la moyenne.
function computeDiscipline() {
  const closed = trades.filter(t => ['TP', 'SL', 'BE'].includes(t.res));
  const items = [];
  const entryCount = getEntryItems().length;
  const mine = closed.filter(tradeHasChecklist);                                      // trades saisis avec le formulaire
  items.push(mine.length >= 3
    ? { label: "Checklist d'entrée complète", pct: mine.filter(tradeChecklistComplete).length / mine.length * 100, n: mine.length, hint: 'Part des trades saisis où tous les critères de ta checklist sont cochés.' }
    : { label: "Checklist d'entrée complète", pct: null, hint: 'Non suivi : coche ta checklist en saisissant un trade (3 trades minimum).' });
  const tagUsed = closed.some(t => Array.isArray(t.mistakes) && t.mistakes.length);
  items.push(tagUsed && mine.length >= 3
    ? { label: 'Trades sans erreur taguée', pct: mine.filter(t => !(Array.isArray(t.mistakes) && t.mistakes.length)).length / mine.length * 100, n: mine.length, hint: 'Part des trades saisis sans aucune erreur cochée.' }
    : { label: 'Trades sans erreur taguée', pct: null, hint: 'Non suivi : tague tes erreurs dans le formulaire pour activer ce critère.' });
  const sls = closed.filter(t => t.res === 'SL' && t.pnlEur !== null && t.pnlEur !== undefined);
  items.push(DEFAULT_RISK_EUR > 0 && sls.length >= 3
    ? { label: 'Risque par trade respecté', pct: sls.filter(t => Math.abs(t.pnlEur) <= DEFAULT_RISK_EUR * 1.25).length / sls.length * 100, n: sls.length, hint: 'Part des pertes ≤ 125 % de ton risque configuré (' + DEFAULT_RISK_EUR + ' €).' }
    : { label: 'Risque par trade respecté', pct: null, hint: 'Non suivi : renseigne ton risque par trade (€) dans Paramètres (3 pertes minimum).' });
  const dn = Object.values(dayNet(closed.filter(t => t.pnlEur !== null && t.pnlEur !== undefined)));
  const limitEur = (accountSize || 0) * loadDDLimitPct() / 100;
  items.push(dn.length >= 3 && limitEur > 0
    ? { label: 'Perte journalière sous la limite', pct: dn.filter(v => v >= -limitEur).length / dn.length * 100, n: dn.length, hint: 'Part des journées dont la perte nette reste sous ta limite (' + loadDDLimitPct() + ' % = ' + Math.round(limitEur) + ' €).' }
    : { label: 'Perte journalière sous la limite', pct: null, hint: 'Non suivi : 3 journées avec des montants en € minimum.' });
  const tilt = computeTiltTrades();
  items.push(tilt.lossesWithFollowup >= 3
    ? { label: 'Pas de ré-entrée impulsive', pct: (1 - tilt.flagged.length / tilt.lossesWithFollowup) * 100, n: tilt.lossesWithFollowup, hint: 'Part des ré-entrées après un SL qui ne sont ni précipitées (≤ 10 min après la sortie du SL) ni gonflées en taille.' }
    : { label: 'Pas de ré-entrée impulsive', pct: null, hint: 'Non suivi : 3 SL suivis d\'un nouveau trade le même jour minimum.' });
  const tracked = items.filter(i => i.pct !== null);
  return { items, tracked: tracked.length, total: items.length, score: tracked.length >= 2 ? Math.round(tracked.reduce((s, i) => s + i.pct, 0) / tracked.length) : null };
}
function renderRadar() {
  const d = computeDiscipline();
  const list = document.getElementById('discipline-list');
  const sevCol = p => p === null ? 'var(--txt3)' : (p >= 85 ? 'var(--green)' : p >= 60 ? 'var(--amber)' : 'var(--red)');
  if (list) list.innerHTML = d.items.map(i => `<div title="${esc(i.hint)}" style="margin-bottom:11px;${i.pct === null ? 'opacity:.6' : ''}">
      <div style="display:flex;justify-content:space-between;gap:10px;font-size:12px;margin-bottom:5px"><span style="color:var(--txt2)">${esc(i.label)}</span><span style="font-family:var(--mono);color:var(--txt)">${i.pct === null ? '<span style="color:var(--txt3)">non suivi</span>' : Math.round(i.pct) + ' %'}${i.n ? ' <span style="color:var(--txt3)">· n=' + i.n + '</span>' : ''}</span></div>
      <div class="meter" style="height:5px"><div class="meter-fill" style="width:${i.pct === null ? 0 : Math.round(i.pct)}%;background:${sevCol(i.pct)}"></div></div></div>`).join('');
  const scoreEl = document.getElementById('discipline-score-val'), bar = document.getElementById('discipline-score-marker'), note = document.getElementById('discipline-note');
  if (scoreEl) { scoreEl.textContent = d.score === null ? '—' : d.score; scoreEl.style.color = d.score === null ? 'var(--txt3)' : 'var(--txt)'; }
  if (bar) { bar.style.width = (d.score === null ? 0 : d.score) + '%'; bar.style.background = sevCol(d.score); }
  if (note) note.textContent = d.score === null ? 'Il faut au moins 2 critères suivis pour calculer un score sur 100.' : 'Score sur 100 · ' + d.tracked + ' critère(s) suivi(s) sur ' + d.total + '. Survole un critère pour sa définition.';
}

// ── PERFORMANCE PAR ACTIF ────────────────────────────────────────────
function renderAssetBars() {
  const cont = document.getElementById('asset-bars');
  if (!cont) return;
  if (!trades.length) { cont.innerHTML = '<p class="empty-note">Apparaîtra dès ton premier trade.</p>'; return; }
  const groups = {};
  trades.forEach(t => { const k = t.asset || '—'; (groups[k] = groups[k] || []).push(t); });
  const rows = Object.entries(groups).map(([asset, list]) => {
    const e = list.filter(t => t.pnlEur != null), r = analysisTrades().filter(t => (t.asset || '—') === asset && t.pnl != null);
    return { asset, w: winStats(list), eur: e.length ? e.reduce((a, t) => a + t.pnlEur, 0) : null, r: r.reduce((a, t) => a + t.pnl, 0) };
  }).filter(r => r.w.n > 0).sort((a, b) => b.w.n - a.w.n || a.asset.localeCompare(b.asset));
  if (!rows.length) { cont.innerHTML = '<p class="empty-note">Aucun trade clôturé.</p>'; return; }
  const be = breakevenWinRate();
  const MAX = 8, shown = rows.slice(0, MAX), rest = rows.slice(MAX);
  const t = chartTokens();
  cont.innerHTML = `<div class="asset-row head"><span>Actif</span><span>Win rate${be !== null ? ' (repère : seuil ' + Math.round(be * 100) + ' %)' : ''}</span><span>Win</span><span>n</span><span>P&amp;L</span></div>` +
    shown.map(({ asset, w, eur, r }) => {
      const low = w.n < 10, pnl = eur !== null ? eur : r;
      const tip = esc(asset) + ' : ' + w.wins + ' G / ' + w.losses + ' P' + (w.be ? ' / ' + w.be + ' BE' : '') + ' · ' + fmtCI(w) + (low ? ' · échantillon trop faible pour conclure (n < 10)' : '');
      return `<div class="asset-row" title="${tip}" style="${low ? 'opacity:.6' : ''}">
        <span class="asset-name">${esc(asset.length > 12 ? asset.slice(0, 11) + '…' : asset)}</span>
        <div class="meter"><div class="meter-fill" style="width:${w.rate * 100}%;background:${t.accent}"></div>${be !== null ? `<div class="meter-tick" style="left:calc(${be * 100}% - 1px)"></div>` : ''}</div>
        <span class="asset-num">${Math.round(w.rate * 100)} %</span>
        <span class="asset-num muted">${w.n}${low ? ' ⚠' : ''}</span>
        <span class="asset-num" style="color:${pnl >= 0 ? 'var(--green)' : 'var(--red)'}">${eur !== null ? fmtEUR(eur, true) : (r >= 0 ? '+' : '') + r.toFixed(1) + 'R'}</span>
      </div>`;
    }).join('') +
    (rest.length ? `<p class="empty-note" style="margin-top:8px">+ ${rest.length} autre(s) actif(s) — détail dans Statistiques › Performance par asset</p>` : '');
}

