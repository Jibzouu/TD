// Tests de non-régression des bugs corrigés lors de l'analyse d'octobre 2026 : fusion qui perdait des trades,
// captures perdues après « Annuler la dernière importation », échec prop firm passé inaperçu, profit factor incohérent,
// sessions des trades manuels décalées, checklist effacée à la modification, R d'un short sans sens choisi.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openJournal, closeBrowser, goto, T, getBrowser, APP_URL } from './helpers.mjs';

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

// ── Deuxième passe ──────────────────────────────────────────────────────────────────────────────────

test('un R aberrant (faute de frappe) ne bloque plus l’ouverture du journal, et l’unité R n’est plus doublée', async () => {
  const seed = { tj_trades: [T({ id: 1, pnl: 1e9 }), T({ id: 2, pnl: -1 }), T({ id: 3, pnl: 2 }), T({ id: 4, pnl: 1 }), T({ id: 5, pnl: -1 })] };
  const { page, ctx, errors } = await openJournal({ seed });
  const stats = await page.locator('#r-distribution-stats').innerText();
  assert.doesNotMatch(stats, /RR/);
  assert.ok(await page.evaluate(() => rDistChartInst.data.labels.length <= 61));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('import : deux trades identiques d’un même fichier sont gardés, le réimport n’ajoute rien, dates AAAA/MM/JJ', async () => {
  const { page, ctx, errors } = await openJournal();
  const csv = '﻿Date;Symbole;Sens;PnL EUR\n2026/09/01;EURUSD;Achat;-100\n2026/09/01;EURUSD;Achat;-100\n2026/09/02;EURUSD;Vente;150\n';
  const file = { name: 'backtest.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) };
  await page.setInputFiles('#csv-import-file', file);
  await page.waitForFunction(() => trades.length === 3);
  assert.deepEqual(await page.evaluate(() => trades.map(t => t.date).sort()), ['2026-09-01', '2026-09-01', '2026-09-02']);
  await page.setInputFiles('#csv-import-file', file);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => trades.length), 3, 'réimport : aucun doublon');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('export CSV du journal → réimport : montants en €, R visé / réalisé, heures, setup, frais et notes gardés', async () => {
  const seed = { tj_trades: [T({ id: 1, res: 'SL', pnl: -1, rr: 2, pnlEur: -100, setup: 'Break; retest', fees: 3.5, desc: 'note "x"', tags: ['news'], mistakes: ['Entrée trop tôt'], entryPrice: 1.1, slPrice: 1.099 })] };
  const { page, ctx, errors } = await openJournal({ seed });
  const csv = await page.evaluate(() => tradesToCSV(trades));
  await page.evaluate(() => TradeStore.replaceAll([]));
  await page.setInputFiles('#csv-import-file', { name: 'journal-trades.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.waitForFunction(() => trades.length === 1);
  const t = await page.evaluate(() => { const t = trades[0]; return [t.date, t.entry, t.exit, t.res, t.rr, t.pnl, t.pnlEur, t.fees, t.setup, t.desc, t.tags, t.mistakes, t.entryPrice, t.slPrice]; });
  assert.deepEqual(t, ['2026-09-01', '10:00', '10:30', 'SL', 2, -1, -100, 3.5, 'Break; retest', 'note "x"', ['news'], ['Entrée trop tôt'], 1.1, 1.099]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('journal ouvert dans deux onglets : l’onglet resté en arrière est figé et n’écrase rien', async () => {
  const b = await getBrowser(), ctx = await b.newContext();
  await ctx.addInitScript(() => { if (!localStorage.getItem('tj_onboarded')) { localStorage.setItem('journal_active', 'tj'); localStorage.setItem('tj_onboarded', '1'); localStorage.setItem('g_lessons_off', '1'); localStorage.setItem('g_fx_off', '1'); } });
  const open = async () => { const p = await ctx.newPage(); await p.route('https://fonts.googleapis.com/**', r => r.abort()); await p.goto(APP_URL); await p.waitForFunction(() => document.documentElement.classList.contains('app-ready')); return p; };
  const a = await open(), c = await open();
  assert.equal(await a.evaluate(() => !!document.getElementById('db-stale')), false, 'ouvrir un 2e onglet ne fige pas le 1er');
  await a.evaluate(() => { TradeStore.add({ date: '2026-09-01', asset: 'A', res: 'TP', pnlEur: 1 }, []); return DB.flush(); });
  await c.waitForSelector('#db-stale');
  await c.evaluate(() => { TradeStore.add({ date: '2026-09-02', asset: 'B', res: 'TP', pnlEur: 1 }, []); return DB.flush(); });
  const d = await open();
  assert.deepEqual(await d.evaluate(() => trades.map(t => t.asset)), ['A'], 'le trade de l’onglet A n’a pas été écrasé');
  await ctx.close();
});

test('revue hebdo : une réponse tapée juste avant de changer de semaine reste dans sa semaine', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1, date: '2026-06-15' })] }, time: new Date('2026-06-17T12:00:00') });
  await goto(page, 'revue');
  await page.fill('#rv-good', 'patience');
  await page.evaluate(() => revueStep(-1));   // changement de semaine avant la fin du délai d'enregistrement
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => loadReviews());
  assert.equal(r['2026-06-15'].good, 'patience');
  assert.equal(r['2026-06-08'], undefined);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('backup et synchro : revue hebdo, défi 30 jours, médailles et règles prop firm sont inclus et fusionnés', async () => {
  const seed = { tj_weekly_reviews: { '2026-06-08': { good: 'A', updatedAt: 10 } }, tj_challenge: { start: '2026-06-01' }, tj_medals: { first: '2026-06-02' } };
  const { page, ctx, errors } = await openJournal({ seed });
  const s = await page.evaluate(() => backupData().settings);
  assert.ok(s.tj_weekly_reviews && s.tj_challenge && s.tj_medals);
  const n = await page.evaluate(() => mergeSettingsMeta({
    tj_weekly_reviews: { v: JSON.stringify({ '2026-06-15': { goal: 'B', updatedAt: 20 } }), t: 5 },
    tj_medals: { v: JSON.stringify({ first: '2026-05-01', trades100: '2026-06-10' }), t: 5 }
  }));
  assert.equal(n, 2);
  const after = await page.evaluate(() => [loadReviews(), JSON.parse(DB.getItem('tj_medals'))]);
  assert.deepEqual(Object.keys(after[0]).sort(), ['2026-06-08', '2026-06-15'], 'semaines des deux appareils');
  assert.deepEqual(after[1], { first: '2026-05-01', trades100: '2026-06-10' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('prop firm sans perte max journalière (Apex) : une journée rouge ne fait pas échouer le challenge', async () => {
  const seed = { pf_account: '50000', pf_dd_limit_pct: '1', pf_trades: [T({ id: 1, date: '2026-06-10', res: 'SL', pnlEur: -900 }), T({ id: 2, date: '2026-06-11', res: 'TP', pnlEur: 1200 })] };
  const { page, ctx, errors } = await openJournal({ journal: 'pf', seed: Object.assign({ g_journals: [{ id: 'tj', name: 'Live', type: 'live' }, { id: 'pf', name: 'PF', type: 'propfirm' }] }, seed) });
  await page.evaluate(() => { window.confirm = () => true; });
  assert.equal(await page.evaluate(() => computePropFirmStatus().dailyOk), false, 'avec la règle : 900 € > 1 % de 50 000');
  await goto(page, 'propfirm');
  await page.evaluate(() => applyPfPreset('apex50'));
  assert.equal(await page.evaluate(() => computePropFirmStatus().dailyOk), true);
  assert.equal(await page.locator('#pf-daily-on').isChecked(), false);
  assert.match(await page.locator('#propfirm-status').innerText(), /pas de limite journalière/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('calendrier d’un journal en R : totaux en R, meilleur jour signalé', async () => {
  const seed = { tj_trades: [T({ id: 1, date: '2026-06-02', pnlEur: null, pnl: 2 }), T({ id: 2, date: '2026-06-03', pnlEur: null, pnl: -1, res: 'SL' })] };
  const { page, ctx, errors } = await openJournal({ seed, time: new Date('2026-06-17T12:00:00') });
  await goto(page, 'calendrier');
  const txt = await page.locator('#cal-monthly-stats').innerText();
  assert.match(txt, /\+1,0R/);
  assert.doesNotMatch(await page.locator('#cal-grid').innerText(), /0 €/);
  assert.equal(await page.locator('#cal-grid .cal-badge[title="Meilleur jour du mois"]').count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('bilan : humeur moyenne 4,5 en vert, RR lisible', async () => {
  const seed = { tj_trades: [T({ id: 1, date: '2026-06-17', emotion: 4, rr: 1.6666667 }), T({ id: 2, date: '2026-06-17', emotion: 5 })] };
  const { page, ctx, errors } = await openJournal({ seed, time: new Date('2026-06-17T12:00:00') });
  await goto(page, 'bilan');
  const cls = await page.locator('.bl-kpis .kpi', { hasText: 'Humeur' }).locator('.kpi-val').getAttribute('class');
  assert.match(cls, /tone-green/);
  assert.match(await page.locator('.bl-table').innerText(), /1,67R/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('watchlist : un actif avec apostrophe se modifie et se retire', async () => {
  const { page, ctx, errors } = await openJournal();
  await goto(page, 'watchlist');
  await page.evaluate(() => addWatchAsset("L'Oréal"));
  const row = page.locator('.watch-table tr', { hasText: "L'Oréal" });
  await row.locator('select').selectOption('Bullish');
  assert.equal(await page.evaluate(() => watchData.entries["L'Oréal"].biais), 'Bullish');
  await page.locator('.watch-table tr', { hasText: "L'Oréal" }).locator('.del-btn').click();
  assert.equal(await page.evaluate(() => watchData.assets.some(a => a.name === "L'Oréal")), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('détecteur d’edge : pas d’« edge le plus fort » quand tous les segments perdent', async () => {
  const seed = { tj_trades: Array.from({ length: 12 }, (_, i) => T({ id: i + 1, res: 'SL', pnl: -1, pnlEur: -50, date: '2026-06-' + String(2 + i).padStart(2, '0') })) };
  const { page, ctx, errors } = await openJournal({ seed });
  await page.evaluate(() => { showPage('stats', document.querySelector('.nav-item[data-page=stats]')); showStatsSubtab('analyses'); });
  await page.evaluate(() => renderEdgeFinder());
  assert.match(await page.locator('#edge-finder-body').innerText(), /Aucun segment gagnant/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('formats : pas de « -0 € » ni de « −0,00R » pour un montant minuscule', async () => {
  const { page, ctx } = await openJournal();
  assert.deepEqual(await page.evaluate(() => [fmtEUR(-0.4), fmtEUR(-0.004, false, 2), fmtR(-0.001), fmtR(-0.04, 1)]), ['0 €', '0,00 €', '0,00R', '0,0R']);
  await ctx.close();
});

test('journal groupé par jour : les totaux d’une journée coupée par la pagination restent complets', async () => {
  const seed = { tj_trades: Array.from({ length: 30 }, (_, i) => T({ id: i + 1, date: i < 20 ? '2026-06-10' : '2026-06-09', entry: '10:' + String(i).padStart(2, '0'), exit: '', pnlEur: 10 })) };
  const { page, ctx, errors } = await openJournal({ seed });
  await goto(page, 'trades');
  const rows = await page.locator('.day-group-row').allInnerTexts();
  assert.match(rows.find(r => /9 juin/.test(r)), /10 trade\(s\).*\+100 €/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('menu sur téléphone : glisser une page fait défiler le menu (seule la poignée déplace)', async () => {
  const { page, ctx } = await openJournal({ viewport: { width: 390, height: 844 } });
  const ta = await page.evaluate(() => [getComputedStyle(document.querySelector('.nav-item')).touchAction, getComputedStyle(document.querySelector('.nav-item .nav-grip')).touchAction]);
  assert.deepEqual(ta, ['pan-y', 'none']);
  await ctx.close();
});

// ── Troisième passe ─────────────────────────────────────────────────────────────────────────────────

const SCALING = { version: 4, start: 10000, riskPct: 1, step: 1000, cushionN: 0, cushion1: 0, goal: 100000, current: 10000, auto: true, riskSteps: [] };
test('perte max du jour : % du palier du Scaling atteint en début de journée, partout la même', async () => {
  const seed = { tj_account: '10000', tj_dd_limit_pct: '2', tj_scaling: SCALING,
    tj_trades: [T({ id: 1, date: '2026-06-10', pnlEur: 1500 }), T({ id: 2, date: '2026-06-17', res: 'SL', pnlEur: -100 })] };
  const { page, ctx, errors } = await openJournal({ seed, time: new Date('2026-06-17T14:00:00') });
  const r = await page.evaluate(() => [dayLossLimit('2026-06-10').amount, dayLossLimit('2026-06-17').amount, rkGuard().lim.day, document.getElementById('dd-limit-label').textContent]);
  assert.deepEqual(r, [200, 220, 220, 'limite 220 € (2 %)'], 'départ 10 000 € → 200 € ; palier P1 (11 000 €) → 220 €');
  assert.match(await page.locator('#dd-limit-label').getAttribute('title'), /palier P1/);
  // Sans plan de Scaling : % du solde en début de journée.
  assert.equal(await page.evaluate(() => { DB.removeItem(JP + 'scaling'); scalingState = null; invalidateViews(); return dayLossLimit('2026-06-17').amount; }), 230);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('prop firm : seuil trailing plafonné au capital de départ (Topstep, Apex)', async () => {
  const seed = { g_journals: [{ id: 'tj', name: 'Live', type: 'live' }, { id: 'pf', name: 'PF', type: 'propfirm' }], pf_account: '50000', pf_pf_maxdd_pct: '4', pf_pf_dd_type: 'trailing_eod',
    pf_trades: [T({ id: 1, date: '2026-06-10', pnlEur: 4000 }), T({ id: 2, date: '2026-06-11', res: 'SL', pnlEur: -1500 })] };
  const { page, ctx, errors } = await openJournal({ journal: 'pf', seed });
  assert.equal(await page.evaluate(() => computePropFirmStatus().floor), 52000, 'sans plafond : plus haut 54 000 − 2 000');
  await page.evaluate(() => { window.confirm = () => true; applyPfPreset('topstep50'); });
  const s = await page.evaluate(() => { const s = computePropFirmStatus(); return [s.ddLock, s.floor]; });
  assert.deepEqual(s, [true, 50000]);
  assert.equal(await page.locator('#pf-dd-lock').isChecked(), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('import : « 1,234 » vaut 1 234 dans un export américain, 1,234 dans un export français', async () => {
  const { page, ctx, errors } = await openJournal();
  const us = 'Date,Symbol,Side,PnL EUR\n2026-09-01,EURUSD,Buy,"1,234"\n2026-09-02,EURUSD,Sell,-12.50\n';
  await page.setInputFiles('#csv-import-file', { name: 'us.csv', mimeType: 'text/csv', buffer: Buffer.from(us) });
  await page.waitForFunction(() => trades.length === 2);
  assert.deepEqual(await page.evaluate(() => trades.map(t => t.pnlEur).sort((a, b) => a - b)), [-12.5, 1234]);
  await page.evaluate(() => TradeStore.replaceAll([]));
  const fr = 'Date;Symbole;Sens;PnL EUR\n01/09/2026;EURUSD;Achat;1,234\n02/09/2026;EURUSD;Vente;-12,50\n';
  await page.setInputFiles('#csv-import-file', { name: 'fr.csv', mimeType: 'text/csv', buffer: Buffer.from(fr) });
  await page.waitForFunction(() => trades.length === 2);
  assert.deepEqual(await page.evaluate(() => trades.map(t => t.pnlEur).sort((a, b) => a - b)), [-12.5, 1.23]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('synchro : un compte supprimé ne revient pas', async () => {
  const seed = { g_journals: [{ id: 'tj', name: 'Live', type: 'live' }], g_journals_deleted: [{ id: 'a1b2c', at: 5 }] };
  const { page, ctx, errors } = await openJournal({ seed });
  const n = await page.evaluate(() => mergeSettingsMeta({ g_journals: { v: JSON.stringify([{ id: 'tj', name: 'Live', type: 'live' }, { id: 'a1b2c', name: 'Supprimé', type: 'live' }, { id: 'zz9', name: 'Nouveau', type: 'backtest' }]), t: 9 } }));
  assert.equal(n, 1);
  assert.deepEqual(await page.evaluate(() => JSON.parse(DB.getItem('g_journals')).map(a => a.id)), ['tj', 'zz9']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

const BT = { g_journals: [{ id: 'tj', name: 'Live', type: 'live' }, { id: 'bt', name: 'BT', type: 'backtest' }] };
const candles = (start, n, price) => { let csv = 'time,open,high,low,close,volume\n', t = start; for (let i = 0; i < n; i++, t += 900) { const p = price(i); csv += t + ',' + p + ',' + (p + price(0) * 0.0003) + ',' + (p - price(0) * 0.0003) + ',' + p + ',10\n'; } return csv; };
test('replay : le graphique tient au passage à l’heure d’hiver', async () => {
  const { page, ctx, errors } = await openJournal({ journal: 'bt', seed: BT });
  await goto(page, 'replay');
  const csv = candles(Date.UTC(2025, 9, 25, 12) / 1000, 97, () => 1.1);
  await page.evaluate(async c => { document.getElementById('rp-start').value = '2025-10-26T03:00'; await rpImportFile({ files: [new File([c], 'EURUSD_M15.csv')], value: '' }); }, csv);
  await page.waitForTimeout(500);
  await page.evaluate(() => { for (let i = 0; i < 20; i++) rpStep(1); });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('replay USD/JPY : compte en dollars, montant en € juste dans le journal', async () => {
  const { page, ctx, errors } = await openJournal({ journal: 'bt', seed: Object.assign({ bt_import_fx_rate: '0.9' }, BT) });
  await goto(page, 'replay');
  const csv = candles(Date.UTC(2025, 5, 2) / 1000, 400, i => 150 + (i > 320 ? (i - 320) * 0.05 : 0));
  const r = await page.evaluate(async c => {
    document.getElementById('rp-balance').value = '10000'; document.getElementById('rp-start').value = '2025-06-05T08:00';
    await rpImportFile({ files: [new File([c], 'USDJPY_M15.csv')], value: '' });
    await new Promise(r => setTimeout(r, 400));
    RP_TICKET.riskMode = 'pct'; RP_TICKET.riskValue = 1;
    const c0 = rpCur().close;
    rpSubmit({ side: 'long', type: 'market', sl: c0 - 0.5, tp: c0 + 1 });
    const risk = RP.positions[0].risk0 / c0;
    for (let i = 0; i < 120 && RP.positions.length; i++) rpStep(1);
    return { acc: rpAccCcy(), risk, t: { pnl: trades[0].pnl, eur: trades[0].pnlEur, ccy: trades[0].ccy } };
  }, csv);
  assert.equal(r.acc, 'USD');
  assert.ok(Math.abs(r.risk - 100) < 1, '1 % de 10 000 $ = 100 $ de risque (et non 100 ¥)');
  assert.ok(r.t.eur > 100 && r.t.eur < 200, 'environ +1,8R × 100 $ × 0,9 : ' + r.t.eur);
  assert.equal(r.t.ccy, 'USD');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('replay : annuler après un simple clic ou une nouvelle séance ne ramène rien d’étranger', async () => {
  const { page, ctx, errors } = await openJournal({ journal: 'bt', seed: BT });
  await goto(page, 'replay');
  const csv = candles(Date.UTC(2025, 5, 2) / 1000, 400, () => 1.1);
  const n = await page.evaluate(async c => {
    await rpImportFile({ files: [new File([c], 'EURUSD_M15.csv')], value: '' });
    await new Promise(r => setTimeout(r, 300));
    RP.drawings.push(rpdNew('hline', [{ t: rpCur().time, p: 1.1 }])); rpdPush();
    await rpImportFile({ files: [new File([c], 'EURUSD_M15.csv')], value: '' });
    await new Promise(r => setTimeout(r, 300));
    rpdUndo();
    return RP.drawings.length;
  }, csv);
  assert.equal(n, 0, 'les dessins de l’ancienne séance ne reviennent pas');
  await ctx.close();
});
