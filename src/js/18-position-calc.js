// ── CALCULATEUR DE TAILLE DE POSITION ───────────────────────────────────
// Le risque en € vient du plan de Scaling (taille du palier actuel) : une seule source pour le risque du journal.
// L'utilisateur peut le remplacer pour un trade particulier ; « reprendre le plan » revient à la valeur du Scaling.
function calcPlanRisk() {
  if (typeof scalingConfigured !== 'function' || !scalingConfigured()) return null;
  const now = scalingNow();
  return now ? { risk: now.cur.risk, label: (now.L === 0 ? 'taille de départ' : 'palier P' + now.L) + ' · ' + scPct(now.cur.pct) + ' de ' + fmtEUR(now.cur.bal) } : null;
}
function loadCalcState() { try { return JSON.parse(DB.getItem((JP + 'calc')) || 'null') || {}; } catch (e) { return {}; } }
function loadPositionCalc() {
  const raw = loadCalcState();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  set('calc-stop-dist', raw.stopDist);
  set('calc-point-value', raw.pointValue);
  renderPositionCalc();
}
function onCalcRiskInput() {
  const st = loadCalcState();
  const v = parseFloat(document.getElementById('calc-risk-eur').value);
  st.ownRisk = v > 0 ? v : null;
  DB.setItem((JP + 'calc'), JSON.stringify(st));
  renderPositionCalc();
}
function resetCalcRisk() {
  const st = loadCalcState();
  st.ownRisk = null;
  DB.setItem((JP + 'calc'), JSON.stringify(st));
  renderPositionCalc();
}
function renderPositionCalc() {
  const riskEl = document.getElementById('calc-risk-eur'), srcEl = document.getElementById('calc-risk-src');
  if (!riskEl) return;
  const st = loadCalcState(), plan = calcPlanRisk();
  // Anciennes versions : solde × % saisis dans le calculateur.
  const legacy = st.balance > 0 && st.riskPct > 0 ? st.balance * st.riskPct / 100 : null;
  const own = st.ownRisk > 0 ? st.ownRisk : (!plan && legacy ? legacy : null);
  const riskEur = own || (plan ? plan.risk : null);
  if (document.activeElement !== riskEl) riskEl.value = riskEur ? scRound(riskEur, 2) : '';
  if (srcEl) mount(srcEl, own && plan
    ? html`modifié · <button class="link-btn" onclick="resetCalcRisk()">reprendre le plan (${fmtEUR(plan.risk, false, 2)})</button>`
    : plan ? html`= ton plan de Scaling (${plan.label})` : html`règle ton plan dans <button class="link-btn" onclick="showPage('scaling', document.querySelector('.nav-item[data-page=scaling]'))">Scaling</button> pour le remplir automatiquement`);
  const stopDist = parseFloat(document.getElementById('calc-stop-dist').value);
  const pointValue = parseFloat(document.getElementById('calc-point-value').value);
  st.stopDist = stopDist; st.pointValue = pointValue;
  delete st.balance; delete st.riskPct;
  DB.setItem((JP + 'calc'), JSON.stringify(st));

  const cont = document.getElementById('calc-result');
  if (!cont) return;
  if (!(riskEur > 0) || !(stopDist > 0) || !(pointValue > 0)) {
    mount(cont, html`<div class="pc-empty">Renseigne la distance au stop et la valeur du point pour calculer la taille de position.</div>`);
    return;
  }
  const size = riskEur / (stopDist * pointValue);
  const cells = [
    ['Risque en €', fmtEUR(riskEur, false, 2)],
    ['Taille suggérée', fmtNum(size, 2) + ' unités/lots'],
    ['Perte si stop touché', '−' + fmtEUR(riskEur, false, 2)],
  ];
  mount(cont, html`${cells.map(([l, v]) => html`<div class="pc-cell">
    <div class="pc-label">${l}</div>
    <div class="pc-val">${v}</div>
  </div>`)}`);
}
