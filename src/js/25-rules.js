// ── RÈGLES DU JOUR (alertes) ET EXPORT CSV ───────────────────────────────
// Règles chiffrées du Plan (max trades / jour, stop après N SL d'affilée) + perte max du jour : vérifiées sur les trades
// du jour, affichées en constat dans la barre « Aujourd'hui » et en alerte quand une règle est atteinte ou dépassée.
function todayRuleStatus() {
  const today = localDateStr();
  const list = trades.filter(t => t.date === today).sort((a, b) => (a.entry || '').localeCompare(b.entry || '') || (a.id || 0) - (b.id || 0));
  const maxT = planData && planData.maxTrades > 0 ? planData.maxTrades : null;
  const maxSL = planData && planData.maxConsecSL > 0 ? planData.maxConsecSL : null;
  let streak = 0;
  for (let i = list.length - 1; i >= 0 && list[i].res === 'SL'; i--) streak++;
  const pnl = list.reduce((s, t) => s + (typeof t.pnlEur === 'number' && !isNaN(t.pnlEur) ? t.pnlEur : 0), 0);
  const startBal = accountSize + trades.reduce((s, t) => s + (t.date && t.date < today && typeof t.pnlEur === 'number' && !isNaN(t.pnlEur) ? t.pnlEur : 0), 0);
  const ddLimit = Math.max(0, startBal) * loadDDLimitPct() / 100;
  const alerts = [];
  if (maxT && list.length > maxT) alerts.push({ lvl: 'crit', txt: `${list.length} trades aujourd'hui pour un maximum de ${maxT} : tu es au-delà de ton plan.` });
  else if (maxT && list.length === maxT) alerts.push({ lvl: 'warn', txt: `${maxT} trades sur ${maxT} aujourd'hui : maximum atteint, la journée est terminée.` });
  if (maxSL && streak >= maxSL) alerts.push({ lvl: 'crit', txt: `${streak} SL d'affilée aujourd'hui : ta règle dit d'arrêter après ${maxSL}.` });
  if (ddLimit > 0 && pnl < 0 && -pnl >= ddLimit) alerts.push({ lvl: 'crit', txt: `Perte du jour ${fmtEUR(pnl)} : limite de ${fmtEUR(ddLimit)} atteinte, stop pour aujourd'hui.` });
  return { n: list.length, maxT, streak, maxSL, alerts };
}
function renderRuleAlerts() {
  const el = document.getElementById('rule-alert');
  if (!el) return;
  const s = todayRuleStatus();
  if (!s.alerts.length) { el.style.display = 'none'; return; }
  const crit = s.alerts.some(a => a.lvl === 'crit');
  el.className = 'rule-alert ' + (crit ? 'crit' : 'warn');
  mount(el, html`<span class="fs-16" aria-hidden="true">${crit ? '🛑' : '⚠️'}</span><div class="rule-alert-txt"><b>${crit ? 'Règle de ton plan dépassée' : 'Limite de ton plan atteinte'}</b>${s.alerts.map(a => html`<span>${a.txt}</span>`)}</div><button class="btn-ghost" onclick="showPage('plan', document.querySelector('.nav-item[data-page=plan]'))">Voir le plan</button>`);
  el.style.display = 'flex';
}
// Constat permanent dans la barre « Aujourd'hui » quand des règles chiffrées existent.
function ruleInsightChips(chip) {
  const s = todayRuleStatus();
  if (!s.maxT && !s.maxSL) return [];
  const parts = [s.maxT ? s.n + '/' + s.maxT + ' trades' : '', s.maxSL ? s.streak + '/' + s.maxSL + ' SL d’affilée' : ''].filter(Boolean).join(' · ');
  const lvl = s.alerts.some(a => a.lvl === 'crit') ? 'red' : s.alerts.length ? 'amber' : 'green';
  return [chip('📏', 'Règles du jour', parts, lvl === 'green' ? 'OK' : lvl === 'red' ? 'dépassé' : 'limite', lvl, "showPage('plan', document.querySelector('.nav-item[data-page=plan]'))", '', 'Max trades par jour et SL d’affilée, réglés dans Plan de trading')];
}

// Export CSV pour Excel (FR) : séparateur « ; », virgule décimale, BOM UTF-8 pour les accents.
function csvCell(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return isFinite(v) ? String(v).replace('.', ',') : '';
  const s = String(v).replace(/\r?\n/g, ' ');
  return /[;"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function tradesToCSV(list) {
  const cols = [
    ['Date', t => t.date], ['Entrée', t => t.entry], ['Sortie', t => t.exit], ['Actif', t => t.asset], ['Sens', t => t.dir],
    ['Session', t => t.session], ['UT', t => t.tf], ['Setup', t => t.setup], ['Résultat', t => t.res],
    ['R visé', t => t.rr], ['R réalisé', t => t.pnl], ['P&L (€)', t => t.pnlEur],
    ['Prix d\'entrée', t => t.entryPrice], ['Stop', t => t.slPrice], ['Objectif', t => t.tpPrice], ['Prix de sortie', t => t.exitPrice],
    ['Taille', t => t.size], ['MAE (€)', t => t.mae], ['MFE (€)', t => t.mfe], ['Humeur (1-5)', t => t.emotion],
    ['Erreurs', t => (t.mistakes || []).join(', ')], ['Tags', t => (t.tags || []).join(', ')],
    ['Biais du jour', t => typeof watchAlignment === 'function' ? ({ with: 'avec', against: 'contre', neutral: 'neutre', none: '' })[watchAlignment(t)] : ''],
    ['Notes', t => t.desc], ['Revue', t => t.review]
  ];
  const sorted = list.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.entry || '').localeCompare(b.entry || ''));
  return '﻿' + [cols.map(c => csvCell(c[0])).join(';'), ...sorted.map(t => cols.map(c => csvCell(c[1](t))).join(';'))].join('\r\n');
}
function exportTradesCSV() {
  const list = viewTrades();
  if (!list.length) { showToast('Aucun trade à exporter', 'info'); return; }
  const blob = new Blob([tradesToCSV(list)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'journal-' + JOURNALS[JOURNAL_ID].slug + '-trades-' + localDateStr() + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast(list.length + ' trade' + (list.length > 1 ? 's' : '') + ' exporté' + (list.length > 1 ? 's' : '') + ' en CSV' + (filterActive() ? ' (filtre appliqué)' : '') + ' ✓', 'success');
}
