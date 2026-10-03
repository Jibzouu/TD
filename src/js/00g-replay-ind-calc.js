// ── REPLAY : CALCUL DES INDICATEURS ──────────────────────────────────
// Fonctions pures (testées à part) : chaque indicateur reçoit les bougies déjà affichées et ses réglages, et renvoie
// une série de valeurs par tracé, alignée sur l'index des bougies (null tant que la fenêtre n'est pas pleine).
// Formules alignées sur celles de TradingView (ta.sma, ta.ema, ta.rma, ta.wma, ta.stdev…).

function rpiSrc(bars, s) {
  return bars.map(c => s === 'open' ? c.open : s === 'high' ? c.high : s === 'low' ? c.low : s === 'hl2' ? (c.high + c.low) / 2
    : s === 'hlc3' ? (c.high + c.low + c.close) / 3 : s === 'ohlc4' ? (c.open + c.high + c.low + c.close) / 4 : c.close);
}
// Moyenne glissante sur n valeurs non nulles consécutives.
function rpiSMA(a, n) {
  const out = new Array(a.length).fill(null); let sum = 0, run = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v == null || isNaN(v)) { sum = 0; run = 0; continue; }
    sum += v; run++;
    if (run > n) { sum -= a[i - n]; run = n; }
    if (run === n) out[i] = sum / n;
  }
  return out;
}
// Moyenne exponentielle (amorcée par une moyenne simple) ; alpha = 2/(n+1), ou 1/n pour la moyenne de Wilder (rma).
function rpiEMAk(a, n, alpha) {
  const out = new Array(a.length).fill(null); let e = null, sum = 0, run = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (v == null || isNaN(v)) { if (e == null) { sum = 0; run = 0; } continue; }
    if (e == null) { sum += v; run++; if (run === n) { e = sum / n; out[i] = e; } continue; }
    e = alpha * v + (1 - alpha) * e; out[i] = e;
  }
  return out;
}
function rpiEMA(a, n) { return rpiEMAk(a, n, 2 / (n + 1)); }
function rpiRMA(a, n) { return rpiEMAk(a, n, 1 / n); }
function rpiWMA(a, n) {
  const out = new Array(a.length).fill(null), den = n * (n + 1) / 2;
  for (let i = n - 1; i < a.length; i++) {
    let s = 0, ok = true;
    for (let j = 0; j < n; j++) { const v = a[i - j]; if (v == null) { ok = false; break; } s += v * (n - j); }
    if (ok) out[i] = s / den;
  }
  return out;
}
function rpiStdev(a, n) {
  const m = rpiSMA(a, n);
  return a.map((v, i) => { if (m[i] == null) return null; let s = 0; for (let j = 0; j < n; j++) s += (a[i - j] - m[i]) ** 2; return Math.sqrt(s / n); });
}
function rpiHighest(a, n) { return a.map((v, i) => { if (i < n - 1) return null; let m = -Infinity; for (let j = 0; j < n; j++) m = Math.max(m, a[i - j]); return m; }); }
function rpiLowest(a, n) { return a.map((v, i) => { if (i < n - 1) return null; let m = Infinity; for (let j = 0; j < n; j++) m = Math.min(m, a[i - j]); return m; }); }
function rpiTR(bars) { return bars.map((c, i) => i ? Math.max(c.high - c.low, Math.abs(c.high - bars[i - 1].close), Math.abs(c.low - bars[i - 1].close)) : c.high - c.low); }
function rpiATR(bars, n) { return rpiRMA(rpiTR(bars), n); }
const rpiZip = (a, b, f) => a.map((v, i) => v == null || b[i] == null ? null : f(v, b[i], i));

// Définitions : réglages (inputs), tracés (plots) avec style par défaut, niveaux (oscillateurs), panneau ou graphique.
const RPI_SRC = [['close', 'Clôture'], ['open', 'Ouverture'], ['high', 'Plus haut'], ['low', 'Plus bas'], ['hl2', '(H+B)/2'], ['hlc3', '(H+B+C)/3'], ['ohlc4', '(O+H+B+C)/4']];
const RPI_DEFS = {
  vol: { name: 'Volume', short: 'Vol', cat: 'main', fmt: 'vol', inputs: [], plots: [{ k: 'vol', label: 'Volume', color: '#089981', type: 'hist' }],
    calc: b => ({ vol: b.map(c => c.volume || 0) }) },
  sma: { name: 'Moyenne mobile simple', short: 'MM', cat: 'main', inputs: [{ k: 'len', label: 'Longueur', def: 20, min: 1 }, { k: 'src', label: 'Source', def: 'close', type: 'src' }],
    plots: [{ k: 'ma', label: 'MM', color: '#2962ff' }], calc: (b, p) => ({ ma: rpiSMA(rpiSrc(b, p.src), p.len) }) },
  ema: { name: 'Moyenne mobile exponentielle', short: 'MME', cat: 'main', inputs: [{ k: 'len', label: 'Longueur', def: 21, min: 1 }, { k: 'src', label: 'Source', def: 'close', type: 'src' }],
    plots: [{ k: 'ma', label: 'MME', color: '#9c27b0' }], calc: (b, p) => ({ ma: rpiEMA(rpiSrc(b, p.src), p.len) }) },
  wma: { name: 'Moyenne mobile pondérée', short: 'MMP', cat: 'main', inputs: [{ k: 'len', label: 'Longueur', def: 20, min: 1 }, { k: 'src', label: 'Source', def: 'close', type: 'src' }],
    plots: [{ k: 'ma', label: 'MMP', color: '#00bcd4' }], calc: (b, p) => ({ ma: rpiWMA(rpiSrc(b, p.src), p.len) }) },
  vwma: { name: 'Moyenne mobile pondérée par le volume', short: 'VWMA', cat: 'main', inputs: [{ k: 'len', label: 'Longueur', def: 20, min: 1 }, { k: 'src', label: 'Source', def: 'close', type: 'src' }],
    plots: [{ k: 'ma', label: 'VWMA', color: '#e91e63' }],
    calc: (b, p) => { const s = rpiSrc(b, p.src), v = b.map(c => c.volume || 0); const num = rpiSMA(s.map((x, i) => x * v[i]), p.len), den = rpiSMA(v, p.len); return { ma: rpiZip(num, den, (a, d) => d ? a / d : null) }; } },
  bb: { name: 'Bandes de Bollinger', short: 'BB', cat: 'main', inputs: [{ k: 'len', label: 'Longueur', def: 20, min: 1 }, { k: 'mult', label: 'Écart-type', def: 2, step: 0.1, min: 0.1 }, { k: 'src', label: 'Source', def: 'close', type: 'src' }],
    plots: [{ k: 'basis', label: 'Base', color: '#ff6d00' }, { k: 'upper', label: 'Supérieure', color: '#2962ff' }, { k: 'lower', label: 'Inférieure', color: '#2962ff' }],
    calc: (b, p) => { const s = rpiSrc(b, p.src), m = rpiSMA(s, p.len), sd = rpiStdev(s, p.len); return { basis: m, upper: rpiZip(m, sd, (x, d) => x + p.mult * d), lower: rpiZip(m, sd, (x, d) => x - p.mult * d) }; } },
  kc: { name: 'Canaux de Keltner', short: 'KC', cat: 'main', inputs: [{ k: 'len', label: 'Longueur', def: 20, min: 1 }, { k: 'mult', label: 'Multiplicateur', def: 2, step: 0.1, min: 0.1 }, { k: 'atr', label: 'Longueur ATR', def: 10, min: 1 }],
    plots: [{ k: 'basis', label: 'Base', color: '#2962ff' }, { k: 'upper', label: 'Supérieure', color: '#2962ff' }, { k: 'lower', label: 'Inférieure', color: '#2962ff' }],
    calc: (b, p) => { const m = rpiEMA(rpiSrc(b, 'close'), p.len), a = rpiATR(b, p.atr); return { basis: m, upper: rpiZip(m, a, (x, d) => x + p.mult * d), lower: rpiZip(m, a, (x, d) => x - p.mult * d) }; } },
  dc: { name: 'Canaux de Donchian', short: 'DC', cat: 'main', inputs: [{ k: 'len', label: 'Longueur', def: 20, min: 1 }],
    plots: [{ k: 'upper', label: 'Supérieure', color: '#2962ff' }, { k: 'basis', label: 'Base', color: '#ff6d00' }, { k: 'lower', label: 'Inférieure', color: '#2962ff' }],
    calc: (b, p) => { const h = rpiHighest(b.map(c => c.high), p.len), l = rpiLowest(b.map(c => c.low), p.len); return { upper: h, lower: l, basis: rpiZip(h, l, (x, y) => (x + y) / 2) }; } },
  vwap: { name: 'VWAP (séance du jour)', short: 'VWAP', cat: 'main', inputs: [{ k: 'src', label: 'Source', def: 'hlc3', type: 'src' }],
    plots: [{ k: 'vwap', label: 'VWAP', color: '#2962ff' }],
    calc: (b, p) => { const s = rpiSrc(b, p.src); let day = null, pv = 0, vv = 0; return { vwap: b.map((c, i) => { const d = Math.floor(c.time / 86400), v = c.volume || 1; if (d !== day) { day = d; pv = 0; vv = 0; } pv += s[i] * v; vv += v; return pv / vv; }) }; } },
  ichimoku: { name: 'Nuage d’Ichimoku', short: 'Ichimoku', cat: 'main',
    inputs: [{ k: 'conv', label: 'Tenkan (conversion)', def: 9, min: 1 }, { k: 'base', label: 'Kijun (base)', def: 26, min: 1 }, { k: 'spanB', label: 'Senkou B', def: 52, min: 1 }, { k: 'disp', label: 'Décalage', def: 26, min: 1 }],
    plots: [{ k: 'tenkan', label: 'Tenkan', color: '#2962ff' }, { k: 'kijun', label: 'Kijun', color: '#b71c1c' }, { k: 'chikou', label: 'Chikou', color: '#43a047' }, { k: 'spanA', label: 'Senkou A', color: '#a5d6a7' }, { k: 'spanB', label: 'Senkou B', color: '#ef9a9a' }],
    calc: (b, p) => {
      const hi = b.map(c => c.high), lo = b.map(c => c.low), mid = n => rpiZip(rpiHighest(hi, n), rpiLowest(lo, n), (x, y) => (x + y) / 2);
      const t = mid(p.conv), k = mid(p.base);
      return { tenkan: t, kijun: k, chikou: b.map(c => c.close), spanA: rpiZip(t, k, (x, y) => (x + y) / 2), spanB: mid(p.spanB) };
    },
    // Décalages : le nuage est projeté vers l'avant (calculé sur le passé), la Chikou vers l'arrière.
    offsets: p => ({ chikou: -(p.disp - 1), spanA: p.disp - 1, spanB: p.disp - 1 }) },
  psar: { name: 'SAR parabolique', short: 'SAR', cat: 'main', inputs: [{ k: 'start', label: 'Départ', def: 0.02, step: 0.01, min: 0.001 }, { k: 'inc', label: 'Incrément', def: 0.02, step: 0.01, min: 0.001 }, { k: 'max', label: 'Maximum', def: 0.2, step: 0.01, min: 0.01 }],
    plots: [{ k: 'sar', label: 'SAR', color: '#2962ff', type: 'points' }],
    calc: (b, p) => {
      const out = new Array(b.length).fill(null);
      if (b.length < 2) return { sar: out };
      let up = b[1].close >= b[0].close, af = p.start, ep = up ? b[0].high : b[0].low, sar = up ? b[0].low : b[0].high;
      for (let i = 1; i < b.length; i++) {
        sar = sar + af * (ep - sar);
        if (up) {
          sar = Math.min(sar, b[i - 1].low, i > 1 ? b[i - 2].low : b[i - 1].low);
          if (b[i].low < sar) { up = false; sar = ep; ep = b[i].low; af = p.start; }
          else if (b[i].high > ep) { ep = b[i].high; af = Math.min(p.max, af + p.inc); }
        } else {
          sar = Math.max(sar, b[i - 1].high, i > 1 ? b[i - 2].high : b[i - 1].high);
          if (b[i].high > sar) { up = true; sar = ep; ep = b[i].high; af = p.start; }
          else if (b[i].low < ep) { ep = b[i].low; af = Math.min(p.max, af + p.inc); }
        }
        out[i] = sar;
      }
      return { sar: out };
    } },
  supertrend: { name: 'SuperTrend', short: 'SuperTrend', cat: 'main', inputs: [{ k: 'atr', label: 'Longueur ATR', def: 10, min: 1 }, { k: 'factor', label: 'Facteur', def: 3, step: 0.1, min: 0.1 }],
    plots: [{ k: 'up', label: 'Tendance haussière', color: '#089981' }, { k: 'dn', label: 'Tendance baissière', color: '#f23645' }],
    calc: (b, p) => {
      const a = rpiATR(b, p.atr), up = new Array(b.length).fill(null), dn = new Array(b.length).fill(null);
      let lb = null, ub = null, dir = 1;
      for (let i = 0; i < b.length; i++) {
        if (a[i] == null) continue;
        const hl2 = (b[i].high + b[i].low) / 2, pc = i ? b[i - 1].close : b[i].close;
        let nlb = hl2 - p.factor * a[i], nub = hl2 + p.factor * a[i];
        if (lb != null && (nlb < lb && pc > lb)) nlb = lb;
        if (ub != null && (nub > ub && pc < ub)) nub = ub;
        if (lb != null) dir = dir === -1 && b[i].close > ub ? 1 : dir === 1 && b[i].close < lb ? -1 : dir;
        lb = nlb; ub = nub;
        if (dir === 1) up[i] = lb; else dn[i] = ub;
      }
      return { up, dn };
    } },
  rsi: { name: 'RSI (force relative)', short: 'RSI', cat: 'pane', fmt: 2, inputs: [{ k: 'len', label: 'Longueur', def: 14, min: 1 }, { k: 'src', label: 'Source', def: 'close', type: 'src' }],
    plots: [{ k: 'rsi', label: 'RSI', color: '#7e57c2' }], levels: [70, 50, 30],
    calc: (b, p) => { const s = rpiSrc(b, p.src), ch = s.map((v, i) => i ? v - s[i - 1] : null); const u = rpiRMA(ch.map(x => x == null ? null : Math.max(x, 0)), p.len), d = rpiRMA(ch.map(x => x == null ? null : Math.max(-x, 0)), p.len); return { rsi: rpiZip(u, d, (x, y) => y === 0 ? 100 : x === 0 ? 0 : 100 - 100 / (1 + x / y)) }; } },
  macd: { name: 'MACD', short: 'MACD', cat: 'pane', fmt: 'price', inputs: [{ k: 'fast', label: 'Rapide', def: 12, min: 1 }, { k: 'slow', label: 'Lente', def: 26, min: 1 }, { k: 'sig', label: 'Signal', def: 9, min: 1 }, { k: 'src', label: 'Source', def: 'close', type: 'src' }],
    plots: [{ k: 'hist', label: 'Histogramme', color: '#26a69a', type: 'hist' }, { k: 'macd', label: 'MACD', color: '#2962ff' }, { k: 'signal', label: 'Signal', color: '#ff6d00' }], levels: [0],
    calc: (b, p) => { const s = rpiSrc(b, p.src), m = rpiZip(rpiEMA(s, p.fast), rpiEMA(s, p.slow), (x, y) => x - y), sg = rpiEMA(m, p.sig); return { macd: m, signal: sg, hist: rpiZip(m, sg, (x, y) => x - y) }; },
    histColor: (h, i) => h[i] >= 0 ? (h[i - 1] != null && h[i] < h[i - 1] ? '#b2dfdb' : '#26a69a') : (h[i - 1] != null && h[i] > h[i - 1] ? '#ffcdd2' : '#ff5252') },
  stoch: { name: 'Stochastique', short: 'Stoch', cat: 'pane', fmt: 2, inputs: [{ k: 'k', label: '%K longueur', def: 14, min: 1 }, { k: 'sk', label: '%K lissage', def: 1, min: 1 }, { k: 'd', label: '%D lissage', def: 3, min: 1 }],
    plots: [{ k: 'k', label: '%K', color: '#2962ff' }, { k: 'd', label: '%D', color: '#ff6d00' }], levels: [80, 50, 20],
    calc: (b, p) => { const h = rpiHighest(b.map(c => c.high), p.k), l = rpiLowest(b.map(c => c.low), p.k); const raw = b.map((c, i) => h[i] == null ? null : h[i] === l[i] ? 50 : 100 * (c.close - l[i]) / (h[i] - l[i])); const k = rpiSMA(raw, p.sk); return { k, d: rpiSMA(k, p.d) }; } },
  atr: { name: 'ATR (vrai écart moyen)', short: 'ATR', cat: 'pane', fmt: 'price', inputs: [{ k: 'len', label: 'Longueur', def: 14, min: 1 }],
    plots: [{ k: 'atr', label: 'ATR', color: '#b71c1c' }], calc: (b, p) => ({ atr: rpiATR(b, p.len) }) },
  cci: { name: 'CCI (canal des matières premières)', short: 'CCI', cat: 'pane', fmt: 2, inputs: [{ k: 'len', label: 'Longueur', def: 20, min: 1 }],
    plots: [{ k: 'cci', label: 'CCI', color: '#2962ff' }], levels: [100, 0, -100],
    calc: (b, p) => { const tp = rpiSrc(b, 'hlc3'), m = rpiSMA(tp, p.len); return { cci: tp.map((v, i) => { if (m[i] == null) return null; let md = 0; for (let j = 0; j < p.len; j++) md += Math.abs(tp[i - j] - m[i]); md /= p.len; return md ? (v - m[i]) / (0.015 * md) : 0; }) }; } },
  willr: { name: 'Williams %R', short: '%R', cat: 'pane', fmt: 2, inputs: [{ k: 'len', label: 'Longueur', def: 14, min: 1 }],
    plots: [{ k: 'r', label: '%R', color: '#7e57c2' }], levels: [-20, -50, -80],
    calc: (b, p) => { const h = rpiHighest(b.map(c => c.high), p.len), l = rpiLowest(b.map(c => c.low), p.len); return { r: b.map((c, i) => h[i] == null ? null : h[i] === l[i] ? -50 : -100 * (h[i] - c.close) / (h[i] - l[i])) }; } },
  mfi: { name: 'MFI (flux monétaire)', short: 'MFI', cat: 'pane', fmt: 2, inputs: [{ k: 'len', label: 'Longueur', def: 14, min: 1 }],
    plots: [{ k: 'mfi', label: 'MFI', color: '#7e57c2' }], levels: [80, 20],
    calc: (b, p) => { const tp = rpiSrc(b, 'hlc3'); return { mfi: b.map((c, i) => { if (i < p.len) return null; let pos = 0, neg = 0; for (let j = i - p.len + 1; j <= i; j++) { const f = tp[j] * (b[j].volume || 0); if (tp[j] > tp[j - 1]) pos += f; else if (tp[j] < tp[j - 1]) neg += f; } return neg === 0 ? 100 : 100 - 100 / (1 + pos / neg); }) }; } },
  obv: { name: 'OBV (volume cumulé)', short: 'OBV', cat: 'pane', fmt: 'vol', inputs: [],
    plots: [{ k: 'obv', label: 'OBV', color: '#2962ff' }],
    calc: b => { let s = 0; return { obv: b.map((c, i) => { if (i) s += c.close > b[i - 1].close ? (c.volume || 0) : c.close < b[i - 1].close ? -(c.volume || 0) : 0; return s; }) }; } },
  adx: { name: 'DMI / ADX (force de tendance)', short: 'DMI', cat: 'pane', fmt: 2, inputs: [{ k: 'len', label: 'Longueur DI', def: 14, min: 1 }, { k: 'adx', label: 'Lissage ADX', def: 14, min: 1 }],
    plots: [{ k: 'adx', label: 'ADX', color: '#f50057' }, { k: 'plus', label: '+DI', color: '#2962ff' }, { k: 'minus', label: '−DI', color: '#ff6d00' }], levels: [25],
    calc: (b, p) => {
      const pdm = b.map((c, i) => { if (!i) return null; const u = c.high - b[i - 1].high, d = b[i - 1].low - c.low; return u > d && u > 0 ? u : 0; });
      const mdm = b.map((c, i) => { if (!i) return null; const u = c.high - b[i - 1].high, d = b[i - 1].low - c.low; return d > u && d > 0 ? d : 0; });
      const tr = rpiRMA(rpiTR(b).map((v, i) => i ? v : null), p.len);
      const plus = rpiZip(rpiRMA(pdm, p.len), tr, (x, t) => t ? 100 * x / t : 0), minus = rpiZip(rpiRMA(mdm, p.len), tr, (x, t) => t ? 100 * x / t : 0);
      const dx = rpiZip(plus, minus, (x, y) => (x + y) ? 100 * Math.abs(x - y) / (x + y) : 0);
      return { plus, minus, adx: rpiRMA(dx, p.adx) };
    } },
  mom: { name: 'Momentum', short: 'Mom', cat: 'pane', fmt: 'price', inputs: [{ k: 'len', label: 'Longueur', def: 10, min: 1 }, { k: 'src', label: 'Source', def: 'close', type: 'src' }],
    plots: [{ k: 'mom', label: 'Mom', color: '#2962ff' }], levels: [0],
    calc: (b, p) => { const s = rpiSrc(b, p.src); return { mom: s.map((v, i) => i >= p.len ? v - s[i - p.len] : null) }; } }
};
