// ── RAPPORT MENTOR ───────────────────────────────────────────────────
// Un fichier HTML autonome (aucune dépendance, s'ouvre partout, s'imprime en PDF) résumant une période :
// chiffres clés, courbe, setups, actifs, discipline, leçons du journal de séance et liste des trades,
// avec les captures en option. Montants en € masquables pour ne partager que les R.
function mentorPeriodRange(period) {
  const today = localDateStr(), d = new Date();
  const back = n => { const x = new Date(); x.setDate(x.getDate() - n + 1); return localDateStr(x); };
  if (period === '7d') return [back(7), today];
  if (period === '30d') return [back(30), today];
  if (period === '90d') return [back(90), today];
  if (period === 'month') return [localDateStr(new Date(d.getFullYear(), d.getMonth(), 1)), today];
  if (period === 'year') return [d.getFullYear() + '-01-01', today];
  return [null, null];
}
function mentorTrades(period) {
  const base = period === 'filter' ? viewTrades() : trades.filter(t => !t.demo);
  const [from, to] = mentorPeriodRange(period);
  return base.filter(t => t.date && (!from || (t.date >= from && t.date <= to)))
    .slice().sort((a, b) => (a.date + (a.entry || '')).localeCompare(b.date + (b.entry || '')));
}
// Capture réduite (640 px, JPEG) pour garder le rapport léger.
function shrinkImage(src, max) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.72));
      } catch (e) { res(src); }
    };
    img.onerror = () => res('');
    img.src = src;
  });
}

function mentorStats(list) {
  const an = new Map(analysisTradesAll().map(t => [t.id, t]));
  const rOf = t => { const a = an.get(t.id); return a && a.pnl != null ? a.pnl : null; };
  const W = winStats(list), eur = list.filter(t => t.pnlEur != null);
  const net = eur.reduce((s, t) => s + t.pnlEur, 0), rs = list.map(rOf).filter(v => v != null);
  const gw = eur.filter(t => t.pnlEur > 0).reduce((s, t) => s + t.pnlEur, 0), gl = -eur.filter(t => t.pnlEur < 0).reduce((s, t) => s + t.pnlEur, 0);
  let cum = 0, cumR = 0;
  const curve = list.map(t => (cum += t.pnlEur || 0)), curveR = list.map(t => (cumR += rOf(t) || 0));
  const days = {};
  list.forEach(t => { const g = days[t.date] = days[t.date] || { pnl: 0, r: 0, tp: 0, sl: 0, n: 0 }; g.n++; g.pnl += t.pnlEur || 0; g.r += rOf(t) || 0; if (t.res === 'TP') g.tp++; if (t.res === 'SL') g.sl++; });
  const dayList = Object.entries(days);
  const maxTP = planData && planData.maxTP > 0 ? planData.maxTP : null, maxSL = planData && planData.maxSL > 0 ? planData.maxSL : null;
  const rulesOk = (maxTP || maxSL) ? dayList.filter(([, g]) => (!maxTP || g.tp <= maxTP) && (!maxSL || g.sl <= maxSL)).length : null;
  const group = key => {
    const m = {};
    list.forEach(t => { const k = t[key] || '—'; const g = m[k] = m[k] || { n: 0, w: 0, c: 0, pnl: 0, r: 0 }; g.n++; if (['TP', 'SL', 'BE'].includes(t.res)) g.c++; if (t.res === 'TP') g.w++; g.pnl += t.pnlEur || 0; g.r += rOf(t) || 0; });
    return Object.entries(m).sort((a, b) => b[1].pnl - a[1].pnl || b[1].r - a[1].r);
  };
  const mist = {};
  list.forEach(t => (t.mistakes || []).forEach(x => { const g = mist[x] = mist[x] || { n: 0, cost: 0 }; g.n++; if (t.pnlEur < 0) g.cost += t.pnlEur; }));
  const withCk = list.filter(tradeHasChecklist);
  return {
    W, net, rSum: rs.reduce((a, b) => a + b, 0), exp: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : null), fees: list.reduce((s, t) => s + (t.fees || 0), 0),
    dd: maxDrawdown([0].concat(curve)).abs, ddR: maxDrawdown([0].concat(curveR)).abs, curve, curveR, rOf,
    days: dayList.length, bestDay: dayList.reduce((m, d) => (!m || d[1].pnl > m[1].pnl ? d : m), null), worstDay: dayList.reduce((m, d) => (!m || d[1].pnl < m[1].pnl ? d : m), null),
    rulesOk, maxTP, maxSL, setups: group('setup'), assets: group('asset'),
    mistakes: Object.entries(mist).sort((a, b) => b[1].n - a[1].n),
    checklist: withCk.length ? withCk.filter(tradeChecklistComplete).length / withCk.length : null
  };
}
function mentorEquitySVG(curve, unit) {
  if (curve.length < 2) return '';
  const W = 760, H = 180, P = 6, vals = [0].concat(curve), min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
  const x = i => P + i / (vals.length - 1) * (W - 2 * P), y = v => P + (1 - (v - min) / span) * (H - 2 * P);
  const line = vals.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  const last = vals[vals.length - 1], col = last >= 0 ? '#1f9d8f' : '#d64545';
  return `<svg viewBox="0 0 ${W} ${H}" class="eq" role="img" aria-label="Courbe des résultats cumulés en ${unit}"><line x1="${P}" x2="${W - P}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" stroke="#c9ced8" stroke-dasharray="4 4"/><polygon points="${x(0).toFixed(1)},${y(0).toFixed(1)} ${line} ${x(vals.length - 1).toFixed(1)},${y(0).toFixed(1)}" fill="${col}" fill-opacity=".12"/><polyline points="${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

async function buildMentorReport(opts) {
  const list = mentorTrades(opts.period), S = mentorStats(list), hide = !!opts.rOnly;
  const [from, to] = mentorPeriodRange(opts.period);
  const span = list.length ? [from || list[0].date, to || list[list.length - 1].date] : [from, to];
  const money = (v, d) => hide ? '' : fmtEUR(v, true, d == null ? 0 : d);
  const tone = v => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  const cell = (eur, r) => hide ? html`<span class="${raw(tone(r))}">${r != null ? fmtR(r, 2) : '—'}</span>` : html`<span class="${raw(tone(eur))}">${eur != null ? fmtEUR(eur, true, 0) : '—'}</span>${r != null ? html` <small>${fmtR(r, 2)}</small>` : ''}`;
  const kpi = (l, v, cls, sub) => html`<div class="kpi"><div class="l">${l}</div><div class="v ${raw(cls || '')}">${v}</div>${sub ? html`<div class="s">${sub}</div>` : ''}</div>`;
  const tbl = (head, rows, right) => html`<table><thead><tr>${head.map((h, i) => html`<th${raw(right && right.includes(i) ? ' class="r"' : '')}>${h}</th>`)}</tr></thead><tbody>${rows.map(r => html`<tr>${r.map((c, i) => html`<td${raw(right && right.includes(i) ? ' class="r"' : '')}>${c}</td>`)}</tr>`)}</tbody></table>`;
  const groupRows = g => g.map(([k, v]) => [k, String(v.n), v.c ? fmtRate(v.w / v.c * 100, 0) : '—', cell(v.pnl, v.r)]);
  const daily = loadDaily();
  const lessons = Object.keys(daily).filter(d => (!span[0] || d >= span[0]) && (!span[1] || d <= span[1]) && daily[d] && (daily[d].lesson || daily[d].recap)).sort();
  const disc = { oui: 'plan respecté', partiel: 'plan en partie respecté', non: 'plan non respecté' };

  const caps = {};
  if (opts.captures) for (const t of list) { const src = tradeImages(t)[0]; if (src) caps[t.id] = await shrinkImage(src, 640); }

  const title = 'Rapport de trading — ' + JOURNALS[JOURNAL_ID].title;
  const periodTxt = span[0] ? `du ${fmtDateFR(span[0], true)} au ${fmtDateFR(span[1], true)}` : 'aucune période';
  const body = html`
  <header><h1>${title}</h1><p>${periodTxt} · ${list.length} trade${list.length > 1 ? 's' : ''} sur ${S.days} jour${S.days > 1 ? 's' : ''} · généré le ${fmtDateFR(localDateStr(), true)}${hide ? ' · montants en R uniquement' : ''}</p></header>
  <section class="kpis">
    ${hide ? '' : kpi('Résultat net', fmtEUR(S.net, true, 0), tone(S.net), S.fees ? 'après ' + fmtEUR(S.fees, false, 0) + ' de frais' : '')}
    ${kpi('Résultat en R', fmtR(S.rSum, 1), tone(S.rSum), S.exp != null ? fmtR(S.exp, 2) + ' par trade' : '')}
    ${kpi('Win rate', S.W.rate != null ? fmtRate(S.W.rate * 100, 0) : '—', '', S.W.wins + ' TP · ' + S.W.losses + ' SL · ' + S.W.be + ' BE')}
    ${kpi('Profit factor', S.pf == null ? '—' : S.pf === Infinity ? '∞' : fmtNum(S.pf, 2), S.pf != null && S.pf >= 1 ? 'pos' : 'neg')}
    ${kpi('Drawdown max', hide ? fmtR(S.ddR, 1) : fmtEUR(S.dd, false, 0), S.dd < 0 ? 'neg' : '')}
    ${S.bestDay ? kpi('Meilleur jour', hide ? fmtR(S.bestDay[1].r, 1) : fmtEUR(S.bestDay[1].pnl, true, 0), 'pos', fmtDateFR(S.bestDay[0]) + ' · pire : ' + (hide ? fmtR(S.worstDay[1].r, 1) : fmtEUR(S.worstDay[1].pnl, true, 0)) + ' le ' + fmtDateFR(S.worstDay[0])) : ''}
  </section>
  ${list.length > 1 ? html`<section><h2>Courbe des résultats ${hide ? '(R cumulés)' : '(€ cumulés)'}</h2>${raw(mentorEquitySVG(hide ? S.curveR : S.curve, hide ? 'R' : '€'))}</section>` : ''}
  <section class="cols">
    <div><h2>Par setup</h2>${tbl(['Setup', 'Trades', 'Win rate', 'Résultat'], groupRows(S.setups), [1, 2, 3])}</div>
    <div><h2>Par actif</h2>${tbl(['Actif', 'Trades', 'Win rate', 'Résultat'], groupRows(S.assets), [1, 2, 3])}</div>
  </section>
  <section><h2>Discipline</h2><ul class="disc">
    ${S.rulesOk != null ? html`<li><b>${S.rulesOk} / ${S.days}</b> jours dans les limites du plan (${S.maxTP ? S.maxTP + ' TP max' : ''}${S.maxTP && S.maxSL ? ', ' : ''}${S.maxSL ? S.maxSL + ' SL max' : ''} par jour)</li>` : ''}
    ${S.checklist != null ? html`<li><b>${fmtRate(S.checklist * 100, 0)}</b> des trades avec la checklist d'entrée complète</li>` : ''}
    ${S.mistakes.length ? S.mistakes.map(([m, g]) => html`<li>${m} : <b>${g.n}×</b>${hide || !g.cost ? '' : html` <span class="neg">(${fmtEUR(g.cost, true, 0)})</span>`}</li>`) : html`<li>Aucune erreur taguée sur la période.</li>`}
  </ul></section>
  ${lessons.length ? html`<section><h2>Journal de séance</h2><ul class="lessons">${lessons.map(d => html`<li><span class="d">${fmtDateFR(d)}</span> ${daily[d].lesson || daily[d].recap}${daily[d].discipline ? html` <em>— ${disc[daily[d].discipline]}</em>` : ''}</li>`)}</ul></section>` : ''}
  <section><h2>Trades</h2>${tbl(['Date', 'Actif', 'Sens', 'Setup', 'Rés.', 'Résultat', 'Notes'], list.map(t => [
    fmtDateNum(t.date) + (t.entry ? ' ' + t.entry : ''), t.asset || '—', t.dir || '—', t.setup || '—', t.res || '—', cell(hide ? null : t.pnlEur, S.rOf(t)),
    html`${t.desc || ''}${t.review ? html`<div class="rev">↳ ${t.review}</div>` : ''}${(t.mistakes || []).length ? html`<div class="mis">${t.mistakes.join(' · ')}</div>` : ''}${caps[t.id] ? html`<img src="${raw(safeImgSrc(caps[t.id]))}" alt="Capture">` : ''}`]), [5])}</section>
  <footer>Rapport généré par le Journal de trading · les chiffres portent sur les trades de la période uniquement.</footer>`;

  const css = `*{box-sizing:border-box}body{font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1d2330;background:#fff;margin:0;padding:32px;max-width:1080px;margin:auto}
h1{font-size:24px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 10px;text-transform:uppercase;letter-spacing:.05em;color:#4a5263}header p{color:#6b7385;margin:0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:22px}.kpi{border:1px solid #e3e6ec;border-radius:10px;padding:12px 14px}
.kpi .l{font-size:12px;color:#6b7385}.kpi .v{font-size:20px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}.kpi .s{font-size:11.5px;color:#6b7385}
.pos{color:#1f9d8f}.neg{color:#d64545}.eq{width:100%;height:auto;border:1px solid #e3e6ec;border-radius:10px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;font-size:11.5px;color:#6b7385;font-weight:600;border-bottom:1px solid #e3e6ec;padding:6px 8px}
td{border-bottom:1px solid #f0f2f5;padding:7px 8px;vertical-align:top;font-variant-numeric:tabular-nums}.r{text-align:right;white-space:nowrap}td small{color:#6b7385}
td img{display:block;max-width:320px;width:100%;margin-top:6px;border-radius:6px;border:1px solid #e3e6ec}.rev{color:#4a5263;margin-top:3px}.mis{color:#b26b00;font-size:12px;margin-top:3px}
.disc,.lessons{margin:0;padding-left:18px}.disc li,.lessons li{margin:4px 0}.lessons .d{color:#6b7385;font-variant-numeric:tabular-nums}footer{margin-top:32px;font-size:12px;color:#8a91a1}
@media (max-width:700px){body{padding:16px}.cols{grid-template-columns:1fr}}@media print{body{padding:0}section{break-inside:avoid}}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
}

async function downloadMentorReport() {
  const get = id => document.getElementById(id);
  const opts = { period: (get('mentor-period') || {}).value || '30d', captures: !!(get('mentor-caps') || {}).checked, rOnly: !!(get('mentor-ronly') || {}).checked };
  const n = mentorTrades(opts.period).length;
  if (!n) { showToast('Aucun trade sur cette période', 'error'); return; }
  const doc = await buildMentorReport(opts);
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
  a.href = url; a.download = 'rapport-' + JOURNALS[JOURNAL_ID].slug + '-' + localDateStr() + '.html';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Rapport téléchargé ✓ — ' + n + ' trade' + (n > 1 ? 's' : '') + ', à envoyer tel quel', 'success');
}
