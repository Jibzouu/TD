// ── JOURNAL DE SÉANCE (avant / après) ────────────────────────────────
// Une entrée par date, dans le Bilan : préparation (biais, état d'esprit, plan, vigilance) avant d'ouvrir les
// graphiques, puis bilan, respect du plan et leçon à retenir après la séance. Rangé sous JP+'daily'
// ({ 'AAAA-MM-JJ': { …champs, updatedAt } }), synchronisé jour par jour lors d'une fusion de backup.
const DAILY_KEY = () => JP + 'daily';
const DAILY_TEXT = { plan: 1500, focus: 200, recap: 2000, lesson: 500 };
const DAILY_CHOICES = {
  bias: [['haussier', '▲ Haussier', 'green'], ['neutre', '◆ Neutre', 'muted'], ['baissier', '▼ Baissier', 'red']],
  mood: [['1', '1 · fatigué'], ['2', '2'], ['3', '3 · correct'], ['4', '4'], ['5', '5 · au top']],
  discipline: [['oui', 'Oui', 'green'], ['partiel', 'En partie', 'amber'], ['non', 'Non', 'red']]
};
let DAILY_DATE = null;

function loadDaily() {
  const d = loadJSON(DAILY_KEY(), {});
  return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
}
function dailyEntry(date) { const e = loadDaily()[date]; return e && typeof e === 'object' ? e : {}; }
function dailyHasContent(e) { return !!e && ['bias', 'mood', 'plan', 'focus', 'recap', 'lesson', 'discipline'].some(k => e[k]); }
function saveDailyField(field, value) {
  if (!DAILY_DATE) return;
  const all = loadDaily(), e = all[DAILY_DATE] && typeof all[DAILY_DATE] === 'object' ? all[DAILY_DATE] : {};
  if (DAILY_TEXT[field]) value = String(value || '').slice(0, DAILY_TEXT[field]);
  else if (DAILY_CHOICES[field]) value = DAILY_CHOICES[field].some(c => c[0] === value) && e[field] !== value ? value : '';   // re-cliquer = effacer
  else return;
  e[field] = value; e.updatedAt = Date.now();
  if (dailyHasContent(e)) all[DAILY_DATE] = e; else delete all[DAILY_DATE];
  try { DB.setItem(DAILY_KEY(), JSON.stringify(all)); } catch (x) { reportStorageError(x); return; }
  const s = document.getElementById('dj-saved'); if (s) s.textContent = 'Enregistré ✓';
  if (DAILY_CHOICES[field]) renderDailyJournal(DAILY_DATE);
}
// Fusion de deux journaux de séance : pour chaque date, l'entrée modifiée le plus récemment gagne.
function mergeDailyValues(mine, theirs) {
  const out = Object.assign({}, mine);
  Object.entries(theirs || {}).forEach(([d, e]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !e || typeof e !== 'object') return;
    if (!out[d] || (+e.updatedAt || 0) > (+out[d].updatedAt || 0)) out[d] = e;
  });
  return out;
}

function renderDailyJournal(date) {
  const cont = document.getElementById('bilan-journal');
  if (!cont) return;
  DAILY_DATE = date || localDateStr();
  const e = dailyEntry(DAILY_DATE), today = DAILY_DATE === localDateStr();
  const seg = (field, label) => html`<div class="dj-field"><span class="dj-label">${label}</span><div class="dj-seg" role="group" aria-label="${label}">${DAILY_CHOICES[field].map(([v, l, tone]) =>
    html`<button type="button" class="dj-opt${raw(e[field] === v ? ' on' + (tone ? ' tone-' + tone : '') : '')}" aria-pressed="${raw(e[field] === v)}" onclick="saveDailyField('${raw(field)}', '${raw(v)}')">${l}</button>`)}</div></div>`;
  const area = (field, label, ph, rows) => html`<label class="dj-field"><span class="dj-label">${label}</span><textarea class="dj-text" id="dj-${raw(field)}" rows="${raw(rows)}" maxlength="${raw(DAILY_TEXT[field])}" placeholder="${ph}" oninput="saveDailyField('${raw(field)}', this.value)">${e[field] || ''}</textarea></label>`;
  mount(cont, html`<section class="panel dj mt-20">
    <div class="panel-hdr hdr-between"><span>Journal de séance — ${fmtDateFR(DAILY_DATE, true)}<small class="panel-sub">${today ? 'prépare ta journée avant d’ouvrir les graphiques, puis tire les leçons après' : 'ta préparation et ton bilan de cette journée'}</small></span><span class="dj-saved" id="dj-saved" aria-live="polite">${e.updatedAt ? 'Enregistré' : ''}</span></div>
    <div class="dj-cols">
      <div class="dj-col">
        <div class="dj-title">☀️ Avant la séance</div>
        ${seg('bias', 'Biais du jour')}
        ${seg('mood', 'État d’esprit')}
        ${area('plan', 'Plan et niveaux clés', 'Ex : DAX — range 18 420 / 18 560, j’attends un sweep du bas de range pour un long…', 4)}
        <label class="dj-field"><span class="dj-label">Point de vigilance</span><input class="dj-text" id="dj-focus" maxlength="200" placeholder="Ex : pas de trade avant 9h15, je respecte mon SL" value="${e.focus || ''}" oninput="saveDailyField('focus', this.value)"></label>
      </div>
      <div class="dj-col">
        <div class="dj-title">🌙 Après la séance</div>
        ${seg('discipline', 'Plan respecté ?')}
        ${area('recap', 'Bilan de la séance', 'Ce qui s’est passé, ce que tu as bien fait, ce qui t’a fait dévier…', 4)}
        ${area('lesson', 'Leçon à retenir', 'Une phrase que tu veux relire la semaine prochaine', 2)}
      </div>
    </div>
  </section>`);
}

// Revue hebdomadaire : leçons et respect du plan de la semaine.
function weekLessonsCard(mon) {
  const all = loadDaily(), days = [...Array(7)].map((_, i) => localDateStr(addDays(mon, i)));
  const rows = days.map(d => [d, all[d]]).filter(([, e]) => e && (e.lesson || e.discipline || e.recap));
  if (!rows.length) return '';
  const disc = { oui: ['Plan respecté', 'green'], partiel: ['En partie', 'amber'], non: ['Plan non respecté', 'red'] };
  return UI.card('Journal de séance', 'tes leçons et le respect du plan, jour par jour', UI.rows(rows.map(([d, e]) => html`
    <span class="dj-rv-day">${fmtDateFR(d)}</span>
    <span class="dj-rv-txt">${e.lesson || e.recap || '—'}</span>
    ${e.discipline ? html`<span class="chip tone-${raw(disc[e.discipline][1])}">${disc[e.discipline][0]}</span>` : html`<span></span>`}`)));
}
