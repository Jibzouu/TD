// ── SCALING ACCOUNT ──────────────────────────────────────────────────
// Principe : tu donnes ton solde de départ, ton risque par trade (%) et ton coussin (N pertes d'affilée).
// Chaque palier est placé pour que l'écart avec le palier précédent couvre au moins N pertes au NOUVEAU risque,
// puis arrondi vers le haut à un chiffre rond : si tu enchaînes N pertes juste après avoir augmenté, tu retombes
// au palier précédent et tu reprends la taille précédente. Le % de risque se règle palier par palier (hérité ensuite).
const SCALING_KEY = (JP + 'scaling');
let scalingState = null;

function scRound(v, d) { const f = Math.pow(10, d); return Math.round(v * f) / f; }
function scPct(v) { return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %'; }
function scNum1(v) { return v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function scNiceStep(v) { return Math.pow(10, Math.floor(Math.log10(Math.max(v, 1)))); }
// Chiffre rond supérieur : 1 429 → 1 500, 3 571 → 4 000, 11 875 → 12 000, 21 400 → 25 000.
const SC_ROUNDS = [1, 1.2, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 7.5, 8, 9, 10];
function scCeilRound(v) { const e = scNiceStep(v), m = v / e; return SC_ROUNDS.find(r => r >= m - 1e-9) * e; }
// Montant compact pour la frise (« 120 € » plutôt que « 120,00 € »).
function scEurShort(v) { return Math.abs(v - Math.round(v)) < 0.005 ? fmtEUR(Math.round(v)) : fmtEUR(v, false, 2); }

function scalingDefaults() {
  const start = accountSize > 0 ? accountSize : 1000;
  return { version: 3, start, riskPct: 1, cushion: 10, goal: start * 10, current: start, auto: true, riskSteps: [], tableOpen: false };
}
function loadScalingState() {
  const d = scalingDefaults();
  try {
    const raw = JSON.parse(DB.getItem(SCALING_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      ['start', 'riskPct', 'goal', 'current'].forEach(k => { if (typeof raw[k] === 'number' && isFinite(raw[k]) && raw[k] > 0) d[k] = raw[k]; });
      if (typeof raw.cushion === 'number' && raw.cushion > 0) d.cushion = raw.cushion;
      // Anciennes versions (règles au choix) : on reprend le N de la règle « coussin » s'il était utilisé.
      else if (raw.mode === 'cushion' && raw.params && raw.params.cushion > 0) d.cushion = raw.params.cushion;
      if (typeof raw.auto === 'boolean') d.auto = raw.auto;
      if (typeof raw.tableOpen === 'boolean') d.tableOpen = raw.tableOpen;
      if (Array.isArray(raw.riskSteps)) d.riskSteps = raw.riskSteps
        .filter(r => r && typeof r.from === 'number' && isFinite(r.from) && typeof r.pct === 'number' && r.pct > 0 && r.pct < 100)
        .map(r => ({ from: r.from, pct: r.pct })).sort((a, b) => a.from - b.from);
      if (d.goal <= d.start) d.goal = d.start * 10;
    }
  } catch (e) {}
  scalingState = d;
  return d;
}
function getScalingState() { return scalingState || loadScalingState(); }
function saveScalingState() { try { DB.setItem(SCALING_KEY, JSON.stringify(scalingState)); } catch (e) {} }

function scalingJournalBalance() {
  const base = accountSize > 0 ? accountSize : 0;
  const pnl = trades.reduce((s, t) => s + ((typeof t.pnlEur === 'number' && !isNaN(t.pnlEur)) ? t.pnlEur : 0), 0);
  return base + pnl;
}
function scalingCurrent(st) { return st.auto ? scalingJournalBalance() : st.current; }

// % de risque d'un palier : le dernier % réglé sur un palier ≤ ce capital, sinon le % de départ.
function scPctAt(st, bal) {
  let pct = st.riskPct;
  st.riskSteps.forEach(r => { if (bal > st.start + 0.5 && bal >= r.from - 0.5) pct = r.pct; });
  return pct;
}
// Réglage de risque « posé » sur un palier : le premier changement situé entre le palier précédent (exclu) et celui-ci.
function scRiskStepOn(st, p, prevBal) { return st.riskSteps.find(r => r.from > prevBal + 0.5 && r.from <= p.bal + 0.5) || null; }

// Plus petit chiffre rond au-dessus de prev dont l'écart couvre N pertes au risque de CE palier.
// Le % pouvant changer d'un palier à l'autre, on teste chaque % possible (et chaque seuil de changement) et on garde
// le plus petit candidat valide ; celui calculé avec le % le plus élevé l'est toujours.
function scNextPalier(st, prev) {
  const N = st.cushion, ok = c => c > prev && (c - prev) >= N * c * scPctAt(st, c) / 100 - 1e-6;
  const pcts = [scPctAt(st, prev), ...st.riskSteps.filter(r => r.from > prev).map(r => r.pct)];
  const cands = pcts.map(p => scCeilRound(prev / (1 - N * p / 100)))
    .concat(st.riskSteps.filter(r => r.from > prev).map(r => scCeilRound(r.from)));
  return Math.min(...cands.filter(ok));
}
// Paliers : P0 = départ ; P(k+1) = chiffre rond ≥ Pk ÷ (1 − N × risque% de P(k+1)).
function computeScalingPaliers(st, current) {
  if (!(st.start > 0) || !(st.riskPct > 0)) return { error: 'Renseigne un solde de départ et un risque par trade supérieurs à 0.' };
  if (!(st.cushion > 0)) return { error: 'Renseigne un coussin d\'au moins 1 perte.' };
  const maxPct = Math.max(st.riskPct, ...st.riskSteps.map(r => r.pct)) / 100;
  if (st.cushion * maxPct >= 0.9) return { error: `Coussin trop grand pour ce risque : ${st.cushion} pertes × ${scPct(maxPct * 100)} = ${Math.round(st.cushion * maxPct * 100)} % du compte. Baisse le risque ou le nombre de pertes.` };
  const pts = [{ k: 0, bal: st.start, pct: st.riskPct, risk: st.start * st.riskPct / 100, cushion: null, gain: null }];
  const limit = Math.max(st.goal, current || 0);
  while (pts.length < 40) {
    const prev = pts[pts.length - 1];
    const bal = scNextPalier(st, prev.bal), pct = scPctAt(st, bal), risk = bal * pct / 100;
    pts.push({ k: pts.length, bal, pct, risk, cushion: (bal - prev.bal) / risk, gain: (bal - prev.bal) / prev.bal });
    if (bal > limit) break;
  }
  const beyond = pts[pts.length - 1].bal > limit ? pts.pop() : null;
  let r = 0;
  pts.forEach((p, i) => { if (current + 1e-6 >= p.bal) r = i; });
  return { pts, next: pts[r + 1] || beyond, r, beyond };
}

// ── Saisie ──
function fillScalingForm() {
  const st = getScalingState();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('sc-start', st.start);
  set('sc-risk-pct', scRound(st.riskPct, 3));
  set('sc-cushion', st.cushion);
  set('sc-goal', st.goal);
  set('sc-current', scRound(scalingCurrent(st), 2));
  const auto = document.getElementById('sc-auto');
  if (auto) auto.checked = !!st.auto;
  applyScalingTablePanel();
}
function onScalingInput(field) {
  const st = getScalingState();
  const el = document.getElementById({ start: 'sc-start', riskPct: 'sc-risk-pct', cushion: 'sc-cushion', goal: 'sc-goal', current: 'sc-current', auto: 'sc-auto' }[field]);
  if (!el) return;
  const v = parseFloat(String(el.value).replace(',', '.'));
  if (field === 'start' && v > 0) {
    // L'objectif suit le départ tant qu'il n'a pas été personnalisé.
    if (Math.abs(st.goal - st.start * 10) < 0.01 || st.goal <= v) { st.goal = v * 10; document.getElementById('sc-goal').value = st.goal; }
    st.start = v;
  } else if (field === 'riskPct' && v > 0 && v < 100) st.riskPct = v;
  else if (field === 'cushion' && v > 0) st.cushion = v;
  else if (field === 'goal' && v > 0) st.goal = v;
  else if (field === 'current' && !isNaN(v)) st.current = v;
  else if (field === 'auto') {
    st.auto = el.checked;
    if (!st.auto) st.current = scRound(scalingJournalBalance(), 2);
  } else return;
  saveScalingState();
  if (field !== 'auto' && field !== 'current') scAckPalier();   // plan modifié : pas d'alerte « nouveau palier » fantôme
  renderScaling();
}
// Risque d'un palier (tableau) : vide = même % que le palier précédent.
function setScalingPalierRisk(bal, oldFrom, value) {
  const st = getScalingState();
  const v = parseFloat(String(value).replace(',', '.'));
  st.riskSteps = st.riskSteps.filter(r => Math.abs(r.from - bal) >= 0.5 && (oldFrom == null || Math.abs(r.from - oldFrom) >= 0.5));
  if (String(value).trim() !== '' && v > 0 && v < 100) st.riskSteps.push({ from: bal, pct: v });
  st.riskSteps.sort((a, b) => a.from - b.from);
  saveScalingState();
  scAckPalier();
  setTimeout(() => renderScaling(), 0);   // après le déplacement du focus : la case suivante reste active
}

// ── Rendu ──
function renderScaling(opts) {
  const page = document.getElementById('page-scaling');
  if (!page || !page.classList.contains('active')) return;
  const st = getScalingState();
  const current = scalingCurrent(st);
  const curInput = document.getElementById('sc-current');
  if (curInput) { curInput.disabled = !!st.auto; if (st.auto) curInput.value = scRound(current, 2); }
  const hint = document.getElementById('sc-risk-hint');
  if (hint) hint.textContent = st.start > 0 && st.riskPct > 0 ? '= ' + fmtEUR(st.start * st.riskPct / 100, false, 2) + ' de perte max par trade' : '';
  const model = computeScalingPaliers(st, current);
  const rule = document.getElementById('sc-rule-text');
  if (rule) {
    const steps = st.riskSteps.length ? ' Risque ajusté : ' + st.riskSteps.map(r => scPct(r.pct) + ' à partir de ' + fmtEUR(r.from)).join(', ') + '.' : ' Tu peux changer le % de risque à partir de n\'importe quel palier dans le tableau.';
    rule.textContent = model.error ? '' : `Chaque palier est placé pour que l'écart avec le précédent couvre au moins ${st.cushion} pertes d'affilée au nouveau risque, arrondi au chiffre rond supérieur. Tu augmentes ta taille en atteignant un palier ; si tu repasses sous ton palier, tu reprends la taille du palier d'avant.${steps}`;
  }
  renderScalingTiles(st, model, current);
  renderScalingTimeline(st, model, current, opts || {});
  renderScalingTable(st, model, current);
  renderScalingCompliance(st, model);
}

function renderScalingTiles(st, model, current) {
  const cont = document.getElementById('sc-tiles');
  if (!cont) return;
  if (model.error) { mount(cont, ''); return; }
  const { pts, r, next } = model, cur = pts[r], prev = pts[r - 1];
  const below = current < st.start - 1e-6;
  const margin = (current - cur.bal) / cur.risk;
  const tiles = [
    { label: 'Risque par trade maintenant', val: fmtEUR(cur.risk, false, 2), tone: 'blue',
      sub: `${scPct(cur.pct)} de ${fmtEUR(cur.bal)} · ${r === 0 ? 'palier de départ' : 'palier P' + r}` },
    { label: 'Prochain palier', val: next ? fmtEUR(next.bal) : 'Objectif atteint', tone: 'amber',
      sub: next ? `encore ${fmtEUR(next.bal - current)} (+${scNum1((next.bal - current) / Math.max(current, 1) * 100)} %) → risque ${fmtEUR(next.risk, false, 2)}` : '' },
    { label: 'Marge avant de redescendre', val: below ? 'Sous le départ' : (r === 0 ? '—' : scNum1(margin) + ' pertes'), tone: below ? 'red' : (r === 0 ? 'txt' : (margin < 2 ? 'red' : margin < 5 ? 'amber' : 'green')),
      sub: below ? `il manque ${fmtEUR(st.start - current)} pour revenir à ton solde de départ`
        : (r === 0 ? 'tu es à ton palier de départ : pas de taille plus petite' : `${fmtEUR(current - cur.bal)} au-dessus de P${r} · en dessous, retour à ${fmtEUR(prev.risk, false, 2)} par trade`) },
    { label: 'Objectif', val: fmtEUR(st.goal), tone: current >= st.goal ? 'green' : 'txt',
      sub: current >= st.goal ? 'atteint 🎉' : `reste ${fmtEUR(st.goal - current)} · ${pts.length - 1 - r} palier${pts.length - 1 - r > 1 ? 's' : ''} d'ici là` }
  ];
  mount(cont, html`${tiles.map(t => html`<div class="sc-tile"><div class="sc-tile-label">${t.label}</div><div class="sc-tile-val tone-${raw(t.tone)}">${t.val}</div><div class="sc-tile-sub">${t.sub}</div></div>`)}`);
}

function renderScalingTimeline(st, model, current, opts) {
  const wrap = document.getElementById('sc-tl-wrap'), tl = document.getElementById('sc-tl');
  if (!wrap || !tl) return;
  if (model.error) { tl.style.width = 'auto'; tl.style.height = 'auto'; mount(tl, html`<div class="sc-empty">${model.error}</div>`); return; }
  tl.style.height = '';
  const pts = model.pts.slice();
  if (model.beyond) pts.push({ ...model.beyond, beyond: true });
  const m = pts.length, bals = pts.map(p => p.bal);
  const padL = 64, padR = 64;
  const S = Math.max(128, Math.floor(Math.max(300, wrap.clientWidth - padL - padR) / Math.max(1, m - 1)));
  tl.style.width = (padL + (m - 1) * S + padR) + 'px';
  // Position d'un montant sur la frise : interpolation entre les deux paliers qui l'encadrent.
  const xOf = b => {
    if (m < 2) return padL;
    if (b <= bals[0]) return padL + Math.max(-0.45, (b - bals[0]) / (bals[1] - bals[0])) * S;
    let i = 0;
    while (i < m - 2 && b >= bals[i + 1]) i++;
    return padL + Math.min(m - 1 + 0.45, i + (b - bals[i]) / (bals[i + 1] - bals[i])) * S;
  };
  const at = (x, w) => raw(`left:${x}px` + (w != null ? `;width:${w}px` : ''));
  const meX = xOf(current), trackW = (m - 1) * S;
  const h = [html`<div class="sc-track" style="${at(padL, trackW)}"><div class="sc-fill" style="${raw('width:' + Math.max(0, Math.min(trackW, meX - padL)) + 'px')}"></div></div>`];
  pts.forEach((p, i) => {
    const x = padL + i * S;
    const state = i <= model.r ? 'reached' : (i === model.r + 1 ? 'next' : '');
    const chip = i === 0 ? 'Départ' : 'P' + p.k;
    h.push(html`<div class="sc-dot ${state}${raw(p.beyond ? ' beyond' : '')}" style="${at(x)}" title="${chip} — ${fmtEUR(p.bal)} · risque ${fmtEUR(p.risk, false, 2)} (${scPct(p.pct)}) par trade"></div>`);
    h.push(html`<div class="sc-lbl sc-lbl-top" style="${at(x)}"><span class="sc-chip ${state}">${chip}</span><div class="sc-cap">${fmtEUR(p.bal)}</div></div>`);
    h.push(html`<div class="sc-lbl sc-lbl-bot" style="${at(x)}"><div class="sc-risk">${scEurShort(p.risk)}<span class="sc-risk-u"> / trade</span></div><div class="sc-risk-pct">${scPct(p.pct)}</div></div>`);
    if (i > 0) h.push(html`<div class="sc-lbl sc-lbl-mid" style="${at(x - S / 2)}" title="Écart ${i === 1 ? 'départ' : 'P' + (p.k - 1)} → P${p.k} : ${fmtEUR(p.bal - pts[i - 1].bal)}, soit ${scNum1(p.cushion)} pertes au risque de P${p.k}">↔ ${scNum1(p.cushion)} pertes</div>`);
  });
  h.push(html`<div class="sc-me" style="${at(meX)}"><div class="sc-me-pill">Toi · ${fmtEUR(current)}</div><div class="sc-me-line"></div></div>`);
  mount(tl, html`${h}`);
  if (opts && opts.center) wrap.scrollLeft = Math.max(0, meX - wrap.clientWidth / 2);
}

function renderScalingTable(st, model, current) {
  const cont = document.getElementById('sc-table');
  if (!cont) return;
  const cnt = document.getElementById('sc-table-count');
  if (model.error) { mount(cont, ''); if (cnt) cnt.textContent = ''; return; }
  // Redessin pendant la saisie : on garde la case active.
  const act = document.activeElement, keep = act && cont.contains(act) ? act.getAttribute('aria-label') : null;
  const rows = model.pts.map((p, i) => {
    const prev = model.pts[i - 1];
    const own = i > 0 ? scRiskStepOn(st, p, prev.bal) : null;
    const status = i < model.r ? html`<span class="tone-green">✔ atteint</span>`
      : i === model.r ? html`<span class="tone-blue fw-700">● en cours</span>` : `reste ${fmtEUR(p.bal - current)}`;
    const riskCell = i === 0 ? scPct(p.pct)
      : html`<label class="sc-cush-in${raw(own ? ' own' : '')}" title="Risque (% du capital) à partir de P${p.k}. Vide = même % que le palier précédent."><input type="number" min="0.05" max="99" step="0.25" value="${own ? own.pct : ''}" placeholder="${scRound(p.pct, 3)}" aria-label="Risque de P${p.k} (%)" onchange="setScalingPalierRisk(${raw(scRound(p.bal, 2))}, ${raw(own ? String(scRound(own.from, 2)) : 'null')}, this.value)"><span>%</span></label>`;
    const down = prev && p.risk < prev.risk - 0.005;
    return html`<tr class="${i === model.r ? 'cur' : ''}"><td class="sc-td-k">${i === 0 ? 'Départ' : 'P' + p.k}</td><td>${fmtEUR(p.bal)}</td><td>${prev ? '+' + scNum1(p.gain * 100) + ' %' : '—'}</td><td>${riskCell}</td><td class="tone-blue fw-700">${fmtEUR(p.risk, false, 2)}${down ? html` <span class="tone-amber" title="Ton risque en € baisse à ce palier : la baisse du % l'emporte sur la hausse du capital">▼</span>` : ''}</td><td>${prev ? html`<b>${scNum1(p.cushion)} pertes</b> · ${fmtEUR(p.bal - prev.bal)}` : '—'}</td><td>${status}</td></tr>`;
  });
  mount(cont, html`<table class="sc-table"><thead><tr><th>Palier</th><th>Capital</th><th title="Hausse de capital depuis le palier précédent">Effort</th><th>Risque (%)</th><th>Risque / trade</th><th title="Pertes d'affilée, au risque du palier, pour retomber au palier précédent">Coussin</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table><p class="sc-note">Coussin = pertes d'affilée, au risque du palier, qui te ramènent au palier précédent (où tu reprends la taille d'avant). Risque (%) : un % saisi sur un palier vaut pour lui et les suivants ; vide = même % que le palier précédent.</p>`);
  if (keep) { const el = [...cont.querySelectorAll('input')].find(e => e.getAttribute('aria-label') === keep); if (el) el.focus(); }
  if (cnt) cnt.textContent = ' · ' + (model.pts.length - 1) + ' palier' + (model.pts.length > 2 ? 's' : '');
  applyScalingTablePanel();
}
function applyScalingTablePanel() {
  const st = getScalingState();
  const panel = document.getElementById('sc-table-panel');
  if (panel) panel.classList.toggle('open', !!st.tableOpen);
  const hint = document.getElementById('sc-table-hint');
  if (hint) hint.textContent = st.tableOpen ? 'Replier' : 'Déplier';
}
function toggleScalingTablePanel() {
  const st = getScalingState();
  st.tableOpen = !st.tableOpen;
  saveScalingState();
  applyScalingTablePanel();
}

let scResizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(scResizeT);
  scResizeT = setTimeout(() => renderScaling(), 150);
});

// ── Suivi du plan : alerte de palier (Dashboard) et respect du risque prévu ──
const SCALING_SEEN_KEY = (JP + 'scaling_seen');
function scalingConfigured() { return DB.getItem(SCALING_KEY) != null; }
function scalingNow() {
  const st = getScalingState(), current = scalingCurrent(st), model = computeScalingPaliers(st, current);
  return model.error ? null : { st, current, model, cur: model.pts[model.r] };
}
// Palier « vu » = capital du dernier palier dont l'utilisateur a pris connaissance.
function scAckPalier() {
  const now = scalingNow();
  if (now) DB.setItem(SCALING_SEEN_KEY, String(now.cur.bal));
  const el = document.getElementById('scaling-alert');
  if (el) el.style.display = 'none';
}
function renderScalingAlert() {
  const el = document.getElementById('scaling-alert');
  if (!el) return;
  const now = scalingConfigured() ? scalingNow() : null;
  if (!now) { el.style.display = 'none'; return; }
  const seen = parseFloat(DB.getItem(SCALING_SEEN_KEY));
  if (isNaN(seen)) { DB.setItem(SCALING_SEEN_KEY, String(now.cur.bal)); el.style.display = 'none'; return; }
  const { model, cur } = now, r = model.r, name = r === 0 ? 'ton palier de départ' : 'P' + r;
  if (Math.abs(cur.bal - seen) < 0.5) { el.style.display = 'none'; return; }
  const up = cur.bal > seen;
  // Palier franchi à la baisse : on nomme le palier QUITTÉ (le premier au-dessus du solde actuel).
  const left = model.pts[r + 1];
  el.className = 'scaling-alert ' + (up ? 'up' : 'down');
  mount(el, html`<span class="fs-16" aria-hidden="true">${up ? '📈' : '📉'}</span><span class="scaling-alert-txt">${up
    ? html`<b>Nouveau palier atteint : ${name} (${fmtEUR(cur.bal)})</b> — passe à <b>${fmtEUR(cur.risk, false, 2)}</b> par trade (${scPct(cur.pct)}).`
    : html`<b>Tu es repassé sous ${left ? 'P' + left.k + ' (' + fmtEUR(left.bal) + ')' : 'ton palier'}</b> — reprends <b>${fmtEUR(cur.risk, false, 2)}</b> par trade jusqu'à revenir au-dessus.`}</span><button class="btn-ghost" onclick="showPage('scaling', document.querySelector('.nav-item[data-page=scaling]'))">Voir le plan</button><button class="btn-ghost btn-s7" onclick="scAckPalier()">C'est noté</button>`);
  el.style.display = 'flex';
}

// Risque réel d'un trade = |P&L €| ÷ |R| ; comparé au risque prévu par le palier du solde AVANT le trade.
const SC_TOL = 0.2;   // ±20 % : arrondi des lots, spread, glissement
function scalingCompliance(limit) {
  const now = scalingNow();
  if (!now) return null;
  const { st, model } = now;
  const base = accountSize > 0 ? accountSize : 0;
  const chrono = [...trades].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.entry || '').localeCompare(b.entry || '') || (a.id || 0) - (b.id || 0));
  let bal = base;
  const rows = [];
  chrono.forEach(t => {
    const eur = (typeof t.pnlEur === 'number' && !isNaN(t.pnlEur)) ? t.pnlEur : null;
    if (eur !== null && ['TP', 'SL'].includes(t.res) && typeof t.pnl === 'number' && Math.abs(t.pnl) >= 0.25 && rUsable(t) && eur !== 0 && Math.sign(eur) === Math.sign(t.pnl)) {
      let i = 0;
      model.pts.forEach((p, k) => { if (bal + 1e-6 >= p.bal) i = k; });
      const plan = model.pts[i], actual = Math.abs(eur / t.pnl), ratio = actual / plan.risk;
      rows.push({ t, bal, palier: i, plan: plan.risk, actual, ratio, verdict: ratio > 1 + SC_TOL ? 'big' : ratio < 1 - SC_TOL ? 'small' : 'ok' });
    }
    if (eur !== null) bal += eur;
  });
  const last = rows.slice(-(limit || 20));
  return { rows: last, ok: last.filter(r => r.verdict === 'ok').length, big: last.filter(r => r.verdict === 'big'), small: last.filter(r => r.verdict === 'small'), total: rows.length };
}
function scRatioTxt(r) { return '×' + r.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function renderScalingCompliance(st, model) {
  const cont = document.getElementById('sc-compliance');
  if (!cont) return;
  const c = model.error ? null : scalingCompliance(20);
  if (!c || !c.rows.length) {
    mount(cont, html`<div class="sc-empty">Aucun trade mesurable pour l'instant : il faut un P&amp;L en € et un R (prix d'entrée / stop ou R saisi) pour retrouver le risque réellement pris.</div>`);
    return;
  }
  const n = c.rows.length, pct = Math.round(c.ok / n * 100);
  const worst = c.big.reduce((w, r) => (!w || r.ratio > w.ratio) ? r : w, null);
  const tiles = [
    { label: 'Taille respectée', val: c.ok + ' / ' + n, tone: pct >= 80 ? 'green' : pct >= 60 ? 'amber' : 'red', sub: pct + ' % des ' + n + ' derniers trades mesurables (±' + Math.round(SC_TOL * 100) + ' %)' },
    { label: 'Trop gros', val: String(c.big.length), tone: c.big.length ? 'red' : 'green', sub: worst ? 'pire : ' + scRatioTxt(worst.ratio) + ' le ' + fmtDateFR(worst.t.date) + ' (' + fmtEUR(worst.actual) + ' au lieu de ' + fmtEUR(worst.plan) + ')' : 'aucun dépassement' },
    { label: 'Trop petits', val: String(c.small.length), tone: c.small.length ? 'amber' : 'green', sub: c.small.length ? 'tu laisses du potentiel de côté' : 'aucun sous-dimensionnement' }
  ];
  const tag = r => r.verdict === 'ok' ? html`<span class="st-chip ok">✓ dans le plan</span>` : r.verdict === 'big' ? html`<span class="st-chip crit">▲ trop gros</span>` : html`<span class="st-chip warn">▼ trop petit</span>`;
  const rows = c.rows.slice().reverse().map(r => html`<tr><td>${fmtDateFR(r.t.date)}</td><td>${r.t.asset || '—'}</td><td>${fmtEUR(r.bal)}</td><td>${r.palier === 0 ? 'Départ' : 'P' + r.palier}</td><td>${fmtEUR(r.plan, false, 2)}</td><td class="fw-700">${fmtEUR(r.actual, false, 2)}</td><td class="tone-${raw(r.verdict === 'ok' ? 'green' : r.verdict === 'big' ? 'red' : 'amber')} fw-700">${scRatioTxt(r.ratio)}</td><td>${tag(r)}</td></tr>`);
  mount(cont, html`<div class="sc-tiles sc-tiles-3">${tiles.map(t => html`<div class="sc-tile"><div class="sc-tile-label">${t.label}</div><div class="sc-tile-val tone-${raw(t.tone)}">${t.val}</div><div class="sc-tile-sub">${t.sub}</div></div>`)}</div>
    <div class="sc-table-wrap"><table class="sc-table"><thead><tr><th>Date</th><th>Actif</th><th>Solde avant</th><th>Palier</th><th>Risque prévu</th><th>Risque réel</th><th>Écart</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="sc-note">Risque réel = P&amp;L en € ÷ R du trade (trades gagnants et perdants avec un R connu). Risque prévu = risque du palier correspondant à ton solde juste avant le trade. Tolérance ±${Math.round(SC_TOL * 100)} % pour l'arrondi des lots et le glissement.</p>`);
}
// Constats du Dashboard (barre « Aujourd'hui ») : risque du palier + respect de la taille.
function scalingInsightChips(chip) {
  if (!scalingConfigured()) return [];
  const now = scalingNow();
  if (!now) return [];
  const go = "showPage('scaling', document.querySelector('.nav-item[data-page=scaling]'))";
  const { cur, model } = now;
  const out = [chip('💰', 'Risque du palier', fmtEUR(cur.risk, false, 2) + ' / trade', model.r === 0 ? 'départ' : 'P' + model.r, 'blue', go, '', 'Taille à prendre selon ton plan de scaling (' + scPct(cur.pct) + ' de ' + fmtEUR(cur.bal) + ')')];
  const c = scalingCompliance(10);
  if (c && c.rows.length >= 3) {
    const last = c.rows[c.rows.length - 1], n = c.rows.length;
    const note = last.verdict === 'big' ? 'dernier trade ' + scRatioTxt(last.ratio) + ' trop gros' : last.verdict === 'small' ? 'dernier trade ' + scRatioTxt(last.ratio) + ' trop petit' : '';
    out.push(chip('⚖️', 'Taille respectée', c.ok + '/' + n, 'derniers trades', c.ok / n >= 0.8 ? 'green' : c.ok / n >= 0.6 ? 'amber' : 'red', go, note, 'Trades dont le risque réel (P&L € ÷ R) est à ±' + Math.round(SC_TOL * 100) + ' % du risque prévu par ton palier'));
  }
  return out;
}
