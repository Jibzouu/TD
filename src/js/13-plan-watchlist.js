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
// Règles libres (texte). Le risque par trade, la perte max du jour, le nombre de trades par jour et les SL consécutifs
// sont des règles RELIÉES (chiffrées, vérifiées par le journal) : voir renderRiskRules.
const RISK_RULES = [
  ['RR minimum','2R'],
  ['Partiel à','1R — 50 % de la position'],
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
  if (!Array.isArray(planData.risk)) planData.risk = RISK_RULES.map(r => r.slice());
  // Migration : les anciennes règles texte deviennent des règles reliées (risque → Scaling, perte du jour → Paramètres,
  // trades/jour et SL consécutifs → nombres vérifiés par les alertes).
  if (planData.maxTrades === undefined) {
    const row = planData.risk.find(r => /max.*trades/i.test(r[0]));
    const n = row ? parseInt(String(row[1]).replace(/\D/g, ''), 10) : NaN;
    planData.maxTrades = n > 0 ? n : 3;
    const f = (planData.filterItems || CHECKLIST_FILTERS).map(x => String(x).match(/(\d+)\s*SL\s*cons/i)).find(Boolean);
    planData.maxConsecSL = f ? parseInt(f[1], 10) : 2;
    planData.risk = planData.risk.filter(r => !/max.*trades|risque par trade|perte journali/i.test(r[0]));
    DB.setItem((JP + 'plan'), JSON.stringify(planData));
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
  if (!cont || !planData) return;
  const plan = typeof calcPlanRisk === 'function' ? calcPlanRisk() : null;
  const go = p => `showPage('${p}', document.querySelector('.nav-item[data-page=${p}]'))`;
  const ddPct = loadDDLimitPct();
  const num = (key, label, hint) => html`<div class="risk-row tight linked"><span class="grow-13">${label}<small>${hint}</small></span><input type="number" class="watch-input rule-val" min="0" step="1" value="${planData[key] > 0 ? planData[key] : ''}" placeholder="—" aria-label="${label}" onchange="setPlanNumber('${raw(key)}', this.value)"></div>`;
  mount(cont, html`<div class="ui-subtitle">Règles reliées <span class="tone-muted">· vérifiées par le journal</span></div>
    <div class="risk-row tight linked"><span class="grow-13">Risque par trade<small>taille de ton palier, depuis le Scaling</small></span><button class="link-btn rule-val" onclick="${raw(go('scaling'))}">${plan ? fmtEUR(plan.risk, false, 2) + ' · ' + plan.label.split(' · ')[0] : 'à régler'}</button></div>
    <div class="risk-row tight linked"><span class="grow-13">Perte max du jour<small>du solde en début de journée, depuis Paramètres</small></span><button class="link-btn rule-val" onclick="${raw(go('parametres'))}">${fmtRate(ddPct, ddPct % 1 ? 1 : 0)}</button></div>
    ${num('maxTrades', 'Max trades par jour', 'alerte sur le Dashboard au-delà')}
    ${num('maxConsecSL', 'Stop après N SL d’affilée', 'dans la même journée')}
    <div class="ui-subtitle mt-10">Autres règles</div>
    ${planData.risk.map((row, i) => html`
    <div class="risk-row tight">
      <input class="watch-input grow-13" value="${row[0]}" oninput="updateRiskRule(${raw(i)},0,this.value)" placeholder="Règle">
      <input class="watch-input rule-val" value="${row[1]}" oninput="updateRiskRule(${raw(i)},1,this.value)" placeholder="Valeur">
      <button class="del-btn" onclick="removeRiskRule(${raw(i)})" title="Supprimer">×</button>
    </div>`)}<button class="btn-ghost btn-add" onclick="addRiskRule()">+ Ajouter une règle</button>`);
}

function setPlanNumber(key, val) {
  const v = parseInt(val, 10);
  planData[key] = v > 0 ? v : null;
  DB.setItem((JP + 'plan'), JSON.stringify(planData));
  if (typeof renderRuleAlerts === 'function') safeRun(renderRuleAlerts, 'renderRuleAlerts');
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
// Biais du jour par actif (+ niveaux, notes). Chaque biais est daté et historisé jour par jour : on peut ensuite
// mesurer les trades pris AVEC ou CONTRE le biais du jour (Long + Bullish, Short + Bearish).
const WATCH_DEFAULTS = {
  Forex: ['EUR/USD','GBP/USD','USD/JPY','GBP/JPY','EUR/JPY','XAU/USD'],
  Indices: ['DAX 40','CAC 40','NAS 100','SP 500'],
};
const WATCH_GROUPS = ['Forex', 'Indices', 'Crypto', 'Autres'];
const WATCH_HINTS = { Forex: 'ex. 1.0850 · 1.0920', Indices: 'ex. 18 450 · 18 600', Crypto: 'ex. 62 000 · 64 500', Autres: 'niveaux clés' };
// Ancien format { actif: { biais, niveaux, notes } } → { v:2, assets:[{name, group}], entries:{}, history:{date:{actif:biais}} }.
function normalizeWatch(d) {
  if (d && d.v === 2 && Array.isArray(d.assets)) {
    d.entries = d.entries && typeof d.entries === 'object' ? d.entries : {};
    d.history = d.history && typeof d.history === 'object' ? d.history : {};
    return d;
  }
  const old = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  const out = { v: 2, assets: [], entries: {}, history: {} };
  Object.entries(WATCH_DEFAULTS).forEach(([group, list]) => list.forEach(name => out.assets.push({ name, group })));
  Object.keys(old).forEach(name => {
    if (!out.assets.some(a => a.name === name)) out.assets.push({ name, group: 'Autres' });
    const e = old[name] || {};
    out.entries[name] = { biais: String(e.biais || ''), niveaux: String(e.niveaux || ''), notes: String(e.notes || ''), updated: '' };
  });
  return out;
}
function saveWatchData() { try { DB.setItem((JP + 'watch'), JSON.stringify(watchData)); } catch (e) { reportStorageError(e); } }
function initWatchlist() {
  watchData = normalizeWatch(loadJSON(JP + 'watch', null));
  renderWatchlist();
}
// Biais en vigueur pour un actif à une date : celui saisi ce jour-là (historique).
function watchBiasOn(asset, date) { const day = watchData && watchData.history && watchData.history[date]; return day ? day[asset] || '' : ''; }
function watchAlignment(t) {
  const b = t.asset && t.date ? watchBiasOn(t.asset, t.date) : '';
  if (!b || !t.dir) return 'none';
  if (b === 'Neutre') return 'neutral';
  return (b === 'Bullish') === (t.dir === 'Long') ? 'with' : 'against';
}
function watchAgo(date) {
  if (!date) return { txt: 'jamais renseigné', tone: 'muted' };
  const days = Math.round((new Date(localDateStr() + 'T00:00:00') - new Date(date + 'T00:00:00')) / 86400000);
  return days <= 0 ? { txt: "aujourd'hui", tone: 'green' } : { txt: days === 1 ? 'hier' : 'il y a ' + days + ' j', tone: days > 3 ? 'red' : 'amber' };
}
function renderWatchlist() {
  const grid = document.getElementById('watchlist-grid');
  if (!grid) return;
  watchData = normalizeWatch(watchData);
  const groups = WATCH_GROUPS.filter(g => watchData.assets.some(a => a.group === g));
  const known = new Set(watchData.assets.map(a => a.name));
  const traded = [...new Set(trades.map(t => t.asset).filter(Boolean))].filter(a => !known.has(a)).sort();
  mount(grid, html`${groups.map(group => html`
    <div class="watch-section">
      <div class="watch-section-hdr">${group}</div>
      <table class="watch-table">
        <thead><tr><th>Actif</th><th>Biais du jour</th><th>Niveaux clés</th><th>Notes</th><th></th></tr></thead>
        <tbody>${watchData.assets.filter(a => a.group === group).map(a => {
          const d = watchData.entries[a.name] || {}, ago = watchAgo(d.updated);
          const bCls = d.biais === 'Bullish' ? 'biais-bull' : d.biais === 'Bearish' ? 'biais-bear' : 'biais-neu';
          const sel = v => raw(d.biais === v ? ' selected' : '');
          const key = esc(a.name).replace(/'/g, '&#39;');
          return html`<tr>
            <td class="fw-500">${a.name}<div class="watch-ago tone-${raw(d.biais ? ago.tone : 'muted')}">${d.biais ? 'biais ' + ago.txt : 'pas de biais'}</div></td>
            <td><select class="watch-select ${raw(bCls)}" aria-label="Biais du jour ${a.name}" onchange="saveWatch('${raw(key)}','biais',this.value)">
                <option value="">—</option><option${sel('Bullish')}>Bullish</option><option${sel('Bearish')}>Bearish</option><option${sel('Neutre')}>Neutre</option></select></td>
            <td><input class="watch-input" value="${d.niveaux || ''}" placeholder="${WATCH_HINTS[group]}" aria-label="Niveaux clés ${a.name}" onchange="saveWatch('${raw(key)}','niveaux',this.value)"></td>
            <td><input class="watch-input" value="${d.notes || ''}" placeholder="notes…" aria-label="Notes ${a.name}" onchange="saveWatch('${raw(key)}','notes',this.value)"></td>
            <td><button class="del-btn" onclick="removeWatchAsset('${raw(key)}')" title="Retirer de la watchlist" aria-label="Retirer ${a.name}">×</button></td>
          </tr>`;
        })}</tbody>
      </table>
    </div>`)}
    <div class="watch-section watch-add">
      <div class="watch-section-hdr">Ajouter un actif</div>
      <div class="watch-add-row"><input class="filter-select" id="watch-new-name" placeholder="ex. BTC/USD" aria-label="Nom de l'actif"><select class="filter-select" id="watch-new-group" aria-label="Catégorie">${WATCH_GROUPS.map(g => html`<option>${g}</option>`)}</select><button class="btn-primary" onclick="addWatchAsset()">Ajouter</button></div>
      ${traded.length ? html`<div class="watch-sugg">Actifs de tes trades : ${traded.map(n => html`<button class="link-btn" onclick="addWatchAsset('${raw(esc(n).replace(/'/g, '&#39;'))}')">+ ${n}</button> `)}</div>` : ''}
    </div>`);
  renderWatchStats();
}
// Trades avec / contre le biais du jour.
function renderWatchStats() {
  const cont = document.getElementById('watch-stats');
  if (!cont) return;
  const closed = trades.filter(t => ['TP', 'SL', 'BE'].includes(t.res));
  const g = { with: [], against: [], neutral: [], none: [] };
  closed.forEach(t => g[watchAlignment(t)].push(t));
  if (!g.with.length && !g.against.length) {
    mount(cont, UI.hint('Renseigne ton biais du jour chaque matin : tes trades seront ensuite classés « avec » ou « contre » ton biais, pour voir ce que ça te rapporte vraiment.'));
    return;
  }
  const tile = (label, list, tone) => {
    const W = winStats(list), rs = list.filter(t => typeof t.pnl === 'number' && rUsable(t)).map(t => t.pnl);
    const eur = list.reduce((s, t) => s + (typeof t.pnlEur === 'number' ? t.pnlEur : 0), 0);
    return UI.tile(label, list.length ? fmtRate(W.rate * 100, 0) + ' gagnants' : '—', { tone, sub: list.length + ' trade' + (list.length > 1 ? 's' : '') + (rs.length ? ' · ' + fmtR(rs.reduce((a, b) => a + b, 0) / rs.length, 2) + ' par trade' : '') + ' · ' + fmtEUR(eur, true, 0) });
  };
  mount(cont, html`${UI.grid([tile('✅ Avec ton biais', g.with, 'green'), tile('⛔ Contre ton biais', g.against, 'red'), tile('Biais neutre ou non renseigné', g.neutral.concat(g.none), 'muted')], 3)}
    ${UI.hint('Un trade est « avec » ton biais quand tu achètes (Long) un actif noté Bullish ce jour-là, ou que tu vends (Short) un actif noté Bearish.')}`);
}
function saveWatch(asset, field, val) {
  watchData = normalizeWatch(watchData);
  const e = watchData.entries[asset] = watchData.entries[asset] || { biais: '', niveaux: '', notes: '', updated: '' };
  e[field] = String(val || '');
  if (field === 'biais') {
    const today = localDateStr();
    e.updated = val ? today : '';
    const day = watchData.history[today] = watchData.history[today] || {};
    if (val) day[asset] = val; else delete day[asset];
  }
  saveWatchData();
  if (field === 'biais') renderWatchlist();
}
function addWatchAsset(name) {
  const fromSuggestion = !!name;
  const input = document.getElementById('watch-new-name');
  name = String(name || (input && input.value) || '').trim().slice(0, 30);
  if (!name) return;
  watchData = normalizeWatch(watchData);
  if (watchData.assets.some(a => a.name.toLowerCase() === name.toLowerCase())) { showToast('Déjà dans la watchlist', 'info'); return; }
  const grpEl = document.getElementById('watch-new-group');
  // Depuis une suggestion (actif déjà tradé) : catégorie devinée ; sinon celle choisie dans la liste.
  const guess = n => /BTC|ETH|SOL|XRP/i.test(n) ? 'Crypto' : /^[A-Z]{3}\/?[A-Z]{3}$|XAU|XAG/i.test(n) ? 'Forex' : /\d/.test(n) ? 'Indices' : 'Autres';
  const group = fromSuggestion ? guess(name) : (grpEl ? grpEl.value : 'Autres');
  watchData.assets.push({ name, group: WATCH_GROUPS.includes(group) ? group : 'Autres' });
  saveWatchData();
  if (!fromSuggestion && input) input.value = '';
  renderWatchlist();
}
function removeWatchAsset(name) {
  watchData = normalizeWatch(watchData);
  watchData.assets = watchData.assets.filter(a => a.name !== name);
  saveWatchData();
  renderWatchlist();
}
