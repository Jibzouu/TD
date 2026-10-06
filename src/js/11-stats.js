// ── STATS : timing (heure d'entrée, session, jour de la semaine) ─────
function renderStatsSessionTables() {
  renderHeatmap();
  renderSessionBars();
  renderWeekdayBars();
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
  const cell = (label, val, tone) => UI.tile(label, val === null ? '—' : fmtEUR(val, false, 1), { center: true, tone });

  const insights = [];
  if (lMfe !== null && lMfe > 0) {
    insights.push(html`Tes trades perdants sont montés en moyenne à ${UI.em(fmtEUR(lMfe, true, 1))} de profit latent avant de finir en perte. Un take-profit partiel ou un stop suiveur pourrait capturer une partie de ce gain.`);
  }
  if (wMae !== null && lMae !== null) {
    insights.push(wMae >= lMae * 0.8
      ? html`Tes gagnants encaissent presque autant de chaleur (MAE moyen ${fmtEUR(wMae, false, 1)}) que tes perdants (${fmtEUR(lMae, false, 1)}) avant de repartir — ton stop n'est probablement pas le problème principal.`
      : html`Tes gagnants encaissent moins de chaleur (${fmtEUR(wMae, false, 1)}) que tes perdants (${fmtEUR(lMae, false, 1)}) — cohérent avec une bonne sélection d'entrées.`);
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
    const sl = arr.filter(t => t.res === 'SL').length;
    const wr = tp + sl ? tp / (tp + sl) * 100 : 0;
    const rrVals = arr.map(t => t.pnl).filter(v => v !== null && v !== undefined);
    const avgRR = rrVals.length ? rrVals.reduce((a,b)=>a+b,0)/rrVals.length : null;
    return { n: arr.length, wr, avgRR };
  }
  const fs = stats(full), ps = stats(partial);
  const card = (label, s, tone) => html`<div class="ui-tile"><div class="ui-tile-label">${label} <span class="ui-muted">(${s.n} trades)</span></div>
    <div class="ui-grid c2 m-0">${UI.stat('win rate', fmtRate(s.wr, 0), { compact: true, tone })}${UI.stat('RR moyen', s.avgRR === null ? '—' : fmtR(s.avgRR, 2), { compact: true, tone: s.avgRR === null ? 'muted' : s.avgRR >= 0 ? 'green' : 'red' })}</div></div>`;
  let conclusion = '';
  if (fs.n >= 3 && ps.n >= 3) {
    const diff = fs.wr - ps.wr;
    if (Math.abs(diff) >= 5) conclusion = UI.note(diff > 0
      ? html`💡 Respecter ta checklist en entier fait une vraie différence : ${UI.em('+' + fmtNum(diff, 0) + ' points', 'green')} de win rate par rapport aux trades où tu as sauté des critères.`
      : html`💡 Étonnant : tes trades avec checklist incomplète font ${UI.em('mieux', 'amber')} (+${fmtNum(Math.abs(diff), 0)} points) que ceux avec checklist complète. Vérifie si un critère de ta checklist te fait plus de mal que de bien.`);
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
        ${UI.rows(flagged.slice(0, 10).map(f => html`<span>${fmtDateNum(f.trade.date)} · ${f.trade.entry} · ${f.trade.asset || '—'}</span><span class="tone-amber">${f.reasons.join(' · ')}</span>${UI.badgeRes(f.trade.res || '—')}`))}
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
    if (!map[key]) map[key] = { n:0, totalR:0, tp:0, sl:0 };
    map[key].n++;
    map[key].totalR += t.pnl;
    if (t.res === 'TP') map[key].tp++; else if (t.res === 'SL') map[key].sl++;
  });
  return Object.entries(map)
    .filter(([,v]) => v.n >= minN)
    .map(([key,v]) => ({ key, n:v.n, totalR:v.totalR, avgR:v.totalR/v.n, winRate:v.tp + v.sl ? v.tp/(v.tp + v.sl)*100 : 0, reliable: v.n >= 10 }));
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
  const WD_NAMES = LANG === 'en' ? {0:'Sunday',1:'Monday',2:'Tuesday',3:'Wednesday',4:'Thursday',5:'Friday',6:'Saturday'} : {0:'Dimanche',1:'Lundi',2:'Mardi',3:'Mercredi',4:'Jeudi',5:'Vendredi',6:'Samedi'};
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
  // Classement par R moyen par trade, pondéré par √n (score) : un segment très tradé n'écrase pas les autres par son seul volume.
  // Le « point faible » et les « segments perdants » ne contiennent QUE des segments qui perdent de l'argent (R moyen < 0).
  const best = rankedReliable[0] || ranked[0];
  const losing = all.filter(s => s.avgR < 0).sort((a, b) => a.score - b.score);
  const worst = losing.find(s => s.reliable) || losing[0] || null;
  const signedR = v => fmtR(v, 1);
  const segSub = seg => `${seg.dimension} · ${seg.n} trades · ${fmtRate(seg.winRate, 0)} win · ${fmtR(seg.avgR, 2)} par trade (${signedR(seg.totalR)} au total)`;
  const heroCard = (label, seg, isGood) => UI.tile(
    html`${label}${!seg.reliable ? html` <span class="tone-amber">(provisoire, n&lt;10)</span>` : ''}`, seg.key,
    { tone: isGood ? 'green' : 'red', accent: true, dim: !seg.reliable, sub: segSub(seg) });
  const noWeak = UI.tile('✅ Aucun point faible', 'Aucun segment perdant', { tone: 'green', accent: true, sub: 'tous tes segments d\'au moins 3 trades ont un R moyen positif' });
  const miniTable = (title, list, empty) => html`<div><div class="ui-subtitle">${title}</div>
    ${list.length ? UI.rows(list.map(s => html`<span>${s.key} <span class="sub">· ${s.dimension} · ${s.n} tr.</span></span><span class="${s.avgR >= 0 ? 'tone-green' : 'tone-red'}">${fmtR(s.avgR, 2)}/trade</span>`)) : UI.hint(empty)}</div>`;

  mount(cont, html`
    ${UI.grid([heroCard('💪 Ton edge le plus fort', best, true), worst ? heroCard('⚠️ Ton plus gros point faible', worst, false) : noWeak], 2)}
    ${reliableAll.length === 0 ? UI.note('⚠️ Aucun segment n\'atteint 10 trades : tout ce qui suit est provisoire, à confirmer avec plus de données.', 'warn') : ''}
    ${UI.grid([miniTable('Top 5 segments les plus solides (R moyen et nombre de trades)', ranked.slice(0, 5), ''), miniTable('Segments perdants', losing.slice(0, 5), 'Aucun segment perdant : rien ne te coûte de l\'argent de façon régulière.')], 2)}
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
  // Coût d'une erreur = argent perdu sur les trades concernés + pour une erreur de SORTIE (« sorti trop tôt »…),
  // le gain laissé sur la table (MFE − gain encaissé). Le P&L brut des trades n'est pas un coût : un trade gagnant
  // « sorti trop tôt » a quand même coûté ce qu'il n'a pas pris.
  const isExitErr = m => /sort|partiel|cl[oô]tur|coup[ée]/i.test(m);
  const map = {};
  withMistakes.forEach(t => {
    const eur = (typeof t.pnlEur === 'number' && !isNaN(t.pnlEur)) ? t.pnlEur : null;
    t.mistakes.forEach(m => {
      const g = map[m] = map[m] || { n: 0, lost: 0, missed: 0, pnl: 0 };
      g.n++;
      if (eur === null) return;
      g.pnl += eur;
      if (eur < 0) g.lost += -eur;
      if (isExitErr(m) && typeof t.mfe === 'number' && t.mfe > eur) g.missed += t.mfe - Math.max(eur, 0);
    });
  });
  const rows = Object.entries(map).map(([label, v]) => [label, Object.assign(v, { cost: v.lost + v.missed })]).sort((a, b) => b[1].cost - a[1].cost);
  const totalCost = rows.reduce((s, [, v]) => s + v.cost, 0);
  const maxAbs = Math.max(...rows.map(([, v]) => v.cost), 1e-9);
  mount(cont, html`<div class="ui-big-label mc-total">Coût total estimé de tes erreurs taguées : ${UI.em('−' + fmtEUR(totalCost, false, 0), 'red')}</div>
    <div class="ui-rows">${rows.map(([label, v]) => html`<div class="ui-row grid-bar" title="${label} : ${v.n} trade(s) · P&L de ces trades ${fmtEUR(v.pnl, true, 0)}"><span>${label} <span class="sub">${v.n}× · ${v.missed > 0 ? fmtEUR(v.lost, false, 0) + ' perdus + ' + fmtEUR(v.missed, false, 0) + ' de gain manqué' : 'pertes sur ces trades'}</span></span>${raw(divBarCell(-v.cost, maxAbs, v.cost > 0 ? '−' + fmtEUR(v.cost, false, 0) : '0 €'))}</div>`)}</div>
    ${UI.hint('Coût = argent perdu sur les trades concernés ; pour une erreur de sortie, on ajoute le gain laissé sur la table (excursion favorable max − gain encaissé).')}`);
}
