// ── ADD TRADE ────────────────────────────────────────────────────────
let editingTradeId = null;

function resetTradeForm() {
  ['f-asset','f-tf','f-dir','f-session','f-res','f-emotion'].forEach(id => document.getElementById(id).value = '');
  ['f-rr','f-pnl','f-pnleur','f-size','f-desc','f-entry','f-exit','f-setup','f-tags','f-review'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
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
  document.getElementById('f-setup').value = t.setup || '';
  document.getElementById('f-tags').value = Array.isArray(t.tags) ? t.tags.join(', ') : '';
  document.getElementById('f-review').value = t.review || '';
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

  currentImgs = tradeImages(t).slice();
  renderUploadThumbs();

  const banner = document.getElementById('edit-trade-banner');
  const bannerText = document.getElementById('edit-trade-banner-text');
  if (banner) banner.style.display = 'flex';
  if (bannerText) bannerText.textContent = `Modification du trade du ${t.date ? fmtDateNum(t.date) : '—'} (${t.asset || '—'})`;
  const titleText = document.getElementById('form-title-text');
  if (titleText) titleText.textContent = 'Modifier le trade';
  const btnText = document.getElementById('trade-submit-btn-text');
  if (btnText) btnText.textContent = 'Enregistrer les modifications';

  closeAllFormSections();
  if (t.entryPrice || t.slPrice || t.tpPrice || t.exitPrice) openFormSectionById('section-prices');
  if (t.tf || t.session || t.entry || t.exit || t.size || t.emotion) openFormSectionById('section-context');
  if (tradeChecklistLabels(t).length || (Array.isArray(t.mistakes) && t.mistakes.length)) openFormSectionById('section-checklist');
  if (t.desc || t.review || tradeImages(t).length) openFormSectionById('section-notes');

  closeTradeDetail();
  openTradePanel();   // le formulaire s'ouvre par-dessus la page en cours : on ne perd pas sa place
}

// ── PANNEAU « NOUVEAU TRADE » (bouton en haut à droite) ─────────────
// Le formulaire vit dans un panneau déroulant : fermer ne vide rien (le brouillon reste), enregistrer le referme.
function tradePanelOpen() { const p = document.getElementById('nt-panel'); return !!(p && !p.hidden); }
function openTradePanel() {
  const p = document.getElementById('nt-panel'), btn = document.getElementById('nt-btn');
  if (!p) return;
  if (!p.hidden) return;
  rememberFocus();
  // Ancré sous le bouton (la barre du haut est collante : le panneau suit le défilement de la page).
  if (btn) p.style.setProperty('--nt-top', Math.round(btn.getBoundingClientRect().bottom + 8) + 'px');
  p.hidden = false;
  if (btn) btn.setAttribute('aria-expanded', 'true');
  const d = document.getElementById('f-date'); if (d && !d.value) d.value = localDateStr();
  p.scrollTop = 0;
  setTimeout(() => { const f = document.getElementById(editingTradeId !== null ? 'f-res' : 'f-asset'); if (f) f.focus(); }, 30);
}
function closeTradePanel() {
  const p = document.getElementById('nt-panel'), btn = document.getElementById('nt-btn');
  if (!p || p.hidden) return;
  p.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
  restoreFocus();
}
function toggleTradePanel() { if (tradePanelOpen()) closeTradePanel(); else openTradePanel(); }
// Clic en dehors du panneau (et hors de la visionneuse / des fenêtres ouvertes par-dessus) : on le referme.
document.addEventListener('pointerdown', e => {
  if (!tradePanelOpen()) return;
  const t = e.target;
  if (t.closest('#nt-panel, #nt-btn, #lightbox, #modal, .toast, #toast')) return;
  closeTradePanel();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && tradePanelOpen() && !document.querySelector('#lightbox.open, #modal.open')) closeTradePanel(); });

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
  closeTradePanel();
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
    if (riskDist > 0) parts.push(`RR visé : ${fmtR(Math.abs(tpPrice - entryPrice) / riskDist, 2, true)}`);
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

// Tags libres : séparés par des virgules, nettoyés, sans doublon, 12 au maximum.
function parseTags(str) {
  return [...new Set(String(str || '').split(/[,;]/).map(s => s.trim().replace(/^#/, '').slice(0, 30)).filter(Boolean))].slice(0, 12);
}
// Setups connus : ceux du plan de trading + ceux déjà utilisés (liste de suggestions du champ Setup et du filtre).
function knownSetups() {
  const fromPlan = (planData && Array.isArray(planData.setups)) ? planData.setups : [];
  return [...new Set(fromPlan.concat(trades.map(t => t.setup).filter(Boolean)))].sort((a, b) => a.localeCompare(b));
}
function refreshSetupList() {
  const dl = document.getElementById('setup-list');
  if (dl) mount(dl, html`${knownSetups().map(s => html`<option value="${s}"></option>`)}`);
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
  const caps = currentImgs.map(safeImgSrc).filter(Boolean);
  const cap = caps[0] || '';
  const desc = document.getElementById('f-desc').value.trim();
  const setup = document.getElementById('f-setup').value.trim().slice(0, 60);
  const tags = parseTags(document.getElementById('f-tags').value);
  const review = document.getElementById('f-review').value.trim();
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
  // Ni prix ni R saisi : un BE vaut 0R ; sinon pas de R (le P&L € reste compté dans toutes les statistiques).
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
      trades[idx] = { ...trades[idx], date, asset, tf, dir, session, entry, exit, emotion, res, rr, pnl, rSrc, pnlEur, size, cap, caps, desc, setup, tags, review, checklist, checklistLabels, checklistTotal, mistakes, entryPrice, slPrice, tpPrice, exitPrice };
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
    closeTradePanel();
    renderAll();
    showToast('Trade mis à jour ✓', 'success');
    return;
  }

  trades.unshift({ id: Date.now(), date, asset, tf, dir, session, entry, exit, emotion, res, rr, pnl, rSrc, pnlEur, size, cap, caps, desc, setup, tags, review, checklist, checklistLabels, checklistTotal, mistakes, entryPrice, slPrice, tpPrice, exitPrice });
  sortTradesChrono();
  if (!save()) { trades = prevTrades; return; }   // stockage plein : le trade n'est PAS ajouté, le formulaire garde ta saisie
  resetTradeForm();
  closeTradePanel();
  renderAll();
  showToast('Trade enregistré ✓', 'success');
}

function renderTradeChecklist() {
  const cont = document.getElementById('f-checklist');
  if (!cont) return;
  const items = getEntryItems();
  mount(cont, html`${items.map((item, i) => html`
    <label class="mistake-chip check">
      <input type="checkbox" class="f-checklist-item" data-idx="${i}">
      ${item}
    </label>`)}`);
}

// ── DD JOURNALIER (avec override manuel) ────────────────────────────
function loadDDLimitPct() {
  return parseFloat(DB.getItem((JP + 'dd_limit_pct')) || '1');
}
function saveDDLimitPct() {
  const v = parseFloat(document.getElementById('dd-limit-pct').value);
  if (!isNaN(v) && v > 0) { DB.setItem((JP + 'dd_limit_pct'), v); renderAll(); }
}
function loadDDManualMap() {
  try { return JSON.parse(DB.getItem((JP + 'dd_manual')) || '{}'); } catch(e) { return {}; }
}
function saveDDManualMap(map) { DB.setItem((JP + 'dd_manual'), JSON.stringify(map)); }

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

// Barre « Aujourd'hui » : P&L de la journée choisie (aujourd'hui par défaut) et part de la perte max autorisée utilisée.
function renderDDBanner() {
  const dateInput = document.getElementById('dd-date');
  if (!dateInput) return;
  if (!dateInput.value) dateInput.value = localDateStr();
  const date = dateInput.value, isToday = date === localDateStr();

  const limitPctInput = document.getElementById('dd-limit-pct');
  const limitPct = loadDDLimitPct();
  if (limitPctInput && document.activeElement !== limitPctInput) limitPctInput.value = limitPct;

  const manualMap = loadDDManualMap();
  const isManual = manualMap[date] !== undefined;
  const allDay = trades.filter(t => t.date === date);
  const dayTrades = allDay.filter(t => t.pnlEur !== null && t.pnlEur !== undefined);
  const dayPnlEur = isManual ? manualMap[date] : dayTrades.reduce((s, t) => s + t.pnlEur, 0);
  const hasData = isManual || dayTrades.length > 0;
  // Limite calculée sur le solde en DÉBUT de journée (solde de départ + tous les trades des jours précédents).
  const dayStartBal = accountSize + trades.reduce((sum, t) => sum + (t.date && t.date < date && typeof t.pnlEur === 'number' && !isNaN(t.pnlEur) ? t.pnlEur : 0), 0);
  const ddLimit = Math.max(0, dayStartBal) * (limitPct / 100);
  const ddLoss = dayPnlEur < 0 ? Math.abs(dayPnlEur) : 0;
  const ddPct = ddLimit > 0 ? (ddLoss / ddLimit * 100) : 0;
  const level = !hasData ? 'none' : ddPct >= 100 ? 'crit' : ddPct >= 75 ? 'warn' : 'ok';

  const set = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  set('today-label', el => { el.textContent = isToday ? "Aujourd'hui" : fmtDateFR(date, true); });
  set('dd-amount', el => {
    el.textContent = hasData ? fmtEUR(dayPnlEur, true) : '—';
    el.className = 'today-pnl tone-' + (!hasData ? 'muted' : dayPnlEur > 0 ? 'green' : dayPnlEur < 0 ? 'red' : 'txt');
  });
  const W = allDay.filter(t => t.res === 'TP').length, L = allDay.filter(t => t.res === 'SL').length, B = allDay.filter(t => t.res === 'BE').length;
  set('today-sub', el => {
    el.textContent = allDay.length
      ? allDay.length + ' trade' + (allDay.length > 1 ? 's' : '') + ' · ' + W + ' G · ' + L + ' P' + (B ? ' · ' + B + ' BE' : '') + (isManual ? ' · montant saisi à la main' : '')
      : (isManual ? 'Montant saisi à la main' : isToday ? "Pas encore de trade aujourd'hui" : 'Pas de trade ce jour-là');
  });
  set('dd-bar', el => { el.style.width = Math.min(ddPct, 100) + '%'; el.className = 'fill-' + ({ none: 'muted', ok: 'green', warn: 'amber', crit: 'red' })[level]; });
  set('dd-bar-wrap', el => el.setAttribute('aria-label', 'Perte du jour : ' + Math.round(ddPct) + ' % de la limite de ' + fmtEUR(ddLimit)));
  set('dd-pct-label', el => { el.textContent = !hasData ? '—' : dayPnlEur >= 0 ? 'Aucune perte' : fmtRate(ddPct, 0) + ' de la limite utilisée'; });
  set('dd-limit-label', el => { el.textContent = 'limite ' + fmtEUR(ddLimit) + ' (' + limitPct + ' %)'; el.title = limitPct + ' % du solde en début de journée (' + fmtEUR(dayStartBal) + ')'; });
  set('dd-status-badge', el => {
    el.textContent = ({ none: 'Pas de trade', ok: '✓ Dans les clous', warn: '⚡ Attention', crit: '🚨 Limite dépassée' })[level];
    el.className = 'st-chip ' + level;
  });
  set('dd-edit-btn', el => el.classList.toggle('on', isManual));
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

