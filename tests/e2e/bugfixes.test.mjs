// Tests de non-régression des bugs corrigés lors de l'analyse d'octobre 2026 : fusion qui perdait des trades,
// captures perdues après « Annuler la dernière importation », échec prop firm passé inaperçu, profit factor incohérent,
// sessions des trades manuels décalées, checklist effacée à la modification, R d'un short sans sens choisi.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openJournal, closeBrowser, goto, T } from './helpers.mjs';

after(closeBrowser);
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('fusion : deux trades distincts qui se ressemblent ne sont ni fondus ni écrasés', async () => {
  const { page, ctx, errors } = await openJournal();
  const r = await page.evaluate(() => {
    const mk = (uid, o) => Object.assign({ id: 1, uid, asset: 'EUR/USD', dir: 'Long', res: 'SL', pnl: -1, rr: 1, pnlEur: -100, date: '2026-09-01', createdAt: 1000, updatedAt: 1000 }, o);
    // 1) Deux pertes identiques venues de l'autre appareil (uids différents) : les deux arrivent.
    const a = TradeStore.merge([mk('remote001'), mk('remote002')], null, []);
    const n1 = trades.length;
    // 2) Trade local X ; le fichier contient X ET un autre trade Y de même date / actif / sens / P&L : X reste intact, Y s'ajoute.
    TradeStore.replaceAll([mk('localxx01', { asset: 'NQ', entry: '09:00' })]);
    const b = TradeStore.merge([mk('localxx01', { asset: 'NQ', entry: '09:00' }), mk('remoteyy2', { asset: 'NQ', entry: '09:00', desc: 'autre', updatedAt: 5000 })], null, []);
    const n2 = trades.length, x = trades.find(t => t.uid === 'localxx01');
    // 3) Le même trade importé sur les deux appareils (uids différents, même clé broker) n'est toujours pas doublé.
    TradeStore.replaceAll([mk('importA01', { tvKey: 'mt5:42' })]);
    const c = TradeStore.merge([mk('importB01', { tvKey: 'mt5:42' })], null, []);
    return { a, n1, b, n2, xDesc: x && x.desc, c, n3: trades.length };
  });
  assert.equal(r.a.added, 2); assert.equal(r.n1, 2);
  assert.equal(r.b.added, 1); assert.equal(r.n2, 2); assert.equal(r.xDesc, undefined, 'le trade local n\'est pas écrasé par un autre');
  assert.equal(r.c.added, 0); assert.equal(r.n3, 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('annuler la dernière importation : les captures reviennent avec les trades', async () => {
  const { page, ctx, errors } = await openJournal();
  const r = await page.evaluate(png => {
    TradeStore.add({ date: '2026-09-01', asset: 'EUR/USD', res: 'TP', pnlEur: 10 }, [png]);
    createSafetySnapshot('avant import de backup');
    TradeStore.replaceAll([{ id: 5, date: '2026-09-02', asset: 'NQ', res: 'SL', pnlEur: -5 }]);
    TradeStore.replaceAll(loadSafetySnapshot().trades);
    const back = tradeImages(trades[0]).length;
    // Copie de sécurité écartée : les captures qu'elle seule gardait sont libérées.
    createSafetySnapshot('avant import de backup');
    TradeStore.replaceAll([]);
    const kept = ImageStore.allIds().length;
    dismissSafetySnapshot();
    return { back, kept, after: ImageStore.allIds().length };
  }, PNG);
  assert.deepEqual(r, { back: 1, kept: 1, after: 0 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('prop firm : un passage sous le seuil de perte max reste un échec même si le compte est remonté', async () => {
  const seed = {
    pf_account: '10000', pf_pf_enabled: '1', pf_pf_maxdd_pct: '10', pf_pf_dd_type: 'static', pf_dd_limit_pct: '50',
    pf_trades: [T({ id: 2, date: '2026-09-02', res: 'TP', pnlEur: 1500 }), T({ id: 1, date: '2026-09-01', res: 'SL', pnlEur: -1200 })]
  };
  const { page, ctx, errors } = await openJournal({ journal: 'pf', seed });
  const s = await page.evaluate(() => { const s = computePropFirmStatus(); return { breached: s.breached, date: s.breachDate, eq: s.currentEquity }; });
  assert.deepEqual(s, { breached: true, date: '2026-09-01', eq: 10300 });
  await goto(page, 'propfirm');
  assert.match(await page.locator('.pf-verdict').innerText(), /Drawdown maximum dépassé \(01\/09\/2026\)/);
  // Trailing intrajournalier : 10 000 → 10 800 (plancher 9 800) → 9 700 → 10 400 : échec aussi.
  const t = await page.evaluate(() => {
    DB.setItem(JP + 'pf_dd_type', 'trailing_intraday');
    TradeStore.replaceAll([{ id: 1, date: '2026-09-01', entry: '09:00', res: 'TP', pnlEur: 800 }, { id: 2, date: '2026-09-01', entry: '10:00', res: 'SL', pnlEur: -1100 }, { id: 3, date: '2026-09-02', res: 'TP', pnlEur: 700 }]);
    const a = computePropFirmStatus();
    TradeStore.replaceAll([{ id: 1, date: '2026-09-01', res: 'TP', pnlEur: 800 }, { id: 3, date: '2026-09-02', res: 'TP', pnlEur: 700 }]);
    return [a.breached, a.breachDate, computePropFirmStatus().breached];
  });
  assert.deepEqual(t, [true, '2026-09-01', false]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('profit factor du tableau de bord : gains ÷ pertes selon le signe (un BE à −20 € est une perte)', async () => {
  const seed = { tj_trades: [T({ id: 3, res: 'BE', pnl: 0, pnlEur: -20 }), T({ id: 2, res: 'SL', pnl: -1, pnlEur: -100 }), T({ id: 1, res: 'TP', pnl: 2, pnlEur: 200 })] };
  const { page, ctx, errors } = await openJournal({ seed });
  assert.equal(await page.locator('#k-pf').innerText(), '1,67');
  const review = await page.evaluate(() => weekMetrics(trades).pf);
  assert.ok(Math.abs(review - 200 / 120) < 1e-9, 'même valeur que la revue hebdo');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('recalculer les sessions : seuls les trades importés d\'un fichier changent', async () => {
  const seed = {
    tj_tz_offset_hours: '6',
    tj_trades: [T({ id: 1, entry: '10:00', session: 'Londres' }), T({ id: 2, entry: '10:00', session: 'Londres', tvKey: 'EURUSD|1|2', importSource: 'TradingView' }),
      T({ id: 3, entry: '10:00', session: 'Londres', tvKey: 'replay:x', importSource: 'Replay' })]
  };
  const { page, ctx, errors } = await openJournal({ seed });
  await page.evaluate(() => recalcSessions());
  const s = await page.evaluate(() => Object.fromEntries(trades.map(t => [t.id, t.session])));
  assert.deepEqual(s, { 1: 'Londres', 2: 'New York', 3: 'Londres' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('modifier un trade garde les critères et erreurs retirés du Plan depuis, et son nombre de critères', async () => {
  const seed = { tj_trades: [T({ id: 7, checklist: [], checklistLabels: ['Critère supprimé du plan'], checklistTotal: 4, mistakes: ['Erreur retirée'] })] };
  const { page, ctx, errors } = await openJournal({ seed });
  const t = await page.evaluate(() => {
    startEditTrade(7);
    document.getElementById('f-desc').value = 'note corrigée';
    addTrade();
    const t = trades.find(x => x.id === 7);
    return { desc: t.desc, labels: t.checklistLabels, total: t.checklistTotal, mistakes: t.mistakes };
  });
  assert.deepEqual(t, { desc: 'note corrigée', labels: ['Critère supprimé du plan'], total: 4, mistakes: ['Erreur retirée'] });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('saisie avec prix sans sens choisi : un stop au-dessus de l\'entrée donne le R d\'un short', async () => {
  const { page, ctx, errors } = await openJournal();
  const t = await page.evaluate(() => {
    openTradePanel();
    const set = (id, v) => { document.getElementById(id).value = v; };
    set('f-date', '2026-09-03'); set('f-asset', 'EUR/USD'); set('f-res', 'TP');
    set('f-entry-price', '1.1000'); set('f-sl-price', '1.1010'); set('f-exit-price', '1.0980');
    addTrade();
    return { pnl: trades[0].pnl, src: trades[0].rSrc };
  });
  assert.deepEqual(t, { pnl: 2, src: 'prix' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('recherche du tableau : setup, notes et #tags', async () => {
  const seed = { tj_trades: [T({ id: 1, setup: 'Sweep LQ', tags: ['news'] }), T({ id: 2, review: 'trop tôt sur le retest' }), T({ id: 3 })] };
  const { page, ctx, errors } = await openJournal({ seed });
  await goto(page, 'trades');
  const count = async q => { await page.fill('#filter-search', q); return page.locator('#tbl-count').innerText(); };
  assert.equal(await count('sweep'), '1 trade');
  assert.equal(await count('#news'), '1 trade');
  assert.equal(await count('retest'), '1 trade');
  assert.deepEqual(errors, []);
  await ctx.close();
});
