// ── STATS : meilleurs jours / meilleures heures ─────────────────────
function renderStatsSessionTables() {
  const trades = analysisTrades();
  const WD_NAMES = {0:'Dimanche',1:'Lundi',2:'Mardi',3:'Mercredi',4:'Jeudi',5:'Vendredi',6:'Samedi'};
  const wdMap = {};
  const hMap = {};

  trades.forEach(t => {
    const rr = (t.pnl != null) ? t.pnl : 0;
    if (t.date) {
      const d = new Date(t.date + 'T00:00:00');
      if (!isNaN(d)) {
        const dow = d.getDay();
        if (!wdMap[dow]) wdMap[dow] = { rr:0, n:0, tp:0, sl:0, be:0 };
        wdMap[dow].n++; wdMap[dow].rr += rr;
        if (t.res==='TP') wdMap[dow].tp++; else if (t.res==='SL') wdMap[dow].sl++; else if (t.res==='BE') wdMap[dow].be++;
      }
    }
    if (t.entry) {
      const h = parseInt(t.entry.split(':')[0], 10);
      if (!isNaN(h)) {
        if (!hMap[h]) hMap[h] = { rr:0, n:0, tp:0, sl:0, be:0 };
        hMap[h].n++; hMap[h].rr += rr;
        if (t.res==='TP') hMap[h].tp++; else if (t.res==='SL') hMap[h].sl++; else if (t.res==='BE') hMap[h].be++;
      }
    }
  });

  const wdRows = Object.entries(wdMap).map(([dow,v]) => ({
    label: WD_NAMES[dow], n:v.n, rr:v.rr, wr: (v.tp+v.sl+v.be)>0 ? v.tp/(v.tp+v.sl+v.be)*100 : 0
  })).sort((a,b) => b.rr - a.rr);

  const hRows = Object.entries(hMap).map(([h,v]) => ({
    label: String(h).padStart(2,'0') + 'h – ' + String((parseInt(h,10)+1)%24).padStart(2,'0') + 'h',
    n:v.n, rr:v.rr, wr: (v.tp+v.sl+v.be)>0 ? v.tp/(v.tp+v.sl+v.be)*100 : 0
  })).sort((a,b) => b.rr - a.rr);

  function fill(rows, tbodyId, emptyMsg) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="4" style="color:var(--txt3);padding:14px">${emptyMsg}</td></tr>`; return; }
    const maxAbs = Math.max(...rows.map(r => Math.abs(r.rr)), 1e-9);
    tbody.innerHTML = rows.map((r,i) => `<tr>
        <td><span class="rank${i < 3 ? ' top' : ''}">${i + 1}</span>${esc(r.label)}</td>
        <td>${r.n}${r.n < 10 ? ' <span style="color:var(--txt3)" title="Échantillon faible (n < 10)">⚠</span>' : ''}</td>
        <td>${r.wr.toFixed(0)} %</td>
        <td>${divBarCell(r.rr, maxAbs, (r.rr>=0?'+':'') + r.rr.toFixed(2) + 'R')}</td>
      </tr>`).join('');
  }
  fill(wdRows, 'stats-weekday-tbody', 'Pas assez de trades datés.');
  fill(hRows, 'stats-hour-tbody', "Renseigne l'heure d'entrée de tes trades pour voir ce classement.");
}

// ── STATS : analyse MAE / MFE ───────────────────────────────────────
function renderMaeMfeAnalysis() {
  const cont = document.getElementById('mae-mfe-body');
  if (!cont) return;
  const withData = trades.filter(t => (t.mfe!==null && t.mfe!==undefined) || (t.mae!==null && t.mae!==undefined));
  if (withData.length === 0) {
    cont.innerHTML = `<p style="font-size:12px;color:var(--txt3)">Aucune donnée d'excursion pour l'instant. Importe un export TradingView (colonnes "Excursion favorable/adverse USD") pour débloquer cette analyse.</p>`;
    return;
  }
  const winners = withData.filter(t => t.res === 'TP');
  const losers = withData.filter(t => t.res === 'SL');
  function avg(arr, field) {
    const vals = arr.map(t => t[field]).filter(v => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : null;
  }
  const wMfe = avg(winners,'mfe'), wMae = avg(winners,'mae'), lMfe = avg(losers,'mfe'), lMae = avg(losers,'mae');
  function cell(label, val, color) {
    return `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:14px;text-align:center">
      <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:6px">${label}</div>
      <div style="font-size:18px;font-weight:600;font-family:var(--mono);color:${color}">${val===null?'—':val.toFixed(1)+' €'}</div>
    </div>`;
  }
  let html = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
    ${cell('Gagnants — MFE moyen', wMfe, 'var(--green)')}
    ${cell('Gagnants — MAE moyen', wMae, 'var(--amber)')}
    ${cell('Perdants — MFE moyen', lMfe, 'var(--blue)')}
    ${cell('Perdants — MAE moyen', lMae, 'var(--red)')}
  </div>`;

  const insights = [];
  if (lMfe !== null && lMfe > 0) {
    insights.push(`Tes trades perdants sont montés en moyenne à <strong style="color:var(--txt)">+${lMfe.toFixed(1)}€</strong> de profit latent avant de finir en perte. Un take-profit partiel ou un stop suiveur pourrait capturer une partie de ce gain.`);
  }
  if (wMae !== null && lMae !== null) {
    if (wMae >= lMae * 0.8) {
      insights.push(`Tes gagnants encaissent presque autant de chaleur (MAE moyen ${wMae.toFixed(1)}€) que tes perdants (${lMae.toFixed(1)}€) avant de repartir — ton stop n'est probablement pas le problème principal.`);
    } else {
      insights.push(`Tes gagnants encaissent moins de chaleur (${wMae.toFixed(1)}€) que tes perdants (${lMae.toFixed(1)}€) — cohérent avec une bonne sélection d'entrées.`);
    }
  }
  if (insights.length) {
    html += `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:14px;font-size:12.5px;line-height:1.7;color:var(--txt2)">
      ${insights.map(i => `<div style="margin-bottom:6px">💡 ${i}</div>`).join('')}
    </div>`;
  }
  cont.innerHTML = html;
}

// ── STATS : respect de la checklist vs résultats ────────────────────
function renderChecklistAnalysis() {
  const trades = analysisTrades();
  const cont = document.getElementById('checklist-analysis-body');
  if (!cont) return;
  const total = getEntryItems().length;
  const withChecklist = trades.filter(tradeHasChecklist);
  if (total === 0 || withChecklist.length === 0) {
    cont.innerHTML = `<p style="font-size:12px;color:var(--txt3)">Coche la checklist en ajoutant tes trades (Dashboard → Nouveau trade) pour voir si respecter ton plan améliore vraiment tes résultats.</p>`;
    return;
  }
  const full = withChecklist.filter(tradeChecklistComplete);
  const partial = withChecklist.filter(t => !tradeChecklistComplete(t));
  function stats(arr) {
    const closed = arr.filter(t => ['TP','SL','BE'].includes(t.res));
    const tp = arr.filter(t => t.res === 'TP').length;
    const wr = closed.length ? tp/closed.length*100 : 0;
    const rrVals = arr.map(t => t.pnl).filter(v => v !== null && v !== undefined);
    const avgRR = rrVals.length ? rrVals.reduce((a,b)=>a+b,0)/rrVals.length : null;
    return { n: arr.length, wr, avgRR };
  }
  const fs = stats(full), ps = stats(partial);
  function card(label, s, color) {
    return `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:16px">
      <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:10px">${label} <span style="color:var(--txt2)">(${s.n} trades)</span></div>
      <div style="display:flex;gap:24px">
        <div><div style="font-size:11px;color:var(--txt3)">win rate</div><div style="font-size:20px;font-weight:600;font-family:var(--mono);color:${color}">${s.wr.toFixed(0)}%</div></div>
        <div><div style="font-size:11px;color:var(--txt3)">RR moyen</div><div style="font-size:20px;font-weight:600;font-family:var(--mono);color:${s.avgRR===null?'var(--txt3)':(s.avgRR>=0?'var(--green)':'var(--red)')}">${s.avgRR===null?'—':(s.avgRR>=0?'+':'')+s.avgRR.toFixed(2)+'R'}</div></div>
      </div>
    </div>`;
  }
  let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    ${card('✓ Checklist complète', fs, 'var(--green)')}
    ${card('✗ Checklist incomplète', ps, 'var(--amber)')}
  </div>`;
  if (fs.n >= 3 && ps.n >= 3) {
    const diff = fs.wr - ps.wr;
    if (Math.abs(diff) >= 5) {
      html += `<div style="margin-top:14px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:14px;font-size:12.5px;color:var(--txt2)">
        💡 ${diff>0 ? `Respecter ta checklist en entier fait une vraie différence : <strong style="color:var(--green)">+${diff.toFixed(0)} points</strong> de win rate par rapport aux trades où tu as sauté des critères.` : `Étonnant : tes trades avec checklist incomplète font <strong style="color:var(--amber)">mieux</strong> (+${Math.abs(diff).toFixed(0)} points) que ceux avec checklist complète. Vérifie si un critère de ta checklist te fait plus de mal que de bien.`}
      </div>`;
    }
  } else {
    html += `<p style="margin-top:12px;font-size:11px;color:var(--txt3)">Encore trop peu de trades dans un des deux groupes pour tirer une conclusion fiable.</p>`;
  }
  cont.innerHTML = html;
}

// ── TILT METER : détection de revenge trading ───────────────────────
function computeTiltTrades() {
  const toMin = hhmm => { const [h, m] = String(hhmm || '').split(':').map(Number); return (isNaN(h) || isNaN(m)) ? null : h * 60 + m; };
  const byDay = {};
  trades.forEach(t => { if (!t.date || toMin(t.entry) === null) return; (byDay[t.date] = byDay[t.date] || []).push(t); });
  const flagged = [];
  let lossesWithFollowup = 0;
  Object.values(byDay).forEach(dayTrades => {
    const sorted = dayTrades.slice().sort((a, b) => toMin(a.entry) - toMin(b.entry));
    sorted.forEach(cur => {
      if (cur.res !== 'SL') return;
      // L'écart se mesure depuis la SORTIE du trade perdant (moment où la perte est encaissée), pas depuis son entrée.
      // Sans heure de sortie exploitable, on retombe sur l'heure d'entrée.
      const entryMin = toMin(cur.entry), exitMin = toMin(cur.exit);
      const lossAt = (exitMin !== null && exitMin >= entryMin) ? exitMin : entryMin;
      // Ré-entrée = premier trade ouvert APRÈS la perte (un trade déjà ouvert pendant ce trade n'est pas une réaction à la perte).
      const next = sorted.slice(sorted.indexOf(cur) + 1).find(t => toMin(t.entry) >= lossAt);
      if (!next) return;
      const gapMin = toMin(next.entry) - lossAt;
      if (gapMin < 0 || gapMin > 240) return;
      lossesWithFollowup++;
      const reasons = [];
      if (gapMin <= 10) reasons.push(`ré-entrée ${gapMin} min après la perte`);
      const curSize = parseFloat(cur.size), nextSize = parseFloat(next.size);
      if (!isNaN(curSize) && !isNaN(nextSize) && curSize > 0 && nextSize > curSize * 1.3) {
        reasons.push(`taille +${Math.round((nextSize/curSize - 1) * 100)}%`);
      }
      if (reasons.length) flagged.push({ trade: next, afterLoss: cur, reasons, gapMin });
    });
  });
  return { flagged, lossesWithFollowup };
}

function renderTiltMeter() {
  const cont = document.getElementById('tilt-meter-body');
  if (!cont) return;
  const { flagged, lossesWithFollowup } = computeTiltTrades();
  if (lossesWithFollowup === 0) {
    cont.innerHTML = `<p style="font-size:12px;color:var(--txt3)">Pas assez de trades avec heure d'entrée à la suite d'une perte pour détecter un pattern de revenge trading.</p>`;
    return;
  }
  const tiltPct = Math.round((flagged.length / lossesWithFollowup) * 100);
  const calmScore = 100 - tiltPct;
  const col = calmScore >= 70 ? 'var(--green)' : calmScore >= 40 ? 'var(--amber)' : 'var(--red)';

  let html = `<div style="display:flex;gap:28px;align-items:center;margin-bottom:18px;flex-wrap:wrap">
    <div>
      <div style="font-size:12px;color:var(--txt2);margin-bottom:4px">Score de sang-froid</div>
      <div style="font-size:30px;font-weight:600;letter-spacing:-.02em;color:var(--txt)">${calmScore}<span style="font-size:15px;color:var(--txt3)"> / 100</span></div>
    </div>
    <div style="flex:1;min-width:180px">
      <div class="meter" style="margin-bottom:10px"><div class="meter-fill" style="width:${calmScore}%;background:${col}"></div></div>
      <div style="font-size:11px;color:var(--txt2)">${flagged.length} trade(s) suspect(s) sur ${lossesWithFollowup} perte(s) suivies d'un autre trade le même jour (${tiltPct}%).</div>
    </div>
  </div>`;

  if (flagged.length > 0) {
    html += `<div style="border-top:1px solid var(--border);padding-top:14px">
      <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:10px">Trades signalés</div>` +
      flagged.slice(0,10).map(f => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;font-family:var(--mono)">
          <span style="color:var(--txt2)">${esc(f.trade.date)} · ${esc(f.trade.entry)} · ${esc(f.trade.asset||'—')}</span>
          <span style="color:var(--amber)">${f.reasons.join(' · ')}</span>
          <span class="badge b-${esc((f.trade.res||'').toLowerCase())}">${esc(f.trade.res||'—')}</span>
        </div>`).join('') +
      (flagged.length > 10 ? `<p style="font-size:11px;color:var(--txt3);margin-top:8px">+ ${flagged.length-10} autre(s)</p>` : '') +
      `</div>`;
  } else {
    html += `<p style="font-size:12px;color:var(--green)">✓ Aucun pattern de revenge trading détecté sur tes trades actuels.</p>`;
  }
  cont.innerHTML = html;
}

// ── EDGE FINDER ──────────────────────────────────────────────────────
function computeDimensionSegments(keyFn, minN) {
  minN = minN || 3;
  const map = {};
  analysisTrades().forEach(t => {
    if (t.pnl === null || t.pnl === undefined) return;
    if (!['TP','SL','BE'].includes(t.res)) return;
    const key = keyFn(t);
    if (key === null || key === undefined || key === '') return;
    if (!map[key]) map[key] = { n:0, totalR:0, tp:0 };
    map[key].n++;
    map[key].totalR += t.pnl;
    if (t.res === 'TP') map[key].tp++;
  });
  return Object.entries(map)
    .filter(([,v]) => v.n >= minN)
    .map(([key,v]) => ({ key, n:v.n, totalR:v.totalR, avgR:v.totalR/v.n, winRate:v.tp/v.n*100, reliable: v.n >= 10 }));
}

function renderEdgeFinder() {
  const cont = document.getElementById('edge-finder-body');
  if (!cont) return;
  const closedCount = trades.filter(t => ['TP','SL','BE'].includes(t.res)).length;
  if (closedCount < 10) {
    cont.innerHTML = `<p style="font-size:12px;color:var(--txt3)">Encore trop peu de trades fermés (${closedCount}) pour un scan fiable — reviens à partir d'une trentaine de trades.</p>`;
    return;
  }
  const WD_NAMES = {0:'Dimanche',1:'Lundi',2:'Mardi',3:'Mercredi',4:'Jeudi',5:'Vendredi',6:'Samedi'};
  const dims = [
    { label: 'Jour de la semaine', segs: computeDimensionSegments(t => { if(!t.date) return null; const d=new Date(t.date+'T00:00:00'); return isNaN(d)?null:WD_NAMES[d.getDay()]; }) },
    { label: "Heure d'entrée", segs: computeDimensionSegments(t => { if(!t.entry) return null; const h=parseInt(t.entry.split(':')[0],10); return isNaN(h)?null:String(h).padStart(2,'0')+'h'; }) },
    { label: 'Actif', segs: computeDimensionSegments(t => t.asset || null) },
    { label: 'Session', segs: computeDimensionSegments(t => t.session || null) },
    { label: 'Stratégie / setup', segs: computeDimensionSegments(t => t.desc || null) },
    { label: 'Sens', segs: computeDimensionSegments(t => t.dir || null) },
  ];

  const all = [];
  dims.forEach(dim => dim.segs.forEach(s => all.push({ dimension: dim.label, key:s.key, n:s.n, totalR:s.totalR, avgR:s.avgR, winRate:s.winRate, reliable:s.reliable, score: s.avgR * Math.sqrt(s.n) })));

  if (all.length === 0) {
    cont.innerHTML = `<p style="font-size:12px;color:var(--txt3)">Pas assez de segments avec au moins 3 trades pour dégager un edge fiable — renseigne asset, heure, session ou stratégie sur tes trades.</p>`;
    return;
  }

  // Priorité aux segments fiables (n≥10) pour les deux mises en avant ; à défaut, on prend les meilleurs disponibles en le signalant comme provisoire.
  const reliableAll = all.filter(s => s.reliable);
  const rankedReliable = reliableAll.slice().sort((a,b) => b.score - a.score);
  const ranked = all.slice().sort((a,b) => b.score - a.score);
  const best = rankedReliable[0] || ranked[0];
  const worst = (rankedReliable.length ? rankedReliable[rankedReliable.length-1] : ranked[ranked.length-1]);

  function heroCard(label, seg, isGood) {
    const col = isGood ? 'var(--green)' : 'var(--red)';
    const provisional = !seg.reliable;
    return `<div style="background:var(--bg3);border:1px solid var(--border);border-left:3px solid ${col};border-radius:var(--r);padding:16px;${provisional?'opacity:.75':''}">
      <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:8px">${label}${provisional ? ' <span style="color:var(--amber);text-transform:none;letter-spacing:0">(provisoire, n<10)</span>' : ''}</div>
      <div style="font-size:18px;font-weight:700;font-family:var(--mono);color:${col}">${esc(seg.key)}</div>
      <div style="font-size:11px;color:var(--txt3);font-family:var(--mono);margin-top:4px">${seg.dimension} · ${seg.n} trades · ${seg.winRate.toFixed(0)}% win · ${seg.totalR>=0?'+':''}${seg.totalR.toFixed(1)}R total</div>
    </div>`;
  }

  let html = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px">
    ${heroCard('💪 Ton edge le plus fort', best, true)}
    ${heroCard('⚠️ Ton plus gros point faible', worst, false)}
  </div>`;
  if (reliableAll.length === 0) {
    html += `<div style="margin-bottom:18px;padding:10px 14px;border:1px solid var(--amber);background:var(--amber-d);border-radius:var(--r);font-size:12px;color:var(--txt2)">⚠️ Aucun segment n'atteint 10 trades : tout ce qui suit est provisoire, à confirmer avec plus de données.</div>`;
  }

  const top5 = ranked.slice(0,5);
  const bottom5 = ranked.slice(-5).reverse();
  function miniTable(title, list) {
    return `<div>
      <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:8px">${title}</div>
      ${list.map(s => `<div style="display:flex;justify-content:space-between;font-size:12px;font-family:var(--mono);padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--txt2)">${esc(s.key)} <span style="color:var(--txt3)">· ${esc(s.dimension)}</span></span>
        <span style="color:${s.totalR>=0?'var(--green)':'var(--red)'}">${s.totalR>=0?'+':''}${s.totalR.toFixed(1)}R</span>
      </div>`).join('')}
    </div>`;
  }
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    ${miniTable('Top 5 segments', top5)}
    ${miniTable('5 segments les plus coûteux', bottom5)}
  </div>`;
  html += `<p style="margin-top:16px;font-size:11px;color:var(--txt3);line-height:1.6">Ce scan teste ${all.length} segments à la fois sur 6 dimensions : avec autant de comparaisons, un résultat qui a l'air fort peut être dû au hasard (« data dredging »). Un segment avec n < 10 est provisoire ; vérifie surtout qu'un edge se reproduit dans le temps avant d'en faire une règle.</p>`;
  cont.innerHTML = html;
}

// ── SHARPE / SORTINO ─────────────────────────────────────────────────
function computeDailyReturns() {
  const byDay = {};
  trades.forEach(t => { if (!t.date || t.pnlEur === null || t.pnlEur === undefined) return; byDay[t.date] = (byDay[t.date]||0) + t.pnlEur; });
  const bal = accountSize || 10000;
  return Object.values(byDay).map(v => v / bal);
}
function renderSharpeSortino() {
  const cont = document.getElementById('sharpe-sortino-body');
  if (!cont) return;
  const returns = computeDailyReturns();
  if (returns.length < 10) {
    cont.innerHTML = `<p style="font-size:12px;color:var(--txt3)">Encore trop peu de journées tradées (${returns.length}) — ces ratios ont besoin d'au moins une dizaine de jours pour être lisibles.</p>`;
    return;
  }
  const mean = returns.reduce((a,b)=>a+b,0) / returns.length;
  const variance = returns.reduce((a,b)=>a+(b-mean)*(b-mean),0) / returns.length;
  const stdev = Math.sqrt(variance);
  const downside = returns.filter(r => r < 0);
  const downsideDev = downside.length ? Math.sqrt(downside.reduce((a,b)=>a+b*b,0) / returns.length) : 0;
  const sqrtN = Math.sqrt(252);
  const sharpe = stdev > 0 ? (mean/stdev) * sqrtN : null;
  const sortino = downsideDev > 0 ? (mean/downsideDev) * sqrtN : null;

  function verdict(val) {
    if (val === null) return { txt: 'non calculable', col: 'var(--txt3)' };
    if (val < 0) return { txt: 'stratégie perdante', col: 'var(--red)' };
    if (val < 0.5) return { txt: 'faible', col: 'var(--red)' };
    if (val < 1) return { txt: 'acceptable', col: 'var(--amber)' };
    if (val < 2) return { txt: 'bon', col: 'var(--green)' };
    if (val < 3) return { txt: 'très bon', col: 'var(--green)' };
    return { txt: "exceptionnel — vérifie l'échantillon", col: 'var(--purple)' };
  }
  const sv = verdict(sharpe), tv = verdict(sortino);

  cont.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:16px;text-align:center">
      <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:8px">Sharpe (annualisé)</div>
      <div style="font-size:26px;font-weight:700;font-family:var(--mono);color:${sv.col}">${sharpe===null?'—':sharpe.toFixed(2)}</div>
      <div style="font-size:11px;color:${sv.col};margin-top:4px">${sv.txt}</div>
    </div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:16px;text-align:center">
      <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:8px">Sortino (annualisé)</div>
      <div style="font-size:26px;font-weight:700;font-family:var(--mono);color:${tv.col}">${sortino===null?'—':sortino.toFixed(2)}</div>
      <div style="font-size:11px;color:${tv.col};margin-top:4px">${tv.txt}</div>
    </div>
  </div>
  ${returns.length < 30 ? '<p style="font-size:11px;color:var(--amber);margin-top:12px;line-height:1.6">⚠️ Annualisé sur seulement ' + returns.length + ' journée(s) : ces ratios deviennent fiables à partir d\'une trentaine de jours. En dessous, prends-les comme un indice, pas une conclusion.</p>' : ''}
  <p style="font-size:11px;color:var(--txt3);margin-top:12px;line-height:1.6">Calculés sur ${returns.length} journée(s) de trading, en % de ton solde de départ (${(accountSize||10000).toFixed(0)} €). Le Sharpe pénalise toute volatilité, le Sortino uniquement les jours négatifs. À prendre avec prudence sous 30 jours de données.</p>`;
}

// ── COIN FLIP DISTRIBUTION ───────────────────────────────────────────
function normalCDF(x) {
  const t = 1/(1+0.2316419*Math.abs(x));
  const d = 0.3989423*Math.exp(-x*x/2);
  let prob = d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
}
function renderCoinFlip() {
  const cont = document.getElementById('coinflip-body');
  if (!cont) return;
  const wins = trades.filter(t => t.res === 'TP').length;
  const losses = trades.filter(t => t.res === 'SL').length;
  const be = trades.filter(t => t.res === 'BE').length;
  const n = wins + losses + be;
  if (n < 20) {
    cont.innerHTML = `<p style="font-size:12px;color:var(--txt3)">Il te faut au moins 20 trades fermés pour un test crédible (tu en as ${n}). En dessous de 50-100 trades, prends le résultat avec des pincettes.</p>`;
    return;
  }
  // Seuil de rentabilité réel : compte tenu de ton payoff (gain moyen / perte moyenne en €), le seuil pour être rentable
  // n'est pas 50 % — un payoff > 1 rend un win rate < 50 % rentable, et inversement. On teste contre CE seuil, pas contre pile-ou-face.
  const eurClosed = trades.filter(t => t.pnlEur !== null && t.pnlEur !== undefined && ['TP','SL'].includes(t.res));
  const ew = eurClosed.filter(t => t.res === 'TP'), el = eurClosed.filter(t => t.res === 'SL');
  const avgWinE = ew.length ? ew.reduce((s,t)=>s+t.pnlEur,0)/ew.length : null;
  const avgLossE = el.length ? Math.abs(el.reduce((s,t)=>s+t.pnlEur,0)/el.length) : null;
  const hasPayoff = avgWinE !== null && avgLossE > 0;
  const p0 = hasPayoff ? avgLossE / (avgWinE + avgLossE) : 0.5;
  const winRate = wins / n;
  const z = (wins - n*p0) / Math.sqrt(n*p0*(1-p0));
  const pValue = 2*(1-normalCDF(Math.abs(z)));
  const significant = pValue < 0.05;
  const barPct = Math.min(Math.max(winRate*100,0),100);
  const p0Pct = Math.round(p0*100);

  cont.innerHTML = `
    <div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;margin-bottom:14px">
      <div>
        <div style="font-size:12px;color:var(--txt2);margin-bottom:4px">Ton win rate</div>
        <div style="font-size:28px;font-weight:600;letter-spacing:-.02em">${(winRate*100).toFixed(1).replace('.', ',')} %</div>
      </div>
      <div style="flex:1;min-width:180px">
        <div class="meter" style="margin:6px 0 30px">
          <div class="meter-fill" style="width:${barPct}%;background:${significant ? (winRate >= p0 ? 'var(--green)' : 'var(--red)') : 'var(--amber)'}"></div>
          <div class="meter-tick" style="left:calc(50% - 1px);background:var(--txt3)"></div><div class="meter-tick-lbl" style="left:50%;color:var(--txt3)">50 %</div>
          ${hasPayoff && Math.abs(p0Pct-50) >= 4 ? `<div class="meter-tick" style="left:calc(${p0Pct}% - 1px)"></div><div class="meter-tick-lbl" style="left:${Math.max(8, p0Pct)}%">seuil ${p0Pct} %</div>` : ''}
        </div>
      </div>
    </div>
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:14px;font-size:12.5px;line-height:1.7;color:var(--txt2)">
      ${hasPayoff ? `Compte tenu de ton payoff (gain moyen ${fmtEUR(avgWinE,false,0)} / perte moyenne ${fmtEUR(avgLossE,false,0)}), ton seuil de rentabilité réel est <strong>${p0Pct}%</strong> — pas 50 %. ` : ''}
      ${significant
        ? `✅ Avec ${n} trades, ton win rate est <strong style="color:var(--green)">statistiquement différent</strong> de ce seuil (p = ${pValue.toFixed(3)}). Ce n'est probablement pas de la chance.`
        : `⚠️ Avec ${n} trades, on ne peut <strong style="color:var(--amber)">pas encore exclure</strong> que ton win rate soit dû au hasard par rapport à ce seuil (p = ${pValue.toFixed(3)}). Continue à journaliser${n<100?' — vise au moins 50-100 trades':''}.`}
    </div>`;
}

// ── COÛT DES ERREURS ─────────────────────────────────────────────────
function renderMistakeCostReport() {
  const trades = analysisTrades();
  const cont = document.getElementById('mistake-cost-body');
  if (!cont) return;
  const withMistakes = trades.filter(t => Array.isArray(t.mistakes) && t.mistakes.length);
  if (withMistakes.length === 0) {
    cont.innerHTML = `<p style="font-size:12px;color:var(--txt3)">Tague les erreurs sur tes trades (Dashboard → Nouveau trade) pour voir leur coût réel ici. Les erreurs suivies sont éditables dans Plan de trading.</p>`;
    return;
  }
  const map = {};
  withMistakes.forEach(t => {
    t.mistakes.forEach(m => {
      if (!map[m]) map[m] = { n:0, costEur:0, costR:0 };
      map[m].n++;
      if (t.pnlEur !== null && t.pnlEur !== undefined) map[m].costEur += t.pnlEur;
      if (t.pnl != null) map[m].costR += t.pnl;
    });
  });
  const rows = Object.entries(map).sort((a,b) => a[1].costEur - b[1].costEur);
  const totalCost = rows.reduce((s,[,v]) => s + (v.costEur<0?v.costEur:0), 0);

  let html = `<div style="margin-bottom:12px;font-size:13px;color:var(--txt2)">Coût total estimé de tes erreurs taguées : <strong style="color:var(--red)">${totalCost.toFixed(0)} €</strong></div>`;
  const maxAbs = Math.max(...rows.map(([, v]) => Math.abs(v.costEur)), 1e-9);
  html += rows.map(([label,v]) => `<div style="display:grid;grid-template-columns:minmax(140px,220px) 1fr;gap:16px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:12.5px">
      <span style="color:var(--txt)">${esc(label)} <span style="color:var(--txt3);font-family:var(--mono)">${v.n}×</span></span>
      ${divBarCell(v.costEur, maxAbs, (v.costEur>=0?'+':'') + v.costEur.toFixed(0) + ' € · ' + (v.costR>=0?'+':'') + v.costR.toFixed(1) + 'R')}
    </div>`).join('');
  cont.innerHTML = html;
}

// ── COMPARATEUR "ET SI" ───────────────────────────────────────────────
function renderWhatIf() {
  const trades = analysisTrades();
  const cont = document.getElementById('whatif-body');
  if (!cont) return;
  const closed = trades.filter(t => ['TP','SL','BE'].includes(t.res));
  if (closed.length < 5) {
    cont.innerHTML = `<p style="font-size:12px;color:var(--txt3)">Pas assez de trades fermés pour ce comparateur.</p>`;
    return;
  }
  const tp = closed.filter(t => t.res === 'TP').length;
  const sl = closed.filter(t => t.res === 'SL').length;
  const be = closed.filter(t => t.res === 'BE').length;
  const actualTotalR = closed.reduce((s,t) => s+(t.pnl||0), 0);
  const rrVals = trades.map(t=>t.rr).filter(v=>v!==null&&v!==undefined);
  const actualAvgRR = rrVals.length ? rrVals.reduce((a,b)=>a+b,0)/rrVals.length : null;

  const targets = [1, 1.5, 2, 2.5, 3, 4, 5];
  const rows = targets.map(rr => ({ rr, simulatedR: tp*rr - sl*1 }));
  const bestRow = rows.slice().sort((a,b) => b.simulatedR - a.simulatedR)[0];

  let html = `<p style="font-size:12px;color:var(--txt2);margin-bottom:14px">Avec ton win rate actuel (${tp} gagnants / ${sl} perdants / ${be} BE) et un risque fixe de 1R par perte, voici ce que donnerait un objectif de gain fixe différent sur chaque trade gagnant :</p>`;
  html += `<div style="overflow-x:auto"><table><thead><tr><th>Objectif RR</th><th>Résultat simulé</th><th>Différence vs réel</th></tr></thead><tbody>`;
  rows.forEach(r => {
    const diff = r.simulatedR - actualTotalR;
    const isBest = r.rr === bestRow.rr;
    html += `<tr style="${isBest?'background:var(--green-dd)':''}">
      <td>${r.rr}R${isBest?' 🏆':''}</td>
      <td style="color:${r.simulatedR>=0?'var(--green)':'var(--red)'}">${r.simulatedR>=0?'+':''}${r.simulatedR.toFixed(1)}R</td>
      <td style="color:${diff>=0?'var(--green)':'var(--red)'}">${diff>=0?'+':''}${diff.toFixed(1)}R</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  html += `<p style="font-size:11px;color:var(--txt3);margin-top:12px;line-height:1.6">Ton résultat réel actuel : ${actualTotalR>=0?'+':''}${actualTotalR.toFixed(1)}R${actualAvgRR!==null?` (RR moyen observé : ${actualAvgRR.toFixed(2)}R)`:''}. Hypothèse simplificatrice : ce test suppose que ton win rate resterait identique avec un objectif RR différent — en réalité viser plus loin réduit souvent le taux de réussite, donc ce chiffre est une borne théorique, pas une prédiction.</p>`;
  cont.innerHTML = html;
}

