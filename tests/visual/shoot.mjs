// Captures de toutes les pages (données fixes, heure figée, animations coupées) pour la comparaison visuelle.
// Usage : node tests/visual/shoot.mjs <dossier-sortie>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const URL = pathToFileURL(process.env.JOURNAL_HTML || join(ROOT, 'dist', 'journal.html')).href;

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
    setup: ['Break & retest', 'OB + FVG', 'Sweep LQ'][i % 3], tags: i % 7 ? [] : ['news'], desc: 'Confluence HTF + niveau clé.', entryPrice: +ep.toFixed(5), slPrice: +sl.toFixed(5), tpPrice: +tp.toFixed(5), exitPrice: +xp.toFixed(5) });
}
tr.reverse();

const PAGES = ['dashboard', 'trades', 'stats:overview', 'stats:timing', 'stats:behavior', 'stats:advanced', 'stats:analyses', 'calendrier', 'bilan', 'revue', 'scaling', 'plan', 'watchlist', 'export', 'parametres'];
const b = await chromium.launch();
async function run(journal, pages, vp, tag, data = tr) {
  const ctx = await b.newContext({ viewport: vp, timezoneId: 'Europe/Paris', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.clock.setFixedTime(new Date('2026-06-17T14:00:00Z'));
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.addInitScript(({ tr, journal }) => {
    if (navigator.storage) navigator.storage.estimate = async () => ({ usage: 58000, quota: 1e9 });   // quota disque : varie d'une machine à l'autre
    let C; Object.defineProperty(window, 'Chart', { configurable: true, get: () => C, set: v => { C = v; v.defaults.animation = false; } });
    if (sessionStorage.s) return; sessionStorage.s = 1; localStorage.clear();
    localStorage.setItem('journal_active', journal);
    localStorage.setItem(journal + '_trades', JSON.stringify(tr)); localStorage.setItem(journal + '_welcome_dismissed', '1'); localStorage.setItem(journal + '_last_export', String(Date.parse('2026-06-16')));
  }, { tr: data, journal });
  await page.goto(URL);
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  for (const p of pages) {
    const [id, sub] = p.split(':');
    await page.evaluate(([id, sub]) => { showPage(id, document.querySelector('.nav-item[data-page="' + id + '"]')); if (sub) showStatsSubtab(sub); }, [id, sub]);
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `${tag}-${p.replace(':', '-')}.png`), fullPage: true });
  }
  if (errs.length) console.log(tag, 'ERREURS', errs);
  await ctx.close();
}
await run('tj', PAGES, { width: 1400, height: 900 }, 'desk');
await run('tj', PAGES, { width: 390, height: 844 }, 'mob');
await run('pf', ['propfirm', 'dashboard'], { width: 1400, height: 900 }, 'pf');
await run('tj', PAGES, { width: 1400, height: 900 }, 'vide', []);   // états vides
await b.close();
console.log('ok', OUT);
