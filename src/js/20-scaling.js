// ── SCALING ACCOUNT ──────────────────────────────────────────────────
const SCALING_KEY = (JP + 'scaling');
const SCALING_MODES = {
  round:   { label: 'Pas entre les paliers (€)' },
  cushion: { label: "Pertes d'affilée à couvrir" },
  capital: { label: 'Hausse de capital par palier (%)' },
  risk:    { label: 'Hausse du risque par palier (€)' }
};
let scalingState = null;
let scalingGeom = null;
let scZoneSeq = 0;
let scTableCount = 0;

function scRound(v, d) { const f = Math.pow(10, d); return Math.round(v * f) / f; }
function scPct(v) { return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %'; }
function scNum1(v) { return v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function newScalingZoneId() { return Date.now() + (scZoneSeq++); }

// Pas « rond » par défaut : la puissance de 10 du capital de départ (1 000 € → 1 000, 250 € → 100…).
function scNiceStep(start) { return Math.pow(10, Math.floor(Math.log10(Math.max(start, 1)))); }
function scalingDefaults() {
  const start = accountSize > 0 ? accountSize : 1000;
  return { version: 2, start, riskPct: 1, mode: 'round', roundTo: 100, params: { round: scNiceStep(start), cushion: 10, capital: 10, risk: 10 }, goal: start * 5, current: start, auto: true, minCush: { unit: 'eur', value: 0, by: {} }, riskSteps: [], stepSteps: [], zones: [], zonesOpen: false, showZones: true, tableOpen: false, paramsOpen: false };
}
function loadScalingState() {
  const d = scalingDefaults();
  try {
    const raw = JSON.parse(DB.getItem(SCALING_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      ['start', 'riskPct', 'goal', 'current'].forEach(k => { if (typeof raw[k] === 'number' && isFinite(raw[k])) d[k] = raw[k]; });
      if (SCALING_MODES[raw.mode]) d.mode = raw.mode;
      if (raw.params && typeof raw.params === 'object') Object.keys(d.params).forEach(k => { if (typeof raw.params[k] === 'number' && raw.params[k] > 0) d.params[k] = raw.params[k]; });
      if (typeof raw.auto === 'boolean') d.auto = raw.auto;
      if (typeof raw.zonesOpen === 'boolean') d.zonesOpen = raw.zonesOpen;
      if (typeof raw.showZones === 'boolean') d.showZones = raw.showZones;
      if (typeof raw.tableOpen === 'boolean') d.tableOpen = raw.tableOpen;
      if (typeof raw.paramsOpen === 'boolean') d.paramsOpen = raw.paramsOpen;
      if (raw.minCush && typeof raw.minCush === 'object') {
        const mc = raw.minCush;
        if (mc.unit === 'eur' || mc.unit === 'loss') d.minCush.unit = mc.unit;
        if (typeof mc.value === 'number' && mc.value >= 0 && isFinite(mc.value)) d.minCush.value = mc.value;
        if (mc.by && typeof mc.by === 'object') Object.keys(mc.by).forEach(k => { const v = mc.by[k]; if (typeof v === 'number' && v >= 0 && isFinite(v)) d.minCush.by[k] = v; });
      }
      if (Array.isArray(raw.riskSteps)) d.riskSteps = raw.riskSteps
        .filter(r => r && typeof r.from === 'number' && isFinite(r.from) && typeof r.pct === 'number' && r.pct > 0 && r.pct < 100)
        .map(r => ({ from: r.from, pct: r.pct })).sort((a, b) => a.from - b.from);
      if (Array.isArray(raw.stepSteps)) d.stepSteps = raw.stepSteps
        .filter(r => r && typeof r.from === 'number' && isFinite(r.from) && typeof r.step === 'number' && r.step > 0 && isFinite(r.step))
        .map(r => ({ from: r.from, step: r.step })).sort((a, b) => a.from - b.from);
      if (typeof raw.roundTo === 'number' && raw.roundTo >= 0) d.roundTo = raw.roundTo;
      if (!(raw.params && raw.params.round > 0)) d.params.round = scNiceStep(d.start);
      // Sauvegardes d'avant les « paliers ronds » : on bascule sur cette règle.
      if (raw.version !== 2) {
        d.mode = 'round';
        if (Math.abs(d.goal - d.start * 2) < 0.01) d.goal = d.start * 5;
      }
      if (Array.isArray(raw.zones)) d.zones = raw.zones
        .filter(z => z && typeof z.from === 'number' && typeof z.to === 'number')
        .map(z => ({ id: (typeof z.id === 'number' ? z.id : newScalingZoneId()), from: z.from, to: z.to, label: String(z.label || 'Coussin'), color: ['green','amber','red','blue'].includes(z.color) ? z.color : 'green' }));
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

// Risque dégressif : un % réglé sur un palier vaut pour lui et tous les paliers suivants, jusqu'au prochain changement.
function scPctAt(st, bal) {
  let pct = st.riskPct;
  st.riskSteps.forEach(r => { if (bal > st.start + 0.5 && bal >= r.from - 0.5) pct = r.pct; });
  return pct;
}
function scRiskStepAt(st, bal) { return st.riskSteps.find(r => Math.abs(r.from - bal) < 0.5) || null; }
function setScalingPalierRisk(bal, value) {
  const st = getScalingState();
  const v = parseFloat(String(value).replace(',', '.'));
  st.riskSteps = st.riskSteps.filter(r => Math.abs(r.from - bal) >= 0.5);
  if (String(value).trim() !== '' && v > 0 && v < 100) st.riskSteps.push({ from: bal, pct: v });
  st.riskSteps.sort((a, b) => a.from - b.from);
  saveScalingState();
  setTimeout(() => renderScaling(), 0);   // après le déplacement du focus : la case suivante reste active
}

// Paliers ronds à pas variable : un pas réglé sur un palier vaut à partir de ce capital, jusqu'au prochain changement.
function scStepAt(st, bal) {
  let step = st.params.round;
  st.stepSteps.forEach(r => { if (bal >= r.from - 0.5) step = r.step; });
  return step;
}
// Changement de pas « posé » sur un palier : le premier changement situé entre le palier précédent (exclu) et celui-ci.
function scStepOwn(st, p, prevBal) { return st.stepSteps.find(r => r.from > prevBal + 0.5 && r.from <= p.bal + 0.5) || null; }
function setScalingPalierStep(bal, oldFrom, value) {
  const st = getScalingState();
  const v = parseFloat(String(value).replace(',', '.'));
  st.stepSteps = st.stepSteps.filter(r => Math.abs(r.from - bal) >= 0.5 && (oldFrom == null || Math.abs(r.from - oldFrom) >= 0.5));
  if (String(value).trim() !== '' && v > 0) st.stepSteps.push({ from: bal, step: v });
  st.stepSteps.sort((a, b) => a.from - b.from);
  saveScalingState();
  setTimeout(() => renderScaling(), 0);   // après le déplacement du focus : la case suivante reste active
}

// Capital du palier suivant, selon la règle choisie (j = compteur brut, utilisé par la règle « risque »).
function scalingRawNext(st, j, bal) {
  const pct = scPctAt(st, bal) / 100, R0 = st.start * st.riskPct / 100, p = st.params[st.mode];
  if (st.mode === 'round') { const step = scStepAt(st, bal); return (Math.floor(bal / step + 1e-9) + 1) * step; }   // prochain multiple rond strictement au-dessus
  let raw = null;
  if (st.mode === 'cushion') { const d = 1 - p * pct; raw = d > 0.02 ? bal / d : null; }
  else if (st.mode === 'capital') raw = bal * (1 + p / 100);
  else if (st.mode === 'risk') raw = (R0 + (j + 1) * p) / pct;
  if (raw == null) return null;
  const rt = st.roundTo || 0;
  return rt > 0 ? Math.ceil(raw / rt - 1e-9) * rt : raw;   // arrondi vers le haut : le coussin visé reste garanti
}
function computeScalingPaliers(st, currentBal) {
  if (!(st.start > 0) || !(st.riskPct > 0)) return { error: 'Renseigne un capital de départ et un risque par trade supérieurs à 0.' };
  const p = st.params[st.mode];
  if (!(p > 0)) return { error: 'Renseigne une valeur positive pour la règle de palier.' };
  const pct = st.riskPct / 100, maxPct = Math.max(st.riskPct, ...st.riskSteps.map(r => r.pct)) / 100;
  if (st.mode === 'cushion' && p * maxPct >= 0.98) return { error: 'Avec ce risque, couvrir autant de pertes dépasserait ton capital : « pertes × risque % » doit rester sous 100 %.' };
  const limit = Math.max(st.goal || 0, currentBal || 0, st.start * 1.0001);
  const pts = [{ k: 0, bal: st.start, pct: st.riskPct, risk: st.start * pct, cushion: null }];
  let bal = st.start, j = 0, guard = 0, nextBeyond = null;
  while (pts.length < 41 && guard++ < 2000) {
    const next = scalingRawNext(st, j, bal);
    j++;
    if (next == null) break;
    if (!(next > bal + 0.005)) continue;   // règle « risque » arrondie : même palier que le précédent
    const np = scPctAt(st, next);
    const entry = { k: pts.length, bal: next, pct: np, risk: next * np / 100, cushion: null };
    if (next > limit * 1.000001) { nextBeyond = entry; break; }
    pts.push(entry);
    bal = next;
  }
  const entries = nextBeyond ? pts.concat([nextBeyond]) : pts;
  const targets = scalingApplyTriggers(st, entries);
  return { pts, nextBeyond, targets, usedZones: targets.some(t => t.ks.length > 0) };
}
// Une zone coussin décide du moment où tu augmentes vraiment ta taille : SA FIN devient le déclencheur du palier concerné.
// Palier concerné = celui que la zone contient ; à défaut, le dernier palier avant elle (zone placée juste après un palier).
function scalingZoneTargets(st, entries) {
  const EPS = 0.5;
  return st.zones.map(z => {
    const a = Math.min(z.from, z.to), b = Math.max(z.from, z.to);
    let ks = [];
    entries.forEach((p, i) => { if (i >= 1 && p.bal >= a - EPS && p.bal < b) ks.push(i); });
    if (!ks.length) {
      let last = -1;
      entries.forEach((p, i) => { if (i >= 1 && p.bal <= a + EPS) last = i; });
      if (last >= 1) ks = [last];
    }
    return { zone: z, a, b, ks };
  });
}
// Coussin minimum d'un palier : réglage du palier s'il existe, sinon le réglage global ; en € ou en pertes au risque du palier.
function scCushKey(p) { return String(Math.round(p.bal)); }
function scCushSetting(st, p) {
  const by = st.minCush.by, k = scCushKey(p);
  return Object.prototype.hasOwnProperty.call(by, k) ? { v: by[k], own: true } : { v: st.minCush.value, own: false };
}
function scCushEur(st, p) { const v = scCushSetting(st, p).v; return st.minCush.unit === 'loss' ? v * p.risk : v; }
// Plancher du coussin : le niveau sous lequel tu reviens à la taille précédente.
// Règle « coussin » : le palier précédent ; autres règles : le palier que tu viens de franchir.
function scCushFloor(st, entries, i) { return st.mode === 'cushion' ? (i >= 2 ? entries[i - 1].trigger : st.start) : entries[i].bal; }
function scalingApplyTriggers(st, entries) {
  entries.forEach((p, i) => { p.trigger = p.bal + (i >= 1 ? scCushEur(st, p) : 0); p.trigZone = null; });
  const targets = scalingZoneTargets(st, entries);
  targets.forEach(t => t.ks.forEach(i => { if (t.b > entries[i].trigger + 0.005) { entries[i].trigger = t.b; entries[i].trigZone = t.zone; } }));
  for (let i = 1; i < entries.length; i++) if (entries[i].trigger < entries[i - 1].trigger) entries[i].trigger = entries[i - 1].trigger;
  // Coussin = pertes d'affilée, au nouveau risque, entre le point d'augmentation et le plancher (retour à la taille précédente).
  for (let i = 1; i < entries.length; i++) { entries[i].floor = scCushFloor(st, entries, i); entries[i].cushion = (entries[i].trigger - entries[i].floor) / entries[i].risk; }
  return targets;
}
function scalingIdxOf(bals, b) {
  const m = bals.length;
  let idx;
  if (b <= bals[0]) idx = (b - bals[0]) / (bals[1] - bals[0]);
  else if (b >= bals[m - 1]) idx = (m - 1) + (b - bals[m - 1]) / (bals[m - 1] - bals[m - 2]);
  else { let i = 0; while (i < m - 2 && b >= bals[i + 1]) i++; idx = i + (b - bals[i]) / (bals[i + 1] - bals[i]); }
  return Math.max(-0.45, Math.min(m - 1 + 0.45, idx));
}
function scalingBalAt(bals, idx) {
  const m = bals.length;
  if (idx <= 0) return Math.max(0, bals[0] + idx * (bals[1] - bals[0]));
  if (idx >= m - 1) return bals[m - 1] + (idx - (m - 1)) * (bals[m - 1] - bals[m - 2]);
  const i = Math.floor(idx);
  return bals[i] + (idx - i) * (bals[i + 1] - bals[i]);
}
function scalingReachedIdx(model, current) {
  let r = 0;
  model.pts.forEach((p, i) => { if (current + 1e-6 >= (p.trigger != null ? p.trigger : p.bal)) r = i; });
  return r;
}

function fillScalingForm() {
  const st = getScalingState();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('sc-start', st.start);
  set('sc-risk-pct', scRound(st.riskPct, 3));
  set('sc-risk-eur', scRound(st.start * st.riskPct / 100, 2));
  set('sc-mode', st.mode);
  set('sc-param', st.params[st.mode]);
  const lbl = document.getElementById('sc-param-label');
  if (lbl) lbl.textContent = SCALING_MODES[st.mode].label;
  set('sc-round', st.roundTo);
  const rf = document.getElementById('sc-round-field');
  if (rf) rf.style.display = st.mode === 'round' ? 'none' : '';
  set('sc-goal', st.goal);
  set('sc-mincush', st.minCush.value || '');
  set('sc-mincush-unit', st.minCush.unit);
  const mci = document.getElementById('sc-mincush'); if (mci) mci.step = st.minCush.unit === 'loss' ? '0.5' : '50';
  set('sc-current', scRound(st.current, 2));
  const auto = document.getElementById('sc-auto');
  if (auto) auto.checked = !!st.auto;
  applyScalingZonesPanel();
  applyScalingTablePanel();
  applyScalingParamsPanel();
}
function onScalingInput(field) {
  const st = getScalingState();
  const num = id => parseFloat(document.getElementById(id).value);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  if (field === 'start') {
    const v = num('sc-start');
    if (v > 0) {
      const prev = st.start;
      st.start = v;
      set('sc-risk-eur', scRound(v * st.riskPct / 100, 2));
      // L'objectif et le pas suivent le capital de départ tant qu'ils n'ont pas été personnalisés.
      if (Math.abs(st.goal - prev * 5) < 0.01 || Math.abs(st.goal - prev * 2) < 0.01 || st.goal <= v) { st.goal = v * 5; set('sc-goal', st.goal); }
      if (Math.abs(st.params.round - scNiceStep(prev)) < 1e-9) {
        st.params.round = scNiceStep(v);
        if (st.mode === 'round') set('sc-param', st.params.round);
      }
    }
  } else if (field === 'riskPct') {
    const v = num('sc-risk-pct');
    if (v > 0) { st.riskPct = v; set('sc-risk-eur', scRound(st.start * v / 100, 2)); }
  } else if (field === 'riskEur') {
    const v = num('sc-risk-eur');
    if (v > 0 && st.start > 0) { st.riskPct = v / st.start * 100; set('sc-risk-pct', scRound(st.riskPct, 3)); }
  } else if (field === 'mode') {
    const m = document.getElementById('sc-mode').value;
    if (SCALING_MODES[m]) {
      st.mode = m;
      set('sc-param', st.params[m]);
      const lbl = document.getElementById('sc-param-label');
      if (lbl) lbl.textContent = SCALING_MODES[m].label;
      const rf = document.getElementById('sc-round-field');
      if (rf) rf.style.display = m === 'round' ? 'none' : '';
    }
  } else if (field === 'roundTo') {
    const v = parseFloat(document.getElementById('sc-round').value);
    if (v >= 0) st.roundTo = v;
  } else if (field === 'param') {
    const v = num('sc-param');
    if (v > 0) st.params[st.mode] = v;
  } else if (field === 'minCush') {
    const v = num('sc-mincush'), nv = v > 0 ? v : 0;
    if (nv === st.minCush.value) return;
    st.minCush.value = nv;
    // Validé en quittant le champ : on redessine une fois le focus arrivé sur sa nouvelle cible (case du tableau comprise).
    saveScalingState(); setTimeout(() => renderScaling(), 0); return;
  } else if (field === 'minCushUnit') {
    const u = document.getElementById('sc-mincush-unit').value;
    if (u !== st.minCush.unit && (u === 'eur' || u === 'loss')) {
      // Changement d'unité : on repart sur des valeurs rondes plutôt que de convertir des réglages par palier incohérents.
      st.minCush.unit = u; st.minCush.value = u === 'eur' ? 500 : 5; st.minCush.by = {};
      set('sc-mincush', st.minCush.value);
      document.getElementById('sc-mincush').step = u === 'loss' ? '0.5' : '50';
    }
  } else if (field === 'goal') {
    const v = num('sc-goal');
    if (v > 0) st.goal = v;
  } else if (field === 'current') {
    const v = num('sc-current');
    if (!isNaN(v)) st.current = v;
  } else if (field === 'showZones') {
    st.showZones = document.getElementById('sc-show-zones').checked;
  } else if (field === 'auto') {
    st.auto = document.getElementById('sc-auto').checked;
    if (!st.auto) st.current = scRound(scalingJournalBalance(), 2);
    set('sc-current', scRound(st.current, 2));
  }
  saveScalingState();
  renderScaling();
}
function scalingRuleText(st) {
  const p = st.params[st.mode], pct = scPct(st.riskPct);
  const rt = st.roundTo > 0 ? ` Les paliers sont arrondis au multiple de ${fmtEUR(st.roundTo)} supérieur.` : '';
  if (st.mode === 'round') { const first = (Math.floor(st.start / p + 1e-9) + 1) * p; return `Tu augmentes ta taille chaque fois que ton capital franchit un palier rond (tous les ${fmtEUR(p)}) : le risque par trade est alors recalculé à ${pct} du capital du palier (ex : à ${fmtEUR(first)} → ${fmtEUR(first * scPctAt(st, first) / 100, false, 2)} par trade). Si ton capital retombe sous le palier, reviens à la taille précédente.`; }
  if (st.mode === 'cushion') return `Tu passes au palier suivant quand tes gains depuis le palier précédent couvrent ${p} pertes complètes au nouveau risque (${pct} du capital). Si ton capital retombe sous le palier précédent, reviens à la taille précédente.${rt}`;
  if (st.mode === 'capital') return `Tu augmentes ta taille chaque fois que ton capital progresse de ${p} % par rapport au palier précédent : le risque par trade est alors recalculé à ${pct} du nouveau capital.${rt}`;
  return `Tu augmentes ta taille chaque fois que ton risque par trade peut monter de ${p} € tout en restant à ${pct} du capital.${rt}`;
}

function scCushTxt(st, v) { return st.minCush.unit === 'loss' ? scNum1(v).replace(/,0$/, '') + ' perte' + (v >= 2 ? 's' : '') : fmtEUR(v); }
function scStepRuleText(st) {
  if (st.mode !== 'round' || !st.stepSteps.length) return st.mode === 'round' ? ' Pour espacer tes paliers quand ton capital grandit, change le pas palier par palier dans le tableau des paliers (colonne « Pas »).' : '';
  return ' Pas des paliers : ' + fmtEUR(st.params.round) + ' au départ, ' + st.stepSteps.map(r => fmtEUR(r.step) + ' à partir de ' + fmtEUR(r.from)).join(', ') + '.';
}
function scRiskRuleText(st) {
  if (!st.riskSteps.length) return ' Pour baisser ton % de risque au fil des paliers, règle-le palier par palier dans le tableau des paliers (colonne « Risque (%) »).';
  return ' Risque dégressif : ' + st.riskSteps.map(r => scPct(r.pct) + ' à partir de ' + fmtEUR(r.from)).join(', ') + '.';
}
function scCushRuleText(st) {
  const n = Object.keys(st.minCush.by).length;
  if (!(st.minCush.value > 0) && !n) return '';
  const g = st.minCush.value > 0
    ? ` Coussin minimum : tu n'augmentes ta taille qu'une fois ${st.minCush.unit === 'loss' ? scCushTxt(st, st.minCush.value) + ' au nouveau risque' : fmtEUR(st.minCush.value)} au-dessus du palier.`
    : ' Pas de coussin minimum global.';
  return g + (n ? ` ${n} palier${n > 1 ? 's ont' : ' a'} un coussin personnalisé (tableau des paliers).` : '');
}
// Coussin personnalisé d'un palier (colonne « Coussin » du tableau) ; vide = réglage global.
function setScalingPalierCush(key, value) {
  const st = getScalingState();
  const v = parseFloat(String(value).replace(',', '.'));
  if (String(value).trim() === '' || isNaN(v) || v < 0) delete st.minCush.by[key];
  else st.minCush.by[key] = v;
  saveScalingState();
  setTimeout(() => renderScaling(), 0);   // après le déplacement du focus : la case suivante reste active
}

function renderScaling(opts) {
  const page = document.getElementById('page-scaling');
  if (!page || !page.classList.contains('active')) return;
  const st = getScalingState();
  const current = st.auto ? scalingJournalBalance() : st.current;
  const curInput = document.getElementById('sc-current');
  if (curInput) { curInput.disabled = !!st.auto; if (st.auto) curInput.value = scRound(current, 2); }
  const model = computeScalingPaliers(st, current);
  const rule = document.getElementById('sc-rule-text');
  if (rule) rule.textContent = scalingRuleText(st) + scStepRuleText(st) + scRiskRuleText(st) + scCushRuleText(st) + (model.usedZones ? ' Tes zones coussin décident du moment exact : la fin de chaque zone est le niveau où tu augmentes réellement ta taille.' : '');
  renderScalingTiles(st, model, current);
  renderScalingTimeline(st, model, current, opts || {});
  renderScalingTable(st, model, current);
  applyScalingParamsPanel();
}

function applyScalingParamsPanel() {
  const st = getScalingState();
  const panel = document.getElementById('sc-params-panel');
  if (panel) panel.classList.toggle('open', !!st.paramsOpen);
  const hint = document.getElementById('sc-params-hint');
  if (hint) hint.textContent = st.paramsOpen ? 'Replier' : 'Déplier';
  const sum = document.getElementById('sc-params-summary');
  if (sum) {
    const p = st.params[st.mode];
    const rule = st.mode === 'round' ? 'paliers tous les ' + fmtEUR(p) + (st.stepSteps.length ? ' → ' + fmtEUR(st.stepSteps[st.stepSteps.length - 1].step) : '') : (st.mode === 'cushion' ? 'coussin ' + p + ' pertes' : (st.mode === 'capital' ? '+' + p + ' % de capital par palier' : '+' + p + ' € de risque par palier'));
    const cush = st.minCush.value > 0 ? ' · coussin min ' + scCushTxt(st, st.minCush.value) : '';
    const deg = st.riskSteps.length ? ' → ' + scPct(st.riskSteps[st.riskSteps.length - 1].pct) : '';
    sum.textContent = '· départ ' + fmtEUR(st.start) + ' · risque ' + scPct(st.riskPct) + ' (' + fmtEUR(st.start * st.riskPct / 100, false, 2) + ')' + deg + ' · ' + rule + cush;
  }
}
function toggleScalingParamsPanel() {
  const st = getScalingState();
  st.paramsOpen = !st.paramsOpen;
  saveScalingState();
  applyScalingParamsPanel();
}

function renderScalingTiles(st, model, current) {
  const cont = document.getElementById('sc-tiles');
  if (!cont) return;
  if (model.error) { mount(cont, ''); return; }
  const r = scalingReachedIdx(model, current);
  const cur = model.pts[r];
  const next = model.pts[r + 1] || model.nextBeyond || null;
  const below = current < st.start - 1e-6;
  const floorBal = r >= 1 ? cur.floor : st.start;
  const cushionLosses = (current - floorBal) / cur.risk;
  const cushTone = cushionLosses < 2 ? 'red' : (cushionLosses < 5 ? 'amber' : 'green');
  // Prochain palier : on compte jusqu'à la FIN du coussin (moment réel de l'augmentation), pas jusqu'au palier rond.
  const delayed = !!next && next.trigger > next.bal + 0.005;
  const inCushion = !!next && current + 1e-6 >= next.bal && current + 1e-6 < next.trigger;
  const remaining = next ? Math.max(0, next.trigger - current) : 0;
  let nextSub = '—';
  if (next) {
    const pctTxt = current > 0 ? ' (' + scPct(remaining / current * 100) + ')' : '';
    nextSub = delayed
      ? `${inCushion ? 'dans le coussin depuis ' + fmtEUR(next.bal) : 'palier ' + fmtEUR(next.bal) + ' + coussin'} · encore ${fmtEUR(remaining)}${pctTxt} avant d'augmenter → risque ${fmtEUR(next.risk, false, 2)}`
      : `encore ${fmtEUR(remaining)}${pctTxt} → risque ${fmtEUR(next.risk, false, 2)}`;
  }
  const tiles = [
    { label: 'Risque par trade actuel', val: fmtEUR(cur.risk, false, 2), tone: 'blue',
      sub: `${current > 0 ? scPct(cur.risk / current * 100) + ' du capital actuel · ' : ''}${r === 0 ? 'palier de départ' : 'palier P' + r}` },
    { label: 'Palier actuel', val: r === 0 ? (below ? 'Sous le départ' : 'Départ') : 'P' + r, tone: 'txt',
      sub: below ? `il manque ${fmtEUR(st.start - current)} pour revenir au capital de départ`
        : (r === 0 ? `capital ${fmtEUR(cur.bal)} atteint · toi : ${fmtEUR(current)}` : `augmenté à ${fmtEUR(cur.trigger)} · toi : ${fmtEUR(current)}`) },
    { label: 'Prochain palier', val: next ? fmtEUR(next.trigger) : 'Objectif atteint', tone: 'amber', sub: nextSub },
    { label: 'Coussin actuel', val: cushionLosses > 0 ? scNum1(cushionLosses) + ' pertes' : 'Aucun', tone: cushTone,
      sub: `d'affilée avant de repasser sous ${r === 0 ? 'ton capital de départ' : (st.mode === 'cushion' ? (r >= 2 ? 'le palier P' + (r - 1) : 'ton capital de départ') : 'le palier P' + r)} (${fmtEUR(floorBal)}) et de réduire ta taille` }
  ];
  mount(cont, html`${tiles.map(t => html`<div class="sc-tile"><div class="sc-tile-label">${t.label}</div><div class="sc-tile-val tone-${raw(t.tone)}">${t.val}</div><div class="sc-tile-sub">${t.sub}</div></div>`)}`);
}

// Frise : montant compact (« 120 € » plutôt que « 120,00 € ») pour que les libellés voisins ne se chevauchent pas.
function scRiskShort(v) { return Math.abs(v - Math.round(v)) < 0.005 ? fmtEUR(Math.round(v)) : fmtEUR(v, false, 2); }
function renderScalingTimeline(st, model, current, opts) {
  const wrap = document.getElementById('sc-tl-wrap'), tl = document.getElementById('sc-tl');
  if (!wrap || !tl) return;
  if (model.error) { tl.style.width = 'auto'; tl.style.height = 'auto'; mount(tl, html`<div class="sc-empty">${model.error}</div>`); scalingGeom = null; return; }
  tl.style.height = '258px';
  const pts = model.pts.map(p => ({ ...p, type: p.k === 0 ? 'start' : 'palier' }));
  if (pts.length === 1 && model.nextBeyond) pts.push({ ...model.nextBeyond, type: 'palier' });
  if (st.goal > pts[pts.length - 1].bal * 1.0000001) pts.push({ k: null, bal: st.goal, type: 'goal' });
  if (pts.length < 2) pts.push({ k: null, bal: pts[0].bal * 1.25, type: 'goal' });
  const m = pts.length;
  const bals = pts.map(p => p.bal);
  const padL = 64, padR = 64, minS = 122;
  const avail = Math.max(300, wrap.clientWidth - padL - padR);
  const S = Math.max(minS, Math.floor(avail / (m - 1)));
  const W = padL + (m - 1) * S + padR;
  tl.style.width = W + 'px';
  scalingGeom = { padL, S, m, bals, W };
  const xOf = b => padL + scalingIdxOf(bals, b) * S;
  const trackW = (m - 1) * S;
  const meX = xOf(current);
  const fillW = Math.max(0, Math.min(trackW, meX - padL));
  const trig = p => (p.trigger != null ? p.trigger : p.bal);
  const nextIdx = pts.findIndex(p => current + 1e-6 < trig(p));
  // Frise : positions en pixels calculées (seule géométrie laissée en ligne), tout le reste en classes.
  const at = (x, w) => raw(`left:${x}px` + (w != null ? `;width:${w}px` : ''));
  const h = [];
  pts.forEach(p => {
    if (p.type !== 'palier' || p.trigZone || !(trig(p) > p.bal + 0.005)) return;
    const x1 = xOf(p.bal), x2 = xOf(trig(p));
    h.push(html`<div class="sc-zone green sc-zone-min" style="${at(x1, Math.max(8, x2 - x1))}" title="Coussin minimum de P${p.k} : ${fmtEUR(p.bal)} → ${fmtEUR(trig(p))}"></div>`);
  });
  (st.showZones ? st.zones : []).forEach(z => {
    const a = Math.min(z.from, z.to), b = Math.max(z.from, z.to);
    const x1 = xOf(a), x2 = xOf(b);
    const showName = !/^\s*coussin\s*$/i.test(z.label);
    h.push(html`<div class="sc-zone ${z.color}" style="${at(Math.min(x1, x2), Math.max(8, Math.abs(x2 - x1)))}" title="${z.label} : ${fmtEUR(a)} → ${fmtEUR(b)}">${showName ? html`<span class="sc-zone-name">${z.label}</span>` : ''}</div>`);
  });
  h.push(html`<div class="sc-track" style="${at(padL, trackW)}"><div class="sc-fill" style="${raw('width:' + fillW + 'px')}"></div></div>`);
  pts.forEach((p, i) => {
    const x = padL + i * S;
    const reached = p.type !== 'goal' && current + 1e-6 >= trig(p);
    const inCushion = !reached && p.type === 'palier' && current + 1e-6 >= p.bal;
    const state = reached ? 'reached' : (inCushion ? 'cushion' : (i === nextIdx ? 'next' : ''));
    const chip = p.type === 'start' ? 'Départ' : (p.type === 'goal' ? 'Objectif' : 'P' + p.k);
    const tip = p.type === 'goal' ? `Objectif : ${fmtEUR(p.bal)}` : `${chip} — ${fmtEUR(p.bal)}${trig(p) > p.bal + 0.005 ? ' · augmentation à ' + fmtEUR(trig(p)) : ''} · risque ${fmtEUR(p.risk, false, 2)} par trade`;
    h.push(html`<div class="sc-dot ${state}" style="${at(x)}" title="${tip}"></div>`);
    h.push(html`<div class="sc-lbl sc-lbl-top" style="${at(x)}"><span class="sc-chip ${state}">${chip}</span><div class="sc-cap">${fmtEUR(p.bal)}</div></div>`);
    // Le risque s'affiche là où la taille change VRAIMENT : sous le palier s'il n'y a pas de coussin, sinon à la fin du coussin (repère ▲).
    if (p.type !== 'goal' && !(p.type === 'palier' && trig(p) > p.bal + 0.005)) {
      h.push(html`<div class="sc-lbl sc-lbl-bot" style="${at(x)}"><div class="sc-risk">${scRiskShort(p.risk)}<span class="sc-risk-u"> / trade</span></div></div>`);
    }
  });
  // Point d'augmentation réel (▲) de chaque palier retardé par un coussin : minimum réglé ou zone dessinée.
  pts.forEach(p => {
    if (p.type !== 'palier' || !(trig(p) > p.bal + 0.005)) return;
    const x = xOf(trig(p)), z = p.trigZone, col = raw(z ? z.color : 'green');
    const tip = z ? `Fin du coussin « ${z.label} » : tu augmentes ta taille à ${fmtEUR(trig(p))} → risque ${fmtEUR(p.risk, false, 2)} par trade`
      : `Coussin minimum de P${p.k} : ${fmtEUR(trig(p) - p.bal)} (${scNum1((trig(p) - p.bal) / p.risk)} pertes) → tu augmentes ta taille à ${fmtEUR(trig(p))}, risque ${fmtEUR(p.risk, false, 2)} par trade`;
    h.push(html`<div class="sc-end-line ${col}" style="${at(x)}"></div><div class="sc-end ${col}" style="${at(x)}" title="${tip}"></div><div class="sc-end-lbl ${col}" style="${at(x)}" title="${tip}"><b>▲ ${fmtEUR(trig(p))}</b><span>${scRiskShort(p.risk)}</span></div>`);
  });
  h.push(html`<div class="sc-me" style="${at(meX)}"><div class="sc-me-pill">Toi · ${fmtEUR(current)}</div><div class="sc-me-line"></div></div>`);
  h.push(html`<div class="sc-draw" style="${at(padL - 44, trackW + 88)}">Glisse ici pour marquer une zone coussin de sécurité</div>`);
  mount(tl, html`${h}`);
  if (opts && opts.center) wrap.scrollLeft = Math.max(0, meX - wrap.clientWidth / 2);
}

function cushFormula(p) {
  return '(' + fmtEUR(p.trigger) + ' − ' + fmtEUR(p.floor) + ') ÷ ' + fmtEUR(p.risk, false, 2);
}
// Cellule « Coussin » : réglage du palier (vide = global) + résultat en pertes et en €.
function scCushCell(st, p, next) {
  const set = scCushSetting(st, p), unit = st.minCush.unit === 'loss' ? 'pertes' : '€';
  const eur = p.trigger - p.floor;
  const res = p.cushion > 0.005 ? html`<b>${scNum1(p.cushion)} pertes</b> · ${fmtEUR(eur)}` : html`<span class="tone-red">aucun coussin</span>`;
  const ph = st.minCush.value > 0 ? String(st.minCush.value) : '0';
  return html`<div class="sc-cush"><label class="sc-cush-in${raw(set.own ? ' own' : '')}" title="Coussin minimum de ce palier (${unit}). Vide = réglage global${st.minCush.value > 0 ? ' (' + scCushTxt(st, st.minCush.value) + ')' : ''}."><input type="number" min="0" step="${raw(st.minCush.unit === 'loss' ? '0.5' : '50')}" value="${set.own ? set.v : ''}" placeholder="${ph}" aria-label="Coussin minimum de P${p.k}" onchange="setScalingPalierCush('${raw(scCushKey(p))}', this.value)"><span>${unit}</span></label><div class="sc-cush-res">${res}</div><div class="sc-formula">${cushFormula(p)}</div>${next && p.trigger > next.bal + 0.005 ? html`<div class="tone-amber sc-cush-warn">⚠ dépasse le palier P${next.k} (${fmtEUR(next.bal)}) : tu l'atteindras avant d'augmenter</div>` : ''}</div>`;
}
// Cellule « Risque (%) » : vide = même % que le palier précédent ; rempli = nouveau % à partir de ce palier.
function scRiskCell(st, p, prev) {
  const own = scRiskStepAt(st, p.bal);
  return html`<label class="sc-cush-in${raw(own ? ' own' : '')}" title="Risque (% du capital du palier) à partir de P${p.k}. Vide = même % que le palier précédent (${scPct(prev.pct)})."><input type="number" min="0.05" max="99" step="0.25" value="${own ? own.pct : ''}" placeholder="${scRound(p.pct, 3)}" aria-label="Risque de P${p.k} (%)" onchange="setScalingPalierRisk(${raw(scRound(p.bal, 2))}, this.value)"><span>%</span></label>`;
}
// Cellule « Pas » : écart jusqu'au palier suivant, et l'effort que ça représente (+X % de capital).
function scStepCell(st, p, prev, next) {
  const own = prev ? scStepOwn(st, p, prev.bal) : null, step = scStepAt(st, p.bal);
  const eff = next ? html`<div class="sc-formula">→ ${fmtEUR(next.bal)} · +${scNum1((next.bal - p.bal) / p.bal * 100)} %</div>` : '';
  if (!prev) return html`<span class="sc-step-base" title="Pas de départ : réglé dans « Paramètres »">${fmtEUR(step)}</span>${eff}`;
  return html`<label class="sc-cush-in${raw(own ? ' own' : '')}" title="Écart entre les paliers à partir de P${p.k}. Vide = même pas que le palier précédent."><input type="number" min="1" step="${raw(String(Math.max(50, scNiceStep(step) / 10)))}" value="${own ? own.step : ''}" placeholder="${step}" aria-label="Pas après P${p.k} (€)" onchange="setScalingPalierStep(${raw(scRound(p.bal, 2))}, ${raw(own ? scRound(own.from, 2) : 'null')}, this.value)"><span>€</span></label>${eff}`;
}
function scHausse(d) {
  if (Math.abs(d) < 0.005) return html`<span class="tone-muted">=</span>`;
  return d > 0 ? '+' + fmtEUR(d, false, 2) : html`<span class="tone-amber" title="Le risque en € baisse à ce palier : la baisse du % l'emporte sur la hausse du capital">${'−' + fmtEUR(-d, false, 2)}</span>`;
}
function renderScalingTable(st, model, current) {
  const cont = document.getElementById('sc-table');
  if (!cont) return;
  if (model.error) { mount(cont, ''); scTableCount = 0; applyScalingTablePanel(); return; }
  const r = scalingReachedIdx(model, current);
  const rows = model.pts.map((p, i) => {
    const prev = i > 0 ? model.pts[i - 1] : null;
    const trig = p.trigger != null ? p.trigger : p.bal;
    const delayed = i > 0 && trig > p.bal + 0.005;
    const inCush = i > r && current + 1e-6 >= p.bal && current + 1e-6 < trig;
    const status = i < r ? html`<span class="tone-green">✔ atteint</span>`
      : (i === r ? html`<span class="tone-blue fw-700">● en cours</span>`
      : (inCush ? html`<span class="tone-amber">◐ dans le coussin · reste ${fmtEUR(trig - current)}</span>` : `reste ${fmtEUR(trig - current)}`));
    return html`<tr class="${i === r ? 'cur' : ''}"><td class="sc-td-k">${i === 0 ? 'Départ' : 'P' + p.k}</td><td>${fmtEUR(p.bal)}</td>${st.mode === 'round' ? html`<td>${scStepCell(st, p, prev, model.pts[i + 1] || model.nextBeyond)}</td>` : ''}<td>${i === 0 ? '—' : (delayed ? html`<span class="tone-amber fw-700">${fmtEUR(trig)}</span>` : fmtEUR(trig))}</td><td class="tone-blue fw-700">${fmtEUR(p.risk, false, 2)}</td><td>${i > 0 ? scRiskCell(st, p, prev) : scPct(p.pct)}</td><td>${prev ? scHausse(p.risk - prev.risk) : '—'}</td><td>${i > 0 ? scCushCell(st, p, model.pts[i + 1] || model.nextBeyond) : '—'}</td><td>${status}</td></tr>`;
  });
  if (st.goal > model.pts[model.pts.length - 1].bal * 1.0000001) {
    rows.push(html`<tr><td class="sc-td-k">Objectif</td><td>${fmtEUR(st.goal)}</td>${st.mode === 'round' ? html`<td>—</td>` : ''}<td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>${current >= st.goal ? html`<span class="tone-green">✔ atteint</span>` : 'reste ' + fmtEUR(st.goal - current)}</td></tr>`);
  }
  // Redessin pendant la saisie (ex. : réglage global validé en cliquant dans une case du tableau) : on garde la case active.
  const act = document.activeElement, keep = act && cont.contains(act) ? act.getAttribute('aria-label') : null;
  mount(cont, html`<table class="sc-table"><thead><tr><th>Palier</th><th>Capital du palier</th>${st.mode === 'round' ? html`<th title="Écart jusqu'au palier suivant">Pas</th>` : ''}<th>Augmente à</th><th>Risque / trade</th><th>Risque (%)</th><th>Hausse</th><th>Coussin</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table><p class="sc-note">Coussin = nombre de pertes d'affilée que tu peux encaisser, au nouveau risque, entre le moment où tu augmentes ta taille et ${raw(st.mode === 'cushion' ? 'le <b>palier précédent</b> (pour P1, ton capital de départ)' : 'le <b>palier</b> lui-même, où tu reviens à la taille précédente')}. Formule : (augmente à − ${st.mode === 'cushion' ? 'palier précédent' : 'palier'}) ÷ risque du palier. Règle un coussin minimum pour tous les paliers dans « Paramètres », ou palier par palier ici (vide = réglage global).<br>Risque (%) : un % saisi sur un palier s'applique à lui et aux paliers suivants (risque dégressif) ; vide = même % que le palier précédent.</p>`);
  if (keep) { const el = [...cont.querySelectorAll('input')].find(e => e.getAttribute('aria-label') === keep); if (el) el.focus(); }
  scTableCount = model.pts.length - 1;
  applyScalingTablePanel();
}
function applyScalingTablePanel() {
  const st = getScalingState();
  const panel = document.getElementById('sc-table-panel');
  if (panel) panel.classList.toggle('open', !!st.tableOpen);
  const cnt = document.getElementById('sc-table-count');
  if (cnt) cnt.textContent = scTableCount > 0 ? ' · ' + scTableCount + ' palier' + (scTableCount > 1 ? 's' : '') : '';
  const hint = document.getElementById('sc-table-hint');
  if (hint) hint.textContent = st.tableOpen ? 'Replier' : 'Déplier';
}
function toggleScalingTablePanel() {
  const st = getScalingState();
  st.tableOpen = !st.tableOpen;
  saveScalingState();
  applyScalingTablePanel();
}


// ── Zones coussins ──
function renderScalingZones() {
  const cont = document.getElementById('sc-zones');
  if (!cont) return;
  const st = getScalingState();
  if (!st.zones.length) {
    mount(cont, html`<div class="sc-empty pad-14">Aucune zone pour l'instant — glisse sur la bande pointillée de la frise, ou clique sur « Ajouter une zone ».</div>`);
    applyScalingZonesPanel();
    return;
  }
  const colors = [['green', '🟢 Coussin'], ['amber', '🟠 Prudence'], ['red', '🔴 Danger'], ['blue', '🔵 Autre']];
  mount(cont, html`${st.zones.map(z => { const id = raw(z.id); return html`<div class="sc-zone-row">
    <select onchange="updateScalingZone(${id},'color',this.value)">${colors.map(c => html`<option value="${c[0]}"${raw(c[0] === z.color ? ' selected' : '')}>${c[1]}</option>`)}</select>
    <input type="text" value="${z.label}" placeholder="Nom de la zone" oninput="updateScalingZone(${id},'label',this.value)">
    <div class="sc-zone-range"><span>De</span><input type="number" value="${scRound(Math.min(z.from, z.to), 2)}" step="10" oninput="updateScalingZone(${id},'from',this.value)"><span>€</span></div>
    <div class="sc-zone-range"><span>à</span><input type="number" value="${scRound(Math.max(z.from, z.to), 2)}" step="10" oninput="updateScalingZone(${id},'to',this.value)"><span>€</span></div>
    <button class="btn-ghost btn-sm-icon" title="Supprimer" onclick="deleteScalingZone(${id})">🗑</button>
  </div>`; })}`);
  applyScalingZonesPanel();
}
function applyScalingZonesPanel() {
  const st = getScalingState();
  const panel = document.getElementById('sc-zones-panel');
  if (panel) panel.classList.toggle('open', !!st.zonesOpen);
  const cnt = document.getElementById('sc-zones-count');
  if (cnt) cnt.textContent = st.zones.length ? ' · ' + st.zones.length : '';
  const chk = document.getElementById('sc-show-zones');
  if (chk) chk.checked = !!st.showZones;
  const hint = document.getElementById('sc-zones-hint');
  if (hint) hint.textContent = st.zonesOpen ? 'Replier' : 'Déplier';
}
function toggleScalingZonesPanel() {
  const st = getScalingState();
  st.zonesOpen = !st.zonesOpen;
  saveScalingState();
  applyScalingZonesPanel();
}

function addScalingZone() {
  const st = getScalingState();
  const current = st.auto ? scalingJournalBalance() : st.current;
  const model = computeScalingPaliers(st, current);
  let from = st.start, to = st.start * 1.1;
  if (!model.error) {
    // Par défaut : un coussin qui démarre au prochain palier et s'étend jusqu'à mi-chemin du suivant.
    const r = scalingReachedIdx(model, current);
    const next = model.pts[r + 1] || model.nextBeyond;
    const after = model.pts[r + 2] || null;
    if (next) {
      from = next.bal;
      const gap = after ? after.bal - next.bal : next.bal - model.pts[r].bal;
      to = next.bal + gap / 2;
    }
  }
  const sn = to < 2000 ? 10 : 50;
  from = Math.round(from);
  to = Math.max(Math.round(to / sn) * sn, from + sn);
  st.zones.push({ id: newScalingZoneId(), from, to, label: 'Coussin', color: 'green' });
  st.showZones = true;
  st.zonesOpen = true;
  saveScalingState();
  renderScalingZones();
  renderScaling();
}
function addScalingZoneBetween(xa, xb) {
  const g = scalingGeom;
  if (!g) return;
  const st = getScalingState();
  let a = scalingBalAt(g.bals, Math.max(-0.45, (Math.min(xa, xb) - g.padL) / g.S));
  let b = scalingBalAt(g.bals, Math.min(g.m - 1 + 0.45, (Math.max(xa, xb) - g.padL) / g.S));
  const snap = v => (v < 2000 ? 5 : (v < 20000 ? 10 : 50));
  a = Math.round(a / snap(a)) * snap(a);
  b = Math.round(b / snap(b)) * snap(b);
  if (b <= a) return;
  st.zones.push({ id: newScalingZoneId(), from: a, to: b, label: 'Coussin', color: 'green' });
  st.showZones = true;
  saveScalingState();
  renderScalingZones();
  renderScaling();
  showToast('Zone ajoutée — ouvre « Zones coussins de sécurité » pour la renommer', 'success');
}
function updateScalingZone(id, field, value) {
  const st = getScalingState();
  const z = st.zones.find(z => z.id === id);
  if (!z) return;
  if (field === 'from' || field === 'to') { const v = parseFloat(value); if (isNaN(v)) return; z[field] = v; }
  else if (field === 'label') z.label = String(value).slice(0, 40);
  else if (field === 'color') z.color = value;
  saveScalingState();
  renderScaling();
}
function deleteScalingZone(id) {
  const st = getScalingState();
  st.zones = st.zones.filter(z => z.id !== id);
  saveScalingState();
  renderScalingZones();
  renderScaling();
}
function initScalingDraw() {
  const tl = document.getElementById('sc-tl');
  if (!tl || tl.dataset.drawInit) return;
  tl.dataset.drawInit = '1';
  tl.addEventListener('pointerdown', e => {
    const strip = e.target.closest('.sc-draw');
    if (!strip || !scalingGeom) return;
    e.preventDefault();
    const tlRect = tl.getBoundingClientRect();
    const offset = strip.getBoundingClientRect().left - tlRect.left;
    const x0 = e.clientX - tlRect.left;
    let x1 = x0;
    const sel = document.createElement('div');
    sel.className = 'sc-draw-sel';
    strip.appendChild(sel);
    try { strip.setPointerCapture(e.pointerId); } catch (err) {}
    const upd = () => { const a = Math.min(x0, x1), b = Math.max(x0, x1); sel.style.left = (a - offset) + 'px'; sel.style.width = (b - a) + 'px'; };
    upd();
    const onMove = ev => { x1 = ev.clientX - tlRect.left; upd(); };
    const onUp = () => {
      strip.removeEventListener('pointermove', onMove);
      strip.removeEventListener('pointerup', onUp);
      strip.removeEventListener('pointercancel', onUp);
      sel.remove();
      if (Math.abs(x1 - x0) >= 10) addScalingZoneBetween(x0, x1);
    };
    strip.addEventListener('pointermove', onMove);
    strip.addEventListener('pointerup', onUp);
    strip.addEventListener('pointercancel', onUp);
  });
}
let scResizeT = null;
window.addEventListener('resize', () => {
  clearTimeout(scResizeT);
  scResizeT = setTimeout(() => renderScaling(), 150);
});

