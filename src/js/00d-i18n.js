// ── TRADUCTION ─────────────────────────────────────────
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
    "nav.replay": "Backtest replay",
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
    "nav.replay": "Backtest replay",
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
const LANGS = [['fr', 'Français'], ['en', 'English']];
const LANG = (() => { try { const v = DB.getItem('g_lang'); return I18N[v] ? v : 'fr'; } catch (e) { return 'fr'; } })();
// Formats d'affichage (nombres, dates) suivant la langue.
const UI_LOCALE = LANG === 'en' ? 'en-GB' : 'fr-FR';
function t(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key]) ?? I18N.fr[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return s;
}

// ── Traduction de l'interface affichée ──
// Le texte de l'application est écrit en français (HTML et JS). Dans une autre langue, chaque texte affiché est
// traduit à la volée : les nombres et les noms de jours / mois sont remplacés par des repères {0}, {1}…, la phrase
// obtenue est cherchée dans le dictionnaire (I18N_TEXT[langue], généré par tools/i18n-extract.mjs), puis les valeurs
// sont remises à leur place. Un texte absent du dictionnaire reste en français.
const I18N_DATE_WORDS = '(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun\\.|mar\\.|mer\\.|jeu\\.|ven\\.|sam\\.|dim\\.|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|janv\\.|févr\\.|avr\\.|juil\\.|sept\\.|oct\\.|nov\\.|déc\\.|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)';
const I18N_TOKEN = new RegExp('\\d+(?:[\\u00a0\\u202f ,.]\\d+)*|(?<![\\p{L}])' + I18N_DATE_WORDS + '(?![\\p{L}])', 'gu');
function i18nNormalize(text) {
  const vals = [];
  const key = text.replace(I18N_TOKEN, m => '{' + (vals.push(m) - 1) + '}');
  return { key, vals };
}
// Modèles génériques : « {s} » remplace un texte libre (nom d'actif, de setup, de compte…), lui-même traduit si possible.
let I18N_PATTERNS = null;
function i18nPatterns(dict) {
  if (I18N_PATTERNS) return I18N_PATTERNS;
  I18N_PATTERNS = Object.keys(dict).filter(k => /\{[stu]\}/.test(k)).map(k => {
    const groups = [];   // dans l'ordre : nom de texte libre ({s}) ou numéro de repère ({0}…)
    const src = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{([stu]|\d+)\\\}/g, (m, g) => { groups.push(g); return /\d/.test(g) ? '(\\{\\d+\\})' : '(.+?)'; });
    return { groups, re: new RegExp('^' + src + '$'), val: dict[k], fixed: k.replace(/\{(?:[stu]|\d+)\}/g, '').length };
  }).sort((a, b) => b.fixed - a.fixed);   // les modèles les plus précis d'abord
  return I18N_PATTERNS;
}
function trCore(t, dict) {
  if (dict[t] !== undefined) return dict[t];
  const { key, vals } = i18nNormalize(t);
  const fill = s => s.replace(/\{(\d+)\}/g, (x, i) => vals[i] ?? x);
  if (dict[key] !== undefined) return fill(dict[key]);
  for (const p of i18nPatterns(dict)) {
    const m = key.match(p.re);
    if (!m) continue;
    const parts = {};
    p.groups.forEach((g, gi) => {
      if (/\d/.test(g)) parts[g] = fill(m[gi + 1]);
      else { const inner = fill(m[gi + 1]); parts[g] = trCore(inner, dict) ?? inner; }
    });
    return p.val.replace(/\{([stu]|\d+)\}/g, (x, g) => parts[g] ?? x);
  }
  return null;
}
// Phrase composée (« A · B », « Libellé : valeur ») : chaque morceau est traduit séparément.
function trColon(t, dict) {
  const i = t.indexOf(' : ');
  if (i < 0) return null;
  const L = t.slice(0, i), R = t.slice(i + 3);
  const l = trCore(L, dict), r = R && /\p{L}/u.test(R) ? (trCore(R, dict) ?? trParts(R, dict)) : null;
  return l !== null || r !== null ? (l ?? L) + ': ' + (r ?? R) : null;
}
function trParts(t, dict) {
  for (const sep of [' · ', ' — ']) {
    if (!t.includes(sep)) continue;
    const parts = t.split(sep);
    const out = parts.map(p => (/\p{L}/u.test(p) ? (trCore(p, dict) ?? trColon(p, dict)) : null) ?? p);
    if (out.some((o, i) => o !== parts[i])) return out.join(sep);
  }
  return trColon(t, dict);
}
function tr(text) {
  if (LANG === 'fr' || !text) return text;
  const dict = I18N_TEXT[LANG];
  if (!dict) return text;
  const trimmed = text.trim().replace(/[ \t\r\n]+/g, ' ');
  if (!trimmed || !/\p{L}/u.test(trimmed)) return text;
  const out = trCore(trimmed, dict) ?? trParts(trimmed, dict);
  if (out === null) return text;
  const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
  return lead + out + trail;
}
const I18N_ATTRS = ['placeholder', 'title', 'aria-label', 'data-tip'];
function translateNode(root) {
  if (!root) return;
  if (root.nodeType === 3) { const v = tr(root.data); if (v !== root.data) root.data = v; return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) translateAttrs(root);
  if (root.nodeName === 'SCRIPT' || root.nodeName === 'STYLE') return;
  const w = (root.ownerDocument || root).createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) { const p = n.parentNode; if (p && (p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || p.nodeName === 'TEXTAREA')) continue; const v = tr(n.data); if (v !== n.data) n.data = v; }
    else translateAttrs(n);
  }
}
function translateAttrs(el) {
  for (const a of I18N_ATTRS) { const v = el.getAttribute(a); if (v) { const x = tr(v); if (x !== v) el.setAttribute(a, x); } }
  if (el.nodeName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && el.value) { const x = tr(el.value); if (x !== el.value) el.value = x; }
}
function applyI18n(root) {
  document.documentElement.lang = LANG;
  if (LANG === 'fr') return;
  (root || document).querySelectorAll('[data-i18n]').forEach(el => { const k = el.dataset.i18n; if (I18N[LANG][k]) el.textContent = I18N[LANG][k]; });
  translateNode(root || document.documentElement);
}
// Tout ce que l'application affiche ensuite (pages, fenêtres, messages) est traduit au moment où il apparaît.
(function startI18nObserver() {
  if (LANG === 'fr' || typeof MutationObserver !== 'function') return;
  applyI18n();
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') { const v = tr(m.target.data); if (v !== m.target.data) m.target.data = v; }
      else if (m.type === 'attributes') translateAttrs(m.target);
      else m.addedNodes.forEach(translateNode);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });
  // Boîtes de dialogue natives et graphiques (dessinés, donc hors du DOM).
  const P = window.prompt; window.prompt = (msg, def) => P.call(window, tr(String(msg ?? '')), def);
  const C = window.confirm; window.confirm = msg => C.call(window, tr(String(msg ?? '')));
})();
function translateChart(chart) {
  if (LANG === 'fr' || !chart) return;
  const d = chart.data || {};
  if (Array.isArray(d.labels)) d.labels = d.labels.map(l => typeof l === 'string' ? tr(l) : Array.isArray(l) ? l.map(x => typeof x === 'string' ? tr(x) : x) : l);
  (d.datasets || []).forEach(ds => { if (typeof ds.label === 'string') ds.label = tr(ds.label); });
  const sc = (chart.options && chart.options.scales) || {};
  Object.values(sc).forEach(s => { if (s && s.title && typeof s.title.text === 'string') s.title.text = tr(s.title.text); });
}
const I18N_CHART_PLUGIN = {
  id: 'i18n',
  beforeUpdate: chart => translateChart(chart),
  beforeTooltipDraw: (chart, args) => {
    const tt = args && args.tooltip; if (!tt || LANG === 'fr') return;
    if (Array.isArray(tt.title)) tt.title = tt.title.map(x => tr(String(x)));
    if (Array.isArray(tt.body)) tt.body.forEach(b => { b.lines = (b.lines || []).map(x => tr(String(x))); });
    if (Array.isArray(tt.footer)) tt.footer = tt.footer.map(x => tr(String(x)));
    if (Array.isArray(tt.afterBody)) tt.afterBody = tt.afterBody.map(x => tr(String(x)));
  }
};
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
  const note = document.getElementById('lang-note'); if (note) note.hidden = true;
}
onReady(renderLangSetting);
