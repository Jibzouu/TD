// ── REPLAY : INDICATEURS (instances, liste, réglages) ────────────────
// Chaque indicateur ajouté est une instance avec ses réglages (longueur, source…), son style (couleur, épaisseur,
// tracés visibles) et ses niveaux (oscillateurs) — modifiables comme sur TradingView : roue dentée dans la légende,
// œil pour masquer, × pour retirer. On peut ajouter plusieurs fois le même indicateur (ex. MME 9 et MME 21).

function rpiNew(id, p, st) {
  const d = RPI_DEFS[id];
  const inst = { uid: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), id, p: {}, st: {}, lv: (d.levels || []).map(v => ({ v, on: true })), hidden: false };
  d.inputs.forEach(x => { inst.p[x.k] = x.def; });
  Object.assign(inst.p, p || {});
  d.plots.forEach(pl => { inst.st[pl.k] = { color: pl.color, width: pl.type === 'points' ? 2 : 1, on: true }; });
  if (st) Object.keys(st).forEach(k => Object.assign(inst.st[k], st[k]));
  return inst;
}
// Anciennes listes (identifiants fixes) → instances.
function rpiMigrate(list) {
  const map = { vol: ['vol'], sma20: ['sma', { len: 20 }, '#2962ff'], sma50: ['sma', { len: 50 }, '#ff9800'], sma200: ['sma', { len: 200 }, '#e91e63'],
    ema9: ['ema', { len: 9 }, '#00bcd4'], ema21: ['ema', { len: 21 }, '#9c27b0'], ema200: ['ema', { len: 200 }, '#f7c948'], bb: ['bb'], vwap: ['vwap'] };
  return list.map(x => {
    if (x && typeof x === 'object' && RPI_DEFS[x.id]) return x;
    const m = map[x]; if (!m) return null;
    return rpiNew(m[0], m[1], m[2] ? { ma: { color: m[2] } } : null);
  }).filter(Boolean);
}
function rpcInds() {
  if (!RP) return [];
  if (!Array.isArray(RP.inds)) RP.inds = [rpiNew('vol')];
  if (RP.inds.some(x => typeof x === 'string' || !x || !x.uid)) RP.inds = rpiMigrate(RP.inds);
  return RP.inds;
}
function rpiByUid(uid) { return rpcInds().find(x => x.uid === uid); }
function rpiLabel(inst) {
  const d = RPI_DEFS[inst.id];
  const vals = d.inputs.filter(x => x.type !== 'src' || inst.p[x.k] !== 'close').map(x => x.type === 'src' ? inst.p[x.k] : fmtNum(inst.p[x.k], x.step && x.step < 1 ? 2 : 0));
  return tr(d.short) + (vals.length ? ' ' + vals.join(' ') : '');
}
function rpiFmt(inst, v) {
  const f = RPI_DEFS[inst.id].fmt;
  if (v == null || isNaN(v)) return '∅';
  return f === 'vol' ? rpcFmtVol(v) : f === 2 ? fmtNum(v, 2) : rpPrice(v, RPC[RP.cursor] ? RPC[RP.cursor].close : v);
}

// ── Actions ──
function rpiAdd(id) {
  if (!RP || !RPI_DEFS[id]) return;
  rpcInds().push(rpiNew(id));
  rpSave(); rpCloseModal(); rpBuildChart(); rpRefreshUi();
  showToast(tr(RPI_DEFS[id].name) + ' ' + tr('ajouté'));
}
function rpiRemove(uid) { RP.inds = rpcInds().filter(x => x.uid !== uid); rpSave(); rpBuildChart(); rpRefreshUi(); }
function rpiToggle(uid) { const x = rpiByUid(uid); if (!x) return; x.hidden = !x.hidden; rpSave(); rpBuildChart(); rpRefreshUi(); }

// ── Fenêtres (liste des indicateurs, réglages) ──
function rpModal(title, body, foot, cls) {
  rpCloseModal();
  const bg = document.createElement('div');
  bg.className = 'rp-modal-bg'; bg.id = 'rp-modal';
  bg.innerHTML = '<div class="rp-modal ' + (cls || '') + '" role="dialog" aria-modal="true" aria-label="' + escHtmlAttr(title) + '"><div class="rp-modal-head"><b>' + escHtmlAttr(title) + '</b><button type="button" class="rp-modal-x" aria-label="' + escHtmlAttr(tr('Fermer')) + '" onclick="rpCloseModal()">×</button></div><div class="rp-modal-body">' + body + '</div>' + (foot ? '<div class="rp-modal-foot">' + foot + '</div>' : '') + '</div>';
  bg.addEventListener('pointerdown', e => { if (e.target === bg) rpCloseModal(); });
  bg.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); rpCloseModal(); } });
  document.body.appendChild(bg);
  const f = bg.querySelector('input,select,button:not(.rp-modal-x)'); if (f) f.focus();
  return bg;
}
function rpCloseModal() { const m = document.getElementById('rp-modal'); if (m) m.remove(); }

// Liste façon TradingView : recherche + deux groupes (sur le graphique / sous le graphique).
function rpiOpenPicker() {
  const item = id => { const d = RPI_DEFS[id]; return '<button type="button" class="rp-pick-it" data-q="' + escHtmlAttr((tr(d.name) + ' ' + d.short + ' ' + id).toLowerCase()) + '" onclick="rpiAdd(\'' + id + '\')"><span>' + escHtmlAttr(tr(d.name)) + '</span><small>' + escHtmlAttr(tr(d.short)) + '</small></button>'; };
  const ids = Object.keys(RPI_DEFS);
  const body = '<input type="search" class="rp-pick-q" placeholder="' + escHtmlAttr(tr('Rechercher un indicateur…')) + '" oninput="rpiFilter(this.value)">'
    + '<div class="rp-pick-list"><div class="rp-pick-grp">' + escHtmlAttr(tr('Sur le graphique')) + '</div>' + ids.filter(i => RPI_DEFS[i].cat === 'main').map(item).join('')
    + '<div class="rp-pick-grp">' + escHtmlAttr(tr('Sous le graphique (oscillateurs)')) + '</div>' + ids.filter(i => RPI_DEFS[i].cat === 'pane').map(item).join('') + '</div>';
  rpModal(tr('Indicateurs'), body, '', 'rp-modal-pick');
}
function rpiFilter(q) {
  q = String(q || '').toLowerCase().trim();
  document.querySelectorAll('#rp-modal .rp-pick-it').forEach(b => { b.hidden = !!q && !b.dataset.q.includes(q); });
  document.querySelectorAll('#rp-modal .rp-pick-grp').forEach(g => { g.hidden = !!q; });
}
// Réglages d'un indicateur : onglets « Paramètres » et « Style », boutons Par défaut / Annuler / OK.
function rpiSettings(uid) {
  const inst = rpiByUid(uid); if (!inst) return;
  const d = RPI_DEFS[inst.id];
  const inputs = d.inputs.length ? d.inputs.map(x => '<label class="rp-set-row"><span>' + escHtmlAttr(tr(x.label)) + '</span>' + (x.type === 'src'
    ? '<select data-in="' + x.k + '">' + RPI_SRC.map(([v, l]) => '<option value="' + v + '"' + (inst.p[x.k] === v ? ' selected' : '') + '>' + escHtmlAttr(tr(l)) + '</option>').join('') + '</select>'
    : '<input type="number" data-in="' + x.k + '" value="' + inst.p[x.k] + '" step="' + (x.step || 1) + '" min="' + (x.min ?? '') + '">') + '</label>').join('')
    : '<p class="rp-set-empty">' + escHtmlAttr(tr('Pas de paramètre pour cet indicateur.')) + '</p>';
  const styles = d.plots.map(pl => { const st = inst.st[pl.k] || {}; return '<div class="rp-set-row rp-set-plot"><label class="rp-set-chk"><input type="checkbox" data-on="' + pl.k + '"' + (st.on !== false ? ' checked' : '') + '>' + escHtmlAttr(tr(pl.label)) + '</label>'
    + '<input type="color" data-color="' + pl.k + '" value="' + escHtmlAttr(st.color || pl.color) + '">'
    + (pl.type === 'hist' ? '' : '<select data-width="' + pl.k + '">' + [1, 2, 3, 4].map(w => '<option value="' + w + '"' + ((st.width || 1) === w ? ' selected' : '') + '>' + w + ' px</option>').join('') + '</select>') + '</div>'; }).join('')
    + (inst.lv.length ? '<div class="rp-set-sub">' + escHtmlAttr(tr('Niveaux')) + '</div>' + inst.lv.map((l, i) => '<div class="rp-set-row"><label class="rp-set-chk"><input type="checkbox" data-lvon="' + i + '"' + (l.on !== false ? ' checked' : '') + '>' + escHtmlAttr(tr('Niveau')) + ' ' + (i + 1) + '</label><input type="number" data-lv="' + i + '" value="' + l.v + '" step="any"></div>').join('') : '');
  const body = '<div class="rp-set-tabs"><button type="button" class="on" data-tab="in" onclick="rpiSetTab(\'in\')">' + escHtmlAttr(tr('Paramètres')) + '</button><button type="button" data-tab="st" onclick="rpiSetTab(\'st\')">' + escHtmlAttr(tr('Style')) + '</button></div>'
    + '<div class="rp-set-pane on" data-pane="in">' + inputs + '</div><div class="rp-set-pane" data-pane="st">' + styles + '</div>';
  const foot = '<button type="button" class="btn-ghost" onclick="rpiDefaults(\'' + uid + '\')">' + escHtmlAttr(tr('Par défaut')) + '</button><span class="rp-sp"></span>'
    + '<button type="button" class="btn-ghost" onclick="rpCloseModal()">' + escHtmlAttr(tr('Annuler')) + '</button><button type="button" class="btn-primary" onclick="rpiApply(\'' + uid + '\')">OK</button>';
  rpModal(tr(d.name), body, foot, 'rp-modal-set');
}
function rpiSetTab(t) {
  document.querySelectorAll('#rp-modal .rp-set-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  document.querySelectorAll('#rp-modal .rp-set-pane').forEach(p => p.classList.toggle('on', p.dataset.pane === t));
}
function rpiDefaults(uid) {
  const inst = rpiByUid(uid); if (!inst) return;
  const fresh = rpiNew(inst.id);
  Object.assign(inst, { p: fresh.p, st: fresh.st, lv: fresh.lv });
  rpiSettings(uid);
}
function rpiApply(uid) {
  const inst = rpiByUid(uid), m = document.getElementById('rp-modal');
  if (!inst || !m) return;
  const d = RPI_DEFS[inst.id];
  m.querySelectorAll('[data-in]').forEach(el => {
    const x = d.inputs.find(i => i.k === el.dataset.in);
    if (x.type === 'src') inst.p[x.k] = el.value;
    else { let v = parseFloat(String(el.value).replace(',', '.')); if (!isFinite(v)) v = x.def; if (x.min != null) v = Math.max(x.min, v); if (!x.step || x.step >= 1) v = Math.round(v); inst.p[x.k] = Math.min(v, 1000); }
  });
  m.querySelectorAll('[data-on]').forEach(el => { inst.st[el.dataset.on].on = el.checked; });
  m.querySelectorAll('[data-color]').forEach(el => { inst.st[el.dataset.color].color = el.value; });
  m.querySelectorAll('[data-width]').forEach(el => { inst.st[el.dataset.width].width = +el.value; });
  m.querySelectorAll('[data-lv]').forEach(el => { const v = parseFloat(el.value); if (isFinite(v)) inst.lv[+el.dataset.lv].v = v; });
  m.querySelectorAll('[data-lvon]').forEach(el => { inst.lv[+el.dataset.lvon].on = el.checked; });
  rpSave(); rpCloseModal(); rpBuildChart(); rpRefreshUi();
}
