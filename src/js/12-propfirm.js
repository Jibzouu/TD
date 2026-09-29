// ── PROP FIRM : réglages ─────────────────────────────────────────────
function loadPfSetting(key, fallback) {
  const v = DB.getItem((JP + 'pf_') + key);
  return v === null ? fallback : v;
}
function savePfSetting(key, val) {
  DB.setItem((JP + 'pf_') + key, val);
}
function initPropFirmSettings() {
  const enabled = loadPfSetting('enabled', JOURNAL_ID === 'pf' ? '1' : '0');
  document.getElementById('pf-enabled').checked = enabled === '1' || enabled === 1;
  document.getElementById('pf-target-pct').value = loadPfSetting('target_pct', '10');
  document.getElementById('pf-maxdd-pct').value = loadPfSetting('maxdd_pct', '10');
  document.getElementById('pf-dd-type').value = loadPfSetting('dd_type', 'trailing_eod');
  document.getElementById('pf-min-days').value = loadPfSetting('min_days', '4');
  const consOn = loadPfSetting('consistency_on', '1');
  document.getElementById('pf-consistency-on').checked = consOn === '1' || consOn === 1;
  document.getElementById('pf-consistency-pct').value = loadPfSetting('consistency_pct', '50');
}

// ── PROP FIRM : moteur de conformité ─────────────────────────────────
function computeEquitySeries() {
  const sorted = [...trades].reverse().filter(t => t.pnlEur !== null && t.pnlEur !== undefined && t.date);
  let cum = accountSize || 10000;
  const points = [];
  sorted.forEach(t => { cum += t.pnlEur; points.push({ date: t.date, equity: cum }); });
  const eodMap = {};
  points.forEach(p => { eodMap[p.date] = p.equity; });
  const eodSeries = Object.entries(eodMap).sort((a,b) => a[0].localeCompare(b[0])).map(([date,equity]) => ({ date, equity }));
  return { points, eodSeries, currentEquity: cum };
}

function computePropFirmStatus() {
  const startBalance = accountSize || 10000;
  const maxDDPct = parseFloat(loadPfSetting('maxdd_pct','10')) || 10;
  const ddType = loadPfSetting('dd_type','trailing_eod');
  const profitTargetPct = parseFloat(loadPfSetting('target_pct','10')) || 10;
  const minDays = parseInt(loadPfSetting('min_days','4'), 10) || 0;
  const consOnRaw = loadPfSetting('consistency_on','1');
  const consistencyOn = consOnRaw === '1' || consOnRaw === 1;
  const consistencyPct = parseFloat(loadPfSetting('consistency_pct','50')) || 50;
  const dailyLimitPct = loadDDLimitPct();

  const { points, eodSeries, currentEquity } = computeEquitySeries();
  const ddAmount = startBalance * (maxDDPct/100);

  let floor;
  if (ddType === 'static') {
    floor = startBalance - ddAmount;
  } else if (ddType === 'trailing_intraday') {
    let peak = startBalance;
    points.forEach(p => { if (p.equity > peak) peak = p.equity; });
    floor = peak - ddAmount;
  } else {
    let peak = startBalance;
    eodSeries.forEach(p => { if (p.equity > peak) peak = p.equity; });
    floor = peak - ddAmount;
  }
  const distanceToFloor = currentEquity - floor;
  const breached = currentEquity <= floor;

  const totalPnl = currentEquity - startBalance;
  const targetAmount = startBalance * (profitTargetPct/100);
  const targetProgress = targetAmount > 0 ? Math.min(Math.max(totalPnl/targetAmount*100,0),100) : 0;
  const targetReached = totalPnl >= targetAmount;

  const tradingDays = new Set(trades.filter(t => t.date).map(t => t.date)).size;
  const daysOk = tradingDays >= minDays;

  const byDay = {};
  trades.forEach(t => { if (!t.date || t.pnlEur===null || t.pnlEur===undefined) return; byDay[t.date] = (byDay[t.date]||0) + t.pnlEur; });
  const dayValues = Object.values(byDay);
  const bestDayPnl = dayValues.length ? Math.max(...dayValues) : 0;
  const positiveDaysSum = dayValues.filter(v => v > 0).reduce((a,b) => a+b, 0);
  const bestDayPct = positiveDaysSum > 0 ? (bestDayPnl/positiveDaysSum*100) : 0;
  const consistencyOk = !consistencyOn || positiveDaysSum <= 0 || bestDayPct <= consistencyPct;

  // Perte journalière max (réglée dans le bandeau DD du Dashboard) : une seule journée au-delà = challenge échoué.
  // Les montants saisis à la main dans le bandeau DD remplacent le calcul automatique pour le jour concerné.
  const dailyLimitAmount = startBalance * (dailyLimitPct / 100);
  const manualDD = loadDDManualMap();
  const dailyNet = Object.assign({}, byDay);
  Object.entries(manualDD).forEach(([d, v]) => { if (typeof v === 'number' && isFinite(v)) dailyNet[d] = v; });
  const dailyEntries = Object.entries(dailyNet).sort((a, b) => a[0].localeCompare(b[0]));
  const dailyBreaches = dailyLimitAmount > 0 ? dailyEntries.filter(([, v]) => v < -dailyLimitAmount - 1e-9).map(([d]) => d) : [];
  const worstDay = dailyEntries.reduce((w, e) => (w === null || e[1] < w[1]) ? e : w, null);
  const dailyOk = dailyBreaches.length === 0;

  return { startBalance, maxDDPct, ddType, profitTargetPct, minDays, consistencyOn, consistencyPct, dailyLimitPct,
    currentEquity, floor, distanceToFloor, breached, totalPnl, targetAmount, targetProgress, targetReached,
    tradingDays, daysOk, bestDayPnl, bestDayPct, consistencyOk,
    dailyLimitAmount, dailyBreaches, dailyOk, worstDayDate: worstDay ? worstDay[0] : null, worstDayPnl: worstDay ? worstDay[1] : 0 };
}

const PF_DD_TYPE_LABELS = { static: 'Statique', trailing_eod: 'Trailing (fin de journée)', trailing_intraday: 'Trailing (intrajournalier)' };

function renderPropFirm() {
  initPropFirmSettings();
  const echoEl = document.getElementById('pf-daily-limit-echo');
  if (echoEl) echoEl.textContent = loadDDLimitPct();

  const cont = document.getElementById('propfirm-status');
  if (!cont) return;
  const enabled = document.getElementById('pf-enabled').checked;
  if (!enabled) {
    cont.innerHTML = `<div class="panel"><p style="font-size:12px;color:var(--txt3);padding:18px 0">Active le suivi ci-dessus pour voir ta progression face aux règles du challenge (drawdown, objectif de profit, jours de trading, consistance).</p></div>`;
    return;
  }

  const s = computePropFirmStatus();
  const ddPct = s.startBalance>0 ? Math.min(Math.max((s.startBalance*(s.maxDDPct/100) - s.distanceToFloor) / (s.startBalance*(s.maxDDPct/100)) * 100, 0), 100) : 0;
  const ddCol = s.breached ? 'var(--red)' : ddPct >= 75 ? 'var(--red)' : ddPct >= 50 ? 'var(--amber)' : 'var(--green)';

  const allOk = !s.breached && s.dailyOk && s.consistencyOk;
  const readyToPass = allOk && s.targetReached && s.daysOk;
  let verdictText, verdictCol, verdictIcon;
  if (s.breached) { verdictText = 'Drawdown maximum dépassé — challenge en échec'; verdictCol = 'var(--red)'; verdictIcon = '🚨'; }
  else if (!s.dailyOk) { verdictText = 'Perte journalière max dépassée (' + s.dailyBreaches.map(esc).join(', ') + ') — challenge en échec'; verdictCol = 'var(--red)'; verdictIcon = '🚨'; }
  else if (readyToPass) { verdictText = 'Toutes les conditions sont réunies'; verdictCol = 'var(--green)'; verdictIcon = '✅'; }
  else if (!s.consistencyOk) { verdictText = 'Règle de consistance non respectée sur le profit actuel'; verdictCol = 'var(--amber)'; verdictIcon = '⚠️'; }
  else { verdictText = 'En cours — conditions pas encore toutes réunies'; verdictCol = 'var(--blue)'; verdictIcon = '⏳'; }

  cont.innerHTML = `
    <div class="panel" style="margin-bottom:20px;border-left:3px solid ${verdictCol}">
      <div style="padding:16px 18px;display:flex;align-items:center;gap:12px;font-size:13px;color:${verdictCol};font-weight:600">
        <span style="font-size:18px">${verdictIcon}</span> ${verdictText}
      </div>
    </div>
    <div class="panel" style="margin-bottom:12px">
      <div class="panel-hdr"><span>Progression du challenge<small class="panel-sub">équité en fin de journée · objectif et seuil de perte maximale</small></span></div>
      <div class="chart-wrap" style="height:260px"><canvas id="pfEquityChart"></canvas></div>
    </div>
    <div class="charts-row" style="grid-template-columns:1fr 1fr">
      <div class="panel">
        <div class="panel-hdr">Drawdown — ${PF_DD_TYPE_LABELS[s.ddType]}</div>
        <div style="padding:4px 0 0">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
            <span style="font-size:22px;font-weight:700;font-family:var(--mono);color:${ddCol}">${s.distanceToFloor>=0?'':'-'}${fmtEUR(Math.abs(s.distanceToFloor))}</span>
            <span style="font-size:11px;color:var(--txt3);font-family:var(--mono)">marge avant seuil</span>
          </div>
          <div style="height:8px;border-radius:calc(var(--r) * .5);background:var(--bg4);overflow:hidden">
            <div style="height:100%;width:${ddPct}%;background:${ddCol};border-radius:calc(var(--r) * .5)"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;font-family:var(--mono);color:var(--txt3)">
            <span>Équité : ${fmtEUR(s.currentEquity)}</span>
            <span>Seuil : ${fmtEUR(s.floor)}</span>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-hdr">Objectif de profit</div>
        <div style="padding:4px 0 0">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px">
            <span style="font-size:22px;font-weight:700;font-family:var(--mono);color:${s.totalPnl>=0?'var(--green)':'var(--red)'}">${fmtEUR(s.totalPnl, true)}</span>
            <span style="font-size:11px;color:var(--txt3);font-family:var(--mono)">objectif : ${fmtEUR(s.targetAmount)}</span>
          </div>
          <div style="height:8px;border-radius:calc(var(--r) * .5);background:var(--bg4);overflow:hidden">
            <div style="height:100%;width:${s.targetProgress}%;background:${s.targetReached?'var(--green)':'var(--blue)'};border-radius:calc(var(--r) * .5)"></div>
          </div>
          <div style="margin-top:6px;font-size:11px;font-family:var(--mono);color:var(--txt3)">${s.targetProgress.toFixed(0)}% de l'objectif ${s.targetReached?'— atteint ✓':''}</div>
        </div>
      </div>
    </div>
    <div class="charts-row" style="grid-template-columns:repeat(3,1fr)">
      <div class="panel">
        <div class="panel-hdr">Perte journalière max</div>
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
          <span style="font-size:22px;font-weight:700;font-family:var(--mono);color:${s.dailyOk?'var(--green)':'var(--red)'}">${s.worstDayDate && s.worstDayPnl < 0 ? fmtEUR(s.worstDayPnl) : '0 €'}</span>
          <span style="font-size:12px;color:var(--txt3);font-family:var(--mono)">pire journée${s.worstDayDate && s.worstDayPnl < 0 ? ' (' + esc(s.worstDayDate) + ')' : ''} · limite −${fmtEUR(s.dailyLimitAmount)} (${s.dailyLimitPct} %) ${s.dailyOk?'✓':'✗'}</span>
        </div>
        ${s.dailyOk ? '' : `<p style="font-size:11px;color:var(--red);margin-top:8px;font-family:var(--mono)">${s.dailyBreaches.length} journée(s) au-delà de la limite : ${s.dailyBreaches.map(esc).join(', ')}</p>`}
      </div>
      <div class="panel">
        <div class="panel-hdr">Jours de trading</div>
        <div style="display:flex;align-items:baseline;gap:8px">
          <span style="font-size:22px;font-weight:700;font-family:var(--mono);color:${s.daysOk?'var(--green)':'var(--txt)'}">${s.tradingDays}</span>
          <span style="font-size:12px;color:var(--txt3);font-family:var(--mono)">/ ${s.minDays} minimum ${s.daysOk?'✓':''}</span>
        </div>
      </div>
      <div class="panel">
        <div class="panel-hdr">Règle de consistance ${s.consistencyOn?'':'(désactivée)'}</div>
        ${s.consistencyOn ? `<div style="display:flex;align-items:baseline;gap:8px">
          <span style="font-size:22px;font-weight:700;font-family:var(--mono);color:${s.consistencyOk?'var(--green)':'var(--red)'}">${s.bestDayPct.toFixed(0)}%</span>
          <span style="font-size:12px;color:var(--txt3);font-family:var(--mono)">meilleur jour / profit total (max ${s.consistencyPct}%) ${s.consistencyOk?'✓':'✗'}</span>
        </div>` : `<p style="font-size:12px;color:var(--txt3)">Active-la dans les paramètres si ta firme l'impose (ex : FTMO).</p>`}
      </div>
    </div>`;
  safeRun(() => renderPfEquityChart(s), 'renderPfEquityChart');
}

let pfEquityChartInst = null;
function renderPfEquityChart(st) {
  if (pfEquityChartInst) { pfEquityChartInst.destroy(); pfEquityChartInst = null; }
  const canvas = document.getElementById('pfEquityChart');
  if (!canvas || !chartsAvailable('pfEquityChart')) return;
  const { eodSeries, points } = computeEquitySeries();
  const t = chartTokens(), start = st.startBalance, dd = start * (st.maxDDPct / 100), target = start + st.targetAmount;
  // Seuil jour par jour, selon le type de drawdown choisi (statique, trailing fin de journée, trailing intrajournalier).
  let peak = start; const floors = [start - dd];
  eodSeries.forEach(p => {
    if (st.ddType === 'trailing_intraday') points.filter(q => q.date === p.date).forEach(q => { peak = Math.max(peak, q.equity); });
    else if (st.ddType === 'trailing_eod') peak = Math.max(peak, p.equity);
    floors.push(st.ddType === 'static' ? start - dd : peak - dd);
  });
  const labels = ['Départ', ...eodSeries.map(p => p.date)], eq = [start, ...eodSeries.map(p => +p.equity.toFixed(2))];
  pfEquityChartInst = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Équité', data: eq, borderColor: t.accent, borderWidth: chartBorderW(2), tension: 0, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: t.accent, pointHoverBorderColor: t.bg2, pointHoverBorderWidth: 2, fill: { target: 1, above: withAlpha(t.accent, chartFillAlpha(.08)), below: withAlpha(t.red, chartFillAlpha(.2)) } },
      { label: 'Seuil de perte max', data: floors.map(v => +v.toFixed(2)), borderColor: t.red, borderWidth: 1.5, borderDash: [5, 4], stepped: true, pointRadius: 0, pointHoverRadius: 0, fill: false },
      { label: 'Objectif', data: labels.map(() => target), borderColor: t.green, borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 0, fill: false }
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, layout: { padding: { top: 8 } },
      plugins: {
        legend: { display: true, position: 'top', align: 'end', labels: { color: t.txt2, font: { family: cssVar('--sans', 'Inter'), size: 11.5 }, boxWidth: 14, boxHeight: 2, padding: 14 } },
        tooltip: proTooltip({ callbacks: {
          title: items => { const l = items[0] ? items[0].label : ''; return l === 'Départ' ? 'Départ du challenge' : fmtDateFR(l, true); },
          label: c => c.dataset.label + '  ' + fmtEUR(c.raw),
          footer: items => { const e = items.find(x => x.datasetIndex === 0), f = items.find(x => x.datasetIndex === 1); return e && f ? 'Marge avant le seuil  ' + fmtEUR(e.raw - f.raw) : ''; }
        }, footerColor: t.txt2, footerFont: { family: chartFontFamily(), size: 11.5, weight: '500' } })
      },
      scales: proScales({ x: { ticks: { callback: function (v) { const l = this.getLabelForValue(v); return /^\d{4}-\d{2}-\d{2}$/.test(l) ? fmtDateFR(l) : l; } } }, y: { ticks: { callback: v => fmtEURCompact(v) } } })
    }
  });
}


function renderStats() {
  const trades = analysisTrades();
  [renderEdgeFinder, renderStatsSessionTables, renderMaeMfeAnalysis, renderChecklistAnalysis, renderTiltMeter,
   renderSharpeSortino, renderCoinFlip, renderMistakeCostReport, renderWhatIf].forEach(fn => safeRun(fn, fn.name));
  const closed = trades.filter(t => ['TP','SL','BE'].includes(t.res));
  const wins = trades.filter(t => t.res === 'TP');
  const losses = trades.filter(t => t.res === 'SL');
  const bes = trades.filter(t => t.res === 'BE');
  const n = closed.length;
  const pnlArr = trades.filter(t => t.pnl != null);
  const totalPnl = pnlArr.reduce((s,t)=>s+t.pnl,0);
  const gw = wins.reduce((s,t)=>s+(t.pnl||0),0);
  const gl = Math.abs(losses.reduce((s,t)=>s+(t.pnl||0),0));
  const rrArr = trades.filter(t=>t.rr);

  function statRow(label, val, cls='') {
    return `<div class="stat-row"><span class="stat-row-label">${label}</span><span class="stat-row-val ${cls}">${val}</span></div>`;
  }
  function pct(a,b) { return b>0?(a/b*100).toFixed(1)+'%':'—'; }

  document.getElementById('stats-perf').innerHTML = [
    statRow('Total trades', trades.length),
    statRow('Trades fermés', n),
    statRow('TP', wins.length, 'pnl-p'),
    statRow('SL', losses.length, 'pnl-n'),
    statRow('Break Even', bes.length),
    statRow('En cours', trades.filter(t=>t.res==='OPEN').length),
    statRow('Win rate', pct(wins.length,n), (() => { const be = breakevenWinRate(); return be === null || !n ? '' : (wins.length / n >= be ? 'pnl-p' : 'pnl-n'); })()),
  ].join('');

  document.getElementById('stats-pnl').innerHTML = [
    statRow('P&L Total (R)', pnlArr.length>0?(totalPnl>=0?'+':'')+totalPnl.toFixed(2)+'R':'—', totalPnl>0?'pnl-p':totalPnl<0?'pnl-n':''),
    statRow('P&L Total (€)', (()=>{const ea=trades.filter(t=>t.pnlEur!=null);const et=ea.reduce((s,t)=>s+t.pnlEur,0);return ea.length>0?(et>=0?'+':'')+et.toFixed(2)+' €':'—'})(), (()=>{const ea=trades.filter(t=>t.pnlEur!=null);const et=ea.reduce((s,t)=>s+t.pnlEur,0);return ea.length>0?(et>0?'pnl-p':et<0?'pnl-n':''):''})()), 
    statRow('P&L Moyen/trade', pnlArr.length>0?(totalPnl/pnlArr.length>=0?'+':'')+(totalPnl/pnlArr.length).toFixed(2)+'R':'—'),
    statRow('Gains bruts', gw>0?'+'+gw.toFixed(2)+'R':'—', 'pnl-p'),
    statRow('Pertes brutes', gl>0?'-'+gl.toFixed(2)+'R':'—', 'pnl-n'),
    statRow('Profit Factor', gl>0?(gw/gl).toFixed(2):wins.length>0?'∞':'—', gl>0&&gw/gl>=1?'pnl-p':''),
    statRow('Max gain', wins.length>0?'+'+Math.max(...wins.map(t=>t.pnl||0)).toFixed(2)+'R':'—', 'pnl-p'),
    statRow('Max perte', losses.length>0?'-'+Math.abs(Math.min(...losses.map(t=>t.pnl||0))).toFixed(2)+'R':'—', 'pnl-n'),
  ].join('');

  document.getElementById('stats-rr').innerHTML = [
    statRow('RR Moyen', rrArr.length>0?(rrArr.reduce((s,t)=>s+t.rr,0)/rrArr.length).toFixed(2)+'R':'—'),
    statRow('RR Max', rrArr.length>0?Math.max(...rrArr.map(t=>t.rr)).toFixed(2)+'R':'—'),
    statRow('RR Min', rrArr.length>0?Math.min(...rrArr.map(t=>t.rr)).toFixed(2)+'R':'—'),
    statRow('Trades A+ (RR≥3)', trades.filter(t=>t.rr>=3).length),
    statRow('Trades A  (RR≥2)', trades.filter(t=>t.rr>=2&&t.rr<3).length),
    statRow('Trades B  (RR≥1.5)', trades.filter(t=>t.rr>=1.5&&t.rr<2).length),
    statRow('Trades C  (RR<1.5)', trades.filter(t=>t.rr&&t.rr<1.5).length),
  ].join('');

  // Asset breakdown : tous les actifs réellement présents (y compris ceux découverts à l'import), du plus tradé au moins tradé.
  const assetCounts = {};
  trades.forEach(t => { if (t.asset) assetCounts[t.asset] = (assetCounts[t.asset] || 0) + 1; });
  const assets = Object.keys(assetCounts).sort((a, b) => assetCounts[b] - assetCounts[a] || a.localeCompare(b));
  const assetTbody = document.getElementById('stats-assets-tbody');
  const beWR = breakevenWinRate();
  assetTbody.innerHTML = assets.map(asset => {
    const at = trades.filter(t=>t.asset===asset);
    if (!at.length) return '';
    const ac = at.filter(t=>['TP','SL','BE'].includes(t.res));
    const atp = at.filter(t=>t.res==='TP').length;
    const asl = at.filter(t=>t.res==='SL').length;
    const abe = at.filter(t=>t.res==='BE').length;
    const awr = ac.length>0?pct(atp,ac.length):'—';
    const apnl = at.filter(t=>t.pnl != null).reduce((s,t)=>s+t.pnl,0);
    const arr = at.filter(t=>t.rr);
    const avgRR = arr.length>0?(arr.reduce((s,t)=>s+t.rr,0)/arr.length).toFixed(2)+'R':'—';
    const wrNum = ac.length>0?atp/ac.length:0;
    return `<tr>
      <td style="font-weight:500">${esc(asset)}</td>
      <td>${at.length}</td>
      <td style="color:var(--green)">${atp}</td>
      <td style="color:var(--red)">${asl}</td>
      <td style="color:var(--amber)">${abe}</td>
      <td>${ac.length ? wrBarCell(wrNum, beWR, ac.length) : '—'}</td>
      <td class="${apnl>0?'pnl-p':apnl<0?'pnl-n':'pnl-z'}">${at.filter(t=>t.pnl != null).length>0?(apnl>=0?'+':'')+apnl.toFixed(2)+'R':'—'}</td>
      <td>${avgRR}</td>
    </tr>`;
  }).join('');

  // TF breakdown
  const TF_ORDER = ['M1','M3','M5','M10','M15','M30','H1','H4','Multi-TF'];
  const tfs = TF_ORDER.concat([...new Set(trades.map(t => t.tf).filter(tf => tf && !TF_ORDER.includes(tf)))].sort());
  const tfTbody = document.getElementById('stats-tf-tbody');
  tfTbody.innerHTML = tfs.map(tf => {
    const tt = trades.filter(t=>t.tf===tf);
    if (!tt.length) return '';
    const tc = tt.filter(t=>['TP','SL','BE'].includes(t.res));
    const ttp = tt.filter(t=>t.res==='TP').length;
    const twr = tc.length>0?pct(ttp,tc.length):'—';
    const tpnl = tt.filter(t=>t.pnl != null).reduce((s,t)=>s+t.pnl,0);
    const wrNum = tc.length>0?ttp/tc.length:0;
    return `<tr>
      <td style="font-weight:500">${esc(tf)}</td>
      <td>${tt.length}</td>
      <td>${tc.length ? wrBarCell(wrNum, beWR, tc.length) : '—'}</td>
      <td class="${tpnl>0?'pnl-p':tpnl<0?'pnl-n':'pnl-z'}">${tt.filter(t=>t.pnl != null).length>0?(tpnl>=0?'+':'')+tpnl.toFixed(2)+'R':'—'}</td>
    </tr>`;
  }).join('');
}

