// ── TRADUCTION (préparation) ─────────────────────────────────────────
// Le français reste la langue source : il est écrit tel quel dans le HTML et sert de repli pour toute clé absente.
// Pour traduire un texte : 1) lui donner une clé — data-i18n="clé" (texte), data-i18n-placeholder, data-i18n-title
// dans le HTML, ou t('clé') dans le JS ; 2) ajouter la clé dans I18N.fr et dans chaque autre langue.
// Une langue incomplète reste utilisable : les clés manquantes s'affichent en français.
const I18N = {
  fr: {
    "nav.dashboard": "Dashboard",
    "nav.trades": "Journal des trades",
    "nav.stats": "Statistiques",
    "nav.calendrier": "Calendrier",
    "nav.bilan": "Bilan journalier",
    "nav.revue": "Revue hebdo",
    "nav.propfirm": "Prop Firm",
    "nav.scaling": "Scaling Account",
    "nav.plan": "Plan de trading",
    "nav.playbooks": "Playbooks",
    "nav.watchlist": "Watchlist",
    "nav.export": "Export / Import",
    "nav.parametres": "Paramètres",
    "page.stats.title": "Statistiques",
    "page.stats.sub": "Analyse détaillée de tes performances",
    "page.propfirm.title": "Prop Firm",
    "page.propfirm.sub": "Suivi de conformité pour challenges et comptes financés",
    "page.scaling.title": "Scaling Account",
    "page.scaling.sub": "Repère les bons moments pour augmenter ta taille de position selon la taille de ton compte",
    "page.playbooks.title": "Playbooks",
    "page.playbooks.sub": "Une fiche par setup : description, règles, exemples types et résultats réels",
    "page.plan.title": "Plan de trading",
    "page.plan.sub": "Règles, checklist et gestion du risque",
    "page.watchlist.title": "Watchlist",
    "page.watchlist.sub": "Ton biais du jour et tes niveaux clés, reliés à tes trades",
    "page.bilan.title": "Bilan journalier",
    "page.bilan.sub": "Ta journée de trading : préparation, chiffres, trades et leçons",
    "page.export.title": "Export / Import",
    "page.export.sub": "Sauvegarde et restauration de tes données",
    "page.parametres.title": "Paramètres",
    "page.parametres.sub": "Ton compte, puis l'apparence (commune aux trois journaux) — tout est sauvegardé localement",
    "nav.revue_long": "Revue hebdomadaire",
    "search.pages": "Pages",
    "settings.lang.title": "Langue",
    "settings.lang.sub": "langue de l'interface — commune aux trois journaux",
    "settings.lang.beta": "La traduction anglaise est en cours : seuls la navigation, les titres de pages et la recherche sont traduits pour l'instant."
  },
  en: {
    "nav.dashboard": "Dashboard",
    "nav.trades": "Trade log",
    "nav.stats": "Statistics",
    "nav.calendrier": "Calendar",
    "nav.bilan": "Daily recap",
    "nav.revue": "Weekly review",
    "nav.revue_long": "Weekly review",
    "nav.propfirm": "Prop Firm",
    "nav.scaling": "Account scaling",
    "nav.plan": "Trading plan",
    "nav.playbooks": "Playbooks",
    "nav.watchlist": "Watchlist",
    "nav.export": "Export / Import",
    "nav.parametres": "Settings",
    "page.stats.title": "Statistics",
    "page.stats.sub": "In-depth analysis of your performance",
    "page.propfirm.title": "Prop Firm",
    "page.propfirm.sub": "Compliance tracking for challenges and funded accounts",
    "page.scaling.title": "Account scaling",
    "page.scaling.sub": "Know when to increase your position size as your account grows",
    "page.playbooks.title": "Playbooks",
    "page.playbooks.sub": "One sheet per setup: description, rules, model examples and real results",
    "page.plan.title": "Trading plan",
    "page.plan.sub": "Rules, checklist and risk management",
    "page.watchlist.title": "Watchlist",
    "page.watchlist.sub": "Your daily bias and key levels, linked to your trades",
    "page.bilan.title": "Daily recap",
    "page.bilan.sub": "Your trading day: preparation, numbers, trades and lessons",
    "page.export.title": "Export / Import",
    "page.export.sub": "Back up and restore your data",
    "page.parametres.title": "Settings",
    "page.parametres.sub": "Your account, then appearance (shared by all journals) — everything is saved locally",
    "search.pages": "Pages",
    "settings.lang.title": "Language",
    "settings.lang.sub": "interface language — shared by all journals",
    "settings.lang.beta": "The English translation is in progress: only navigation, page titles and search are translated for now."
  }
};
const LANGS = [['fr', 'Français'], ['en', 'English (bêta)']];
const LANG = (() => { try { const v = DB.getItem('g_lang'); return I18N[v] ? v : 'fr'; } catch (e) { return 'fr'; } })();
function t(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key]) ?? I18N.fr[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}
function applyI18n(root) {
  document.documentElement.lang = LANG;
  if (LANG === 'fr') return;   // le HTML est déjà en français
  (root || document).querySelectorAll('[data-i18n]').forEach(el => { const k = el.dataset.i18n; if (I18N[LANG][k]) el.textContent = I18N[LANG][k]; });
  (root || document).querySelectorAll('[data-i18n-placeholder]').forEach(el => { const k = el.dataset.i18nPlaceholder; if (I18N[LANG][k]) el.placeholder = I18N[LANG][k]; });
  (root || document).querySelectorAll('[data-i18n-title]').forEach(el => { const k = el.dataset.i18nTitle; if (I18N[LANG][k]) el.title = I18N[LANG][k]; });
}
// Changer de langue recharge la page : tout le texte (y compris celui calculé au démarrage) repart dans la bonne langue.
function setLang(l) {
  if (!I18N[l] || l === LANG) return;
  DB.setItem('g_lang', l);
  Promise.resolve(DB.flush && DB.flush()).finally(() => location.reload());
}
function renderLangSetting() {
  const sel = document.getElementById('lang-select');
  if (!sel) return;
  mount(sel, html`${LANGS.map(([v, l]) => html`<option value="${v}"${raw(v === LANG ? ' selected' : '')}>${l}</option>`)}`);
  const note = document.getElementById('lang-note'); if (note) note.hidden = LANG === 'fr';
}
onReady(() => { applyI18n(); renderLangSetting(); });
