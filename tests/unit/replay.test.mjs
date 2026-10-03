// Tests unitaires du moteur de replay (src/js/00f-replay-engine.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const SRC = readFileSync(new URL('../../src/js/00f-replay-engine.js', import.meta.url), 'utf8');
const NAMES = ['rpFloorStep', 'rpQtyStep', 'rpSizePosition', 'rpPnl', 'rpOpenPosition', 'rpClose', 'rpIsClosed', 'rpExitPrice', 'rpStepCandle', 'rpOpenPnl', 'rpToJournalTrade', 'rpResample'];
const ctx = {};
runInNewContext(SRC + `\n;__out = { ${NAMES.join(', ')} };`, ctx);
const E = ctx.__out;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

test('calculateur : 1 % de 10 000 avec un stop à 500 $ → 0,2 BTC, RR et levier', () => {
  const r = E.rpSizePosition({ side: 'long', entry: 60000, sl: 59500, tp: 61500, balance: 10000, riskMode: 'pct', riskValue: 1 });
  near(r.qty, 0.2); near(r.risk, 100); near(r.reward, 300); near(r.rr, 3); near(r.notional, 12000); near(r.leverage, 1.2); near(r.distancePct, 0.8333333, 1e-6);
  const a = E.rpSizePosition({ side: 'short', entry: 2500, sl: 2525, balance: 5000, riskMode: 'amount', riskValue: 50 });
  near(a.qty, 2); near(a.risk, 50);
  assert.equal(E.rpSizePosition({ side: 'long', entry: 100, sl: 101, balance: 1000, riskMode: 'pct', riskValue: 1 }).error, 'side');
  // Arrondi au pas, jamais au-dessus du risque voulu.
  const b = E.rpSizePosition({ side: 'long', entry: 60000, sl: 59700, balance: 10000, riskMode: 'pct', riskValue: 1 });
  near(b.qty, 0.3333); assert.ok(b.risk <= 100);
});

test('stop et objectif : déclenchement, gap, stop prioritaire si les deux sont touchés', () => {
  const mk = (side, sl, tp) => ({ positions: [E.rpOpenPosition({ id: 'p', side, qty: 1, price: 100, sl, tp, time: 0 })], orders: [] });
  let s = mk('long', 95, 110);
  E.rpStepCandle(s, { time: 60, open: 100, high: 111, low: 99, close: 109 });
  assert.equal(s.positions[0].closeReason, 'tp'); near(s.positions[0].realized, 10);
  s = mk('long', 95, 110);
  E.rpStepCandle(s, { time: 60, open: 100, high: 112, low: 94, close: 100 });
  assert.equal(s.positions[0].closeReason, 'sl', 'les deux touchés : stop retenu');
  s = mk('long', 95, 110);
  E.rpStepCandle(s, { time: 60, open: 90, high: 92, low: 88, close: 91 });
  near(rpExit(s), 90, 1e-9);
  s = mk('short', 105, 90);
  E.rpStepCandle(s, { time: 60, open: 100, high: 101, low: 89, close: 90 });
  assert.equal(s.positions[0].closeReason, 'tp'); near(s.positions[0].realized, 10);
  function rpExit(st) { return E.rpExitPrice(st.positions[0]); }
});

test('ordres en attente : limite et stop exécutés au bon prix, avec leurs stop / objectif', () => {
  const s = { positions: [], orders: [{ id: 'o1', side: 'long', type: 'limit', price: 98, qty: 2, sl: 96, tp: 104 }, { id: 'o2', side: 'short', type: 'stop', price: 95, qty: 1, sl: 97, tp: 90 }] };
  E.rpStepCandle(s, { time: 60, open: 100, high: 101, low: 97.5, close: 99 });
  assert.equal(s.positions.length, 1); near(s.positions[0].entry, 98); assert.equal(s.orders.length, 1);
  E.rpStepCandle(s, { time: 120, open: 99, high: 105, low: 98.5, close: 104 });
  assert.equal(s.positions[0].closeReason, 'tp'); near(s.positions[0].realized, 12);
});

test('clôture partielle, frais et conversion en trade du journal (R net, MAE / MFE)', () => {
  const p = E.rpOpenPosition({ id: 'x1', side: 'long', qty: 1, price: 100, sl: 95, tp: 115, time: 1717230000, feeRate: 0.001 });
  near(p.risk0, 5); near(p.fees, 0.1);
  E.rpClose(p, 105, 1717230300, 'manual', 0.5, 0.001);
  assert.equal(E.rpIsClosed(p), false); near(p.qty, 0.5);
  const s = { positions: [p], orders: [] };
  E.rpStepCandle(s, { time: 1717230600, open: 106, high: 116, low: 104, close: 114 }, { feeRate: 0.001 });
  assert.equal(E.rpIsClosed(p), true);
  near(p.realized, 2.5 + 7.5); near(E.rpExitPrice(p), 110);
  const t = E.rpToJournalTrade(p, { asset: 'BTC/USDT', tf: 'M5', fx: 0.9 });
  near(t.pnl, Math.round((10 - p.fees) / 5 * 100) / 100);
  assert.equal(t.res, 'TP'); assert.equal(t.dir, 'Long'); assert.equal(t.rr, 3); near(t.exitPrice, 110);
  near(t.pnlEur, Math.round((10 - p.fees) * 0.9 * 100) / 100);
  assert.equal(t.importSource, 'Replay'); assert.equal(t.tvKey, 'replay:x1'); assert.equal(t.rSrc, 'prix');
  assert.ok(t.mfe > 0);
});

test('regroupement de bougies (M1 → M5)', () => {
  const m1 = [0, 60, 120, 180, 240, 300].map((t, i) => ({ time: t, open: 10 + i, high: 12 + i, low: 9 + i, close: 11 + i, volume: 1 }));
  const m5 = E.rpResample(m1, 300);
  assert.equal(m5.length, 2);
  assert.deepEqual({ ...m5[0] }, { time: 0, open: 10, high: 16, low: 9, close: 15, volume: 5 });
});
