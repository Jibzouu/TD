// ── COULEUR D'ACCENT : menthe LockIn ou violet ──────────────────────────
// Boutons, sélection, étapes… Par défaut le vert menthe de la marque (bien distinct du vert des gains, plus franc).
// « Violet » remet l'accent classique sur les 4 thèmes de base. Réglage commun aux comptes (g_accent_choice) ;
// un thème personnalisé (sans --preset-key) garde toujours son propre accent.
const ACCENT_VIOLET = { default: ['#5d6cf6', '#ffffff'], proclair: ['#4f5fe8', '#ffffff'], midnight: ['#7aa2ff', '#0a0d16'], contrast: ['#8c9bff', '#000000'] };
const acL = (fr, en) => LANG === 'en' ? en : fr;
function accentChoice() { return DB.getItem('g_accent_choice') === 'violet' ? 'violet' : 'mint'; }
function applyAccentChoice() {
  const key = loadThemeObj()['--preset-key'], root = document.documentElement.style;
  if (!ACCENT_VIOLET[key]) return;
  const [acc, on] = accentChoice() === 'violet' ? ACCENT_VIOLET[key] : [THEME_PRESETS[key].colors['--accent'], THEME_PRESETS[key].colors['--on-accent']];
  root.setProperty('--accent', acc); root.setProperty('--on-accent', on); root.setProperty('--logo-color', acc);
  root.setProperty('--accent-d', hexToRgba(acc, .13));
}
function setAccentChoice(v) {
  DB.setItem('g_accent_choice', v === 'violet' ? 'violet' : 'mint');
  applyAccentChoice(); renderAccentChoice();
  if (typeof renderAll === 'function') renderAll();
}
function renderAccentChoice() {
  const el = document.getElementById('accent-choice');
  if (!el) return;
  const key = loadThemeObj()['--preset-key'], cur = accentChoice();
  if (!ACCENT_VIOLET[key]) { mount(el, ''); return; }
  const b = (v, label, color) => html`<button type="button" class="${raw('ac-btn' + (cur === v ? ' on' : ''))}" aria-pressed="${cur === v ? 'true' : 'false'}" onclick="${raw("setAccentChoice('" + v + "')")}"><i style="${raw('background:' + color)}"></i>${label}</button>`;
  mount(el, html`<span>${acL('Couleur des boutons :', 'Button color:')}</span>${b('mint', acL('Menthe LockIn', 'LockIn mint'), THEME_PRESETS[key].colors['--accent'])}${b('violet', acL('Violet', 'Violet'), ACCENT_VIOLET[key][0])}`);
}
// Le choix suit chaque changement de thème (thème de base appliqué, thème restauré).
(function () {
  const ap = applyPreset, as = applySavedTheme;
  applyPreset = function () { const r = ap.apply(this, arguments); applyAccentChoice(); renderAccentChoice(); return r; };
  applySavedTheme = function () { const r = as.apply(this, arguments); applyAccentChoice(); return r; };
})();
onReady(() => { applyAccentChoice(); renderAccentChoice(); });
