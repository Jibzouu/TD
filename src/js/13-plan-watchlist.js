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
  document.getElementById('plan-notes').value = planData.notes || '';
  renderTradeChecklist();
  renderTradeMistakes();
}

function renderMistakeTagsEditor() {
  const cont = document.getElementById('mistake-tags');
  if (!cont) return;
  const items = planData.mistakeTags || [];
  cont.innerHTML = items.map((text, i) => `
    <div class="risk-row" style="gap:8px">
      <input class="watch-input" style="flex:1;font-size:12px" value="${esc(text)}" onfocus="this.dataset.orig=this.value" oninput="updateMistakeTag(${i},this.value)" onchange="renameLabelInTrades('mistakes',this.dataset.orig,this.value);this.dataset.orig=this.value" placeholder="Erreur">
      <button class="del-btn" onclick="removeMistakeTag(${i})" title="Supprimer">×</button>
    </div>`).join('')
    + `<button class="btn-ghost" style="margin-top:10px;width:100%" onclick="addMistakeTag()">+ Ajouter une erreur à suivre</button>`;
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
  cont.innerHTML = items.map((item, i) => `
    <label style="display:flex;align-items:center;gap:7px;font-size:11px;color:var(--txt2);background:var(--bg3);border:1px solid var(--border);border-radius:calc(var(--r) * .7);padding:7px 11px;cursor:pointer">
      <input type="checkbox" class="f-mistake-item" value="${esc(item)}" style="accent-color:#f472b6;cursor:pointer">
      ${esc(item)}
    </label>`).join('');
}

function renderChecklistGroup(key, groupKey) {
  const containerId = key === 'entryItems' ? 'checklist-entry' : 'checklist-filters';
  const cont = document.getElementById(containerId);
  if (!cont) return;
  const items = planData[key] || [];
  const checkedArr = planData[groupKey] || [];
  cont.innerHTML = items.map((text, i) => {
    const checked = checkedArr.includes(i);
    return `<div class="checklist-item" style="gap:8px">
      <div class="check-box ${checked?'checked':''}" onclick="toggleCheck('${groupKey}',${i},this)"></div>
      <input class="watch-input" style="flex:1;font-size:12.5px" value="${esc(text)}" onfocus="this.dataset.orig=this.value" oninput="updateChecklistItem('${key}',${i},this.value)" ${key === 'entryItems' ? `onchange="renameLabelInTrades('checklistLabels',this.dataset.orig,this.value);this.dataset.orig=this.value"` : ''} placeholder="Critère">
      <button class="del-btn" onclick="removeChecklistItem('${key}',${i},'${groupKey}')" title="Supprimer">×</button>
    </div>`;
  }).join('') + `<button class="btn-ghost" style="margin-top:10px;width:100%" onclick="addChecklistItem('${key}')">+ Ajouter un critère</button>`;
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
  cont.innerHTML = planData.risk.map((row, i) => `
    <div class="risk-row" style="gap:8px">
      <input class="watch-input" style="flex:1.3;font-size:12px" value="${esc(row[0])}" oninput="updateRiskRule(${i},0,this.value)" placeholder="Règle">
      <input class="watch-input" style="flex:1;text-align:right;color:var(--amber);font-weight:600;font-family:var(--mono)" value="${esc(row[1])}" oninput="updateRiskRule(${i},1,this.value)" placeholder="Valeur">
      <button class="del-btn" onclick="removeRiskRule(${i})" title="Supprimer">×</button>
    </div>`).join('')
    + `<button class="btn-ghost" style="margin-top:10px;width:100%" onclick="addRiskRule()">+ Ajouter une règle</button>`;
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
  grid.innerHTML = Object.entries(WATCH_DEFAULTS).map(([section, assets]) => `
    <div class="watch-section">
      <div class="watch-section-hdr">${section}</div>
      <table class="watch-table">
        <thead><tr><th>Asset</th><th>Biais HTF</th><th>Niveaux clés</th><th>Notes</th></tr></thead>
        <tbody>${assets.map(asset => {
          const d = watchData[asset] || {};
          const bCls = d.biais==='Bullish'?'biais-bull':d.biais==='Bearish'?'biais-bear':'biais-neu';
          return `<tr>
            <td style="font-weight:500">${asset}</td>
            <td>
              <select class="watch-select ${bCls}" onchange="saveWatch('${asset}','biais',this.value);this.className='watch-select '+(this.value==='Bullish'?'biais-bull':this.value==='Bearish'?'biais-bear':'biais-neu')">
                <option value="">—</option>
                <option ${d.biais==='Bullish'?'selected':''}>Bullish</option>
                <option ${d.biais==='Bearish'?'selected':''}>Bearish</option>
                <option ${d.biais==='Neutre'?'selected':''}>Neutre</option>
              </select>
            </td>
            <td><input class="watch-input" value="${esc(d.niveaux||'')}" placeholder="1.0850, 1.0920…" onchange="saveWatch('${asset}','niveaux',this.value)"></td>
            <td><input class="watch-input" value="${esc(d.notes||'')}" placeholder="notes…" onchange="saveWatch('${asset}','notes',this.value)"></td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`
  ).join('');
}

function saveWatch(asset, field, val) {
  if (!watchData[asset]) watchData[asset] = {};
  watchData[asset][field] = val;
  DB.setItem((JP + 'watch'), JSON.stringify(watchData));
}

