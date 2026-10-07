// ── DÉFI « 30 JOURS DE DISCIPLINE » et CARTE « MA SEMAINE » ───────────────
// Défi : 30 jours d'affilée sans journée « pas propre » (score de discipline < 80 %, voir Gestion du risque). Les jours
// sans trade comptent (ne pas trader est une décision valable) ; une journée pas propre fait échouer le défi.
// Carte : image carrée de la semaine, à partager sans montant en euros (R, win rate, discipline, défi).
const chL = (fr, en) => LANG === 'en' ? en : fr;
const CH_DAYS = 30;
function chState() {
  const c = loadJSON(JP + 'challenge', null);
  if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(c.start || '')) return null;
  const disc = rkDiscipline(trades), byDay = {};
  disc.days.forEach(d => { byDay[d.date] = d; });
  const today = localDateStr(), cells = [];
  let fail = null, done = 0;
  for (let i = 0; i < CH_DAYS; i++) {
    const d = localDateStr(new Date(new Date(c.start + 'T12:00:00').getTime() + i * 86400000));
    const day = byDay[d], future = d > today;
    const st = future ? 'future' : day ? (day.clean ? 'clean' : 'bad') : 'rest';
    if (st === 'bad' && !fail) fail = d;
    if (!future) done++;
    cells.push({ d, st, score: day ? day.score : null });
  }
  return { start: c.start, cells, fail, done: Math.min(done, CH_DAYS), won: !fail && done >= CH_DAYS, clean: cells.filter(x => x.st === 'clean').length };
}
function startChallenge() {
  DB.setItem(JP + 'challenge', JSON.stringify({ start: localDateStr() }));
  renderChallenge();
  showToast(chL('Défi lancé : 30 jours, une journée propre à la fois 💪', 'Challenge started: 30 days, one clean day at a time 💪'), 'success');
}
function stopChallenge() { DB.removeItem(JP + 'challenge'); renderChallenge(); }
function renderChallenge() {
  const el = document.getElementById('rk-challenge');
  if (!el) return;
  const s = chState();
  if (!s) {
    mount(el, html`<p class="ch-intro">${chL('Pendant 30 jours, chaque journée tradée doit être « propre » : stop sur chaque trade, checklist respectée, pas d’erreur, limites du jour respectées, pas de revanche. Les jours sans trade comptent aussi.', 'For 30 days, every traded day must be “clean”: a stop on every trade, checklist followed, no mistake, daily limits respected, no revenge. Days without trades count too.')}</p>
      <button type="button" class="btn-primary" onclick="startChallenge()">${chL('Lancer le défi aujourd’hui', 'Start the challenge today')}</button>`);
    return;
  }
  const lbl = { clean: chL('journée propre', 'clean day'), bad: chL('journée pas propre', 'not a clean day'), rest: chL('pas de trade', 'no trade'), future: chL('à venir', 'to come') };
  const head = s.won ? html`<b class="tone-green">🏆 ${chL('Défi réussi : 30 jours de discipline !', 'Challenge won: 30 days of discipline!')}</b>`
    : s.fail ? html`<b class="tone-red">${chL('Défi interrompu le ', 'Challenge broken on ')}${fmtDateFR(s.fail, true)}</b> <span class="tone-muted">${chL('— ce n’est pas grave : relance-le et vise un jour de plus.', '— no big deal: restart it and aim for one more day.')}</span>`
    : html`<b>${chL('Jour ', 'Day ')}${s.done} / ${CH_DAYS}</b> <span class="tone-muted">· ${s.clean} ${chL('journée(s) propre(s) tradée(s)', 'clean traded day(s)')}</span>`;
  mount(el, html`<div class="ch-head">${head}</div>
    <div class="ch-grid" role="img" aria-label="${chL('Progression du défi', 'Challenge progress')}">${s.cells.map((c, i) => html`<span class="${raw('ch-cell ch-' + c.st)}" title="${fmtDateFR(c.d, true) + ' · ' + lbl[c.st] + (c.score != null ? ' (' + Math.round(c.score * 100) + ' %)' : '')}">${i + 1}</span>`)}</div>
    <div class="ch-legend"><span class="ch-cell ch-clean"></span>${lbl.clean}<span class="ch-cell ch-rest"></span>${lbl.rest}<span class="ch-cell ch-bad"></span>${lbl.bad}</div>
    <div class="ch-act">${s.fail || s.won ? html`<button type="button" class="btn-primary" onclick="startChallenge()">${chL('Relancer le défi', 'Restart the challenge')}</button>` : ''}<button type="button" class="btn-ghost" onclick="shareWeekCard()">📤 ${chL('Carte de ma semaine', 'My week card')}</button><button type="button" class="btn-ghost" onclick="stopChallenge()">${chL('Arrêter le défi', 'Stop the challenge')}</button></div>`);
}

// Carte « ma semaine » : semaine affichée dans la revue, sinon la semaine en cours.
function weekCardData() {
  const mon = typeof revueMonday !== 'undefined' && revueMonday && currentPage() === 'revue' ? revueMonday : mondayOf(new Date());
  const list = weekTrades(mon, trades).filter(t => ['TP', 'SL', 'BE'].includes(t.res));
  const W = winStats(list), r = list.reduce((s, t) => s + (typeof t.pnl === 'number' ? t.pnl : 0), 0);
  const disc = rkDiscipline(list), ch = chState();
  return { mon, sun: addDays(mon, 6), n: list.length, W, r, days: disc.days.length, cleanDays: disc.days.filter(d => d.clean).length, disc: disc.avg, ch };
}
function drawWeekCard(D) {
  const c = document.createElement('canvas'); c.width = c.height = 1080;
  const g = c.getContext('2d'), F = 'Inter, system-ui, sans-serif';
  const bg = g.createLinearGradient(0, 0, 1080, 1080); bg.addColorStop(0, '#0f1222'); bg.addColorStop(1, '#1b1240');
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1080);
  g.fillStyle = '#a5b4fc'; g.font = '600 34px ' + F; g.fillText(chL('MA SEMAINE DE TRADING', 'MY TRADING WEEK'), 80, 120);
  g.fillStyle = '#e8eaf0'; g.font = '700 56px ' + F;
  const fmt = d => d.toLocaleDateString(UI_LOCALE, { day: 'numeric', month: 'long' });
  g.fillText(fmt(D.mon) + ' → ' + fmt(D.sun), 80, 195);
  const tiles = [
    [chL('Trades', 'Trades'), String(D.n)],
    [chL('Résultat', 'Result'), (D.r >= 0 ? '+' : '−') + Math.abs(D.r).toFixed(1).replace('.', LANG === 'en' ? '.' : ',') + ' R'],
    [chL('Win rate', 'Win rate'), D.W.rate != null ? Math.round(D.W.rate * 100) + ' %' : '—'],
    [chL('Discipline', 'Discipline'), D.disc != null ? Math.round(D.disc * 100) + ' %' : '—']
  ];
  tiles.forEach(([l, v], i) => {
    const x = 80 + (i % 2) * 470, y = 270 + Math.floor(i / 2) * 250;
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.roundRect(x, y, 440, 210, 28); g.fill();
    g.fillStyle = '#9aa0ad'; g.font = '500 32px ' + F; g.fillText(l, x + 36, y + 66);
    g.fillStyle = i === 1 ? (D.r >= 0 ? '#34d399' : '#f87171') : '#ffffff'; g.font = '700 84px ' + F; g.fillText(v, x + 36, y + 165);
  });
  g.fillStyle = '#e8eaf0'; g.font = '500 36px ' + F;
  g.fillText(D.cleanDays + ' / ' + D.days + chL(' journée(s) tradée(s) propre(s)', ' clean traded day(s)'), 80, 840);
  if (D.ch && !D.ch.fail) { g.fillStyle = '#fbbf24'; g.fillText('🏁 ' + chL('Défi 30 jours : jour ', '30-day challenge: day ') + D.ch.done + ' / ' + CH_DAYS, 80, 900); }
  g.fillStyle = '#6b7280'; g.font = '400 26px ' + F;
  g.fillText(chL('Sans montants · le process avant le P&L', 'No amounts · process over P&L'), 80, 1010);
  drawBrandLogo(g, 740, 960, 66, '#F5F7FB');   // la marque, en bas à droite de chaque carte partagée
  return c;
}
function shareWeekCard() {
  const c = drawWeekCard(weekCardData());
  c.toBlob(async blob => {
    if (!blob) return;
    const name = 'ma-semaine-' + localDateStr() + '.png', file = new File([blob], name, { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: chL('Ma semaine de trading', 'My trading week') }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(chL('Carte de la semaine téléchargée ✓', 'Week card downloaded ✓'), 'success');
  }, 'image/png');
}
