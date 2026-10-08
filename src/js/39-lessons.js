// ── MINI-LEÇONS (2 minutes) ─────────────────────────────────────────────
// Une leçon courte s'affiche au bon moment (premier SL, première série de pertes, premier jour rouge…), une seule fois,
// dans un encadré en bas de l'écran. Toutes restent lisibles dans le Guide (« Mini-leçons »).
// Déjà vues : g_lessons_seen (commun aux comptes). g_lessons_off = '1' : plus aucune leçon automatique.
const lsL = (fr, en) => LANG === 'en' ? en : fr;
const LESSONS = [
  { id: 'r', icon: '📏', title: ['Le R : ton unité de mesure', 'R: your unit of measure'],
    body: [['1 R = ce que tu risques sur un trade (la distance entre ton entrée et ton stop). Un trade à +2 R a rapporté deux fois ton risque ; un SL vaut −1 R.', '1 R = what you risk on a trade (the distance from your entry to your stop). A +2 R trade earned twice your risk; a SL is −1 R.'],
      ['Compter en R plutôt qu’en euros permet de comparer tes trades même quand ta taille change, et de voir si ta méthode marche vraiment.', 'Counting in R rather than money lets you compare trades even when your size changes, and see whether your method really works.'],
      ['Avec un gain moyen de 2 R, gagner 1 trade sur 3 suffit déjà à être à l’équilibre.', 'With a 2 R average win, winning 1 trade out of 3 already breaks even.']],
    when: c => c.closed >= 3 },
  { id: 'first-sl', icon: '🛑', title: ['Perdre fait partie du métier', 'Losing is part of the job'],
    body: [['Ton premier stop loss est là : c’est normal. Même les meilleurs traders perdent 40 à 60 % de leurs trades.', 'Your first stop loss is here: that is normal. Even the best traders lose 40 to 60 % of their trades.'],
      ['Un SL n’est pas une erreur : c’est le coût prévu d’une idée qui n’a pas marché. L’erreur, c’est de ne pas en mettre, de le déplacer, ou de vouloir « se refaire » tout de suite.', 'A SL is not a mistake: it is the planned cost of an idea that did not work. The mistake is not using one, moving it, or trying to “win it back” right away.']],
    when: c => c.sl >= 1 },
  { id: 'no-stop', icon: '🪂', title: ['Jamais sans stop', 'Never without a stop'],
    body: [['Un de tes trades n’a ni stop ni RR noté. Sans stop, une seule mauvaise journée peut effacer des semaines de travail.', 'One of your trades has no stop and no RR logged. Without a stop, one bad day can wipe out weeks of work.'],
      ['Place ton stop AVANT d’entrer, là où ton idée est fausse, puis calcule ta taille à partir de lui (Plan de trading → calculateur).', 'Place your stop BEFORE entering, where your idea is wrong, then size your position from it (Trading plan → calculator).']],
    when: c => c.noStop >= 1 },
  { id: 'risk1', icon: '🎯', title: ['Pourquoi 1 % (ou moins) par trade', 'Why 1 % (or less) per trade'],
    body: [['À 1 % par trade, 10 pertes d’affilée coûtent environ 10 % du compte. À 5 %, elles en coûtent 40 %.', 'At 1 % per trade, 10 losses in a row cost about 10 % of the account. At 5 %, they cost 40 %.'],
      ['Et une série de 10 pertes arrive à tout le monde un jour. Un petit risque te laisse le temps d’apprendre ; regarde le simulateur de ruine dans Gestion du risque.', 'And a 10-loss streak happens to everyone someday. A small risk gives you time to learn; check the risk-of-ruin simulator in Risk management.']],
    when: c => c.closed >= 5 },
  { id: 'streak', icon: '😤', title: ['Après 2 pertes : la revanche guette', 'After 2 losses: revenge is lurking'],
    body: [['Deux pertes d’affilée aujourd’hui. C’est le moment où l’on veut « se refaire » : trade trop gros, trop tôt, hors plan.', 'Two losses in a row today. This is when you want to “win it back”: too big, too early, off-plan.'],
      ['La règle la plus rentable du trading : s’arrêter. Ferme la plateforme, note ce que tu ressens dans le bilan du jour, reviens demain.', 'The most profitable trading rule: stop. Close the platform, write how you feel in the daily review, come back tomorrow.']],
    when: c => c.streak2 },
  { id: 'red-day', icon: '🟥', title: ['Le jour rouge : savoir s’arrêter', 'The red day: knowing when to stop'],
    body: [['Ta perte max du jour a été atteinte. Ta limite existe pour les jours comme celui-ci : la respecter protège ton compte et ta tête.', 'Your daily max loss was hit. Your limit exists for days like this one: respecting it protects your account and your mind.'],
      ['Une journée perdante, c’est normal. Ce qui ruine les comptes, ce sont les journées où l’on refuse de s’arrêter.', 'A losing day is normal. What ruins accounts are the days you refuse to stop.']],
    when: c => c.dayLimitHit },
  { id: 'sample', icon: '🔬', title: ['Pourquoi attendre 100 trades', 'Why wait for 100 trades'],
    body: [['20 trades, c’est trop peu pour juger une stratégie : une bonne méthode peut perdre 8 fois sur 10 trades par simple hasard.', '20 trades is too few to judge a strategy: a good method can lose 8 out of 10 trades by pure chance.'],
      ['Garde la même méthode et le même risque jusqu’à 100 trades, puis regarde ton espérance en R dans les Statistiques.', 'Keep the same method and risk until 100 trades, then check your expectancy in R in the Statistics.']],
    when: c => c.closed >= 20 },
  { id: 'size', icon: '🧮', title: ['Calculer sa taille de position', 'Sizing your position'],
    body: [['Taille = montant risqué ÷ distance du stop. Exemple : 50 € de risque et un stop à 25 pips sur l’EUR/USD = 0,2 lot (10 € par pip et par lot).', 'Size = amount risked ÷ stop distance. Example: 50 risked and a 25-pip stop on EUR/USD = 0.2 lot (10 per pip per lot).'],
      ['Le calculateur du Plan de trading le fait pour toi. Ne choisis jamais ta taille « au feeling ».', 'The Trading plan calculator does it for you. Never pick your size “by feel”.']],
    when: c => c.closed >= 10 },
  { id: 'drawdown', icon: '📉', title: ['Le drawdown et le chemin du retour', 'Drawdown and the way back'],
    body: [['Ton compte est à plus de 5 % sous son plus haut. Une baisse se rattrape plus difficilement qu’elle ne se creuse : −10 % demande +11 %, −20 % demande +25 %, −50 % demande +100 %.', 'Your account is more than 5 % below its peak. A drop is harder to recover than to dig: −10 % needs +11 %, −20 % needs +25 %, −50 % needs +100 %.'],
      ['C’est pour ça que le journal réduit ton risque conseillé quand le compte baisse. Reviens à ta taille normale une fois remonté.', 'That is why the journal cuts your suggested risk when the account drops. Go back to normal size once you recover.']],
    when: c => c.dd >= 0.05 }
];
function lessonsSeen() { const s = loadJSON(GP + 'lessons_seen', []); return Array.isArray(s) ? s : []; }
function lessonContext() {
  const real = trades.filter(t => !t.demo), closed = real.filter(t => ['TP', 'SL', 'BE'].includes(t.res));
  const sorted = closed.slice().sort((a, b) => ((a.date || '') + (a.entry || '')).localeCompare((b.date || '') + (b.entry || '')));
  const today = localDateStr(), todays = sorted.filter(t => t.date === today);
  let streak2 = false;
  const byDay = {};
  sorted.forEach(t => { (byDay[t.date] = byDay[t.date] || []).push(t); });
  Object.values(byDay).forEach(d => { if (typeof rkLossStreak === 'function' ? d.some((_, i) => rkLossStreak(d.slice(0, i + 1)) >= 2) : false) streak2 = true; });
  const g = typeof rkGuard === 'function' && real.length ? rkGuard() : null;
  const dayLimitHit = !!(g && g.lim.day > 0 && todays.length && g.remainDay <= 0);
  return {
    closed: closed.length, sl: closed.filter(t => t.res === 'SL').length, streak2, dayLimitHit, dd: g ? g.dd : 0,
    noStop: real.filter(t => t.slPrice == null && t.rr == null && t.rSrc !== 'prix' && ['TP', 'SL', 'BE'].includes(t.res)).length
  };
}
function checkLessons() {
  if (DB.getItem(GP + 'lessons_off') === '1' || document.querySelector('.lesson-pop')) return;
  const seen = lessonsSeen(), c = lessonContext();
  const next = LESSONS.find(l => !seen.includes(l.id) && l.when(c));
  if (next) showLesson(next.id, true);
}
function showLesson(id, auto) {
  const l = LESSONS.find(x => x.id === id);
  if (!l) return;
  document.querySelectorAll('.lesson-pop').forEach(e => e.remove());
  if (auto) { const s = lessonsSeen(); if (!s.includes(id)) { s.push(id); DB.setItem(GP + 'lessons_seen', JSON.stringify(s)); } }
  const el = document.createElement('aside');
  el.className = 'lesson-pop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'false'); el.setAttribute('aria-labelledby', 'lp-title');
  lessonPrevFocus = document.activeElement;
  mount(el, html`<div class="lp-hdr"><span class="lp-ic" aria-hidden="true">${l.icon}</span><div><small>${lsL('Mini-leçon · 2 min', 'Mini-lesson · 2 min')}</small><b id="lp-title">${guideText(l.title)}</b></div><button type="button" class="lp-x" aria-label="${lsL('Fermer', 'Close')}" onclick="closeLesson()">×</button></div>
    ${l.body.map(p => html`<p>${guideText(p)}</p>`)}
    <div class="lp-act"><button type="button" class="btn-primary" onclick="closeLesson()">${lsL('Compris', 'Got it')}</button><button type="button" class="btn-ghost" onclick="closeLesson();showPage('guide', document.querySelector('.nav-item[data-page=guide]'));setTimeout(() => guideJump('gd-lessons-sec'), 50)">${lsL('Toutes les leçons', 'All lessons')}</button></div>`);
  document.body.appendChild(el);
  // Le focus va sur « Compris » (clavier, lecteur d'écran)… sauf si l'utilisateur est en train d'écrire dans un champ.
  const a = document.activeElement;
  if (!a || a === document.body || !a.matches('input, textarea, select, [contenteditable]')) el.querySelector('.btn-primary').focus();
}
let lessonPrevFocus = null;
function closeLesson() {
  const had = document.querySelector('.lesson-pop');
  document.querySelectorAll('.lesson-pop').forEach(e => e.remove());
  if (had && lessonPrevFocus && document.contains(lessonPrevFocus) && typeof lessonPrevFocus.focus === 'function') lessonPrevFocus.focus();
  lessonPrevFocus = null;
}
// Échap ferme la mini-leçon.
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.lesson-pop')) { e.stopPropagation(); closeLesson(); } }, true);
function setLessonsAuto(on) { DB.setItem(GP + 'lessons_off', on ? '0' : '1'); renderLessonsList(); }
// Guide → Mini-leçons : toutes les leçons, relisibles à tout moment.
function renderLessonsList() {
  const el = document.getElementById('lessons-list');
  if (!el) return;
  const seen = lessonsSeen(), off = DB.getItem(GP + 'lessons_off') === '1';
  mount(el, html`<label class="ob-check"><input type="checkbox" ${raw(off ? '' : 'checked')} onchange="setLessonsAuto(this.checked)"><span>${lsL('Afficher automatiquement une leçon au bon moment (une seule fois chacune)', 'Show a lesson automatically at the right time (each one only once)')}</span></label>
    <div class="gd-lessons">${LESSONS.map(l => html`<button type="button" class="gd-lesson${raw(seen.includes(l.id) ? ' seen' : '')}" onclick="${raw("showLesson('" + l.id + "')")}"><span aria-hidden="true">${l.icon}</span><b>${guideText(l.title)}</b><small>${seen.includes(l.id) ? lsL('déjà vue', 'seen') : lsL('pas encore vue', 'not seen yet')}</small></button>`)}</div>`);
}
(function () {
  const ra = renderAll;
  renderAll = function () { const r = ra.apply(this, arguments); safeRun(checkLessons, 'checkLessons'); return r; };
})();
onReady(() => setTimeout(() => safeRun(checkLessons, 'checkLessons'), 1500));
