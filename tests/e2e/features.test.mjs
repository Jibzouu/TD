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

test('chiffres fiables : Détecteur d’edge, coût réel des erreurs, calculateur relié au Scaling, win rate hors BE', async () => {
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
