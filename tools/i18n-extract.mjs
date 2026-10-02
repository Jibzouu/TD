// Relève tous les textes français de l'interface pour le dictionnaire de traduction.
//   node tools/i18n-extract.mjs            → tools/i18n/strings-fr.json (+ liste des textes non traduits)
//   node tools/i18n-extract.mjs --check en → parcourt l'application en anglais : tools/i18n/leftover-en.json = textes restés en français
// 1) L'application est ouverte en français et parcourue (pages, onglets, fenêtres, messages, états vides, comptes
//    Live / PropFirm / vide) : chaque texte affiché, même un instant (toast), est enregistré.
// 2) Les textes écrits dans le code (chaînes JS contenant du français) sont ajoutés, pour les messages rares.
// Chaque texte est normalisé comme à l'affichage (nombres et noms de jours / mois → {0}, {1}…).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(join(ROOT, 'dist', 'journal.html')).href;
const OUT = join(ROOT, 'tools', 'i18n');
const CHECK = process.argv.includes('--check') ? process.argv[process.argv.indexOf('--check') + 1] : null;
mkdirSync(OUT, { recursive: true });

// Jeu de trades réaliste (même générateur que les captures visuelles).
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const tr = []; const d = new Date('2026-05-04T12:00:00Z');
const mist = ['Entrée trop tôt', 'Stop déplacé', 'Revenge trade', 'Sorti trop tôt'];
for (let i = 0; i < 90; i++) {
  if (i % 3 === 0) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 2); }
  const w = rnd() < .47, be = !w && rnd() < .1, e = be ? 0 : w ? 70 + rnd() * 160 : -(45 + rnd() * 30);
  const h = 8 + Math.floor(rnd() * 9), m = Math.floor(rnd() * 60), dir = rnd() < .5 ? 'Long' : 'Short', s = dir === 'Long' ? 1 : -1;
  const ep = 1.1 + rnd() * .02, sl = ep - s * .002, tp = ep + s * .004, xp = w ? ep + s * .002 * (1 + rnd()) : be ? ep : sl;
  tr.push({ id: i + 1, date: d.toISOString().slice(0, 10), asset: ['EUR/USD', 'NAS 100', 'XAU/USD', 'DAX 40', 'GBP/USD'][i % 5], dir, res: be ? 'BE' : w ? 'TP' : 'SL',
    pnl: +(e / 60).toFixed(2), rr: 2, pnlEur: +e.toFixed(2), entry: String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'), exit: String(h + 1).padStart(2, '0') + ':' + String(m).padStart(2, '0'),
    session: h < 12 ? 'Londres' : h < 16 ? 'Overlap LDN/NY' : 'New York', tf: ['M5', 'M15', 'H1'][i % 3], rSrc: 'manuel', size: +(0.1 + rnd() * .3).toFixed(2), emotion: 1 + Math.floor(rnd() * 5),
    checklist: rnd() < .6 ? [0, 1, 2, 3, 4, 5] : [0, 1, 3], mistakes: rnd() < .25 ? [mist[i % 4]] : [], mfe: +(rnd() * 150 + (w ? 60 : 0)).toFixed(1), mae: +(rnd() * 70 + (w ? 0 : 40)).toFixed(1),
    setup: ['Break & retest', 'OB + FVG', 'Sweep LQ'][i % 3], tags: i % 7 ? [] : ['news'], desc: 'Confluence HTF + niveau clé.', fees: i % 4 ? 3.5 : undefined,
    entryPrice: +ep.toFixed(5), slPrice: +sl.toFixed(5), tpPrice: +tp.toFixed(5), exitPrice: +xp.toFixed(5) });
}
tr.reverse();
// Journée « aujourd'hui » chargée : alertes de règles et de perte journalière.
const today = [1, 2, 3].map(i => ({ id: 500 + i, date: '2026-06-17', asset: 'DAX 40', dir: 'Long', res: i === 1 ? 'TP' : 'SL', pnl: i === 1 ? 2 : -1, pnlEur: i === 1 ? 120 : -60, entry: '10:0' + i, setup: 'OB + FVG', tf: 'M5', session: 'Londres' }));

const PAGES = ['dashboard', 'trades', 'stats:overview', 'stats:timing', 'stats:analyses', 'calendrier', 'calendrier:year', 'bilan', 'revue', 'scaling', 'plan', 'playbooks', 'watchlist', 'export', 'parametres', 'propfirm'];
const ACTIONS = [
  `openTradeDetail(trades[0].id)`, `closeTradeDetail()`,
  `openTradePanel(); document.querySelectorAll('#nt-panel details, #nt-panel .form-section').forEach(x => x.open = true)`, `closeTradePanel()`,
  `startEditTrade(trades[0].id)`, `cancelEdit && cancelEdit()`, `closeTradePanel()`,
  `openQuickAdd()`, `closeQuickAdd()`, `openShortcutsHelp()`, `closeShortcutsHelp()`,
  `openGlobalSearch(); const i = document.querySelector('#gs-input, #global-search-input, .gs-input'); if (i) { i.value = 'dax'; i.dispatchEvent(new Event('input')); }`, `closeGlobalSearch()`,
  `openGlobalSearch(); const i = document.querySelector('#gs-input, #global-search-input, .gs-input'); if (i) { i.value = 'zzzz'; i.dispatchEvent(new Event('input')); }`, `closeGlobalSearch()`,
  `deleteTrade(trades[0].id)`, `closeModal()`, `confirmReset()`, `closeModal()`,
  `openNewAccount()`, `closeModal()`, `openRenameAccount(JOURNAL_ID)`, `closeModal()`, `deleteAccount && deleteAccount(JOURNAL_ID)`, `closeModal()`,
  `toggleAccountMenu(true)`, `toggleAccountMenu(false)`,
  `openLightbox('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='); startAnnotation && startAnnotation()`, `closeLightbox()`,
  `toggleGroupByDay()`, `toggleGroupByDay()`, `toggleScalingTablePanel()`, `toggleFilterBar()`, `toggleFilterBar()`,
  `exportData()`, `exportTradesCSV()`, `runBackupNow && runBackupNow(false)`, `recompressStoredImages()`,
  `setRMode('strict')`, `setRMode('usable')`, `reportStorageError(new Error('x'))`,
  `window.__su = storageUsage; storageUsage = () => Object.assign(__su(), { pct: 95 }); renderStorageWarning(); storageUsage = () => Object.assign(__su(), { pct: 82 }); renderStorageWarning(); storageUsage = __su;`,
  `showToast('Fichier invalide ou corrompu', 'error')`,
  `PB_SELECTED = 'OB + FVG'; showPage('playbooks', null); addPlaybookRule()`,
  `showPage('bilan', null); selectBilanDate && selectBilanDate(trades[5].date)`,
  `revueStep(-1)`, `revueStep(-1)`, `revueThisWeek()`,
  `DB.removeItem(JP + 'welcome_dismissed'); showPage('dashboard', null); renderWelcomeCard()`,
  `openOnboarding()`, `obNext && obNext()`, `obNext && obNext()`, `obNext && obNext()`, `document.getElementById('onboard') && document.getElementById('onboard').remove()`,
  `loadDemoTrades()`, `renderDemoBanner()`, `clearDemoTrades()`, `closeModal()`,
  `const f = document.getElementById('f-setup'); f.value = 'OB + FVG'; renderSetupReminder()`,
  `checkExportReminder(); checkImportReminder()`, `renderDDBanner()`, `renderRuleAlerts()`, `renderScalingAlert()`,
  `downloadMentorReport()`,
];

const b = await chromium.launch();
const raw = new Set();
async function crawl(journal, data, extraSeed = {}) {
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, timezoneId: 'Europe/Paris', reducedMotion: 'reduce', acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('dialog', d => { raw.add(d.message()); d.dismiss().catch(() => {}); });
  await page.clock.setFixedTime(new Date('2026-06-17T14:00:00Z'));
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.addInitScript(({ data, journal, extraSeed }) => {
    window.__raw = new Set();
    const ATTRS = ['placeholder', 'title', 'aria-label', 'data-tip'];
    const grab = n => {
      if (!n) return;
      if (extraSeed.__lang && !document.documentElement.classList.contains('app-ready')) return;   // contrôle : seulement après traduction
      if (n.nodeType === 3) { const p = n.parentNode; if (p && /^(SCRIPT|STYLE)$/.test(p.nodeName)) return; if (n.data.trim()) window.__raw.add(n.data.trim()); return; }
      if (n.nodeType !== 1 && n.nodeType !== 9) return;
      const all = n.nodeType === 1 ? [n, ...n.querySelectorAll('*')] : [...n.querySelectorAll('*')];
      all.forEach(el => {
        ATTRS.forEach(a => { const v = el.getAttribute && el.getAttribute(a); if (v && v.trim()) window.__raw.add(v.trim()); });
        if (/^(SCRIPT|STYLE)$/.test(el.nodeName)) return;
        el.childNodes.forEach(c => { if (c.nodeType === 3 && c.data.trim()) window.__raw.add(c.data.trim()); });
      });
    };
    window.__grab = grab;
    new MutationObserver(list => setTimeout(() => list.forEach(m => {
      if (m.type === 'characterData') grab(m.target);
      else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); if (v && v.trim()) window.__raw.add(v.trim()); }
      else m.addedNodes.forEach(grab);
    }), 0)).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    if (sessionStorage.s) return; sessionStorage.s = 1; localStorage.clear();
    localStorage.setItem('journal_active', journal);
    if (data) localStorage.setItem(journal + '_trades', JSON.stringify(data));
    localStorage.setItem(journal + '_onboarded', '1');
    if (extraSeed.__lang) localStorage.setItem('g_lang', extraSeed.__lang);
    Object.entries(extraSeed).forEach(([k, v]) => { if (k !== '__lang') localStorage.setItem(k, v); });
  }, { data, journal, extraSeed });
  await page.goto(URL);
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  // Les graphiques (dessinés) : libellés et infobulles passent par Chart.js.
  await page.evaluate(() => { if (window.Chart) Chart.register({ id: 'i18nRec', beforeDraw(c) { (c.data.labels || []).forEach(l => typeof l === 'string' && window.__raw.add(l)); (c.data.datasets || []).forEach(ds => ds.label && window.__raw.add(ds.label)); }, beforeTooltipDraw(c, a) { const t = a.tooltip; (t.title || []).concat(...(t.body || []).map(x => x.lines), t.footer || []).forEach(x => x && window.__raw.add(String(x))); } }); });
  await page.evaluate(() => window.__grab(document));
  for (const p of PAGES) {
    const [id, sub] = p.split(':');
    await page.evaluate(([id, sub]) => { try { showPage(id, document.querySelector('.nav-item[data-page="' + id + '"]')); if (id === 'calendrier' && (sub === 'year') !== (calViewMode === 'year')) toggleCalView(); else if (sub) showStatsSubtab(sub); } catch (e) {} }, [id, sub]);
    await page.waitForTimeout(200);
    // Survol des graphiques pour faire apparaître les infobulles.
    for (const c of await page.locator('.page.active canvas').all()) { try { const bb = await c.boundingBox(); if (bb && bb.width > 20) { await page.mouse.move(bb.x + bb.width * .5, bb.y + bb.height * .5); await page.waitForTimeout(60); await page.mouse.move(bb.x + bb.width * .8, bb.y + bb.height * .4); await page.waitForTimeout(60); } } catch (e) {} }
  }
  for (const a of ACTIONS) { await page.evaluate(a).catch(() => {}); await page.waitForTimeout(120); }
  await page.evaluate(() => window.__grab(document));
  const got = await page.evaluate(() => [...window.__raw]);
  got.forEach(x => raw.add(x));
  await ctx.close();
}
const L = CHECK ? { __lang: CHECK } : {};
await crawl('tj', tr.concat(today), { tj_last_export: String(Date.parse('2026-04-01')), ...L });
await crawl('tj', [], { ...L });                          // compte vide : états vides
await crawl('pf', tr.slice(0, 40), { pf_pf_enabled: '1', ...L });   // Prop Firm
await crawl('bt', tr.slice(0, 10), { ...L });            // Backtest
await b.close();

// Normalisation identique à l'application (src/js/00d-i18n.js).
const DATE_WORDS = '(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|lun\\.|mar\\.|mer\\.|jeu\\.|ven\\.|sam\\.|dim\\.|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|janv\\.|févr\\.|avr\\.|juil\\.|sept\\.|oct\\.|nov\\.|déc\\.|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun|January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)';
const TOKEN = new RegExp('\\d+(?:[\\u00a0\\u202f ,.]\\d+)*|(?<![\\p{L}])' + DATE_WORDS + '(?![\\p{L}])', 'gu');
const norm = s => { let i = 0; return s.replace(new RegExp(TOKEN.source + '|\u0000', 'gu'), () => '{' + (i++) + '}'); };
if (CHECK) {
  const FR_WORDS = /[àâçéèêëîïôûùüœ]|\b(le|la|les|des|du|une|tes|ton|ta|ce|cette|pas|pour|avec|sur|dans|est|aucun|aucune|jour|jours|semaine|perte|règle|compte|fichier|trades? (?:du|de))\b/i;
  const left = [...raw].map(x => x.trim().replace(/[ \t\r\n]+/g, ' ')).filter(x => FR_WORDS.test(x) && x.length < 600);
  // Contrôle strict : tout texte affiché dont la forme normalisée est un texte français connu sans traduction.
  let frKeys = [], dict = {};
  try { frKeys = JSON.parse(readFileSync(join(OUT, 'strings-fr.json'), 'utf8')); dict = JSON.parse(readFileSync(join(OUT, CHECK + '.json'), 'utf8')); } catch (e) {}
  let ignore = [];
  try { ignore = JSON.parse(readFileSync(join(OUT, 'ignore.json'), 'utf8')); } catch (e) {}
  const frSet = new Set(frKeys.filter(k => !(k in dict) && !ignore.includes(k) && /\p{L}{3,}/u.test(k.replace(/\{\d+\}/g, ' '))));
  [...raw].forEach(x => { const t = x.trim().replace(/[ \t\r\n]+/g, ' '); if (frSet.has(norm(t))) left.push(t); });
  const uniq = [...new Set(left)].filter(x => !ignore.includes(norm(x))).sort();
  writeFileSync(join(OUT, 'leftover-' + CHECK + '.json'), JSON.stringify(uniq, null, 1));
  console.log(raw.size + ' textes affichés en ' + CHECK + ', ' + uniq.length + ' semblent encore en français → tools/i18n/leftover-' + CHECK + '.json');
  process.exit(0);
}
// Textes écrits dans le code : chaînes contenant du français (messages rarement affichés).
const FR_HINT = /[àâçéèêëîïôûùüÿœ]|\b(le|la|les|des|du|de|un|une|tes|ton|ta|ce|cette|pas|pour|avec|sur|dans|est|sont|aucun|aucune|trade|trades|jour|jours|semaine|perte|gain|règle|setup|compte|fichier)\b/i;
const JS = readdirSync(join(ROOT, 'src', 'js')).filter(f => f.endsWith('.js') && !f.startsWith('00d')).map(f => readFileSync(join(ROOT, 'src', 'js', f), 'utf8')).join('\n');
const lits = new Set();
// Lecture des chaînes du code (sans les commentaires) : '…', "…" et `…${expr}…` (l'expression devient un repère).
function jsStrings(src) {
  const out = []; let i = 0;
  const readTemplate = () => {   // i est juste après le ` ouvrant
    let text = '';
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { text += src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        i += 2; let depth = 1;
        while (i < src.length && depth) {
          const c = src[i];
          if (c === '`') { i++; readTemplate(); continue; }
          if (c === "'" || c === '"') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } i++; continue; }
          if (c === '{') depth++; else if (c === '}') depth--;
          i++;
        }
        text += '\u0000'; continue;
      }
      text += src[i++];
    }
    i++; out.push(text); return text;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; if (i < 2) break; continue; }
    if (c === "'" || c === '"') { const q = c; let t = ''; i++; while (i < src.length && src[i] !== q && src[i] !== '\n') { if (src[i] === '\\') { t += src[i + 1]; i += 2; continue; } t += src[i++]; } i++; out.push(t); continue; }
    if (c === '`') { i++; readTemplate(); continue; }
    i++;
  }
  return out;
}
for (const str of jsStrings(JS)) {
  // Morceaux de gabarit html`…` : on garde le texte hors balises ; une expression devient {n}.
  str.split(/<[^>]*>|^[^<]*>|<[^>]*$/).forEach(part => {
    part = part.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    if (part.replace(/\u0000/g, '').trim().length < 3 || !/\p{L}{2}/u.test(part) || !FR_HINT.test(part) || /^[\w.$#-]+$/.test(part) || /[{};=]|=>|\(\)|function\b/.test(part)) return;
    lits.add(part);
  });
}

const keys = new Set();
for (const s of [...raw, ...lits]) {
  const t = s.trim().replace(/[ \t\r\n]+/g, ' ');
  if (!t || !/\p{L}/u.test(t) || t.length > 600) continue;
  keys.add(norm(t));
}
const list = [...keys].sort((a, b) => a.localeCompare(b, 'fr'));
writeFileSync(join(OUT, 'strings-fr.json'), JSON.stringify(list, null, 1));
// Textes pas encore dans le dictionnaire anglais.
let en = {};
try { en = JSON.parse(readFileSync(join(OUT, 'en.json'), 'utf8')); } catch (e) {}
const missing = list.filter(k => !(k in en));
writeFileSync(join(OUT, 'missing-en.json'), JSON.stringify(missing, null, 1));
console.log(`${raw.size} textes affichés, ${lits.size} textes du code → ${list.length} clés, ${missing.length} sans traduction anglaise`);
