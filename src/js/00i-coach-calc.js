// ── COACH : CALCULS PURS ───────────────────────────────────────────────
// Transforme les trades d'une période (journée ou semaine) en quelques constats clairs, avec leurs chiffres :
// où partent les pertes, trades de revanche, valeur de la checklist, journées trop chargées, meilleur setup…
// Sans interface ni IA (testé à part : tests/unit/coach.test.mjs). Chaque constat : { id, tone, score, fr, en }
// (tone : 'warn' | 'good' | 'info' ; score : importance pour le tri, le plus grand d'abord).

const CO_DAYS = { fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
const coR = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d).replace('.', ',') + ' R';
const coRen = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + ' R';
const coPct = v => Math.round(v * 100) + ' %';
function coMin(hhmm) { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ''); return m ? +m[1] * 60 + +m[2] : null; }
function coSort(list) { return list.slice().sort((a, b) => ((a.date || '') + (a.entry || '')).localeCompare((b.date || '') + (b.entry || ''))); }
const coClosed = t => ['TP', 'SL', 'BE'].includes(t.res) && typeof t.pnl === 'number' && isFinite(t.pnl);

// opts : { maxTrades, checklistDone(t) → true/false/null, revengeMin (30), period: 'day' | 'week' }
function coachInsights(list, opts) {
  const o = Object.assign({ maxTrades: 0, revengeMin: 30, period: 'week', checklistDone: null }, opts || {});
  const all = coSort(list.filter(coClosed)), out = [];
  if (!all.length) return out;
  const net = all.reduce((s, t) => s + t.pnl, 0), losses = all.filter(t => t.pnl < 0), lossR = -losses.reduce((s, t) => s + t.pnl, 0);
  const add = (id, tone, score, fr, en) => out.push({ id, tone, score, fr, en });

  // 1) Où partent les pertes : jour de la semaine (sur une semaine) et tranche de 2 h.
  if (losses.length >= 3 && lossR > 0) {
    const share = keyFn => { const m = {}; losses.forEach(t => { const k = keyFn(t); if (k != null) m[k] = (m[k] || 0) - t.pnl; }); const e = Object.entries(m).sort((a, b) => b[1] - a[1])[0]; return e ? { k: e[0], v: e[1] / lossR } : null; };
    if (o.period === 'week') {
      const d = share(t => t.date ? new Date(t.date + 'T00:00:00').getDay() : null);
      if (d && d.v >= 0.5 && new Set(losses.map(t => t.date)).size > 1) add('loss-day', 'warn', 60 + d.v * 20, coPct(d.v) + ' de tes pertes viennent du ' + CO_DAYS.fr[d.k] + '.', coPct(d.v) + ' of your losses come from ' + CO_DAYS.en[d.k] + '.');
    }
    const h = share(t => { const m = coMin(t.entry); return m == null ? null : Math.floor(m / 120) * 2; });
    if (h && h.v >= 0.5) { const a = String(h.k).padStart(2, '0'), b = String((+h.k + 2) % 24).padStart(2, '0'); add('loss-hour', 'warn', 55 + h.v * 20, coPct(h.v) + ' de tes pertes sont entrées entre ' + a + ' h et ' + b + ' h.', coPct(h.v) + ' of your losses were entered between ' + a + ':00 and ' + b + ':00.'); }
  }
  // 2) Trades de revanche : repris moins de revengeMin minutes après un SL, le même jour.
  let rev = 0, revR = 0;
  all.forEach((t, i) => {
    const p = all[i - 1];
    if (!p || p.res !== 'SL' || p.date !== t.date) return;
    const end = coMin(p.exit) ?? coMin(p.entry), start = coMin(t.entry);
    if (end != null && start != null && start >= end && start - end <= o.revengeMin) { rev++; revR += t.pnl; }
  });
  if (rev) add('revenge', 'warn', 70 + rev * 5, rev + ' trade(s) de revanche (moins de ' + o.revengeMin + ' min après un SL) : ' + coR(revR) + ' au total.', rev + ' revenge trade(s) (less than ' + o.revengeMin + ' min after a SL): ' + coRen(revR) + ' in total.');
  // 3) Checklist : résultat moyen quand elle est complète vs incomplète.
  if (typeof o.checklistDone === 'function') {
    const ok = [], ko = [];
    all.forEach(t => { const c = o.checklistDone(t); if (c === true) ok.push(t.pnl); else if (c === false) ko.push(t.pnl); });
    if (ok.length >= 2 && ko.length >= 2) {
      const a = ok.reduce((s, v) => s + v, 0) / ok.length, b = ko.reduce((s, v) => s + v, 0) / ko.length, d = a - b;
      if (Math.abs(d) >= 0.2) add('checklist', d > 0 ? 'info' : 'warn', 50 + Math.abs(d) * 10,
        d > 0 ? 'Checklist complète : ' + coR(a, 2) + ' par trade, contre ' + coR(b, 2) + ' sans. Elle te rapporte ' + coR(d, 2) + ' par trade.' : 'Bizarre : tes trades sans checklist complète font mieux (' + coR(b, 2) + ' contre ' + coR(a, 2) + '). Revois ta checklist.',
        d > 0 ? 'Full checklist: ' + coRen(a, 2) + ' per trade, vs ' + coRen(b, 2) + ' without. It earns you ' + coRen(d, 2) + ' per trade.' : 'Odd: your trades without a full checklist do better (' + coRen(b, 2) + ' vs ' + coRen(a, 2) + '). Review your checklist.');
    }
  }
  // 4) Journées trop chargées.
  const byDay = {};
  all.forEach(t => { (byDay[t.date] = byDay[t.date] || []).push(t); });
  if (o.maxTrades > 0) {
    const over = Object.values(byDay).filter(d => d.length > o.maxTrades);
    if (over.length) { const r = over.flatMap(d => d.slice(o.maxTrades)).reduce((s, t) => s + t.pnl, 0); add('overtrade', 'warn', 65 + over.length * 3, over.length + ' journée(s) au-delà de ta limite de ' + o.maxTrades + ' trades ; les trades en trop : ' + coR(r) + '.', over.length + ' day(s) beyond your ' + o.maxTrades + '-trade limit; the extra trades: ' + coRen(r) + '.'); }
  }
  // 5) Après une perte : résultat moyen du trade suivant (même jour), comparé au reste.
  const after = [], other = [];
  all.forEach((t, i) => { const p = all[i - 1]; (p && p.date === t.date && p.pnl < 0 ? after : other).push(t.pnl); });
  if (after.length >= 3 && other.length >= 3) {
    const a = after.reduce((s, v) => s + v, 0) / after.length, b = other.reduce((s, v) => s + v, 0) / other.length;
    if (b - a >= 0.3) add('after-loss', 'warn', 45 + (b - a) * 10, 'Juste après une perte, ton trade suivant fait ' + coR(a, 2) + ' en moyenne, contre ' + coR(b, 2) + ' sinon : fais une pause après un SL.', 'Right after a loss, your next trade averages ' + coRen(a, 2) + ', vs ' + coRen(b, 2) + ' otherwise: take a break after a SL.');
  }
  // 6) Meilleur et pire setup (au moins 3 trades chacun).
  const bySetup = {};
  all.forEach(t => { if (t.setup) (bySetup[t.setup] = bySetup[t.setup] || []).push(t.pnl); });
  const setups = Object.entries(bySetup).filter(e => e[1].length >= 3).map(([k, v]) => ({ k, n: v.length, r: v.reduce((s, x) => s + x, 0) }));
  if (setups.length >= 2) {
    setups.sort((a, b) => b.r - a.r);
    const best = setups[0], worst = setups[setups.length - 1];
    if (best.r > 0) add('best-setup', 'good', 35 + best.r, 'Ton meilleur setup : « ' + best.k + ' » (' + coR(best.r) + ' sur ' + best.n + ' trades).', 'Your best setup: “' + best.k + '” (' + coRen(best.r) + ' over ' + best.n + ' trades).');
    if (worst.r < 0) add('worst-setup', 'warn', 40 - worst.r, '« ' + worst.k + ' » te coûte ' + coR(worst.r) + ' sur ' + worst.n + ' trades : à revoir ou à mettre de côté.', '“' + worst.k + '” costs you ' + coRen(worst.r) + ' over ' + worst.n + ' trades: rework it or set it aside.');
  }
  // 7) Bilan positif : période propre.
  if (!out.some(x => x.tone === 'warn')) {
    if (net > 0) add('clean', 'good', 30, o.period === 'day' ? 'Journée propre : ' + all.length + ' trade(s), ' + coR(net) + ', aucun signal d’alerte.' : 'Semaine propre : ' + coR(net) + ' sur ' + all.length + ' trades, aucun signal d’alerte.', o.period === 'day' ? 'Clean day: ' + all.length + ' trade(s), ' + coRen(net) + ', no warning sign.' : 'Clean week: ' + coRen(net) + ' over ' + all.length + ' trades, no warning sign.');
    else add('clean-loss', 'info', 25, 'Résultat négatif (' + coR(net) + ') mais sans erreur de comportement repérée : c’est le jeu, garde ton plan.', 'Negative result (' + coRen(net) + ') but no behavior mistake spotted: that is the game, stick to your plan.');
  }
  return out.sort((a, b) => b.score - a.score);
}
