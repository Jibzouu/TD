// ── GESTION DU RISQUE (page « Gestion du risque », carte du Dashboard, bandeaux des formulaires) ──
// Pensé pour un trader qui débute : l'arrêter AVANT l'erreur et protéger le capital de départ.
// 1) Garde-fou du jour : feu vert / orange / rouge (pertes du jour, de la semaine, du mois, pertes d'affilée, nombre de trades,
//    pause après une perte, plancher du capital) et « tu peux encore perdre X € aujourd'hui ».
// 2) Protection du capital : plancher (% du capital de départ) et réduction automatique du risque quand le compte baisse.
// 3) Parcours de progression : étapes (backtest → 0,25 % → 0,5 % → 1 %) débloquées sur des critères objectifs.
// 4) Discipline : score par jour, série de jours « propres », repères de taille anormale et de revanche.
// 5) Simulateur du risque de ruine (Monte-Carlo sur tes résultats en R).
// 6) Plan débutant prêt à l'emploi.

const RK_DEF = { maxConsec: 2, maxTrades: 3, pauseMin: 30, weekPct: 3, monthPct: 6, floorPct: 90, cuts: [[5, 0.5], [10, 0.25]] };
const RK_STAGES = [
  { name: ['Backtest', 'Backtest'], risk: 0.25, desc: ['Prouve ta stratégie sur l’historique avant d’y mettre de l’argent.', 'Prove your strategy on history before putting money on it.'] },
  { name: ['Live prudent', 'Careful live'], risk: 0.25, desc: ['Premiers trades réels avec un risque minuscule : on apprend à exécuter.', 'First real trades with a tiny risk: you learn to execute.'] },
  { name: ['Live intermédiaire', 'Intermediate live'], risk: 0.5, desc: ['La méthode tient en réel : le risque double, toujours petit.', 'The method holds live: risk doubles, still small.'] },
  { name: ['Rythme de croisière', 'Cruising'], risk: 1, desc: ['Risque normal de 1 %, tant que la discipline reste là.', 'Normal 1 % risk, as long as discipline holds.'] },
  { name: ['Personnalisé', 'Custom'], risk: null, custom: true, desc: ['Tu fixes toi-même ton risque max par trade : pas de critères imposés, le garde-fou et la protection du capital restent actifs.', 'You set your own max risk per trade: no imposed criteria, the guard and capital protection stay on.'] }
];
const RK_PATH_N = 4;   // étapes du parcours guidé (la 5e, « Personnalisé », est hors parcours)
// Plafond de risque (%) de l'étape : pour « Personnalisé », celui choisi par l'utilisateur (aucun plafond s'il est vide).
function rkStageCap(stage, prog) { return stage.custom ? (prog.customRisk > 0 ? prog.customRisk : null) : stage.risk; }
const rkL = (fr, en) => LANG === 'en' ? en : fr;
function rkCfg() { const c = loadJSON(JP + 'guard', null); return Object.assign({}, RK_DEF, c && typeof c === 'object' && !Array.isArray(c) ? c : {}); }
function rkSaveCfg(c) { try { DB.setItem(JP + 'guard', JSON.stringify(c)); } catch (e) { reportStorageError(e); } }
function rkProg() { const p = loadJSON(JP + 'prog', null); return p && typeof p === 'object' && p.stage >= 0 ? p : { stage: JOURNAL_TYPE === 'backtest' ? 0 : 0, since: localDateStr() }; }
function rkSaveProg(p) { try { DB.setItem(JP + 'prog', JSON.stringify(p)); } catch (e) {} }
const rkSortT = l => l.slice().sort((a, b) => ((a.date || '') + (a.entry || '')).localeCompare((b.date || '') + (b.entry || '')));
const rkEur = t => typeof t.pnlEur === 'number' && isFinite(t.pnlEur) ? t.pnlEur : 0;
const rkMonday = d => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return localDateStr(x); };

// ── Garde-fou ──
function rkGuard(day) {
  const cfg = rkCfg(), today = day || localDateStr(), all = rkSortT(trades);
  const eqI = rkEquity(accountSize, all.filter(t => !t.date || t.date <= today));
  const balBefore = d => accountSize + all.filter(t => t.date && t.date < d).reduce((s, t) => s + rkEur(t), 0);
  const pnlFrom = d => all.filter(t => t.date && t.date >= d && t.date <= today).reduce((s, t) => s + rkEur(t), 0);
  const wk = rkMonday(today), mo = today.slice(0, 8) + '01';
  const lim = { day: balBefore(today) * loadDDLimitPct() / 100, week: balBefore(wk) * cfg.weekPct / 100, month: balBefore(mo) * cfg.monthPct / 100 };
  const pnl = { day: pnlFrom(today), week: pnlFrom(wk), month: pnlFrom(mo) };
  const left = k => Math.max(0, lim[k] + Math.min(0, pnl[k]));
  const floor = accountSize * cfg.floorPct / 100, marginFloor = eqI.eq - floor;
  const todays = all.filter(t => t.date === today), streak = rkLossStreak(todays);
  const remaining = Math.max(0, Math.min(left('day'), left('week'), left('month'), Math.max(0, marginFloor)));
  const factor = rkFactor(eqI.dd * 100, cfg.cuts), prog = rkProg(), stage = RK_STAGES[Math.min(prog.stage, RK_STAGES.length - 1)];
  const plan = typeof calcPlanRisk === 'function' ? calcPlanRisk() : null;
  const capPct = rkStageCap(stage, prog), base = plan ? plan.risk : eqI.eq * 0.01, cap = capPct == null ? Infinity : eqI.eq * capPct / 100;
  const rec = Math.max(0, Math.min(base, cap) * factor);
  const rule = typeof todayRuleStatus === 'function' && !day ? todayRuleStatus() : { alerts: [] };
  const stops = [], warns = [];
  if (marginFloor <= 0) stops.push(rkL('Ton capital a touché ton plancher de ', 'Your capital hit your floor of ') + fmtEUR(floor) + rkL(' : arrête de trader en réel, reviens au backtest.', ': stop trading live, go back to backtesting.'));
  if (lim.day > 0 && left('day') <= 0) stops.push(rkL('Perte max du jour atteinte (', 'Daily max loss reached (') + fmtEUR(pnl.day) + ').');
  if (lim.week > 0 && left('week') <= 0) stops.push(rkL('Perte max de la semaine atteinte (', 'Weekly max loss reached (') + fmtEUR(pnl.week) + rkL(') : stop jusqu’à lundi.', '): stop until Monday.'));
  if (lim.month > 0 && left('month') <= 0) stops.push(rkL('Perte max du mois atteinte (', 'Monthly max loss reached (') + fmtEUR(pnl.month) + rkL(') : stop jusqu’au mois prochain.', '): stop until next month.'));
  if (cfg.maxConsec > 0 && streak >= cfg.maxConsec) stops.push(streak + rkL(' pertes d’affilée : stop pour aujourd’hui, ce n’est pas ta journée.', ' losses in a row: stop for today, it is not your day.'));
  if (cfg.maxTrades > 0 && todays.length >= cfg.maxTrades) stops.push(todays.length + rkL(' trades aujourd’hui (maximum ', ' trades today (max ') + cfg.maxTrades + rkL(') : la journée est terminée.', '): the day is over.'));
  rule.alerts.filter(a => !/^Perte du jour/.test(a.txt)).forEach(a => (a.lvl === 'crit' ? stops : warns).push(a.txt));   // la perte du jour est déjà vérifiée ci-dessus
  // Pause conseillée après une perte (heure de sortie du dernier SL du jour).
  const last = todays[todays.length - 1];
  if (!day && last && last.res === 'SL' && cfg.pauseMin > 0) {
    const m = rkMinutes(last.exit) ?? rkMinutes(last.entry), now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
    if (m != null && nowM >= m && nowM - m < cfg.pauseMin) { const end = m + cfg.pauseMin; warns.push(rkL('Pause conseillée jusqu’à ', 'Take a break until ') + String(Math.floor(end / 60) % 24).padStart(2, '0') + ':' + String(end % 60).padStart(2, '0') + rkL(' après ta perte : pas de trade de revanche.', ' after your loss: no revenge trade.')); }
  }
  if (factor < 1) warns.push(rkL('Ton compte est à −', 'Your account is at −') + fmtNum(eqI.dd * 100, 1) + rkL(' % de son plus haut : risque réduit à ', ' % from its peak: risk cut to ') + Math.round(factor * 100) + rkL(' % jusqu’à ce que tu remontes.', ' % until you recover.'));
  if (lim.day > 0 && remaining > 0 && remaining < lim.day * 0.35 && !stops.length) warns.push(rkL('Il ne te reste presque plus de marge aujourd’hui.', 'You have almost no room left today.'));
  if (cfg.maxConsec > 1 && streak === cfg.maxConsec - 1) warns.push(rkL('Encore une perte et ta journée s’arrête.', 'One more loss and your day stops.'));
  const flags = rkBehaviorFlags(all).filter(f => f.t.date >= localDateStr(new Date(Date.now() - 7 * 86400000)));
  if (flags.length) warns.push(flags.length + rkL(' trade(s) récent(s) avec une taille anormale ou pris par revanche.', ' recent trade(s) with an unusual size or taken in revenge.'));
  const level = stops.length ? 'stop' : warns.length ? 'warn' : 'ok';
  return { level, stops, warns, cfg, lim, pnl, capPct, remaining, remainDay: left('day'), floor, marginFloor, eq: eqI.eq, peak: eqI.peak, dd: eqI.dd, factor, rec, base, plan, stage, prog, streak, nToday: todays.length, flags };
}
function rkHeadline(g) {
  if (g.level === 'stop') return rkL('STOP pour aujourd’hui', 'STOP for today');
  if (g.level === 'warn') return rkL('Prudence', 'Be careful');
  return rkL('Feu vert : tu peux trader', 'Green light: you can trade');
}
function rkSentence(g) {
  return g.level === 'stop' ? g.stops[0]
    : rkL('Tu peux encore perdre ', 'You can still lose ') + fmtEUR(g.remaining, false, 0) + rkL(' aujourd’hui avant ta limite · risque conseillé ', ' today before your limit · suggested risk ') + fmtEUR(g.rec, false, 2) + rkL(' par trade.', ' per trade.');
}

// ── Discipline ──
function rkDayChecks(dayTrades, cfg) {
  const l = rkSortT(dayTrades), checks = [];
  const withStop = l.every(t => t.slPrice != null || t.rr != null || t.rSrc === 'prix');
  checks.push([rkL('Stop prévu sur chaque trade', 'Stop planned on every trade'), withStop]);
  const ck = l.filter(t => typeof tradeHasChecklist === 'function' && tradeHasChecklist(t));
  if (ck.length) checks.push([rkL('Checklist respectée', 'Checklist followed'), ck.every(tradeChecklistComplete)]);
  checks.push([rkL('Aucune erreur notée', 'No mistake logged'), l.every(t => !(t.mistakes || []).length)]);
  // Règles du jour : pas de trade après avoir atteint la limite de pertes d'affilée, de SL, de trades ou de perte.
  let run = 0, sl = 0, tp = 0, pnl = 0, broke = false;
  const maxSL = planData && planData.maxSL > 0 ? planData.maxSL : null, maxTP = planData && planData.maxTP > 0 ? planData.maxTP : null;
  l.forEach((t, i) => {
    if (i && ((cfg.maxConsec > 0 && run >= cfg.maxConsec) || (maxSL && sl >= maxSL) || (maxTP && tp >= maxTP) || (cfg.maxTrades > 0 && i >= cfg.maxTrades))) broke = true;
    if (t.res === 'SL') { run++; sl++; } else if (t.res === 'TP') { run = 0; tp++; }
    pnl += rkEur(t);
  });
  checks.push([rkL('Limites du jour respectées', 'Daily limits respected'), !broke]);
  return checks;
}
function rkDiscipline(list) {
  const cfg = rkCfg(), flags = rkBehaviorFlags(list), byDay = {};
  list.filter(t => t.date).forEach(t => { (byDay[t.date] = byDay[t.date] || []).push(t); });
  const days = Object.keys(byDay).sort().map(d => {
    const checks = rkDayChecks(byDay[d], cfg);
    const fl = flags.filter(f => f.t.date === d);
    checks.push([rkL('Taille dans le plan, pas de revanche', 'Size within plan, no revenge'), !fl.length]);
    const ok = checks.filter(c => c[1]).length;
    return { date: d, n: byDay[d].length, checks, score: ok / checks.length, clean: ok / checks.length >= 0.8 };
  });
  let streak = 0;
  for (let i = days.length - 1; i >= 0 && days[i].clean; i--) streak++;
  const recent = days.slice(-20);
  return { days, streak, avg: recent.length ? recent.reduce((s, d) => s + d.score, 0) / recent.length : null, flags };
}

// ── Parcours de progression ──
function rkBacktestTrades() {
  return ACCOUNTS.filter(a => a.type === 'backtest').flatMap(a => a.id === JOURNAL_ID ? trades : loadJSON(a.id + '_trades', []));
}
const rkRs = l => l.filter(t => typeof t.pnl === 'number' && ['TP', 'SL', 'BE'].includes(t.res) && (typeof rUsable !== 'function' || rUsable(t))).map(t => t.pnl);
function rkCriteria(stage) {
  const p = rkProg(), since = p.since || '0000';
  const bar = (label, val, target, fmt, ok) => ({ label, val, target, pct: Math.max(0, Math.min(1, target ? val / target : 0)), txt: fmt, ok });
  if (stage === 0) {
    const bt = rkBacktestTrades(), rs = rkRs(bt), e = rkExpectancy(rs);
    return [bar(rkL('Trades en backtest', 'Backtest trades'), bt.length, 50, bt.length + ' / 50', bt.length >= 50),
      bar(rkL('Espérance positive', 'Positive expectancy'), e != null && e > 0 ? 1 : 0, 1, e == null ? '—' : fmtR(e, 2) + rkL(' par trade', ' per trade'), e != null && e > 0)];
  }
  if (stage >= RK_PATH_N - 1) return [];
  const list = trades.filter(t => t.date && t.date >= since && ['TP', 'SL', 'BE'].includes(t.res)), rs = rkRs(list), n = list.length;
  const need = stage === 1 ? 30 : 50, disc = rkDiscipline(trades.filter(t => t.date && t.date >= since)).avg;
  const out = [bar(rkL('Trades à cette étape', 'Trades at this step'), n, need, n + ' / ' + need, n >= need),
    bar(rkL('Discipline moyenne', 'Average discipline'), disc || 0, 0.8, disc == null ? '—' : Math.round(disc * 100) + ' % / 80 %', disc != null && disc >= 0.8)];
  const e = rkExpectancy(rs);
  if (stage === 1) out.push(bar(rkL('Espérance positive ou nulle', 'Expectancy ≥ 0'), e != null && e >= 0 ? 1 : 0, 1, e == null ? '—' : fmtR(e, 2), e != null && e >= 0));
  if (stage === 2) {
    const pf = rkProfitFactor(rs), dd = rkEquity(accountSize, trades.filter(t => t.date && t.date >= since)).maxDD;
    out.push(bar(rkL('Profit factor ≥ 1,2', 'Profit factor ≥ 1.2'), pf == null ? 0 : Math.min(pf, 1.2), 1.2, pf == null ? '—' : pf === Infinity ? '∞' : fmtNum(pf, 2), pf != null && pf >= 1.2));
    out.push(bar(rkL('Baisse max < 10 %', 'Max drawdown < 10 %'), dd < 0.1 ? 1 : 0, 1, fmtNum(dd * 100, 1) + ' %', dd < 0.1));
  }
  return out;
}
function rkSetStage(s, confirmMsg) {
  if (confirmMsg && !confirm(confirmMsg)) { renderRiskPage(); return; }
  const prev = rkProg();
  rkSaveProg({ stage: Math.max(0, Math.min(RK_STAGES.length - 1, s)), since: localDateStr(), customRisk: prev.customRisk });
  renderRiskPage(); safeRun(renderGuardCard, 'renderGuardCard');
}

// ── Plan débutant ──
const RK_BEGINNER_ITEMS = ['Stop loss placé avant d’entrer', 'RR d’au moins 1,5', 'Risque ≤ 1 % du capital', 'Pas de trade dans les 30 min après une perte'];
function applyBeginnerPlan(silent, keepCore) {
  if (!silent && !confirm(rkL('Appliquer le plan débutant ? Tes limites du jour, ton garde-fou et ta checklist seront mis à jour (tes trades ne changent pas).', 'Apply the beginner plan? Your daily limits, guard and checklist will be updated (your trades stay the same).'))) return;
  rkSaveCfg(Object.assign({}, RK_DEF));
  if (!keepCore) {
    if (loadDDLimitPct() > 1) DB.setItem(JP + 'dd_limit_pct', '1');
    if (planData) { planData.maxSL = 2; if (!(planData.maxTP > 0)) planData.maxTP = 2; }
    const st = typeof getScalingState === 'function' && typeof scalingConfigured === 'function' && scalingConfigured() ? getScalingState() : null;
    if (st && st.riskPct > 1) { st.riskPct = 1; saveScalingState(); }
  }
  if (planData) {
    if (!Array.isArray(planData.entryItems) || !planData.entryItems.length) planData.entryItems = (typeof CHECKLIST_ENTRY !== 'undefined' ? CHECKLIST_ENTRY.slice() : []);
    RK_BEGINNER_ITEMS.forEach(x => { if (!planData.entryItems.includes(x)) planData.entryItems.push(x); });
    planData.risk = Array.isArray(planData.risk) ? planData.risk : [];
    [['RR minimum', '1,5'], ['Trade sans stop', 'jamais'], ['Pertes d’affilée max', '2 puis stop']].forEach(r => { if (!planData.risk.some(x => x[0] === r[0])) planData.risk.push(r); });
    DB.setItem(JP + 'plan', JSON.stringify(planData));
  }
  if (!silent) { showToast(rkL('Plan débutant appliqué ✓', 'Beginner plan applied ✓'), 'success'); renderAll(); renderRiskPage(); }
}

// ── Carte du Dashboard ──
function renderGuardCard() {
  const el = document.getElementById('guard-card');
  if (!el) return;
  const g = rkGuard(), d = rkDiscipline(trades), closed = trades.filter(t => ['TP', 'SL', 'BE'].includes(t.res)).length;
  const chip = (lbl, val, sub, tone) => html`<div class="gc-chip"><span>${lbl}</span><b class="${raw(tone ? 'tone-' + tone : '')}">${val}</b>${sub ? html`<small>${sub}</small>` : ''}</div>`;
  el.className = 'guard-card g-' + g.level;
  el.hidden = false;
  mount(el, html`<button class="gc-main" onclick="showPage('risque', document.querySelector('.nav-item[data-page=risque]'))" title="${rkL('Ouvrir la gestion du risque', 'Open risk management')}">
      <span class="gc-light" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="gc-txt"><b>${rkHeadline(g)}</b><span>${rkSentence(g)}</span>${(g.level === 'stop' ? g.stops.slice(1) : g.warns).slice(0, 2).map(w => html`<small>• ${w}</small>`)}</span>
    </button>
    <div class="gc-chips">
      ${chip(rkL('Reste aujourd’hui', 'Left today'), fmtEUR(g.remaining, false, 0), rkL('avant ta limite', 'before your limit'), g.remaining <= 0 ? 'red' : null)}
      ${chip(rkL('Risque conseillé', 'Suggested risk'), fmtEUR(g.rec, false, 2), g.factor < 1 ? rkL('réduit (compte en baisse)', 'reduced (account down)') : rkL('plafond de ton étape : ', 'your step cap: ') + guideText(g.stage.name), g.factor < 1 ? 'amber' : null)}
      ${chip(rkL('Capital protégé', 'Protected capital'), fmtEUR(Math.max(0, g.marginFloor), false, 0), rkL('au-dessus du plancher', 'above the floor'), g.marginFloor <= 0 ? 'red' : g.marginFloor < accountSize * 0.03 ? 'amber' : 'green')}
      ${chip(rkL('Discipline', 'Discipline'), d.avg == null ? '—' : Math.round(d.avg * 100) + ' %', d.streak ? d.streak + rkL(' jour(s) propre(s) d’affilée', ' clean day(s) in a row') : rkL('20 derniers jours', 'last 20 days'), d.avg == null ? null : d.avg >= 0.8 ? 'green' : d.avg >= 0.6 ? 'amber' : 'red')}
    </div>
    ${closed > 0 && closed < 100 ? html`<p class="gc-note">📏 ${closed} ${rkL('trade(s) : c’est trop tôt pour juger ta stratégie — vise 100 trades avant de tirer des conclusions.', 'trade(s): too early to judge your strategy — aim for 100 trades before drawing conclusions.')}</p>` : ''}`);
}
// Bandeau dans le formulaire de trade et la saisie rapide quand le garde-fou n'est pas au vert.
function rkFormBanners() {
  const g = rkGuard();
  ['guard-form-banner', 'guard-qa-banner'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    if (g.level === 'ok') { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'guard-mini g-' + g.level;
    mount(el, html`<span aria-hidden="true">${g.level === 'stop' ? '🛑' : '⚠️'}</span><span><b>${rkHeadline(g)}</b> — ${g.level === 'stop' ? g.stops[0] : g.warns[0]} ${g.level === 'stop' ? rkL('Enregistre ce trade s’il est déjà pris, mais n’en ouvre pas de nouveau.', 'Log this trade if already taken, but do not open a new one.') : ''}</span>`);
  });
}

// ── Page « Gestion du risque » ──
let RK_SIM = { riskSel: 1, trades: 200, dd: 20, src: 'auto', wr: 45, be: 10, win: 2, loss: 1 };
function rkSetCfg(k, v) {
  const c = rkCfg(), n = parseFloat(String(v).replace(',', '.'));
  if (k.startsWith('cut')) { const [i, j] = k.slice(3).split('_').map(Number); c.cuts = (c.cuts || RK_DEF.cuts).map(x => x.slice()); if (isFinite(n) && n >= 0) c.cuts[i][j] = j === 1 ? Math.min(1, n / 100) : n; }
  else c[k] = isFinite(n) && n >= 0 ? n : RK_DEF[k];
  rkSaveCfg(c); renderRiskPage(); safeRun(renderGuardCard, 'renderGuardCard');
}
// Réglages partagés avec Paramètres (perte max du jour) et le Plan de trading (TP / SL max) : modifiables ici aussi.
function rkSetCustomRisk(v) {
  const p = rkProg(), n = parseFloat(String(v).replace(',', '.'));
  p.customRisk = n > 0 ? Math.min(n, 100) : null;
  rkSaveProg(p); renderRiskPage(); safeRun(renderGuardCard, 'renderGuardCard');
}
function rkSetDayLimit(v) {
  const n = parseFloat(String(v).replace(',', '.'));
  if (!(n > 0)) { showToast(rkL('Indique un pourcentage supérieur à 0', 'Enter a percentage above 0'), 'error'); renderRiskPage(); return; }
  DB.setItem(JP + 'dd_limit_pct', String(n));
  const acc = document.getElementById('dd-limit-pct'); if (acc) acc.value = n;
  renderAll(); renderRiskPage();
}
function rkSetPlanMax(k, v) {
  if (!planData) return;
  const n = parseInt(v, 10);
  planData[k] = n > 0 ? n : null;
  DB.setItem(JP + 'plan', JSON.stringify(planData));
  renderAll(); renderRiskPage();
}
function rkSimSet(k, v) { RK_SIM[k] = k === 'src' ? v : parseFloat(String(v).replace(',', '.')) || 0; renderRiskSim(); }
function renderRiskPage() {
  const page = document.getElementById('page-risque'); if (!page) return;
  const g = rkGuard(), c = g.cfg, d = rkDiscipline(trades);
  const go = p => "showPage('" + p + "', document.querySelector('.nav-item[data-page=" + p + "]'))";
  const num = (k, label, hint, unit, step) => html`<label class="rk-f"><span>${label}<small>${hint}</small></span><span class="rk-in"><input type="number" min="0" step="${step || 1}" value="${c[k]}" onchange="${raw("rkSetCfg('" + k + "', this.value)")}"><em>${unit}</em></span></label>`;
  // 1) Garde-fou
  mount('rk-guard', html`<div class="rk-status g-${raw(g.level)}"><span class="gc-light" aria-hidden="true"><i></i><i></i><i></i></span><div><b>${rkHeadline(g)}</b><p>${rkSentence(g)}</p>
      ${(g.level === 'stop' ? g.stops.slice(1) : []).concat(g.warns).length ? html`<ul>${(g.level === 'stop' ? g.stops.slice(1) : []).concat(g.warns).map(x => html`<li>${x}</li>`)}</ul>` : ''}</div></div>
    <div class="rk-kpis">
      ${[[rkL('Aujourd’hui', 'Today'), g.pnl.day, g.lim.day], [rkL('Cette semaine', 'This week'), g.pnl.week, g.lim.week], [rkL('Ce mois-ci', 'This month'), g.pnl.month, g.lim.month]].map(([l, p, lim]) => {
        const used = lim > 0 ? Math.min(1, Math.max(0, -p) / lim) : 0;
        return html`<div class="rk-kpi"><span>${l}</span><b class="tone-${raw(p >= 0 ? 'green' : 'red')}">${fmtEUR(p, true, 0)}</b><div class="rk-meter"><i class="${raw(used >= 1 ? 'red' : used >= 0.65 ? 'amber' : 'green')}" style="${raw('width:' + Math.round(used * 100) + '%')}"></i></div><small>${rkL('limite ', 'limit ')}${fmtEUR(-lim, false, 0)}</small></div>`;
      })}
    </div>
    <div class="rk-grid">
      ${num('maxConsec', rkL('Pertes d’affilée max', 'Max losses in a row'), rkL('ensuite : stop pour la journée', 'then: stop for the day'), rkL('pertes', 'losses'))}
      ${num('maxTrades', rkL('Trades max par jour', 'Max trades per day'), rkL('moins de trades, meilleurs trades', 'fewer trades, better trades'), 'trades')}
      ${num('pauseMin', rkL('Pause après une perte', 'Break after a loss'), rkL('pour éviter le trade de revanche', 'to avoid revenge trading'), 'min')}
      ${num('weekPct', rkL('Perte max de la semaine', 'Weekly max loss'), rkL('du solde du lundi', 'of Monday’s balance'), '%', 0.5)}
      ${num('monthPct', rkL('Perte max du mois', 'Monthly max loss'), rkL('du solde du 1er du mois', 'of the 1st-of-month balance'), '%', 0.5)}
      <label class="rk-f"><span>${rkL('Perte max du jour', 'Daily max loss')}<small>${rkL('du solde en début de journée (aussi dans Paramètres)', 'of the start-of-day balance (also in Settings)')}</small></span><span class="rk-in"><input type="number" id="rk-dd-day" min="0.1" step="0.1" value="${loadDDLimitPct()}" onchange="rkSetDayLimit(this.value)"><em>%</em></span></label>
      <label class="rk-f"><span>${rkL('TP max par jour', 'Max TP per day')}<small>${rkL('objectif atteint : la journée s’arrête (aussi dans le Plan)', 'target hit: the day stops (also in the Plan)')}</small></span><span class="rk-in"><input type="number" id="rk-max-tp" min="0" step="1" value="${(planData && planData.maxTP) || ''}" placeholder="—" onchange="rkSetPlanMax('maxTP', this.value)"><em>TP</em></span></label>
      <label class="rk-f"><span>${rkL('SL max par jour', 'Max SL per day')}<small>${rkL('limite atteinte : stop pour aujourd’hui (aussi dans le Plan)', 'limit hit: stop for today (also in the Plan)')}</small></span><span class="rk-in"><input type="number" id="rk-max-sl" min="0" step="1" value="${(planData && planData.maxSL) || ''}" placeholder="—" onchange="rkSetPlanMax('maxSL', this.value)"><em>SL</em></span></label>
    </div>`);
  // 2) Protection du capital
  const lo = Math.min(g.floor, g.eq) * 0.98, hi = Math.max(g.peak, accountSize) * 1.02, pos = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo || 1) * 100));
  mount('rk-capital', html`<div class="rk-cap">
      <div class="rk-cap-bar"><span class="rk-cap-floor" style="${raw('width:' + pos(g.floor) + '%')}"></span>
        ${[[g.floor, rkL('Plancher', 'Floor'), 'floor'], [accountSize, rkL('Départ', 'Start'), 'start'], [g.peak, rkL('Plus haut', 'Peak'), 'peak'], [g.eq, rkL('Maintenant', 'Now'), 'now']].map(([v, l, k]) => html`<span class="${raw('rk-mark ' + k)}" style="${raw('left:' + pos(v) + '%')}"><i></i><small>${l}<br><b>${fmtEUR(v, false, 0)}</b></small></span>`)}</div>
      <div class="rk-cap-txt">
        <p>${rkL('Marge avant le plancher : ', 'Room above the floor: ')}<b class="tone-${raw(g.marginFloor > 0 ? 'green' : 'red')}">${fmtEUR(g.marginFloor, false, 0)}</b> · ${rkL('baisse depuis le plus haut : ', 'drawdown from peak: ')}<b>${fmtNum(g.dd * 100, 1)} %</b></p>
        <p>${rkL('Risque conseillé maintenant : ', 'Suggested risk now: ')}<b>${fmtEUR(g.rec, false, 2)}</b> <small>= ${g.plan ? rkL('ton plan de Scaling', 'your Scaling plan') + ' (' + fmtEUR(g.base, false, 2) + ')' : rkL('1 % du capital', '1 % of capital')}, ${g.capPct == null ? rkL('sans plafond d’étape', 'no step cap') : rkL('plafonné par ton étape', 'capped by your step') + ' (' + fmtRate(g.capPct, 2) + ')'}${g.factor < 1 ? rkL(', réduit à ', ', cut to ') + Math.round(g.factor * 100) + ' %' : ''}</small></p>
      </div></div>
    <div class="rk-grid">
      ${num('floorPct', rkL('Plancher du capital', 'Capital floor'), rkL('du capital de départ — en dessous : retour au backtest', 'of starting capital — below it: back to backtesting'), '%')}
      ${(c.cuts || []).map((cut, i) => html`<label class="rk-f"><span>${rkL('Si le compte baisse de', 'If the account drops by')} ${cut[0]} %<small>${rkL('depuis son plus haut, le risque passe à', 'from its peak, risk becomes')}</small></span><span class="rk-in rk-in2"><input type="number" min="0" step="1" value="${cut[0]}" onchange="${raw("rkSetCfg('cut" + i + "_0', this.value)")}"><em>%</em><input type="number" min="5" max="100" step="5" value="${Math.round(cut[1] * 100)}" onchange="${raw("rkSetCfg('cut" + i + "_1', this.value)")}"><em>${rkL('% du risque', '% of risk')}</em></span></label>`)}
    </div>`);
  // 3) Parcours
  const st = g.prog.stage, custom = !!RK_STAGES[st].custom, crit = custom ? [] : rkCriteria(st), ready = crit.length && crit.every(x => x.ok);
  mount('rk-path', html`<ol class="rk-steps">${RK_STAGES.map((s, i) => html`<li class="${raw((s.custom ? 'custom ' : '') + (!custom && i < st ? 'done' : i === st ? 'cur' : ''))}"><span class="rk-dot">${!custom && i < st ? '✓' : s.custom ? '✎' : i + 1}</span><b>${guideText(s.name)}</b><small>${s.custom ? (g.prog.customRisk > 0 ? fmtRate(g.prog.customRisk, 2) + rkL(' par trade', ' per trade') : rkL('ton propre risque', 'your own risk')) : i === 0 ? rkL('aucun risque réel', 'no real risk') : fmtRate(s.risk, 2) + rkL(' par trade', ' per trade')}</small></li>`)}</ol>
    <div class="rk-path-cur"><p><b>${rkL('Ton étape : ', 'Your step: ')}${guideText(RK_STAGES[st].name)}</b> — ${guideText(RK_STAGES[st].desc)}</p>
      ${custom ? html`<label class="rk-f rk-custom"><span>${rkL('Ton risque max par trade', 'Your max risk per trade')}<small>${rkL('plafond du « risque conseillé » ; laisse vide pour suivre seulement ton plan de Scaling', 'cap of the “suggested risk”; leave empty to follow only your Scaling plan')}</small></span><span class="rk-in"><input type="number" id="rk-custom-risk" min="0.05" max="100" step="0.05" value="${g.prog.customRisk > 0 ? g.prog.customRisk : ''}" placeholder="—" onchange="rkSetCustomRisk(this.value)"><em>%</em></span></label>`
      : crit.length ? html`<div class="rk-crit">${crit.map(x => html`<div class="rk-crit-row"><span>${x.ok ? '✅' : '⬜'} ${x.label}</span><div class="rk-meter"><i class="${raw(x.ok ? 'green' : 'accent')}" style="${raw('width:' + Math.round(x.pct * 100) + '%')}"></i></div><b>${x.txt}</b></div>`)}</div>`
        : html`<p class="tone-muted">${rkL('Dernière étape : garde la discipline, et reviens en arrière si ta discipline ou ton compte baissent.', 'Last step: keep your discipline, and step back if your discipline or account drop.')}</p>`}
      <div class="rk-path-act">
        ${!custom && st < RK_PATH_N - 1 ? html`<button class="btn-primary" ${raw(ready ? '' : 'disabled')} onclick="${raw('rkSetStage(' + (st + 1) + ')')}">${ready ? rkL('Passer à l’étape suivante →', 'Move to the next step →') : rkL('Étape suivante : critères à remplir', 'Next step: criteria to meet')}</button>` : ''}
        ${!custom && st > 0 ? html`<button class="btn-ghost" onclick="${raw('rkSetStage(' + (st - 1) + ')')}">← ${rkL('Revenir à l’étape précédente', 'Go back a step')}</button>` : ''}
        <label class="rk-pick">${rkL('Déjà expérimenté ? Choisir mon étape :', 'Already experienced? Pick my step:')} <select onchange="${raw("rkSetStage(+this.value, '" + rkL('Changer d’étape à la main ? Les critères repartent d’aujourd’hui.', 'Change step manually? Criteria restart from today.').replace(/'/g, '’') + "')")}">${RK_STAGES.map((s, i) => html`<option value="${i}" ${raw(i === st ? 'selected' : '')}>${i + 1}. ${guideText(s.name)}</option>`)}</select></label>
      </div></div>`);
  // 4) Discipline
  const lastDays = d.days.slice(-10).reverse();
  mount('rk-disc', html`<div class="rk-kpis">
      <div class="rk-kpi"><span>${rkL('Discipline (20 jours)', 'Discipline (20 days)')}</span><b class="tone-${raw(d.avg == null ? 'muted' : d.avg >= 0.8 ? 'green' : d.avg >= 0.6 ? 'amber' : 'red')}">${d.avg == null ? '—' : Math.round(d.avg * 100) + ' %'}</b><small>${rkL('jour « propre » = 80 % des règles respectées', 'a “clean” day = 80 % of rules followed')}</small></div>
      <div class="rk-kpi"><span>${rkL('Série de jours propres', 'Clean-day streak')}</span><b>🔥 ${d.streak}</b><small>${rkL('jours d’affilée — c’est ça qui compte, pas le P&L', 'days in a row — this is what matters, not P&L')}</small></div>
      <div class="rk-kpi"><span>${rkL('Repères à surveiller', 'Warning signs')}</span><b class="tone-${raw(d.flags.length ? 'amber' : 'green')}">${d.flags.length}</b><small>${rkL('tailles anormales et trades de revanche', 'unusual sizes and revenge trades')}</small></div>
    </div>
    ${lastDays.length ? html`<table class="rk-table"><thead><tr><th>${rkL('Jour', 'Day')}</th><th>${rkL('Trades', 'Trades')}</th><th>Score</th><th>${rkL('À corriger', 'To fix')}</th></tr></thead><tbody>${lastDays.map(x => html`<tr><td>${fmtDateFR(x.date, true)}</td><td>${x.n}</td><td><b class="tone-${raw(x.clean ? 'green' : x.score >= 0.6 ? 'amber' : 'red')}">${Math.round(x.score * 100)} %</b></td><td class="tone-muted">${x.checks.filter(c => !c[1]).map(c => c[0]).join(' · ') || '✓'}</td></tr>`)}</tbody></table>`
      : html`<p class="empty-note">${rkL('Ton score de discipline apparaîtra dès tes premiers trades.', 'Your discipline score will appear with your first trades.')}</p>`}
    ${d.flags.length ? html`<div class="rk-flags">${d.flags.slice(-6).reverse().map(f => html`<button class="rk-flag" onclick="${raw('openTradeDetail(' + f.t.id + ')')}">${f.kind === 'revenge' ? '😤 ' + rkL('Revanche', 'Revenge') : '📏 ' + rkL('Taille anormale', 'Unusual size')} · ${fmtDateNum(f.t.date)} ${f.t.entry || ''} · ${f.t.asset || ''} · ${rkL('risque', 'risk')} ${fmtEUR(f.risk, false, 0)} (${rkL('habituel', 'usual')} ${fmtEUR(f.ref, false, 0)})</button>`)}</div>` : ''}`);
  // 6) Plan débutant
  mount('rk-beginner', html`<ul class="rk-rules">
      <li>${rkL('Risque ≤ 1 % du capital par trade (ton étape peut le baisser encore)', 'Risk ≤ 1 % of capital per trade (your step may lower it further)')}</li>
      <li>${rkL('Perte max : 1 % par jour, 3 % par semaine, 6 % par mois', 'Max loss: 1 % per day, 3 % per week, 6 % per month')}</li>
      <li>${rkL('2 pertes d’affilée → stop pour la journée · 3 trades max par jour', '2 losses in a row → stop for the day · 3 trades max per day')}</li>
      <li>${rkL('Pause de 30 min après une perte · aucun trade sans stop · RR d’au moins 1,5', '30-min break after a loss · no trade without a stop · RR of at least 1.5')}</li>
      <li>${rkL('Plancher à 90 % du capital de départ ; risque divisé par 2 à −5 %, par 4 à −10 %', 'Floor at 90 % of starting capital; risk halved at −5 %, quartered at −10 %')}</li>
    </ul><button class="btn-primary" onclick="applyBeginnerPlan()">${rkL('Appliquer le plan débutant', 'Apply the beginner plan')}</button>`);
  renderRiskSim();
}
// 5) Simulateur
let rkSimChart = null;
function renderRiskSim() {
  const el = document.getElementById('rk-sim'); if (!el) return;
  const rs = rkRs(trades), auto = RK_SIM.src === 'auto' && rs.length >= 20, S = RK_SIM;
  const w = rs.filter(r => r > 0), l = rs.filter(r => r < 0);
  const base = auto ? { rs } : { pWin: S.wr / 100, pBE: S.be / 100, avgWin: S.win, avgLoss: S.loss };
  const risks = [0.25, 0.5, 1, 1.5, 2, 3];
  const res = risks.map(r => Object.assign({ r }, rkSimulate(Object.assign({ riskPct: r, trades: S.trades, ddLimit: S.dd, runs: 2500 }, base))));
  const safe = res.filter(x => x.pRuin < 0.05).map(x => x.r).pop();
  const pct = v => Math.round(v * 100) + ' %', sgn = v => (v >= 0 ? '+' : '−') + Math.round(Math.abs(v) * 100) + ' %';
  if (!risks.includes(S.riskSel)) S.riskSel = 1;
  const sel = res.find(x => x.r === S.riskSel);
  mount(el, html`<div class="rk-sim-in">
      <label class="rk-f"><span>${rkL('Données', 'Data')}</span><select onchange="rkSimSet('src', this.value)"><option value="auto" ${raw(RK_SIM.src === 'auto' ? 'selected' : '')}>${rkL('Mes trades', 'My trades')} (${rs.length} R)</option><option value="manual" ${raw(RK_SIM.src === 'manual' ? 'selected' : '')}>${rkL('Hypothèses', 'Assumptions')}</option></select></label>
      ${!auto ? html`<label class="rk-f"><span>${rkL('Win rate', 'Win rate')}</span><span class="rk-in"><input type="number" value="${S.wr}" min="1" max="99" onchange="rkSimSet('wr', this.value)"><em>%</em></span></label>
        <label class="rk-f"><span>${rkL('Break-even', 'Break-even')}</span><span class="rk-in"><input type="number" value="${S.be}" min="0" max="90" onchange="rkSimSet('be', this.value)"><em>%</em></span></label>
        <label class="rk-f"><span>${rkL('Gain moyen', 'Average win')}</span><span class="rk-in"><input type="number" value="${S.win}" step="0.1" min="0.1" onchange="rkSimSet('win', this.value)"><em>R</em></span></label>` : ''}
      <label class="rk-f"><span>${rkL('Nombre de trades', 'Number of trades')}</span><select onchange="rkSimSet('trades', this.value)">${[100, 200, 500].map(n => html`<option ${raw(n === S.trades ? 'selected' : '')}>${n}</option>`)}</select></label>
      <label class="rk-f"><span>${rkL('Baisse redoutée', 'Feared drawdown')}</span><select onchange="rkSimSet('dd', this.value)">${[10, 20, 30, 50].map(n => html`<option value="${n}" ${raw(n === S.dd ? 'selected' : '')}>−${n} %</option>`)}</select></label>
    </div>
    ${RK_SIM.src === 'auto' && rs.length < 20 ? html`<p class="gc-note">${rkL('Pas encore 20 trades avec un R : la simulation utilise des hypothèses (45 % de gagnants, 10 % de BE, gains de 2R).', 'Not 20 trades with an R yet: the simulation uses assumptions (45 % winners, 10 % BE, 2R wins).')}</p>`
      : auto ? html`<p class="gc-note">${rkL('Basé sur tes ', 'Based on your ')}${rs.length}${rkL(' trades : ', ' trades: ')}${w.length} ${rkL('gagnants', 'winners')} (${fmtR(w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0, 2)} ${rkL('en moyenne', 'avg')}), ${l.length} ${rkL('perdants', 'losers')} (${fmtR(l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0, 2)}).</p>` : ''}
    <table class="rk-table rk-sim-t"><thead><tr><th>${rkL('Risque par trade', 'Risk per trade')}</th><th>${rkL('Chance de perdre ', 'Chance of losing ')}${S.dd} %</th><th>${rkL('Baisse max typique', 'Typical max drawdown')}</th><th>${rkL('Résultat médian', 'Median result')}</th><th>${rkL('Mauvais cas (1 sur 20)', 'Bad case (1 in 20)')}</th></tr></thead>
      <tbody>${res.map(x => html`<tr class="${raw((x.r === S.riskSel ? 'sel ' : '') + (x.r === safe ? 'safe' : ''))}" onclick="${raw('rkSimSet(\'riskSel\', ' + x.r + ')')}"><td><b>${fmtRate(x.r, 2)}</b>${x.r === safe ? html` <span class="rk-badge">${rkL('conseillé', 'suggested')}</span>` : ''}</td>
        <td><b class="tone-${raw(x.pRuin < 0.05 ? 'green' : x.pRuin < 0.2 ? 'amber' : 'red')}">${pct(x.pRuin)}</b></td><td>−${pct(x.ddMed)}</td><td class="tone-${raw(x.ret50 >= 0 ? 'green' : 'red')}">${sgn(x.ret50)}</td><td class="tone-${raw(x.ret5 >= 0 ? 'green' : 'red')}">${sgn(x.ret5)}</td></tr>`)}</tbody></table>
    <p class="rk-sim-msg">${safe ? html`💡 ${rkL('Avec ces chiffres, rester à ', 'With these numbers, staying at ')}<b>${fmtRate(safe, 2)}</b>${rkL(' par trade ou moins garde moins de 5 % de risque de perdre ', ' per trade or less keeps under 5 % chance of losing ')}${S.dd} %${rkL(' de ton compte sur ', ' of your account over ')}${S.trades} trades.`
      : html`⚠️ ${rkL('Même à 0,25 %, le risque de perdre ', 'Even at 0.25 %, the chance of losing ')}${S.dd} %${rkL(' reste élevé : ta stratégie doit d’abord s’améliorer en backtest.', ' stays high: your strategy must improve in backtesting first.')}`}</p>
    <div class="chart-wrap h-220"><canvas id="rk-sim-chart"></canvas></div>
    <p class="gc-note">${rkL('Courbes pour ', 'Curves for ')}${fmtRate(S.riskSel, 2)} ${rkL('par trade (clique une ligne du tableau) : cas médian, bon cas et mauvais cas (1 sur 20).', 'per trade (click a table row): median, good and bad case (1 in 20).')}</p>`);
  if (typeof Chart === 'undefined' || !chartsAvailable('rk-sim-chart')) return;
  if (rkSimChart) { rkSimChart.destroy(); rkSimChart = null; }
  const tk = chartTokens(), lab = sel.band[0].map((_, i) => i);
  const ds = (arr, label, color, fill) => ({ label, data: arr.map(v => Math.round(accountSize * v)), borderColor: color, backgroundColor: withAlpha(color, .12), borderWidth: 2, pointRadius: 0, fill, tension: .25 });
  rkSimChart = new Chart(document.getElementById('rk-sim-chart').getContext('2d'), {
    type: 'line',
    data: { labels: lab, datasets: [ds(sel.band[2], rkL('Bon cas', 'Good case'), tk.green, false), ds(sel.band[1], rkL('Médian', 'Median'), tk.accent || '#5d6cf6', false), ds(sel.band[0], rkL('Mauvais cas', 'Bad case'), tk.red, false)] },
    options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true, labels: { boxWidth: 10, color: tk.txt2 } }, tooltip: proTooltip({ callbacks: { title: it => rkL('Trade ', 'Trade ') + it[0].label, label: c => c.dataset.label + '  ' + fmtEUR(c.raw, false, 0) } }) },
      scales: proScales({ xTicks: 8, y: { ticks: { callback: v => fmtEURCompact(v) } } }) },
    plugins: [refLinePlugin('rkStart', accountSize, rkL('départ', 'start'))]
  });
}

// Bandeaux : à l'ouverture du formulaire de trade et de la saisie rapide.
onReady(() => {
  ['openTradePanel', 'openQuickAdd'].forEach(fn => {
    const orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function () { const r = orig.apply(this, arguments); safeRun(rkFormBanners, 'rkFormBanners'); return r; };
  });
});
