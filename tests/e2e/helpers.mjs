// Outils communs aux tests de bout en bout (Playwright + node:test).
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const APP_URL = pathToFileURL(join(ROOT, 'dist', 'journal.html')).href;

let browser = null;
export async function getBrowser() {
  if (!browser) {
    // En local (conteneur) Chromium est préinstallé ; en CI, `npx playwright install chromium` le fournit.
    const opts = {};
    if (process.env.CHROMIUM_PATH) opts.executablePath = process.env.CHROMIUM_PATH;
    browser = await chromium.launch(opts);
  }
  return browser;
}
export async function closeBrowser() { if (browser) { await browser.close(); browser = null; } }

// Trade de test : valeurs par défaut réalistes, surchargeables.
export const T = o => Object.assign({ id: Math.floor(Math.random() * 1e12), asset: 'EUR/USD', dir: 'Long', res: 'TP', rr: 2, pnl: 2, pnlEur: 100, date: '2026-09-01', entry: '10:00', exit: '10:30', session: 'Londres', tf: 'M5' }, o);

// Ouvre le journal dans un contexte neuf. `seed` = clés écrites dans localStorage AVANT le premier chargement :
// le journal les migre dans IndexedDB au démarrage (c'est aussi ce qui teste la migration).
export async function openJournal({ journal = 'tj', seed = {}, time = null, viewport = { width: 1400, height: 900 } } = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext({ timezoneId: 'Europe/Paris', viewport });
  const page = await ctx.newPage();
  if (time) await page.clock.setFixedTime(time);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|illisible/.test(m.text())) errors.push(m.text()); });
  await page.route('https://fonts.googleapis.com/**', r => r.abort());
  await page.addInitScript(({ journal, seed }) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('journal_active', journal);
    Object.entries(seed).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)));
  }, { journal, seed });
  await page.goto(APP_URL);
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  await page.waitForTimeout(150);
  return { page, ctx, errors };
}
export const goto = (page, id) => page.evaluate(p => showPage(p, document.querySelector('.nav-item[data-page="' + p + '"]')), id);
