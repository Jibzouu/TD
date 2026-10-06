// ── PLAYBOOKS ────────────────────────────────────────────────────────
// Une fiche par setup : description, règles d'entrée, captures d'exemple et statistiques réelles du setup.
// Rangées dans le plan (planData.playbooks, clé = nom du setup) : elles suivent donc backups et synchronisation.
// Les captures d'exemple vont dans le magasin d'images, comme celles des trades.
let PB_SELECTED = null;

function playbooks() {
  if (!planData || typeof planData !== 'object') return {};
  if (!planData.playbooks || typeof planData.playbooks !== 'object' || Array.isArray(planData.playbooks)) planData.playbooks = {};
  return planData.playbooks;
}
function playbookOf(name) {
  const p = name ? playbooks()[name] : null;
  return p && typeof p === 'object' ? p : null;
}
function ensurePlaybook(name) {
  const all = playbooks();
  const p = all[name] = playbookOf(name) || {};
  if (typeof p.desc !== 'string') p.desc = '';
  if (!Array.isArray(p.rules)) p.rules = [];
  p.rules = p.rules.filter(r => typeof r === 'string').slice(0, 30);
  if (!Array.isArray(p.imgs)) p.imgs = [];
  p.imgs = p.imgs.filter(id => typeof id === 'string' && /^i[0-9a-z]{6,40}$/i.test(id)).slice(0, 8);
  return p;
}
// Images référencées par les playbooks : protégées du ménage des captures, exportées avec le backup.
function playbookImageIds() {
  const s = new Set();
  Object.values(playbooks()).forEach(p => (p && Array.isArray(p.imgs) ? p.imgs : []).forEach(id => s.add(id)));
  return s;
}
function playbookImages() {
  const out = {};
  playbookImageIds().forEach(id => { const src = ImageStore.get(id); if (src) out[id] = src; });
  return out;
}
// Après un import / une fusion : range les captures d'exemple fournies par le fichier.
function restorePlaybookImages(imagesById) {
  if (!imagesById || typeof imagesById !== 'object') return;
  playbookImageIds().forEach(id => {
    const src = safeImgSrc(imagesById[id] || '');
    if (src && !ImageStore.get(id)) { try { DB.setItem(ImageStore.key(id), src); } catch (e) { reportStorageError(e); } }
  });
}
function renamePlaybook(oldName, newName) {
  const all = playbooks();
  if (oldName === newName || !all[oldName] || all[newName]) return;
  all[newName] = all[oldName]; delete all[oldName];
  if (PB_SELECTED === oldName) PB_SELECTED = newName;
}

// Statistiques d'un setup (trades clos, filtre global appliqué).
function playbookStats(name) {
  const list = analysisTrades().filter(t => t.setup === name && (t.res === 'TP' || t.res === 'SL' || t.res === 'BE'))
    .slice().sort((a, b) => (a.date + (a.entry || '')).localeCompare(b.date + (b.entry || '')));
  const wins = list.filter(t => t.res === 'TP').length, losses = list.filter(t => t.res === 'SL').length;
  const withR = list.filter(t => t.pnl != null);
  const net = list.reduce((s, t) => s + (+t.pnlEur || 0), 0);
  const rSum = withR.reduce((s, t) => s + t.pnl, 0);
  let cum = 0;
  const curve = list.map(t => (cum += (t.pnl != null ? t.pnl : 0)));
  return {
    list, n: list.length, wins, wr: wins + losses ? wins / (wins + losses) * 100 : null, net,
    expR: withR.length ? rSum / withR.length : null, rSum: withR.length ? rSum : null, curve,
    best: list.reduce((m, t) => (t.pnlEur != null && (m == null || t.pnlEur > m) ? t.pnlEur : m), null),
    worst: list.reduce((m, t) => (t.pnlEur != null && (m == null || t.pnlEur < m) ? t.pnlEur : m), null)
  };
}
function pbSparkline(curve) {
  if (curve.length < 2) return html`<div class="pb-spark pb-spark-empty">pas assez de trades</div>`;
  const W = 160, H = 36, min = Math.min(0, ...curve), max = Math.max(0, ...curve), span = (max - min) || 1;
  const pts = curve.map((v, i) => (i / (curve.length - 1) * W).toFixed(1) + ',' + (H - (v - min) / span * H).toFixed(1)).join(' ');
  const zero = (H - (0 - min) / span * H).toFixed(1), last = curve[curve.length - 1];
  return html`<svg class="pb-spark" viewBox="0 0 ${raw(W)} ${raw(H)}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="${raw(W)}" y1="${raw(zero)}" y2="${raw(zero)}" class="pb-spark-zero"/><polyline points="${raw(pts)}" class="pb-spark-line ${raw(last >= 0 ? 'up' : 'down')}"/></svg>`;
}

function renderPlaybooks() {
  const cont = document.getElementById('playbooks-body');
  if (!cont) return;
  const names = knownSetups();
  if (!names.length) {
    mount(cont, UI.empty('📘', 'Aucun setup pour l’instant', 'Crée tes setups dans le Plan de trading (ou renseigne un setup sur tes trades) : chacun aura ici sa fiche, ses règles et ses statistiques.',
      { label: 'Aller au Plan de trading', onclick: "showPage('plan', document.querySelector('.nav-item[data-page=plan]'))" }));
    return;
  }
  if (!names.includes(PB_SELECTED)) PB_SELECTED = names[0];
  const cards = names.map((name, i) => {
    const st = playbookStats(name), pb = playbookOf(name);
    const nRules = pb && Array.isArray(pb.rules) ? pb.rules.filter(Boolean).length : 0;
    return html`<button class="pb-card${raw(name === PB_SELECTED ? ' active' : '')}" onclick="selectPlaybook(${raw(i)})" aria-pressed="${raw(name === PB_SELECTED)}">
      <span class="pb-card-name">${name}</span>
      <span class="pb-card-meta">${st.n} trade${st.n > 1 ? 's' : ''} · ${st.wr != null ? fmtRate(st.wr, 0) : '—'} · ${nRules} règle${nRules > 1 ? 's' : ''}</span>
      ${pbSparkline(st.curve)}
      <span class="pb-card-net">${UI.pnl(st.n ? st.net : null)}<span class="pb-card-exp">${st.expR != null ? fmtR(st.expR, 2) + ' / trade' : ''}</span></span>
    </button>`;
  });
  mount(cont, html`<div class="pb-grid">${cards}</div><div id="pb-detail"></div>`);
  renderPlaybookDetail();
}
function selectPlaybook(i) { const n = knownSetups()[i]; if (n) { PB_SELECTED = n; renderPlaybooks(); } }

function renderPlaybookDetail() {
  const cont = document.getElementById('pb-detail');
  if (!cont || !PB_SELECTED) return;
  const name = PB_SELECTED, pb = playbookOf(name) || { desc: '', rules: [], imgs: [] };
  const st = playbookStats(name);
  const imgs = (pb.imgs || []).map(id => ImageStore.get(id)).filter(Boolean);
  const recent = st.list.slice(-6).reverse();
  mount(cont, html`<section class="panel pb-detail">
    <div class="panel-hdr"><span>${name}<small class="panel-sub">fiche du setup · statistiques sur les trades clos (filtre global appliqué)</small></span></div>
    ${UI.grid([
      UI.tile('Trades', String(st.n)),
      UI.tile('Win rate', st.wr != null ? fmtRate(st.wr, 0) : '—'),
      UI.tile('Résultat net', st.n ? fmtEUR(st.net, true, 0) : '—', { tone: st.net > 0 ? 'green' : st.net < 0 ? 'red' : 'muted' }),
      UI.tile('Espérance', st.expR != null ? fmtR(st.expR, 2) : '—', { sub: 'R moyen par trade', tone: st.expR > 0 ? 'green' : st.expR < 0 ? 'red' : 'muted' }),
      UI.tile('Meilleur trade', st.n ? UI.pnl(st.best) : '—', { sub: st.n ? html`pire : ${UI.pnl(st.worst)}` : '' })
    ], 5)}
    <div class="pb-cols">
      <div>
        <div class="pb-label">Description <span class="th-sub">contexte, marché, timeframe, quand le prendre</span></div>
        <textarea id="pb-desc" class="pb-desc" rows="4" maxlength="2000" placeholder="Ex : retour sur un order block H1 après un sweep de liquidité, en session de Londres…" onchange="savePlaybookDesc(this.value)">${pb.desc || ''}</textarea>
        <div class="pb-label">Règles d'entrée <span class="th-sub">rappelées dans le formulaire quand tu choisis ce setup</span></div>
        <div id="pb-rules">${(pb.rules || []).map((r, i) => html`<div class="risk-row tight">
          <span class="pb-rule-n">${i + 1}</span>
          <input class="watch-input grow" value="${r}" maxlength="160" placeholder="Règle" aria-label="Règle ${raw(i + 1)}" onchange="savePlaybookRule(${raw(i)}, this.value)">
          <button class="del-btn" onclick="removePlaybookRule(${raw(i)})" title="Retirer" aria-label="Retirer cette règle">×</button></div>`)}
          <button class="btn-ghost btn-add" onclick="addPlaybookRule()">+ Ajouter une règle</button></div>
      </div>
      <div>
        <div class="pb-label">Exemples types <span class="th-sub">captures de trades modèles (8 max)</span></div>
        <div class="pb-imgs">${imgs.map((src, i) => html`<div class="pb-img"><img src="${src}" alt="Exemple ${raw(i + 1)}" onclick="openPlaybookGallery(${raw(i)})"><button class="pb-img-del" onclick="removePlaybookImage(${raw(i)})" aria-label="Retirer cet exemple">×</button></div>`)}
          ${imgs.length < 8 ? html`<label class="pb-img-add" title="Ajouter des captures">＋<input type="file" accept="image/*" multiple hidden onchange="addPlaybookImages(this)"></label>` : ''}</div>
        <div class="pb-label">Derniers trades</div>
        ${recent.length ? UI.table(['Date', 'Actif', 'Résultat', 'P&L'], recent.map(t => [
          html`<a href="#" class="pb-link" onclick="event.preventDefault();openTradeDetail(${raw(t.id)})">${fmtDateNum(t.date)}</a>`, t.asset || '—', UI.badgeRes(t.res), UI.pnl(t.pnlEur)]), { align: ['l', 'l', 'l', 'r'] })
          : UI.hint('Aucun trade clos avec ce setup pour l’instant.')}
      </div>
    </div>
  </section>`);
}

function savePlaybooks() { savePlanData(); }
function savePlaybookDesc(v) { ensurePlaybook(PB_SELECTED).desc = String(v || '').slice(0, 2000); savePlaybooks(); }
function savePlaybookRule(i, v) { const p = ensurePlaybook(PB_SELECTED); p.rules[i] = String(v || '').trim().slice(0, 160); savePlaybooks(); renderSetupReminder(); }
function addPlaybookRule() {
  const p = ensurePlaybook(PB_SELECTED);
  if (p.rules.length >= 30) return;
  p.rules.push(''); savePlaybooks(); renderPlaybookDetail();
  const inputs = document.querySelectorAll('#pb-rules input'); if (inputs.length) inputs[inputs.length - 1].focus();
}
function removePlaybookRule(i) { const p = ensurePlaybook(PB_SELECTED); p.rules.splice(i, 1); savePlaybooks(); renderPlaybooks(); }
async function addPlaybookImages(input) {
  const files = [...(input.files || [])].filter(f => /^image\//.test(f.type));
  input.value = '';
  const p = ensurePlaybook(PB_SELECTED);
  for (const f of files) {
    if (p.imgs.length >= 8) break;
    const dataUrl = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(''); r.readAsDataURL(f); });
    const src = await compressDataUrlAsync(dataUrl);
    try { const id = ImageStore.put(src); if (id) p.imgs.push(id); } catch (e) { reportStorageError(e); break; }
  }
  savePlaybooks(); renderPlaybookDetail();
}
function removePlaybookImage(i) {
  const p = ensurePlaybook(PB_SELECTED), id = p.imgs[i];
  if (!id) return;
  p.imgs.splice(i, 1); savePlaybooks();
  if (!trades.some(t => (t.imgs || []).includes(id)) && !trashImageIds().has(id)) ImageStore.remove(id);
  renderPlaybookDetail();
}
function openPlaybookGallery(i) {
  const p = playbookOf(PB_SELECTED); if (!p) return;
  openGallery(p.imgs.map(id => ImageStore.get(id)).filter(Boolean), i);
}

// Formulaire de trade : rappel des règles du setup choisi.
function renderSetupReminder() {
  const el = document.getElementById('f-setup-rules'), inp = document.getElementById('f-setup');
  if (!el || !inp) return;
  const name = inp.value.trim(), pb = playbookOf(name);
  const rules = pb && Array.isArray(pb.rules) ? pb.rules.filter(Boolean) : [];
  el.hidden = !rules.length;
  if (!rules.length) { mount(el, ''); return; }
  mount(el, html`<div class="pb-remind-title">📘 Règles du playbook « ${name} »</div><ol>${rules.map(r => html`<li>${r}</li>`)}</ol>`);
}
