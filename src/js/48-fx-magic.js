// ── EFFETS « MAGIQUES » (tous les thèmes) ───────────────────────────────
// Relief 3D de la carte du solde, aurore vivante, zoom entre les pages, ambiance qui suit
// le garde-fou (et l'icône d'onglet), chiffres qui roulent après un trade, mode Lock-in, passage d'étape et médailles,
// sons et vibrations (désactivés par défaut), aperçu dans la recherche ⌘K. Styles : 70-premium.css (EFFETS 2).
// Mouvement : fxMotion() (réglage « Animations » + « réduire les animations » du système).

// ── Sons (synthétisés, aucun fichier) et vibrations : réglage g_fx_sound, désactivé par défaut ──
function fxSoundOn() { return DB.getItem('g_fx_sound') === '1'; }
function setFxSound(on) {
  DB.setItem('g_fx_sound', on ? '1' : '0');
  if (on) { fxSound('lock'); fxBuzz(20); }
}
let fxAC = null;
function fxAudio() {
  try {
    if (!fxAC) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; fxAC = new C(); }
    if (fxAC.state === 'suspended') fxAC.resume();
    return fxAC;
  } catch (e) { return null; }
}
function fxTone(ac, freq, t0, dur, type, gain) {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain || 0.06, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.03);
}
function fxSound(kind) {
  if (!fxSoundOn()) return;
  const ac = fxAudio(); if (!ac) return;
  const t = ac.currentTime;
  if (kind === 'lock') { fxTone(ac, 1800, t, .04, 'square', .025); fxTone(ac, 880, t + .035, .07, 'triangle', .05); }
  else if (kind === 'unlock') { fxTone(ac, 880, t, .05, 'triangle', .05); fxTone(ac, 1500, t + .06, .06, 'square', .02); }
  else if (kind === 'win') [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => fxTone(ac, f, t + i * .09, .4, 'sine', .055));
  else if (kind === 'medal') [659.25, 880, 1318.5].forEach((f, i) => fxTone(ac, f, t + i * .11, .55, 'sine', .055));
  else if (kind === 'stop') { fxTone(ac, 196, t, .5, 'sine', .09); fxTone(ac, 147, t + .18, .65, 'sine', .08); }
  else if (kind === 'tick') fxTone(ac, 1320, t, .06, 'sine', .03);
}
function fxBuzz(p) { if (fxSoundOn() && navigator.vibrate) try { navigator.vibrate(p); } catch (e) {} }

// ── Aurore vivante : calque fixe derrière la page (halos qui dérivent lentement, couleur = ambiance) ──
(function () {
  const a = document.createElement('div');
  a.id = 'fx-aurora'; a.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(a, document.body.firstChild);
})();

// ── Relief 3D de la carte du solde sous la souris : ordinateur seulement ──
const FX_SPOT_SEL = '.hero-metric';
let fxSpotEl = null, fxSpotRaf = 0, fxSpotEv = null;
function fxSpotClear() {
  if (!fxSpotEl) return;
  fxSpotEl.classList.remove('fx-spot'); fxSpotEl.style.removeProperty('--rx'); fxSpotEl.style.removeProperty('--ry');
  fxSpotEl = null;
}
function fxSpotFrame() {
  fxSpotRaf = 0;
  const e = fxSpotEv;
  if (!e || !fxOn()) { fxSpotClear(); return; }
  const el = e.target && e.target.closest ? e.target.closest(FX_SPOT_SEL) : null;
  if (fxSpotEl !== el) fxSpotClear();
  if (!el) return;
  fxSpotEl = el;
  const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  el.classList.add('fx-spot');
  if (el.classList.contains('hero-metric') && fxMotion()) {
    el.style.setProperty('--ry', ((x / r.width - .5) * 4).toFixed(2) + 'deg');
    el.style.setProperty('--rx', ((.5 - y / r.height) * 3).toFixed(2) + 'deg');
  }
}
if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  document.addEventListener('pointermove', e => { fxSpotEv = e; if (!fxSpotRaf) fxSpotRaf = requestAnimationFrame(fxSpotFrame); }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { fxSpotEv = null; fxSpotClear(); });
}

// ── Zoom entre les pages : la nouvelle page s'ouvre depuis l'endroit cliqué (carte → page) ──
let fxLastPt = null;
document.addEventListener('pointerdown', e => { fxLastPt = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
(function () {
  const sp = showPage;
  showPage = function () {
    const r = sp.apply(this, arguments);
    if (fxMotion()) {
      const pg = document.querySelector('.page.active');
      if (pg) {
        const pt = fxLastPt && Date.now() - fxLastPt.t < 700 ? fxLastPt : null, rect = pg.getBoundingClientRect();
        pg.style.setProperty('--fx-ox', pt ? Math.round(pt.x - rect.left) + 'px' : '50%');
        pg.style.setProperty('--fx-oy', pt ? Math.round(pt.y - rect.top) + 'px' : '0px');
        pg.classList.remove('fx-zoom'); void pg.offsetWidth; pg.classList.add('fx-zoom');
      }
    }
    return r;
  };
})();

// ── Ambiance (couleur de l'appli et icône d'onglet) selon le garde-fou : ok / warn / stop ──
let fxPrevLevel = null, fxFavLevel = null;
function fxFavicon(level) {
  if (level === fxFavLevel) return;
  fxFavLevel = level;
  const c = level === 'stop' ? '#f2555a' : level === 'warn' ? '#e8a53a' : BRAND_ACC;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#151935"/><stop offset="1" stop-color="#0E1020"/></linearGradient></defs>'
    + '<rect width="512" height="512" rx="116" fill="url(#g)"/><g transform="translate(256 262) scale(3.6) translate(-52 -52)"><path d="' + BRAND_SHACKLE_PATH + '" fill="none" stroke="#F5F7FB" stroke-width="9" stroke-linecap="round"/>'
    + '<rect x="6" y="52" width="92" height="34" rx="17" fill="none" stroke="#F5F7FB" stroke-width="9"/><circle cx="52" cy="69" r="11" fill="' + c + '"/></g></svg>';
  let l = document.querySelector('link[rel="icon"]');
  if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
  l.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}
// Appelé par renderGuardCard (Dashboard) et après chaque renderAll ailleurs.
function fxAfterGuard(g, d) {
  document.documentElement.dataset.mood = g.level;
  fxFavicon(g.level);
  if (fxPrevLevel && fxPrevLevel !== 'stop' && g.level === 'stop') { fxSound('stop'); fxBuzz([40, 60, 40]); }
  fxPrevLevel = g.level;
  fxMedalChecks(d);
  if (document.getElementById('fx-lockin')) fxLockinRender(g);
}
function fxRefreshMood() {
  if (typeof rkGuard !== 'function') return;
  fxAfterGuard(rkGuard(), rkDiscipline(trades));
}

// ── Chiffres qui roulent après un changement (trade ajouté, modifié…), avec un éclair vert ou rouge ──
(function () {
  const ra = renderAll, IDS = ['k-balance', 'k-pnleur'];
  renderAll = function () {
    const before = IDS.map(id => { const el = document.getElementById(id); return el ? el.textContent : null; });
    const r = ra.apply(this, arguments);
    if (fxMotion() && !document.documentElement.classList.contains('fx-intro')) IDS.forEach((id, i) => {
      const el = document.getElementById(id), was = before[i];
      if (!el || !was || el.textContent === was) return;
      const a = FX_NUM_RE.exec(was), b = FX_NUM_RE.exec(el.textContent);
      if (a && b) { const up = (b[1] === '-' || b[1] === '−' ? -1 : 1) * fxNumOf(b) > (a[1] === '-' || a[1] === '−' ? -1 : 1) * fxNumOf(a); el.classList.remove('fx-tick-up', 'fx-tick-down'); void el.offsetWidth; el.classList.add(up ? 'fx-tick-up' : 'fx-tick-down'); }
      fxCountUp(el, 800, was);
    });
    if (typeof currentPage === 'function' && currentPage() !== 'dashboard') safeRun(fxRefreshMood, 'fxRefreshMood');
    return r;
  };
  const add = TradeStore.add;
  TradeStore.add = function () { const r = add.apply(this, arguments); fxSound('tick'); fxBuzz(15); return r; };
  const cel = fxCelebrate;
  fxCelebrate = function () { fxSound('win'); fxBuzz([30, 50, 30, 50, 60]); return cel.apply(this, arguments); };
})();

// ── Mode Lock-in : écran de concentration ; on en sort en maintenant le bouton 2 secondes ──
const FX_LK_KEY = () => JP + 'lockin_since';
let fxLkTimer = 0, fxHold = null;
const fxLockMark = (cls) => '<svg class="' + cls + '" viewBox="0 8 104 84" aria-hidden="true"><path class="fx-lk-shackle" d="' + BRAND_SHACKLE_PATH + '" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/><rect x="6" y="52" width="92" height="34" rx="17" fill="none" stroke="currentColor" stroke-width="9"/><circle cx="52" cy="69" r="9.5" fill="var(--mood,var(--accent))"/></svg>';
function fxLockinEnter() {
  if (document.getElementById('fx-lockin')) return;
  if (!DB.getItem(FX_LK_KEY())) DB.setItem(FX_LK_KEY(), String(Date.now()));
  fxSound('lock'); fxBuzz(20);
  fxLockinMount(true);
}
function fxLockinMount(anim) {
  const el = document.createElement('div');
  el.id = 'fx-lockin';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', fxL('Mode Lock-in', 'Lock-in mode'));
  if (anim && fxMotion()) el.classList.add('fx-lk-in');
  document.body.appendChild(el);
  const app = document.querySelector('.app'); if (app) app.inert = true;
  fxLockinRender();
  clearInterval(fxLkTimer); fxLkTimer = setInterval(fxLockinTick, 1000);
  setTimeout(() => { const b = el.querySelector('.fx-lk-hold'); if (b) b.focus(); }, 80);
}
function fxLockinTick() {
  const c = document.getElementById('fx-lk-clock'), since = +DB.getItem(FX_LK_KEY());
  if (!c || !since) return;
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000)), p = n => String(n).padStart(2, '0');
  c.textContent = p(Math.floor(s / 3600)) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60);
}
function fxLockinRender(g) {
  const el = document.getElementById('fx-lockin');
  if (!el || typeof rkGuard !== 'function') return;
  g = g || rkGuard();
  const today = localDateStr(), todays = trades.filter(t => t.date === today), pnl = todays.reduce((s, t) => s + (t.pnlEur || 0), 0);
  const holding = document.activeElement && document.activeElement.classList.contains('fx-lk-hold');
  mount(el, html`<div class="fx-lk-box g-${raw(g.level)}">
    <div class="fx-lk-top">${raw(fxLockMark('fx-lk-mark'))}<b>${fxL('Mode Lock-in', 'Lock-in mode')}</b><span class="fx-lk-clock" id="fx-lk-clock" title="${fxL('Durée de la séance', 'Session time')}">00:00:00</span></div>
    <div class="fx-lk-gauge">${rkLevelGauge(g)}</div>
    <h2 class="fx-lk-head">${rkHeadline(g)}</h2>
    <p class="fx-lk-sent">${rkSentence(g)}</p>
    <div class="fx-lk-stats">
      <div><span>${fxL('P&L du jour', 'Today’s P&L')}</span><b class="${raw(pnl > 0 ? 'tone-green' : pnl < 0 ? 'tone-red' : '')}">${fmtEUR(pnl, true, 0)}</b></div>
      <div><span>${fxL('Trades', 'Trades')}</span><b>${todays.length}${g.cfg.maxTrades > 0 ? ' / ' + g.cfg.maxTrades : ''}</b></div>
      <div><span>${fxL('Reste aujourd’hui', 'Left today')}</span><b>${fmtEUR(g.remaining, false, 0)}</b></div>
    </div>
    <button class="btn-primary fx-lk-add" onclick="openQuickAdd()">＋ ${fxL('Saisie rapide', 'Quick entry')} <kbd>N</kbd></button>
    <button class="fx-lk-hold" type="button" onpointerdown="fxHoldStart(event)" onpointerup="fxHoldEnd()" onpointerleave="fxHoldEnd()" onpointercancel="fxHoldEnd()" onkeydown="if((event.key===' '||event.key==='Enter')&&!event.repeat)fxHoldStart(event)" onkeyup="fxHoldEnd()" onclick="event.preventDefault()"><span>${fxL('Maintenir pour sortir', 'Hold to exit')}</span></button>
    <p class="fx-lk-note">${fxL('Pour sortir, maintiens le bouton 2 secondes : ce petit délai casse l’envie de revanche.', 'To exit, hold the button for 2 seconds: that short delay breaks the urge for revenge.')}</p>
  </div>`);
  fxLockinTick();
  if (holding) { const b = el.querySelector('.fx-lk-hold'); if (b) b.focus(); }
}
function fxHoldStart(e) {
  if (fxHold) return;
  if (e) e.preventDefault();
  const btn = document.querySelector('#fx-lockin .fx-lk-hold'); if (!btn) return;
  if (e && e.pointerId != null && btn.setPointerCapture) try { btn.setPointerCapture(e.pointerId); } catch (x) {}
  const t0 = performance.now();
  btn.classList.add('holding');
  const step = now => {
    if (!fxHold) return;
    const k = Math.min(1, (now - t0) / 2000);
    btn.style.setProperty('--hold', k.toFixed(3));
    if (k >= 1) { fxHold = null; fxLockinExit(); return; }
    fxHold.raf = requestAnimationFrame(step);
  };
  fxHold = { raf: requestAnimationFrame(step), btn };
}
function fxHoldEnd() {
  if (!fxHold) return;
  cancelAnimationFrame(fxHold.raf);
  fxHold.btn.style.setProperty('--hold', '0'); fxHold.btn.classList.remove('holding');
  fxHold = null;
}
function fxLockinExit() {
  const el = document.getElementById('fx-lockin'), since = +DB.getItem(FX_LK_KEY()) || Date.now();
  const n = trades.filter(t => t.date === localDateStr() && t.createdAt >= since).length;
  DB.removeItem(FX_LK_KEY());
  clearInterval(fxLkTimer);
  fxSound('unlock'); fxBuzz(15);
  const app = document.querySelector('.app'); if (app) app.inert = false;
  if (el) { el.classList.add('fx-lk-out'); setTimeout(() => el.remove(), fxMotion() ? 700 : 0); }
  const min = Math.max(1, Math.round((Date.now() - since) / 60000));
  showToast('🔓 ' + fxL('Séance terminée : ', 'Session over: ') + (min >= 60 ? Math.floor(min / 60) + ' h ' + String(min % 60).padStart(2, '0') : min + ' min') + ' · ' + n + fxL(' trade(s) pendant le mode Lock-in', ' trade(s) during Lock-in mode'), 'success');
  const btn = document.getElementById('fx-lockin-btn'); if (btn) btn.focus();
}

// ── Médailles (gagnées par la discipline) et passage d'étape ──
const FX_MEDALS = [
  { id: 'first', icon: '✍️', fr: 'Premier trade journalisé', en: 'First trade logged' },
  { id: 'lockin', icon: '🔒', fr: 'Premier « Locked in »', en: 'First “Locked in”' },
  { id: 'streak5', icon: '🔥', fr: '5 jours lock-in d’affilée', en: '5 lock-in days in a row' },
  { id: 'streak10', icon: '⚡', fr: '10 jours lock-in d’affilée', en: '10 lock-in days in a row' },
  { id: 'streak20', icon: '💎', fr: '20 jours lock-in d’affilée', en: '20 lock-in days in a row' },
  { id: 'stage1', icon: '🌱', fr: 'Étape « Live prudent »', en: '“Careful live” step' },
  { id: 'stage2', icon: '🚀', fr: 'Étape « Live intermédiaire »', en: '“Intermediate live” step' },
  { id: 'stage3', icon: '👑', fr: 'Étape « Rythme de croisière »', en: '“Cruising” step' },
  { id: 'trades100', icon: '💯', fr: '100 trades journalisés', en: '100 trades logged' },
  { id: 'challenge', icon: '🏁', fr: 'Défi 30 jours réussi', en: '30-day challenge won' }
];
const FX_MEDALS_KEY = () => JP + 'medals';
function fxMedals() { const m = loadJSON(FX_MEDALS_KEY(), null); return m && typeof m === 'object' && !Array.isArray(m) ? m : null; }
let fxMedalQueue = [], fxMedalBusy = false;
function fxGrant(id, quiet) {
  const m = fxMedals() || {};
  if (m[id] || !FX_MEDALS.some(x => x.id === id)) return false;
  m[id] = localDateStr();
  DB.setItem(FX_MEDALS_KEY(), JSON.stringify(m));
  if (!quiet && fxOn()) { fxMedalQueue.push(id); fxMedalNext(); }
  safeRun(renderMedals, 'renderMedals');
  return true;
}
function fxMedalNext() {
  if (fxMedalBusy || !fxMedalQueue.length) return;
  const def = FX_MEDALS.find(x => x.id === fxMedalQueue.shift());
  if (!def) return;
  fxMedalBusy = true;
  fxSound('medal'); fxBuzz([20, 40, 20]);
  const box = document.createElement('div');
  box.className = 'fx-medal-pop'; box.setAttribute('role', 'status');
  mount(box, html`<div class="fx-coin"><span>${def.icon}</span></div><div><small>${fxL('Nouvelle médaille', 'New medal')}</small><b>${fxL(def.fr, def.en)}</b></div>`);
  document.body.appendChild(box);
  setTimeout(() => { box.classList.add('out'); }, 2600);
  setTimeout(() => { box.remove(); fxMedalBusy = false; fxMedalNext(); }, 3100);
}
function fxMedalChecks(d) {
  if (!trades.length || trades.some(t => t.demo)) return;   // pas de médaille avec les trades d'exemple
  const first = fxMedals() === null;                        // première fois : rattrapage silencieux, un seul message
  const earned = [];
  const grant = id => { if (fxGrant(id, first)) earned.push(id); };
  grant('first');
  if (trades.length >= 100) grant('trades100');
  [5, 10, 20].forEach(n => { if (d && d.streak >= n) grant('streak' + n); });
  const st = rkProg().stage;
  if (RK_STAGES[st] && !RK_STAGES[st].custom) for (let i = 1; i <= Math.min(st, 3); i++) grant('stage' + i);
  if (typeof chState === 'function') { const c = chState(); if (c && c.won) grant('challenge'); }
  if (first && earned.length && fxOn()) showToast('🏅 ' + earned.length + fxL(' médaille(s) débloquée(s) — à voir dans Gestion du risque', ' medal(s) unlocked — see Risk management'), 'success');
}
function renderMedals() {
  const el = document.getElementById('fx-medals');
  if (!el) return;
  const m = fxMedals() || {};
  mount(el, html`${FX_MEDALS.map(def => {
    const got = m[def.id];
    return html`<div class="fx-medal${raw(got ? ' got' : '')}" title="${got ? fxL('Gagnée le ', 'Earned on ') + fmtDateFR(got) : fxL('Pas encore gagnée', 'Not earned yet')}">
      <div class="fx-coin"><span>${got ? def.icon : '🔒'}</span></div><b>${fxL(def.fr, def.en)}</b><small>${got ? fmtDateFR(got) : fxL('à débloquer', 'locked')}</small></div>`;
  })}`);
}
// Passage à l'étape suivante du parcours : le cadenas s'ouvre en grand, l'étape apparaît, la médaille est gagnée.
function fxLevelUp(stage) {
  const st = RK_STAGES[stage], def = FX_MEDALS.find(x => x.id === 'stage' + stage);
  fxGrant('stage' + stage, true);
  if (!fxMotion()) return;   // sans animation : le parcours affiche déjà la nouvelle étape
  fxSound('unlock'); setTimeout(() => fxSound('medal'), 450); fxBuzz([20, 60, 40]);
  const box = document.createElement('div');
  box.className = 'fx-levelup'; box.setAttribute('role', 'status');
  box.onclick = () => box.remove();
  mount(box, html`<div class="fx-lu-card">${raw(fxLockMark('fx-lu-mark'))}<small>${fxL('Étape débloquée', 'Step unlocked')}</small><b>${guideText(st.name)}</b>
    <p>${fxL('Risque conseillé : ', 'Suggested risk: ')}${fmtNum(st.risk, 2)} % · ${guideText(st.desc)}</p>
    ${def ? html`<div class="fx-lu-medal"><div class="fx-coin"><span>${def.icon}</span></div><span>${fxL('Médaille gagnée', 'Medal earned')}</span></div>` : ''}</div>`);
  document.body.appendChild(box);
  setTimeout(() => { if (box.isConnected) { box.classList.add('out'); setTimeout(() => box.remove(), 500); } }, 4200);
}
(function () {
  const rss = rkSetStage;
  rkSetStage = function () {
    const before = rkProg().stage, r = rss.apply(this, arguments), after = rkProg().stage;
    if (after > before && after <= 3 && !RK_STAGES[after].custom) fxLevelUp(after);
    return r;
  };
  const chk = fxCheckLockedIn;
  fxCheckLockedIn = function () { const r = chk.apply(this, arguments); if (r && !trades.some(t => t.demo)) fxGrant('lockin'); return r; };
})();

// ── Recherche ⌘K : aperçu du trade sélectionné ──
(function () {
  const uss = updateSearchSelection;
  updateSearchSelection = function () {
    uss.apply(this, arguments);
    const pv = document.getElementById('search-preview'), modal = document.querySelector('.search-modal');
    if (!pv || !modal) return;
    const it = searchCurrentItems[searchSelectedIndex];
    if (!it || it.type !== 'trade') { pv.hidden = true; modal.classList.remove('has-preview'); return; }
    const t = it.trade;
    pv.hidden = false; modal.classList.add('has-preview');
    mount(pv, html`<div class="sp-head"><b>${t.asset || '—'}</b>${UI.badgeRes(t.res)}</div>
      <div class="sp-date">${t.date ? fmtDateFR(t.date, true) : ''}${t.entry ? ' · ' + t.entry : ''}</div>
      <div class="sp-grid"><span>${fxL('Sens', 'Side')}</span><b>${t.dir || '—'}</b><span>P&L</span><b>${t.pnlEur != null ? UI.pnl(t.pnlEur, '€') : '—'}</b>
      <span>R</span><b>${t.pnl != null ? fmtR(t.pnl, 2) : '—'}</b><span>Setup</span><b>${t.desc || t.setup || '—'}</b><span>Session</span><b>${t.session || '—'}</b></div>
      <div class="sp-hint">↵ ${fxL('ouvrir la fiche', 'open the trade')}</div>`);
  };
})();

// ── Au démarrage ──
onReady(() => {
  if (DB.getItem(FX_LK_KEY())) fxLockinMount(false);   // le mode Lock-in survit au rechargement de la page
  safeRun(fxRefreshMood, 'fxRefreshMood');
  const st = document.getElementById('fx-sound-toggle'); if (st) st.checked = fxSoundOn();
});
