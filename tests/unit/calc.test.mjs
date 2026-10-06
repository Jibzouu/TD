// Tests unitaires des calculs purs (src/js/00a-calc.js). Lancer : npm run test:unit
// Le module est un script classique (pas d'export) : on l'exécute dans un contexte isolé et on lit ses fonctions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const SRC = readFileSync(new URL('../../src/js/00a-calc.js', import.meta.url), 'utf8');
const NAMES = ['localDateStr', 'getISOWeek', 'wilsonCI', 'winStats', 'breakevenFromLists', 'computeDistanceR', 'plannedR', 'parseNumCSV',
  'detectCSVDelimiter', 'parseCSVGeneric', 'maxDrawdown', 'mulberry32', 'percentile', 'monteCarlo'];
const ctx = {};
runInNewContext(SRC + `\n;__out = { ${NAMES.join(', ')} };`, ctx);
const C = ctx.__out;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('localDateStr : date locale, jamais décalée en UTC', () => {
  assert.equal(C.localDateStr(new Date(2026, 0, 5, 0, 30)), '2026-01-05');
  assert.equal(C.localDateStr(new Date(2026, 11, 31, 23, 59)), '2026-12-31');
});

test('getISOWeek : bords d’année', () => {
  assert.deepEqual({ ...C.getISOWeek(new Date(2026, 5, 17)) }, { year: 2026, week: 25 });
  assert.deepEqual({ ...C.getISOWeek(new Date(2021, 0, 3)) }, { year: 2020, week: 53 });   // dimanche 3 janv. 2021
  assert.deepEqual({ ...C.getISOWeek(new Date(2024, 11, 30)) }, { year: 2025, week: 1 });  // lundi 30 déc. 2024
});

test('winStats : gagnants ÷ (gagnants + perdants), les BE ne comptent pas, trades ouverts ignorés', () => {
  const s = C.winStats([{ res: 'TP' }, { res: 'TP' }, { res: 'SL' }, { res: 'BE' }, { res: 'BE' }, { res: 'OPEN' }]);
  assert.equal(s.n, 3); assert.equal(s.closed, 5); assert.equal(s.wins, 2); assert.equal(s.losses, 1); assert.equal(s.be, 2);
  assert.ok(Math.abs(s.rate - 2 / 3) < 1e-12);
  assert.ok(s.lo < 2 / 3 && s.hi > 2 / 3 && s.lo >= 0 && s.hi <= 1);
  assert.equal(C.winStats([]).rate, null);
  const onlyBE = C.winStats([{ res: 'BE' }, { res: 'BE' }]);
  assert.equal(onlyBE.rate, null); assert.equal(onlyBE.closed, 2);
});

test('wilsonCI : valeurs de référence', () => {
  const [lo, hi] = C.wilsonCI(50, 100);
  near(lo, 0.4038, 1e-3); near(hi, 0.5962, 1e-3);
  assert.deepEqual([...C.wilsonCI(0, 0)], [0, 0]);
  const [lo0] = C.wilsonCI(0, 10); assert.equal(lo0, 0);
});

test('breakevenFromLists : 1 / (1 + payoff)', () => {
  near(C.breakevenFromLists([200, 200], [100]), 1 / 3);
  assert.equal(C.breakevenFromLists([], [100]), null);
});

test('computeDistanceR et plannedR : long, short, données manquantes', () => {
  assert.equal(C.computeDistanceR(1.1000, 1.0980, 1.1040, 'Long'), 2);
  assert.equal(C.computeDistanceR(1.1000, 1.1020, 1.1030, 'Short'), -1.5);
  assert.equal(C.computeDistanceR(1.1, 1.1, 1.2, 'Long'), null, 'stop à l’entrée : R indéfini');
  assert.equal(C.computeDistanceR(null, 1, 2, 'Long'), null);
  assert.equal(C.plannedR({ entryPrice: 100, slPrice: 95, tpPrice: 112.5 }), 2.5);
  assert.equal(C.plannedR({ entryPrice: 100, slPrice: 95 }), null);
});

test('parseNumCSV : formats FR, US, monnaies, comptable', () => {
  const cases = [['12,5', 12.5], ['1 234,56', 1234.56], ['1,234.56', 1234.56], ['1.234,56', 1234.56], ['1,234,567', 1234567],
    ['−45', -45], ['(120.50)', -120.5], ['€ 99', 99], ['150 USD', 150], ['12 %', 12], ['1e3', 1000], ['.5', 0.5]];
  for (const [raw, v] of cases) assert.equal(C.parseNumCSV(raw), v, raw);
  for (const bad of ['', 'abc', null, undefined, '1-2']) assert.ok(Number.isNaN(C.parseNumCSV(bad)), String(bad));
});

test('parseCSVGeneric : séparateur, BOM, guillemets, lignes vides', () => {
  assert.equal(C.detectCSVDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(C.detectCSVDelimiter('"a;b",c,d\n'), ',', 'les « ; » entre guillemets ne comptent pas');
  const rows = C.parseCSVGeneric('﻿Date;Actif;Note\r\n2026-06-01;EUR/USD;"a; ""b"""\r\n\r\n2026-06-02;DAX;\n');
  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [['Date', 'Actif', 'Note'], ['2026-06-01', 'EUR/USD', 'a; "b"'], ['2026-06-02', 'DAX', '']]);
  const nl = C.parseCSVGeneric('a,b\n"ligne 1\nligne 2",x');
  assert.equal(nl[1][0], 'ligne 1\nligne 2');
});

test('maxDrawdown : absolu et en %', () => {
  const r = C.maxDrawdown([100, 120, 90, 130, 110]);
  assert.equal(r.abs, -30); near(r.pct, -0.25);
  assert.deepEqual({ ...C.maxDrawdown([1, 2, 3]) }, { abs: 0, pct: 0 });
});

test('percentile : interpolation linéaire', () => {
  assert.equal(C.percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(C.percentile([0, 10], 0.25), 2.5);
  assert.ok(Number.isNaN(C.percentile([], 0.5)));
});

test('monteCarlo : reproductible, bandes ordonnées, cas limites', () => {
  const vals = [100, 100, -50, -50, 150, -60];
  const a = C.monteCarlo(vals, 50, 500, 10000, 0.1, 7), b = C.monteCarlo(vals, 50, 500, 10000, 0.1, 7);
  assert.deepEqual([...a.finals], [...b.finals], 'même graine = mêmes simulations');
  assert.notDeepEqual([...C.monteCarlo(vals, 50, 500, 10000, 0.1, 8).finals], [...a.finals]);
  assert.equal(a.bands.p50.length, 51);
  assert.equal(a.bands.p50[0], 10000);
  for (let i = 0; i <= 50; i++) {
    const { p05, p25, p50, p75, p95 } = a.bands;
    assert.ok(p05[i] <= p25[i] && p25[i] <= p50[i] && p50[i] <= p75[i] && p75[i] <= p95[i]);
  }
  assert.ok(a.hitDD >= 0 && a.hitDD <= 1 && a.negative >= 0 && a.negative <= 1 && a.medianMaxDD <= 0);
  // Que des gains : jamais de perte ni de drawdown.
  const up = C.monteCarlo([10, 20], 20, 100, 1000, 0.05, 1);
  assert.equal(up.negative, 0); assert.equal(up.hitDD, 0); assert.equal(up.medianMaxDD, 0);
  // Que des pertes de 100 sur 1 000 : le seuil de 10 % est touché à chaque fois.
  assert.equal(C.monteCarlo([-100], 5, 10, 1000, 0.1, 1).hitDD, 1);
  assert.deepEqual([...C.monteCarlo([], 10, 10, 0, 0, 1).finals], []);
});
