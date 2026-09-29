// ── ADD TRADE ────────────────────────────────────────────────────────
let editingTradeId = null;

function resetTradeForm() {
  ['f-asset','f-tf','f-dir','f-session','f-res','f-emotion'].forEach(id => document.getElementById(id).value = '');
  ['f-rr','f-pnl','f-pnleur','f-size','f-desc','f-entry','f-exit'].forEach(id => document.getElementById(id).value = '');
  ['f-entry-price','f-sl-price','f-tp-price','f-exit-price'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const preview = document.getElementById('distance-r-preview');
  if (preview) preview.style.display = 'none';
  document.querySelectorAll('.f-checklist-item').forEach(el => el.checked = false);
  document.querySelectorAll('.f-mistake-item').forEach(el => el.checked = false);
  closeAllFormSections();
  clearImg();
}

function startEditTrade(id) {
  const t = trades.find(x => x.id === id);
  if (!t) return;
  editingTradeId = id;

  document.getElementById('f-date').value = t.date || '';
  document.getElementById('f-asset').value = t.asset || '';
  document.getElementById('f-tf').value = t.tf || '';
  document.getElementById('f-dir').value = t.dir || '';
  document.getElementById('f-session').value = t.session || '';
  document.getElementById('f-entry').value = t.entry || '';
  document.getElementById('f-exit').value = t.exit || '';
  document.getElementById('f-emotion').value = (t.emotion !== null && t.emotion !== undefined) ? t.emotion : '';
  document.getElementById('f-res').value = t.res || '';
  document.getElementById('f-rr').value = (t.rr !== null && t.rr !== undefined) ? t.rr : '';
  document.getElementById('f-pnl').value = (t.pnl != null) ? t.pnl : '';
  document.getElementById('f-pnleur').value = (t.pnlEur !== null && t.pnlEur !== undefined) ? t.pnlEur : '';
  document.getElementById('f-size').value = (t.size !== null && t.size !== undefined) ? t.size : '';
  document.getElementById('f-desc').value = t.desc || '';
  document.getElementById('f-entry-price').value = (t.entryPrice !== null && t.entryPrice !== undefined) ? t.entryPrice : '';
  document.getElementById('f-sl-price').value = (t.slPrice !== null && t.slPrice !== undefined) ? t.slPrice : '';
  document.getElementById('f-tp-price').value = (t.tpPrice !== null && t.tpPrice !== undefined) ? t.tpPrice : '';
  document.getElementById('f-exit-price').value = (t.exitPrice !== null && t.exitPrice !== undefined) ? t.exitPrice : '';
  updateDistanceRPreview();

  document.querySelectorAll('.f-checklist-item').forEach(el => {
    const idx = parseInt(el.dataset.idx, 10);
    el.checked = Array.isArray(t.checklistLabels) ? t.checklistLabels.includes(getEntryItems()[idx]) : (Array.isArray(t.checklist) && t.checklist.includes(idx));
  });
  document.querySelectorAll('.f-mistake-item').forEach(el => {
    el.checked = Array.isArray(t.mistakes) && t.mistakes.includes(el.value);
  });

  if (t.cap) {
    currentImgBase64 = t.cap;
    document.getElementById('upload-placeholder').style.display = 'none';
    document.getElementById('upload-preview').style.display = 'block';
    document.getElementById('img-preview-el').src = t.cap;
  } else {
    currentImgBase64 = '';
    document.getElementById('upload-placeholder').style.display = 'block';
    document.getElementById('upload-preview').style.display = 'none';
    document.getElementById('img-preview-el').src = '';
  }

  const banner = document.getElementById('edit-trade-banner');
  const bannerText = document.getElementById('edit-trade-banner-text');
  if (banner) banner.style.display = 'flex';
  if (bannerText) bannerText.textContent = `Modification du trade du ${t.date || '—'} (${t.asset || '—'})`;
  const titleText = document.getElementById('form-title-text');
  if (titleText) titleText.textContent = 'Modifier le trade';
  const btnText = document.getElementById('trade-submit-btn-text');
  if (btnText) btnText.textContent = 'Enregistrer les modifications';

  closeAllFormSections();
  if (t.entryPrice || t.slPrice || t.tpPrice || t.exitPrice) openFormSectionById('section-prices');
  if (t.tf || t.session || t.entry || t.exit || t.size || t.emotion) openFormSectionById('section-context');
  if (tradeChecklistLabels(t).length || (Array.isArray(t.mistakes) && t.mistakes.length)) openFormSectionById('section-checklist');
  if (t.desc || t.cap) openFormSectionById('section-notes');

  closeTradeDetail();
  showPage('dashboard', document.querySelector('.nav-item[data-page=dashboard]'));
  setTimeout(() => {
    const card = document.getElementById('trade-form-card');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 100);
}

function cancelEditTrade() {
  editingTradeId = null;
  resetTradeForm();
  const banner = document.getElementById('edit-trade-banner');
  if (banner) banner.style.display = 'none';
  const titleText = document.getElementById('form-title-text');
  if (titleText) titleText.textContent = 'Nouveau trade';
  const btnText = document.getElementById('trade-submit-btn-text');
  if (btnText) btnText.textContent = 'Enregistrer le trade';
  document.getElementById('f-date').value = localDateStr();
  showToast('Modification annulée');
}

function toggleFormSection(btn) {
  const section = btn.closest('.form-section');
  if (section) section.classList.toggle('open');
}
function openFormSectionById(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}
function closeAllFormSections() {
  document.querySelectorAll('.form-section.open').forEach(s => s.classList.remove('open'));
}

function updateDistanceRPreview() {
  const entryPrice = parseFloat(document.getElementById('f-entry-price').value);
  const slPrice = parseFloat(document.getElementById('f-sl-price').value);
  const tpPrice = parseFloat(document.getElementById('f-tp-price').value);
  const exitPrice = parseFloat(document.getElementById('f-exit-price').value);
  const dir = document.getElementById('f-dir').value || 'Long';
  const preview = document.getElementById('distance-r-preview');
  if (!preview) return;

  const parts = [];
  if (!isNaN(entryPrice) && !isNaN(slPrice) && !isNaN(tpPrice)) {
    const riskDist = Math.abs(entryPrice - slPrice);
    if (riskDist > 0) parts.push(`RR visé : ${(Math.abs(tpPrice - entryPrice) / riskDist).toFixed(2)}R`);
  }
  if (!isNaN(entryPrice) && !isNaN(slPrice) && !isNaN(exitPrice)) {
    const r = computeDistanceR(entryPrice, slPrice, exitPrice, dir);
    if (r !== null) {
      parts.push(`R réalisé : ${r>=0?'+':''}${r}R`);
      document.getElementById('f-rr').value = Math.abs(r);
      document.getElementById('f-pnl').value = r;
    }
  }
  if (parts.length) {
    preview.style.display = 'block';
    preview.textContent = '📐 ' + parts.join(' · ') + ' — calculé depuis les prix (remplace le RR ci-dessous)';
  } else {
    preview.style.display = 'none';
  }
}

function addTrade() {
  const date = document.getElementById('f-date').value;
  const asset = document.getElementById('f-asset').value;
  const tf = document.getElementById('f-tf').value;
  const dir = document.getElementById('f-dir').value;
  const res = document.getElementById('f-res').value;
  const session = document.getElementById('f-session').value;
  const entry = document.getElementById('f-entry').value;
  const exit = document.getElementById('f-exit').value;
  const emotionRaw = document.getElementById('f-emotion').value;
  const emotion = emotionRaw !== '' ? parseInt(emotionRaw) : null;
  let rr = parseFloat(document.getElementById('f-rr').value) || null;
  const pnlRaw = document.getElementById('f-pnl').value;
  let pnl = pnlRaw !== '' ? parseFloat(pnlRaw) : null;
  const pnlEurRaw = document.getElementById('f-pnleur').value;
  const pnlEur = pnlEurRaw !== '' ? parseFloat(pnlEurRaw) : null;
  const sizeRaw = document.getElementById('f-size').value;
  const size = sizeRaw !== '' ? parseFloat(sizeRaw) : null;
  const cap = currentImgBase64 || '';
  const desc = document.getElementById('f-desc').value.trim();
  const entryItemsNow = getEntryItems();
  const checklist = Array.from(document.querySelectorAll('.f-checklist-item:checked')).map(el => parseInt(el.dataset.idx, 10));
  const checklistLabels = checklist.map(i => entryItemsNow[i]).filter(v => v !== undefined);
  const checklistTotal = entryItemsNow.length;
  const mistakes = Array.from(document.querySelectorAll('.f-mistake-item:checked')).map(el => el.value);

  const entryPriceRaw = document.getElementById('f-entry-price').value;
  const slPriceRaw = document.getElementById('f-sl-price').value;
  const tpPriceRaw = document.getElementById('f-tp-price').value;
  const exitPriceRaw = document.getElementById('f-exit-price').value;
  const entryPrice = entryPriceRaw !== '' ? parseFloat(entryPriceRaw) : null;
  const slPrice = slPriceRaw !== '' ? parseFloat(slPriceRaw) : null;
  const tpPrice = tpPriceRaw !== '' ? parseFloat(tpPriceRaw) : null;
  const exitPrice = exitPriceRaw !== '' ? parseFloat(exitPriceRaw) : null;
  // Prix disponibles → recalcul autoritaire du R par distance, quoi qu'il y ait dans les champs RR/P&L ci-dessus.
  let rSrc = pnl !== null ? 'manuel' : undefined;
  const distR = computeDistanceR(entryPrice, slPrice, exitPrice, dir || 'Long');
  if (distR !== null) { pnl = distR; rr = Math.abs(distR) || rr; rSrc = 'prix'; }
  // Rien de renseigné du tout (ni prix, ni R manuel) → calcul de repli (risque € configuré, sinon RR par défaut),
  // pour qu'un ajout rapide (juste résultat + P&L€) reste exploitable dans toutes les statistiques.
  if (pnl === null && ['TP','SL','BE'].includes(res)) {
    const cr = computeRWithSource(pnlEur, res); pnl = cr.r; rSrc = cr.src;
    if (rr === null) rr = Math.abs(pnl) || null;
  }

  if (!date || !asset || !res) {
    showToast('Remplis au moins : date, asset et résultat', 'error');
    return;
  }

  const prevTrades = trades.slice();
  if (editingTradeId !== null) {
    const idx = trades.findIndex(t => t.id === editingTradeId);
    if (idx !== -1) {
      trades[idx] = { ...trades[idx], date, asset, tf, dir, session, entry, exit, emotion, res, rr, pnl, rSrc, pnlEur, size, cap, desc, checklist, checklistLabels, checklistTotal, mistakes, entryPrice, slPrice, tpPrice, exitPrice };
    }
    sortTradesChrono();
    if (!save()) { trades = prevTrades; return; }   // stockage plein : rien n'est perdu, le formulaire reste tel quel
    editingTradeId = null;
    const banner = document.getElementById('edit-trade-banner');
    if (banner) banner.style.display = 'none';
    const titleText = document.getElementById('form-title-text');
    if (titleText) titleText.textContent = 'Nouveau trade';
    const btnText = document.getElementById('trade-submit-btn-text');
    if (btnText) btnText.textContent = 'Enregistrer le trade';
    resetTradeForm();
    renderAll();
    showToast('Trade mis à jour ✓', 'success');
    return;
  }

  trades.unshift({ id: Date.now(), date, asset, tf, dir, session, entry, exit, emotion, res, rr, pnl, rSrc, pnlEur, size, cap, desc, checklist, checklistLabels, checklistTotal, mistakes, entryPrice, slPrice, tpPrice, exitPrice });
  sortTradesChrono();
  if (!save()) { trades = prevTrades; return; }   // stockage plein : le trade n'est PAS ajouté, le formulaire garde ta saisie
  resetTradeForm();
  renderAll();
  showToast('Trade enregistré ✓', 'success');
}

function renderTradeChecklist() {
  const cont = document.getElementById('f-checklist');
  if (!cont) return;
  const items = getEntryItems();
  cont.innerHTML = items.map((item, i) => `
    <label style="display:flex;align-items:center;gap:7px;font-size:11px;color:var(--txt2);background:var(--bg3);border:1px solid var(--border);border-radius:calc(var(--r) * .7);padding:7px 11px;cursor:pointer">
      <input type="checkbox" class="f-checklist-item" data-idx="${i}" style="accent-color:var(--green);cursor:pointer">
      ${esc(item)}
    </label>`).join('');
}

// ── DD JOURNALIER (avec override manuel) ────────────────────────────
function loadDDLimitPct() {
  return parseFloat(localStorage.getItem((JP + 'dd_limit_pct')) || '1');
}
function saveDDLimitPct() {
  const v = parseFloat(document.getElementById('dd-limit-pct').value);
  if (!isNaN(v) && v > 0) localStorage.setItem((JP + 'dd_limit_pct'), v);
  renderDDBanner();
}
function loadDDManualMap() {
  try { return JSON.parse(localStorage.getItem((JP + 'dd_manual')) || '{}'); } catch(e) { return {}; }
}
function saveDDManualMap(map) { localStorage.setItem((JP + 'dd_manual'), JSON.stringify(map)); }

function toggleDDManualInput() {
  const row = document.getElementById('dd-manual-row');
  if (!row) return;
  const showing = row.style.display !== 'none';
  row.style.display = showing ? 'none' : 'flex';
  if (!showing) {
    const date = document.getElementById('dd-date').value;
    const map = loadDDManualMap();
    document.getElementById('dd-manual-input').value = map[date] !== undefined ? map[date] : '';
  }
}
function saveDDManual() {
  const date = document.getElementById('dd-date').value;
  const val = parseFloat(document.getElementById('dd-manual-input').value);
  if (isNaN(val)) { showToast('Entre un montant valide'); return; }
  const map = loadDDManualMap();
  map[date] = val;
  saveDDManualMap(map);
  document.getElementById('dd-manual-row').style.display = 'none';
  renderDDBanner();
  showToast('Drawdown du jour enregistré à la main ✓', 'success');
}
function clearDDManual() {
  const date = document.getElementById('dd-date').value;
  const map = loadDDManualMap();
  delete map[date];
  saveDDManualMap(map);
  document.getElementById('dd-manual-row').style.display = 'none';
  renderDDBanner();
  showToast('Retour au calcul automatique');
}

function renderDDBanner() {
  const dateInput = document.getElementById('dd-date');
  if (!dateInput) return;
  if (!dateInput.value) dateInput.value = localDateStr();
  const date = dateInput.value;

  const limitPctInput = document.getElementById('dd-limit-pct');
  const limitPct = loadDDLimitPct();
  if (limitPctInput && document.activeElement !== limitPctInput) limitPctInput.value = limitPct;

  const manualMap = loadDDManualMap();
  const isManual = manualMap[date] !== undefined;

  const dayTrades = trades.filter(t => t.date === date && t.pnlEur !== null && t.pnlEur !== undefined);
  const autoPnlEur = dayTrades.reduce((s,t) => s + t.pnlEur, 0);
  const dayPnlEur = isManual ? manualMap[date] : autoPnlEur;
  const hasData = isManual || dayTrades.length > 0;

  const ddLimit = accountSize * (limitPct / 100);
  const ddLoss = dayPnlEur < 0 ? Math.abs(dayPnlEur) : 0;
  const ddPct = ddLimit > 0 ? (ddLoss / ddLimit * 100) : 0;

  const ddBar = document.getElementById('dd-bar');
  const ddAmount = document.getElementById('dd-amount');
  const ddPctLabel = document.getElementById('dd-pct-label');
  const ddBadge = document.getElementById('dd-status-badge');
  const ddLimitLabel = document.getElementById('dd-limit-label');
  const ddWarnLine = document.getElementById('dd-warning-line');
  const ddEditBtn = document.getElementById('dd-edit-btn');

  if (ddWarnLine) { ddWarnLine.style.display = 'block'; ddWarnLine.style.left = '75%'; }
  if (ddEditBtn) { ddEditBtn.style.color = isManual ? 'var(--amber)' : 'var(--txt3)'; ddEditBtn.style.borderColor = isManual ? 'var(--amber)' : 'var(--border2)'; }

  const barW = Math.min(ddPct, 100);
  const barColor = ddPct >= 100 ? 'var(--red)' : ddPct >= 75 ? 'var(--amber)' : ddPct >= 40 ? 'var(--blue)' : 'var(--green)';
  if (ddBar) { ddBar.style.width = barW + '%'; ddBar.style.background = barColor; }
  if (ddLimitLabel) ddLimitLabel.textContent = '/ ' + fmtEUR(ddLimit) + (isManual ? ' · manuel' : '');

  if (!hasData) {
    if (ddAmount) { ddAmount.textContent = '—'; ddAmount.style.color = 'var(--txt3)'; }
    if (ddPctLabel) ddPctLabel.textContent = 'Pas de trade ce jour-là';
    if (ddBadge) { ddBadge.textContent = 'Pas de trade'; ddBadge.style.background = 'var(--bg4)'; ddBadge.style.color = 'var(--txt3)'; }
  } else if (dayPnlEur >= 0) {
    if (ddAmount) { ddAmount.textContent = fmtEUR(dayPnlEur, true); ddAmount.style.color = 'var(--green)'; }
    if (ddPctLabel) ddPctLabel.textContent = '0% du DD utilisé';
    if (ddBadge) { ddBadge.textContent = '✓ Dans les clous'; ddBadge.style.background = 'var(--green-d)'; ddBadge.style.color = 'var(--green)'; }
  } else if (ddPct >= 100) {
    if (ddAmount) { ddAmount.textContent = '-' + fmtEUR(ddLoss); ddAmount.style.color = 'var(--red)'; }
    if (ddPctLabel) ddPctLabel.textContent = '⚠ Limite atteinte !';
    if (ddBadge) { ddBadge.textContent = '🚨 STOP — Limite dépassée'; ddBadge.style.background = 'var(--red-d)'; ddBadge.style.color = 'var(--red)'; }
  } else if (ddPct >= 75) {
    if (ddAmount) { ddAmount.textContent = '-' + fmtEUR(ddLoss); ddAmount.style.color = 'var(--amber)'; }
    if (ddPctLabel) ddPctLabel.textContent = ddPct.toFixed(0) + '% — Danger';
    if (ddBadge) { ddBadge.textContent = '⚡ Attention · ' + ddPct.toFixed(0) + '%'; ddBadge.style.background = 'var(--amber-d)'; ddBadge.style.color = 'var(--amber)'; }
  } else {
    if (ddAmount) { ddAmount.textContent = '-' + fmtEUR(ddLoss); ddAmount.style.color = 'var(--blue)'; }
    if (ddPctLabel) ddPctLabel.textContent = ddPct.toFixed(0) + '% du DD utilisé';
    if (ddBadge) { ddBadge.textContent = ddPct.toFixed(0) + '% utilisé' + (isManual?' · manuel':''); ddBadge.style.background = 'var(--blue-d)'; ddBadge.style.color = 'var(--blue)'; }
  }
}

function deleteTrade(id) {
  openModal('Supprimer ce trade ?', 'Il sera déplacé dans la corbeille (Export/Import) — récupérable si besoin.', () => {
    const t = trades.find(t => t.id === id);
    const prevTrades = trades;
    trades = trades.filter(t => t.id !== id);
    if (!save()) { trades = prevTrades; return; }   // stockage refusé : le trade reste en place
    if (t) {
      const trash = loadTrash();
      trash.unshift({ trade: t, deletedAt: Date.now() });
      // La corbeille garde les captures seulement si la place le permet ; sinon elle garde le trade sans sa capture.
      if (!saveTrash(trash.slice(0, 20))) saveTrash(trash.slice(0, 20).map(e => e.trade && e.trade.cap ? { ...e, trade: { ...e.trade, cap: '' } } : e));
    }
    renderAll();
    renderTrashUI();
    showToast('Trade déplacé dans la corbeille');
  });
}

