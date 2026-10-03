// Tests unitaires des indicateurs du replay (src/js/00g-replay-ind-calc.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const SRC = readFileSync(new URL('../../src/js/00g-replay-ind-calc.js', import.meta.url), 'utf8');
const ctx = {};
runInNewContext(SRC + '\n;__out = { rpiSMA, rpiEMA, rpiRMA, rpiWMA, rpiStdev, rpiATR, RPI_DEFS };', ctx);
const I = ctx.__out;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);
// Marché synthétique déterministe
const bars = Array.from({ length: 400 }, (_, i) => { const o = 100 + 10 * Math.sin(i / 9) + i * 0.05, c = o + 2 * Math.sin(i * 1.3); return { time: 1780000000 + i * 300, open: o, close: c, high: Math.max(o, c) + 1 + Math.abs(Math.sin(i)), low: Math.min(o, c) - 1 - Math.abs(Math.cos(i)), volume: 100 + 50 * Math.abs(Math.sin(i / 3)) }; });

test('moyennes : simple, exponentielle amorcée par la simple, pondérée', () => {
  const a = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(Array.from(I.rpiSMA(a, 3)), [null, null, 2, 3, 4, 5]);
  const e = I.rpiEMA(a, 3);
  near(e[2], 2); near(e[3], 4 * 0.5 + 2 * 0.5); near(e[5], 6 * 0.5 + e[4] * 0.5);
  near(I.rpiWMA(a, 3)[2], (1 + 4 + 9) / 6);
  near(I.rpiStdev([2, 2, 2, 2], 4)[3], 0);
});
test('RSI : 100 quand tout monte, 0 quand tout baisse ; Bollinger sur un prix constant', () => {
  const up = Array.from({ length: 30 }, (_, i) => ({ close: 10 + i, open: 10 + i, high: 11 + i, low: 9 + i, time: i, volume: 1 }));
  assert.equal(I.RPI_DEFS.rsi.calc(up, { len: 14, src: 'close' }).rsi.at(-1), 100);
  const dn = up.map(b => ({ ...b, close: 100 - b.close }));
  assert.equal(I.RPI_DEFS.rsi.calc(dn, { len: 14, src: 'close' }).rsi.at(-1), 0);
  const flat = up.map(b => ({ ...b, close: 5 }));
  const bb = I.RPI_DEFS.bb.calc(flat, { len: 20, mult: 2, src: 'close' });
  near(bb.upper.at(-1), 5); near(bb.lower.at(-1), 5);
});
test('MACD : histogramme = MACD − signal ; ATR positif', () => {
  const m = I.RPI_DEFS.macd.calc(bars, { fast: 12, slow: 26, sig: 9, src: 'close' });
  for (let i = 0; i < bars.length; i++) if (m.hist[i] != null) near(m.hist[i], m.macd[i] - m.signal[i]);
  assert.ok(I.rpiATR(bars, 14).filter(v => v != null).every(v => v > 0));
});
test('aucun indicateur ne regarde le futur : les valeurs passées ne changent pas quand de nouvelles bougies arrivent', () => {
  for (const [id, d] of Object.entries(I.RPI_DEFS)) {
    const p = {}; d.inputs.forEach(x => { p[x.k] = x.def; });
    const full = d.calc(bars, p);
    for (const cut of [60, 150, 260]) {
      const part = d.calc(bars.slice(0, cut), p);
      for (const k of Object.keys(full)) for (let i = 0; i < cut; i++) {
        const a = part[k][i], b = full[k][i];
        if (a == null || b == null) assert.equal(a, b, `${id}.${k}[${i}]`);
        else near(a, b, 1e-7);
      }
    }
  }
});
