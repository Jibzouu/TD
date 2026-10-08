// Tests de bout en bout des 10 améliorations « en local » : mode simple, coach, mini-leçons, règles prop firms,
// sauvegarde protégée et sauvegarde automatique restaurable, code de verrouillage, saisie téléphone, défi 30 jours,
// import Excel MetaTrader 5, module de synchronisation.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import { openJournal, closeBrowser, goto, T } from './helpers.mjs';
import { makeXlsx } from './xlsx.mjs';

after(closeBrowser);
const visibleNav = page => page.evaluate(() => [...document.querySelectorAll('.nav-item[data-page]:not(.nav-simple-hidden)')].map(b => b.dataset.page));
// Petite image PNG valide (capture photographiée).
function png(w, h) {
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 120)])));
  const ch = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t), d])) >>> 0); return Buffer.concat([len, Buffer.from(t), d, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ch('IHDR', ihdr), ch('IDAT', deflateSync(raw)), ch('IEND', Buffer.alloc(0))]);
}

test('mode simple : menu réduit, pages débloquées par le parcours, tout afficher', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_simple: '1' } });
  assert.deepEqual((await visibleNav(page)).sort(), ['bilan', 'calendrier', 'dashboard', 'export', 'guide', 'parametres', 'risque', 'trades']);
  assert.match(await page.locator('#nav-simple-foot').innerText(), /Mode simple/);
  await page.evaluate(() => rkSetStage(1));
  assert.ok((await visibleNav(page)).includes('stats'));
  assert.match(await page.locator('#toast').innerText(), /Nouvelles pages débloquées : .*Statistiques/);
  await page.evaluate(() => rkSetStage(4));   // Personnalisé : tout est visible
  assert.ok((await visibleNav(page)).includes('playbooks'));
  await page.evaluate(() => rkSetStage(0));
  await page.click('#nav-simple-foot button');
  assert.equal(await page.evaluate(() => DB.getItem(JP + 'simple')), '0');
  assert.ok((await visibleNav(page)).includes('watchlist'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('coach : constats du jour sur le Dashboard, de la journée et de la semaine', async () => {
  const day = '2026-06-17';
  const tr = [T({ id: 1, date: day, entry: '09:00', exit: '09:10', res: 'SL', pnl: -1, pnlEur: -50 }), T({ id: 2, date: day, entry: '09:20', exit: '09:40', res: 'SL', pnl: -1, pnlEur: -50 }), T({ id: 3, date: day, entry: '13:00', res: 'TP', pnl: 2, pnlEur: 100 })];
  const { page, ctx, errors } = await openJournal({ time: new Date('2026-06-17T16:00:00Z'), seed: { tj_trades: tr } });
  await goto(page, 'dashboard');
  assert.match(await page.locator('#coach-dash').innerText(), /Coach : ta journée[\s\S]*1 trade\(s\) de revanche/);
  await goto(page, 'bilan');
  assert.match(await page.locator('#coach-day').innerText(), /revanche/);
  await goto(page, 'revue');
  assert.match(await page.locator('#coach-week').innerText(), /Coach : bilan de la semaine/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mini-leçons : une leçon au bon moment, une seule fois, relisibles dans le Guide', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1, res: 'SL', pnl: -1, pnlEur: -50, rr: 2 })] } });
  await page.evaluate(() => { DB.setItem('g_lessons_off', '0'); checkLessons(); });
  assert.match(await page.locator('.lesson-pop').innerText(), /Perdre fait partie du métier/);
  await page.click('.lesson-pop .btn-primary');
  await page.evaluate(() => checkLessons());
  assert.equal(await page.locator('.lesson-pop').count(), 0, 'déjà vue : pas de deuxième affichage');
  await goto(page, 'guide');
  assert.equal(await page.locator('.gd-lesson').count(), 9);
  await page.click('.gd-lesson >> nth=0');
  assert.match(await page.locator('.lesson-pop').innerText(), /Le R : ton unité de mesure/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('prop firm : règles pré-remplies en un clic', async () => {
  const { page, ctx, errors } = await openJournal({ journal: 'pf' });
  page.on('dialog', d => d.accept());
  await goto(page, 'propfirm');
  await page.selectOption('#pf-preset-select', 'ftmo1');
  assert.deepEqual(await page.evaluate(() => [loadPfSetting('target_pct'), loadPfSetting('maxdd_pct'), loadPfSetting('dd_type'), loadPfSetting('min_days'), loadDDLimitPct()].map(String)), ['10', '10', 'static', '4', '5']);
  assert.equal(await page.inputValue('#pf-target-pct'), '10');
  await page.selectOption('#pf-preset-select', 'topstep50');
  assert.deepEqual(await page.evaluate(() => [loadPfSetting('dd_type'), loadPfSetting('consistency_on'), loadPfSetting('consistency_pct'), loadDDLimitPct()].map(String)), ['trailing_eod', '1', '50', '2']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('sauvegarde protégée par mot de passe et sauvegarde automatique restaurable', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1, asset: 'GOLD' }), T({ id: 2 })] } });
  const sealed = await page.evaluate(async () => JSON.stringify(await JTC.sealText('motdepasse1', JSON.stringify(backupData()))));
  assert.ok(!sealed.includes('GOLD'), 'rien de lisible dans le fichier protégé');
  await page.evaluate(() => { TradeStore.replaceAll([]); renderAll(); });
  const importFile = j => page.evaluate(j => importData({ files: [new File([j], 'b.json')], value: '' }), j);
  const passModal = () => page.waitForFunction(() => document.getElementById('modal').classList.contains('open') && /protégé/.test(document.getElementById('modal-title').textContent));
  await importFile(sealed); await passModal();
  await page.fill('#bk-pass-in', 'faux'); await page.click('#modal-confirm');
  await page.waitForFunction(() => /incorrect/.test(document.getElementById('toast').textContent));
  await page.waitForFunction(() => !document.getElementById('modal').classList.contains('open'));
  await importFile(sealed); await passModal();
  await page.fill('#bk-pass-in', 'motdepasse1'); await page.click('#modal-confirm');
  await page.waitForFunction(() => document.getElementById('modal-title').textContent === 'Importer ce backup ?');
  await page.click('#modal-confirm');
  assert.deepEqual((await page.evaluate(() => trades.map(t => t.asset))).sort(), ['EUR/USD', 'GOLD']);
  // Fichier de la sauvegarde automatique (tous les comptes).
  const full = await page.evaluate(() => JSON.stringify(fullBackupPayload()));
  await page.evaluate(() => { TradeStore.replaceAll([]); renderAll(); });
  await importFile(full);
  await page.waitForFunction(() => /Restaurer la sauvegarde complète/.test(document.getElementById('modal-title').textContent));   // lecture du fichier asynchrone
  await Promise.all([page.waitForNavigation(), page.click('#modal-confirm')]);
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  assert.deepEqual((await page.evaluate(() => trades.map(t => t.asset))).sort(), ['EUR/USD', 'GOLD']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('code de verrouillage : données chiffrées sur le disque, code demandé à l’ouverture', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1, asset: 'GOLD' })] } });
  const disk = () => page.evaluate(() => new Promise(res => { const r = indexedDB.open('journal-trading'); r.onsuccess = () => { const out = []; const c = r.result.transaction('kv').objectStore('kv').openCursor(); c.onsuccess = () => { const x = c.result; if (x) { out.push(JSON.stringify(x.value)); x.continue(); } else { r.result.close(); res(out.join('|')); } }; }; }));
  await goto(page, 'parametres');
  await page.click('#lock-settings .btn-primary');
  await page.fill('#lk-new1', '2468'); await page.fill('#lk-new2', '2468');
  await page.click('#modal-confirm');
  await page.waitForFunction(() => DB.locked && /Code de verrouillage activé/.test(document.getElementById('lock-settings').textContent));
  assert.ok(!(await disk()).includes('GOLD'), 'aucune donnée en clair sur le disque');
  await page.reload();
  await page.waitForSelector('#lock-screen');
  await page.fill('#lock-code', '0000'); await page.click('#lock-go');
  await page.waitForFunction(() => document.getElementById('lock-err').textContent === 'Code incorrect.');
  await page.fill('#lock-code', '2468'); await page.click('#lock-go');
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  assert.deepEqual(await page.evaluate(() => trades.map(t => t.asset)), ['GOLD']);
  assert.equal(await page.evaluate(() => DB.disableLock('2468')), true);
  assert.ok((await disk()).includes('GOLD'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('téléphone : bouton +, actif récent en un toucher, photo de la capture', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1, asset: 'GOLD' }), T({ id: 2, asset: 'NAS100' })] }, viewport: { width: 390, height: 844 } });
  await page.click('#fab-add');
  const chips = await page.locator('.qa-chip').allInnerTexts();
  assert.equal(chips.length, 2);
  await page.click('.qa-chip >> nth=1');
  assert.equal(await page.inputValue('#qa-asset'), chips[1]);
  await page.click('.qa-res .seg-btn[data-res=TP]');
  await page.fill('#qa-pnl', '120');
  await page.setInputFiles('#qa-photo', { name: 'cap.png', mimeType: 'image/png', buffer: png(40, 30) });
  await page.waitForSelector('.qa-thumb img');
  await page.click('#quick-add .btn-primary');
  const t = await page.evaluate(() => ({ a: trades[0].asset, res: trades[0].res, pnl: trades[0].pnlEur, imgs: trades[0].imgs.length }));
  assert.deepEqual(t, { a: chips[1], res: 'TP', pnl: 120, imgs: 1 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('défi 30 jours de discipline et carte « ma semaine »', async () => {
  const day = '2026-06-17';
  const { page, ctx, errors } = await openJournal({ time: new Date('2026-06-17T16:00:00Z'), seed: { tj_trades: [T({ id: 1, date: day, rr: 2, slPrice: 1.1 })] } });
  await goto(page, 'risque');
  await page.click('#rk-challenge .btn-primary');
  assert.match(await page.locator('#rk-challenge').innerText(), /Jour 1 \/ 30/);
  assert.equal(await page.locator('#rk-challenge .ch-cell:not(.ch-legend .ch-cell)').count(), 30);
  const card = await page.evaluate(() => { const c = drawWeekCard(weekCardData()); return [c.width, c.height, weekCardData().n]; });
  assert.deepEqual(card, [1080, 1080, 1]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('import MetaTrader 5 : rapport Excel (.xlsx) lu comme le rapport HTML', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_import_fx_rate: '0.9' } });
  const F = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'mt5-ReportHistory-123456.html');
  const rows = await page.evaluate(b64 => { const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); return htmlTablesToRows(decodeFileBuffer(bin.buffer)).rows; }, readFileSync(F).toString('base64'));
  await page.setInputFiles('#csv-import-file', { name: 'ReportHistory-123456.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: makeXlsx(rows) });
  await page.waitForFunction(() => trades.length === 2);
  const t = await page.evaluate(() => Object.fromEntries(trades.map(t => [t.tvKey, { a: t.asset, dir: t.dir, e: t.pnlEur, f: t.fees, src: t.importSource }])));
  assert.deepEqual(t['mt5:555001'], { a: 'DE40', dir: 'Long', e: 98, f: 2, src: 'MT5' });
  assert.equal(t['mt5:555002'].e, -21);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('synchronisation : un seul point d’entrée, deux appareils identiques après un aller-retour', async () => {
  const store = {};
  const A = await openJournal({ seed: { tj_trades: [T({ id: 1, uid: 'uid-aaa1', asset: 'GOLD' })] } });
  const B = await openJournal({ seed: { tj_trades: [T({ id: 2, uid: 'uid-bbb2', asset: 'DAX' })] } });
  const sync = async (p) => { const res = await p.evaluate(async s => { const ad = memorySyncAdapter(s); const r = await Sync.sync(ad); return { r, s: ad.store }; }, store); Object.assign(store, res.s); return res.r; };
  await sync(A.page);
  const rb = await sync(B.page);
  assert.equal(rb.added, 1);
  await sync(A.page);
  for (const { page } of [A, B]) assert.deepEqual((await page.evaluate(() => trades.map(t => t.asset))).sort(), ['DAX', 'GOLD']);
  assert.deepEqual(A.errors.concat(B.errors), []);
  await A.ctx.close(); await B.ctx.close();
});

test('marque LockIn : logo, titre, accent menthe (accent choisi à la main gardé), logo sur la carte et le rapport', async () => {
  let { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1 })], g_theme: JSON.stringify({ '--preset-key': 'default', '--accent': '#5d6cf6' }) } });
  assert.equal(await page.locator('.brand-row').getAttribute('aria-label'), 'LockIn');
  assert.match(await page.title(), /LockIn/);
  const css = v => page.evaluate(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), v);
  assert.equal(await css('--accent'), '#3ee6a8');
  assert.equal(await css('--on-accent'), '#06281c');
  assert.match(await page.evaluate(() => brandLogoSVG('#000')), /aria-label="LockIn"/);
  // Logo du menu = même tracé que brandLogoSVG (cadenas + mot « lockin »).
  assert.ok(await page.evaluate(() => document.querySelector('.brand-row svg g path').getAttribute('d') === BRAND_WORD_PATH));
  assert.equal(await page.evaluate(() => { const c = drawWeekCard(weekCardData()); return c.width; }), 1080);
  assert.deepEqual(errors, []);
  await ctx.close();
  ({ page, ctx, errors } = await openJournal({ seed: { g_theme: JSON.stringify({ '--accent': '#ff8800' }) } }));
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()), '#ff8800', 'accent personnel gardé');
  await ctx.close();
});

test('thème LockIn : couleurs du logo, touches propres seulement sur ce thème, gardé au rechargement', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1 })] } });
  const css = v => page.evaluate(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), v);
  await goto(page, 'parametres');
  await page.locator('#theme-preset-grid .theme-swatch', { hasText: 'LockIn' }).click();
  assert.equal(await css('--bg'), '#0e1020');
  assert.equal(await css('--accent'), '#3ee6a8');
  assert.ok(await page.evaluate(() => document.body.classList.contains('theme-lockin')));
  // Page active : le petit niveau remplace la poignée de déplacement.
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.nav-item.active .nav-grip')).borderRadius), '99px');
  await page.reload(); await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  assert.ok(await page.evaluate(() => document.body.classList.contains('theme-lockin')), 'gardé au rechargement');
  await page.evaluate(() => applyPreset('default', true));
  assert.equal(await page.evaluate(() => document.body.classList.contains('theme-lockin')), false, 'retiré sur un autre thème');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('effets : LockIn par défaut (et Graphite basculé), ambiance Aurore, jauge niveau à bulle, écrans vides illustrés', async () => {
  let { page, ctx, errors } = await openJournal({ seed: { g_fx_off: '0' } });
  const css = v => page.evaluate(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), v);
  assert.equal(await css('--bg'), '#0e1020', 'thème LockIn au premier lancement');
  assert.deepEqual(await page.evaluate(() => ['theme-lockin', 'bgstyle-aurora', 'texture-on'].map(c => document.body.classList.contains(c))), [true, true, true]);
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('fx-motion')));
  await goto(page, 'trades');
  assert.equal(await page.locator('#page-trades .ui-empty .ui-empty-art').count(), 1, 'écran vide illustré');
  assert.deepEqual(errors, []);
  await ctx.close();
  ({ page, ctx, errors } = await openJournal({ seed: { g_theme: JSON.stringify({ '--preset-key': 'default', '--bg': '#0c0d10', '--bg-style': 'solid' }), g_charter_v3: '1', tj_trades: [T({ id: 1, res: 'SL', pnl: -1, pnlEur: -100, date: new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' }) })] } }));
  assert.equal(await page.evaluate(() => loadThemeObj()['--preset-key']), 'lockin', 'Graphite (ancien thème de départ) → LockIn');
  assert.equal(await page.evaluate(() => loadThemeObj()['--bg-style']), 'solid', 'ambiance choisie gardée');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('fx-motion')), false, 'animations coupées (réglage)');
  const tilt = await page.evaluate(() => parseFloat(document.querySelector('#guard-card .gc-level').style.getPropertyValue('--tilt')));
  assert.ok(tilt > 0, 'une perte aujourd’hui décale la bulle (' + tilt + ')');
  assert.match(await page.locator('#guard-card .gc-level').getAttribute('aria-label'), /Niveau de tilt : \d+ %/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('effets : célébration « Locked in » une fois par jour, chiffres qui défilent jusqu’à la valeur exacte', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { g_fx_off: '0', tj_trades: [T({ id: 1, date: '2026-09-01' })] } });
  await page.waitForTimeout(1800);   // fin de l'ouverture et des chiffres qui défilent
  const bal = await page.locator('#k-balance').innerText();
  await page.evaluate(() => renderAll());
  assert.equal(await page.locator('#k-balance').innerText(), bal, 'valeur finale exacte');
  await page.evaluate(() => { planData = Object.assign(planData || {}, { maxTP: 1 }); });
  await page.evaluate(() => TradeStore.add({ date: localDateStr(), asset: 'DAX 40', dir: 'Long', res: 'TP', rr: 2, pnl: 2, pnlEur: 50 }));
  await page.waitForSelector('.fx-party .fx-party-card');
  assert.match(await page.locator('.fx-party-card').innerText(), /Locked in/);
  assert.equal(await page.evaluate(() => DB.getItem(JP + 'fx_lockedin')), await page.evaluate(() => localDateStr()));
  assert.equal(await page.evaluate(() => fxCheckLockedIn('trade')), false, 'une seule fois par jour');
  await page.evaluate(() => setFx(false));
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('fx-motion')), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('bilan journalier : le menu de date n’est pas coupé (texte centré, pas de marge verticale en trop)', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { g_theme: JSON.stringify({ '--font-sans': "'Space Mono',monospace" }) } });
  await goto(page, 'bilan');
  const r = await page.evaluate(() => { const s = document.getElementById('bilan-date-select'), cs = getComputedStyle(s); return { pt: cs.paddingTop, pb: cs.paddingBottom, fits: s.scrollHeight <= s.clientHeight + 1 }; });
  assert.deepEqual(r, { pt: '0px', pb: '0px', fits: true });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('verrouillage automatique après inactivité (journal verrouillé)', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { tj_trades: [T({ id: 1 })] } });
  await page.evaluate(async () => { await DB.enableLock('2468'); armAutoLock(); });
  await goto(page, 'parametres');
  assert.equal(await page.inputValue('#lk-auto-sel'), '15', '15 minutes par défaut');
  await page.selectOption('#lk-auto-sel', '5');
  assert.equal(await page.evaluate(() => autoLockMinutes()), 5);
  // Inactivité simulée : on avance l'horloge de 5 minutes → écran de code.
  await page.evaluate(() => { clearTimeout(autoLockTimer); autoLockTimer = setTimeout(lockNow, 10); });
  await page.waitForSelector('#lock-screen');
  assert.equal(await page.locator('#lock-screen .lk-brand').getAttribute('aria-label'), 'LockIn');
  await page.fill('#lock-code', '2468'); await page.click('#lock-go');
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  await page.waitForFunction(() => !DB.busy);   // les écritures chiffrées du démarrage se terminent
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('couleur des boutons : menthe LockIn par défaut, violet au choix, vert des gains distinct', async () => {
  const { page, ctx, errors } = await openJournal({ seed: { g_theme: JSON.stringify({ '--preset-key': 'default' }), g_lockin_default_v1: '1' } });   // Graphite gardé
  const css = v => page.evaluate(v => getComputedStyle(document.documentElement).getPropertyValue(v).trim(), v);
  assert.equal(await css('--accent'), '#3ee6a8');
  assert.equal(await css('--green'), '#22c55e');
  await goto(page, 'parametres');
  await page.click('.ac-btn >> text=Violet');
  assert.equal(await css('--accent'), '#5d6cf6');
  assert.equal(await css('--on-accent'), '#ffffff');
  await page.reload(); await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'));
  assert.equal(await css('--accent'), '#5d6cf6', 'choix gardé');
  await page.evaluate(() => applyPreset('proclair'));
  assert.equal(await css('--accent'), '#4f5fe8');
  await page.evaluate(() => setAccentChoice('mint'));
  assert.equal(await css('--accent'), '#0f766e');
  assert.deepEqual(errors, []);
  await ctx.close();
});
