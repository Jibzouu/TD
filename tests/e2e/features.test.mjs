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
  const chip = page.locator('#summary-banner .insight').first();
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
  assert.equal(await txt('#dn-trades-pct'), '40 %', '2 gagnants sur 5 trades clos');
  assert.equal(await txt('#dn-days-pct'), '67 %', '2 journées gagnantes sur 3');
  assert.equal(await txt('#dn-weeks-pct'), '50 %', 'semaine 24 gagnante, semaine 25 perdante');
  assert.match(await page.locator('#dn-trades-legend').innerText(), /Break-even\s+1/);
  assert.ok(await page.evaluate(() => Object.keys(donutInsts).length === 3), '3 graphiques dessinés');
  await page.selectOption('#gf-asset', 'EUR/USD');
  assert.equal(await txt('#dn-trades-pct'), '40 %');
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

test('chiffres fiables : Edge Finder, coût réel des erreurs, calculateur relié au Scaling, win rate hors BE', async () => {
  const extra = [T({ id: 2000, date: '2026-06-16', res: 'TP', pnl: 1, pnlEur: 100, mfe: 300, mistakes: ['Sorti trop tôt'] }),
    T({ id: 2001, date: '2026-06-16', res: 'BE', pnl: 0, pnlEur: 0 })];
  const sc = { version: 4, start: 1000, riskPct: 3, step: 1000, cushion1: 500, goal: 10000, auto: true, riskSteps: [] };
  const { page, ctx, errors } = await openJournal({ time: NOW, seed: { tj_trades: [...extra, ...sampleTrades()], tj_account: '1000', tj_scaling: sc } });
  // Win rate : BE comptés comme non gagnants, valeur hors BE affichée à côté.
  assert.match(await page.locator('#dn-trades-sub').innerText(), /hors BE 68 %/);   // 21 G / (21 G + 10 P)
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
