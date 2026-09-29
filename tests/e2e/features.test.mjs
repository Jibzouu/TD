// Tests de bout en bout des fonctions v2 : revue hebdo, saisie rapide, raccourcis, analyses, fiche trade, PWA.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openJournal, closeBrowser, getBrowser, goto, T } from './helpers.mjs';

after(closeBrowser);
const NOW = new Date('2026-06-17T14:00:00Z');   // mercredi 17 juin 2026 (semaine ISO 25)

// 30 trades répartis sur 3 semaines, avec setups, prix et MAE/MFE.
function sampleTrades() {
  const out = [];
  for (let i = 0; i < 30; i++) {
    const day = new Date(Date.UTC(2026, 5, 1 + Math.floor(i * 16 / 30)));
    const win = i % 3 !== 0;
    out.push(T({ id: 1000 + i, date: day.toISOString().slice(0, 10), asset: ['EUR/USD', 'DAX 40'][i % 2], res: win ? 'TP' : 'SL',
      pnl: win ? 2 : -1, pnlEur: win ? 100 : -50, setup: ['Break & retest', 'OB + FVG'][i % 2], mae: win ? 10 : 50, mfe: win ? 120 : 20,
      entryPrice: 1.1, slPrice: 1.098, tpPrice: 1.104, exitPrice: win ? 1.104 : 1.098, mistakes: win ? [] : ['Entrée trop tôt'] }));
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

test('revue hebdomadaire : KPIs de la semaine, navigation, réponses enregistrées', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: sampleTrades() }, time: NOW });
  await goto(page, 'revue');
  const label = await page.locator('#revue-week-label').textContent();
  assert.match(label, /Semaine 25/);
  const kpis = await page.locator('#revue-content').textContent();
  assert.match(kpis, /Résultat de la semaine/);
  const expected = await page.evaluate(() => weekTrades(mondayOf(new Date())).length);
  assert.ok(expected > 0, 'la semaine contient des trades');
  assert.ok(await page.evaluate(() => !!revueDaysChartInst), 'graphique par jour rendu');
  await page.fill('#rv-rule', 'Pas de trade avant 9h30');
  await page.waitForTimeout(600);
  const saved = await page.evaluate(() => loadReviews()[localDateStr(revueMonday)]);
  assert.equal(saved.rule, 'Pas de trade avant 9h30');
  await page.evaluate(() => revueStep(-1));
  assert.match(await page.locator('#revue-week-label').textContent(), /Semaine 24/);
  assert.equal(await page.inputValue('#rv-rule'), '', 'les réponses sont propres à chaque semaine');
  await page.evaluate(() => revueThisWeek());
  assert.equal(await page.inputValue('#rv-rule'), 'Pas de trade avant 9h30');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('saisie rapide (touche N) : résultat déduit du P&L, trade enregistré', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1, asset: 'NAS 100' })] } });
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('n');
  await page.waitForSelector('#quick-add.open');
  assert.equal(await page.inputValue('#qa-asset'), 'NAS 100', 'dernier actif proposé');
  await page.fill('#qa-pnl', '-60');
  await page.fill('#qa-setup', 'Sweep LQ');
  await page.press('#qa-pnl', 'Enter');
  await page.waitForSelector('#quick-add:not(.open)', { state: 'attached' });
  const t = await page.evaluate(() => trades.find(x => x.id !== 1));
  assert.equal(t.res, 'SL');
  assert.equal(t.pnlEur, -60);
  assert.equal(t.setup, 'Sweep LQ');
  assert.equal(await page.evaluate(() => trades.length), 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('raccourcis : aide (?), navigation par chiffres, Échap, focus restauré', async () => {
  const { page, ctx } = await openJournal({ seed: { tj_trades: [T({ id: 1 })] } });
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('?');
  await page.waitForSelector('#shortcuts-help.open');
  assert.ok(await page.locator('#shortcuts-help kbd').count() >= 8);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#shortcuts-help:not(.open)', { state: 'attached' });
  await page.keyboard.press('2');
  const second = await page.evaluate(() => document.querySelectorAll('.nav > .nav-item')[1].dataset.page);
  assert.ok(await page.locator('#page-' + second).evaluate(el => el.classList.contains('active')));
  // Une touche tapée dans un champ ne déclenche jamais de raccourci.
  await goto(page, 'trades');
  await page.focus('#filter-search');
  await page.keyboard.press('n');
  assert.equal(await page.locator('#quick-add.open').count(), 0);
  await ctx.close();
});

test('analyses pro : Monte-Carlo déterministe, nuage MAE/MFE, R réalisé vs visé, équité par setup', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: sampleTrades() } });
  await goto(page, 'stats');
  await page.evaluate(() => showStatsSubtab('analyses'));
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => ({
    mc: !!mcChartInst && mcChartInst.data.datasets.length, mae: maeMfeChartInst && maeMfeChartInst.data.datasets.reduce((s, d) => s + d.data.length, 0),
    rvr: rvrChartInst && rvrChartInst.data.datasets[0].data.length, sm: document.querySelectorAll('#small-multiples canvas').length,
    stats: document.getElementById('mc-stats').textContent
  }));
  assert.ok(info.mc >= 3, 'bandes + médiane');
  assert.equal(info.mae, 30);
  assert.equal(info.rvr, 30);
  assert.equal(info.sm, 2);
  await page.evaluate(() => renderProAnalyses());
  assert.equal(await page.evaluate(() => document.getElementById('mc-stats').textContent), info.stats, 'même graine, même résultat');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('fiche trade : navigation ←/→ dans l’ordre du tableau, profil, note après coup', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: sampleTrades() } });
  await goto(page, 'trades');
  await page.locator('#tbody tr.trade-row').first().click();
  await page.waitForSelector('#trade-drawer-overlay.show');
  const firstId = await page.evaluate(() => drawerTradeId);
  assert.ok(await page.locator('.tp-profile .tp-mark').count() === 4, 'profil SL / entrée / sortie / TP');
  await page.keyboard.press('ArrowRight');
  const second = await page.evaluate(() => drawerTradeId);
  const rowOrder = await page.evaluate(() => drawerOrder.slice(0, 2));
  assert.deepEqual([firstId, second], rowOrder);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => drawerTradeId), firstId);
  await page.fill('#dw-review', 'Entrée correcte, sortie trop tôt');
  await page.locator('#dw-review').blur();
  assert.equal(await page.evaluate(id => trades.find(t => t.id === id).review, firstId), 'Entrée correcte, sortie trop tôt');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('application installable : manifeste, service worker, ouverture hors ligne', async () => {
  const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
  const server = createServer((req, res) => {
    const f = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'journal.html';
    try { const body = readFileSync(join(DIST, f.replace(/\.\./g, ''))); res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/journal.html`;
  const ctx = await (await getBrowser()).newContext();
  try {
    const page = await ctx.newPage();
    await page.route('https://fonts.googleapis.com/**', r => r.abort());
    await page.goto(url);
    await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
    assert.equal(await page.locator('link[rel=manifest]').count(), 1);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();   // la page est désormais contrôlée par le service worker
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const manifest = await (await page.request.get(url.replace('journal.html', 'manifest.webmanifest'))).json();
    assert.equal(manifest.display, 'standalone');
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
    assert.ok(await page.evaluate(() => typeof Chart !== 'undefined'), 'le journal complet s’ouvre sans connexion');
  } finally {
    await ctx.close();
    server.close();
  }
});

test('nettoyage unique des anciens R : fictifs effacés, R invraisemblable écarté, R manquant recalculé', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [
    T({ id: 1, res: 'TP', pnl: 2, rr: 2, rSrc: 'defaut', pnlEur: 120 }),
    T({ id: 2, res: 'TP', pnl: 58, rr: 58, rSrc: 'prix', pnlEur: 90, entryPrice: 1.1, slPrice: 1.0999, exitPrice: 1.1058 }),
    T({ id: 3, res: 'SL', pnl: null, rr: null, pnlEur: -50, entryPrice: 1.1, slPrice: 1.098, exitPrice: 1.098, dir: 'Long' }),
    T({ id: 4, res: 'TP', pnl: 1.5, rr: 1.5, rSrc: 'manuel', pnlEur: 75 }),
  ], tj_default_rr_win: '2', tj_default_risk_eur: '0' } });
  const r = await page.evaluate(() => Object.fromEntries(trades.map(t => [t.id, { pnl: t.pnl, sl: t.slPrice ?? null }])));
  assert.equal(r[1].pnl, null, 'R fictif effacé');
  assert.equal(r[2].pnl, null, 'R invraisemblable effacé');
  assert.equal(r[2].sl, null);
  assert.equal(r[3].pnl, -1, 'R exact recalculé depuis les prix');
  assert.equal(r[4].pnl, 1.5, 'R saisi conservé');
  assert.equal(await page.evaluate(() => trades.find(t => t.id === 1).pnlEur), 120, 'P&L € intact');
  assert.equal(await page.evaluate(() => DB.getItem(JP + 'default_rr_win')), null, 'ancien réglage supprimé');
  assert.equal(await page.locator('#default-risk-eur, #default-rr-win').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('page Export : réglages d’import repliés, ouverts si un réglage est actif ; analyses retirées', async () => {
  let { page, ctx } = await openJournal({ seed: { tj_trades: [T({ id: 1 })] } });
  await goto(page, 'export');
  assert.equal(await page.evaluate(() => document.getElementById('import-settings').open), false, 'replié par défaut');
  assert.equal(await page.locator('#tz-offset-hours').isVisible(), false);
  await page.click('#import-settings > summary');
  assert.ok(await page.locator('#tz-offset-hours').isVisible(), 'se déplie au clic');
  assert.equal(await page.locator('#sharpe-sortino-body, #coinflip-body, #whatif-body').count(), 0);
  await ctx.close();
  ({ page, ctx } = await openJournal({ seed: { tj_trades: [T({ id: 1 })], tj_tz_offset_hours: '2' } }));
  await goto(page, 'export');
  assert.equal(await page.evaluate(() => document.getElementById('import-settings').open), true, 'ouvert quand un décalage est réglé');
  await ctx.close();
});

test('dashboard v3 : barre Aujourd’hui, réglages dans Paramètres, sections, ancienne disposition migrée', async () => {
  const today = '2026-06-17';
  const { page, ctx, errors } = await openJournal({ time: NOW, seed: {
    tj_trades: [T({ id: 1, date: today, res: 'SL', pnl: -1, pnlEur: -80 }), T({ id: 2, date: today, res: 'TP', pnl: 0.1, pnlEur: 5 }), ...sampleTrades()],
    tj_dash_layout_v2: { order: ['radar', 'year-progress'], widths: { radar: 'w-third' }, sizes: {} },
  } });
  assert.equal(await page.locator('#dd-amount').textContent(), '-75 €');
  assert.match(await page.locator('#today-sub').textContent(), /2 trades · 1 G · 1 P/);
  assert.equal(await page.getAttribute('#dd-status-badge', 'class'), 'st-chip warn', '75 € sur 100 € : seuil d’alerte (75 %) atteint');
  assert.ok(await page.locator('#summary-banner .insight').count() >= 1, 'constats affichés');
  assert.equal(await page.locator('#page-dashboard #account-size, #page-dashboard #dd-limit-pct').count(), 0, 'réglages hors du Dashboard');
  assert.equal(await page.locator('#page-parametres #account-size').count(), 1);
  const order = await page.evaluate(() => [...document.querySelectorAll('#dash-grid > .dash-widget')].map(w => w.dataset.widget));
  assert.deepEqual(order.slice(0, 2), ['sec-perf', 'year-progress'], 'ancienne disposition : nouvel ordre par défaut');
  assert.ok(await page.locator('[data-widget="radar"]').evaluate(el => el.classList.contains('w-full')), 'ancienne largeur ignorée');
  await goto(page, 'parametres');
  await page.fill('#dd-limit-pct', '0.5');
  await goto(page, 'dashboard');
  assert.equal(await page.getAttribute('#dd-status-badge', 'class'), 'st-chip crit', 'limite abaissée à 50 € : dépassée');
  assert.deepEqual(errors, []);
  await ctx.close();
});
