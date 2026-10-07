// ── GESTION DU RISQUE : CALCULS PURS ─────────────────────────────────
// Sans interface (testés à part : tests/unit/risk.test.mjs) : courbe de capital, drawdown, réduction automatique du
// risque quand le compte baisse, série de pertes, taille anormale / trade de revanche, simulation du risque de ruine.

// Courbe de capital à partir du capital de départ et des P&L en € (trades triés par date puis heure).
function rkEquity(start, list) {
  const sorted = list.filter(t => typeof t.pnlEur === 'number' && isFinite(t.pnlEur))
    .slice().sort((a, b) => ((a.date || '') + (a.entry || '')).localeCompare((b.date || '') + (b.entry || '')));
  let eq = start, peak = start, maxDD = 0;
  const pts = [{ eq, peak, dd: 0 }];
  sorted.forEach(t => {
    eq += t.pnlEur; peak = Math.max(peak, eq);
    const dd = peak > 0 ? (peak - eq) / peak : 0;
    maxDD = Math.max(maxDD, dd);
    pts.push({ eq, peak, dd, t });
  });
  return { eq, peak, dd: pts[pts.length - 1].dd, maxDD, pts };
}
// Réduction du risque selon la baisse depuis le plus haut : cuts = [[5, 0.5], [10, 0.25]] → −5 % : risque × 0,5 ; −10 % : × 0,25.
function rkFactor(ddPct, cuts) {
  let f = 1;
  (cuts || []).slice().sort((a, b) => a[0] - b[0]).forEach(([th, k]) => { if (ddPct >= th) f = k; });
  return f;
}
// Pertes d'affilée en fin de liste (les break-even ne cassent pas la série et ne la prolongent pas).
function rkLossStreak(list) {
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i].res;
    if (r === 'SL') n++; else if (r === 'TP') break;
  }
  return n;
}
// Risque réel d'un trade (en €) : |P&L| ÷ |R|, seulement quand le R est fiable et assez loin de zéro.
function rkTradeRisk(t) {
  if (typeof t.pnlEur !== 'number' || typeof t.pnl !== 'number' || Math.abs(t.pnl) < 0.25 || !t.pnlEur) return null;
  if (Math.sign(t.pnlEur) !== Math.sign(t.pnl)) return null;
  return Math.abs(t.pnlEur / t.pnl);
}
// Repères de comportement : taille anormale (risque > 1,5 × la médiane des 10 trades précédents) et
// trade de revanche (pris moins de 30 min après un SL, le même jour, avec un risque plus gros que ce SL).
function rkMinutes(hhmm) { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ''); return m ? +m[1] * 60 + +m[2] : null; }
function rkBehaviorFlags(list, opts) {
  const o = Object.assign({ factor: 1.5, revengeMin: 30 }, opts || {});
  const sorted = list.slice().sort((a, b) => ((a.date || '') + (a.entry || '')).localeCompare((b.date || '') + (b.entry || '')));
  const flags = [], risks = [];
  sorted.forEach((t, i) => {
    const r = rkTradeRisk(t);
    const prev = risks.slice(-10).filter(x => x != null).sort((a, b) => a - b);
    const med = prev.length >= 3 ? prev[Math.floor(prev.length / 2)] : null;
    if (r != null && med != null && r > med * o.factor) flags.push({ t, kind: 'size', risk: r, ref: med });
    const p = sorted[i - 1];
    if (p && p.res === 'SL' && p.date === t.date) {
      const end = rkMinutes(p.exit) ?? rkMinutes(p.entry), start = rkMinutes(t.entry), pr = rkTradeRisk(p);
      if (end != null && start != null && start - end >= 0 && start - end <= o.revengeMin && r != null && pr != null && r > pr * 1.2)
        flags.push({ t, kind: 'revenge', risk: r, ref: pr, gap: start - end });
    }
    risks.push(r);
  });
  return flags;
}
// Générateur pseudo-aléatoire reproductible (mêmes résultats à chaque affichage).
function rkRng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// Simulation du risque de ruine (Monte-Carlo) : on rejoue au hasard tes résultats en R (ou un modèle simple),
// en risquant riskPct % du capital à chaque trade. Renvoie la probabilité de baisser de ddLimit % au moins une fois,
// de finir en perte, la baisse maximale médiane et les rendements (5e, 50e et 95e centiles), plus 3 courbes types.
function rkSimulate(o) {
  const rs = Array.isArray(o.rs) && o.rs.length >= 20 ? o.rs : null;
  const draw = rs ? (rnd => rs[Math.floor(rnd() * rs.length)])
    : (rnd => { const u = rnd(); return u < o.pWin ? o.avgWin : u < o.pWin + (o.pBE || 0) ? 0 : -(o.avgLoss || 1); });
  const runs = o.runs || 3000, n = o.trades || 200, risk = o.riskPct / 100, dl = (o.ddLimit || 25) / 100;
  const rnd = rkRng(o.seed || 12345), finals = [], dds = [], paths = [];
  let hit = 0, loss = 0;
  for (let k = 0; k < runs; k++) {
    let eq = 1, peak = 1, mdd = 0;
    const keep = k < 400, path = keep ? [1] : null;
    for (let i = 0; i < n; i++) {
      eq *= 1 + risk * draw(rnd);
      if (eq <= 0) { eq = 0; mdd = 1; if (keep) path.push(0); break; }
      if (eq > peak) peak = eq;
      const d = (peak - eq) / peak; if (d > mdd) mdd = d;
      if (keep) path.push(eq);
    }
    if (mdd >= dl) hit++;
    if (eq < 1) loss++;
    finals.push(eq - 1); dds.push(mdd);
    if (keep) paths.push(path);
  }
  const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; };
  // Courbes types : centiles pas à pas sur les 400 premières simulations.
  const band = [5, 50, 95].map(p => Array.from({ length: n + 1 }, (_, i) => q(paths.map(x => x[Math.min(i, x.length - 1)]), p / 100)));
  return { pRuin: hit / runs, pLoss: loss / runs, ddMed: q(dds, 0.5), ret5: q(finals, 0.05), ret50: q(finals, 0.5), ret95: q(finals, 0.95), band };
}
// Espérance (R moyen) et profit factor sur une liste de résultats en R.
function rkExpectancy(rs) { return rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null; }
function rkProfitFactor(rs) { const g = rs.filter(r => r > 0).reduce((a, b) => a + b, 0), l = -rs.filter(r => r < 0).reduce((a, b) => a + b, 0); return l > 0 ? g / l : g > 0 ? Infinity : null; }
