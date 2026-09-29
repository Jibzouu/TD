// ── CALENDRIER ───────────────────────────────────────────────────────
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS_FR = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

let calViewMode = 'month';
function calPrev() {
  if (calViewMode === 'year') { calYear--; renderCalendrier(); return; }
  calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderCalendrier();
}
function calNext() {
  if (calViewMode === 'year') { calYear++; renderCalendrier(); return; }
  calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderCalendrier();
}
function calToday() { const now = new Date(); calMonth = now.getMonth(); calYear = now.getFullYear(); renderCalendrier(); }
function toggleCalView() {
  calViewMode = calViewMode === 'month' ? 'year' : 'month';
  const gridEl = document.getElementById('cal-grid');
  const yearEl = document.getElementById('cal-year-wrap');
  if (gridEl) gridEl.style.display = calViewMode === 'month' ? '' : 'none';
  if (yearEl) yearEl.style.display = calViewMode === 'year' ? '' : 'none';
  const btn = document.getElementById('btn-cal-view');
  if (btn) btn.textContent = calViewMode === 'month' ? '\ud83d\udcc5 Vue annuelle' : '\ud83d\uddd3\ufe0f Vue mensuelle';
  renderCalendrier();
}

// \u2500\u2500 Cellule : calcul + cache partag\u00e9 (utilis\u00e9 aussi par le tooltip) \u2500\u2500
let calDayDataCache = {};
function computeDayData(dateStr, dayMap) {
  const dayTrades = dayMap[dateStr] || [];
  const pnlSum = dayTrades.filter(t=>t.pnl != null).reduce((s,t)=>s+t.pnl,0);
  const pnlEurSum = dayTrades.filter(t=>t.pnlEur!==null && t.pnlEur!==undefined).reduce((s,t)=>s+t.pnlEur,0);
  const gainsEur = dayTrades.filter(t=>t.pnlEur!==null && t.pnlEur!==undefined && t.pnlEur>0).reduce((s,t)=>s+t.pnlEur,0);
  const lossesEur = dayTrades.filter(t=>t.pnlEur!==null && t.pnlEur!==undefined && t.pnlEur<0).reduce((s,t)=>s+t.pnlEur,0);
  const tp = dayTrades.filter(t=>t.res==='TP').length;
  const sl = dayTrades.filter(t=>t.res==='SL').length;
  const closed = dayTrades.filter(t=>['TP','SL','BE'].includes(t.res)).length;
  const winPct = closed>0 ? Math.round(tp/closed*100) : 0;
  // Résultat net du jour utilisé pour la COULEUR : en € dès qu'un montant en € existe ce jour-là, sinon en R.
  // (Avant, le signe venait du R et l'intensité des € : un jour positif en € mais sans R s'affichait comme un break-even.)
  const hasEur = dayTrades.some(t => t.pnlEur !== null && t.pnlEur !== undefined);
  const net = hasEur ? pnlEurSum : pnlSum;
  const data = { dayTrades, pnlSum, pnlEurSum, gainsEur, lossesEur, tp, sl, closed, winPct, hasEur, net };
  calDayDataCache[dateStr] = data;
  return data;
}
let CAL_HEAT_INTENSITY = parseFloat(DB.getItem((GP + 'cal_heat_intensity')) || '1');
function onHeatIntensityChange(val) {
  CAL_HEAT_INTENSITY = parseInt(val, 10) / 100;
  DB.setItem((GP + 'cal_heat_intensity'), CAL_HEAT_INTENSITY);
  const label = document.getElementById('heat-intensity-val');
  if (label) label.textContent = val + '%';
  renderCalendrier();
}
let CHART_INTENSITY = parseFloat(DB.getItem((GP + 'chart_intensity')) || '2');
function onChartIntensityChange(val) {
  CHART_INTENSITY = parseInt(val, 10) / 100;
  DB.setItem((GP + 'chart_intensity'), CHART_INTENSITY);
  const label = document.getElementById('chart-intensity-val');
  if (label) label.textContent = val + '%';
  renderAll();
}
function heatColors(pnlEurSum, maxAbs) {
  const green = cssVar('--green','#22c55e'), red = cssVar('--red','#ef4444'), amber = cssVar('--amber','#f59e0b');
  const ratio = maxAbs > 0 ? Math.min(Math.abs(pnlEurSum) / maxAbs, 1) : 0.4;
  const alpha = Math.min((0.12 + ratio * 0.5) * CAL_HEAT_INTENSITY, 0.92);
  const amberAlpha = Math.min(0.18 * CAL_HEAT_INTENSITY, 0.85);
  // Sur un fond très saturé, le texte de la même couleur devient illisible : on bascule sur un texte contrasté.
  const base = cssVar('--bg3', '#1a1c26');
  function lum(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((hex||'').trim());
    if (!m) return 0.2;
    const c = [m[1],m[2],m[3]].map(h => { const v = parseInt(h,16)/255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); });
    return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
  }
  function build(accent, a, borderA) {
    const blended = a * lum(accent) + (1 - a) * lum(base);
    const strong = a >= 0.5;
    const onFill = blended > 0.22 ? '#0b0d12' : '#ffffff';
    return { bg: hexToRgba(accent, a), border: hexToRgba(accent, borderA), txt: strong ? onFill : accent, strong, onFill };
  }
  if (pnlEurSum > 0) return build(green, alpha, Math.min(alpha+0.3,.95));
  if (pnlEurSum < 0) return build(red, alpha, Math.min(alpha+0.3,.95));
  return build(amber, amberAlpha, Math.min(amberAlpha+0.22,.9));
}

// \u2500\u2500 Tooltip au survol \u2500\u2500
function showCalTooltip(e, dateStr) {
  const tip = document.getElementById('cal-tooltip');
  const data = calDayDataCache[dateStr];
  if (!tip || !data || !data.dayTrades.length) return;
  const rows = data.dayTrades.slice(0, 5).map(t => html`<div class="ct-row"><span>${t.asset || '—'} ${t.res || ''}</span><span class="tone-${raw(t.pnl > 0 ? 'green' : t.pnl < 0 ? 'red' : 'muted')}">${t.pnl != null ? ((rSource(t) === 'defaut' || rSource(t) === 'risque') ? '≈' : '') + (t.pnl >= 0 ? '+' : '') + t.pnl.toFixed(1) + 'R' : '—'}</span></div>`);
  mount(tip, html`<div class="ct-head">${dateStr} · ${fmtEUR(data.pnlEurSum, true)}</div>${rows}${data.dayTrades.length > 5 ? html`<div class="ct-more">+ ${data.dayTrades.length - 5} autre(s)</div>` : ''}`);
  tip.classList.add('show');
  positionCalTooltip(e);
}
function positionCalTooltip(e) {
  const tip = document.getElementById('cal-tooltip');
  if (!tip) return;
  const x = Math.min(e.clientX + 14, window.innerWidth - 260);
  const y = Math.min(e.clientY + 14, window.innerHeight - 160);
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideCalTooltip() {
  const tip = document.getElementById('cal-tooltip');
  if (tip) tip.classList.remove('show');
}

// \u2500\u2500 S\u00e9ries (streaks) de jours gagnants/perdants cons\u00e9cutifs \u2500\u2500
function computeCalStreaks(sortedDayEntries) {
  const streakMap = {};
  let i = 0;
  while (i < sortedDayEntries.length) {
    const dir = sortedDayEntries[i].pnlSum > 0 ? 'win' : sortedDayEntries[i].pnlSum < 0 ? 'loss' : null;
    if (!dir) { i++; continue; }
    let j = i;
    while (j < sortedDayEntries.length && (sortedDayEntries[j].pnlSum > 0 ? 'win' : sortedDayEntries[j].pnlSum < 0 ? 'loss' : null) === dir) j++;
    const length = j - i;
    if (length >= 3) streakMap[sortedDayEntries[j-1].date] = { type: dir, length };
    i = j;
  }
  return streakMap;
}

function getCalFilteredTrades() {
  const trades = viewTrades();   // vue filtrée (filtre global)
  const calAsset = document.getElementById('cal-filter-asset')?.value || '';
  const calSession = document.getElementById('cal-filter-session')?.value || '';
  return trades.filter(t => (!calAsset || t.asset === calAsset) && (!calSession || t.session === calSession));
}
function computeMonthTotalEur(year, month, filteredTrades) {
  let total = 0;
  filteredTrades.forEach(t => {
    if (!t.date || t.pnlEur===null || t.pnlEur===undefined) return;
    const d = new Date(t.date+'T00:00:00');
    if (isNaN(d) || d.getFullYear()!==year || d.getMonth()!==month) return;
    total += t.pnlEur;
  });
  return total;
}

function renderCalendrier() {
  const lbl = document.getElementById('cal-month-label');
  if (!lbl) return;
  lbl.textContent = calViewMode === 'year' ? String(calYear) : (MONTHS_FR[calMonth] + ' ' + calYear);
  calDayDataCache = {};

  if (calViewMode === 'year') { renderYearlyCalendar(); renderRRTables(); return; }

  const filteredTrades = getCalFilteredTrades();
  const dayMap = {};
  filteredTrades.forEach(t => { if (!dayMap[t.date]) dayMap[t.date] = []; dayMap[t.date].push(t); });

  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth+1, 0);
  let startDow = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  const todayStr = localDateStr();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(calYear + '-' + String(calMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0'));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const monthDates = cells.filter(Boolean);
  let maxAbs = 0, maxAbsR = 0, bestDate = null, bestVal = -Infinity, worstDate = null, worstVal = Infinity;
  const chronoEntries = [];
  monthDates.forEach(dateStr => {
    const data = computeDayData(dateStr, dayMap);
    if (data.dayTrades.length > 0) {
      if (data.hasEur) { if (Math.abs(data.pnlEurSum) > maxAbs) maxAbs = Math.abs(data.pnlEurSum); }
      else if (Math.abs(data.pnlSum) > maxAbsR) maxAbsR = Math.abs(data.pnlSum);
      if (data.pnlEurSum > bestVal) { bestVal = data.pnlEurSum; bestDate = dateStr; }
      if (data.pnlEurSum < worstVal) { worstVal = data.pnlEurSum; worstDate = dateStr; }
      chronoEntries.push({ date: dateStr, pnlSum: data.net });
    }
  });
  const streakMap = computeCalStreaks(chronoEntries);
  const hasBestWorst = monthDates.filter(d => calDayDataCache[d].dayTrades.length > 0).length >= 2;

  let monthTotalEur = 0, monthTradingDays = 0;
  const weeks = [];
  for (let w = 0; w < cells.length / 7; w++) {
    let weekEur = 0, weekDays = 0;
    const days = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = cells[w * 7 + i];
      if (!dateStr) { days.push(html`<div></div>`); continue; }
      const d = parseInt(dateStr.slice(-2), 10);
      const data = calDayDataCache[dateStr];
      const has = data.dayTrades.length > 0;
      // Couleurs de la case : calculées selon le résultat du jour (intensité continue), passées en variables CSS.
      let vars = '', strong = false;
      if (has) {
        weekDays++; monthTradingDays++;
        weekEur += data.pnlEurSum; monthTotalEur += data.pnlEurSum;
        const hc = heatColors(data.net, data.hasEur ? maxAbs : maxAbsR);
        strong = hc.strong;
        vars = `--c-bg:${hc.bg};--c-bd:${hc.border};--c-tx:${hc.txt}` + (strong ? `;--c-on:${hc.onFill}` : '');
      }
      const cls = 'cal-day' + (has ? ' has' : '') + (dateStr === todayStr ? ' today' : '') + (strong ? ' strong' : '');
      const eur = [data.gainsEur > 0 ? html`<span class="pos">${fmtEUR(data.gainsEur, true)}</span>` : '', data.lossesEur < 0 ? html`<span class="neg">${fmtEUR(data.lossesEur)}</span>` : ''].filter(Boolean);
      const streak = streakMap[dateStr];
      days.push(html`<div class="${cls}"${raw(vars ? ` style="${vars}"` : '')} onmouseenter="showCalTooltip(event,'${dateStr}')" onmousemove="positionCalTooltip(event)" onmouseleave="hideCalTooltip()"${raw(has ? ` onclick="selectBilanDate('${dateStr}')"` : '')}>
        ${hasBestWorst && dateStr === bestDate && bestVal > 0 ? html`<span class="cal-badge" title="Meilleur jour du mois">🏆</span>` : ''}${hasBestWorst && dateStr === worstDate && worstVal < 0 ? html`<span class="cal-badge" title="Jour le plus coûteux">⚠️</span>` : ''}${streak ? html`<span class="cal-badge streak" title="${streak.length} jours ${streak.type === 'win' ? 'gagnants' : 'perdants'} d'affilée">${streak.type === 'win' ? '🔥' : '❄️'}${streak.length}</span>` : ''}
        <div class="cal-dnum">${d}</div>
        ${eur.length ? html`<div class="cal-eur">${eur.reduce((a, e, i) => html`${a}${i ? ' ' : ''}${e}`, html``)}</div>` : ''}${has && data.pnlSum !== 0 ? html`<div class="cal-r">${data.pnlSum >= 0 ? '+' : ''}${data.pnlSum.toFixed(1)}R</div>` : ''}${has ? html`<div class="cal-win">${data.tp}✓ ${data.sl}✗ · ${data.winPct}%</div>` : ''}
      </div>`);
    }
    const week = weekDays > 0
      ? html`<div class="cal-week"><div class="cal-week-lbl">Semaine ${w + 1}</div><div class="cal-week-val tone-${raw(weekEur > 0 ? 'green' : weekEur < 0 ? 'red' : 'txt2')}">${fmtEUR(weekEur, true)}</div><div class="cal-week-sub">${weekDays} jour(s)</div></div>`
      : html`<div class="cal-week empty"><div class="cal-week-lbl">Semaine ${w + 1}</div><div class="cal-week-val tone-muted">0 €</div><div class="cal-week-sub">0 jour</div></div>`;
    weeks.push(html`<div class="cal-row">${days}${week}</div>`);
  }
  mount('cal-grid', html`<div class="cal-row">${DAYS_FR.map(d => html`<div class="cal-dow">${d}</div>`)}<div></div></div>${weeks}`);

  const statsBadge = document.getElementById('cal-monthly-stats');
  if (statsBadge) {
    const tone = monthTotalEur > 0 ? 'green' : monthTotalEur < 0 ? 'red' : 'txt2';
    if (monthTradingDays > 0) {
      let prevMonth = calMonth - 1, prevYear = calYear;
      if (prevMonth < 0) { prevMonth = 11; prevYear--; }
      const prevTotal = computeMonthTotalEur(prevYear, prevMonth, filteredTrades);
      const diff = monthTotalEur - prevTotal;
      const trend = Math.abs(diff) < 0.005 ? '' : html` <span class="tone-${raw(diff >= 0 ? 'green' : 'red')}">${diff >= 0 ? '▲' : '▼'} ${fmtEUR(Math.abs(diff))} vs mois dernier</span>`;
      mount(statsBadge, html`Ce mois : <span class="fw-600 tone-${raw(tone)}">${fmtEUR(monthTotalEur, true)}</span> · ${monthTradingDays} jour(s) tradé(s)${trend}`);
    } else {
      statsBadge.textContent = 'Aucun trade ce mois-ci';
    }
  }

  renderRRTables();
}

// \u2500\u2500 Vue annuelle (heatmap fa\u00e7on GitHub) \u2500\u2500
function renderYearlyCalendar() {
  const cont = document.getElementById('cal-year-grid');
  if (!cont) return;
  const filteredTrades = getCalFilteredTrades();
  const dayMap = {};
  filteredTrades.forEach(t => { if (!t.date) return; (dayMap[t.date] = dayMap[t.date] || []).push(t); });

  let yearMaxAbs = 0, yearMaxAbsR = 0;
  Object.keys(dayMap).forEach(dstr => {
    if (!dstr.startsWith(String(calYear))) return;
    const data = computeDayData(dstr, dayMap);
    if (data.hasEur) yearMaxAbs = Math.max(yearMaxAbs, Math.abs(data.pnlEurSum));
    else yearMaxAbsR = Math.max(yearMaxAbsR, Math.abs(data.pnlSum));
  });

  let yearTotal = 0, yearDays = 0;
  const months = MONTHS_FR.map((name, m) => {
    let startDow = new Date(calYear, m, 1).getDay(); startDow = startDow === 0 ? 6 : startDow - 1;
    const last = new Date(calYear, m + 1, 0).getDate();
    const sq = [];
    for (let i = 0; i < startDow; i++) sq.push(html`<div></div>`);
    for (let d = 1; d <= last; d++) {
      const dateStr = calYear + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const data = dayMap[dateStr] ? computeDayData(dateStr, dayMap) : null;
      const has = !!(data && data.dayTrades.length);
      let bg = '';
      if (has) {
        yearTotal += data.pnlEurSum; yearDays++;
        bg = heatColors(data.net, data.hasEur ? yearMaxAbs : yearMaxAbsR).bg;
      }
      sq.push(html`<div class="cal-year-sq${raw(has ? ' has' : '')}"${raw(bg ? ` style="background:${bg}"` : '')} onmouseenter="showCalTooltip(event,'${dateStr}')" onmousemove="positionCalTooltip(event)" onmouseleave="hideCalTooltip()"${raw(has ? ` onclick="selectBilanDate('${dateStr}')"` : '')}></div>`);
    }
    return html`<div><div class="cal-year-month-label">${name}</div><div class="cal-year-days">${sq}</div></div>`;
  });
  mount(cont, html`<div class="cal-year-months">${months}</div>`);

  const statsEl = document.getElementById('cal-year-stats');
  if (statsEl) {
    statsEl.textContent = yearDays > 0
      ? `${calYear} : ${fmtEUR(yearTotal, true)} sur ${yearDays} jour(s) tradé(s)`
      : `Aucun trade en ${calYear}`;
  }
}


// (getISOWeek : voir 00a-calc.js)

function renderRRTables() {
  const trades = analysisTrades();
  const weekMap = {};
  const monthMap = {};

  trades.forEach(t => {
    if (!t.date) return;
    const d = new Date(t.date + 'T00:00:00');
    if (isNaN(d)) return;
    const rr = (t.pnl != null) ? t.pnl : 0;

    const iso = getISOWeek(d);
    const wKey = iso.year + '-W' + String(iso.week).padStart(2, '0');
    if (!weekMap[wKey]) {
      const monday = new Date(d);
      const dow = (d.getDay() + 6) % 7;
      monday.setDate(d.getDate() - dow);
      weekMap[wKey] = { rr: 0, n: 0, tp: 0, sl: 0, be: 0, monday: localDateStr(monday) };
    }
    weekMap[wKey].rr += rr; weekMap[wKey].n++;
    if (t.res === 'TP') weekMap[wKey].tp++; else if (t.res === 'SL') weekMap[wKey].sl++; else if (t.res === 'BE') weekMap[wKey].be++;

    const mKey = t.date.slice(0, 7);
    if (!monthMap[mKey]) monthMap[mKey] = { rr: 0, n: 0, tp: 0, sl: 0, be: 0 };
    monthMap[mKey].rr += rr; monthMap[mKey].n++;
    if (t.res === 'TP') monthMap[mKey].tp++; else if (t.res === 'SL') monthMap[mKey].sl++; else if (t.res === 'BE') monthMap[mKey].be++;
  });

  const weekKeys = Object.keys(weekMap).sort().reverse();
  const monthKeys = Object.keys(monthMap).sort().reverse();
  const counts = v => html`${v.n} <span class="tone-muted">(${v.tp}✓ ${v.sl}✗${v.be ? ' ' + v.be + 'be' : ''})</span>`;
  const rrCell = v => html`<td class="r strong tone-${raw(v.rr > 0 ? 'green' : v.rr < 0 ? 'red' : 'txt2')}">${v.rr >= 0 ? '+' : ''}${v.rr.toFixed(2)}R</td>`;
  const table = (el, first, keys, label, map) => {
    if (!el) return;
    mount(el, keys.length === 0
      ? html`<tr><td class="rr-empty">Aucun trade daté pour le moment.</td></tr>`
      : html`<thead><tr><th>${first}</th><th class="r">Trades</th><th class="r">RR total</th></tr></thead><tbody>${keys.map(k => html`<tr><td>${label(k, map[k])}</td><td class="r c2">${counts(map[k])}</td>${rrCell(map[k])}</tr>`)}</tbody>`);
  };
  table(document.getElementById('rr-week-table'), 'Semaine', weekKeys, (k, v) => html`S${k.split('-W')[1]} <span class="tone-muted">· dès le ${v.monday}</span>`, weekMap);
  table(document.getElementById('rr-month-table'), 'Mois', monthKeys, k => { const [y, m] = k.split('-'); return MONTHS_FR[parseInt(m, 10) - 1] + ' ' + y; }, monthMap);
}

function selectBilanDate(date) {
  const btn = document.querySelector('.nav-item[onclick*="bilan"]');
  showPage('bilan', btn);
  setTimeout(() => {
    const sel = document.getElementById('bilan-date-select');
    if (sel) { sel.value = date; renderBilan(); }
  }, 50);
}

