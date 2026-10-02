// ── REVUE HEBDOMADAIRE GUIDÉE ────────────────────────────────────────
// Une page par semaine (lundi → dimanche) : chiffres clés comparés à la semaine précédente, P&L par jour,
// 3 meilleurs / 3 pires trades, erreurs récurrentes, setups, puis 4 questions de revue enregistrées pour la semaine.
// Le filtre global (actif, setup, session, sens) s'applique ; la période est celle de la semaine choisie.
let revueMonday = null;
let revueDaysChartInst = null;
const REVUE_QUESTIONS = [
  ['good', 'Qu\'ai-je bien fait cette semaine ?', 'Ce que je veux refaire : patience, respect du plan, bonne lecture…'],
  ['cost', 'Qu\'est-ce qui m\'a coûté le plus ?', 'Erreur, émotion, contexte de marché…'],
  ['rule', 'Une règle à appliquer la semaine prochaine', 'Une seule, concrète et vérifiable.'],
  ['goal', 'Objectif de la semaine prochaine', 'Processus plutôt que résultat : ex. « checklist complète sur chaque trade ».']
];
function mondayOf(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function revueBaseTrades() { const f = Object.assign({}, FILTER, { period: 'all' }); return trades.filter(t => tradeMatchesFilter(t, f)); }
function weekTrades(monday, base) {
  const from = localDateStr(monday), to = localDateStr(addDays(monday, 6));
  return (base || revueBaseTrades()).filter(t => t.date && t.date >= from && t.date <= to);
}
function loadReviews() { return loadJSON(JP + 'weekly_reviews', {}) || {}; }
function saveReviewAnswer(key, value) {
  const all = loadReviews(), k = localDateStr(revueMonday);
  all[k] = Object.assign({}, all[k], { [key]: String(value).slice(0, 4000), updatedAt: Date.now() });
  try { DB.setItem(JP + 'weekly_reviews', JSON.stringify(all)); } catch (e) { reportStorageError(e); }
  const st = document.getElementById('revue-saved'); if (st) st.textContent = 'Enregistré ✓';
}
function revueStep(d) { revueMonday = addDays(revueMonday || mondayOf(new Date()), 7 * d); renderWeeklyReview(); }
function revueThisWeek() { revueMonday = mondayOf(new Date()); renderWeeklyReview(); }

// Chiffres d'une semaine (utilisés pour la semaine choisie et la précédente, pour les écarts).
function weekMetrics(list) {
  const eur = list.filter(t => t.pnlEur != null), W = winStats(list);
  const an = new Map(analysisTradesAll().map(t => [t.id, t]));
  const r = list.map(t => an.get(t.id)).filter(t => t && t.pnl != null);
  const gw = eur.filter(t => t.pnlEur > 0).reduce((s, t) => s + t.pnlEur, 0), gl = Math.abs(eur.filter(t => t.pnlEur < 0).reduce((s, t) => s + t.pnlEur, 0));
  return { n: list.length, pnl: eur.reduce((s, t) => s + t.pnlEur, 0), hasEur: eur.length > 0, r: r.reduce((s, t) => s + t.pnl, 0), W, pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : null),
    mistakes: list.reduce((s, t) => s + (Array.isArray(t.mistakes) ? t.mistakes.length : 0), 0),
    checklistOk: list.filter(tradeHasChecklist).length ? list.filter(t => tradeHasChecklist(t) && tradeChecklistComplete(t)).length / list.filter(tradeHasChecklist).length : null };
}
// Vue « analyse » sur tous les trades (R non retenus masqués), indépendante du filtre de période.
function analysisTradesAll() { return trades.map(t => (t.pnl == null || rUsable(t)) ? t : Object.assign({}, t, { pnl: null, rr: null })); }
function deltaChip(cur, prev, fmt, higherIsBetter = true) {
  if (prev === null || prev === undefined || cur === null || cur === undefined || !isFinite(cur) || !isFinite(prev)) return '';
  const d = cur - prev; if (Math.abs(d) < 1e-9) return html`<span class="delta flat">= sem. préc.</span>`;
  const good = (d > 0) === higherIsBetter;
  return html`<span class="delta ${raw(good ? 'up' : 'down')}">${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))} vs sem. préc.</span>`;
}

function renderWeeklyReview() {
  const cont = document.getElementById('revue-content'); if (!cont) return;
  const base = revueBaseTrades();
  if (!revueMonday) {
    // Par défaut : cette semaine, ou la dernière semaine tradée si rien cette semaine.
    const cur = mondayOf(new Date());
    revueMonday = weekTrades(cur, base).length || !base.length ? cur : mondayOf(new Date(base[0].date + 'T00:00:00'));
  }
  const mon = revueMonday, sun = addDays(mon, 6), prevMon = addDays(mon, -7);
  const label = document.getElementById('revue-week-label');
  const iso = getISOWeek(mon);
  if (label) label.textContent = 'Semaine ' + iso.week + ' · ' + mon.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'short' }) + ' → ' + sun.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
  const list = weekTrades(mon, base), prevList = weekTrades(prevMon, base);
  const M = weekMetrics(list), P = weekMetrics(prevList);
  const answers = loadReviews()[localDateStr(mon)] || {};
  const be = breakevenWinRate(base);
  const t = chartTokens();

  if (!list.length) {
    mount(cont, html`${UI.empty('🗓️', 'Aucun trade cette semaine', 'Change de semaine avec les flèches, ou réponds quand même aux questions : une semaine sans trade est aussi une décision.', null)}${reviewQuestionsHtml(answers)}`);
    if (revueDaysChartInst) { revueDaysChartInst.destroy(); revueDaysChartInst = null; }
    return;
  }
  const sorted = list.slice().sort((a, b) => (b.pnlEur ?? b.pnl ?? 0) - (a.pnlEur ?? a.pnl ?? 0));
  const top = sorted.filter(x => (x.pnlEur ?? x.pnl ?? 0) > 0).slice(0, 3), flop = sorted.slice().reverse().filter(x => (x.pnlEur ?? x.pnl ?? 0) < 0).slice(0, 3);
  const mist = {};
  list.forEach(x => (x.mistakes || []).forEach(m => { const g = mist[m] = mist[m] || { n: 0, cost: 0 }; g.n++; if (x.pnlEur != null) g.cost += x.pnlEur; }));
  const mistRows = Object.entries(mist).sort((a, b) => b[1].n - a[1].n || a[1].cost - b[1].cost);
  const prevMist = {}; prevList.forEach(x => (x.mistakes || []).forEach(m => { prevMist[m] = (prevMist[m] || 0) + 1; }));
  const setups = {};
  list.forEach(x => { const k = x.setup || 'Sans setup'; const g = setups[k] = setups[k] || { n: 0, w: 0, pnl: 0 }; g.n++; if (x.res === 'TP') g.w++; if (x.pnlEur != null) g.pnl += x.pnlEur; });
  const fmtE = v => fmtEUR(v, false, 0);
  const tradeCard = x => html`<button class="rv-trade" onclick="openTradeDetail(${raw(x.id)})">
      ${tradeImages(x)[0] ? html`<img src="${raw(safeImgSrc(tradeImages(x)[0]))}" alt="">` : html`<span class="rv-noimg">${x.asset ? x.asset.slice(0, 3) : '—'}</span>`}
      <span class="rv-trade-main"><b>${x.asset || '—'}</b> <span class="ui-muted">${fmtDateFR(x.date)}${x.setup ? ' · ' + x.setup : ''}</span></span>
      <span class="rv-trade-val">${x.pnlEur != null ? UI.pnl(x.pnlEur, '€') : UI.pnl(x.pnl, 'R')}</span></button>`;

  mount(cont, html`
    <div class="rv-kpis">
      ${UI.stat('Résultat de la semaine', M.hasEur ? fmtEUR(M.pnl, true) : fmtR(M.r, 2), { tone: (M.hasEur ? M.pnl : M.r) >= 0 ? 'green' : 'red', sub: deltaChip(M.hasEur ? M.pnl : M.r, prevList.length ? (M.hasEur ? P.pnl : P.r) : null, v => M.hasEur ? fmtE(v) : v.toFixed(2) + 'R') })}
      ${UI.stat('Trades', String(M.n), { sub: deltaChip(M.n, prevList.length ? P.n : null, v => String(v), false) })}
      ${UI.stat('Win rate', M.W.n ? fmtRate(M.W.rate * 100, 0) : '—', { tone: M.W.n && be !== null ? (M.W.rate >= be ? 'green' : 'red') : null, sub: be !== null ? 'seuil de rentabilité ' + Math.round(be * 100) + ' %' : '' })}
      ${UI.stat('Profit factor', M.pf === null ? '—' : (M.pf === Infinity ? '∞' : fmtNum(M.pf, 2)), { sub: deltaChip(M.pf === Infinity ? null : M.pf, prevList.length && P.pf !== Infinity ? P.pf : null, v => v.toFixed(2)) })}
      ${UI.stat('Checklist complète', M.checklistOk === null ? 'non suivie' : Math.round(M.checklistOk * 100) + ' %', { sub: deltaChip(M.checklistOk === null ? null : M.checklistOk * 100, prevList.length && P.checklistOk !== null ? P.checklistOk * 100 : null, v => Math.round(v) + ' pts') })}
      ${UI.stat('Erreurs taguées', String(M.mistakes), { tone: M.mistakes ? 'amber' : null, sub: deltaChip(M.mistakes, prevList.length ? P.mistakes : null, v => String(v), false) })}
    </div>
    <div class="rv-grid">
      ${UI.card('Résultat par jour', 'lundi → dimanche', html`<div class="chart-wrap h-200"><canvas id="revueDaysChart"></canvas></div>`)}
      ${UI.card('Setups de la semaine', 'trades · win rate · résultat', mountSetups(setups))}
    </div>
    <div class="rv-grid">
      ${UI.card('3 meilleurs trades', 'clique pour ouvrir la fiche', top.length ? html`<div class="rv-trades">${top.map(tradeCard)}</div>` : html`<p class="ui-muted">Aucun trade gagnant cette semaine.</p>`)}
      ${UI.card('3 pires trades', 'à revoir en priorité', flop.length ? html`<div class="rv-trades">${flop.map(tradeCard)}</div>` : html`<p class="ui-muted">Aucun trade perdant cette semaine 👏</p>`)}
    </div>
    ${UI.card('Erreurs récurrentes', 'fréquence et coût cette semaine, tendance vs semaine précédente', mistRows.length ? UI.table(['Erreur', 'Fois', 'Coût', 'Sem. préc.'], mistRows.map(([m, g]) => [m, String(g.n), UI.pnl(g.cost, '€'), prevMist[m] ? String(prevMist[m]) + (g.n < prevMist[m] ? ' ↓' : g.n > prevMist[m] ? ' ↑' : '') : '—']), { align: ['l', 'r', 'r', 'r'] }) : html`<p class="ui-muted">Aucune erreur taguée cette semaine${list.some(x => Array.isArray(x.mistakes)) ? ' 👏' : ' — tague tes erreurs dans le formulaire pour les suivre ici'}.</p>`)}
    ${weekLessonsCard(mon)}
    ${reviewQuestionsHtml(answers)}`);

  // Graphique P&L par jour (lun → dim).
  if (revueDaysChartInst) { revueDaysChartInst.destroy(); revueDaysChartInst = null; }
  if (chartsAvailable('revueDaysChart')) {
    const days = [...Array(7)].map((_, i) => addDays(mon, i)), useEur = M.hasEur;
    const vals = days.map(d => { const k = localDateStr(d); return +list.filter(x => x.date === k).reduce((s, x) => s + (useEur ? (x.pnlEur || 0) : (x.pnl || 0)), 0).toFixed(2); });
    const counts = days.map(d => list.filter(x => x.date === localDateStr(d)).length);
    revueDaysChartInst = new Chart(document.getElementById('revueDaysChart').getContext('2d'), {
      type: 'bar',
      data: { labels: days.map(d => d.toLocaleDateString(UI_LOCALE, { weekday: 'short', day: 'numeric' })), datasets: [{ data: vals, backgroundColor: vals.map(v => v >= 0 ? t.green : t.red), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 32 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: proTooltip({ displayColors: false, callbacks: { label: c => (useEur ? fmtEUR(c.raw, true) : (c.raw >= 0 ? '+' : '') + c.raw + 'R') + ' · ' + counts[c.dataIndex] + ' trade(s)' } }) },
        scales: proScales({ yWidth: 64, y: { ticks: { callback: v => useEur ? fmtEURCompact(v) : v + 'R' } } }) },
      plugins: [refLinePlugin('rvZero', 0, '')]
    });
  }
}
function mountSetups(setups) {
  const rows = Object.entries(setups).sort((a, b) => b[1].pnl - a[1].pnl);
  return UI.table(['Setup', 'Trades', 'Win rate', 'Résultat'], rows.map(([k, g]) => [k, String(g.n), Math.round(g.w / g.n * 100) + ' %', UI.pnl(g.pnl, '€')]), { align: ['l', 'r', 'r', 'r'] });
}
function reviewQuestionsHtml(answers) {
  return UI.card('Questions de revue', 'tes réponses sont enregistrées pour cette semaine', html`<div class="rv-questions">
    ${REVUE_QUESTIONS.map(([k, q, ph]) => html`<div class="field"><label for="rv-${raw(k)}">${q}</label><textarea id="rv-${raw(k)}" placeholder="${ph}" oninput="clearTimeout(window.__rvT);window.__rvT=setTimeout(()=>saveReviewAnswer('${raw(k)}', this.value),400)">${answers[k] || ''}</textarea><div class="print-answer">${answers[k] || '—'}</div></div>`)}
    <div class="ui-muted" id="revue-saved">${answers.updatedAt ? 'Dernière modification : ' + fmtDateTime(answers.updatedAt) : 'Enregistrement automatique pendant que tu écris.'}</div>
  </div>`);
}
// Export PDF : la mise en page d'impression masque le menu et les boutons, puis on ouvre la boîte « Imprimer / Enregistrer en PDF ».
function printWeeklyReview() {
  REVUE_QUESTIONS.forEach(([k]) => { const ta = document.getElementById('rv-' + k); const pa = ta && ta.nextElementSibling; if (pa) pa.textContent = ta.value || '—'; });
  document.body.classList.add('printing-review');
  const done = () => { document.body.classList.remove('printing-review'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => { window.print(); setTimeout(done, 1000); }, 50);
}
