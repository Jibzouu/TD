// ── SCALING ACCOUNT ──────────────────────────────────────────────────
// Principe : capital de départ, risque par trade (% du palier), paliers tous les X € et un coussin de sécurité.
// En atteignant un palier tu GARDES ta taille jusqu'à avoir fait le coussin (ex. 2 000 → 2 500 €), puis tu passes au
// risque du palier (3 % de 2 000 = 60 €). Le coussin garde le même nombre de pertes à chaque palier (il grandit avec le
// risque). Si tu repasses sous le palier, tu reprends la taille d'avant.
const SCALING_KEY = (JP + 'scaling');
let scalingState = null;

function scRound(v, d) { const f = Math.pow(10, d); return Math.round(v * f) / f; }
function scPct(v) { return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %'; }
function scNum1(v) { return v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function scNiceStep(v) { return Math.pow(10, Math.floor(Math.log10(Math.max(v, 1)))); }
// Montant compact pour la frise (« 120 € » plutôt que « 120,00 € »).
function scEurShort(v) { return Math.abs(v - Math.round(v)) < 0.005 ? fmtEUR(Math.round(v)) : fmtEUR(v, false, 2); }

function scalingDefaults() {
  const start = accountSize > 0 ? accountSize : 1000, step = scNiceStep(start);
  return { version: 4, start, riskPct: 1, step, cushion1: step / 2, goal: start * 10, current: start, auto: true, riskSteps: [], tableOpen: false };
}
function loadScalingState() {
  const d = scalingDefaults();
  try {
    const raw = JSON.parse(DB.getItem(SCALING_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      ['start', 'riskPct', 'goal', 'current'].forEach(k => { if (typeof raw[k] === 'number' && isFinite(raw[k]) && raw[k] > 0) d[k] = raw[k]; });
      d.step = scNiceStep(d.start); d.cushion1 = d.step / 2;
      if (typeof raw.step === 'number' && raw.step > 0) d.step = raw.step;
      else if (raw.params && raw.params.round > 0) d.step = raw.params.round;   // anciennes versions : pas des paliers ronds
      if (typeof raw.cushion1 === 'number' && raw.cushion1 >= 0) d.cushion1 = raw.cushion1;
      else d.cushion1 = d.step / 2;
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

// Solde du journal, trade après trade (du plus ancien au plus récent) : sert à savoir quelle taille s'appliquait.
function scChronoTrades() {
  return [...trades].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.entry || '').localeCompare(b.entry || '') || (a.id || 0) - (b.id || 0));
}
function scEur(t) { return (typeof t.pnlEur === 'number' && !isNaN(t.pnlEur)) ? t.pnlEur : null; }
function scalingJournalBalance() {
  const base = accountSize > 0 ? accountSize : 0;
  return trades.reduce((s, t) => s + (scEur(t) || 0), base);
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
function scCeilTo(v, step) { return Math.ceil(v / step - 1e-9) * step; }

// Paliers tous les « step » € ; risque = % du palier. En atteignant un palier tu gardes ta taille jusqu'à avoir fait
// le coussin : coussin du 1er palier (€) puis LE MÊME NOMBRE DE PERTES à chaque palier (il grandit avec le risque).
// Le palier suivant n'est jamais dans le coussin du précédent : un palier recouvert est sauté.
function computeScalingPaliers(st, current) {
  if (!(st.start > 0) || !(st.riskPct > 0)) return { error: 'Renseigne un capital de départ et un risque par trade supérieurs à 0.' };
  if (!(st.step > 0)) return { error: 'Renseigne un écart entre paliers supérieur à 0.' };
  const first = (Math.floor(st.start / st.step + 1e-9) + 1) * st.step;
  const N = (st.cushion1 || 0) / (first * scPctAt(st, first) / 100);   // pertes que représente le coussin du 1er palier
  const pts = [{ k: 0, bal: st.start, pct: st.riskPct, risk: st.start * st.riskPct / 100, trigger: st.start, cushionEur: 0, cushionN: 0 }];
  const limit = Math.max(st.goal, current || 0);
  let bal = first;
  while (pts.length < 40) {
    const pct = scPctAt(st, bal), risk = bal * pct / 100;
    const cushionEur = N > 0 ? scCeilTo(N * risk, 10) : 0;
    const p = { k: pts.length, bal, pct, risk, cushionEur, cushionN: cushionEur / risk, trigger: bal + cushionEur };
    pts.push(p);
    if (bal > limit) break;
    bal = Math.max(bal + st.step, scCeilTo(p.trigger, st.step));
  }
  const beyond = pts[pts.length - 1].bal > limit ? pts.pop() : null;
  return { pts, beyond, N };
}
// Niveau de taille (index du palier dont le risque s'applique) en suivant le solde dans l'ordre : on monte d'un niveau
// à la FIN du coussin du palier suivant, on redescend dès qu'on repasse SOUS le capital du palier.
function scStepLevel(pts, L, bal) {
  while (L + 1 < pts.length && bal + 1e-6 >= pts[L + 1].trigger) L++;
  while (L > 0 && bal < pts[L].bal - 1e-6) L--;
  return L;
}
function scLevelFrom(pts, bal) { return scStepLevel(pts, 0, bal); }   // sans historique : on suppose que tu viens d'en dessous
// Parcours du journal : niveau avant chaque trade + niveau actuel.
function scWalkJournal(model) {
  const base = accountSize > 0 ? accountSize : 0;
  let bal = base, L = scLevelFrom(model.pts, base);
  const steps = [];
  scChronoTrades().forEach(t => {
    const eur = scEur(t);
    steps.push({ t, bal, L });
    if (eur !== null) { bal += eur; L = scStepLevel(model.pts, L, bal); }
  });
  return { steps, L, bal };
}
function scalingLevel(st, model, current) { return st.auto ? scWalkJournal(model).L : scLevelFrom(model.pts, current); }

// ── Saisie ──
const SC_FIELDS = { start: 'sc-start', riskPct: 'sc-risk-pct', riskEur: 'sc-risk-eur', step: 'sc-step', cushion1: 'sc-cushion1', goal: 'sc-goal', current: 'sc-current', auto: 'sc-auto' };
function fillScalingForm() {
  const st = getScalingState();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('sc-start', st.start);
  set('sc-risk-pct', scRound(st.riskPct, 3));
  set('sc-risk-eur', scRound(st.start * st.riskPct / 100, 2));
  set('sc-step', st.step);
  set('sc-cushion1', st.cushion1);
  set('sc-goal', st.goal);
  set('sc-current', scRound(scalingCurrent(st), 2));
  const auto = document.getElementById('sc-auto');
  if (auto) auto.checked = !!st.auto;
  applyScalingTablePanel();
}
function onScalingInput(field) {
  const st = getScalingState();
  const el = document.getElementById(SC_FIELDS[field]);
  if (!el) return;
  const v = parseFloat(String(el.value).replace(',', '.'));
  const set = (id, x) => { const e = document.getElementById(id); if (e) e.value = x; };
  if (field === 'start' && v > 0) {
    // L'objectif suit le départ tant qu'il n'a pas été personnalisé.
    if (Math.abs(st.goal - st.start * 10) < 0.01 || st.goal <= v) { st.goal = v * 10; set('sc-goal', st.goal); }
    st.start = v;
    set('sc-risk-eur', scRound(v * st.riskPct / 100, 2));
  } else if (field === 'riskPct' && v > 0 && v < 100) { st.riskPct = v; set('sc-risk-eur', scRound(st.start * v / 100, 2)); }
  else if (field === 'riskEur' && v > 0 && v < st.start) { st.riskPct = v / st.start * 100; set('sc-risk-pct', scRound(st.riskPct, 3)); }
  else if (field === 'step' && v > 0) st.step = v;
  else if (field === 'cushion1' && v >= 0) st.cushion1 = v;
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
function scName(k) { return k === 0 ? 'Départ' : 'P' + k; }
function renderScaling(opts) {
  const page = document.getElementById('page-scaling');
  if (!page || !page.classList.contains('active')) return;
  const st = getScalingState();
  const current = scalingCurrent(st);
  const curInput = document.getElementById('sc-current');
  if (curInput) { curInput.disabled = !!st.auto; if (st.auto) curInput.value = scRound(current, 2); }
  const model = computeScalingPaliers(st, current);
  const hint = document.getElementById('sc-cushion-hint');
  if (hint) hint.textContent = model.error || !(st.cushion1 > 0) ? 'aucun : tu augmentes dès le palier'
    : `= ${scNum1(model.N)} pertes à ${fmtEUR(model.pts[1].risk, false, 2)}, gardé à chaque palier`;
  const L = model.error ? 0 : scalingLevel(st, model, current);
  const rule = document.getElementById('sc-rule-text');
  if (rule) {
    const steps = st.riskSteps.length ? ' Risque ajusté : ' + st.riskSteps.map(r => scPct(r.pct) + ' à partir de ' + fmtEUR(r.from)).join(', ') + '.' : '';
    rule.textContent = model.error ? '' : `Paliers tous les ${fmtEUR(st.step)}. En atteignant un palier, tu gardes ta taille jusqu'à avoir fait ton coussin (${fmtEUR(st.cushion1)} au premier palier, puis ${scNum1(model.N)} pertes au nouveau risque à chaque palier), puis tu passes à ${scPct(st.riskPct)} du palier. Si tu repasses sous le palier, tu reprends la taille d'avant.${steps}${st.auto ? '' : ' Solde saisi à la main : on suppose que tu y es arrivé en montant.'}`;
  }
  renderScalingTiles(st, model, current, L);
  renderScalingTimeline(st, model, current, L, opts || {});
  renderScalingTable(st, model, current, L);
  renderScalingCompliance(st, model);
}

function renderScalingTiles(st, model, current, L) {
  const cont = document.getElementById('sc-tiles');
  if (!cont) return;
  if (model.error) { mount(cont, ''); return; }
  const { pts } = model, cur = pts[L], prev = pts[L - 1], next = pts[L + 1] || model.beyond;
  const inCush = next && current + 1e-6 >= next.bal && current < next.trigger - 1e-6;
  const margin = (current - cur.bal) / cur.risk;
  const left = Math.max(0, pts.length - 1 - L);
  const tiles = [
    { label: 'Risque par trade maintenant', val: fmtEUR(cur.risk, false, 2), tone: 'blue',
      sub: `${scPct(cur.pct)} de ${fmtEUR(cur.bal)} · ${L === 0 ? 'taille de départ' : 'palier P' + L}${inCush ? ' · tu fais ton coussin, garde cette taille' : ''}` },
    { label: 'Tu augmentes à', val: next ? fmtEUR(next.trigger) : 'Objectif atteint', tone: inCush ? 'green' : 'amber',
      sub: next ? `palier ${fmtEUR(next.bal)} + coussin ${fmtEUR(next.cushionEur)} · encore ${fmtEUR(Math.max(0, next.trigger - current))} → risque ${fmtEUR(next.risk, false, 2)}` : '' },
    { label: 'Marge avant de redescendre', val: L === 0 ? '—' : scNum1(margin) + ' pertes', tone: L === 0 ? 'txt' : (margin < 2 ? 'red' : margin < 5 ? 'amber' : 'green'),
      sub: L === 0 ? 'taille de départ : pas de taille plus petite' : `${fmtEUR(current - cur.bal)} au-dessus de P${L} (${fmtEUR(cur.bal)}) · en dessous, retour à ${fmtEUR(prev.risk, false, 2)}` },
    { label: 'Objectif', val: fmtEUR(st.goal), tone: current >= st.goal ? 'green' : 'txt',
      sub: current >= st.goal ? 'atteint 🎉' : `reste ${fmtEUR(st.goal - current)} · ${left} palier${left > 1 ? 's' : ''} d'ici là` }
  ];
  mount(cont, html`${tiles.map(t => html`<div class="sc-tile"><div class="sc-tile-label">${t.label}</div><div class="sc-tile-val tone-${raw(t.tone)}">${t.val}</div><div class="sc-tile-sub">${t.sub}</div></div>`)}`);
}

function renderScalingTimeline(st, model, current, L, opts) {
  const wrap = document.getElementById('sc-tl-wrap'), tl = document.getElementById('sc-tl');
  if (!wrap || !tl) return;
  if (model.error) { tl.style.width = 'auto'; tl.style.height = 'auto'; mount(tl, html`<div class="sc-empty">${model.error}</div>`); return; }
  tl.style.height = '';
  const pts = model.pts.slice();
  if (model.beyond) pts.push({ ...model.beyond, beyond: true });
  const m = pts.length, bals = pts.map(p => p.bal);
  const padL = 64, padR = 72;
  const S = Math.max(200, Math.floor(Math.max(300, wrap.clientWidth - padL - padR) / Math.max(1, m - 1)));
  tl.style.width = (padL + (m - 1) * S + padR) + 'px';
  // Position d'un montant sur la frise : interpolation entre les deux paliers qui l'encadrent.
  const xOf = b => {
    if (m < 2) return padL;
    if (b <= bals[0]) return padL + Math.max(-0.45, (b - bals[0]) / (bals[1] - bals[0])) * S;
    let i = 0;
    while (i < m - 2 && b >= bals[i + 1]) i++;
    const span = i + 1 < m ? bals[i + 1] - bals[i] : bals[i] - bals[i - 1];
    return padL + Math.min(m - 1 + 0.45, i + (b - bals[i]) / span) * S;
  };
  const at = (x, w) => raw(`left:${x}px` + (w != null ? `;width:${w}px` : ''));
  const meX = xOf(current), trackW = (m - 1) * S;
  const h = [html`<div class="sc-track" style="${at(padL, trackW)}"><div class="sc-fill" style="${raw('width:' + Math.max(0, Math.min(trackW, meX - padL)) + 'px')}"></div></div>`];
  pts.forEach((p, i) => {
    const x = padL + i * S;
    const state = i <= L ? 'reached' : (i === L + 1 ? 'next' : '');
    if (i > 0 && p.cushionEur > 0) {
      // Zone coussin : du palier au point où tu augmentes ; ▲ = moment où la nouvelle taille s'applique.
      const x2 = p.beyond ? x + Math.min(S * 0.9, (p.trigger - p.bal) / (bals[i] - bals[i - 1]) * S) : xOf(p.trigger);
      const inside = current + 1e-6 >= p.bal && current < p.trigger - 1e-6 && i > L;
      h.push(html`<div class="sc-cz${raw(inside ? ' on' : '')}" style="${at(x, Math.max(6, x2 - x))}" title="Coussin de ${scName(p.k)} : ${fmtEUR(p.bal)} → ${fmtEUR(p.trigger)} (${fmtEUR(p.cushionEur)}, ${scNum1(p.cushionN)} pertes à ${fmtEUR(p.risk, false, 2)})"></div>`);
      h.push(html`<div class="sc-up ${state}" style="${at(x2)}"></div><div class="sc-up-lbl ${state}" style="${at(x2)}"><b>▲ ${fmtEUR(p.trigger)}</b><span>${scEurShort(p.risk)} / trade</span><i>coussin ${scEurShort(p.cushionEur)}</i></div>`);
    } else if (i > 0) {
      h.push(html`<div class="sc-up-lbl ${state}" style="${at(x)}"><b>▲ ${fmtEUR(p.bal)}</b><span>${scEurShort(p.risk)} / trade</span></div>`);
    }
    h.push(html`<div class="sc-dot ${state}${raw(p.beyond ? ' beyond' : '')}" style="${at(x)}" title="${scName(p.k)} — ${fmtEUR(p.bal)} · risque ${fmtEUR(p.risk, false, 2)} (${scPct(p.pct)}) à partir de ${fmtEUR(p.trigger)}"></div>`);
    h.push(html`<div class="sc-lbl sc-lbl-top" style="${at(x)}"><span class="sc-chip ${state}">${scName(p.k)}</span><div class="sc-cap">${fmtEUR(p.bal)}</div></div>`);
    if (i === 0) h.push(html`<div class="sc-up-lbl ${state}" style="${at(x)}"><span>${scEurShort(p.risk)} / trade</span></div>`);
  });
  h.push(html`<div class="sc-me" style="${at(meX)}"><div class="sc-me-pill">Toi · ${fmtEUR(current)} · ${scEurShort(model.pts[L].risk)}/trade</div><div class="sc-me-line"></div></div>`);
  mount(tl, html`${h}`);
  if (opts && opts.center) wrap.scrollLeft = Math.max(0, meX - wrap.clientWidth / 2);
}

function renderScalingTable(st, model, current, L) {
  const cont = document.getElementById('sc-table');
  if (!cont) return;
  const cnt = document.getElementById('sc-table-count');
  if (model.error) { mount(cont, ''); if (cnt) cnt.textContent = ''; return; }
  // Redessin pendant la saisie : on garde la case active.
  const act = document.activeElement, keep = act && cont.contains(act) ? act.getAttribute('aria-label') : null;
  const rows = model.pts.map((p, i) => {
    const prev = model.pts[i - 1];
    const own = i > 0 ? scRiskStepOn(st, p, prev.bal) : null;
    const inCush = i > L && current + 1e-6 >= p.bal && current < p.trigger - 1e-6;
    const status = i < L ? html`<span class="tone-green">✔ atteint</span>`
      : i === L ? html`<span class="tone-blue fw-700">● taille actuelle</span>`
      : inCush ? html`<span class="tone-green">◐ coussin en cours · reste ${fmtEUR(p.trigger - current)}</span>` : `reste ${fmtEUR(p.trigger - current)}`;
    const riskCell = i === 0 ? scPct(p.pct)
      : html`<label class="sc-cush-in${raw(own ? ' own' : '')}" title="Risque (% du palier) à partir de P${p.k}. Vide = même % que le palier précédent."><input type="number" min="0.05" max="99" step="0.25" value="${own ? own.pct : ''}" placeholder="${scRound(p.pct, 3)}" aria-label="Risque de P${p.k} (%)" onchange="setScalingPalierRisk(${raw(scRound(p.bal, 2))}, ${raw(own ? String(scRound(own.from, 2)) : 'null')}, this.value)"><span>%</span></label>`;
    return html`<tr class="${i === L ? 'cur' : ''}"><td class="sc-td-k">${scName(p.k)}</td><td>${fmtEUR(p.bal)}</td><td>${i === 0 ? '—' : p.cushionEur > 0 ? html`${fmtEUR(p.cushionEur)} <span class="tone-muted">· ${scNum1(p.cushionN)} pertes</span>` : 'aucun'}</td><td class="tone-amber fw-700">${i === 0 ? '—' : fmtEUR(p.trigger)}</td><td>${riskCell}</td><td class="tone-blue fw-700">${fmtEUR(p.risk, false, 2)}</td><td>${status}</td></tr>`;
  });
  mount(cont, html`<table class="sc-table"><thead><tr><th>Palier</th><th>Capital</th><th title="Gains à faire au-dessus du palier, avec ta taille d'avant, avant d'augmenter">Coussin</th><th>Tu augmentes à</th><th>Risque (%)</th><th>Risque / trade</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table><p class="sc-note">Coussin = ce que tu gagnes au-dessus du palier, avec ta taille d'avant, avant d'augmenter. Il garde le même nombre de pertes à chaque palier : si tu enchaînes ces pertes juste après avoir augmenté, tu repasses sous le palier et tu reprends la taille d'avant. Risque (%) : un % saisi sur un palier vaut pour lui et les suivants ; vide = même % que le palier précédent.</p>`);
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
  if (model.error) return null;
  const L = scalingLevel(st, model, current);
  return { st, current, model, L, cur: model.pts[L] };
}
// Palier « vu » = capital du palier dont la taille s'appliquait quand l'utilisateur en a pris connaissance.
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
  const { model, cur, L } = now;
  if (Math.abs(cur.bal - seen) < 0.5) { el.style.display = 'none'; return; }
  const up = cur.bal > seen, left = model.pts[L + 1];
  el.className = 'scaling-alert ' + (up ? 'up' : 'down');
  mount(el, html`<span class="fs-16" aria-hidden="true">${up ? '📈' : '📉'}</span><span class="scaling-alert-txt">${up
    ? html`<b>Coussin de ${scName(L)} fait (${fmtEUR(cur.trigger)})</b> — passe à <b>${fmtEUR(cur.risk, false, 2)}</b> par trade (${scPct(cur.pct)} de ${fmtEUR(cur.bal)}).`
    : html`<b>Tu es repassé sous ${left ? scName(left.k) + ' (' + fmtEUR(left.bal) + ')' : 'ton palier'}</b> — reprends <b>${fmtEUR(cur.risk, false, 2)}</b> par trade.`}</span><button class="btn-ghost" onclick="showPage('scaling', document.querySelector('.nav-item[data-page=scaling]'))">Voir le plan</button><button class="btn-ghost btn-s7" onclick="scAckPalier()">C'est noté</button>`);
  el.style.display = 'flex';
}

// Risque réel d'un trade = |P&L €| ÷ |R| ; comparé au risque de la taille qui s'appliquait AVANT le trade.
const SC_TOL = 0.2;   // ±20 % : arrondi des lots, spread, glissement
function scalingCompliance(limit) {
  const now = scalingNow();
  if (!now) return null;
  const { model } = now;
  const rows = [];
  scWalkJournal(model).steps.forEach(({ t, bal, L }) => {
    const eur = scEur(t);
    if (eur === null || !['TP', 'SL'].includes(t.res) || typeof t.pnl !== 'number' || Math.abs(t.pnl) < 0.25 || !rUsable(t) || eur === 0 || Math.sign(eur) !== Math.sign(t.pnl)) return;
    const plan = model.pts[L], actual = Math.abs(eur / t.pnl), ratio = actual / plan.risk;
    rows.push({ t, bal, palier: L, plan: plan.risk, actual, ratio, verdict: ratio > 1 + SC_TOL ? 'big' : ratio < 1 - SC_TOL ? 'small' : 'ok' });
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
  const rows = c.rows.slice().reverse().map(r => html`<tr><td>${fmtDateFR(r.t.date)}</td><td>${r.t.asset || '—'}</td><td>${fmtEUR(r.bal)}</td><td>${scName(r.palier)}</td><td>${fmtEUR(r.plan, false, 2)}</td><td class="fw-700">${fmtEUR(r.actual, false, 2)}</td><td class="tone-${raw(r.verdict === 'ok' ? 'green' : r.verdict === 'big' ? 'red' : 'amber')} fw-700">${scRatioTxt(r.ratio)}</td><td>${tag(r)}</td></tr>`);
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
  const { cur, model, L, current } = now, next = model.pts[L + 1];
  const inCush = next && current + 1e-6 >= next.bal && current < next.trigger - 1e-6;
  const out = [chip('💰', 'Risque du plan', fmtEUR(cur.risk, false, 2) + ' / trade', L === 0 ? 'départ' : 'P' + L, 'blue', go,
    inCush ? 'coussin ' + scName(next.k) + ' : encore ' + fmtEUR(next.trigger - current) : '', 'Taille à prendre selon ton plan de scaling (' + scPct(cur.pct) + ' de ' + fmtEUR(cur.bal) + ')')];
  const c = scalingCompliance(10);
  if (c && c.rows.length >= 3) {
    const last = c.rows[c.rows.length - 1], n = c.rows.length;
    const note = last.verdict === 'big' ? 'dernier trade ' + scRatioTxt(last.ratio) + ' trop gros' : last.verdict === 'small' ? 'dernier trade ' + scRatioTxt(last.ratio) + ' trop petit' : '';
    out.push(chip('⚖️', 'Taille respectée', c.ok + '/' + n, 'derniers trades', c.ok / n >= 0.8 ? 'green' : c.ok / n >= 0.6 ? 'amber' : 'red', go, note, 'Trades dont le risque réel (P&L € ÷ R) est à ±' + Math.round(SC_TOL * 100) + ' % du risque prévu par ton palier'));
  }
  return out;
}
