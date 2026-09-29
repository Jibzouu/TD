// ── PLAN ─────────────────────────────────────────────────────────────
const CHECKLIST_ENTRY = [
  'Contexte HTF aligné — bias confirmé',
  'Niveau clé identifié — OB / FVG / BOS',
  'Manipulation ou LQ sweep visible',
  'CHoCH ou confirmation sur LTF',
  'RR minimum atteint — 2R',
  'Aucune news dans les 30 prochaines minutes',
];
const CHECKLIST_FILTERS = [
  'News macro imminente',
  'Spread anormalement élevé',
  'Marché en range sans structure claire',
  '2 SL consécutifs dans la journée',
];
const RISK_RULES = [
  ['Risque par trade','0.5% du capital'],
  ['RR minimum','2R'],
  ['Max trades / jour','3'],
  ['Max perte journalière','1%'],
  ['Partiel à','1R — 50% de la position'],
];
const MISTAKE_TAGS = [
  'Entrée trop tôt',
  'Entrée trop tard / FOMO',
  'Stop déplacé',
  'Taille trop grande',
  'Sorti trop tôt',
  'Revenge trade',
  'Trade hors plan',
];

function getMistakeTags() {
  if (planData && Array.isArray(planData.mistakeTags) && planData.mistakeTags.length) return planData.mistakeTags;
  return MISTAKE_TAGS;
}

function getEntryItems() {
  if (planData && Array.isArray(planData.entryItems) && planData.entryItems.length) return planData.entryItems;
  return CHECKLIST_ENTRY;
}
function getFilterItems() {
  if (planData && Array.isArray(planData.filterItems) && planData.filterItems.length) return planData.filterItems;
  return CHECKLIST_FILTERS;
}

function initPlan() {
  planData = loadJSON(JP + 'plan', null);
  if (!planData || typeof planData !== 'object' || Array.isArray(planData)) planData = { ce: [], cf: [], notes: '' };
  if (Array.isArray(planData.risk)) planData.risk = planData.risk.filter(r => Array.isArray(r)).map(r => [String(r[0] ?? ''), String(r[1] ?? '')]);
  ['entryItems', 'filterItems', 'mistakeTags'].forEach(k => { if (Array.isArray(planData[k])) planData[k] = planData[k].map(v => String(v ?? '')); });
  if (!Array.isArray(planData.risk) || planData.risk.length === 0) {
    planData.risk = RISK_RULES.map(r => r.slice());
  }
  if (!Array.isArray(planData.entryItems) || planData.entryItems.length === 0) planData.entryItems = CHECKLIST_ENTRY.slice();
  if (!Array.isArray(planData.filterItems) || planData.filterItems.length === 0) planData.filterItems = CHECKLIST_FILTERS.slice();
  if (!Array.isArray(planData.mistakeTags) || planData.mistakeTags.length === 0) planData.mistakeTags = MISTAKE_TAGS.slice();
  if (!Array.isArray(planData.ce)) planData.ce = [];
  if (!Array.isArray(planData.cf)) planData.cf = [];

  renderChecklistGroup('entryItems', 'ce');
  renderChecklistGroup('filterItems', 'cf');
  renderRiskRules();
  renderMistakeTagsEditor();
  renderSetupsEditor();
  document.getElementById('plan-notes').value = planData.notes || '';
  renderTradeChecklist();
  renderTradeMistakes();
}

// Setups : liste éditable (renommer un setup le renomme aussi dans les trades déjà saisis).
function renderSetupsEditor() {
  const cont = document.getElementById('setups-editor'); if (!cont) return;
  if (!Array.isArray(planData.setups)) planData.setups = [...new Set(trades.map(t => t.setup).filter(Boolean))].sort();
  mount(cont, html`${planData.setups.map((s, i) => html`<div class="risk-row tight">
      <input class="watch-input grow" value="${s}" onfocus="this.dataset.orig=this.value" onchange="renameSetup(${raw(i)}, this.dataset.orig, this.value)" placeholder="Nom du setup" aria-label="Nom du setup">
      <span class="ui-muted nowrap">${trades.filter(t => t.setup === s).length} trade(s)</span>
      <button class="del-btn" onclick="removeSetup(${raw(i)})" title="Retirer de la liste" aria-label="Retirer ce setup">×</button></div>`)}
    <button class="btn-ghost btn-add" onclick="addSetup()">+ Ajouter un setup</button>`);
}
function savePlanData() { try { DB.setItem((JP + 'plan'), JSON.stringify(planData)); } catch (e) { reportStorageError(e); } }
function addSetup() { planData.setups.push('Nouveau setup'); savePlanData(); renderSetupsEditor(); refreshSetupList(); }
function removeSetup(i) { planData.setups.splice(i, 1); savePlanData(); renderSetupsEditor(); refreshSetupList(); }
function renameSetup(i, oldV, newV) {
  newV = String(newV || '').trim().slice(0, 60); if (!newV) { renderSetupsEditor(); return; }
  planData.setups[i] = newV; savePlanData();
  const touched = trades.filter(t => t.setup === oldV && oldV !== newV);
  if (touched.length) { touched.forEach(t => { t.setup = newV; }); if (save()) showToast('Setup renommé dans ' + touched.length + ' trade(s) ✓', 'success'); }
  if (FILTER.setup === oldV) { FILTER.setup = newV; DB.setItem(JP + 'global_filter', JSON.stringify(FILTER)); }
  renderSetupsEditor(); refreshSetupList(); renderAll();
}
function renderMistakeTagsEditor() {
  const cont = document.getElementById('mistake-tags');
  if (!cont) return;
  const items = planData.mistakeTags || [];
  mount(cont, html`${items.map((text, i) => html`
    <div class="risk-row tight">
      <input class="watch-input grow sm" value="${text}" onfocus="this.dataset.orig=this.value" oninput="updateMistakeTag(${raw(i)},this.value)" onchange="renameLabelInTrades('mistakes',this.dataset.orig,this.value);this.dataset.orig=this.value" placeholder="Erreur">
      <button class="del-btn" onclick="removeMistakeTag(${raw(i)})" title="Supprimer">×</button>
    </div>`)}<button class="btn-ghost btn-add" onclick="addMistakeTag()">+ Ajouter une erreur à suivre</button>`);
}
function updateMistakeTag(i, val) {
  planData.mistakeTags[i] = val;
  DB.setItem((JP + 'plan'), JSON.stringify(planData));
  renderTradeMistakes();
}
function addMistakeTag() {
  planData.mistakeTags.push('Nouvelle erreur');
  DB.setItem((JP + 'plan'), JSON.stringify(planData));
  renderMistakeTagsEditor();
  renderTradeMistakes();
}
function removeMistakeTag(i) {
  planData.mistakeTags.splice(i, 1);
  DB.setItem((JP + 'plan'), JSON.stringify(planData));
  renderMistakeTagsEditor();
  renderTradeMistakes();
}
function renderTradeMistakes() {
  const cont = document.getElementById('f-mistakes');
  if (!cont) return;
  const items = getMistakeTags();
  mount(cont, html`${items.map(item => html`
    <label class="mistake-chip">
      <input type="checkbox" class="f-mistake-item" value="${item}">
      ${item}
    </label>`)}`);
}

function renderChecklistGroup(key, groupKey) {
  const containerId = key === 'entryItems' ? 'checklist-entry' : 'checklist-filters';
  const cont = document.getElementById(containerId);
  if (!cont) return;
  const items = planData[key] || [];
  const checkedArr = planData[groupKey] || [];
  mount(cont, html`${items.map((text, i) => {
    const checked = checkedArr.includes(i);
    return html`<div class="checklist-item tight">
      <div class="check-box ${raw(checked ? 'checked' : '')}" onclick="toggleCheck('${groupKey}',${raw(i)},this)"></div>
      <input class="watch-input grow" value="${text}" onfocus="this.dataset.orig=this.value" oninput="updateChecklistItem('${key}',${raw(i)},this.value)" ${raw(key === 'entryItems' ? `onchange="renameLabelInTrades('checklistLabels',this.dataset.orig,this.value);this.dataset.orig=this.value"` : '')} placeholder="Critère">
      <button class="del-btn" onclick="removeChecklistItem('${key}',${raw(i)},'${groupKey}')" title="Supprimer">×</button>
    </div>`;
  })}<button class="btn-ghost btn-add" onclick="addChecklistItem('${key}')">+ Ajouter un critère</button>`);
}

function updateChecklistItem(key, idx, val) {
  planData[key][idx] = val;
  DB.setItem((JP + 'plan'), JSON.stringify(planData));
  if (key === 'entryItems') renderTradeChecklist();
}
function addChecklistItem(key) {
  planData[key].push('Nouveau critère');
  DB.setItem((JP + 'plan'), JSON.stringify(planData));
  renderChecklistGroup(key, key === 'entryItems' ? 'ce' : 'cf');
  if (key === 'entryItems') renderTradeChecklist();
}
function removeChecklistItem(key, idx, groupKey) {
  planData[key].splice(idx, 1);
  const arr = planData[groupKey] || [];
  const pos = arr.indexOf(idx);
  if (pos > -1) arr.splice(pos, 1);
  for (let j = 0; j < arr.length; j++) { if (arr[j] > idx) arr[j]--; }
  DB.setItem((JP + 'plan'), JSON.stringify(planData));
  renderChecklistGroup(key, groupKey);
  if (key === 'entryItems') renderTradeChecklist();
}

function renderRiskRules() {
  const cont = document.getElementById('risk-rules');
  if (!cont) return;
  mount(cont, html`${planData.risk.map((row, i) => html`
    <div class="risk-row tight">
      <input class="watch-input grow-13" value="${row[0]}" oninput="updateRiskRule(${raw(i)},0,this.value)" placeholder="Règle">
      <input class="watch-input rule-val" value="${row[1]}" oninput="updateRiskRule(${raw(i)},1,this.value)" placeholder="Valeur">
      <button class="del-btn" onclick="removeRiskRule(${raw(i)})" title="Supprimer">×</button>
    </div>`)}<button class="btn-ghost btn-add" onclick="addRiskRule()">+ Ajouter une règle</button>`);
}

function updateRiskRule(i, col, val) {
  planData.risk[i][col] = val;
  DB.setItem((JP + 'plan'), JSON.stringify(planData));
}
function addRiskRule() {
  planData.risk.push(['Nouvelle règle', '—']);
  DB.setItem((JP + 'plan'), JSON.stringify(planData));
  renderRiskRules();
}
function removeRiskRule(i) {
  planData.risk.splice(i, 1);
  DB.setItem((JP + 'plan'), JSON.stringify(planData));
  renderRiskRules();
}

function toggleCheck(group, idx, el) {
  el.classList.toggle('checked');
  const key = group === 'ce' ? planData.ce : planData.cf;
  const pos = key.indexOf(idx);
  if (pos >= 0) key.splice(pos, 1); else key.push(idx);
  DB.setItem((JP + 'plan'), JSON.stringify(planData));
}

function savePlanNotes() {
  planData.notes = document.getElementById('plan-notes').value;
  DB.setItem((JP + 'plan'), JSON.stringify(planData));
}

// ── WATCHLIST ────────────────────────────────────────────────────────
const WATCH_DEFAULTS = {
  Forex: ['EUR/USD','GBP/USD','USD/JPY','GBP/JPY','EUR/JPY','XAU/USD'],
  Indices: ['DAX 40','CAC 40','NAS 100','SP 500'],
};

function initWatchlist() {
  watchData = loadJSON(JP + 'watch', null);
  if (!watchData || typeof watchData !== 'object' || Array.isArray(watchData)) {
    watchData = {};
    Object.entries(WATCH_DEFAULTS).forEach(([sec, assets]) => {
      assets.forEach(a => { watchData[a] = { biais:'', niveaux:'', notes:'' }; });
    });
  }
  renderWatchlist();
}

function renderWatchlist() {
  const grid = document.getElementById('watchlist-grid');
  mount(grid, html`${Object.entries(WATCH_DEFAULTS).map(([section, assets]) => html`
    <div class="watch-section">
      <div class="watch-section-hdr">${section}</div>
      <table class="watch-table">
        <thead><tr><th>Asset</th><th>Biais HTF</th><th>Niveaux clés</th><th>Notes</th></tr></thead>
        <tbody>${assets.map(asset => {
          const d = watchData[asset] || {};
          const bCls = d.biais==='Bullish'?'biais-bull':d.biais==='Bearish'?'biais-bear':'biais-neu';
          const sel = v => raw(d.biais === v ? ' selected' : '');
          return html`<tr>
            <td class="fw-500">${asset}</td>
            <td>
              <select class="watch-select ${raw(bCls)}" onchange="saveWatch('${asset}','biais',this.value);this.className='watch-select '+(this.value==='Bullish'?'biais-bull':this.value==='Bearish'?'biais-bear':'biais-neu')">
                <option value="">—</option>
                <option${sel('Bullish')}>Bullish</option>
                <option${sel('Bearish')}>Bearish</option>
                <option${sel('Neutre')}>Neutre</option>
              </select>
            </td>
            <td><input class="watch-input" value="${d.niveaux || ''}" placeholder="1.0850, 1.0920…" onchange="saveWatch('${asset}','niveaux',this.value)"></td>
            <td><input class="watch-input" value="${d.notes || ''}" placeholder="notes…" onchange="saveWatch('${asset}','notes',this.value)"></td>
          </tr>`;
        })}</tbody>
      </table>
    </div>`
  )}`);
}

function saveWatch(asset, field, val) {
  if (!watchData[asset]) watchData[asset] = {};
  watchData[asset][field] = val;
  DB.setItem((JP + 'watch'), JSON.stringify(watchData));
}

