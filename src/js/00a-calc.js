// ── CALCULS PURS (aucun accès au DOM ni au stockage) ─────────────────
// Toutes les formules qui produisent des chiffres affichés vivent ici : elles sont couvertes par les tests unitaires
// (tests/unit/calc.test.mjs) et partagées par toutes les pages — une seule définition par indicateur.

// Date AAAA-MM-JJ dans le fuseau LOCAL (toISOString() donne la date UTC : entre 0 h et 2 h en France, c'était la veille).
function localDateStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// Semaine ISO 8601 (lundi = début de semaine).
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { year: d.getUTCFullYear(), week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7) };
}

// Win rate = gagnants ÷ trades clos (les break-even comptent au dénominateur). Intervalle de Wilson à 95 %.
function wilsonCI(k, n, z) {
  z = z || 1.96; if (!n) return [0, 0];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - m), Math.min(1, c + m)];
}
function winStats(list) {
  const closed = list.filter(t => ['TP', 'SL', 'BE'].includes(t.res));
  const wins = closed.filter(t => t.res === 'TP').length, losses = closed.filter(t => t.res === 'SL').length;
  const n = closed.length, ci = n ? wilsonCI(wins, n) : [0, 0];
  return { n, wins, losses, be: n - wins - losses, rate: n ? wins / n : null, lo: ci[0], hi: ci[1] };
}
// Seuil de rentabilité du win rate à partir des gains et pertes (valeurs absolues) : 1 / (1 + payoff).
function breakevenFromLists(winVals, lossVals) {
  if (!winVals.length || !lossVals.length) return null;
  const aw = winVals.reduce((a, b) => a + b, 0) / winVals.length, al = lossVals.reduce((a, b) => a + b, 0) / lossVals.length;
  return aw + al > 0 ? al / (aw + al) : null;
}

// R d'un trade à partir des prix : (sortie − entrée) ÷ |entrée − stop|, signe selon le sens.
function computeDistanceR(entryPrice, slPrice, exitPrice, dir) {
  if (entryPrice === null || entryPrice === undefined || isNaN(entryPrice)) return null;
  if (slPrice === null || slPrice === undefined || isNaN(slPrice)) return null;
  if (exitPrice === null || exitPrice === undefined || isNaN(exitPrice)) return null;
  const riskDist = Math.abs(entryPrice - slPrice);
  if (riskDist <= 0) return null;
  const traveled = dir === 'Short' ? (entryPrice - exitPrice) : (exitPrice - entryPrice);
  return Math.round((traveled / riskDist) * 100) / 100;
}
// R visé : distance à l'objectif ÷ distance au stop (null si les prix manquent).
function plannedR(t) {
  if (t.entryPrice == null || t.slPrice == null || t.tpPrice == null) return null;
  const risk = Math.abs(t.entryPrice - t.slPrice);
  return risk > 0 ? Math.round(Math.abs(t.tpPrice - t.entryPrice) / risk * 100) / 100 : null;
}

// Nombre lu dans un CSV : virgule décimale (12,5), milliers (1 234,56 · 1,234.56 · 1.234,56), symboles monétaires,
// moins typographique et parenthèses comptables. NaN si ce n'est pas un nombre.
function parseNumCSV(raw) {
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).trim().replace(/[\s  ']/g, '').replace(/−/g, '-').replace(/[€$£%]/g, '').replace(/^(USD|EUR|GBP|CHF)|(USD|EUR|GBP|CHF)$/i, '');
  if (s === '') return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  const v = Number(s);
  return neg ? -v : v;
}
// Séparateur détecté sur la ligne d'en-tête (hors guillemets) : « , » (TradingView), « ; » (Excel FR) ou tabulation.
function detectCSVDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQ = !inQ;
    else if (!inQ && c === '\n') break;
    else if (!inQ && counts[c] !== undefined) counts[c]++;
  }
  return Object.keys(counts).reduce((best, d) => counts[d] > counts[best] ? d : best, ',');
}
function parseCSVGeneric(text) {
  text = String(text || '').replace(/^﻿/, '');   // BOM UTF-8 des exports Excel
  const delim = detectCSVDelimiter(text);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* ignoré */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

// Drawdown maximum d'une série de soldes (valeur la plus négative de solde − plus haut précédent).
function maxDrawdown(series) {
  let peak = -Infinity, dd = 0, ddPct = 0;
  series.forEach(v => { if (v > peak) peak = v; const d = v - peak; if (d < dd) dd = d; if (peak > 0 && d / peak < ddPct) ddPct = d / peak; });
  return { abs: dd, pct: ddPct };
}
// Générateur pseudo-aléatoire reproductible (même graine = mêmes simulations : le graphique ne « saute » pas à chaque affichage).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function percentile(sorted, p) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
// Monte-Carlo : `sims` trajectoires de `n` trades tirés avec remise dans `values` (résultats réels, en € ou en R),
// à partir de `start`. Renvoie les bandes de percentiles par étape et les statistiques de risque.
function monteCarlo(values, n, sims, start, ddLimit, seed) {
  const rnd = mulberry32(seed || 42), k = values.length;
  const bands = { p05: [], p25: [], p50: [], p75: [], p95: [] };
  if (!k || !n || !sims) return { bands, finals: [], hitDD: 0, negative: 0, medianMaxDD: 0 };
  const paths = new Float64Array(sims * (n + 1)), finals = [], maxDDs = [];
  let hit = 0, neg = 0;
  for (let s = 0; s < sims; s++) {
    let bal = start, peak = start, worst = 0, touched = false;
    paths[s * (n + 1)] = bal;
    for (let i = 1; i <= n; i++) {
      bal += values[Math.floor(rnd() * k)];
      paths[s * (n + 1) + i] = bal;
      if (bal > peak) peak = bal;
      const dd = peak !== 0 ? (bal - peak) / Math.abs(peak) : 0;
      if (dd < worst) worst = dd;
      if (ddLimit && start > 0 && -dd >= ddLimit) touched = true;
    }
    finals.push(bal); maxDDs.push(worst);
    if (touched) hit++;
    if (bal < start) neg++;
  }
  const col = new Float64Array(sims);
  for (let i = 0; i <= n; i++) {
    for (let s = 0; s < sims; s++) col[s] = paths[s * (n + 1) + i];
    const sorted = Array.from(col).sort((a, b) => a - b);
    bands.p05.push(percentile(sorted, .05)); bands.p25.push(percentile(sorted, .25)); bands.p50.push(percentile(sorted, .5));
    bands.p75.push(percentile(sorted, .75)); bands.p95.push(percentile(sorted, .95));
  }
  finals.sort((a, b) => a - b); maxDDs.sort((a, b) => a - b);
  return { bands, finals, hitDD: hit / sims, negative: neg / sims, medianMaxDD: percentile(maxDDs, .5) };
}
