// ── CALCULATEUR DE TAILLE DE POSITION (RR) ─────────────────────────────
function loadPositionCalc() {
  try {
    const raw = JSON.parse(DB.getItem((JP + 'calc')) || 'null');
    if (raw) {
      document.getElementById('calc-balance').value = raw.balance ?? '';
      document.getElementById('calc-risk-pct').value = raw.riskPct ?? '';
      document.getElementById('calc-stop-dist').value = raw.stopDist ?? '';
      document.getElementById('calc-point-value').value = raw.pointValue ?? '';
    } else {
      document.getElementById('calc-balance').value = accountSize || '';
    }
  } catch (e) {}
  renderPositionCalc();
}

function renderPositionCalc() {
  const balance = parseFloat(document.getElementById('calc-balance').value);
  const riskPct = parseFloat(document.getElementById('calc-risk-pct').value);
  const stopDist = parseFloat(document.getElementById('calc-stop-dist').value);
  const pointValue = parseFloat(document.getElementById('calc-point-value').value);
  DB.setItem((JP + 'calc'), JSON.stringify({ balance, riskPct, stopDist, pointValue }));

  const cont = document.getElementById('calc-result');
  if (!cont) return;
  if (!(balance > 0) || !(riskPct > 0) || !(stopDist > 0) || !(pointValue > 0)) {
    cont.innerHTML = `<div style="grid-column:span 3;font-size:12px;color:var(--txt3)">Renseigne les 4 champs ci-dessus pour calculer la taille de position.</div>`;
    return;
  }
  const riskEur = balance * (riskPct / 100);
  const size = riskEur / (stopDist * pointValue);
  const cells = [
    ['Risque en €', riskEur.toFixed(2) + ' €'],
    ['Taille suggérée', size.toFixed(2) + ' unités/lots'],
    ['Perte si stop touché', '-' + riskEur.toFixed(2) + ' €'],
  ];
  cont.innerHTML = cells.map(([l,v]) => `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:12px;text-align:center">
    <div style="font-size:11px;font-family:var(--mono);color:var(--txt3);margin-bottom:6px">${l}</div>
    <div style="font-size:16px;font-weight:600;font-family:var(--mono);color:var(--amber)">${v}</div>
  </div>`).join('');
}

