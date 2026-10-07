// ── MODE SIMPLE (débutant) ─────────────────────────────────────────────
// Un débutant voit d'abord l'essentiel : Dashboard, Journal, Gestion du risque et Guide (+ Export et Paramètres, pour
// ses sauvegardes et réglages). Les autres pages apparaissent au fil du parcours de progression (Gestion du risque) ;
// « Tout afficher » les montre toutes à tout moment. Réglage propre au compte (JP + 'simple' : '1' activé, '0' désactivé) ;
// proposé au premier lancement, désactivé par défaut pour un compte déjà utilisé.
const SM_BASE = ['dashboard', 'trades', 'risque', 'guide', 'export', 'parametres', 'propfirm'];
// Pages ajoutées à chaque étape du parcours (cumulées) ; « Personnalisé » et la dernière étape montrent tout.
const SM_UNLOCK = [
  ['calendrier', 'bilan', 'replay'],
  ['stats', 'revue', 'plan'],
  ['playbooks', 'scaling', 'watchlist']
];
const smL = (fr, en) => LANG === 'en' ? en : fr;
function simpleModeOn() { return DB.getItem(JP + 'simple') === '1'; }
function simpleModeStage() {
  const p = typeof rkProg === 'function' ? rkProg() : { stage: 0 };
  const s = typeof RK_STAGES !== 'undefined' && RK_STAGES[p.stage] && RK_STAGES[p.stage].custom ? 99 : p.stage;
  return s;
}
// Pages visibles dans le menu en mode simple, pour une étape donnée.
function simpleModePages(stage) {
  if (stage >= SM_UNLOCK.length) return null;   // tout est visible
  return SM_BASE.concat(...SM_UNLOCK.slice(0, stage + 1));
}
function applySimpleMode() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const on = simpleModeOn(), pages = on ? simpleModePages(simpleModeStage()) : null;
  nav.querySelectorAll('.nav-item[data-page]').forEach(b => b.classList.toggle('nav-simple-hidden', !!pages && !pages.includes(b.dataset.page)));
  // Un titre de groupe (Trading, Analyse…) disparaît quand tous ses onglets sont masqués.
  const kids = [...nav.children];
  kids.forEach((el, i) => {
    if (!el.classList.contains('nav-group')) return;
    let any = false;
    for (let j = i + 1; j < kids.length && !kids[j].classList.contains('nav-group'); j++) if (kids[j].classList.contains('nav-item') && !kids[j].classList.contains('nav-simple-hidden')) any = true;
    el.classList.toggle('nav-simple-hidden', !any);
  });
  document.body.classList.toggle('simple-mode', on);
  let foot = document.getElementById('nav-simple-foot');
  if (!foot) { foot = document.createElement('div'); foot.id = 'nav-simple-foot'; foot.className = 'nav-simple-foot'; nav.after(foot); }
  const hidden = nav.querySelectorAll('.nav-item.nav-simple-hidden').length;
  foot.hidden = !on;
  if (on) mount(foot, html`<span>🌱 ${smL('Mode simple', 'Simple mode')}${hidden ? html` · ${hidden} ${smL('page(s) à débloquer', 'page(s) to unlock')}` : ''}</span><button type="button" class="btn-ghost btn-xs2" onclick="setSimpleMode(false)">${smL('Tout afficher', 'Show all')}</button>`);
  const cb = document.getElementById('simple-mode-toggle');
  if (cb) cb.checked = on;
  // Mémoire des pages déjà visibles : on annonce seulement celles qui viennent d'être débloquées.
  if (on) {
    const vis = [...nav.querySelectorAll('.nav-item[data-page]:not(.nav-simple-hidden)')].map(b => b.dataset.page);
    const prev = loadJSON(JP + 'simple_seen', null);
    const fresh = Array.isArray(prev) ? vis.filter(p => !prev.includes(p)) : [];
    if (fresh.length) {
      const names = fresh.map(p => { const b = nav.querySelector('.nav-item[data-page="' + p + '"] .nav-label') || nav.querySelector('.nav-item[data-page="' + p + '"]'); return b ? b.textContent.trim() : p; });
      showToast('🔓 ' + smL('Nouvelles pages débloquées : ', 'New pages unlocked: ') + names.join(', '), 'success');
    }
    try { DB.setItem(JP + 'simple_seen', JSON.stringify(vis)); } catch (e) {}
  }
}
function setSimpleMode(on) {
  DB.setItem(JP + 'simple', on ? '1' : '0');
  if (on) DB.removeItem(JP + 'simple_seen');
  applySimpleMode();
  showToast(on ? smL('Mode simple activé : les autres pages arrivent avec ton parcours', 'Simple mode on: other pages come with your path') : smL('Toutes les pages sont affichées', 'All pages are shown'), 'success');
}
onReady(applySimpleMode);
