// ── COACH (sans IA) : constats clairs en fin de journée et de semaine ──────
// Calculs dans 00i-coach-calc.js. Affichage : Dashboard (aujourd'hui s'il y a des trades, sinon les 7 derniers jours),
// Bilan journalier (journée choisie) et Revue hebdo (semaine affichée). 3 constats au plus, le plus important d'abord.
const coL = (fr, en) => LANG === 'en' ? en : fr;
function coachOpts(period) {
  return {
    period,
    maxTrades: typeof rkCfg === 'function' ? rkCfg().maxTrades : 0,
    checklistDone: t => typeof tradeHasChecklist === 'function' && tradeHasChecklist(t) ? tradeChecklistComplete(t) : null
  };
}
function coachCardHtml(title, sub, items, more) {
  const ic = { warn: '⚠️', good: '✅', info: '💡' };
  return html`<div class="coach-hdr"><b>🧭 ${title}</b><small>${sub}</small></div>
    <ul class="coach-list">${items.slice(0, 3).map(x => html`<li class="${raw('co-' + x.tone)}"><span aria-hidden="true">${ic[x.tone]}</span><span>${LANG === 'en' ? x.en : x.fr}</span></li>`)}</ul>
    ${more ? html`<p class="coach-more">${more}</p>` : ''}`;
}
function coachMount(id, title, sub, list, period, emptyMsg) {
  const el = document.getElementById(id);
  if (!el) return;
  const items = coachInsights(list, coachOpts(period));
  if (!items.length) { if (emptyMsg) { el.hidden = false; mount(el, html`<div class="coach-hdr"><b>🧭 ${title}</b><small>${sub}</small></div><p class="coach-more">${emptyMsg}</p>`); } else el.hidden = true; return; }
  el.hidden = false;
  mount(el, coachCardHtml(title, sub, items, items.length > 3 ? '+' + (items.length - 3) + coL(' autre(s) constat(s) dans la revue hebdo', ' more in the weekly review') : ''));
}
function renderCoachDash() {
  const today = localDateStr(), list = viewTrades();
  const todays = list.filter(t => t.date === today && ['TP', 'SL', 'BE'].includes(t.res));
  if (todays.length) return coachMount('coach-dash', coL('Coach : ta journée', 'Coach: your day'), coL('ce que disent tes trades d’aujourd’hui', 'what today’s trades say'), todays, 'day');
  const from = localDateStr(new Date(Date.now() - 6 * 86400000));
  coachMount('coach-dash', coL('Coach : tes 7 derniers jours', 'Coach: your last 7 days'), coL('les points qui comptent le plus', 'what matters most'), list.filter(t => t.date >= from && t.date <= today), 'week');
}
function renderCoachDay() {
  const sel = document.getElementById('bilan-date-select'), d = sel && sel.value;
  if (!d) { const el = document.getElementById('coach-day'); if (el) el.hidden = true; return; }
  coachMount('coach-day', coL('Coach : bilan de la journée', 'Coach: end-of-day review'), fmtDateFR(d, true), viewTrades().filter(t => t.date === d), 'day', coL('Pas encore de trade fermé ce jour-là.', 'No closed trade that day yet.'));
}
function renderCoachWeek() {
  if (!revueMonday) return;
  coachMount('coach-week', coL('Coach : bilan de la semaine', 'Coach: weekly review'), coL('à lire avant de répondre aux questions', 'read before answering the questions'), weekTrades(revueMonday, revueBaseTrades()), 'week', coL('Pas de trade fermé cette semaine.', 'No closed trade this week.'));
}
// Le bilan et la revue se redessinent aussi depuis leurs propres boutons (jour / semaine précédents) : le coach suit.
(function () {
  const rb = renderBilan, rw = renderWeeklyReview;
  renderBilan = function () { const r = rb.apply(this, arguments); safeRun(renderCoachDay, 'renderCoachDay'); return r; };
  renderWeeklyReview = function () { const r = rw.apply(this, arguments); safeRun(renderCoachWeek, 'renderCoachWeek'); return r; };
})();
