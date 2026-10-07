// Tests unitaires du coach (src/js/00i-coach-calc.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const SRC = readFileSync(new URL('../../src/js/00i-coach-calc.js', import.meta.url), 'utf8');
const ctx = {};
runInNewContext(SRC + '\n;__out = { coachInsights };', ctx);
const { coachInsights } = ctx.__out;
const T = o => Object.assign({ res: 'TP', pnl: 1, date: '2026-06-15', entry: '10:00', exit: '10:20' }, o);
const ids = l => [...l].map(x => x.id);   // tableau du contexte de test (pas celui de la VM)

test('pertes concentrées sur un jour et une tranche horaire', () => {
  const l = [
    T({ date: '2026-06-15', entry: '10:00', pnl: 2 }), T({ date: '2026-06-16', entry: '09:00', res: 'SL', pnl: -1 }),
    T({ date: '2026-06-19', entry: '15:10', res: 'SL', pnl: -1 }), T({ date: '2026-06-19', entry: '16:30', res: 'SL', pnl: -1 }),
    T({ date: '2026-06-19', entry: '15:50', res: 'SL', pnl: -1 })
  ];
  const r = coachInsights(l, { period: 'week' });
  const day = r.find(x => x.id === 'loss-day');
  assert.ok(day); assert.match(day.fr, /75 % de tes pertes viennent du vendredi/);
  assert.match(r.find(x => x.id === 'loss-hour').fr, /entre 14 h et 16 h|entre 16 h et 18 h/);
});
test('trades de revanche : moins de 30 min après un SL, le même jour', () => {
  const l = [T({ res: 'SL', pnl: -1, entry: '10:00', exit: '10:10' }), T({ res: 'SL', pnl: -1, entry: '10:20', exit: '10:40' }), T({ pnl: 2, entry: '12:00' })];
  const r = coachInsights(l, {});
  const rev = r.find(x => x.id === 'revenge');
  assert.ok(rev); assert.match(rev.fr, /^1 trade\(s\) de revanche/); assert.match(rev.fr, /−1,0 R/);
  assert.equal(r[0].id, 'revenge');   // le plus important en premier
});
test('valeur de la checklist et journées trop chargées', () => {
  const l = [T({ pnl: 2, ck: true }), T({ pnl: 1.5, ck: true, entry: '11:00' }), T({ pnl: -1, res: 'SL', ck: false, entry: '12:00' }), T({ pnl: -1, res: 'SL', ck: false, entry: '14:00' })];
  const r = coachInsights(l, { checklistDone: t => t.ck, maxTrades: 3, period: 'day' });
  assert.match(r.find(x => x.id === 'checklist').fr, /Elle te rapporte \+2,75 R par trade/);
  assert.match(r.find(x => x.id === 'overtrade').fr, /1 journée\(s\) au-delà de ta limite de 3 trades ; les trades en trop : −1,0 R/);
});
test('meilleur et pire setup, journée propre, liste vide', () => {
  const s = (setup, pnl, entry) => T({ setup, pnl, res: pnl > 0 ? 'TP' : 'SL', entry });
  const l = [s('Cassure', 2, '09:00'), s('Cassure', 1, '11:00'), s('Cassure', 2, '13:00'), s('Range', -1, '15:00'), s('Range', -1, '17:00'), s('Range', 0.5, '19:00')];
  const r = coachInsights(l, { period: 'week' });
  assert.ok(ids(r).includes('best-setup') && ids(r).includes('worst-setup'));
  const clean = coachInsights([T({ pnl: 2 }), T({ pnl: 1, entry: '14:00' })], { period: 'day' });
  assert.deepEqual(ids(clean), ['clean']); assert.match(clean[0].en, /Clean day: 2 trade\(s\), \+3.0 R/);
  assert.equal(coachInsights([], {}).length, 0);
  assert.equal(coachInsights([T({ res: 'OPEN', pnl: null })], {}).length, 0);
});
