// ── PREMIER LANCEMENT, MODE DÉMO ET ÉCRANS VIDES ─────────────────────────
// Assistant en 3 étapes à l'ouverture d'un compte vide jamais configuré : 1) le compte (nom, type, capital),
// 2) le risque et les règles du jour, 3) comment démarrer (premier trade, import CSV ou démo).
// Tout reste modifiable ensuite (Paramètres, Plan, Scaling) ; « Passer » ferme l'assistant sans rien changer.
let obStep = 0, obData = null;
function onboardingNeeded() { return !trades.length && DB.getItem(JP + 'onboarded') !== '1' && DB.getItem(JP + 'welcome_dismissed') !== '1'; }
function openOnboarding() {
  const acc = ACCOUNTS.find(a => a.id === JOURNAL_ID) || { name: JOURNALS[JOURNAL_ID].title, type: JOURNAL_TYPE };
  const st = getScalingState();
  obData = { name: acc.name, type: acc.type, capital: accountSize > 0 ? accountSize : 10000, riskPct: st.riskPct || 1,
    ddPct: loadDDLimitPct(), maxTP: planData && planData.maxTP > 0 ? planData.maxTP : 1, maxSL: planData && planData.maxSL > 0 ? planData.maxSL : 2 };
  obStep = 0;
  const ov = document.getElementById('onboard');
  ov.hidden = false;
  rememberFocus();
  renderOnboarding();
}
function closeOnboarding(markDone) {
  if (markDone !== false) DB.setItem(JP + 'onboarded', '1');
  const ov = document.getElementById('onboard');
  if (ov && !ov.hidden) { ov.hidden = true; restoreFocus(); }
}
function obReadStep() {
  const v = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const num = id => parseFloat(String(v(id)).replace(',', '.'));
  if (obStep === 0) {
    const name = v('ob-name').trim().slice(0, 40), capital = num('ob-capital');
    if (!name) { showToast('Donne un nom à ton compte', 'error'); return false; }
    if (!(capital > 0)) { showToast('Indique ton capital de départ', 'error'); return false; }
    Object.assign(obData, { name, type: v('ob-type'), capital });
  } else if (obStep === 1) {
    const riskPct = num('ob-risk'), ddPct = num('ob-dd');
    if (!(riskPct > 0 && riskPct < 100)) { showToast('Indique un risque par trade entre 0 et 100 %', 'error'); return false; }
    Object.assign(obData, { riskPct, ddPct: ddPct > 0 ? ddPct : obData.ddPct, maxTP: parseInt(v('ob-tp'), 10) || null, maxSL: parseInt(v('ob-sl'), 10) || null });
  }
  return true;
}
function obNext() { if (!obReadStep()) return; obStep = Math.min(2, obStep + 1); renderOnboarding(); }
function obBack() { obReadStep(); obStep = Math.max(0, obStep - 1); renderOnboarding(); }
// Applique les réglages choisis (compte, capital, risque, règles), puis lance l'action de départ.
function finishOnboarding(action) {
  const d = obData;
  const prevType = JOURNAL_TYPE;
  const me = ACCOUNTS.find(a => a.id === JOURNAL_ID);
  if (me) { me.name = d.name; me.type = d.type; }
  JOURNALS[JOURNAL_ID].title = JOURNALS[JOURNAL_ID].tab = d.name;
  saveAccounts(ACCOUNTS);
  accountSize = d.capital;
  DB.setItem(JP + 'account', String(d.capital));
  const acc = document.getElementById('account-size'); if (acc) acc.value = d.capital;
  const st = getScalingState();
  Object.assign(st, { start: d.capital, riskPct: d.riskPct, step: scNiceStep(d.capital), cushion1: scNiceStep(d.capital) / 2, goal: d.capital * 10, auto: true });
  st.cushionN = scRiskFirst(st) > 0 ? st.cushion1 / scRiskFirst(st) : 0;
  saveScalingState();
  DB.setItem(JP + 'dd_limit_pct', String(d.ddPct));
  if (planData) { planData.maxTP = d.maxTP; planData.maxSL = d.maxSL; DB.setItem(JP + 'plan', JSON.stringify(planData)); }
  closeOnboarding(true);
  // Type changé (ex. prop firm) : le menu et les pages dépendent du type → on recharge puis on lance l'action.
  if (d.type !== prevType) {
    try { sessionStorage.setItem('ob_action', action || ''); } catch (e) {}
    DB.flush().then(() => location.reload());
    return;
  }
  applyJournalIdentity();
  renderAll();
  runStartAction(action);
}
function runStartAction(action) {
  if (action === 'trade') openTradePanel();
  else if (action === 'csv') goImportCSV();
  else if (action === 'demo') loadDemoTrades();
}
onReady(() => { let a = ''; try { a = sessionStorage.getItem('ob_action') || ''; sessionStorage.removeItem('ob_action'); } catch (e) {} if (a) setTimeout(() => runStartAction(a), 50); });
function goImportCSV() {
  showPage('export', document.querySelector('.nav-item[data-page=export]'));
  setTimeout(() => { const b = document.querySelector('#page-export input[type=file][accept*=csv], #page-export .export-card:nth-of-type(3)'); const card = b && b.closest('.export-card'); if (card) card.scrollIntoView({ block: 'center' }); }, 60);
}
function renderOnboarding() {
  const card = document.getElementById('ob-card');
  if (!card || !obData) return;
  const d = obData, dots = html`<div class="ob-dots" aria-label="Étape ${obStep + 1} sur 3">${[0, 1, 2].map(i => html`<span class="${raw(i === obStep ? 'on' : i < obStep ? 'done' : '')}"></span>`)}</div>`;
  const riskEur = d.capital * d.riskPct / 100;
  const steps = [
    () => html`<h2 id="ob-title">Bienvenue 👋</h2><p class="ob-lead">Trois questions pour régler ton journal. Tu pourras tout modifier ensuite.</p>
      <div class="ob-fields">
        <label class="field"><span>Nom du compte</span><input type="text" id="ob-name" maxlength="40" value="${d.name}" placeholder="ex. Compte perso, FTMO 100k…"></label>
        <label class="field"><span>Type de compte</span><select id="ob-type">${Object.entries(ACCOUNT_TYPES).map(([k, t]) => html`<option value="${k}"${raw(k === d.type ? ' selected' : '')}>${t.label} — ${t.sub}</option>`)}</select></label>
        <label class="field"><span>Capital de départ (€)</span><input type="number" id="ob-capital" min="1" step="100" value="${d.capital}"></label>
      </div>`,
    () => html`<h2 id="ob-title">Ton risque et tes règles</h2><p class="ob-lead">Le journal s'en sert pour ta taille de position (Scaling), la perte max du jour et les alertes du Dashboard.</p>
      <div class="ob-fields two">
        <label class="field"><span>Risque par trade (%)</span><input type="number" id="ob-risk" min="0.05" max="99" step="0.25" value="${d.riskPct}" oninput="document.getElementById('ob-risk-eur').textContent = fmtEUR(${raw(String(d.capital))} * (parseFloat(this.value) || 0) / 100, false, 2)"><small>= <b id="ob-risk-eur">${fmtEUR(riskEur, false, 2)}</b> par trade</small></label>
        <label class="field"><span>Perte max du jour (% du solde)</span><input type="number" id="ob-dd" min="0.1" step="0.5" value="${d.ddPct}"></label>
        <label class="field"><span>TP max par jour</span><input type="number" id="ob-tp" min="0" step="1" value="${d.maxTP || ''}" placeholder="aucun"><small>objectif atteint : la journée s'arrête</small></label>
        <label class="field"><span>SL max par jour</span><input type="number" id="ob-sl" min="0" step="1" value="${d.maxSL || ''}" placeholder="aucun"><small>limite atteinte : stop pour aujourd'hui</small></label>
      </div>`,
    () => html`<h2 id="ob-title">C'est prêt ! Comment veux-tu commencer ?</h2><p class="ob-lead">${d.name} · ${fmtEUR(d.capital)} · ${fmtRate(d.riskPct, d.riskPct % 1 ? 2 : 0)} par trade (${fmtEUR(riskEur, false, 2)})</p>
      <div class="ob-choices">
        <button class="ob-choice" onclick="finishOnboarding('trade')"><b>＋ Ajouter mon premier trade</b><span>Formulaire complet : résultat, prix, captures, erreurs…</span></button>
        <button class="ob-choice" onclick="finishOnboarding('csv')"><b>📥 Importer mon historique</b><span>Fichiers CSV de ton broker ou de TradingView</span></button>
        <button class="ob-choice" onclick="finishOnboarding('demo')"><b>🧪 Explorer avec une démo</b><span>60 trades d'exemple pour voir le journal rempli, effaçables en un clic</span></button>
      </div>`
  ];
  mount(card, html`${dots}${steps[obStep]()}
    <div class="ob-foot">
      <button class="link-btn" onclick="closeOnboarding(true)">Passer</button>
      <span class="flex-1"></span>
      ${obStep > 0 ? html`<button class="btn-ghost" onclick="obBack()">Retour</button>` : ''}
      ${obStep < 2 ? html`<button class="btn-primary" onclick="obNext()">Suivant</button>` : html`<button class="btn-ghost" onclick="finishOnboarding('')">Terminer</button>`}
    </div>`);
  setTimeout(() => { const f = card.querySelector('input, .ob-choice'); if (f) f.focus(); }, 30);
}
document.addEventListener('keydown', e => {
  const ov = document.getElementById('onboard');
  if (!ov || ov.hidden) return;
  if (e.key === 'Escape') { e.stopPropagation(); closeOnboarding(true); }
  else if (e.key === 'Enter' && obStep < 2 && e.target.tagName === 'INPUT') { e.preventDefault(); obNext(); }
}, true);
onReady(() => { if (onboardingNeeded()) openOnboarding(); });

// ── MODE DÉMO : trades d'exemple réalistes, marqués demo, effaçables en un clic ──
function buildDemoTrades(n) {
  const rnd = mulberry32(20260617), pick = a => a[Math.floor(rnd() * a.length)];
  const assets = ['EUR/USD', 'GBP/USD', 'DAX 40', 'NAS 100', 'XAU/USD'];
  const setups = (planData && planData.setups && planData.setups.length ? planData.setups : ['Break & retest', 'OB + FVG', 'Sweep LQ']);
  const mistakes = getMistakeTags();
  const risk = Math.max(1, (accountSize > 0 ? accountSize : 10000) * (getScalingState().riskPct || 1) / 100);
  const out = [], today = new Date(localDateStr() + 'T00:00:00');
  let day = new Date(today); day.setDate(day.getDate() - 1);
  while (out.length < n) {
    const wd = day.getDay();
    if (wd !== 0 && wd !== 6) {
      const k = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < k && out.length < n; j++) {
        const h = 8 + Math.floor(rnd() * 9), m = Math.floor(rnd() * 60), dur = 20 + Math.floor(rnd() * 120);
        const asset = pick(assets), dir = rnd() < .55 ? 'Long' : 'Short', u = rnd();
        const res = u < .5 ? 'TP' : u < .9 ? 'SL' : 'BE';
        const pnl = res === 'TP' ? Math.round((1.2 + rnd() * 2) * 100) / 100 : res === 'SL' ? -Math.round((.8 + rnd() * .25) * 100) / 100 : 0;
        const ex = new Date(day); ex.setHours(h, m + dur);
        out.push({
          demo: true, date: localDateStr(day), entry: String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'),
          exit: String(ex.getHours()).padStart(2, '0') + ':' + String(ex.getMinutes()).padStart(2, '0'),
          asset, dir, res, pnl, rr: 2, rSrc: 'manuel', pnlEur: Math.round(pnl * risk * 100) / 100, setup: pick(setups),
          session: sessionFromHour(h, 0), tf: pick(['M5', 'M15', 'H1']), emotion: 2 + Math.floor(rnd() * 4),
          mfe: Math.round(risk * (res === 'SL' ? rnd() * .8 : 1 + rnd() * 2.5) * 100) / 100, mae: Math.round(risk * (res === 'TP' ? rnd() * .6 : .5 + rnd() * .5) * 100) / 100,
          checklist: [0, 1, 2, 3, 4, 5].filter(() => rnd() < .8), mistakes: res === 'SL' && rnd() < .4 ? [pick(mistakes)] : [],
          tags: [], desc: res === 'TP' ? 'Exemple : plan respecté, sortie à l\'objectif.' : res === 'SL' ? 'Exemple : stop touché.' : 'Exemple : sorti au point d\'entrée.'
        });
      }
    }
    day.setDate(day.getDate() - 1);
  }
  return out;
}
function loadDemoTrades() {
  if (trades.some(t => t.demo)) { showToast('La démo est déjà chargée'); return; }
  if (!TradeStore.addMany(buildDemoTrades(60))) return;
  DB.setItem(JP + 'onboarded', '1');
  refreshAssetDropdowns();
  showPage('dashboard', document.querySelector('.nav-item[data-page=dashboard]'));
  renderAll();
  showToast('60 trades d\'exemple chargés — efface-les quand tu veux', 'success');
}
function clearDemoTrades() {
  const ids = trades.filter(t => t.demo).map(t => t.id);
  if (!ids.length) { renderDemoBanner(); return; }
  if (!TradeStore.remove(ids, false, { noTrace: true })) return;
  renderAll();
  showToast('Démo effacée — à toi de jouer !', 'success');
}
function renderDemoBanner() {
  const b = document.getElementById('demo-banner');
  if (b) b.hidden = !trades.some(t => t.demo);
}

// ── ÉCRANS VIDES : chaque page d'analyse explique quoi faire quand le compte n'a encore aucun trade ──
const EMPTY_PAGES = {
  trades: null,   // le tableau a déjà son propre écran vide
  stats: ['📊', 'Tes statistiques apparaîtront ici', 'Win rate, profit factor, meilleurs créneaux, coût de tes erreurs… tout se calcule à partir de tes trades.'],
  calendrier: ['📅', 'Ton calendrier se remplira jour après jour', 'Chaque journée tradée prend la couleur de son résultat, avec tes séries de gains et de pertes.'],
  bilan: ['🧾', 'Le bilan de tes journées', 'Le détail de chaque journée tradée : trades, résultat, humeur et captures.'],
  revue: ['🗓️', 'Ta revue de la semaine', 'Chaque semaine : résultats, meilleurs et pires trades, erreurs récurrentes et tes questions de revue.']
};
function renderEmptyStates() {
  const empty = trades.length === 0;
  Object.entries(EMPTY_PAGES).forEach(([id, txt]) => {
    const page = document.getElementById('page-' + id);
    if (!page || !txt) return;
    let box = page.querySelector(':scope > .page-empty');
    if (!box) {
      box = document.createElement('div');
      box.className = 'page-empty';
      const hdr = page.querySelector(':scope > .page-hdr');
      if (hdr) hdr.after(box); else page.prepend(box);
    }
    if (empty) mount(box, html`${UI.empty(txt[0], txt[1], txt[2])}<div class="es-actions"><button class="btn-primary" onclick="openTradePanel()">＋ Ajouter un trade</button><button class="btn-ghost" onclick="goImportCSV()">Importer un CSV</button><button class="btn-ghost" onclick="loadDemoTrades()">Voir une démo</button></div>`);
    page.classList.toggle('is-empty', empty);
  });
  renderDemoBanner();
}
TradeStore.onChange(() => { renderEmptyStates(); });
onReady(renderEmptyStates);
