// ── PROP FIRM : règles pré-remplies ────────────────────────────────────
// Un clic règle le suivi Prop Firm et la perte max du jour sur les règles courantes d'une offre connue.
// Valeurs typiques relevées en 2026 (en % du capital de départ) : les prop firms changent souvent leurs règles,
// d'où le rappel de vérifier sur leur site. daily = perte max du jour (0 = pas de limite journalière).
const PF_PRESETS = [
  { id: 'ftmo1', firm: 'FTMO', name: ['Challenge (étape 1)', 'Challenge (step 1)'], target: 10, daily: 5, maxdd: 10, dd: 'static', days: 4, cons: 0 },
  { id: 'ftmo2', firm: 'FTMO', name: ['Vérification (étape 2)', 'Verification (step 2)'], target: 5, daily: 5, maxdd: 10, dd: 'static', days: 4, cons: 0 },
  { id: 'the5ers1', firm: 'The5ers', name: ['High Stakes (étape 1)', 'High Stakes (step 1)'], target: 8, daily: 5, maxdd: 10, dd: 'static', days: 3, cons: 0 },
  { id: 'the5ers2', firm: 'The5ers', name: ['High Stakes (étape 2)', 'High Stakes (step 2)'], target: 5, daily: 5, maxdd: 10, dd: 'static', days: 3, cons: 0 },
  { id: 'fn1', firm: 'FundedNext', name: ['Stellar 2 étapes (étape 1)', 'Stellar 2-Step (step 1)'], target: 8, daily: 5, maxdd: 10, dd: 'static', days: 5, cons: 0 },
  { id: 'fn2', firm: 'FundedNext', name: ['Stellar 2 étapes (étape 2)', 'Stellar 2-Step (step 2)'], target: 5, daily: 5, maxdd: 10, dd: 'static', days: 5, cons: 0 },
  { id: 'topstep50', firm: 'Topstep', name: ['Trading Combine 50K', 'Trading Combine 50K'], target: 6, daily: 2, maxdd: 4, dd: 'trailing_eod', days: 2, cons: 50 },
  { id: 'apex50', firm: 'Apex', name: ['Évaluation 50K', 'Evaluation 50K'], target: 6, daily: 0, maxdd: 5, dd: 'trailing_intraday', days: 1, cons: 0 }
];
const pfL = (fr, en) => LANG === 'en' ? en : fr;
function renderPfPresets() {
  const el = document.getElementById('pf-presets');
  if (!el) return;
  const cur = DB.getItem(JP + 'pf_preset') || '';
  const firms = [...new Set(PF_PRESETS.map(p => p.firm))];
  mount(el, html`<label class="pf-preset-lbl">${pfL('Règles pré-remplies :', 'Pre-filled rules:')}
      <select id="pf-preset-select" class="filter-select" onchange="applyPfPreset(this.value)">
        <option value="">${pfL('— choisir ma prop firm —', '— pick my prop firm —')}</option>
        ${firms.map(f => html`<optgroup label="${f}">${PF_PRESETS.filter(p => p.firm === f).map(p => html`<option value="${p.id}" ${raw(p.id === cur ? 'selected' : '')}>${f} · ${guideText(p.name)}</option>`)}</optgroup>`)}
      </select></label>
    <small class="pf-preset-note">${pfL('Valeurs courantes en 2026 : vérifie toujours les règles exactes de ton offre sur le site de la prop firm, puis ajuste ci-dessous si besoin.', 'Common 2026 values: always check your plan’s exact rules on the prop firm’s site, then adjust below if needed.')}</small>`);
}
function applyPfPreset(id) {
  const p = PF_PRESETS.find(x => x.id === id);
  if (!p) return;
  const nm = p.firm + ' · ' + guideText(p.name);
  if (!confirm(pfL('Appliquer les règles « ', 'Apply the “') + nm + pfL(' » ? Objectif ', '” rules? Target ') + p.target + ' %, ' + pfL('perte max du jour ', 'daily max loss ') + (p.daily ? p.daily + ' %' : pfL('aucune', 'none')) + ', ' + pfL('perte totale max ', 'max total loss ') + p.maxdd + ' %, ' + p.days + pfL(' jour(s) minimum.', ' minimum day(s).'))) { renderPfPresets(); return; }
  savePfSetting('enabled', 1); savePfSetting('target_pct', p.target); savePfSetting('maxdd_pct', p.maxdd);
  savePfSetting('dd_type', p.dd); savePfSetting('min_days', p.days);
  savePfSetting('consistency_on', p.cons ? 1 : 0); if (p.cons) savePfSetting('consistency_pct', p.cons);
  // Pas de limite journalière chez cette prop firm : on garde la tienne (le garde-fou reste utile).
  if (p.daily > 0) { DB.setItem(JP + 'dd_limit_pct', String(p.daily)); const dd = document.getElementById('dd-limit-pct'); if (dd) dd.value = p.daily; }
  DB.setItem(JP + 'pf_preset', id);
  initPropFirmSettings(); renderPropFirm(); renderPfPresets();
  showToast(pfL('Règles « ', 'Rules “') + nm + pfL(' » appliquées ✓', '” applied ✓'), 'success');
}
