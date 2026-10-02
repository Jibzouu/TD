// Tests de bout en bout du journal (navigateur réel). Lancer : npm run test:e2e
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openJournal, closeBrowser, goto, T } from './helpers.mjs';

const TMP = mkdtempSync(join(tmpdir(), 'journal-e2e-'));
after(closeBrowser);

test('démarrage : pages, plan et watchlist initialisés, aucune erreur', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1 }), T({ id: 2, res: 'SL', pnl: -1, pnlEur: -50 })] } });
  assert.ok(await page.locator('#checklist-entry .checklist-item').count() > 0);
  assert.ok(await page.locator('#watchlist-grid tbody tr').count() > 0);
  await goto(page, 'trades');
  assert.equal(await page.locator('#tbody tr.trade-row').count(), 2);
  assert.ok(await page.evaluate(() => typeof Chart !== 'undefined' && !!yearProgressChartInst), 'Chart.js intégré : graphiques rendus sans internet');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('stockage IndexedDB : migration, persistance sans localStorage, au-delà de 5 Mo', async () => {
  const { page, ctx } = await openJournal({ seed: { tj_trades: [T({ id: 1 })] } });
  assert.equal(await page.evaluate(() => DB.mode), 'indexeddb');
  await page.evaluate(() => { trades.unshift({ id: 2, date: '2026-09-02', asset: 'DAX 40', res: 'SL', pnl: -1, pnlEur: -50 }); save(); DB.setItem('big_test', 'x'.repeat(7 * 1024 * 1024)); });
  await page.evaluate(() => DB.flush());
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  assert.deepEqual(await page.evaluate(() => trades.map(t => t.id)), [2, 1]);
  assert.equal(await page.evaluate(() => (DB.getItem('big_test') || '').length), 7 * 1024 * 1024);
  await ctx.close();
});

test('dates locales, semaine ISO et thèmes', async () => {
  const { page, ctx, errors } = await openJournal({ time: new Date('2026-09-28T22:30:00Z'), seed: { tj_trades: [T({ id: 5, date: '2026-09-28' })] } });
  assert.equal(await page.inputValue('#f-date'), '2026-09-29');
  await goto(page, 'calendrier');
  assert.match(await page.locator('#rr-week-table').innerText(), /S40 · dès le 28\/09/);
  await goto(page, 'parametres');
  assert.equal(await page.locator('#theme-preset-grid .theme-swatch').count(), 12);
  await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(() => document.body.classList.contains('sidebar-open')), 'Échap ne ferme pas la sidebar sur ordinateur');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('prop firm : perte journalière dans le verdict, actifs dynamiques, bilan en €', async () => {
  const trades = [T({ id: 11, date: '2026-09-01', pnlEur: 300, asset: 'BTCUSD' }), T({ id: 12, date: '2026-09-02', res: 'SL', pnl: -1, pnlEur: -150, asset: 'BTCUSD' }),
    T({ id: 13, date: '2026-09-03', pnlEur: 900 }), T({ id: 14, date: '2026-09-04', pnlEur: 100 }), T({ id: 15, date: '2026-09-05', pnlEur: 100 })];
  const { page, ctx, errors } = await openJournal({ journal: 'pf', seed: { pf_trades: trades, pf_account: '10000', pf_dd_limit_pct: '1', pf_pf_consistency_on: '0' } });
  await goto(page, 'propfirm');
  const txt = await page.locator('#propfirm-status').innerText();
  assert.match(txt, /Perte journalière max dépassée/); assert.match(txt, /2026-09-02/);
  assert.ok(await page.evaluate(() => !!pfEquityChartInst), 'graphique de progression du challenge');
  await goto(page, 'stats');
  assert.match(await page.locator('#stats-assets-tbody').innerText(), /BTCUSD/);
  await page.evaluate(() => selectBilanDate('2026-09-03'));
  await page.waitForTimeout(150);
  const bilan = await page.locator('#bilan-content').innerText();
  assert.match(bilan, /P&L \(€\)/); assert.match(bilan, /900/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('sécurité : aucune exécution de code injecté (trades et backup piégés)', async () => {
  const evil = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
  const trades = [];
  for (let i = 0; i < 12; i++) trades.push(T({ id: 100 + i, desc: evil, setup: evil, tags: [evil], review: evil, res: i % 3 ? 'TP' : 'SL', pnl: i % 3 ? 2 : -1, pnlEur: i % 3 ? 100 : -50, date: '2026-08-' + String(10 + i).padStart(2, '0') }));
  trades.push({ id: 999, date: '2026-08-30', asset: evil, res: 'SL', entry: evil, exit: evil, size: evil, entryPrice: evil, rr: evil, pnl: -1, pnlEur: -10 });
  const { page, ctx } = await openJournal({ seed: { tj_trades: trades } });
  for (const p of ['dashboard', 'trades', 'stats', 'calendrier', 'bilan', 'revue']) await goto(page, p);
  await page.evaluate(() => { openTradeDetail(999); selectBilanDate('2026-08-30'); });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__xss || 0), 0);
  const bak = join(TMP, 'evil.json');
  writeFileSync(bak, JSON.stringify({ trades: [{ id: 'abc', date: '2026-08-01', res: 'SL', entry: evil, tf: evil, pnl: -1 }], planData: { entryItems: [evil], risk: [[evil, evil]] } }));
  await page.evaluate(() => closeTradeDetail());
  await page.setInputFiles('#import-file', bak);
  await page.waitForTimeout(150);
  await page.click('#modal-confirm');
  await page.waitForTimeout(250);
  await page.evaluate(() => { showPage('plan', null); openTradeDetail(trades[0].id); selectBilanDate('2026-08-01'); });
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__xss || 0), 0);
  await ctx.close();
});

test('tilt meter : écart mesuré depuis la sortie du trade perdant', async () => {
  const { page, ctx } = await openJournal({ seed: { tj_trades: [T({ id: 21, date: '2026-09-10', entry: '10:00', exit: '10:40', res: 'SL', pnl: -1, pnlEur: -50 }), T({ id: 22, date: '2026-09-10', entry: '10:45', exit: '11:00' })] } });
  const r = await page.evaluate(() => { const x = computeTiltTrades(); return { n: x.lossesWithFollowup, f: x.flagged.map(f => f.gapMin) }; });
  assert.deepEqual(r, { n: 1, f: [5] });
  await ctx.close();
});

test('checklist stable, trade sans pnl, plan corrompu, renommage d’erreur', async () => {
  const trades = [T({ id: 31, checklist: [0, 1, 2, 3, 4, 5] }), T({ id: 32, res: 'OPEN', pnlEur: undefined })];
  delete trades[1].pnl;
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: trades, tj_plan: '{corrompu' } });
  await goto(page, 'trades');
  assert.equal(await page.locator('#tbody tr.trade-row').count(), 2);
  assert.equal(await page.locator('#checklist-entry .checklist-item').count(), 6);
  assert.ok(await page.evaluate(() => tradeChecklistComplete(trades.find(t => t.id === 31))));
  await page.evaluate(() => removeChecklistItem('entryItems', 0, 'ce'));
  assert.deepEqual(await page.evaluate(() => ({ c: tradeChecklistComplete(trades.find(t => t.id === 31)), l: tradeChecklistLabels(trades.find(t => t.id === 31)).length })), { c: true, l: 6 });
  await page.evaluate(() => { trades.find(t => t.id === 31).mistakes = ['Stop déplacé']; save(); renameLabelInTrades('mistakes', 'Stop déplacé', 'SL déplacé'); });
  assert.equal(await page.evaluate(() => trades.find(t => t.id === 31).mistakes[0]), 'SL déplacé');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('échec d’écriture : la suppression est annulée', async () => {
  const { page, ctx } = await openJournal({ seed: { tj_trades: [T({ id: 41 }), T({ id: 42 })] } });
  await page.evaluate(() => { const orig = DB.setItem; DB.setItem = function (k, v) { if (k === 'tj_trades') throw new DOMException('full', 'QuotaExceededError'); return orig.call(DB, k, v); }; });
  await page.evaluate(() => deleteTrade(41));
  await page.click('#modal-confirm');
  assert.equal(await page.evaluate(() => trades.length), 2);
  await ctx.close();
});

test('import CSV : « ; », virgule décimale, milliers, conversion USD', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_import_fx_rate: '0.9' } });
  const csv1 = join(TMP, 'broker-fr.csv'), csv2 = join(TMP, 'tv-list-of-trades.csv');
  writeFileSync(csv1, '﻿Date;Symbole;Sens;PnL EUR\n05/09/2026;EURUSD;Vente;"12,5"\n06/09/2026;EURUSD;Achat;-1 234,50\n');
  writeFileSync(csv2, 'Trade #,Type,Date/Time,Signal,Price USD,P&L net USD\n1,Exit long,2026-09-07 10:30,TP,1.1,100\n1,Entry long,2026-09-07 10:00,Breakout,1.0,100\n');
  await page.setInputFiles('#csv-import-file', [csv1, csv2]);
  await page.waitForTimeout(400);
  const t = await page.evaluate(() => trades.map(t => ({ d: t.date, e: t.pnlEur, r: t.res, c: t.ccy, s: t.setup })));
  assert.deepEqual(t.find(x => x.d === '2026-09-05'), { d: '2026-09-05', e: 12.5, r: 'TP', c: 'EUR', s: undefined });
  assert.equal(t.find(x => x.d === '2026-09-06').e, -1234.5);
  const tv = t.find(x => x.d === '2026-09-07');
  assert.equal(tv.e, 90); assert.equal(tv.c, 'USD'); assert.equal(tv.s, 'Breakout');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('filtre global : période, actif, setup ; solde de début de période', async () => {
  const trades = [T({ id: 1, date: '2026-06-01', pnlEur: 500, asset: 'DAX 40', setup: 'OB' }), T({ id: 2, date: '2026-09-20', pnlEur: 100, setup: 'OB' }),
    T({ id: 3, date: '2026-09-25', res: 'SL', pnl: -1, pnlEur: -50, setup: 'Range' })];
  const { page, ctx, errors } = await openJournal({ time: new Date('2026-09-29T10:00:00Z'), seed: { tj_trades: trades, tj_account: '10000' } });
  await page.selectOption('#gf-period', '30d');
  assert.equal(await page.evaluate(() => viewTrades().length), 2);
  assert.equal(await page.evaluate(() => equitySeries().start), 10500, 'la courbe part du solde au début de la période');
  assert.match(await page.locator('#gf-summary').innerText(), /2 trades sur 3/);
  await page.selectOption('#gf-setup', 'OB');
  assert.equal(await page.evaluate(() => viewTrades().map(t => t.id).join()), '2');
  await goto(page, 'trades');
  assert.equal(await page.locator('#tbody tr.trade-row').count(), 1);
  await goto(page, 'propfirm');   // non filtré : page masquée hors journal PropFirm → retour dashboard
  await page.click('#gf-reset');
  assert.equal(await page.evaluate(() => viewTrades().length), 3);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('parcours complet : ajout d’un trade avec setup, tags et 2 captures, toutes les pages', async () => {
  const { page, ctx, errors } = await openJournal();
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjDAGNzYAAB1uAxEu4BwIAAAAAElFTkSuQmCC';
  await page.evaluate(() => openTradePanel());
  await page.evaluate(src => { currentImgs = [src, src]; renderUploadThumbs(); openFormSectionById('section-context'); openFormSectionById('section-notes'); }, png);
  await page.selectOption('#f-asset', 'EUR/USD');
  await page.selectOption('#f-res', 'TP');
  await page.fill('#f-pnleur', '120');
  await page.fill('#f-setup', 'OB + FVG');
  await page.fill('#f-tags', 'news, #contre-tendance, news');
  await page.fill('#f-review', 'Bonne patience.');
  await page.click('#trade-submit-btn');
  const t = await page.evaluate(() => trades[0]);
  assert.equal(t.setup, 'OB + FVG');
  assert.deepEqual(t.tags, ['news', 'contre-tendance']);
  assert.equal(t.imgs.length, 2); assert.equal(t.review, 'Bonne patience.');
  assert.ok(t.uid && t.createdAt > 0 && t.updatedAt >= t.createdAt, 'identifiant universel et dates');
  assert.equal(t.cap, undefined, 'captures rangées à part, plus dans le trade');
  assert.equal(await page.evaluate(() => tradeImages(trades[0]).length), 2);
  assert.equal(t.checklistTotal, 6);
  for (const p of ['trades', 'stats', 'calendrier', 'bilan', 'scaling', 'plan', 'watchlist', 'export', 'parametres', 'revue', 'dashboard']) await goto(page, p);
  for (const st of ['timing', 'analyses', 'behavior', 'advanced', 'overview']) await page.evaluate(s => showStatsSubtab(s), st);
  await page.evaluate(() => toggleCalView());
  assert.deepEqual(errors, []);
  await ctx.close();
});
