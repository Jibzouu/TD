// ── EFFETS VISUELS (tous les thèmes) ────────────────────────────────────
// Ouverture animée (cadenas qui se ferme, bulle qui glisse au centre), chiffres du Dashboard qui défilent,
// célébration « Locked in ✓ » d'une journée dans les règles. Le style est dans 70-premium.css (section EFFETS) et
// suit les couleurs du thème. Tout est coupé par le réglage « Animations » ou par « réduire les animations » (fxMotion).
const fxL = (fr, en) => LANG === 'en' ? en : fr;
function fxSyncClasses() { document.documentElement.classList.toggle('fx-motion', fxMotion()); }
function setFx(on) {
  DB.setItem('g_fx_off', on ? '0' : '1');
  fxSyncClasses();
  showToast(on ? fxL('Animations activées ✓', 'Animations on ✓') : fxL('Animations coupées', 'Animations off'), 'success');
}

// 1) Ouverture : par-dessus la page (sans bloquer les clics), retirée après 1,4 s.
function fxSplash() {
  if (!fxMotion() || document.getElementById('fx-splash')) return;
  const el = document.createElement('div');
  el.id = 'fx-splash';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<svg viewBox="0 0 420 108"><path class="fx-shackle" d="' + BRAND_SHACKLE_PATH + '" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>'
    + '<rect x="6" y="52" width="92" height="34" rx="17" fill="none" stroke="currentColor" stroke-width="9"/><circle class="fx-bubble" cx="52" cy="69" r="9.5" fill="' + BRAND_ACC + '"/>'
    + '<g class="fx-word" transform="translate(118 0)"><path d="' + BRAND_WORD_PATH + '" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="226" cy="20" r="9" fill="' + BRAND_ACC + '"/></g></svg>';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

// 2) Chiffres qui défilent (0 → valeur) : garde le texte exact à la fin ; s'arrête si la page réécrit le chiffre entre-temps.
function fxCountUp(el, ms) {
  if (!el || !fxMotion()) return;
  const final = el.textContent, m = /([+\-−]?)(\d{1,3}(?:[\s  ]\d{3})+|\d+)(?:,(\d+))?/.exec(final);
  if (!m) return;
  const sep = (m[2].match(/[\s  ]/) || [' '])[0], dec = m[3] ? m[3].length : 0;
  const target = parseFloat(m[2].replace(/[\s  ]/g, '') + (dec ? '.' + m[3] : ''));
  if (!(target > 0)) return;
  const pre = final.slice(0, m.index) + m[1], post = final.slice(m.index + m[0].length);
  const fmt = v => { const [i, f] = v.toFixed(dec).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, sep) + (dec ? ',' + f : ''); };
  const t0 = performance.now(); let last = null;
  const step = now => {
    if (last !== null && el.textContent !== last) return;          // la page a redessiné ce chiffre : on la laisse faire
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    last = k < 1 ? pre + fmt(target * e) + post : final;
    el.textContent = last;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function fxIntroNumbers() {
  ['k-balance', 'k-pnleur'].forEach(id => fxCountUp(document.getElementById(id), 1100));
  document.querySelectorAll('#page-dashboard .kpi-val, #page-dashboard .gc-chip b').forEach(el => fxCountUp(el, 900));
}

// 3) Célébration « Locked in ✓ » : une fois par jour et par compte, quand la journée est propre (règles du
// garde-fou respectées) et terminée — objectif du jour (TP max) atteint, ou bilan d'après séance « plan respecté : oui ».
function fxCelebrate(title, sub) {
  if (!fxMotion()) { showToast('🔒 ' + title + (sub ? ' — ' + sub : ''), 'success'); return; }
  const box = document.createElement('div');
  box.className = 'fx-party';
  box.setAttribute('role', 'status');
  const bubbles = Array.from({ length: 26 }, () => {
    const s = 6 + Math.random() * 16;
    return '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;width:' + s.toFixed(0) + 'px;height:' + s.toFixed(0) + 'px;--d:' + (1.6 + Math.random() * 1.4).toFixed(2) + 's;--w:' + (Math.random() * .6).toFixed(2) + 's;--x:' + ((Math.random() - .5) * 120).toFixed(0) + 'px"></i>';
  }).join('');
  box.innerHTML = bubbles;
  const card = document.createElement('div');
  card.className = 'fx-party-card';
  mount(card, html`<b>🔒 ${title.replace(' ✓', '')} <span>✓</span></b>${sub ? html`<small>${sub}</small>` : ''}`);
  box.appendChild(card);
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3300);
}
function fxCheckLockedIn(trigger) {
  try {
    const today = localDateStr(), key = JP + 'fx_lockedin';
    if (DB.getItem(key) === today || typeof rkDiscipline !== 'function') return false;
    const todays = trades.filter(t => t.date === today && ['TP', 'SL', 'BE'].includes(t.res));
    if (!todays.length) return false;
    const d = rkDiscipline(trades), day = d.days.find(x => x.date === today);
    if (!day || !day.clean) return false;
    const maxTP = planData && planData.maxTP > 0 ? planData.maxTP : 0;
    const done = trigger === 'journal' || (maxTP && todays.filter(t => t.res === 'TP').length >= maxTP);
    if (!done) return false;
    DB.setItem(key, today);
    fxCelebrate(fxL('Locked in ✓', 'Locked in ✓'), d.streak >= 2
      ? d.streak + fxL(' journées dans les règles d’affilée. Continue comme ça.', ' rule-abiding days in a row. Keep it up.')
      : fxL('Journée dans les règles. C’est comme ça qu’on dure.', 'A day within your rules. That is how you last.'));
    return true;
  } catch (e) { return false; }
}
(function () {
  const add = TradeStore.add;
  TradeStore.add = function () { const r = add.apply(this, arguments); setTimeout(() => fxCheckLockedIn('trade'), 400); return r; };
  const sdf = saveDailyField;
  saveDailyField = function (field, value) {
    const r = sdf.apply(this, arguments);
    if (field === 'discipline' && DAILY_DATE === localDateStr() && dailyEntry(DAILY_DATE).discipline === 'oui') fxCheckLockedIn('journal');
    return r;
  };
})();

// Au démarrage : classes d'animation, ouverture, chiffres. « fx-intro » (3 s) anime aussi la bulle du garde-fou.
fxSyncClasses();
if (fxMotion()) document.documentElement.classList.add('fx-intro');
fxSplash();
onReady(() => {
  document.querySelectorAll('[data-fx-art]').forEach(el => { el.innerHTML = fxEmptyArt(el.dataset.fxArt); });
  if (fxMotion()) setTimeout(fxIntroNumbers, 450);
  setTimeout(() => document.documentElement.classList.remove('fx-intro'), 3000);
});
if (window.matchMedia) window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', fxSyncClasses);
