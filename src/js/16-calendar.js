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
  const rows = data.dayTrades.slice(0,5).map(t => {
    const col = t.pnl>0?'var(--green)':t.pnl<0?'var(--red)':'var(--txt3)';
    return `<div style="display:flex;justify-content:space-between;gap:14px"><span>${esc(t.asset||'\u2014')} ${esc(t.res||'')}</span><span style="color:${col}">${t.pnl != null?((rSource(t)==='defaut'||rSource(t)==='risque')?'≈':'')+(t.pnl>=0?'+':'')+t.pnl.toFixed(1)+'R':'\u2014'}</span></div>`;
  }).join('');
  const more = data.dayTrades.length > 5 ? `<div style="color:var(--txt3);margin-top:4px">+ ${data.dayTrades.length-5} autre(s)</div>` : '';
  tip.innerHTML = `<div style="font-weight:600;color:var(--txt);margin-bottom:6px">${esc(dateStr)} \u00b7 ${fmtEUR(data.pnlEurSum,true)}</div>${rows}${more}`;
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

  let html = `<div style="display:grid;grid-template-columns:repeat(7,1fr) 130px;gap:6px;margin-bottom:6px">`;
  DAYS_FR.forEach(d => { html += `<div style="text-align:center;font-size:11px;font-family:var(--mono);color:var(--txt3);padding:4px 0">${d}</div>`; });
  html += `<div></div></div>`;

  let monthTotalEur = 0, monthTradingDays = 0;
  const shape = getComputedStyle(document.documentElement).getPropertyValue('--r').trim() || '8px';

  for (let w = 0; w < cells.length / 7; w++) {
    html += `<div style="display:grid;grid-template-columns:repeat(7,1fr) 130px;gap:6px;margin-bottom:6px">`;
    let weekEur = 0, weekDays = 0;
    for (let i = 0; i < 7; i++) {
      const dateStr = cells[w*7 + i];
      if (!dateStr) { html += `<div></div>`; continue; }
      const d = parseInt(dateStr.slice(-2), 10);
      const data = calDayDataCache[dateStr];
      const isToday = dateStr === todayStr;

      let bg = 'var(--bg3)', border = 'var(--border)', txtC = 'var(--txt3)', onFill = null;
      if (data.dayTrades.length > 0) {
        weekDays++; monthTradingDays++;
        weekEur += data.pnlEurSum; monthTotalEur += data.pnlEurSum;
        const hc = heatColors(data.net, data.hasEur ? maxAbs : maxAbsR);
        bg = hc.bg; border = hc.border; txtC = hc.txt;
        if (hc.strong) onFill = hc.onFill;
      }
      const todayBorder = isToday ? '2px solid var(--blue)' : `1px solid ${border}`;
      const pnlDisp = data.dayTrades.length>0 && data.pnlSum!==0 ? `<div style="font-size:11px;margin-top:2px;font-family:var(--mono);color:${txtC}">${data.pnlSum>=0?'+':''}${data.pnlSum.toFixed(1)}R</div>` : '';
      const eurParts = [];
      if (data.gainsEur > 0) eurParts.push(`<span style="color:${onFill || 'var(--green)'}">${fmtEUR(data.gainsEur, true)}</span>`);
      if (data.lossesEur < 0) eurParts.push(`<span style="color:${onFill || 'var(--red)'}">${fmtEUR(data.lossesEur)}</span>`);
      const eurDisp = eurParts.length ? `<div style="font-size:11px;font-weight:600;margin-top:2px;font-family:var(--mono)">${eurParts.join(' ')}</div>` : '';
      const winDisp = data.dayTrades.length>0 ? `<div style="font-size:11px;color:${onFill || 'var(--txt3)'};${onFill ? 'opacity:.8;' : ''}font-family:var(--mono);margin-top:2px">${data.tp}\u2713 ${data.sl}\u2717 \u00b7 ${data.winPct}%</div>` : '';

      let badges = '';
      if (hasBestWorst && dateStr === bestDate && bestVal > 0) badges += `<span style="position:absolute;top:4px;right:5px;font-size:11px" title="Meilleur jour du mois">\ud83c\udfc6</span>`;
      if (hasBestWorst && dateStr === worstDate && worstVal < 0) badges += `<span style="position:absolute;top:4px;right:5px;font-size:11px" title="Jour le plus co\u00fbteux">\u26a0\ufe0f</span>`;
      const streak = streakMap[dateStr];
      if (streak) badges += `<span style="position:absolute;bottom:4px;right:5px;font-size:11px;font-family:var(--mono);color:var(--txt3)" title="${streak.length} jours ${streak.type==='win'?'gagnants':'perdants'} d\'affil\u00e9e">${streak.type==='win'?'\ud83d\udd25':'\u2744\ufe0f'}${streak.length}</span>`;

      html += `<div style="position:relative;background:${bg};border:${todayBorder};border-radius:${shape};padding:8px 7px;min-height:80px;cursor:${data.dayTrades.length>0?'pointer':'default'};transition:transform .12s" onmouseenter="showCalTooltip(event,'${dateStr}')" onmousemove="positionCalTooltip(event)" onmouseleave="hideCalTooltip();if(${data.dayTrades.length}>0)this.style.transform='translateY(0)'" onmouseover="if(${data.dayTrades.length}>0)this.style.transform='translateY(-2px)'" onclick="${data.dayTrades.length>0?`selectBilanDate('${dateStr}')`:''}">
        ${badges}
        <div style="font-size:12px;font-weight:${onFill ? 700 : 500};font-family:var(--mono);color:${onFill ? onFill : (isToday?'var(--blue)':'var(--txt)')}">${d}</div>
        ${eurDisp}${pnlDisp}${winDisp}
      </div>`;
    }
    if (weekDays > 0) {
      const col = weekEur > 0 ? 'var(--green)' : weekEur < 0 ? 'var(--red)' : 'var(--txt2)';
      html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:${shape};padding:10px 12px;display:flex;flex-direction:column;justify-content:center">
        <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);">Semaine ${w+1}</div>
        <div style="font-size:15px;font-weight:600;font-family:var(--mono);color:${col};margin-top:4px">${fmtEUR(weekEur, true)}</div>
        <div style="font-size:11px;color:var(--txt3);font-family:var(--mono);margin-top:2px">${weekDays} jour(s)</div>
      </div>`;
    } else {
      html += `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:${shape};padding:10px 12px;display:flex;flex-direction:column;justify-content:center;opacity:.5">
        <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);">Semaine ${w+1}</div>
        <div style="font-size:15px;font-weight:600;font-family:var(--mono);color:var(--txt3);margin-top:4px">0 \u20ac</div>
        <div style="font-size:11px;color:var(--txt3);font-family:var(--mono);margin-top:2px">0 jour</div>
      </div>`;
    }
    html += `</div>`;
  }

  document.getElementById('cal-grid').innerHTML = html;

  const statsBadge = document.getElementById('cal-monthly-stats');
  if (statsBadge) {
    const col = monthTotalEur > 0 ? 'var(--green)' : monthTotalEur < 0 ? 'var(--red)' : 'var(--txt2)';
    if (monthTradingDays > 0) {
      let prevMonth = calMonth - 1, prevYear = calYear;
      if (prevMonth < 0) { prevMonth = 11; prevYear--; }
      const prevTotal = computeMonthTotalEur(prevYear, prevMonth, filteredTrades);
      const diff = monthTotalEur - prevTotal;
      const trendTxt = Math.abs(diff) < 0.005 ? '' : ` <span style="color:${diff>=0?'var(--green)':'var(--red)'}">${diff>=0?'\u25b2':'\u25bc'} ${fmtEUR(Math.abs(diff))} vs mois dernier</span>`;
      statsBadge.innerHTML = `Ce mois : <span style="color:${col};font-weight:600">${fmtEUR(monthTotalEur, true)}</span> \u00b7 ${monthTradingDays} jour(s) tradé(s)${trendTxt}`;
    } else {
      statsBadge.innerHTML = `Aucun trade ce mois-ci`;
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
  let html = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:18px">`;
  for (let m = 0; m < 12; m++) {
    const firstDay = new Date(calYear, m, 1);
    const lastDay = new Date(calYear, m+1, 0);
    let startDow = firstDay.getDay(); startDow = startDow===0?6:startDow-1;
    let monthHtml = `<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">`;
    for (let i=0;i<startDow;i++) monthHtml += `<div></div>`;
    for (let d=1; d<=lastDay.getDate(); d++) {
      const dateStr = calYear+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
      const data = dayMap[dateStr] ? computeDayData(dateStr, dayMap) : null;
      let sq = 'var(--bg4)';
      if (data && data.dayTrades.length) {
        yearTotal += data.pnlEurSum; yearDays++;
        const hc = heatColors(data.net, data.hasEur ? yearMaxAbs : yearMaxAbsR);
        sq = hc.bg;
      }
      monthHtml += `<div class="cal-year-sq" style="background:${sq};cursor:${data&&data.dayTrades.length?'pointer':'default'}" onmouseenter="showCalTooltip(event,'${dateStr}')" onmousemove="positionCalTooltip(event)" onmouseleave="hideCalTooltip()" onclick="${data&&data.dayTrades.length?`selectBilanDate('${dateStr}')`:''}"></div>`;
    }
    monthHtml += `</div>`;
    html += `<div><div class="cal-year-month-label">${MONTHS_FR[m]}</div>${monthHtml}</div>`;
  }
  html += `</div>`;
  cont.innerHTML = html;

  const statsEl = document.getElementById('cal-year-stats');
  if (statsEl) {
    statsEl.textContent = yearDays > 0
      ? `${calYear} : ${fmtEUR(yearTotal, true)} sur ${yearDays} jour(s) tradé(s)`
      : `Aucun trade en ${calYear}`;
  }
}


function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

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
  const th = 'text-align:right;padding:8px 14px;font-size:11px;color:var(--txt3);border-bottom:1px solid var(--border)';
  const thL = th.replace('text-align:right','text-align:left');
  const td = 'border-bottom:1px solid var(--border);padding:8px 14px;font-size:12px;font-family:var(--mono)';

  const weekTbl = document.getElementById('rr-week-table');
  if (weekTbl) {
    weekTbl.innerHTML = weekKeys.length === 0
      ? `<tr><td style="padding:16px;color:var(--txt3);font-size:12px">Aucun trade daté pour le moment.</td></tr>`
      : `<thead><tr><th style="${thL}">Semaine</th><th style="${th}">Trades</th><th style="${th}">RR total</th></tr></thead><tbody>` +
        weekKeys.map(k => {
          const v = weekMap[k];
          const col = v.rr > 0 ? 'var(--green)' : v.rr < 0 ? 'var(--red)' : 'var(--txt2)';
          const wNum = k.split('-W')[1];
          return `<tr>
            <td style="${td}">S${wNum} <span style="color:var(--txt3)">· dès le ${v.monday}</span></td>
            <td style="${td};text-align:right;color:var(--txt2)">${v.n} <span style="color:var(--txt3)">(${v.tp}✓ ${v.sl}✗${v.be?' '+v.be+'be':''})</span></td>
            <td style="${td};text-align:right;color:${col};font-weight:600">${v.rr>=0?'+':''}${v.rr.toFixed(2)}R</td>
          </tr>`;
        }).join('') + '</tbody>';
  }

  const monthTbl = document.getElementById('rr-month-table');
  if (monthTbl) {
    monthTbl.innerHTML = monthKeys.length === 0
      ? `<tr><td style="padding:16px;color:var(--txt3);font-size:12px">Aucun trade daté pour le moment.</td></tr>`
      : `<thead><tr><th style="${thL}">Mois</th><th style="${th}">Trades</th><th style="${th}">RR total</th></tr></thead><tbody>` +
        monthKeys.map(k => {
          const v = monthMap[k];
          const col = v.rr > 0 ? 'var(--green)' : v.rr < 0 ? 'var(--red)' : 'var(--txt2)';
          const [y, m] = k.split('-');
          const label = MONTHS_FR[parseInt(m,10)-1] + ' ' + y;
          return `<tr>
            <td style="${td}">${label}</td>
            <td style="${td};text-align:right;color:var(--txt2)">${v.n} <span style="color:var(--txt3)">(${v.tp}✓ ${v.sl}✗${v.be?' '+v.be+'be':''})</span></td>
            <td style="${td};text-align:right;color:${col};font-weight:600">${v.rr>=0?'+':''}${v.rr.toFixed(2)}R</td>
          </tr>`;
        }).join('') + '</tbody>';
  }
}

function selectBilanDate(date) {
  const btn = document.querySelector('.nav-item[onclick*="bilan"]');
  showPage('bilan', btn);
  setTimeout(() => {
    const sel = document.getElementById('bilan-date-select');
    if (sel) { sel.value = date; renderBilan(); }
  }, 50);
}

