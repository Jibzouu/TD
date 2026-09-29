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
  assert.match(await chip.getAttribute('title'), /\+9,1R de gains -3,0R de pertes = \+6,1R · 5 trades/);
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

test('scaling : coussin minimum global (€ ou pertes), personnalisé par palier, zones conservées', async () => {
  const sc = { version: 2, start: 1000, riskPct: 3, mode: 'round', roundTo: 100, params: { round: 1000, cushion: 10, capital: 10, risk: 10 },
    goal: 5000, current: 1850, auto: false, tableOpen: true, paramsOpen: true, showZones: true,
    zones: [{ id: 1, from: 3000, to: 3700, label: 'Coussin', color: 'green' }] };
  const { page, ctx, errors } = await openJournal({ seed: { tj_scaling: sc } });
  await goto(page, 'scaling');
  const N = x => x.replace(/\D/g, '');
  const trig = () => page.$$eval('#sc-table tbody tr', trs => trs.map(tr => tr.children[3].textContent.replace(/\D/g, '')));
  // Sans coussin minimum : augmentation au palier, sauf la zone dessinée (P2 → 3 700 €).
  assert.deepEqual((await trig()).slice(1, 4), ['2 000 €', '3 700 €', '4 000 €'].map(N).map(s => s.replace(/ /g, ' ')).map((s, i) => (i === 1 ? s : s)).map(s => s), 'avant réglage');
  await page.fill('#sc-mincush', '500'); await page.dispatchEvent('#sc-mincush', 'change'); await page.waitForTimeout(60);
  assert.deepEqual((await trig()).slice(1, 4), ['2 500 €', '3 700 €', '4 500 €'].map(N), '500 € au-dessus de chaque palier, la zone plus large l’emporte');
  assert.match(await page.locator('#sc-table tbody tr').nth(1).innerText(), /8,3 pertes/);
  // En pertes : 5 pertes au nouveau risque (P1 60 € → 2 300 €, P3 120 € → 4 600 €).
  await page.selectOption('#sc-mincush-unit', 'loss');
  assert.equal(await page.inputValue('#sc-mincush'), '5');
  await page.fill('#sc-mincush', '5'); await page.dispatchEvent('#sc-mincush', 'change'); await page.waitForTimeout(60);
  assert.deepEqual((await trig()).slice(1, 4), ['2 300 €', '3 700 €', '4 600 €'].map(N));
  // Personnalisé pour P1 : 10 pertes → 2 600 €, mis en évidence, conservé après rechargement.
  const p1 = page.locator('#sc-table tbody tr').nth(1).locator('input[aria-label^="Coussin"]');
  await p1.fill('10'); await p1.dispatchEvent('change'); await page.waitForTimeout(60);
  assert.equal((await trig())[1], N('2 600 €'));
  assert.ok(await page.locator('#sc-table tbody tr').nth(1).locator('.sc-cush-in.own').count() === 1);
  await page.reload(); await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  await goto(page, 'scaling');
  assert.equal((await trig())[1], N('2 600 €'), 'réglage du palier sauvegardé');
  assert.match(await page.locator('#sc-params-summary').textContent(), /coussin min 5 pertes/);
  // Vider la case : retour au réglage global.
  const p1b = page.locator('#sc-table tbody tr').nth(1).locator('input[aria-label^="Coussin"]');
  await p1b.fill(''); await p1b.dispatchEvent('change'); await page.waitForTimeout(60);
  assert.equal((await trig())[1], N('2 300 €'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('scaling : risque dégressif par palier, hérité par les paliers suivants', async () => {
  const sc = { version: 2, start: 1000, riskPct: 3, mode: 'round', roundTo: 100, params: { round: 1000, cushion: 10, capital: 10, risk: 10 },
    goal: 6000, current: 1850, auto: false, tableOpen: true, paramsOpen: true, zones: [] };
  const { page, ctx, errors } = await openJournal({ seed: { tj_scaling: sc } });
  await goto(page, 'scaling');
  const D = x => x.replace(/\D/g, '');
  const col = c => page.$$eval('#sc-table tbody tr', (trs, c) => trs.map(tr => tr.children[c].textContent.replace(/\D/g, '')), c);
  assert.deepEqual((await col(4)).slice(1, 6), ['6000', '9000', '12000', '15000', '18000'], 'risque € à 3 % partout');
  // 2 % à partir de P4 (5 000 €) : P4 = 100 €, P5 hérite (120 €) ; la baisse est signalée.
  const p4 = page.locator('#sc-table tbody tr').nth(4).locator('input[aria-label^="Risque"]');
  await p4.fill('2'); await p4.dispatchEvent('change'); await page.waitForTimeout(60);
  assert.deepEqual((await col(4)).slice(1, 6), ['6000', '9000', '12000', '10000', '12000']);
  assert.equal(D(await page.locator('#sc-table tbody tr').nth(4).locator('td').nth(6).textContent()), '2000');
  assert.ok(await page.locator('#sc-table tbody tr').nth(4).locator('td').nth(6).locator('.tone-amber').count() === 1, 'baisse du risque € en orange');
  assert.match(await page.locator('#sc-rule-text').textContent(), /Risque dégressif : 2,00 % à partir de 5\s000/);
  await page.reload(); await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  await goto(page, 'scaling');
  assert.equal((await col(4))[5], '12000', 'réglage conservé');
  // Vider la case : retour à 3 %.
  const p4b = page.locator('#sc-table tbody tr').nth(4).locator('input[aria-label^="Risque"]');
  await p4b.fill(''); await p4b.dispatchEvent('change'); await page.waitForTimeout(60);
  assert.equal((await col(4))[4], '15000');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('scaling : pas des paliers qui grandit par tranche', async () => {
  const sc = { version: 2, start: 1000, riskPct: 3, mode: 'round', roundTo: 100, params: { round: 1000, cushion: 10, capital: 10, risk: 10 },
    goal: 20000, current: 1850, auto: false, tableOpen: true, paramsOpen: true, zones: [] };
  const { page, ctx, errors } = await openJournal({ seed: { tj_scaling: sc } });
  await goto(page, 'scaling');
  const caps = () => page.$$eval('#sc-table tbody tr', trs => trs.map(tr => tr.children[1].textContent.replace(/\D/g, '')));
  assert.equal((await caps()).length, 20, 'départ + 19 paliers de 1 000 €');
  // À partir de P4 (5 000 €) : pas de 2 500 € → 7 500, 10 000, 12 500…
  const row = k => page.locator('#sc-table tbody tr').nth(k);
  await row(4).locator('input[aria-label^="Pas"]').fill('2500'); await row(4).locator('input[aria-label^="Pas"]').dispatchEvent('change'); await page.waitForTimeout(60);
  assert.deepEqual((await caps()).slice(3, 9), ['4000', '5000', '7500', '10000', '12500', '15000']);
  assert.match(await row(4).locator('td').nth(2).innerText(), /\+50,0 %/, 'effort affiché : 5 000 → 7 500 = +50 %');
  // À partir de 10 000 € : pas de 5 000 € → 15 000, 20 000.
  await row(6).locator('input[aria-label^="Pas"]').fill('5000'); await row(6).locator('input[aria-label^="Pas"]').dispatchEvent('change'); await page.waitForTimeout(60);
  assert.deepEqual((await caps()).slice(5), ['7500', '10000', '15000', '20000']);
  assert.match(await page.locator('#sc-rule-text').textContent(), /Pas des paliers : 1\s000 € au départ, 2\s500 € à partir de 5\s000 €, 5\s000 € à partir de 10\s000 €/);
  await page.reload(); await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  await goto(page, 'scaling');
  assert.deepEqual((await caps()).slice(5), ['7500', '10000', '15000', '20000'], 'réglage conservé');
  // Vider la case de P4 : on revient au pas de 1 000 € jusqu'à 10 000 €.
  await row(4).locator('input[aria-label^="Pas"]').fill(''); await row(4).locator('input[aria-label^="Pas"]').dispatchEvent('change'); await page.waitForTimeout(60);
  assert.deepEqual((await caps()).slice(4, 12), ['5000', '6000', '7000', '8000', '9000', '10000', '15000', '20000']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('scaling : paliers calculés à partir d’un coussin de N pertes, arrondis à des chiffres ronds', async () => {
  const sc = { version: 2, start: 1000, riskPct: 3, mode: 'round', roundTo: 100, params: { round: 1000, cushion: 10, capital: 10, risk: 10 },
    goal: 30000, current: 1850, auto: false, tableOpen: true, paramsOpen: true, zones: [], minCush: { unit: 'loss', value: 5, by: {} } };
  const { page, ctx, errors } = await openJournal({ seed: { tj_scaling: sc } });
  await goto(page, 'scaling');
  await page.selectOption('#sc-mode', 'cushion'); await page.waitForTimeout(60);
  assert.equal(await page.inputValue('#sc-round'), '-1', 'chiffres ronds proposés par défaut');
  assert.equal(await page.locator('#sc-mincush-field').isVisible(), false, 'coussin minimum masqué : il ferait double emploi');
  const caps = () => page.$$eval('#sc-table tbody tr', trs => trs.map(tr => tr.children[1].textContent.replace(/\D/g, '')));
  assert.deepEqual(await caps(), ['1000', '1500', '2500', '4000', '6000', '9000', '15000', '25000', '30000']);
  // Chaque écart couvre au moins 10 pertes au nouveau risque.
  const losses = await page.$$eval('#sc-table tbody tr .sc-cush-res b', bs => bs.map(b => parseFloat(b.textContent.replace(',', '.'))));
  assert.ok(losses.length === 7 && losses.every(n => n >= 10), 'coussins ≥ 10 pertes : ' + losses);
  // 5 pertes à partir de P3 : 2 500 / 0,85 → 3 000, puis 4 000, 5 000… (hérité).
  const inp = page.locator('#sc-table tbody tr').nth(3).locator('input[aria-label^="Coussin"]');
  await inp.fill('5'); await inp.dispatchEvent('change'); await page.waitForTimeout(60);
  assert.deepEqual((await caps()).slice(0, 6), ['1000', '1500', '2500', '3000', '4000', '5000']);
  assert.match(await page.locator('#sc-rule-text').textContent(), /au moins 10 pertes d'affilée/);
  assert.deepEqual(errors, []);
  await ctx.close();
});
