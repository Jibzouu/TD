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
    if (rows.length === 0) { mount(tbody, html`<tr><td colspan="4" class="td-empty">${emptyMsg}</td></tr>`); return; }
    const maxAbs = Math.max(...rows.map(r => Math.abs(r.rr)), 1e-9);
    mount(tbody, html`${rows.map((r,i) => html`<tr>
        <td><span class="rank${raw(i < 3 ? ' top' : '')}">${i + 1}</span>${r.label}</td>
        <td>${r.n}${r.n < 10 ? html` <span class="tone-muted" title="Échantillon faible (n < 10)">⚠</span>` : ''}</td>
        <td>${r.wr.toFixed(0)} %</td>
        <td>${divBarCell(r.rr, maxAbs, (r.rr>=0?'+':'') + r.rr.toFixed(2) + 'R')}</td>
      </tr>`)}`);
  }
  fill(wdRows, 'stats-weekday-tbody', 'Pas assez de trades datés.');
  fill(hRows, 'stats-hour-tbody', "Renseigne l'heure d'entrée de tes trades pour voir ce classement.");
}

// ── STATS : analyse MAE / MFE ───────────────────────────────────────
function renderMaeMfeAnalysis() {
  const trades = viewTrades();   // vue filtrée (filtre global)
  const cont = document.getElementById('mae-mfe-body');
  if (!cont) return;
  const withData = trades.filter(t => (t.mfe!==null && t.mfe!==undefined) || (t.mae!==null && t.mae!==undefined));
  if (withData.length === 0) {
    mount(cont, UI.hint('Aucune donnée d\'excursion pour l\'instant. Importe un export TradingView (colonnes "Excursion favorable/adverse USD") pour débloquer cette analyse.'));
    return;
  }
  const winners = withData.filter(t => t.res === 'TP');
  const losers = withData.filter(t => t.res === 'SL');
  function avg(arr, field) {
    const vals = arr.map(t => t[field]).filter(v => v !== null && v !== undefined);
    return vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : null;
  }
  const wMfe = avg(winners,'mfe'), wMae = avg(winners,'mae'), lMfe = avg(losers,'mfe'), lMae = avg(losers,'mae');
  const cell = (label, val, tone) => UI.tile(label, val === null ? '—' : val.toFixed(1) + ' €', { center: true, tone });

  const insights = [];
  if (lMfe !== null && lMfe > 0) {
    insights.push(html`Tes trades perdants sont montés en moyenne à ${UI.em('+' + lMfe.toFixed(1) + '€')} de profit latent avant de finir en perte. Un take-profit partiel ou un stop suiveur pourrait capturer une partie de ce gain.`);
  }
  if (wMae !== null && lMae !== null) {
    insights.push(wMae >= lMae * 0.8
      ? html`Tes gagnants encaissent presque autant de chaleur (MAE moyen ${wMae.toFixed(1)}€) que tes perdants (${lMae.toFixed(1)}€) avant de repartir — ton stop n'est probablement pas le problème principal.`
      : html`Tes gagnants encaissent moins de chaleur (${wMae.toFixed(1)}€) que tes perdants (${lMae.toFixed(1)}€) — cohérent avec une bonne sélection d'entrées.`);
  }
  mount(cont, html`${UI.grid([cell('Gagnants — MFE moyen', wMfe, 'green'), cell('Gagnants — MAE moyen', wMae, 'amber'), cell('Perdants — MFE moyen', lMfe, 'blue'), cell('Perdants — MAE moyen', lMae, 'red')], 4)}
    ${insights.length ? UI.note(insights.map(i => html`<div>💡 ${i}</div>`)) : ''}`);
}

// ── STATS : respect de la checklist vs résultats ────────────────────
function renderChecklistAnalysis() {
  const trades = analysisTrades();
  const cont = document.getElementById('checklist-analysis-body');
  if (!cont) return;
  const total = getEntryItems().length;
  const withChecklist = trades.filter(tradeHasChecklist);
  if (total === 0 || withChecklist.length === 0) {
    mount(cont, UI.hint('Coche la checklist en ajoutant tes trades (bouton « ＋ Nouveau trade » en haut à droite) pour voir si respecter ton plan améliore vraiment tes résultats.'));
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
  const card = (label, s, tone) => html`<div class="ui-tile"><div class="ui-tile-label">${label} <span class="ui-muted">(${s.n} trades)</span></div>
    <div class="ui-grid c2 m-0">${UI.stat('win rate', s.wr.toFixed(0) + '%', { compact: true, tone })}${UI.stat('RR moyen', s.avgRR === null ? '—' : (s.avgRR >= 0 ? '+' : '') + s.avgRR.toFixed(2) + 'R', { compact: true, tone: s.avgRR === null ? 'muted' : s.avgRR >= 0 ? 'green' : 'red' })}</div></div>`;
  let conclusion = '';
  if (fs.n >= 3 && ps.n >= 3) {
    const diff = fs.wr - ps.wr;
    if (Math.abs(diff) >= 5) conclusion = UI.note(diff > 0
      ? html`💡 Respecter ta checklist en entier fait une vraie différence : ${UI.em('+' + diff.toFixed(0) + ' points', 'green')} de win rate par rapport aux trades où tu as sauté des critères.`
      : html`💡 Étonnant : tes trades avec checklist incomplète font ${UI.em('mieux', 'amber')} (+${Math.abs(diff).toFixed(0)} points) que ceux avec checklist complète. Vérifie si un critère de ta checklist te fait plus de mal que de bien.`);
  } else {
    conclusion = UI.hint('Encore trop peu de trades dans un des deux groupes pour tirer une conclusion fiable.');
  }
  mount(cont, html`${UI.grid([card('✓ Checklist complète', fs, 'green'), card('✗ Checklist incomplète', ps, 'amber')], 2)}${conclusion}`);
}

// ── TILT METER : détection de revenge trading ───────────────────────
function computeTiltTrades() {
  const trades = viewTrades();   // vue filtrée (filtre global)
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
    mount(cont, UI.hint('Pas assez de trades avec heure d\'entrée à la suite d\'une perte pour détecter un pattern de revenge trading.'));
    return;
  }
  const tiltPct = Math.round((flagged.length / lossesWithFollowup) * 100);
  const calmScore = 100 - tiltPct;
  const col = calmScore >= 70 ? 'green' : calmScore >= 40 ? 'amber' : 'red';
  const head = html`<div class="ui-big">
    <div><div class="ui-big-label">Score de sang-froid</div><div class="ui-big-val">${calmScore}<small> / 100</small></div></div>
    <div class="ui-big-side">${UI.meter(calmScore, col, { label: 'Score de sang-froid ' + calmScore + ' sur 100' })}
      <div class="ui-muted">${flagged.length} trade(s) suspect(s) sur ${lossesWithFollowup} perte(s) suivies d'un autre trade le même jour (${tiltPct}%).</div></div>
  </div>`;
  const list = flagged.length > 0
    ? html`<div class="ui-sep"><div class="ui-subtitle">Trades signalés</div>
        ${UI.rows(flagged.slice(0, 10).map(f => html`<span>${f.trade.date} · ${f.trade.entry} · ${f.trade.asset || '—'}</span><span class="tone-amber">${f.reasons.join(' · ')}</span>${UI.badgeRes(f.trade.res || '—')}`))}
        ${flagged.length > 10 ? UI.hint('+ ' + (flagged.length - 10) + ' autre(s)') : ''}</div>`
    : UI.hint('✓ Aucun pattern de revenge trading détecté sur tes trades actuels.', 'green');
  mount(cont, html`${head}${list}`);
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
  const trades = viewTrades();   // vue filtrée (filtre global)
  const cont = document.getElementById('edge-finder-body');
  if (!cont) return;
  const closedCount = trades.filter(t => ['TP','SL','BE'].includes(t.res)).length;
  if (closedCount < 10) {
    mount(cont, UI.hint(`Encore trop peu de trades fermés (${closedCount}) pour un scan fiable — reviens à partir d'une trentaine de trades.`));
    return;
  }
  const WD_NAMES = {0:'Dimanche',1:'Lundi',2:'Mardi',3:'Mercredi',4:'Jeudi',5:'Vendredi',6:'Samedi'};
  const dims = [
    { label: 'Jour de la semaine', segs: computeDimensionSegments(t => { if(!t.date) return null; const d=new Date(t.date+'T00:00:00'); return isNaN(d)?null:WD_NAMES[d.getDay()]; }) },
    { label: "Heure d'entrée", segs: computeDimensionSegments(t => { if(!t.entry) return null; const h=parseInt(t.entry.split(':')[0],10); return isNaN(h)?null:String(h).padStart(2,'0')+'h'; }) },
    { label: 'Actif', segs: computeDimensionSegments(t => t.asset || null) },
    { label: 'Session', segs: computeDimensionSegments(t => t.session || null) },
    { label: 'Setup', segs: computeDimensionSegments(t => t.setup || null) },
    { label: 'Sens', segs: computeDimensionSegments(t => t.dir || null) },
  ];

  const all = [];
  dims.forEach(dim => dim.segs.forEach(s => all.push({ dimension: dim.label, key:s.key, n:s.n, totalR:s.totalR, avgR:s.avgR, winRate:s.winRate, reliable:s.reliable, score: s.avgR * Math.sqrt(s.n) })));

  if (all.length === 0) {
    mount(cont, UI.hint('Pas assez de segments avec au moins 3 trades pour dégager un edge fiable — renseigne asset, heure, session ou stratégie sur tes trades.'));
    return;
  }

  // Priorité aux segments fiables (n≥10) pour les deux mises en avant ; à défaut, on prend les meilleurs disponibles en le signalant comme provisoire.
  const reliableAll = all.filter(s => s.reliable);
  const rankedReliable = reliableAll.slice().sort((a,b) => b.score - a.score);
  const ranked = all.slice().sort((a,b) => b.score - a.score);
  const best = rankedReliable[0] || ranked[0];
  const worst = (rankedReliable.length ? rankedReliable[rankedReliable.length-1] : ranked[ranked.length-1]);
  const signedR = v => (v >= 0 ? '+' : '') + v.toFixed(1) + 'R';

  const heroCard = (label, seg, isGood) => UI.tile(
    html`${label}${!seg.reliable ? html` <span class="tone-amber">(provisoire, n&lt;10)</span>` : ''}`, seg.key,
    { tone: isGood ? 'green' : 'red', accent: true, dim: !seg.reliable, sub: `${seg.dimension} · ${seg.n} trades · ${seg.winRate.toFixed(0)}% win · ${signedR(seg.totalR)} total` });
  const miniTable = (title, list) => html`<div><div class="ui-subtitle">${title}</div>
    ${UI.rows(list.map(s => html`<span>${s.key} <span class="sub">· ${s.dimension}</span></span><span class="${s.totalR >= 0 ? 'tone-green' : 'tone-red'}">${signedR(s.totalR)}</span>`))}</div>`;

  mount(cont, html`
    ${UI.grid([heroCard('💪 Ton edge le plus fort', best, true), heroCard('⚠️ Ton plus gros point faible', worst, false)], 2)}
    ${reliableAll.length === 0 ? UI.note('⚠️ Aucun segment n\'atteint 10 trades : tout ce qui suit est provisoire, à confirmer avec plus de données.', 'warn') : ''}
    ${UI.grid([miniTable('Top 5 segments', ranked.slice(0, 5)), miniTable('5 segments les plus coûteux', ranked.slice(-5).reverse())], 2)}
    ${UI.hint(`Ce scan teste ${all.length} segments à la fois sur 6 dimensions : avec autant de comparaisons, un résultat qui a l'air fort peut être dû au hasard (« data dredging »). Un segment avec n < 10 est provisoire ; vérifie surtout qu'un edge se reproduit dans le temps avant d'en faire une règle.`)}`);
}

// ── COÛT DES ERREURS ─────────────────────────────────────────────────
function renderMistakeCostReport() {
  const trades = analysisTrades();
  const cont = document.getElementById('mistake-cost-body');
  if (!cont) return;
  const withMistakes = trades.filter(t => Array.isArray(t.mistakes) && t.mistakes.length);
  if (withMistakes.length === 0) {
    mount(cont, UI.hint('Tague les erreurs sur tes trades (bouton « ＋ Nouveau trade » en haut à droite) pour voir leur coût réel ici. Les erreurs suivies sont éditables dans Plan de trading.'));
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
  const maxAbs = Math.max(...rows.map(([, v]) => Math.abs(v.costEur)), 1e-9);
  mount(cont, html`<div class="ui-big-label mc-total">Coût total estimé de tes erreurs taguées : ${UI.em(totalCost.toFixed(0) + ' €', 'red')}</div>
    <div class="ui-rows">${rows.map(([label, v]) => html`<div class="ui-row grid-bar"><span>${label} <span class="sub">${v.n}×</span></span>${raw(divBarCell(v.costEur, maxAbs, (v.costEur>=0?'+':'') + v.costEur.toFixed(0) + ' € · ' + (v.costR>=0?'+':'') + v.costR.toFixed(1) + 'R'))}</div>`)}</div>`);
}
