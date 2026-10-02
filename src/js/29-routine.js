// ── ROUTINE DU JOUR (Dashboard) ──────────────────────────────────────
// Les étapes d'une journée de trading, cochées toutes seules à partir de ce que tu as déjà fait :
// préparer la séance → noter ses trades → faire le bilan (→ revue de la semaine le week-end).
// Chaque étape mène directement au bon endroit. Masquable pour la journée.
function routineSteps() {
  const today = localDateStr(), now = new Date(), dow = now.getDay();
  const day = (typeof loadDaily === 'function' ? loadDaily()[today] : null) || {};
  const todays = trades.filter(t => t.date === today && !t.demo);
  const steps = [];
  steps.push({ id: 'prep', icon: '☀️', label: 'Préparer ta séance', hint: 'biais, plan, point de vigilance — 2 minutes',
    done: !!(day.bias || day.plan || day.focus || day.mood), action: 'Préparer', go: 'goRoutineBilan()' });
  if (todays.length) {
    const bare = todays.filter(t => !(t.desc || t.review || (t.imgs && t.imgs.length)));
    steps.push({ id: 'notes', icon: '✍️', label: todays.length > 1 ? 'Noter tes ' + todays.length + ' trades du jour' : 'Noter ton trade du jour',
      hint: bare.length ? (bare.length > 1 ? bare.length + ' trades sans note ni capture' : '1 trade sans note ni capture') : 'notes et captures ajoutées',
      done: !bare.length, action: 'Compléter', go: bare.length ? 'openTradeDetail(' + bare[0].id + ')' : '' });
  }
  if (todays.length || now.getHours() >= 17) {
    steps.push({ id: 'recap', icon: '🌙', label: 'Faire le bilan de ta séance', hint: 'ce qui s’est passé et la leçon à retenir',
      done: !!(day.recap || day.lesson || day.discipline), action: 'Faire le bilan', go: 'goRoutineBilan()' });
  }
  if (dow === 0 || dow === 5 || dow === 6) {
    const mon = mondayOf(now), key = localDateStr(mon), rev = (typeof loadReviews === 'function' ? loadReviews()[key] : null) || {};
    const answered = Object.keys(rev).some(k => k !== 'updatedAt' && String(rev[k] || '').trim());
    steps.push({ id: 'review', icon: '🗒️', label: 'Faire ta revue de la semaine', hint: 'meilleurs et pires trades, erreurs, objectif de la semaine prochaine',
      done: answered, action: 'Ouvrir la revue', go: "revueThisWeek(); showPage('revue', document.querySelector('.nav-item[data-page=revue]'))" });
  }
  return steps;
}
function goRoutineBilan() {
  showPage('bilan', document.querySelector('.nav-item[data-page=bilan]'));
  const sel = document.getElementById('bilan-date-select');
  if (sel && sel.value !== localDateStr()) { sel.value = localDateStr(); renderBilan(); }
  const j = document.getElementById('bilan-journal'); if (j) j.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderRoutine() {
  const el = document.getElementById('routine');
  if (!el) return;
  const hidden = DB.getItem(JP + 'routine_hidden') === localDateStr();
  if (!trades.length || hidden) { el.hidden = true; return; }
  const steps = routineSteps(), done = steps.filter(s => s.done).length, all = done === steps.length;
  el.hidden = false;
  mount(el, html`
    <div class="rt-head">
      <div><div class="rt-title">${all ? 'Routine du jour terminée ✓' : 'Ta routine du jour'}</div>
        <div class="rt-sub">${all ? 'Tout est à jour — bonne continuation.' : 'Les étapes se cochent toutes seules quand elles sont faites.'}</div></div>
      <div class="rt-progress" aria-label="${raw(done + ' étapes sur ' + steps.length)}"><span class="rt-count">${done}/${steps.length}</span>
        <span class="rt-bar"><span style="${raw('width:' + Math.round(done / steps.length * 100) + '%')}"></span></span></div>
      <button class="rt-hide" onclick="hideRoutineToday()" title="Masquer jusqu'à demain" aria-label="Masquer jusqu'à demain">×</button>
    </div>
    <ol class="rt-steps">${steps.map(s => html`<li class="rt-step${raw(s.done ? ' done' : '')}">
      <span class="rt-check" aria-hidden="true">${s.done ? '✓' : s.icon}</span>
      <span class="rt-text"><span class="rt-label">${s.label}</span><span class="rt-hint">${s.hint}</span></span>
      ${!s.done && s.go ? html`<button class="btn-ghost rt-go" onclick="${raw(s.go)}">${s.action} →</button>` : ''}
    </li>`)}</ol>`);
}
function hideRoutineToday() {
  DB.setItem(JP + 'routine_hidden', localDateStr());
  renderRoutine();
  showToast('Routine masquée jusqu’à demain');
}

// ── Sections du Dashboard repliables (Performance, Où je gagne, Comment je trade) ──
// Un clic sur le titre replie / déplie les blocs qui le suivent ; l'état est mémorisé par compte.
function dashCollapsed() { const v = loadJSON(JP + 'dash_collapsed', []); return Array.isArray(v) ? v : []; }
function applyDashSections() {
  const closed = new Set(dashCollapsed());
  let current = null;
  document.querySelectorAll('#page-dashboard .dash-widget').forEach(w => {
    if (w.classList.contains('dash-section')) {
      current = w.dataset.widget;
      const open = !closed.has(current);
      w.classList.toggle('sec-closed', !open);
      const h = w.querySelector('.dash-sec-title');
      if (h && !h.querySelector('.sec-toggle')) {
        h.insertAdjacentHTML('afterbegin', '<span class="sec-toggle" aria-hidden="true"></span>');
        h.setAttribute('role', 'button'); h.tabIndex = 0;
        h.addEventListener('click', () => toggleDashSection(w.dataset.widget));
        h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDashSection(w.dataset.widget); } });
      }
      if (h) h.setAttribute('aria-expanded', String(open));
      return;
    }
    w.classList.toggle('sec-hidden', !!current && closed.has(current));
  });
}
function toggleDashSection(id) {
  const list = new Set(dashCollapsed());
  if (list.has(id)) list.delete(id); else list.add(id);
  try { DB.setItem(JP + 'dash_collapsed', JSON.stringify([...list])); } catch (e) {}
  applyDashSections();
  window.dispatchEvent(new Event('resize'));   // les graphiques qui réapparaissent reprennent leur taille
}
onReady(applyDashSections);

// Raccourcis des en-têtes de page.
function goMentorReport() {
  showPage('export', document.querySelector('.nav-item[data-page=export]'));
  const c = document.getElementById('mentor-period'); if (c) c.closest('.export-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function goToSetups() {
  showPage('plan', document.querySelector('.nav-item[data-page=plan]'));
  const c = document.getElementById('setups-editor'); if (c) c.closest('.plan-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
