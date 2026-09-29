// ── COMPOSANTS D'INTERFACE ───────────────────────────────────────────
// html`…` : gabarit sûr par construction — toute valeur insérée est échappée, sauf si elle vient d'un autre html`…`
// ou de raw(). Un libellé importé (CSV, backup) ne peut donc jamais injecter de HTML dans un composant.
class SafeHTML { constructor(s) { this.s = s; } toString() { return this.s; } }
function raw(s) { return new SafeHTML(String(s ?? '')); }
function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => {
    const part = v instanceof SafeHTML ? v.s
      : Array.isArray(v) ? v.map(x => x instanceof SafeHTML ? x.s : esc(x)).join('')
      : (v === null || v === undefined || v === false) ? '' : esc(v);
    out += part + strings[i + 1];
  });
  return new SafeHTML(out);
}

const UI = {
  // Tuile chiffre : libellé discret, valeur nette, sous-texte optionnel.
  stat(label, value, opts = {}) {
    return html`<div class="ui-stat${raw(opts.compact ? ' compact' : '')}"><span class="ui-stat-label">${label}</span><span class="ui-stat-val${raw(opts.tone ? ' tone-' + opts.tone : '')}">${value}</span>${opts.sub ? html`<span class="ui-stat-sub">${opts.sub}</span>` : ''}</div>`;
  },
  // Carte avec titre + sous-titre, corps libre (SafeHTML).
  card(title, sub, body, opts = {}) {
    return html`<section class="panel ui-card${opts.cls ? ' ' + opts.cls : ''}"${raw(opts.id ? ` id="${esc(opts.id)}"` : '')}><div class="panel-hdr"><span>${title}${sub ? html`<small class="panel-sub">${sub}</small>` : ''}</span>${opts.actions || ''}</div>${body}</section>`;
  },
  // Jauge 0–100 % avec repère optionnel (seuil) et couleur de sévérité.
  // tone : green | red | amber | accent | muted. Largeur et repère = seules valeurs calculées laissées en ligne.
  meter(pct, tone, opts = {}) {
    const p = Math.max(0, Math.min(100, pct || 0));
    return html`<div class="meter"${raw(opts.label ? ` role="img" aria-label="${esc(opts.label)}"` : '')}><div class="meter-fill fill-${raw(tone || 'accent')}" style="${raw('width:' + p.toFixed(1) + '%')}"></div>${opts.tick != null ? html`<div class="meter-tick" style="${raw(`left:calc(${Math.max(0, Math.min(100, opts.tick))}% - 1px)`)}"></div>` : ''}</div>`;
  },
  // Liste clé → valeur (fiche trade, résumés).
  kv(rows) {
    return html`<div class="ui-kv">${rows.filter(Boolean).map(([k, v]) => html`<div class="ui-kv-row"><span>${k}</span><span>${v}</span></div>`)}</div>`;
  },
  section(title, body) { return html`<div class="ui-section"><div class="ui-section-title">${title}</div>${body}</div>`; },
  badgeRes(res) {
    const cls = { TP: 'b-tp', SL: 'b-sl', BE: 'b-be' }[res] || 'b-open';
    return html`<span class="badge ${raw(cls)}">${res === 'OPEN' ? 'En cours' : res}</span>`;
  },
  // Montant signé coloré (gain / perte / zéro), en € ou en R.
  pnl(v, unit) {
    if (v === null || v === undefined || isNaN(v)) return html`<span class="pnl-z">—</span>`;
    const cls = v > 0 ? 'pnl-p' : v < 0 ? 'pnl-n' : 'pnl-z';
    const txt = unit === 'R' ? (v > 0 ? '+' : '') + Number(v).toFixed(2) + 'R' : fmtEUR(v, true, 2);
    return html`<span class="${raw(cls)}">${txt}</span>`;
  },
  // Tuile encadrée (analyses) : tone = green | red | amber | blue | purple | muted ; accent = liseré gauche coloré.
  tile(label, value, opts = {}) {
    const cls = ['ui-tile', opts.center && 'center', opts.accent && 'accent', opts.dim && 'dim', opts.size && 'sz-' + opts.size, opts.tone && 'tone-' + opts.tone].filter(Boolean).join(' ');
    return html`<div class="${cls}"><div class="ui-tile-label">${label}</div><div class="ui-tile-val">${value}</div>${opts.sub ? html`<div class="ui-tile-sub">${opts.sub}</div>` : ''}</div>`;
  },
  grid(items, cols) { return html`<div class="ui-grid c${raw(cols || items.length)}">${items}</div>`; },
  // Encadré d'explication (💡) ou d'avertissement (tone: 'warn').
  note(content, tone) { return html`<div class="ui-note${tone ? ' ' + tone : ''}">${content}</div>`; },
  hint(content, tone) { return html`<p class="ui-hint${tone ? ' tone-' + tone : ''}">${content}</p>`; },
  // Texte coloré par ton (valeur mise en avant dans une phrase).
  em(content, tone) { return html`<strong class="${tone ? 'tone-' + tone : ''}">${content}</strong>`; },
  // Liste de lignes gauche / droite (classements, trades signalés).
  rows(items) { return html`<div class="ui-rows">${items.map(r => html`<div class="ui-row">${r}</div>`)}</div>`; },
  chips(list, cls) { return html`${(list || []).map(x => html`<span class="chip ${raw(cls || '')}">${x}</span>`)}`; },
  // État vide illustré : icône, titre, explication, action optionnelle.
  empty(icon, title, text, action) {
    return html`<div class="ui-empty"><div class="ui-empty-icon" aria-hidden="true">${icon}</div><div class="ui-empty-title">${title}</div>${text ? html`<div class="ui-empty-text">${text}</div>` : ''}${action ? html`<button class="btn-primary" onclick="${raw(action.onclick)}">${action.label}</button>` : ''}</div>`;
  },
  // Tableau simple : en-têtes + lignes (chaque cellule = texte ou SafeHTML). align: tableau de 'l'/'r'.
  table(headers, rows, opts = {}) {
    const al = i => opts.align && opts.align[i] === 'r' ? ' class="num"' : '';
    return html`<div class="ui-table-wrap"><table class="ui-table"><thead><tr>${headers.map((h, i) => html`<th${raw(al(i))}>${h}</th>`)}</tr></thead><tbody>${rows.map(r => html`<tr>${r.map((c, i) => html`<td${raw(al(i))}>${c}</td>`)}</tr>`)}</tbody></table></div>`;
  }
};
// Insère un SafeHTML dans un élément (le seul point d'entrée des composants vers le DOM).
function mount(el, content) { if (typeof el === 'string') el = document.getElementById(el); if (el) el.innerHTML = String(content); return el; }
