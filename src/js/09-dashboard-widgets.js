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
    wrEl.textContent = fmtRate(W.rate * 100, 1);
    wrEl.className = 'kpi-val ' + (beWR === null ? 'neu' : (W.rate >= beWR ? 'pos' : 'neg'));
  } else { wrEl.textContent = '—'; wrEl.className = 'kpi-val neu'; }
  const wrSub = document.getElementById('k-wr-sub');
  const beW = W.n ? breakevenWinRate() : null;
  // Une seule ligne : gagnants / perdants et seuil ; le détail (BE, intervalle de confiance) est dans l'info-bulle.
  wrSub.textContent = W.closed ? W.wins + ' G · ' + W.losses + ' P' + (W.be ? ' · ' + W.be + ' BE' : '') + (beW !== null ? ' · seuil ' + Math.round(beW * 100) + ' %' : '') : 'aucun trade fermé';
  wrSub.title = W.n ? fmtWinLine(W) + ' · win rate = gagnants ÷ (gagnants + perdants), les break-even ne comptent pas · ' + fmtCI(W) : '';

  // P&L
  const pnlArr = trades.filter(t => t.pnl != null);
  const total = pnlArr.reduce((s, t) => s + t.pnl, 0);
  const pnlEl = document.getElementById('k-pnl');
  if (pnlArr.length > 0) {
    pnlEl.textContent = fmtR(total, 1);
    pnlEl.className = 'kpi-val ' + (total > 0 ? 'pos' : total < 0 ? 'neg' : 'neu');
    const pnlSub = document.getElementById('k-pnl-sub');
    pnlSub.textContent = fmtR(total / pnlArr.length, 2) + ' par trade' + (pnlArr.length < n ? ' · ' + pnlArr.length + '/' + n + ' avec R' : '');
    pnlSub.title = 'Seuls les trades dont le R est connu sont comptés : ' + pnlArr.length + ' sur ' + n + ' trades clos.';
  } else { pnlEl.textContent = '—'; pnlEl.className = 'kpi-val neu'; document.getElementById('k-pnl-sub').textContent = 'en R'; }

  // P&L €
  const eurArr = trades.filter(t => t.pnlEur !== null && t.pnlEur !== undefined);
  const totalEur = eurArr.reduce((s, t) => s + t.pnlEur, 0);
  const eurEl = document.getElementById('k-pnleur');
  if (eurArr.length > 0) {
    animateHeroValue(totalEur);
    eurEl.style.color = totalEur > 0 ? 'var(--green)' : totalEur < 0 ? 'var(--red)' : 'var(--txt)';
    const fees = eurArr.reduce((s, t) => s + (typeof t.fees === 'number' ? t.fees : 0), 0);
    document.getElementById('k-pnleur-sub').textContent = fmtEUR(totalEur / eurArr.length, true, 2) + ' en moyenne par trade · ' + eurArr.length + ' trade(s) avec montant' + (fees ? ' · net de ' + fmtEUR(fees, false, 0) + ' de frais' : '');
    document.title = fmtEUR(totalEur, true) + ' · ' + JOURNALS[JOURNAL_ID].title + ' · LockIn';
  } else { eurEl.textContent = '—'; lastHeroValue = null; eurEl.style.color = 'var(--txt3)'; document.getElementById('k-pnleur-sub').textContent = 'en euros'; document.title = JOURNALS[JOURNAL_ID].title + ' · LockIn'; }

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
  rrEl.textContent = (avgWinE !== null && avgLossE) ? fmtNum(avgWinE / avgLossE, 2) : '—';
  const rrSub = document.getElementById('k-rr-sub');
  if (rrSub) rrSub.textContent = (avgWinE !== null && avgLossE) ? fmtEUR(avgWinE, false, 0) + ' gagné / ' + fmtEUR(avgLossE, false, 0) + ' perdu' : 'gain moyen ÷ perte moyenne';

  // Profit factor : en € (exact) ; en R utilisable seulement si le journal n'a aucun montant en €
  const useEurPF = eurArr.length > 0;
  const gw = useEurPF ? eurArr.filter(t => t.res === 'TP').reduce((s, t) => s + t.pnlEur, 0) : wins.reduce((s, t) => s + (t.pnl || 0), 0);
  const gl = Math.abs(useEurPF ? eurArr.filter(t => t.res === 'SL').reduce((s, t) => s + t.pnlEur, 0) : losses.reduce((s, t) => s + (t.pnl || 0), 0));
  const pfEl = document.getElementById('k-pf');
  if (gl > 0) { pfEl.textContent = fmtNum(gw / gl, 2); pfEl.className = 'kpi-val '+(gw/gl>=1?'pos':'neg'); }
  else if (gw > 0) { pfEl.textContent = '∞'; pfEl.className = 'kpi-val pos'; }
  else { pfEl.textContent = '—'; pfEl.className = 'kpi-val neu'; }
  document.getElementById('k-pf-sub').textContent = gl > 0 ? (useEurPF ? '+' + fmtEUR(gw, false, 0) + ' / −' + fmtEUR(gl, false, 0) : fmtR(gw, 1) + ' / ' + fmtR(-gl, 1)) : 'gains / pertes';

  // Subtitle
  const sub = document.getElementById('dash-subtitle');
  sub.textContent = trades.length > 0 ? 'Dernière entrée : ' + fmtDateFR(trades[0].date, true) + ' · ' + trades[0].asset : 'Aucune entrée pour l\'instant';

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
// Série journalière (fin de journée) : solde en € dès qu'un montant en € existe, sinon R cumulé (R retenus seulement).
function equitySeries() {
  const trades = viewTrades();   // vue filtrée (filtre global)
  const withEur = trades.filter(t => t.pnlEur != null && t.date);
  const useEur = withEur.length > 0;
  const src = useEur ? withEur : analysisTrades().filter(t => t.pnl != null && t.date);
  const byDay = {}, nDay = {};
  src.forEach(t => { byDay[t.date] = (byDay[t.date] || 0) + (useEur ? t.pnlEur : t.pnl); nDay[t.date] = (nDay[t.date] || 0) + 1; });
  // Avec une période filtrée, la courbe part du solde réel au début de la période (départ + P&L antérieur).
  const start = useEur ? balanceBeforeFilter() : 0;
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
  return { useEur, start, pts, maxDD, peakIdx, fmt: v => useEur ? fmtEUR(v, false, 0) : fmtR(v, 2), fmtS: v => useEur ? fmtEUR(v, true, 0) : fmtR(v, 2) };
}
function renderYearProgress() {
  const canvas = document.getElementById('yearProgressChart');
  if (!canvas) return;
  const E = equitySeries(), P = E.pts, t = chartTokens();
  const last = P.length ? P[P.length - 1] : null;
  const endBal = last ? last.bal : E.start;
  const perf = E.useEur && E.start > 0 ? (endBal - E.start) / E.start * 100 : null;
  const curDD = last ? (E.useEur ? last.ddPct : last.ddAbs) : null;

  // Sous-titre de la courbe (les chiffres clés sont dans l'en-tête du Dashboard, pas répétés ici)
  const sub = document.getElementById('year-progress-sub');
  if (sub) sub.textContent = !P.length ? 'Renseigne un P&L (€ ou R) sur tes trades pour voir ta courbe'
    : (E.useEur ? (filterDateRange().from ? 'Solde en €, depuis le début de la période' : 'Solde en €, depuis le solde de départ') : 'R cumulé (aucun montant en € saisi)') + (filterActive() ? ' · filtre actif' : '') + ' · ' + fmtDateFR(P[0].date) + ' → ' + fmtDateFR(last.date) + ' · ' + P.length + ' jour(s) tradé(s)';
  renderHeroSide(E, endBal, perf, curDD);

  if (yearProgressChartInst) { yearProgressChartInst.destroy(); yearProgressChartInst = null; }
  // Journal vide : un message plutôt qu'une grille vide à 0R.
  const empty = !P.length;
  ['eq-empty'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = !empty; });
  ['wrap-year-progress', 'wrap-underwater'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = empty; });
  document.querySelectorAll('#dash-grid [data-widget="year-progress"] .uw-head').forEach(el => { el.hidden = empty; });
  if (empty) { if (underwaterChartInst) { underwaterChartInst.destroy(); underwaterChartInst = null; } return; }
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
        fill: { target: { value: E.start }, above: fxFadeFill(ctx, t.green, chartFillAlpha(.22), false), below: fxFadeFill(ctx, t.red, chartFillAlpha(.22), true) },
        pointRadius: data.map((_, i) => i === peakI || i === data.length - 1 ? 4 : 0), pointBackgroundColor: t.accent, pointBorderColor: t.bg2, pointBorderWidth: 2,
        pointHoverRadius: 5, pointHoverBackgroundColor: t.accent, pointHoverBorderColor: t.bg2, pointHoverBorderWidth: 2, pointHitRadius: 12
      }] },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, layout: { padding: { top: 28, right: 6 } },
        plugins: { tooltip: proTooltip({ callbacks: {
          title: titleCb,
          label: c => (E.useEur ? 'Solde  ' : 'R cumulé  ') + E.fmt(c.raw),
          afterLabel: c => { const p = ptOf(c.dataIndex); if (!p) return []; const dd = E.useEur ? p.ddPct : p.ddAbs; return ['Jour  ' + E.fmtS(p.day) + ' · ' + p.n + ' trade(s)', 'Drawdown  ' + (dd ? (E.useEur ? fmtPct(dd) : fmtR(dd, 2)) : '—')]; }
        } }) },
        scales: proScales({ x: { ticks: { callback: xFmt } }, y: { ticks: { callback: v => E.useEur ? fmtEURCompact(v) : v + 'R' } } })
      },
      plugins: [refLinePlugin('startLine', E.start, E.useEur ? (filterDateRange().from ? 'Début de période ' : 'Départ ') + fmtEUR(E.start) : '0R'), {
        id: 'peakLabel', afterDatasetsDraw(ch) { if (peakI > 0) drawPointLabel(ch, 0, peakI, 'Plus haut ' + E.fmt(data[peakI]), t.accent, true); }
      }, fxGlowPlugin(t.accent), fxPeakPulsePlugin(peakI === data.length - 1 ? peakI : -1)]
    });
  }
  renderUnderwater(E, daily);
}
function renderUnderwater(E, daily) {
  if (underwaterChartInst) { underwaterChartInst.destroy(); underwaterChartInst = null; }
  const canvas = document.getElementById('underwaterChart');
  const sub = document.getElementById('drawdown-sub');
  if (sub) sub.textContent = E.maxDD ? 'max ' + (E.useEur ? fmtPct(E.maxDD.v) + ' (' + fmtEUR(E.maxDD.abs) + ')' : fmtR(E.maxDD.v, 2)) + ' le ' + fmtDateFR(E.maxDD.date, true) : (E.pts.length ? 'aucun drawdown' : '');
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
// En-tête du Dashboard : les 4 chiffres clés du compte, à côté du P&L total (une seule fois sur la page).
function renderHeroSide(E, endBal, perf, curDD) {
  const side = document.getElementById('hero-side');
  if (!side) return;
  // Solde du compte, mis en avant à gauche de la performance.
  const bEl = document.getElementById('k-balance'), bSub = document.getElementById('k-balance-sub');
  if (bEl) {
    const bal = E.pts.length && E.useEur ? endBal : accountSize;
    bEl.textContent = fmtEUR(bal, false, 2);
    const diff = bal - accountSize;
    if (bSub) bSub.innerHTML = '';
    if (bSub) mount(bSub, html`${tr('départ') + ' ' + fmtEUR(accountSize, false, 0)}${E.pts.length && E.useEur && accountSize > 0 ? html` · <span class="tone-${raw(diff >= 0 ? 'green' : 'red')}">${fmtPct(diff / accountSize * 100)}</span>` : ''}`);
  }
  if (!E.pts.length) { mount(side, ''); return; }
  const it = (l, v, tone, title) => html`<div class="hs-item"${raw(title ? ` title="${esc(title)}"` : '')}><span class="hs-label">${l}</span><span class="hs-val${raw(tone ? ' tone-' + tone : '')}">${v}</span></div>`;
  const dd = v => v ? (E.useEur ? fmtPct(v) : fmtR(v, 2)) : (E.useEur ? '0 %' : '0R');
  mount(side, html`${!E.useEur ? it('R cumulé', E.fmt(endBal)) : ''}${perf !== null && !E.useEur ? it('Rendement', fmtPct(perf), perf >= 0 ? 'green' : 'red') : ''}${it('Drawdown max', E.maxDD ? dd(E.maxDD.v) : '0 %', E.maxDD ? 'red' : null, E.maxDD ? 'le ' + fmtDateFR(E.maxDD.date, true) : '')}${it('Drawdown actuel', dd(curDD), curDD ? 'amber' : null, 'écart avec le plus haut du compte')}`);
}

// ── TAUX DE RÉUSSITE : jauges comparées au seuil de rentabilité ─────
function renderWinRateMeters() {
  const trades = viewTrades();   // vue filtrée (filtre global)
  const el = document.getElementById('winrate-body');
  if (!el) return;
  const W = winStats(trades);
  const days = Object.values(dayNet(trades));
  const dW = days.filter(v => v > 1e-6).length, dL = days.filter(v => v < -1e-6).length, dN = days.length;
  const dD = dW + dL, dCI = dD ? wilsonCI(dW, dD) : [0, 0];   // journées neutres exclues, comme les break-even
  const be = breakevenWinRate();
  if (!W.n) { mount(el, html`<p class="empty-note">Apparaîtra dès ton premier trade clôturé.</p>`); return; }
  const row = (name, k, n, lo, hi, thr, thrLbl, foot) => {
    const rate = n ? k / n : 0, low = n < 10;
    const ok = thr === null ? null : rate >= thr;
    const tone = ok === null ? 'accent' : (ok ? 'green' : 'red');
    const status = low ? html`<span class="wr-status tone-muted">● échantillon faible (n=${n})</span>`
      : ok === null ? '' : html`<span class="wr-status tone-${raw(tone)}">${ok ? '▲ au-dessus' : '▼ en dessous'} du seuil</span>`;
    return html`<div class="wr-row">
      <div class="wr-top"><span><span class="wr-name">${name}</span><br><span class="wr-val">${fmtRate(rate * 100, 1)}</span></span>${status}</div>
      <div class="meter" title="Intervalle de confiance 95 % : ${Math.round(lo * 100)}–${Math.round(hi * 100)} %">
        <div class="meter-ci" style="${raw(`left:${lo * 100}%;width:${Math.max(0, (hi - lo) * 100)}%`)}"></div>
        <div class="meter-fill fill-${raw(tone)}${raw(low ? ' dim' : '')}" style="${raw(`width:${rate * 100}%`)}"></div>
        ${thr !== null ? html`<div class="meter-tick" style="${raw(`left:calc(${thr * 100}% - 1px)`)}"></div><div class="meter-tick-lbl" style="${raw(`left:${Math.min(88, Math.max(12, thr * 100))}%`)}">${thrLbl}</div>` : ''}
      </div>
      <div class="wr-foot"><span>${foot}</span><span>IC 95 % : ${Math.round(lo * 100)}–${Math.round(hi * 100)} %</span></div>
    </div>`;
  };
  mount(el, html`${row('Par trade', W.wins, W.n, W.lo, W.hi, be, be !== null ? 'seuil ' + Math.round(be * 100) + ' %' : '', fmtWinLine(W) + (be !== null ? ' · seuil = perte moy. ÷ (gain moy. + perte moy.)' : ''))}${dD ? row('Par journée', dW, dD, dCI[0], dCI[1], .5, '50 %', dW + ' jour(s) + · ' + dL + ' jour(s) −' + (dN - dW - dL ? ' · ' + (dN - dW - dL) + ' neutre(s)' : '')) : ''}`);
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
    if (statsEl) mount(statsEl, html`<p class="empty-note">Il faut au moins 5 trades clos avec un R pour tracer la distribution.</p>`);
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
  const fmtB = v => fmtR(v, 1).replace(/R$/, '');
  const labels = buckets.map((_, i) => fmtB(b0 + i * bw));
  const colors = buckets.map((_, i) => (b0 + i * bw + bw / 2) >= 0 ? t.green : t.red);
  const wins = rValues.filter(v => v > 0), losses = rValues.filter(v => v < 0);
  const avgW = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : null;
  const avgL = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null;
  const exp = rValues.reduce((a, b) => a + b, 0) / rValues.length;
  // Les trois repères verticaux du graphique sont nommés ici (légende), plus au-dessus des barres où ils se chevauchaient.
  const mark = (cls, label, v) => html`<div class="es-item"><span class="es-label"><i class="rd-key ${raw(cls)}" aria-hidden="true"></i>${label}</span><span class="es-val">${v}</span></div>`;
  if (statsEl) mount(statsEl, html`${mark('acc', 'Espérance', fmtR(exp) + 'R / trade')}${mark('grn', 'Gain moyen', avgW !== null ? fmtR(avgW) + 'R' : '—')}${mark('red', 'Perte moyenne', avgL !== null ? fmtR(avgL) + 'R' : '—')}${esItem('Trades', String(closed.length))}`);
  if (!chartsAvailable('rDistChart')) return;
  const idxOf = v => Math.max(0, Math.min(nb - 1, (v - b0) / bw - .5));   // position continue (au centre des classes)
  rDistChartInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [{ data: buckets, backgroundColor: colors, hoverBackgroundColor: colors.map(c => withAlpha(c, .8)), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 24, barPercentage: .92, categoryPercentage: .92 }] },
    options: {
      responsive: true, maintainAspectRatio: false, layout: { padding: { top: 6 } },
      plugins: { tooltip: proTooltip({ displayColors: false, callbacks: { title: items => items[0] ? 'De ' + items[0].label + 'R à ' + fmtR(b0 + (items[0].dataIndex + 1) * bw) + 'R' : '', label: c => c.raw + ' trade' + (c.raw !== 1 ? 's' : '') + ' · ' + Math.round(c.raw / closed.length * 100) + ' %' } }) },
      scales: proScales({ xTicks: 12, yWidth: 40, x: { ticks: { callback: function (v) { return this.getLabelForValue(v) + 'R'; } } }, y: { ticks: { precision: 0 } } })
    },
    plugins: [{
      id: 'rMarkers',
      afterDatasetsDraw(chart) {
        const { ctx: c, chartArea: a, scales } = chart;
        const px = v => { const x = scales.x, i = idxOf(v), lo = Math.floor(i), hi = Math.min(nb - 1, lo + 1); return x.getPixelForValue(lo) + (x.getPixelForValue(hi) - x.getPixelForValue(lo)) * (i - lo); };
        const mark = (v, color) => {
          if (v === null) return;
          const x = Math.round(px(v)) + .5; c.save();
          c.strokeStyle = color; c.lineWidth = 1.5; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(x, a.top); c.lineTo(x, a.bottom); c.stroke(); c.restore();
        };
        mark(avgL, t.red); mark(avgW, t.green); mark(exp, t.accent);
      }
    }]
  });
}

// ── RENDEMENTS MENSUELS : P&L € et % du solde en début de mois ──────
function renderMonthlyReturnsTable() {
  const trades = viewTrades();   // vue filtrée (filtre global)
  const cont = document.getElementById('monthly-returns-table');
  if (!cont) return;
  const byMonth = {};
  trades.forEach(t => { if (!/^\d{4}-\d{2}/.test(t.date || '') || t.pnlEur == null) return; const k = t.date.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + t.pnlEur; });
  const keys = Object.keys(byMonth).sort();
  if (!keys.length) { mount(cont, html`<p class="empty-note">Pas encore de données mensuelles (il faut des P&amp;L en €).</p>`); return; }
  // Solde au début de chaque mois = solde de départ + P&L des mois précédents.
  const startBal = {}; let bal = accountSize || 0;
  keys.forEach(k => { startBal[k] = bal; bal += byMonth[k]; });
  const years = [...new Set(keys.map(k => k.slice(0, 4)))];
  const yearStart = {}; years.forEach(y => { yearStart[y] = startBal[keys.find(k => k.startsWith(y))]; });
  const maxAbs = Math.max(...Object.values(byMonth).map(Math.abs), 1);
  const M = LANG === 'en' ? ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] : ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  const pctTxt = (v, base) => base > 0 ? fmtPct(v / base * 100) : '';
  // Colonnes : du premier au dernier mois tradé (toutes années confondues) — pas de rangée de « — » pour les mois vides.
  const mNums = keys.map(k => parseInt(k.slice(5, 7), 10) - 1);
  const cols = []; for (let i = Math.min(...mNums); i <= Math.max(...mNums); i++) cols.push(i);
  const yearRow = y => {
    let tot = 0;
    const cells = cols.map(i => {
      const k = y + '-' + String(i + 1).padStart(2, '0'), v = byMonth[k];
      if (v === undefined) return html`<td class="mr-empty">—</td>`;
      tot += v;
      const hc = heatColors(v, maxAbs);   // couleur continue selon le montant : seule valeur calculée laissée en ligne
      return html`<td class="mr-td"><div class="mr-cell" style="${raw(`background:${hc.bg};color:${hc.strong ? hc.onFill : 'var(--txt)'}`)}" title="${M[i] + ' ' + y} : ${fmtEUR(v, true, 2)}"><b>${fmtEURCompact(v).replace(/^(?!-)/, v > 0 ? '+' : '')}</b><span>${pctTxt(v, startBal[k])}</span></div></td>`;
    });
    return html`<tr><td class="mr-year">${y}</td>${cells}<td class="mr-total tone-${raw(tot >= 0 ? 'green' : 'red')}">${fmtEUR(tot, true)}<div class="mr-total-pct">${pctTxt(tot, yearStart[y])}</div></td></tr>`;
  };
  mount(cont, html`<div class="scroll-x"><table class="mr-table" style="${raw('--mr-cols:' + cols.length)}"><thead><tr><th></th>${cols.map(i => html`<th class="c">${M[i]}</th>`)}<th class="r">Total</th></tr></thead><tbody>${years.slice().reverse().map(yearRow)}</tbody></table></div>`);
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
    const k = dow + '-' + h; const g = grid[k] = grid[k] || { n: 0, w: 0, l: 0, net: 0 };
    g.n++; g.net += val(t); if (t.res === 'TP') g.w++; else if (t.res === 'SL') g.l++;
    minH = Math.min(minH, h); maxH = Math.max(maxH, h); dows.add(dow);
  });
  if (maxH < 0) { mount(cont, html`<p class="empty-note">Renseigne l'heure d'entrée de tes trades pour voir tes meilleurs créneaux.</p>`); if (sub) sub.textContent = ''; return; }
  const days = [0, 1, 2, 3, 4].concat([5, 6].filter(d => dows.has(d)));
  const DN = LANG === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], DL = LANG === 'en' ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] : ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const hours = []; for (let h = minH; h <= maxH; h++) hours.push(h);
  const maxAbs = Math.max(...Object.values(grid).map(g => Math.abs(g.net)), 1e-9);
  const fmtV = v => useEur ? fmtEUR(v, true, 0) : fmtR(v, 2);
  heatDHCells = [];
  const cells = [];
  days.forEach(d => {
    cells.push(html`<div class="hm-rowlbl">${DN[d]}</div>`);
    hours.forEach(h => {
      const g = grid[d + '-' + h];
      if (!g) { cells.push(html`<div class="hm-cell"></div>`); return; }
      const hc = heatColors(g.net, maxAbs, { boost: true }), i = heatDHCells.length;
      heatDHCells.push({ title: DL[d] + ' · ' + String(h).padStart(2, '0') + 'h – ' + String((h + 1) % 24).padStart(2, '0') + 'h', g });
      // Montant écrit seulement dans les cases marquantes (≥ 45 % du plus grand écart, 3 trades ou plus) : le reste passe par l'info-bulle.
      const label = g.n >= 3 && Math.abs(g.net) >= maxAbs * 0.45 ? (useEur ? fmtEURCompact(g.net).replace(/^(?!-)/, g.net > 0 ? '+' : '') : fmtR(g.net, 1)) : '';
      cells.push(html`<div class="hm-cell has${raw(g.n < 3 ? ' dim' : '')}" tabindex="0" data-i="${i}" style="${raw(`background:${hc.bg};--hm-ink:${hc.strong ? hc.onFill : 'var(--txt)'}`)}" aria-label="${heatDHCells[i].title} : ${fmtV(g.net)}, ${g.n} trade(s)">${label ? html`<span class="hm-v">${label}</span>` : ''}</div>`);
    });
  });
  mount(cont, html`<div class="hm-grid" style="${raw('--cols:' + hours.length)}"><div></div>${hours.map(h => html`<div class="hm-collbl">${String(h).padStart(2, '0')}h</div>`)}${cells}</div>
    <div class="hm-legend"><span>Perte</span><span class="hm-scale">${[-1, -.6, -.25, .25, .6, 1].map(r => html`<span style="${raw('background:' + heatColors(r * maxAbs, maxAbs, { boost: true }).bg)}"></span>`)}</span><span>Gain</span><span class="hm-legend-note">Cases pâles : moins de 3 trades · survole une case pour le détail</span></div>`);
  const ranked = heatDHCells.filter(c => c.g.n >= 3).sort((a, b) => b.g.net - a.g.net);
  if (sub) sub.textContent = ranked.length ? 'Meilleur créneau : ' + ranked[0].title + ' (' + fmtV(ranked[0].g.net) + ', ' + ranked[0].g.n + ' trades)' + (ranked.length > 1 && ranked[ranked.length - 1].g.net < 0 ? ' · le plus coûteux : ' + ranked[ranked.length - 1].title + ' (' + fmtV(ranked[ranked.length - 1].g.net) + ')' : '') : (useEur ? 'Résultat net en € par créneau' : 'R cumulé par créneau');
  const show = (e, el) => {
    const c = heatDHCells[+el.dataset.i]; if (!c) return;
    const ev = e && e.clientX !== undefined ? e : (() => { const r = el.getBoundingClientRect(); return { clientX: r.right, clientY: r.bottom }; })();
    showHtmlTip(ev, c.title.charAt(0).toUpperCase() + c.title.slice(1), [['Résultat net', fmtV(c.g.net), c.g.net >= 0 ? 'green' : 'red'], ['Trades', String(c.g.n)], ['Win rate', c.g.w + c.g.l ? Math.round(c.g.w / (c.g.w + c.g.l) * 100) + ' %' : '—']]);
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
  const trades = viewTrades();   // vue filtrée (filtre global)
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
  const sev = p => p === null ? 'muted' : (p >= 85 ? 'green' : p >= 60 ? 'amber' : 'red');
  if (list) mount(list, html`${d.items.map(i => html`<div class="dc-item${raw(i.pct === null ? ' off' : '')}" title="${i.hint}">
      <div class="dc-top"><span class="dc-label">${i.label}</span><span class="dc-val">${i.pct === null ? html`<span class="tone-muted">non suivi</span>` : Math.round(i.pct) + ' %'}${i.n ? html` <span class="tone-muted">· n=${i.n}</span>` : ''}</span></div>
      <div class="meter thin"><div class="meter-fill fill-${raw(sev(i.pct))}" style="${raw('width:' + (i.pct === null ? 0 : Math.round(i.pct)) + '%')}"></div></div></div>`)}`);
  const scoreEl = document.getElementById('discipline-score-val'), bar = document.getElementById('discipline-score-marker'), note = document.getElementById('discipline-note');
  if (scoreEl) { scoreEl.textContent = d.score === null ? '—' : d.score; scoreEl.classList.toggle('tone-muted', d.score === null); scoreEl.classList.toggle('tone-txt', d.score !== null); }
  if (bar) { bar.style.width = (d.score === null ? 0 : d.score) + '%'; bar.className = bar.className.replace(/\s*fill-\w+/g, '') + ' fill-' + sev(d.score); }
  if (note) note.textContent = d.score === null ? 'Il faut au moins 2 critères suivis pour calculer un score sur 100.' : 'Score sur 100 · ' + d.tracked + ' critère(s) suivi(s) sur ' + d.total + '. Survole un critère pour sa définition.';
}

// ── PERFORMANCE PAR ACTIF ────────────────────────────────────────────
function renderAssetBars() {
  const trades = viewTrades();   // vue filtrée (filtre global)
  const cont = document.getElementById('asset-bars');
  if (!cont) return;
  if (!trades.length) { mount(cont, html`<p class="empty-note">Apparaîtra dès ton premier trade.</p>`); return; }
  const groups = {};
  trades.forEach(t => { const k = t.asset || '—'; (groups[k] = groups[k] || []).push(t); });
  const rows = Object.entries(groups).map(([asset, list]) => {
    const e = list.filter(t => t.pnlEur != null), r = analysisTrades().filter(t => (t.asset || '—') === asset && t.pnl != null);
    return { asset, w: winStats(list), eur: e.length ? e.reduce((a, t) => a + t.pnlEur, 0) : null, r: r.reduce((a, t) => a + t.pnl, 0) };
  }).filter(r => r.w.n > 0).sort((a, b) => b.w.n - a.w.n || a.asset.localeCompare(b.asset));
  if (!rows.length) { mount(cont, html`<p class="empty-note">Aucun trade clôturé.</p>`); return; }
  const be = breakevenWinRate();
  const MAX = 8, shown = rows.slice(0, MAX), rest = rows.slice(MAX);
  mount(cont, html`<div class="asset-row head"><span>Actif</span><span>Win rate${be !== null ? ' (repère : seuil ' + Math.round(be * 100) + ' %)' : ''}</span><span>Win</span><span>n</span><span>P&amp;L</span></div>
    ${shown.map(({ asset, w, eur, r }) => {
      const low = w.n < 10, pnl = eur !== null ? eur : r;
      const tip = asset + ' : ' + w.wins + ' G / ' + w.losses + ' P' + (w.be ? ' / ' + w.be + ' BE' : '') + ' · ' + fmtCI(w) + (low ? ' · échantillon trop faible pour conclure (n < 10)' : '');
      return html`<div class="asset-row${raw(low ? ' low' : '')}" title="${tip}">
        <span class="asset-name">${asset.length > 12 ? asset.slice(0, 11) + '…' : asset}</span>
        ${UI.meter(w.rate * 100, 'accent', { tick: be !== null ? be * 100 : null })}
        <span class="asset-num">${Math.round(w.rate * 100)} %</span>
        <span class="asset-num muted">${w.n}${low ? ' ⚠' : ''}</span>
        <span class="asset-num tone-${raw(pnl >= 0 ? 'green' : 'red')}">${eur !== null ? fmtEUR(eur, true) : fmtR(r, 1)}</span>
      </div>`;
    })}
    ${rest.length ? html`<p class="empty-note mt-8">+ ${rest.length} autre(s) actif(s) — détail dans Statistiques › Performance par asset</p>` : ''}`);
}


// Chiffre du bandeau sous un graphique (libellé + valeur, ton optionnel : green / red…).
function esItem(label, value, tone) {
  return html`<div class="es-item"><span class="es-label">${label}</span><span class="es-val${raw(tone ? ' tone-' + tone : '')}">${value}</span></div>`;
}

// ── DONUTS : part de gagnants par trade, par journée, par semaine ──────
// Même lecture à trois échelles : un bon win rate par trade qui ne se retrouve pas en journées/semaines gagnantes
// signale des pertes concentrées (grosses journées rouges) — c'est l'intérêt de les voir côte à côte.
let donutInsts = {};
function renderWinDonuts() {
  if (!document.getElementById('donut-row')) return;
  const list = viewTrades();   // vue filtrée (filtre global)
  const W = winStats(list), be = breakevenWinRate();
  const days = Object.entries(dayNet(list));
  const dayCount = v => ({ w: v.filter(x => x > 1e-6).length, l: v.filter(x => x < -1e-6).length, n: v.length });
  const dC = dayCount(days.map(([, v]) => v));
  const weeks = {};
  days.forEach(([d, v]) => { const dt = new Date(d + 'T00:00:00'); if (isNaN(dt)) return; const k = getISOWeek(dt); const key = k.year + '-' + k.week; weeks[key] = (weeks[key] || 0) + v; });
  const wC = dayCount(Object.values(weeks));
  const pct = (a, n) => n ? Math.round(a / n * 100) : null;
  const fmtP = p => p === null ? '—' : p + ' %';

  drawDonut('trades', [['Gagnants', W.wins, 'green'], ['Perdants', W.losses, 'red'], ['Break-even', W.be, 'muted']],
    W.n ? fmtRate(W.rate * 100, 0) : '—', 'gagnants',
    W.n ? html`${W.be ? html`${W.be} BE exclus · ` : ''}${be !== null ? html`seuil <b class="tone-${raw(W.rate >= be ? 'green' : 'red')}">${Math.round(be * 100)} %</b>` : W.n + ' trades gagnants ou perdants'}` : 'aucun trade clos',
    W.n ? fmtWinLine(W) + ' · ' + fmtCI(W) + (be !== null ? ' · seuil de rentabilité ' + Math.round(be * 100) + ' %' : '') + (W.be ? ' · les break-even ne comptent ni comme gains ni comme pertes' : '') : '');
  drawDonut('days', [['Gagnantes', dC.w, 'green'], ['Perdantes', dC.l, 'red'], ['Neutres', dC.n - dC.w - dC.l, 'muted']],
    fmtP(pct(dC.w, dC.w + dC.l)), 'gagnantes', dC.n ? dC.n + ' jour' + (dC.n > 1 ? 's' : '') + ' tradé' + (dC.n > 1 ? 's' : '') : 'aucune journée', 'Journée gagnante = résultat net du jour positif (journées neutres exclues)');
  drawDonut('weeks', [['Gagnantes', wC.w, 'green'], ['Perdantes', wC.l, 'red'], ['Neutres', wC.n - wC.w - wC.l, 'muted']],
    fmtP(pct(wC.w, wC.w + wC.l)), 'gagnantes', wC.n ? wC.n + ' semaine' + (wC.n > 1 ? 's' : '') : 'aucune semaine', 'Semaine gagnante = résultat net de la semaine (lundi → dimanche) positif (semaines neutres exclues)');
}
function drawDonut(key, parts, center, centerLbl, sub, title) {
  const total = parts.reduce((s, p) => s + p[1], 0);
  const t = chartTokens(), col = { green: t.green, red: t.red, muted: withAlpha(t.txt3, .55) };
  const set = (id, fn) => { const el = document.getElementById('dn-' + key + '-' + id); if (el) fn(el); };
  set('pct', el => { el.textContent = center; });
  set('lbl', el => { el.textContent = total ? centerLbl : ''; });
  set('sub', el => mount(el, html`${sub}`));
  const card = document.getElementById('dn-' + key + '-chart');
  if (card) card.closest('.donut-card').title = title || '';
  set('legend', el => mount(el, html`${parts.filter(p => p[1] > 0 || p[2] !== 'muted').map(([lbl, n, tone]) => html`<li><i class="dn-dot fill-${raw(tone)}" aria-hidden="true"></i><span class="dn-l">${lbl}</span><b>${n}</b><span class="dn-p">${total ? Math.round(n / total * 100) + ' %' : ''}</span></li>`)}`));
  if (donutInsts[key]) { donutInsts[key].destroy(); delete donutInsts[key]; }
  if (!card || !chartsAvailable('dn-' + key + '-chart')) return;
  const shown = total ? parts.filter(p => p[1] > 0) : [['', 1, 'empty']];
  donutInsts[key] = new Chart(card.getContext('2d'), {
    type: 'doughnut',
    data: { labels: shown.map(p => p[0]), datasets: [{ data: shown.map(p => p[1]), backgroundColor: shown.map(p => p[2] === 'empty' ? t.border : col[p[2]]),
      borderColor: t.bg2, borderWidth: shown.length > 1 ? 2 : 0, hoverOffset: total ? 4 : 0, borderRadius: shown.length > 1 ? 2 : 0 }] },
    options: {
      responsive: false, cutout: '74%', animation: { duration: 400 }, layout: { padding: 4 },
      plugins: { legend: { display: false }, tooltip: total ? proTooltip({ displayColors: false, callbacks: { title: () => '', label: c => c.label + ' : ' + c.raw + ' (' + Math.round(c.raw / total * 100) + ' %)' } }) : { enabled: false } }
    }
  });
}
