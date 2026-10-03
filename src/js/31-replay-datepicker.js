// ── REPLAY : CALENDRIER DE LA DATE DE DÉPART ─────────────────────────
// Remplace le champ date natif (peu pratique pour remonter loin) : mois et année en listes, grille des jours,
// raccourcis (il y a 1 semaine, 1 mois…) et heure. La valeur reste dans #rp-start au format AAAA-MM-JJTHH:MM.
let RP_DP = null;   // { y, m } mois affiché

function rpDpValue() {
  const v = (document.getElementById('rp-start') || {}).value || '';
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3], h: +m[4], mi: +m[5] } : null;
}
function rpSetStart(v) {
  const st = document.getElementById('rp-start');
  if (st) st.value = v;
  rpDpLabel();
}
function rpDpLabel() {
  const el = document.getElementById('rp-start-txt'), v = rpDpValue();
  if (!el) return;
  el.textContent = v ? new Date(v.y, v.m, v.d).toLocaleDateString(UI_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/,/g, '')
    + '  ' + String(v.h).padStart(2, '0') + ':' + String(v.mi).padStart(2, '0') : 'Choisir une date';
}
function rpDpToggle(force) {
  const dp = document.getElementById('rp-dp');
  if (!dp) return;
  const open = force != null ? force : dp.hidden;
  if (open) { const v = rpDpValue() || { y: new Date().getFullYear(), m: new Date().getMonth() }; RP_DP = { y: v.y, m: v.m }; dp.hidden = false; rpDpRender(); rpDpPlace(); }
  else dp.hidden = true;
  document.getElementById('rp-start-btn').setAttribute('aria-expanded', String(!dp.hidden));
}
// Position fixe sous le bouton (la zone de contenu défile et couperait le calendrier), au-dessus s'il manque de place.
function rpDpPlace() {
  const dp = document.getElementById('rp-dp'), b = document.getElementById('rp-start-btn');
  if (!dp || dp.hidden || !b) return;
  const r = b.getBoundingClientRect(), h = dp.offsetHeight, w = dp.offsetWidth, vw = window.innerWidth, vh = window.innerHeight;
  const below = r.bottom + 6 + h <= vh || r.top - 6 - h < 0;
  dp.style.top = Math.max(8, below ? r.bottom + 6 : r.top - 6 - h) + 'px';
  dp.style.left = Math.max(8, Math.min(r.left, vw - w - 8)) + 'px';
}
window.addEventListener('resize', rpDpPlace);
document.addEventListener('scroll', rpDpPlace, true);
function rpDpPick(y, m, d) {
  const v = rpDpValue() || { h: 9, mi: 0 }, pad = n => String(n).padStart(2, '0');
  rpSetStart(y + '-' + pad(m + 1) + '-' + pad(d) + 'T' + pad(v.h) + ':' + pad(v.mi));
  RP_DP = { y, m };
  rpDpRender();
}
function rpDpTime(part, val) {
  const v = rpDpValue(); if (!v) return;
  if (part === 'h') v.h = +val; else v.mi = +val;
  const pad = n => String(n).padStart(2, '0');
  rpSetStart(v.y + '-' + pad(v.m + 1) + '-' + pad(v.d) + 'T' + pad(v.h) + ':' + pad(v.mi));
}
function rpDpQuick(days) {
  const d = new Date(Date.now() - days * 86400000);
  rpDpPick(d.getFullYear(), d.getMonth(), d.getDate());
}
function rpDpMove(delta) {
  const d = new Date(RP_DP.y, RP_DP.m + delta, 1), now = new Date();
  if (d.getFullYear() < 2017 || d > now) return;
  RP_DP = { y: d.getFullYear(), m: d.getMonth() };
  rpDpRender();
}
function rpDpRender() {
  const dp = document.getElementById('rp-dp');
  if (!dp || !RP_DP) return;
  const { y, m } = RP_DP, v = rpDpValue(), now = new Date(), today = localDateStr(now);
  const first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, nDays = new Date(y, m + 1, 0).getDate();
  const years = []; for (let a = now.getFullYear(); a >= 2017; a--) years.push(a);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(html`<span class="rp-dp-day empty"></span>`);
  for (let d = 1; d <= nDays; d++) {
    const ds = localDateStr(new Date(y, m, d)), future = ds > today, sel = v && v.y === y && v.m === m && v.d === d;
    cells.push(html`<button type="button" class="rp-dp-day${raw(sel ? ' sel' : '')}${raw(ds === today ? ' today' : '')}" ${raw(future ? 'disabled' : '')} onclick="${raw('rpDpPick(' + y + ',' + m + ',' + d + ')')}">${d}</button>`);
  }
  const hours = [], mins = [];
  for (let h = 0; h < 24; h++) hours.push(h);
  for (let mi = 0; mi < 60; mi += 5) mins.push(mi);
  const pad = n => String(n).padStart(2, '0');
  mount(dp, html`
    <div class="rp-dp-quick"><span class="rp-dp-tlbl">Il y a</span>
      <button type="button" onclick="rpDpQuick(7)">1 semaine</button><button type="button" onclick="rpDpQuick(30)">1 mois</button>
      <button type="button" onclick="rpDpQuick(91)">3 mois</button><button type="button" onclick="rpDpQuick(365)">1 an</button>
    </div>
    <div class="rp-dp-head">
      <button type="button" class="rp-dp-nav" onclick="rpDpMove(-1)" aria-label="Mois précédent">‹</button>
      <select class="filter-select" aria-label="Mois" onchange="RP_DP.m = +this.value; rpDpRender()">${MONTHS_FR.map((n, i) => html`<option value="${i}" ${raw(i === m ? 'selected' : '')}>${n}</option>`)}</select>
      <select class="filter-select" aria-label="Année" onchange="RP_DP.y = +this.value; rpDpRender()">${years.map(a => html`<option value="${a}" ${raw(a === y ? 'selected' : '')}>${a}</option>`)}</select>
      <button type="button" class="rp-dp-nav" onclick="rpDpMove(1)" aria-label="Mois suivant">›</button>
    </div>
    <div class="rp-dp-grid">${DAYS_FR.map(n => html`<span class="rp-dp-wd">${n}</span>`)}${cells}</div>
    <div class="rp-dp-foot">
      <span class="rp-dp-tlbl">Heure</span>
      <select class="filter-select" aria-label="Heure" onchange="rpDpTime('h', this.value)">${hours.map(h => html`<option value="${h}" ${raw(v && v.h === h ? 'selected' : '')}>${pad(h)}</option>`)}</select>
      <span>:</span>
      <select class="filter-select" aria-label="Minutes" onchange="rpDpTime('m', this.value)">${mins.map(mi => html`<option value="${mi}" ${raw(v && v.mi === mi ? 'selected' : '')}>${pad(mi)}</option>`)}</select>
      <button type="button" class="btn-primary rp-dp-ok" onclick="rpDpToggle(false)">Valider</button>
    </div>`);
}
// Fermeture : clic à l'extérieur ou Échap.
document.addEventListener('mousedown', e => {
  const dp = document.getElementById('rp-dp');
  if (dp && !dp.hidden && !e.target.closest('.rp-dp-field')) rpDpToggle(false);
});
document.addEventListener('keydown', e => {
  const dp = document.getElementById('rp-dp');
  if (e.key === 'Escape' && dp && !dp.hidden) { rpDpToggle(false); document.getElementById('rp-start-btn').focus(); }
});
