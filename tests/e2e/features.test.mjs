// Tests de bout en bout des fonctions v2 : revue hebdo, saisie rapide, raccourcis, analyses, fiche trade, PWA.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
  const server = createServer((req, res) => {
    const f = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
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
    // Icônes PNG pour Android / Windows (dont « maskable ») et icône Apple.
    for (const ic of manifest.icons.filter(i => i.type === 'image/png')) {
      const r = await page.request.get(url.replace('journal.html', ic.src));
      assert.equal(r.status(), 200, ic.src); assert.equal(r.headers()['content-type'], 'image/png');
    }
    assert.ok(manifest.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512'));
    assert.equal(await page.locator('link[rel=apple-touch-icon]').count(), 1);
    // L'adresse du site ouvre directement le journal.
    const root = await ctx.newPage();
    await root.goto(url.replace('journal.html', ''));
    await root.waitForURL(/journal\.html$/);
    await root.close();
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
    tj_trades: [T({ id: 1, date: today, res: 'SL', pnl: -1, pnlEur: -100 }), T({ id: 2, date: today, res: 'TP', pnl: 0.1, pnlEur: 5 }), ...sampleTrades()],
    tj_dash_layout_v2: { order: ['radar', 'year-progress'], widths: { radar: 'w-third' }, sizes: {} },
  } });
  assert.equal(await page.locator('#dd-amount').textContent(), '-95 €');
  // Limite = 1 % du solde en début de journée : 10 000 € + 1 500 € gagnés les jours précédents.
  assert.match(await page.locator('#dd-limit-label').textContent(), /limite 115\s€/);
  assert.match(await page.locator('#today-sub').textContent(), /2 trades · 1 G · 1 P/);
  assert.equal(await page.getAttribute('#dd-status-badge', 'class'), 'st-chip warn', '95 € sur 115 € : seuil d’alerte (75 %) atteint');
  assert.ok(await page.locator('#summary-banner .insight').count() >= 1, 'constats affichés');
  assert.equal(await page.locator('#page-dashboard #account-size, #page-dashboard #dd-limit-pct').count(), 0, 'réglages hors du Dashboard');
  assert.equal(await page.locator('#page-parametres #account-size').count(), 1);
  const order = await page.evaluate(() => [...document.querySelectorAll('#dash-grid > .dash-widget')].map(w => w.dataset.widget));
  assert.deepEqual(order.slice(0, 2), ['sec-perf', 'year-progress'], 'ancienne disposition : nouvel ordre par défaut');
  assert.ok(await page.locator('[data-widget="radar"]').evaluate(el => el.classList.contains('w-full')), 'ancienne largeur ignorée');
  await goto(page, 'parametres');
  await page.fill('#dd-limit-pct', '0.5');
  await goto(page, 'dashboard');
  assert.equal(await page.getAttribute('#dd-status-badge', 'class'), 'st-chip crit', 'limite abaissée à 0,5 % (57,50 €) : dépassée');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('constat « meilleur jour » : pertes soustraites, cumul de tous les mardis explicite', async () => {
  const mk = (id, date, res, pnl) => T({ id, date, res, pnl, rr: Math.abs(pnl), pnlEur: pnl * 50, rSrc: 'prix' });
  const { page, ctx } = await openJournal({ seed: { tj_trades: [
    mk(1, '2026-06-16', 'TP', 5.09), mk(2, '2026-06-16', 'SL', -1), mk(3, '2026-06-16', 'SL', -1),   // mardi : +3,09R
    mk(4, '2026-06-09', 'TP', 4), mk(5, '2026-06-09', 'SL', -1),                                         // mardi : +3R
    mk(6, '2026-06-15', 'TP', 2), mk(7, '2026-06-12', 'SL', -1),
  ] } });
  const chip = page.locator('#summary-banner .insight', { hasText: 'Meilleur jour' });
  const text = await chip.innerText();
  assert.match(text, /mardi/);
  assert.match(text, /\+6,1R/, 'somme signée des deux mardis (5,09 − 1 − 1 + 4 − 1), pas la somme des RR (12,09)');
  assert.match(text, /cumul de 2 mardis/);
  assert.match(await chip.getAttribute('title'), /\+9,1R de gains −3,0R de pertes = \+6,1R · 5 trades/);
  await ctx.close();
});

test('donuts du Dashboard : trades, journées et semaines gagnants, filtre global appliqué', async () => {
  const mk = (id, date, res, eur) => T({ id, date, res, pnl: res === 'TP' ? 2 : res === 'SL' ? -1 : 0, pnlEur: eur });
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [
    mk(1, '2026-06-15', 'TP', 100), mk(2, '2026-06-15', 'SL', -50),          // lundi : +50  (semaine 25)
    mk(3, '2026-06-16', 'SL', -60), mk(4, '2026-06-16', 'BE', 0),            // mardi : -60  (semaine 25 → net -10)
    mk(5, '2026-06-09', 'TP', 80),                                            // semaine 24 : +80
  ] } });
  const txt = id => page.locator(id).textContent();
  assert.equal(await txt('#dn-trades-pct'), '50 %', '2 gagnants sur 4 trades gagnants ou perdants (le BE ne compte pas)');
  assert.equal(await txt('#dn-days-pct'), '67 %', '2 journées gagnantes sur 3');
  assert.equal(await txt('#dn-weeks-pct'), '50 %', 'semaine 24 gagnante, semaine 25 perdante');
  assert.match(await page.locator('#dn-trades-legend').innerText(), /Break-even\s+1/);
  assert.ok(await page.evaluate(() => Object.keys(donutInsts).length === 3), '3 graphiques dessinés');
  await page.selectOption('#gf-asset', 'EUR/USD');
  assert.equal(await txt('#dn-trades-pct'), '50 %');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mini-courbes des cartes : couleur selon la tendance, seuil nommé, badge assorti', async () => {
  // 20 pertes puis 12 gains : tout monte sur les derniers trades.
  const trades = [];
  for (let i = 0; i < 32; i++) {
    const win = i >= 20, d = new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10);
    trades.push(T({ id: 3000 + i, date: d, res: win ? 'TP' : 'SL', pnl: win ? 2 : -1, pnlEur: win ? 100 : -50 }));
  }
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: trades } });
  for (const k of ['wr', 'pnl']) {
    assert.equal(await page.locator(`#k-${k}-spark .sp-end`).getAttribute('class'), 'sp-end fill-green', k + ' : point final vert');
    assert.match(await page.locator(`#k-${k}-trend`).getAttribute('class'), /\bup\b/, k + ' : badge ▲ assorti');
  }
  assert.equal(await page.locator('#k-pnl-spark .sp-ref-lbl').textContent(), '0R');
  assert.equal(await page.locator('#k-rr-spark .sp-ref-lbl').textContent(), '1,0');
  assert.ok(await page.locator('#k-wr-spark .sp-ref').count() === 1, 'seuil du win rate en pointillé');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('bouton « Nouveau trade » : panneau déroulant, brouillon conservé, enregistrement, édition sur place', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1, asset: 'DAX 40' })] } });
  assert.equal(await page.locator('#page-dashboard #trade-form-card').count(), 0, 'plus de formulaire en bas du Dashboard');
  assert.ok(await page.evaluate(() => document.getElementById('nt-panel').hidden));
  await page.click('#nt-btn');
  assert.equal(await page.getAttribute('#nt-btn', 'aria-expanded'), 'true');
  await page.selectOption('#f-asset', 'EUR/USD');
  await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(() => document.getElementById('nt-panel').hidden), 'Échap ferme');
  await page.click('#nt-btn');
  assert.equal(await page.inputValue('#f-asset'), 'EUR/USD', 'brouillon conservé');
  await page.selectOption('#f-res', 'TP');
  await page.fill('#f-pnleur', '120');
  await page.click('#trade-form-card .btn-primary');
  assert.ok(await page.evaluate(() => document.getElementById('nt-panel').hidden), 'enregistrer referme le panneau');
  assert.equal(await page.evaluate(() => trades.length), 2);
  await goto(page, 'trades');
  await page.evaluate(() => startEditTrade(1));
  assert.equal(await page.evaluate(() => currentPage()), 'trades', 'modifier ne quitte pas la page');
  assert.equal(await page.locator('#form-title-text').textContent(), 'Modifier le trade');
  await page.click('#nt-panel .nt-close');
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Shift+N');
  assert.equal(await page.evaluate(() => document.getElementById('nt-panel').hidden), false, 'Maj+N ouvre le formulaire');
  assert.deepEqual(errors, []);
  await ctx.close();
});



test('scaling : paliers tous les X €, coussin qui grandit avec le palier, risque = % du palier', async () => {
  const sc = { version: 4, start: 1000, riskPct: 3, step: 1000, cushion1: 500, goal: 20000, current: 1850, auto: false, riskSteps: [], tableOpen: true };
  const { page, ctx, errors } = await openJournal({ seed: { tj_scaling: sc } });
  await goto(page, 'scaling');
  const col = c => page.$$eval('#sc-table tbody tr', (trs, c) => trs.map(tr => tr.children[c].textContent.replace(/\D/g, '')), c);
  assert.match(await page.locator('#sc-cushion-hint').textContent(), /8,3 pertes à 60,00\s€/);
  // Paliers tous les 1 000 € ; un palier recouvert par le coussin du précédent est sauté (6 000, 8 000…).
  assert.deepEqual(await col(1), ['1000', '2000', '3000', '4000', '5000', '7000', '9000', '12000', '15000', '19000']);
  assert.deepEqual((await col(3)).slice(1, 6), ['2500', '3750', '5000', '6250', '8750'], 'tu augmentes à palier + coussin (8,3 pertes)');
  assert.deepEqual((await col(5)).slice(0, 4), ['3000', '6000', '9000', '12000'], 'risque = 3 % du palier');
  // 1 850 € : taille de départ ; on augmente à 2 500 €.
  let tiles = await page.locator('#sc-tiles').innerText();
  assert.match(tiles, /30,00\s€/); assert.match(tiles, /2\s500\s€/);
  // 2 200 € saisi à la main : dans le coussin, on garde 30 €.
  await page.fill('#sc-current', '2200'); await page.waitForTimeout(60);
  assert.match(await page.locator('#sc-tiles .sc-tile').nth(0).innerText(), /30,00\s€[\s\S]*garde cette taille/);
  assert.match(await page.locator('#sc-table tbody tr').nth(1).innerText(), /coussin en cours · reste 300/);
  // 2 600 € : 60 € par trade, 10 pertes de marge avant de repasser sous 2 000 €.
  await page.fill('#sc-current', '2600'); await page.waitForTimeout(60);
  tiles = await page.locator('#sc-tiles').innerText();
  assert.match(tiles, /60,00\s€/); assert.match(tiles, /10,0 pertes/);
  // 2 % à partir de P2 : 60 € de risque, coussin 8,3 pertes = 500 € → tu augmentes à 3 500 €.
  const p2 = page.locator('#sc-table tbody tr').nth(2).locator('input');
  await p2.fill('2'); await p2.dispatchEvent('change'); await page.waitForTimeout(60);
  assert.equal((await col(3))[2], '3500');
  // Sans coussin : tu augmentes dès le palier.
  await page.fill('#sc-cushion1', '0'); await page.waitForTimeout(60);
  assert.deepEqual((await col(3)).slice(1, 3), ['2000', '3000']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('scaling : taille suivie dans l’historique, alerte de palier et respect du risque', async () => {
  // Départ 1 000 €, 3 %, paliers de 1 000 €, coussin 500 € → 60 € à partir de 2 500 €, retour à 30 € sous 2 000 €.
  const seq = [];
  for (let i = 0; i < 10; i++) seq.push(['TP', 5, 150]);           // 30 € ✓ → 2 500 € : coussin fait, taille 60 €
  seq.push(['SL', -1, -60], ['SL', -1, -60]);                       // 60 € ✓ → 2 380 €
  seq.push(['SL', -1, -180]);                                       // 180 € au lieu de 60 € → trop gros → 2 200 €
  seq.push(['TP', 2, 60]);                                          // 30 € au lieu de 60 € → trop petit → 2 260 €
  seq.push(['SL', -1, -60]);                                        // 60 € ✓ → 2 200 €
  const tr = seq.map(([res, pnl, eur], i) => T({ id: 6000 + i, date: new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10), entry: '10:00', asset: 'DAX 40', res, pnl, pnlEur: eur, rSrc: 'manuel' })).reverse();
  const sc = { version: 4, start: 1000, riskPct: 3, step: 1000, cushion1: 500, goal: 10000, auto: true, riskSteps: [] };
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: tr, tj_account: '1000', tj_scaling: sc, tj_scaling_seen: '1000' } });
  // 2 200 € en venant d'en haut : on reste à 60 € (au-dessus de 2 000 €).
  const alert = page.locator('#scaling-alert');
  assert.match(await alert.innerText(), /Coussin de P1 fait \(2\s500\s€\).*60,00\s€/s);
  const strip = await page.locator('#summary-banner').innerText();
  assert.match(strip, /Risque du plan\s*60,00\s€ \/ trade/);
  assert.match(strip, /Taille respectée\s*8\/10/);
  await alert.getByText("C'est noté").click();
  assert.equal(await alert.isVisible(), false);
  await goto(page, 'scaling');
  assert.match(await page.locator('#sc-tiles .sc-tile').nth(0).innerText(), /60,00\s€/);
  const comp = page.locator('#sc-compliance');
  assert.match(await comp.locator('.sc-tile').nth(0).innerText(), /13 \/ 15/);
  assert.match(await comp.locator('.sc-tile').nth(1).innerText(), /pire : ×3,00/);
  assert.match(await comp.locator('tbody tr').nth(1).innerText(), /P1\s+60,00\s€\s+30,00\s€\s+×0,50\s+▼ trop petit/);
  // Repasser sous 2 000 € : retour à 30 €.
  await page.evaluate(() => { trades.unshift(Object.assign({}, trades[0], { id: 9999, date: '2026-05-30', res: 'SL', pnl: -1, pnlEur: -250 })); renderAll(); });
  await goto(page, 'dashboard');
  assert.match(await page.locator('#scaling-alert').innerText(), /repassé sous P1 \(2\s000\s€\).*30,00\s€/s);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('chiffres fiables : Détecteur d’edge, coût réel des erreurs, calculateur relié au Scaling, win rate hors BE', async () => {
  const extra = [T({ id: 2000, date: '2026-06-16', res: 'TP', pnl: 1, pnlEur: 100, mfe: 300, mistakes: ['Sorti trop tôt'] }),
    T({ id: 2001, date: '2026-06-16', res: 'BE', pnl: 0, pnlEur: 0 })];
  const sc = { version: 4, start: 1000, riskPct: 3, step: 1000, cushion1: 500, goal: 10000, auto: true, riskSteps: [] };
  const { page, ctx, errors } = await openJournal({ time: NOW, seed: { tj_trades: [...extra, ...sampleTrades()], tj_account: '1000', tj_scaling: sc } });
  // Win rate : les BE ne comptent ni comme gains ni comme pertes.
  assert.equal(await page.locator('#dn-trades-pct').textContent(), '68 %');   // 21 G / (21 G + 10 P)
  assert.match(await page.locator('#dn-trades-sub').innerText(), /1 BE exclus/);
  await goto(page, 'stats');
  // Tous les segments gagnent : pas de faux « point faible ».
  const edge = await page.locator('#edge-finder-body').innerText();
  assert.match(edge, /Aucun point faible/); assert.match(edge, /Aucun segment perdant/);
  assert.doesNotMatch(edge, /plus gros point faible/);
  await page.evaluate(() => showStatsSubtab('behavior'));
  const cost = await page.locator('#mistake-cost-body').innerText();
  assert.match(cost, /Entrée trop tôt\s+10× · pertes sur ces trades/);
  assert.match(cost, /−500\s€/);
  assert.match(cost, /Sorti trop tôt\s+1× · 0\s€ perdus \+ 200\s€ de gain manqué/, 'le gain laissé sur la table est un coût, pas un gain');
  assert.match(cost, /Coût total estimé de tes erreurs taguées : −700\s€/);
  // Calculateur : risque du palier (solde 2 600 € → P1 atteint à 2 500 € → 60 €).
  await goto(page, 'plan');
  assert.equal(await page.inputValue('#calc-risk-eur'), '60');
  assert.match(await page.locator('#calc-risk-src').innerText(), /ton plan de Scaling \(palier P1/);
  await page.fill('#calc-stop-dist', '20'); await page.fill('#calc-point-value', '1');
  assert.match(await page.locator('#calc-result').innerText(), /3,00 unités\/lots/);
  await page.fill('#calc-risk-eur', '40');
  assert.match(await page.locator('#calc-risk-src').innerText(), /reprendre le plan \(60,00\s€\)/);
  await page.locator('#calc-risk-src button').click();
  assert.equal(await page.inputValue('#calc-risk-eur'), '60');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('journal : 25 trades puis « Afficher plus », bilan ← →, cartes lisibles sur mobile', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: sampleTrades() } });
  await goto(page, 'trades');
  const rows = () => page.locator('#tbody tr.trade-row').count();
  assert.equal(await rows(), 25);
  assert.match(await page.locator('#tbody tr.more-row').innerText(), /Afficher 5 de plus\s+25 sur 30/);
  await page.locator('#tbody tr.more-row .btn-ghost').click();
  assert.equal(await rows(), 30);
  assert.equal(await page.locator('#tbody tr.more-row').count(), 0);
  assert.match(await page.locator('#tbody tr.trade-row').first().innerText(), /\d{2}\/\d{2}\/2026/, 'date au format français');
  // Bilan : flèches entre journées tradées.
  await goto(page, 'bilan');
  const first = await page.inputValue('#bilan-date-select');
  assert.equal(await page.locator('#bilan-next').isDisabled(), true, 'déjà sur la journée la plus récente');
  await page.click('#bilan-prev');
  assert.notEqual(await page.inputValue('#bilan-date-select'), first);
  await page.click('#bilan-next');
  assert.equal(await page.inputValue('#bilan-date-select'), first);
  // Mobile : le P&L € de chaque trade est visible.
  await page.setViewportSize({ width: 390, height: 800 });
  await goto(page, 'trades');
  const eur = page.locator('#tbody tr.trade-row').first().locator('td').nth(7);
  assert.equal(await eur.isVisible(), true);
  const box = await eur.boundingBox();
  assert.ok(box.x + box.width <= 390, 'P&L dans l’écran');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('watchlist (biais du jour daté, avec/contre), plan relié, personnalisation repliée', async () => {
  const tr = [T({ id: 1, date: '2026-06-17', asset: 'EUR/USD', dir: 'Long', res: 'TP', pnl: 2, pnlEur: 100 }),
    T({ id: 2, date: '2026-06-17', asset: 'EUR/USD', dir: 'Short', res: 'SL', pnl: -1, pnlEur: -50 }),
    T({ id: 3, date: '2026-06-16', asset: 'BTC/USD', dir: 'Long', res: 'TP', pnl: 1, pnlEur: 40 })];
  // Ancien format de watchlist + ancien plan avec règles texte.
  const { page, ctx, errors } = await openJournal({ time: NOW, seed: { tj_trades: tr,
    tj_watch: { 'EUR/USD': { biais: 'Bearish', niveaux: '1.08', notes: '' } },
    tj_plan: { ce: [], cf: [], notes: '', risk: [['Risque par trade', '0.5%'], ['Max trades / jour', '4'], ['RR minimum', '2R']] } } });
  await goto(page, 'watchlist');
  assert.match(await page.locator('#watchlist-grid').innerText(), /EUR\/USD[\s\S]*pas de biais|EUR\/USD/);
  assert.match(await page.locator('#watch-stats').innerText(), /Renseigne ton biais du jour/);
  // Biais Bullish aujourd'hui sur EUR/USD : le Long gagnant est « avec », le Short perdant « contre ».
  await page.selectOption('select[aria-label="Biais du jour EUR/USD"]', 'Bullish');
  const stats = await page.locator('#watch-stats').innerText();
  assert.match(stats, /Avec ton biais\s+100 % gagnants\s+1 trade/);
  assert.match(stats, /Contre ton biais\s+0 % gagnants\s+1 trade/);
  assert.match(await page.locator('#watchlist-grid').innerText(), /biais aujourd'hui/);
  // Actif tradé absent de la liste : proposé en un clic.
  await page.locator('.watch-sugg button', { hasText: 'BTC/USD' }).click();
  assert.match(await page.locator('#watchlist-grid').innerText(), /Crypto[\s\S]*BTC\/USD/);
  await page.reload(); await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  await goto(page, 'watchlist');
  assert.equal(await page.inputValue('select[aria-label="Biais du jour EUR/USD"]'), 'Bullish', 'biais conservé');
  // Plan : règles reliées ; la journée se limite à 1 TP et 2 SL.
  await goto(page, 'plan');
  const rules = await page.locator('#risk-rules').innerText();
  assert.match(rules, /Risque par trade[\s\S]*à régler/);
  assert.match(rules, /Perte max du jour[\s\S]*1 %/);
  assert.equal(await page.inputValue('input[aria-label="TP max par jour"]'), '1');
  assert.equal(await page.inputValue('input[aria-label="SL max par jour"]'), '2');
  assert.doesNotMatch(rules, /Max trades/, 'ancienne règle « max trades / jour » retirée');
  assert.doesNotMatch(rules, /0\.5%/, 'ancienne règle texte du risque retirée');
  await goto(page, 'parametres');
  assert.equal(await page.evaluate(() => document.getElementById('settings-adv').open), false);
  assert.equal(await page.locator('#theme-preset-grid').isVisible(), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('règles du jour : 1 TP max et 2 SL max en alerte ; export CSV lisible par Excel', async () => {
  const today = '2026-06-17';
  const tr = [T({ id: 1, date: today, entry: '09:00', res: 'SL', pnl: -1, pnlEur: -30 }), T({ id: 2, date: today, entry: '10:00', res: 'TP', pnl: 2, pnlEur: 60 }),
    T({ id: 3, date: today, entry: '11:00', res: 'SL', pnl: -1, pnlEur: -30, asset: 'DAX; "40"', desc: 'note\nsur deux lignes' })];
  const { page, ctx, errors } = await openJournal({ time: NOW, seed: { tj_trades: tr, tj_plan: { ce: [], cf: [], notes: '', risk: [], maxTP: 1, maxSL: 2 } } });
  const alert = page.locator('#rule-alert');
  assert.equal(await alert.isVisible(), true);
  let txt = await alert.innerText();
  assert.match(txt, /Journée terminée selon ton plan/);
  assert.match(txt, /1 TP sur 1 : objectif du jour atteint/);
  assert.match(txt, /2 SL sur 2 : limite atteinte, stop pour aujourd'hui/);
  assert.match(await page.locator('#summary-banner').innerText(), /Règles du jour\s*1\/1 TP · 2\/2 SL/);
  // Un 2e TP : au-delà du plan → rouge.
  await page.evaluate(() => { trades.unshift(Object.assign({}, trades[0], { id: 99, entry: '12:00', res: 'TP', pnl: 1, pnlEur: 30, asset: 'EUR/USD', desc: '' })); renderAll(); });
  txt = await alert.innerText();
  assert.match(txt, /Règle de ton plan dépassée/);
  assert.match(txt, /2 TP aujourd'hui pour un maximum de 1/);
  assert.equal(await alert.getAttribute('class'), 'rule-alert crit');
  // SL max relevé à 3 dans le Plan : plus d'alerte SL.
  await goto(page, 'plan');
  await page.fill('input[aria-label="SL max par jour"]', '3'); await page.dispatchEvent('input[aria-label="SL max par jour"]', 'change');
  await goto(page, 'dashboard');
  assert.doesNotMatch(await page.locator('#rule-alert').innerText(), /SL sur/);
  // CSV : BOM, « ; », virgule décimale, guillemets échappés, une ligne par trade.
  const csv = await page.evaluate(() => tradesToCSV(trades));
  assert.ok(csv.startsWith('﻿Date;Entrée;Sortie;Actif;Sens'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines.length, 5);
  assert.match(lines[1], /^2026-06-17;09:00;/);
  assert.match(lines[3], /;"DAX; ""40""";/);
  assert.match(lines[3], /;-1;-30;/);
  assert.match(lines[3], /note sur deux lignes/);
  assert.match(lines[4], /^2026-06-17;12:00;/);
  const dl = page.waitForEvent('download');
  await page.evaluate(() => exportTradesCSV());
  assert.match((await dl).suggestedFilename(), /^journal-.*-trades-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('modèle prêt pour la sync : migration, uid, dates, captures à part, traces de suppression, réglages datés', async () => {
  const A = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const B = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjDAGNzYAAB1uAxEu4BwIAAAAAElFTkSuQmCC';
  // Ancien format : première capture en double (cap + caps[0]).
  const old = [T({ id: 1717000000000, date: '2026-06-10', cap: A, caps: [A, B] }), T({ id: 1717000000001, date: '2026-06-11' })];
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: old } });
  let st = await page.evaluate(() => trades.map(t => ({ uid: t.uid, c: t.createdAt, u: t.updatedAt, imgs: t.imgs.length, cap: t.cap, n: tradeImages(t).length })));
  const withImg = st.find(x => x.imgs);
  assert.equal(withImg.n, 2, '2 captures, plus de doublon');
  assert.equal(withImg.cap, undefined);
  assert.ok(st.every(x => x.uid && x.c === x.u && x.c > 0));
  assert.notEqual(st[0].uid, st[1].uid);
  assert.equal(await page.evaluate(() => JSON.parse(DB.getItem('tj_trades')).some(t => t.cap || t.caps)), false, 'stockage migré');
  // Modification : updatedAt avance, uid et createdAt ne bougent pas.
  const id = await page.evaluate(() => trades.find(t => t.imgs.length).id);
  const upd = await page.evaluate(id => { const b = trades.find(t => t.id === id); const a = TradeStore.update(id, { desc: 'revu' }); return { same: a.uid === b.uid && a.createdAt === b.createdAt, later: a.updatedAt >= b.updatedAt }; }, id);
  assert.ok(upd.same && upd.later);
  // Export v3 : captures à part, réimport identique.
  const exp = await page.evaluate(() => ({ trades, images: imagesOf(trades), tombstones: TradeStore.tombstones() }));
  assert.equal(Object.keys(exp.images).length, 2);
  // Suppression : trace + corbeille avec captures ; restauration : captures et uid revenus, trace retirée.
  await page.evaluate(id => deleteTrade(id), id);
  await page.click('#modal-confirm');
  assert.equal(await page.evaluate(() => TradeStore.tombstones().length), 1);
  assert.equal(await page.evaluate(() => ImageStore.allIds().length), 0, 'captures du trade supprimé retirées du magasin');
  assert.equal(await page.evaluate(() => loadTrash()[0].trade._images.length), 2, 'la corbeille garde les captures');
  await page.evaluate(() => restoreTrashItem(0));
  const back = await page.evaluate(uid => { const t = trades.find(x => x.uid === uid); return t && tradeImages(t).length; }, withImg.uid);
  assert.equal(back, 2);
  assert.equal(await page.evaluate(() => TradeStore.tombstones().length), 0);
  // Import d'un ancien backup (captures dans le trade) et d'un backup v3 (captures à part).
  await page.evaluate(([A, B]) => TradeStore.replaceAll([{ id: 5, date: '2026-01-02', res: 'TP', cap: B, caps: [B, A] }]), [A, B]);
  assert.equal(await page.evaluate(() => tradeImages(trades[0]).length), 2);
  assert.equal(await page.evaluate(() => TradeStore.tombstones().length), 2, 'les trades remplacés laissent une trace');
  await page.evaluate(exp => TradeStore.replaceAll(exp.trades, exp.images), exp);
  assert.equal(await page.evaluate(() => trades.length), 2);
  assert.equal(await page.evaluate(() => trades.reduce((n, t) => n + tradeImages(t).length, 0)), 2);
  assert.equal(await page.evaluate(() => ImageStore.allIds().length), 2, 'aucune capture orpheline');
  // Réglages : registre + date de modification.
  await page.evaluate(() => DB.setItem(JP + 'account', '2500'));
  const snap = await page.evaluate(() => settingsSnapshot());
  assert.equal(snap.tj_account.v, '2500');
  assert.ok(snap.tj_account.t > 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('comptes multiples : migration, création, type prop firm, renommage, suppression, données isolées', async () => {
  // Données existantes dans Live et Backtest, rien dans PropFirm.
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: sampleTrades().slice(0, 3), bt_trades: sampleTrades().slice(0, 5) } });
  const ready = () => page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  assert.deepEqual(await page.evaluate(() => ACCOUNTS.map(a => a.id + ':' + a.type)), ['tj:live', 'bt:backtest'], 'PropFirm vide non recréé');
  assert.match(await page.locator('#acc-current').innerText(), /Live/);
  // Création d'un compte prop firm depuis le sélecteur.
  await page.click('#acc-current');
  assert.equal(await page.locator('#acc-menu').isVisible(), true);
  await page.locator('#acc-menu .acc-action', { hasText: 'Nouveau compte' }).click();
  await page.fill('#acc-f-name', 'FTMO 100k');
  await page.selectOption('#acc-f-type', 'propfirm');
  await page.click('#modal-confirm');
  await page.waitForEvent('load'); await ready();
  assert.equal(await page.locator('#onboard').isVisible(), true, 'un nouveau compte ouvre l’assistant de réglage');
  await page.locator('#onboard').getByText('Passer').click();
  assert.match(await page.locator('#acc-current').innerText(), /FTMO 100k[\s\S]*Prop firm/);
  assert.equal(await page.evaluate(() => trades.length), 0, 'nouveau compte vide');
  assert.equal(await page.locator('.nav-item[data-page="propfirm"]').count(), 1, 'suivi de challenge disponible');
  const newId = await page.evaluate(() => JOURNAL_ID);
  assert.match(newId, /^a[a-z0-9]{5}$/);
  // Un trade dans ce compte ne touche pas les autres.
  await page.evaluate(() => TradeStore.add({ date: '2026-06-01', asset: 'DAX 40', res: 'TP', pnl: 1, pnlEur: 50 }));
  assert.equal(await page.evaluate(() => JSON.parse(DB.getItem('tj_trades')).length), 3);
  // Renommer (Paramètres).
  await goto(page, 'parametres');
  assert.match(await page.locator('#accounts-list').innerText(), /FTMO 100k[\s\S]*1 trade/);
  await page.locator('#accounts-list .acc-row.on').getByText('Modifier').click();
  await page.fill('#acc-f-name', 'FTMO 200k');
  await page.click('#modal-confirm');
  await page.waitForEvent('load'); await ready();
  assert.match(await page.locator('#acc-current').innerText(), /FTMO 200k/);
  // Supprimer le Backtest : ses clés disparaissent, le compte ouvert reste.
  await goto(page, 'parametres');
  await page.locator('#accounts-list .acc-row', { hasText: 'Backtest' }).locator('.del-btn').click();
  assert.match(await page.locator('#modal-msg').textContent(), /5 trade\(s\)/);
  await page.click('#modal-confirm');
  await page.waitForEvent('load'); await ready();
  assert.equal(await page.evaluate(() => DB.keys().filter(k => k.startsWith('bt_')).length), 0);
  assert.deepEqual(await page.evaluate(() => ACCOUNTS.map(a => a.name)), ['Live', 'FTMO 200k']);
  assert.equal(await page.evaluate(() => JOURNAL_ID), newId);
  // Basculer vers Live.
  await page.click('#acc-current');
  await page.locator('#acc-menu .acc-item', { hasText: 'Live' }).click();
  await page.waitForEvent('load'); await ready();
  assert.equal(await page.evaluate(() => trades.length), 3);
  assert.equal(await page.locator('.nav-item[data-page="propfirm"]').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('premier lancement : assistant 3 étapes, réglages appliqués, démo effaçable, écrans vides', async () => {
  const { page, ctx, errors } = await openJournal({ time: NOW, seed: { tj_onboarded: '' } });
  const ob = page.locator('#onboard');
  assert.equal(await ob.isVisible(), true, 'assistant ouvert sur un compte vide');
  // Étape 1 : compte.
  await page.fill('#ob-name', 'Compte perso');
  await page.fill('#ob-capital', '2000');
  await ob.getByText('Suivant').click();
  // Étape 2 : risque et règles.
  await page.fill('#ob-risk', '2');
  assert.match(await page.locator('#ob-risk-eur').textContent(), /40,00/);
  await page.fill('#ob-tp', '1'); await page.fill('#ob-sl', '2');
  await ob.getByText('Suivant').click();
  assert.match(await ob.innerText(), /Compte perso · 2\s000\s€ · 2 % par trade \(40,00\s€\)/);
  // Étape 3 : démo.
  await ob.getByText('Explorer avec une démo').click();
  assert.equal(await ob.isVisible(), false);
  const st = await page.evaluate(() => ({ acc: accountSize, name: ACCOUNTS[0].name, sc: getScalingState(), tp: planData.maxTP, sl: planData.maxSL, n: trades.length, demo: trades.every(t => t.demo), onb: DB.getItem(JP + 'onboarded') }));
  assert.equal(st.acc, 2000); assert.equal(st.name, 'Compte perso');
  assert.equal(st.sc.start, 2000); assert.equal(st.sc.riskPct, 2);
  assert.equal(st.tp, 1); assert.equal(st.sl, 2);
  assert.equal(st.n, 60); assert.ok(st.demo); assert.equal(st.onb, '1');
  assert.match(await page.locator('#acc-current').innerText(), /Compte perso/);
  assert.equal(await page.locator('#demo-banner').isVisible(), true);
  assert.equal(await page.evaluate(() => TradeStore.tombstones().length), 0);
  // Effacer la démo : pas de trace de suppression (rien à synchroniser), retour à l'écran vide.
  await page.locator('#demo-banner').getByText('Effacer la démo').click();
  assert.equal(await page.evaluate(() => trades.length), 0);
  assert.equal(await page.evaluate(() => TradeStore.tombstones().length), 0);
  assert.equal(await page.locator('#demo-banner').isVisible(), false);
  assert.equal(await page.locator('#welcome-card').isVisible(), true);
  await goto(page, 'stats');
  assert.match(await page.locator('#page-stats > .page-empty').innerText(), /Tes statistiques apparaîtront ici/);
  assert.equal(await page.locator('#edge-finder-body').isVisible(), false);
  // Un premier vrai trade : les pages se remplissent.
  await page.evaluate(() => TradeStore.add({ date: '2026-06-16', asset: 'EUR/USD', res: 'TP', pnl: 2, pnlEur: 80 }));
  assert.equal(await page.locator('#page-stats > .page-empty').isVisible(), false);
  // L'assistant ne revient pas au rechargement.
  await page.reload(); await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  assert.equal(await page.locator('#onboard').isVisible(), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('frais et commissions : saisie, P&L net / brut, statistiques, export', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1, date: '2026-06-10', pnlEur: 96.5, fees: 3.5 }), T({ id: 2, date: '2026-06-11', res: 'SL', pnl: -1, pnlEur: -52, fees: 2 })] } });
  assert.match(await page.locator('#k-pnleur-sub').textContent(), /net de 6\s€ de frais/);
  await goto(page, 'stats');
  const pnl = await page.locator('#stats-pnl').innerText();
  assert.match(pnl, /P&L brut \(avant frais\)\s+\+50,00\s€/);
  assert.match(pnl, /Frais payés \(commission \+ swap\)\s+−5,50\s€|Frais payés \(commission \+ swap\)\s+-5,50\s€/);
  // Saisie dans le formulaire.
  await page.evaluate(() => openTradePanel());
  await page.selectOption('#f-asset', 'EUR/USD'); await page.selectOption('#f-res', 'TP');
  await page.evaluate(() => openFormSectionById('section-context'));
  await page.fill('#f-pnleur', '120'); await page.fill('#f-fees', '4.2');
  await page.click('#trade-submit-btn');
  const t = await page.evaluate(() => trades.find(x => x.pnlEur === 120));
  assert.equal(t.fees, 4.2);
  await page.evaluate(id => openTradeDetail(id), t.id);
  assert.match(await page.locator('#trade-drawer .dw-stats').innerText(), /brut \+124,20\s€ · frais 4,20\s€/);
  const csv = await page.evaluate(() => tradesToCSV(trades));
  assert.match(csv.split('\r\n')[0], /P&L net \(€\);Frais \(€\)/);
  assert.match(csv, /;120;4,2;/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('import MetaTrader 4 (HTML), MetaTrader 5 (HTML UTF-16) et cTrader (CSV) : frais, devise, R, sans doublon', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_import_fx_rate: '0.9' } });
  const F = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
  const files = ['mt4-statement.htm', 'mt5-ReportHistory-123456.html', 'ctrader-history.csv'].map(f => join(F, f));
  await page.setInputFiles('#csv-import-file', files);
  await page.waitForTimeout(600);
  const get = () => page.evaluate(() => Object.fromEntries(trades.map(t => [t.tvKey, { a: t.asset, dir: t.dir, e: t.pnlEur, f: t.fees, c: t.ccy, r: t.pnl, src: t.importSource }])));
  const t = await get();
  assert.equal(Object.keys(t).length, 6, 'balance, ordre annulé, sous-total et positions ouvertes ignorés');
  assert.deepEqual(t['mt4:1001'], { a: 'EUR/USD', dir: 'Long', e: 176.85, f: 3.15, c: 'USD', r: 2, src: 'MT4' });
  assert.deepEqual(t['mt4:1002'], { a: 'GBP/USD', dir: 'Short', e: -187.38, f: 7.38, c: 'USD', r: -1, src: 'MT4' });
  assert.deepEqual(t['mt5:555001'], { a: 'DE40', dir: 'Long', e: 98, f: 2, c: 'EUR', r: 2, src: 'MT5' });
  assert.equal(t['mt5:555002'].e, -21); assert.equal(t['mt5:555002'].f, 1);
  assert.equal(t['ctrader:8801'].e, 174.6); assert.equal(t['ctrader:8801'].src, 'cTrader');
  assert.equal(t['ctrader:8802'].dir, 'Short'); assert.equal(t['ctrader:8802'].f, 4.05);
  await page.setInputFiles('#csv-import-file', files);
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => trades.length), 6, 'réimport : aucun doublon');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('synchronisation par fichier : fusion d’un backup (plus récent gagne, suppressions, pas de doublon, réglages)', async () => {
  const U = (o) => T(Object.assign({ createdAt: 1000, updatedAt: 1000 }, o));
  const { page, ctx, errors } = await openJournal({ seed: {
    tj_trades: [U({ id: 1, uid: 'uid-001', pnlEur: 100 }), U({ id: 2, uid: 'uid-002', date: '2026-09-02' }), U({ id: 3, uid: 'uid-003', tvKey: 'mt5:1', updatedAt: 5000, date: '2026-09-03' })],
    tj_tombstones: JSON.stringify([{ uid: 'uid-005', deletedAt: 9000 }]),
    tj_account: '10000', tj_r_mode: 'usable', g_settings_mtime: JSON.stringify({ tj_r_mode: 5000 })
  } });
  const backup = {
    version: 3, journal: 'tj', trades: [
      U({ id: 7, uid: 'uid-001', pnlEur: 150, updatedAt: 2000 }),                           // modifié sur l'autre appareil → mis à jour
      U({ id: 8, uid: 'uid-000', tvKey: 'mt5:1', date: '2026-09-03' }),                      // même trade broker importé des deux côtés
      U({ id: 9, uid: 'uid-004', date: '2026-09-04', asset: 'GOLD', imgs: ['iabc123'] }),        // nouveau, avec capture
      U({ id: 10, uid: 'uid-005', date: '2026-09-05', updatedAt: 100 })                       // supprimé ici depuis → ignoré
    ],
    images: { iabc123: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjDAGNzYAAB1uAxEu4BwIAAAAAElFTkSuQmCC' },
    tombstones: [{ uid: 'uid-002', deletedAt: 3000 }],
    settingsMeta: { tj_account: { v: '25000', t: Date.now() + 1000 }, tj_r_mode: { v: 'strict', t: 10 } }
  };
  const file = join(mkdtempSync(join(tmpdir(), 'merge-')), 'backup-telephone.json');
  writeFileSync(file, JSON.stringify(backup));
  await goto(page, 'export');
  await page.setInputFiles('#merge-file', file);
  await page.click('#modal-confirm');
  await page.waitForTimeout(300);
  const t = await page.evaluate(() => trades.map(t => ({ uid: t.uid, e: t.pnlEur, n: t.imgs.length })).sort((a, b) => a.uid.localeCompare(b.uid)));
  assert.deepEqual(t.map(x => x.uid), ['uid-000', 'uid-001', 'uid-004'], 'u2 supprimé, u3/u0 non doublé (uid commun), u5 non recréé');
  assert.equal(t.find(x => x.uid === 'uid-001').e, 150);
  assert.equal(t.find(x => x.uid === 'uid-004').n, 1);
  assert.equal(await page.evaluate(() => accountSize), 25000, 'réglage plus récent appliqué');
  assert.equal(await page.evaluate(() => DB.getItem('tj_r_mode')), 'usable', 'réglage plus ancien ignoré');
  assert.match(await page.locator('.toast').last().innerText(), /1 ajouté · 1 mis à jour · 1 supprimé · 1 réglage/);
  assert.equal(await page.evaluate(() => TradeStore.tombstones().map(x => x.uid).sort().join()), 'uid-002,uid-005');
  // Refusionner le même fichier : rien ne change.
  await page.setInputFiles('#merge-file', file);
  await page.click('#modal-confirm');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => trades.length), 3);
  assert.match(await page.locator('.toast').last().innerText(), /Déjà à jour/);
  // Le backup exporté contient les dates des réglages.
  assert.equal(await page.evaluate(() => typeof settingsSnapshot().tj_account.t), 'number');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('playbooks : fiche par setup, règles rappelées dans le formulaire, exemples protégés et exportés', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: sampleTrades(), tj_plan: JSON.stringify({ ce: [], cf: [], notes: '', setups: ['Break & retest', 'OB + FVG'] }) } });
  await goto(page, 'playbooks');
  assert.equal(await page.locator('.pb-card').count(), 2);
  assert.match(await page.locator('.pb-card').first().innerText(), /Break & retest\s+15 trades · \d+ %/);
  await page.locator('.pb-card').nth(1).click();
  assert.match(await page.locator('.pb-detail .panel-hdr').innerText(), /OB \+ FVG/);
  await page.fill('#pb-desc', 'Retour sur OB H1 après sweep');
  await page.dispatchEvent('#pb-desc', 'change');
  await page.click('#pb-rules .btn-add');
  await page.fill('#pb-rules input >> nth=0', 'Sweep de liquidité avant l’entrée');
  await page.dispatchEvent('#pb-rules input >> nth=0', 'change');
  const png = join(mkdtempSync(join(tmpdir(), 'pb-')), 'exemple.png');
  writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjDAGNzYAAB1uAxEu4BwIAAAAAElFTkSuQmCC', 'base64'));
  await page.setInputFiles('.pb-img-add input', png);
  await page.waitForSelector('.pb-img img');
  const pb = await page.evaluate(() => planData.playbooks['OB + FVG']);
  assert.equal(pb.desc, 'Retour sur OB H1 après sweep');
  assert.deepEqual(pb.rules, ['Sweep de liquidité avant l’entrée']);
  assert.equal(pb.imgs.length, 1);
  // Rappel dans le formulaire
  await page.evaluate(() => openTradePanel());
  assert.equal(await page.locator('#f-setup-rules').isHidden(), true);
  await page.fill('#f-setup', 'OB + FVG');
  assert.match(await page.locator('#f-setup-rules').innerText(), /Règles du playbook « OB \+ FVG »[\s\S]*Sweep de liquidité/);
  // L'exemple survit au ménage des captures et part dans le backup.
  await page.evaluate(() => TradeStore.replaceAll(trades.slice(), null));
  assert.ok(await page.evaluate(id => !!ImageStore.get(id), pb.imgs[0]));
  // Renommer le setup dans le plan renomme la fiche.
  await page.evaluate(() => renameSetup(1, 'OB + FVG', 'OB H1'));
  assert.equal(await page.evaluate(() => !!planData.playbooks['OB H1'] && !planData.playbooks['OB + FVG']), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('journal de séance : préparation du jour sans trade, bilan et leçon, revue hebdo, fusion jour par jour', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: sampleTrades() }, time: NOW });
  await goto(page, 'bilan');
  assert.equal(await page.inputValue('#bilan-date-select'), '2026-06-17', 'aujourd’hui proposé même sans trade');
  assert.match(await page.locator('#bilan-content').innerText(), /Aucun trade ce jour pour l’instant/);
  await page.click('.dj-opt:has-text("Haussier")');
  assert.equal(await page.locator('.dj-opt:has-text("Haussier")').getAttribute('aria-pressed'), 'true');
  await page.fill('#dj-plan', 'DAX : range 18 420 / 18 560');
  await page.click('.dj-opt:has-text("En partie")');
  await page.fill('#dj-lesson', 'Attendre la clôture M5 avant d’entrer');
  const e = await page.evaluate(() => loadDaily()['2026-06-17']);
  assert.equal(e.bias, 'haussier'); assert.equal(e.plan, 'DAX : range 18 420 / 18 560'); assert.equal(e.discipline, 'partiel');
  await page.click('.dj-opt:has-text("Haussier")');   // re-cliquer efface le choix
  assert.equal(await page.evaluate(() => loadDaily()['2026-06-17'].bias), '');
  // Une journée tradée garde son bilan chiffré, avec son propre journal (vide).
  await page.click('#bilan-prev');
  assert.equal(await page.inputValue('#bilan-date-select'), '2026-06-16');
  assert.equal(await page.inputValue('#dj-lesson'), '');
  await goto(page, 'revue');
  assert.match(await page.locator('#revue-content').innerText(), /Journal de séance[\s\S]*Attendre la clôture M5[\s\S]*En partie/);
  // Fusion d'un backup : les jours sont réunis, le plus récent gagne pour un même jour.
  const n = await page.evaluate(() => mergeSettingsMeta({ tj_daily: { v: JSON.stringify({ '2026-06-15': { lesson: 'Autre appareil', updatedAt: 5 }, '2026-06-17': { lesson: 'Ancienne', updatedAt: 1 } }), t: 1 } }));
  assert.equal(n, 1);
  const all = await page.evaluate(() => loadDaily());
  assert.equal(all['2026-06-15'].lesson, 'Autre appareil');
  assert.equal(all['2026-06-17'].lesson, 'Attendre la clôture M5 avant d’entrer');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('rapport mentor : fichier HTML autonome, période, R uniquement, contenu échappé', async () => {
  const list = sampleTrades();
  list[0].desc = '<script>alert(1)</script> entrée propre';
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: list, tj_daily: JSON.stringify({ '2026-06-10': { lesson: 'Attendre la confirmation', discipline: 'oui', updatedAt: 1 } }) }, time: NOW });
  await goto(page, 'export');
  await page.selectOption('#mentor-period', 'all');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Télécharger le rapport")')]);
  assert.match(dl.suggestedFilename(), /^rapport-live-2026-06-17\.html$/);
  const doc = readFileSync(await dl.path(), 'utf8');
  assert.ok(!/<script/i.test(doc), 'aucun script dans le rapport');
  assert.match(doc, /&lt;script&gt;alert\(1\)&lt;\/script&gt; entrée propre/);
  assert.match(doc, /30 trades sur \d+ jours/);
  assert.match(doc, /Par setup[\s\S]*Break &amp; retest/);
  assert.match(doc, /Attendre la confirmation <em>— plan respecté<\/em>/);
  assert.match(doc, /<svg viewBox="0 0 760 180" class="eq"/);
  assert.match(doc, /Résultat net/);
  // R uniquement : plus aucun montant en €.
  await page.check('#mentor-ronly');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Télécharger le rapport")')]);
  const doc2 = readFileSync(await dl2.path(), 'utf8');
  assert.ok(!/\d\s?€/.test(doc2), 'aucun montant en €');
  assert.match(doc2, /montants en R uniquement/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('traduction : français par défaut ; en anglais, toute l\'interface (pages, fenêtres, messages, dates) est traduite', async () => {
  let { page, ctx, errors } = await openJournal({ seed: { tj_trades: sampleTrades() }, time: NOW });
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr');
  assert.equal(await page.locator('.nav-item[data-page="stats"]').innerText(), 'Statistiques');
  assert.equal(await page.evaluate(() => t('cle.inconnue')), 'cle.inconnue');
  await ctx.close();
  ({ page, ctx, errors } = await openJournal({ seed: { tj_trades: sampleTrades(), g_lang: 'en' }, time: NOW }));
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.equal(await page.locator('.nav-item[data-page="stats"]').innerText(), 'Statistics');
  assert.match(await page.locator('#page-dashboard').innerText(), /Overall performance/);
  await goto(page, 'stats');
  assert.equal(await page.locator('#page-stats h2').innerText(), 'Statistics');
  assert.match(await page.locator('#page-stats .subtab-bar').innerText(), /Overview[\s\S]*Timing & behavior[\s\S]*Advanced analysis/);
  // Texte affiché après coup (rendu dynamique, fenêtre, message) : traduit à l'apparition.
  await goto(page, 'bilan');
  assert.match(await page.locator('#bilan-journal').innerText(), /Session journal — Wed 17 Jun 2026[\s\S]*Before the session[\s\S]*Daily bias/i);
  await page.evaluate(() => deleteTrade(trades[0].id));
  assert.match(await page.locator('#modal-title').innerText(), /Delete this trade\?/);
  await page.evaluate(() => closeModal());
  await page.evaluate(() => showToast('Trade enregistré ✓', 'success'));
  assert.match(await page.locator('.toast').last().innerText(), /Trade saved ✓/);
  // Phrase avec un nom libre (actif) : modèle générique.
  assert.equal(await page.evaluate(() => tr('Biais du jour DAX 40')), 'Daily bias DAX 40');
  assert.equal(await page.evaluate(() => tr('Live · 10 000 € · 1 % par trade (100 €)')), 'Live · 10 000 € · 1 % per trade (100 €)');
  await goto(page, 'parametres');
  assert.equal(await page.inputValue('#lang-select'), 'en');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('charte premium : le thème personnel « 02 » devient « Néon », en tête des thèmes ; un ancien thème prédéfini prend la nouvelle charte', async () => {
  const neon = { '--bg': '#07010f', '--bg2': '#12052a', '--bg3': '#1b0a3a', '--accent': '#ff2bd6', '--green': '#00ffa3', '--red': '#ff3b6b', '--purple': '#b14bff', '--font-mono': "'Space Mono',monospace" };
  let { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1 })],
    g_custom_themes: JSON.stringify([{ id: 11, name: 'Bleu', theme: { '--bg': '#000010' } }, { id: 22, name: '02', theme: neon }]),
    g_theme: JSON.stringify(neon) } });
  const list = await page.evaluate(() => getCustomThemes().map(t => [t.name, !!t.neon]));
  assert.deepEqual(list, [['Bleu', false], ['Néon', true]]);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), '#ff2bd6', 'ton thème appliqué reste tel quel');
  await goto(page, 'parametres');
  const first = page.locator('#theme-preset-grid .theme-swatch').first();
  assert.match(await first.innerText(), /Néon/);
  assert.match(await first.getAttribute('class'), /active/);
  await page.locator('#theme-preset-grid .theme-swatch', { hasText: 'Graphite' }).click();
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), '#5d6cf6');
  await first.click();
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), '#ff2bd6');
  assert.deepEqual(errors, []);
  await ctx.close();
  // Ancien thème prédéfini « Terminal pro » enregistré : il passe sur Graphite et perd ses anciens réglages de structure.
  ({ page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1 })], g_theme: JSON.stringify({ '--preset-key': 'default', '--bg': '#0a0c10', '--accent': '#4c8dff', '--font-mono': "'JetBrains Mono',monospace" }) } }));
  assert.deepEqual(await page.evaluate(() => [getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), getComputedStyle(document.documentElement).getPropertyValue('--mono').trim().startsWith("'Inter'")]), ['#5d6cf6', true]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('prise en main : menu par groupes, routine du jour cochée toute seule, sections repliables, actions d\'en-tête', async () => {
  const today = T({ id: 9001, date: '2026-06-17', entry: '10:05', desc: '' });
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [today].concat(sampleTrades()) }, time: NOW });
  // Menu rangé par groupes.
  const groups = await page.locator('.nav .nav-group').allInnerTexts();
  assert.deepEqual(groups.map(g => g.trim().toLowerCase()), ['trading', 'analyse', 'préparation', 'données & réglages']);
  // Routine : 0/3 puis la préparation se coche seule.
  assert.match(await page.locator('#routine').innerText(), /Ta routine du jour[\s\S]*0\/3[\s\S]*Préparer ta séance[\s\S]*Noter ton trade du jour[\s\S]*Faire le bilan/);
  await page.locator('#routine .rt-step', { hasText: 'Préparer' }).locator('.rt-go').click();
  assert.equal(await page.evaluate(() => currentPage()), 'bilan');
  await page.fill('#dj-plan', 'Range DAX');
  await goto(page, 'dashboard');
  assert.match(await page.locator('#routine .rt-count').innerText(), /1\/3/);
  assert.equal(await page.locator('#routine .rt-step.done').count(), 1);
  await page.locator('#routine .rt-step', { hasText: 'Noter' }).locator('.rt-go').click();
  assert.ok(await page.locator('#trade-drawer-overlay.show').count(), 'la fiche du trade à compléter s\'ouvre');
  await page.evaluate(() => closeTradeDetail());
  await page.click('#routine .rt-hide');
  assert.equal(await page.locator('#routine').isHidden(), true);
  // Sections repliables, état mémorisé.
  const perf = page.locator('.dash-section[data-widget="sec-perf"] .dash-sec-title');
  const after = page.locator('.dash-section[data-widget="sec-perf"] + .dash-widget');
  assert.equal(await after.isVisible(), true);
  await perf.click();
  assert.equal(await after.isVisible(), false);
  assert.deepEqual(await page.evaluate(() => dashCollapsed()), ['sec-perf']);
  await perf.click();
  assert.equal(await after.isVisible(), true);
  // Action principale dans l'en-tête du journal : importer un historique.
  await goto(page, 'trades');
  await page.click('#page-trades .page-hdr-actions .btn-ghost');
  assert.equal(await page.evaluate(() => currentPage()), 'export');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('scaling : coussin réglé en nombre de pertes, saisi à la main et gardé à chaque palier', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1, pnlEur: 0 })], tj_account: '1000',
    tj_scaling: JSON.stringify({ version: 4, start: 1000, riskPct: 3, step: 1000, cushion1: 500, goal: 10000, current: 1000, auto: true, riskSteps: [], tableOpen: true }) } });
  await goto(page, 'scaling');
  assert.equal(await page.inputValue('#sc-cushion-n'), '8.33', 'ancien coussin de 500 € = 8,3 pertes de 60 €');
  await page.fill('#sc-cushion-n', '10');
  await page.waitForTimeout(60);
  assert.equal(await page.inputValue('#sc-cushion1'), '600', '10 pertes × 60 € au 1er palier');
  const m = await page.evaluate(() => computeScalingPaliers(getScalingState(), 1000).pts.slice(1, 4).map(p => [p.bal, p.risk, p.cushionEur]));
  assert.deepEqual(m, [[2000, 60, 600], [3000, 90, 900], [4000, 120, 1200]], '10 pertes au risque de chaque palier');
  // Le risque change : le nombre de pertes reste, le coussin en € suit.
  await page.fill('#sc-risk-pct', '2');
  await page.waitForTimeout(60);
  assert.equal(await page.inputValue('#sc-cushion-n'), '10');
  assert.equal(await page.inputValue('#sc-cushion1'), '400');
  // Saisie en € : le nombre de pertes se recalcule.
  await page.fill('#sc-cushion1', '200');
  await page.waitForTimeout(60);
  assert.equal(await page.inputValue('#sc-cushion-n'), '5');
  assert.equal(await page.evaluate(() => JSON.parse(DB.getItem('tj_scaling')).cushionN), 5);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('personnalisation : menu « Personnaliser mon thème » à onglets, chaque réglage s\'applique, thème enregistré visible en tête', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1 })] } });
  await goto(page, 'parametres');
  const css = v => page.evaluate(k => getComputedStyle(document.documentElement).getPropertyValue(k).trim(), v);
  await page.click('#settings-adv summary');
  assert.equal(await page.locator('#settings-adv .cz-pane[data-cz="colors"]').isVisible(), true);
  // Couleur d'accent changée à la main.
  await page.evaluate(() => onColorPick('--accent', '#ff00aa', true));
  assert.equal(await css('--accent'), '#ff00aa');
  // Ambiance : cartes en verre + lueur.
  await page.click('.cz-tab[data-cz="mood"]');
  await page.click('.card-style-btn[data-val="glass"]');
  assert.ok(await page.evaluate(() => document.body.classList.contains('cardstyle-glass')));
  assert.match(await page.evaluate(() => getComputedStyle(document.querySelector('#themes-card')).backdropFilter || ''), /blur/);
  await page.check('#glow-toggle');
  assert.ok(await page.evaluate(() => document.body.classList.contains('glow-on')));
  // Formes & polices.
  await page.click('.cz-tab[data-cz="shape"]');
  await page.click('.shape-preset-btn[data-r="20"]');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#themes-card')).borderTopLeftRadius), (await css('--r3')).replace(/\s/g, ''));
  await page.selectOption('#font-select', "Georgia,'Times New Roman',serif");
  assert.match(await page.evaluate(() => getComputedStyle(document.body).fontFamily), /Georgia/);
  // Mes thèmes : enregistrement → visible dans la grille du haut.
  await page.click('.cz-tab[data-cz="mine"]');
  page.once('dialog', d => d.accept('Mon rose'));
  await page.click('.cz-pane[data-cz="mine"] .btn-primary');
  assert.match(await page.locator('#theme-preset-grid').innerText(), /Mon rose/);
  // L'onglet ouvert est mémorisé.
  assert.equal(await page.evaluate(() => DB.getItem('g_cz_tab')), 'mine');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// Marché simulé (à la place de Binance) : tendance haussière régulière + oscillation, identique d'un appel à l'autre.
async function mockBinance(page) {
  const price = t => 60000 + (t - 1780000000) / 300 * 20 + 150 * Math.sin(t / 3000);
  await page.route(/binance\.(vision|com)\/api\/v3\/klines/, route => {
    const u = new URL(route.request().url()), sec = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600 }[u.searchParams.get('interval')] || 300;
    const limit = +u.searchParams.get('limit') || 500, out = [];
    let t0;
    if (u.searchParams.get('startTime')) t0 = Math.ceil(+u.searchParams.get('startTime') / 1000 / sec) * sec;
    else t0 = Math.floor(+u.searchParams.get('endTime') / 1000 / sec) * sec - (limit - 1) * sec;
    for (let i = 0; i < limit; i++) {
      const t = t0 + i * sec, o = price(t), c = price(t + sec);
      out.push([t * 1000, String(o), String(Math.max(o, c) + 25), String(Math.min(o, c) - 25), String(c), '12.5']);
    }
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(out) });
  });
}

test('backtest replay : bougies sans futur, calculateur de position, ordre au marché et limite, trade enregistré dans le journal, reprise de séance', async () => {
  // Compte Live : pas de replay (menu, page, recherche).
  let live = await openJournal({ seed: { tj_trades: [T({ id: 1 })] } });
  assert.equal(await live.page.locator('.nav-item[data-page="replay"]').count(), 0);
  await goto(live.page, 'replay');
  assert.equal(await live.page.evaluate(() => currentPage()), 'dashboard');
  await live.ctx.close();
  // Compte Backtest : le replay est là.
  const { page, ctx, errors } = await openJournal({ journal: 'bt', seed: { bt_trades: [T({ id: 1 })], bt_account: '10000' }, time: NOW });
  await mockBinance(page);
  assert.equal(await page.locator('.nav-item[data-page="replay"]').count(), 1);
  await goto(page, 'replay');
  await page.evaluate(v => rpSetStart(v), '2026-06-01T09:00');
  await page.fill('#rp-balance', '10000');
  await page.click('text=Lancer le replay');
  await page.waitForSelector('#rp-app:not([hidden]) #rp-chart canvas');
  assert.match(await page.locator('#rp-info').innerText(), /BTC\/USDT\s+M5/);
  // Aucune bougie après la date de départ n'est chargée dans le graphique.
  const lastShown = await page.evaluate(() => RPC[RP.cursor].time);
  assert.ok(lastShown < Date.parse('2026-06-01T09:00') / 1000, 'la dernière bougie affichée précède le départ');
  // Calculateur : achat au marché, stop proposé à 1 %, objectif 2R, risque 1 % de 10 000.
  await page.click('#rp-ticket .rp-side.buy');
  await page.click('#rp-ticket >> text=proposer');
  const sum = await page.locator('#rp-ticket-sum').innerText();
  assert.match(sum, /Risque\s+−\s?(99|100)[,.]\d\d\s\$ · (0,99|1,00) %/);
  assert.match(sum, /RR 2,00/);
  const expQty = await page.evaluate(() => { const r = rpTicketCalc(); return Math.floor(100 / r.distance * 10000 + 1e-6) / 10000; });   // stop à 1,5 × ATR, risque 100 $
  assert.equal(await page.locator("#rp-go").innerText(), "Acheter " + expQty.toLocaleString("fr-FR", { maximumFractionDigits: 6 }) + " BTC");
  // Le stop se déplace à la souris sur le graphique : le calculateur suit.
  const before = await page.evaluate(() => +RP_TICKET.sl);
  const box = await page.locator('#rp-chart').boundingBox();
  const y = await page.evaluate(() => RP_SERIES.priceToCoordinate(rpTicketCalc().sl));
  const x = box.x + box.width * 0.5;
  await page.mouse.move(x, box.y + y); await page.mouse.down();
  await page.mouse.move(x, box.y + y + 40, { steps: 6 }); await page.mouse.up();
  const after = await page.evaluate(() => +RP_TICKET.sl);
  assert.ok(after < before, 'stop descendu : ' + before + ' → ' + after);
  await page.click('#rp-ticket >> text=proposer');
  await page.click('#rp-go');
  assert.equal(await page.locator('#rp-positions tbody tr').count(), 1);
  // Lecture jusqu'à l'objectif.
  await page.evaluate(() => rpStep(150));
  assert.equal(await page.evaluate(() => RP.positions.length), 0);
  assert.equal(await page.evaluate(() => RP.history.length), 1);
  const t = await page.evaluate(() => trades.find(x => x.importSource === 'Replay'));
  assert.ok(t, 'trade enregistré dans le journal');
  assert.equal(t.asset, 'BTC/USDT'); assert.equal(t.dir, 'Long'); assert.equal(t.res, 'TP'); assert.equal(t.tf, 'M5'); assert.equal(t.rSrc, 'prix');
  // Objectif atteint : 2R bruts ; le R net retire les frais (0,04 % à l'entrée et à la sortie).
  const h = await page.evaluate(() => { const p = RP.history[0]; return { gross: p.realized / p.risk0, net: (p.realized - p.fees) / p.risk0 }; });
  assert.ok(Math.abs(h.gross - 2) < 0.02, 'R brut ≈ 2 : ' + h.gross);
  assert.ok(Math.abs(t.pnl - Math.round(h.net * 100) / 100) < 0.011 && t.pnl < 2, 'R net enregistré : ' + t.pnl);
  assert.ok(t.fees > 0); assert.ok(t.imgs.length === 1, 'capture du graphique jointe');
  // Ordre limite d'achat sous le prix : exécuté plus tard.
  await page.click('#rp-ticket >> text=Limite');
  const px = await page.evaluate(() => Math.round(rpCur().close - 100));
  await page.fill('#rp-ticket .rp-f input[type=number] >> nth=0', String(px));
  await page.click('#rp-ticket >> text=proposer');
  await page.click('#rp-go');
  assert.equal(await page.evaluate(() => RP.orders.length), 1);
  await page.evaluate(() => rpStep(40));
  assert.equal(await page.evaluate(() => RP.orders.length + RP.positions.length + RP.history.length >= 2), true);
  // Reprise de séance après rechargement.
  const cursorTime = await page.evaluate(() => rpCur().time);
  await page.evaluate(() => DB.flush());
  await page.reload(); await mockBinance(page);
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  await goto(page, 'replay');
  assert.match(await page.locator('#rp-resume').innerText(), /Séance en cours · BTC\/USDT M5/);
  await page.click('#rp-resume >> text=Reprendre');
  await page.waitForSelector('#rp-app:not([hidden]) #rp-chart canvas');
  assert.equal(await page.evaluate(() => rpCur().time), cursorTime);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('backtest replay : export TradingView d\'EUR/USD importé (paire reconnue, 5 décimales, stop selon la volatilité, lots et pips)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tv-')), file = join(dir, 'FX_EURUSD, 5.csv');
  const rows = ['time,open,high,low,close,Volume,MA'];
  let p = 1.085;
  for (let i = 0; i < 600; i++) { const t = 1780300800 + i * 300, o = p, c = p + 0.0004 * Math.sin(i / 7) + 0.00005; rows.push([t, o.toFixed(5), (Math.max(o, c) + 0.00012).toFixed(5), (Math.min(o, c) - 0.00011).toFixed(5), c.toFixed(5), 1200 + i, c.toFixed(5)].join(',')); p = c; }
  writeFileSync(file, rows.join('\n'));
  const { page, ctx, errors } = await openJournal({ journal: 'bt', seed: {} });
  await goto(page, 'replay');
  await page.evaluate(v => rpSetStart(v), '2026-06-01T12:00');
  await page.setInputFiles('#rp-file', file);
  await page.waitForSelector('#rp-app:not([hidden]) #rp-chart canvas');
  assert.match(await page.locator('#rp-info').innerText(), /EUR\/USD\s+M5\s+lun\. 01 juin 2026 11:55\s+1,\d{5}/);
  await page.evaluate(() => rpSuggestStop());
  const sum = await page.locator('#rp-ticket-sum').innerText();
  assert.match(sum, /Quantité\s+[\d\s ,]+ EUR · [\d,]+ lot/);
  assert.match(sum, /Distance au stop\s+0,000\d\d · \d+,\d pips/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('backtest replay : fichiers gratuits (HistData, Dukascopy, MetaTrader) reconnus', async () => {
  const { page, ctx, errors } = await openJournal({ journal: 'bt', seed: {} });
  await goto(page, 'replay');
  const r = await page.evaluate(() => {
    const ascii = [], mt = [], duka = ['Gmt time,Open,High,Low,Close,Volume'];
    for (let i = 0; i < 60; i++) {
      const m = String(i).padStart(2, '0'), o = (1.1 + i / 1e4).toFixed(5), h = (1.1002 + i / 1e4).toFixed(5), l = (1.0998 + i / 1e4).toFixed(5);
      ascii.push(`20240102 17${m}00;${o};${h};${l};${o};0`);
      mt.push(`2024.01.02,17:${m},${o},${h},${l},${o},0`);
      duka.push(`02.01.2024 22:${m}:00.000,${o},${h},${l},${o},12.5`);
    }
    const a = rpParseCandleFile(ascii.join('\n')), b = rpParseCandleFile(mt.join('\n')), c = rpParseCandleFile(duka.join('\n'));
    return { a: a.length, a0: a[0].time, aO: a[1].open, b: b.length, b1: b[1].time - b[0].time, bC: b[0].close, c: c.length, c0: c[0].time, tf: rpGuessTf(c),
      names: ['DAT_ASCII_EURUSD_M1_2024.csv', 'EURUSD_Candlestick_1_M_BID_01.01.2024-31.01.2024.csv', 'FX_EURUSD, 5.csv', 'DAT_MT_XAUUSD_M1_202401.csv', 'EURUSD_M5_202401020000.csv'].map(rpSymbolFromName) };
  });
  assert.equal(r.a, 60); assert.equal(r.a0, Date.UTC(2024, 0, 2, 22, 0) / 1000); assert.equal(r.aO, 1.1001);   // 17:00 New York (UTC−5) = 22:00 UTC
  assert.equal(r.b, 60); assert.equal(r.b1, 60); assert.equal(r.bC, 1.1);
  assert.equal(r.c, 60); assert.equal(r.c0, Date.UTC(2024, 0, 2, 22, 0) / 1000); assert.equal(r.tf, '1m');
  assert.deepEqual(r.names, ['EURUSD', 'EURUSD', 'EURUSD', 'XAUUSD', 'EURUSD']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('backtest replay : calendrier de la date de départ (mois, année, jour, heure, raccourcis)', async () => {
  const { page, ctx, errors } = await openJournal({ journal: 'bt', seed: {} });
  await goto(page, 'replay');
  await page.click('#rp-start-btn');
  assert.equal(await page.locator('#rp-dp').isVisible(), true);
  await page.selectOption('#rp-dp select[aria-label="Année"]', '2024');
  await page.selectOption('#rp-dp select[aria-label="Mois"]', '2');
  await page.click('#rp-dp .rp-dp-day:text-is("15")');
  await page.selectOption('#rp-dp select[aria-label="Heure"]', '14');
  await page.selectOption('#rp-dp select[aria-label="Minutes"]', '30');
  assert.equal(await page.inputValue('#rp-start'), '2024-03-15T14:30');
  assert.match(await page.locator('#rp-start-txt').innerText(), /^15\/03\/2024\s+14:30$/);
  await page.click('#rp-dp .rp-dp-ok');
  assert.equal(await page.locator('#rp-dp').isVisible(), false);
  // Raccourci « 1 mois » et jours futurs non sélectionnables
  await page.click('#rp-start-btn');
  await page.click('#rp-dp .rp-dp-quick button:text-is("1 mois")');
  const want = await page.evaluate(() => localDateStr(new Date(Date.now() - 30 * 86400000)));
  assert.equal((await page.inputValue('#rp-start')).slice(0, 10), want);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#rp-dp').isVisible(), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('backtest replay : outils de dessin façon TradingView, positions longue / courte et ordres depuis le graphique', async () => {
  const { page, ctx, errors } = await openJournal({ journal: 'bt', seed: { bt_account: '10000' }, time: NOW });
  await mockBinance(page);
  await goto(page, 'replay');
  await page.evaluate(v => rpSetStart(v), '2026-06-01T09:00');
  await page.click('text=Lancer le replay');
  await page.waitForSelector('#rp-app:not([hidden]) #rp-chart canvas');
  const box = await page.locator('#rp-chart').boundingBox();
  const at = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
  // Ligne de tendance (glisser-déposer)
  await page.click('.rp-tool[data-tool=trend]');
  let [x1, y1] = at(0.2, 0.7), [x2, y2] = at(0.5, 0.3);
  await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 6 }); await page.mouse.up();
  // Rectangle (clic, puis clic)
  await page.click('.rp-tool[data-tool=rect]');
  [x1, y1] = at(0.3, 0.2); [x2, y2] = at(0.4, 0.3);
  await page.mouse.click(x1, y1); await page.mouse.move(x2, y2, { steps: 3 }); await page.mouse.click(x2, y2);
  // Ligne horizontale au raccourci Alt+H
  await page.keyboard.press('Alt+KeyH');
  assert.equal(await page.evaluate(() => RPD.tool), 'hline');
  [x1, y1] = at(0.3, 0.85); await page.mouse.click(x1, y1);
  let d = await page.evaluate(() => RP.drawings.map(x => x.type));
  assert.deepEqual(d, ['trend', 'rect', 'hline']);
  assert.equal(await page.evaluate(() => RPD.tool), 'cursor', 'retour au curseur après un dessin');
  // Le dessin sélectionné : barre de style (couleur), puis suppression au clavier et annulation.
  assert.equal(await page.locator('#rp-stylebar').isVisible(), true);
  await page.click('#rp-stylebar .rp-sw >> nth=1');
  assert.equal(await page.evaluate(() => RP.drawings[2].color), '#f23645');
  await page.keyboard.press('Delete');
  assert.equal(await page.evaluate(() => RP.drawings.length), 2);
  await page.keyboard.press('Control+KeyZ');
  assert.equal(await page.evaluate(() => RP.drawings.length), 3);
  // Déplacer la ligne de tendance (glisser son corps)
  const before = await page.evaluate(() => RP.drawings[0].pts[0].p);
  const mid = await page.evaluate(() => { const d = RP.drawings[0], a = rpdXY(d.pts[0]), b = rpdXY(d.pts[1]); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; });
  await page.mouse.move(box.x + mid.x, box.y + mid.y); await page.mouse.down(); await page.mouse.move(box.x + mid.x, box.y + mid.y + 50, { steps: 5 }); await page.mouse.up();
  assert.ok(await page.evaluate(() => RP.drawings[0].pts[0].p) < before, 'ligne déplacée vers le bas');
  // Position longue : stop à 1,5 × ATR, objectif 2R, puis ordre réel depuis l'outil.
  await page.click('.rp-tool[data-tool=long]');
  const cur = await page.evaluate(() => { const c = rpCur(); return { x: rpdLX(RP.cursor), y: rpdY(c.close) }; });
  await page.mouse.click(box.x + cur.x, box.y + cur.y);
  const pos = await page.evaluate(() => { const d = RP.drawings.at(-1); return { type: d.type, rr: Math.abs(d.tp - d.pts[0].p) / Math.abs(d.pts[0].p - d.sl) }; });
  assert.equal(pos.type, 'long'); assert.ok(Math.abs(pos.rr - 2) < 0.01, 'RR 2 : ' + pos.rr);
  await page.click('#rp-stylebar >> text=Inverser');
  assert.equal(await page.evaluate(() => RP.drawings.at(-1).type), 'short');
  await page.click('#rp-stylebar >> text=Passer cet ordre');
  assert.equal(await page.evaluate(() => RP.positions.length + RP.orders.length), 1);
  // Boutons Vente / Achat du graphique : position au marché avec stop et objectif par défaut.
  await page.click('#rp-quick .rp-q.buy');
  const p = await page.evaluate(() => { const p = RP.positions.find(x => x.side === 'long'); return p && { sl: p.sl < p.entry, tp: p.tp > p.entry, risk: p.risk0 }; });
  assert.ok(p && p.sl && p.tp, 'achat avec stop et objectif');
  assert.ok(Math.abs(p.risk - 100) < 5, 'risque ≈ 1 % : ' + p.risk);
  // Clic droit sous le prix : achat limite.
  const low = await page.evaluate(() => rpdY(rpCur().close - 300));
  await page.mouse.click(box.x + box.width * 0.4, box.y + low, { button: 'right' });
  assert.equal(await page.locator('#rp-menu').isVisible(), true);
  await page.click('#rp-menu >> text=/Acheter limite à/');
  assert.equal(await page.evaluate(() => RP.orders.some(o => o.type === 'limit' && o.side === 'long')), true);
  // Les dessins sont gardés avec la séance (rechargement).
  await page.evaluate(() => DB.flush());
  await page.reload(); await mockBinance(page);
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  await goto(page, 'replay');
  await page.click('#rp-resume >> text=Reprendre');
  await page.waitForSelector('#rp-app:not([hidden]) #rp-chart canvas');
  assert.deepEqual(await page.evaluate(() => RP.drawings.map(x => x.type)), ['trend', 'rect', 'hline', 'short']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('backtest replay : graphique façon TradingView (légende, types, indicateurs) et lignes d\'ordres cliquables', async () => {
  const { page, ctx, errors } = await openJournal({ journal: 'bt', seed: { bt_account: '10000' }, time: NOW });
  await mockBinance(page);
  await goto(page, 'replay');
  await page.evaluate(v => rpSetStart(v), '2026-06-01T09:00');
  await page.click('text=Lancer le replay');
  await page.waitForSelector('#rp-app:not([hidden]) #rp-chart canvas');
  // Légende OHLC + volume
  assert.match(await page.locator('#rp-legend').innerText(), /BTC\/USDT\s*·\s*M5\s*·\s*Binance\s+O\s*[\d\s ,]+H/);
  assert.match(await page.locator('#rp-legend').innerText(), /Vol/);
  // Indicateur MME 21 depuis le menu, valeur dans la légende ; pas de futur dans le calcul.
  await page.click('#rp-ind-btn');
  await page.fill('#rp-modal .rp-pick-q', 'exponentielle');
  await page.click('#rp-modal .rp-pick-it:visible');
  assert.match(await page.locator('#rp-legend').innerText(), /MME 21\s+[\d\s ,]+/);
  const ema = await page.evaluate(() => { const x = RP.inds.find(i => i.id === 'ema'); return { n: RPC_S.cache[x.uid].ma.length, cur: RP.cursor }; });
  assert.equal(ema.n, ema.cur + 1);
  // Types de graphique
  for (const t of ['Heikin Ashi', 'Ligne', 'Bougies']) {
    await page.click('#rp-type-btn'); await page.click('#rp-dd-type >> text=' + t);
  }
  assert.equal(await page.evaluate(() => RP.chartType), 'candles');
  // Unité de temps en boutons
  await page.click('#rp-tfs >> text=15m');
  assert.equal(await page.evaluate(() => RP.interval), '15m');
  // Position via le bouton ACHAT, puis lignes d'ordres : étiquette, « +TP » absent (TP déjà là), retrait du TP par ×, ajout par +TP.
  await page.click('#rp-quick .rp-q.buy');
  const id = await page.evaluate(() => RP.positions[0].id);
  const hit = async (key, part) => page.evaluate(([k, p]) => { rpdRefresh(); return null; }, [key, part]).then(() => page.waitForTimeout(50)).then(() => page.evaluate(([k, p]) => { const h = RPD.olHits.find(x => x.key === k && x.part === p); return h && { x: h.x + h.w / 2, y: h.y + h.h / 2 }; }, [key, part]));
  const box = await page.locator('#rp-chart').boundingBox();
  let h = await hit(id + '-tp', 'close');
  assert.ok(h, 'étiquette TP avec ×');
  await page.mouse.click(box.x + h.x, box.y + h.y);
  assert.equal(await page.evaluate(() => RP.positions[0].tp), null);
  h = await hit(id + '-e', 'add');
  await page.mouse.click(box.x + h.x, box.y + h.y);
  const pos = await page.evaluate(() => { const p = RP.positions[0]; return { rr: (p.tp - p.entry) / (p.entry - p.sl) }; });
  assert.ok(Math.abs(pos.rr - 2) < 0.05, '+TP à 2R : ' + pos.rr);
  // Glisser l'étiquette du stop vers le haut : stop remonté.
  const sl0 = await page.evaluate(() => RP.positions[0].sl);
  h = await hit(id + '-sl', 'body');
  await page.mouse.move(box.x + h.x, box.y + h.y); await page.mouse.down(); await page.mouse.move(box.x + h.x, box.y + h.y - 30, { steps: 5 }); await page.mouse.up();
  assert.ok(await page.evaluate(() => RP.positions[0].sl) > sl0, 'stop remonté');
  // × sur la position : fermée et enregistrée.
  h = await hit(id + '-e', 'close');
  await page.mouse.click(box.x + h.x, box.y + h.y);
  assert.equal(await page.evaluate(() => RP.positions.length), 0);
  assert.equal(await page.evaluate(() => RP.history.length), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('backtest replay : panneaux d\'indicateurs (RSI, MACD) modifiables, 2 graphiques, plein écran, couleurs et modèles de dessin', async () => {
  const { page, ctx, errors } = await openJournal({ journal: 'bt', seed: { bt_account: '10000' }, time: NOW, viewport: { width: 1500, height: 950 } });
  await mockBinance(page);
  await goto(page, 'replay');
  await page.evaluate(v => rpSetStart(v), '2026-06-01T09:00');
  await page.click('text=Lancer le replay');
  await page.waitForSelector('#rp-app:not([hidden]) #rp-chart canvas');
  // Le graphique occupe la hauteur de l'écran.
  const h = await page.evaluate(() => document.querySelector('.rp-chart-card').getBoundingClientRect().height);
  assert.ok(h >= 780, 'graphique haut : ' + h);
  // RSI dans un panneau sous le graphique, avec sa légende.
  await page.click('#rp-ind-btn');
  await page.fill('#rp-modal .rp-pick-q', 'rsi');
  await page.click('#rp-modal .rp-pick-it:visible');
  await page.waitForSelector('#rp-panes .rp-pane-ind canvas');
  assert.match(await page.locator('#rp-panes .rp-pane-lg').innerText(), /RSI 14\s+\d+,\d\d/);
  // Réglages : longueur 7, couleur, niveau 70 → 75.
  await page.hover('#rp-panes .rp-lg-ind');
  await page.click('#rp-panes .rp-lg-b[title="Paramètres"]');
  await page.fill('#rp-modal [data-in=len]', '7');
  await page.click('#rp-modal >> text=Style');
  await page.fill('#rp-modal [data-lv="0"]', '75');
  await page.click('#rp-modal >> text=OK');
  const rsi = await page.evaluate(() => { const x = RP.inds.find(i => i.id === 'rsi'); return { len: x.p.len, lv: x.lv[0].v, v: RPC_S.cache[x.uid].rsi.at(-1) }; });
  assert.equal(rsi.len, 7); assert.equal(rsi.lv, 75); assert.ok(rsi.v > 0 && rsi.v <= 100);
  assert.match(await page.locator('#rp-panes .rp-pane-lg').innerText(), /RSI 7/);
  // MACD : second panneau ; l'échelle de temps n'est affichée que sous le dernier.
  await page.click('#rp-ind-btn'); await page.fill('#rp-modal .rp-pick-q', 'macd'); await page.click('#rp-modal .rp-pick-it:visible');
  assert.equal(await page.locator('#rp-panes .rp-pane-ind').count(), 2);
  // Lecture : les panneaux suivent, sans futur.
  await page.evaluate(() => rpStep(5));
  const sync = await page.evaluate(() => { const x = RP.inds.find(i => i.id === 'macd'); return RPC_S.cache[x.uid].macd.length === RP.cursor + 1; });
  assert.ok(sync);
  // Masquer puis retirer le RSI.
  await page.evaluate(() => rpiToggle(RP.inds.find(i => i.id === 'rsi').uid));
  assert.equal(await page.locator('#rp-panes .rp-pane-ind').count(), 1);
  await page.evaluate(() => rpiRemove(RP.inds.find(i => i.id === 'rsi').uid));
  assert.equal(await page.evaluate(() => RP.inds.some(i => i.id === 'rsi')), false);
  // Deux graphiques : unité supérieure construite avec les bougies déjà jouées seulement.
  await page.click('button[title="Disposition des graphiques"]');
  await page.click('#rp-dd-layout >> text=Deux graphiques');
  await page.waitForSelector('#rp-second:not([hidden]) canvas');
  const two = await page.evaluate(() => { const d = RPC_2.s.data(), last = d[d.length - 1]; return { tf: RPC_2.tf[0], close: last.close, cur: rpCur().close }; });
  assert.equal(two.tf, '30m'); assert.equal(two.close, two.cur);
  await page.evaluate(() => rpStep(3));
  assert.equal(await page.evaluate(() => { const d = RPC_2.s.data(); return d[d.length - 1].close === rpCur().close; }), true);
  // Panneau d'ordre masqué, plein écran (Échap pour sortir).
  await page.click('#rp-panel-btn');
  assert.equal(await page.locator('#rp-ticket').isVisible(), false);
  await page.click('#rp-panel-btn');
  await page.click('#rp-fs-btn');
  assert.equal(await page.evaluate(() => document.getElementById('rp-app').classList.contains('rp-fs')), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.getElementById('rp-app').classList.contains('rp-fs')), false);
  // Couleurs du graphique (gardées pour toutes les séances).
  await page.click('button[title="Paramètres du graphique"]');
  await page.locator('#rp-modal [data-st=up]').evaluate(el => { el.value = '#00ff00'; });
  await page.click('#rp-modal >> text=OK');
  assert.equal(await page.evaluate(() => JSON.parse(DB.getItem('g_rp_style')).up), '#00ff00');
  assert.equal(await page.evaluate(() => RP_SERIES.options().upColor), '#00ff00');
  // Modèle de dessin : style par défaut pour les prochaines lignes horizontales.
  await page.evaluate(() => { RPD.tool = 'hline'; });
  const box = await page.locator('#rp-chart').boundingBox();
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.5);
  await page.click('#rp-stylebar .rp-sw >> nth=4');
  await page.click('#rp-stylebar .rp-sb-tpl');
  await page.click('#rp-tpl-dd >> text=Utiliser ce style');
  await page.evaluate(() => { RPD.tool = 'hline'; });
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.7);
  assert.equal(await page.evaluate(() => RP.drawings.at(-1).color), '#9c27b0');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// Twelve Data simulé : EUR/USD, marché fermé le week-end, réponses au format de /time_series.
async function mockTwelve(page, calls) {
  await page.route(/api\.twelvedata\.com\/time_series/, route => {
    const u = new URL(route.request().url());
    calls && calls.push(Object.fromEntries(u.searchParams));
    if (u.searchParams.get('apikey') !== 'cle-test') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 401, message: 'invalid key', status: 'error' }) });
    const sec = { '1min': 60, '5min': 300, '15min': 900, '30min': 1800, '1h': 3600, '4h': 14400, '1day': 86400 }[u.searchParams.get('interval')];
    const t0 = Date.parse(u.searchParams.get('start_date').replace(' ', 'T') + 'Z') / 1000, t1 = Date.parse(u.searchParams.get('end_date').replace(' ', 'T') + 'Z') / 1000;
    const values = [];
    for (let t = Math.ceil(t0 / sec) * sec; t <= t1 && values.length < 5000; t += sec) {
      const d = new Date(t * 1000).getUTCDay(); if (d === 0 || d === 6) continue;
      const o = 1.08 + 0.002 * Math.sin(t / 7000), c = 1.08 + 0.002 * Math.sin((t + sec) / 7000);
      values.push({ datetime: new Date(t * 1000).toISOString().slice(0, 19).replace('T', ' '), open: o.toFixed(5), high: (Math.max(o, c) + 0.0002).toFixed(5), low: (Math.min(o, c) - 0.0002).toFixed(5), close: c.toFixed(5) });
    }
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(values.length ? { meta: { symbol: u.searchParams.get('symbol') }, values, status: 'ok' } : { code: 400, message: 'No data is available on the specified dates.', status: 'error' }) });
  });
}

test('backtest replay : forex en direct via Twelve Data (clé gratuite), EUR/USD sans fichier', async () => {
  const { page, ctx, errors } = await openJournal({ journal: 'bt', seed: { bt_account: '10000' }, time: NOW });
  const calls = [];
  await mockTwelve(page, calls);
  await goto(page, 'replay');
  // EUR/USD dans la liste ; l'encart de clé apparaît, frais adaptés au forex.
  await page.selectOption('#rp-symbol', 'EURUSD');
  assert.equal(await page.locator('#rp-td').isVisible(), true);
  assert.equal(await page.inputValue('#rp-fee'), '0.002');
  await page.evaluate(v => rpSetStart(v), '2026-06-03T10:00');
  // Sans clé : message clair, pas d'appel.
  await page.click('text=Lancer le replay');
  assert.equal(calls.length, 0);
  // Mauvaise clé : erreur lisible.
  await page.fill('#rp-td-key', 'mauvaise');
  await page.click('text=Lancer le replay');
  await page.waitForSelector('#rp-setup-msg .tone-red');
  assert.match(await page.locator('#rp-setup-msg').innerText(), /Clé Twelve Data refusée/);
  // Bonne clé : le marché se charge comme pour la crypto.
  await page.fill('#rp-td-key', 'cle-test');
  await page.click('text=Lancer le replay');
  await page.waitForSelector('#rp-app:not([hidden]) #rp-chart canvas');
  assert.match(await page.locator('#rp-info').innerText(), /EUR\/USD\s+M5[\s\S]*1,0\d{4}/);
  assert.ok(await page.evaluate(() => RPC[RP.cursor].time < Date.parse('2026-06-03T10:00') / 1000), 'pas de futur');
  const last = calls.at(-1);
  assert.equal(last.symbol, 'EUR/USD'); assert.equal(last.interval, '5min'); assert.equal(last.timezone, 'UTC');
  assert.equal(await page.evaluate(() => DB.getItem('g_td_key')), 'cle-test');
  // Lecture longue : la suite se charge toute seule (week-end enjambé).
  const n0 = await page.evaluate(() => RPC.length);
  await page.evaluate(async () => { for (let i = 0; i < 12; i++) { rpStep(100); await new Promise(r => setTimeout(r, 30)); } });
  await page.waitForFunction(n => RPC.length > n, n0);
  // Position en lots et pips.
  await page.click('#rp-ticket >> text=proposer');
  assert.match(await page.locator('#rp-ticket-sum').innerText(), /lot[\s\S]*pips/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('break-even visibles dans le calendrier, ses tableaux semaine / mois et le bilan journalier', async () => {
  const tr = [T({ id: 1, date: '2026-06-15', res: 'TP', pnl: 2, pnlEur: 200 }), T({ id: 2, date: '2026-06-15', res: 'BE', pnl: 0, pnlEur: 0 }), T({ id: 3, date: '2026-06-15', res: 'SL', pnl: -1, pnlEur: -100 }), T({ id: 4, date: '2026-06-16', res: 'BE', pnl: 0, pnlEur: 0 })];
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: tr }, time: Date.parse('2026-06-20T12:00:00Z') });
  await goto(page, 'calendrier');
  const cells = await page.evaluate(() => [...document.querySelectorAll('.cal-win')].map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  assert.ok(cells.includes('1✓ 1✗ 1 BE · 50 %'), cells.join(' | '));
  assert.ok(cells.includes('0✓ 0✗ 1 BE'), 'jour avec seulement un BE');
  assert.match(await page.locator('#rr-week-table').innerText(), /4\s*\(1✓ 1✗ 2 BE\)/);
  await page.evaluate(() => { showPage('bilan', document.querySelector('.nav-item[data-page=bilan]')); const s = document.getElementById('bilan-date-select'); s.value = '2026-06-15'; renderBilan(); });
  assert.match(await page.locator('.bl-kpis').innerText(), /BE\s+1\s+Win Rate\s+50 %/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('journal des trades groupé par jour par défaut, choix gardé', async () => {
  const tr = [T({ id: 1, date: '2026-06-15' }), T({ id: 2, date: '2026-06-15', res: 'SL', pnl: -1, pnlEur: -50 }), T({ id: 3, date: '2026-06-16' })];
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: tr } });
  await goto(page, 'trades');
  assert.equal(await page.locator('#tbody .day-group-row').count(), 2);
  assert.equal(await page.getAttribute('#btn-group-day', 'aria-pressed'), 'true');
  await page.click('#btn-group-day');
  assert.equal(await page.locator('#tbody .day-group-row').count(), 0);
  await page.evaluate(() => DB.flush());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  await goto(page, 'trades');
  assert.equal(await page.locator('#tbody .day-group-row').count(), 0, 'dégroupé gardé');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Paramètres : guide d\'utilisation (une section par page du menu) et page des raccourcis', async () => {
  const { page, ctx, errors } = await openJournal({ journal: 'bt', seed: { bt_trades: [T({ id: 1 })] } });
  await goto(page, 'parametres');
  await page.click('.set-tab[data-set=guide]');
  assert.equal(await page.locator('#accounts-card').isVisible(), false);
  // Chaque page du menu (tous comptes confondus) a sa section dans le guide : à compléter à chaque nouvelle page.
  const missing = await page.evaluate(() => [...document.querySelectorAll('.page[id^="page-"]')].map(p => p.id.slice(5)).filter(id => !GUIDE.some(s => s.page === id)));
  assert.deepEqual(missing, [], 'pages sans section dans le guide');
  assert.ok(await page.locator('.gd-sec').count() >= 15);
  await page.fill('#guide-q', 'Fibonacci');
  assert.equal(await page.locator('.gd-sec').count(), 1);
  assert.match(await page.locator('.gd-sec').innerText(), /Backtest replay/);
  await page.click('.gd-sec >> text=Ouvrir la page');
  assert.equal(await page.evaluate(() => currentPage()), 'replay');
  // Raccourcis : groupes, dont les outils de dessin lus dans RPD_TOOLS ; onglet gardé.
  await goto(page, 'parametres');
  await page.click('.set-tab[data-set=keys]');
  const keys = await page.locator('#keys-list').innerText();
  assert.match(keys, /Saisie rapide/); assert.match(keys, /Alt \+ F\s+Retracement de Fibonacci/); assert.match(keys, /Lecture \/ pause/);
  await page.evaluate(() => DB.flush());
  await page.reload(); await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  await goto(page, 'parametres');
  assert.equal(await page.locator('#keys-list').isVisible(), true);
  // Depuis l'aide « ? » : lien vers la page complète.
  await page.evaluate(() => showSettingsTab('settings'));
  await page.keyboard.press('?');
  await page.click('#shortcuts-help >> text=Tous les raccourcis');
  assert.equal(await page.locator('#keys-list').isVisible(), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});
