// Tests unitaires de la gestion du risque (src/js/00h-risk-calc.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const SRC = readFileSync(new URL('../../src/js/00h-risk-calc.js', import.meta.url), 'utf8');
const ctx = {};
runInNewContext(SRC + '\n;__out = { rkEquity, rkFactor, rkLossStreak, rkTradeRisk, rkBehaviorFlags, rkSimulate, rkExpectancy, rkProfitFactor };', ctx);
const R = ctx.__out;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('courbe de capital : plus haut, baisse actuelle et baisse maximale', () => {
  const e = R.rkEquity(1000, [{ date: '2026-01-02', pnlEur: -100 }, { date: '2026-01-01', pnlEur: 200 }, { date: '2026-01-03', pnlEur: 50 }]);
  near(e.eq, 1150); near(e.peak, 1200); near(e.dd, 50 / 1200); near(e.maxDD, 100 / 1200);
});
test('réduction du risque par paliers de baisse', () => {
  const cuts = [[10, 0.25], [5, 0.5]];
  assert.equal(R.rkFactor(2, cuts), 1); assert.equal(R.rkFactor(5, cuts), 0.5); assert.equal(R.rkFactor(12, cuts), 0.25);
});
test('pertes d\'affilée : les BE sont neutres', () => {
  assert.equal(R.rkLossStreak([{ res: 'TP' }, { res: 'SL' }, { res: 'BE' }, { res: 'SL' }]), 2);
  assert.equal(R.rkLossStreak([{ res: 'SL' }, { res: 'TP' }]), 0);
});
test('repères : taille anormale et trade de revanche', () => {
  const T = (entry, exit, res, pnl, pnlEur) => ({ date: '2026-03-02', entry, exit, res, pnl, pnlEur });
  const list = [T('09:00', '09:20', 'TP', 2, 200), T('09:30', '09:40', 'SL', -1, -100), T('10:00', '10:10', 'TP', 1, 100), T('10:20', '10:30', 'SL', -1, -100),
    T('10:40', '11:00', 'SL', -1, -300)];   // 10 min après un SL, risque 300 € (×3) : revanche + taille anormale
  const f = R.rkBehaviorFlags(list);
  assert.ok(f.some(x => x.kind === 'revenge' && x.t.entry === '10:40'));
  assert.ok(f.some(x => x.kind === 'size' && x.t.entry === '10:40'));
  assert.equal(R.rkTradeRisk({ pnl: 0.1, pnlEur: 10 }), null);
});
test('simulation : plus de risque = plus de risque de ruine ; reproductible', () => {
  const rs = Array.from({ length: 60 }, (_, i) => i % 5 < 2 ? 2 : i % 5 === 4 ? 0 : -1);   // 40 % à +2R, 20 % BE, 40 % à −1R
  const a = R.rkSimulate({ rs, riskPct: 0.5, trades: 200, runs: 1500, ddLimit: 20 });
  const b = R.rkSimulate({ rs, riskPct: 3, trades: 200, runs: 1500, ddLimit: 20 });
  assert.ok(b.pRuin > a.pRuin, a.pRuin + ' < ' + b.pRuin);
  assert.ok(b.ddMed > a.ddMed);
  const c = R.rkSimulate({ rs, riskPct: 0.5, trades: 200, runs: 1500, ddLimit: 20 });
  assert.equal(a.pRuin, c.pRuin);
  assert.equal(a.band.length, 3); assert.equal(a.band[1].length, 201);
  const m = R.rkSimulate({ pWin: 0.4, pBE: 0.1, avgWin: 2, avgLoss: 1, riskPct: 1, trades: 100, runs: 500 });
  assert.ok(m.ret50 > 0);
});
test('espérance et profit factor', () => {
  near(R.rkExpectancy([2, -1, 0, -1]), 0); near(R.rkProfitFactor([2, -1, -1, 3]), 2.5);
});
