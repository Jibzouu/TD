// ── IMPORT DES RELEVÉS DE PLATEFORMES : MetaTrader 4 / 5, cTrader et historiques de brokers ─────────────
// MetaTrader : « Detailed Statement » (MT4) ou « Rapport » (MT5) enregistrés en HTML depuis l'onglet Historique.
// cTrader : export de l'historique (HTML ou CSV). Les colonnes sont reconnues par leur nom (anglais ou français) :
// symbole, type (buy / sell), heures et prix d'ouverture / de clôture, S/L, T/P, volume, commission, swap, profit.
// Le P&L enregistré est NET (profit + commission + swap + taxes) ; les frais sont gardés à part (champ fees).

// Lecture d'un fichier quel que soit son encodage : les rapports MT5 sont en UTF-16 (avec ou sans BOM).
function decodeFileBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return new TextDecoder('utf-8').decode(b.subarray(3));
  // UTF-16 sans BOM : un octet nul sur deux au début du fichier.
  let zeroOdd = 0, zeroEven = 0;
  for (let i = 0; i < Math.min(b.length, 400); i++) if (b[i] === 0) (i % 2 ? zeroOdd++ : zeroEven++);
  if (zeroOdd > 40 && zeroEven < 5) return new TextDecoder('utf-16le').decode(b);
  if (zeroEven > 40 && zeroOdd < 5) return new TextDecoder('utf-16be').decode(b);
  const utf8 = new TextDecoder('utf-8').decode(b);
  return utf8.indexOf('�') > -1 ? new TextDecoder('windows-1252').decode(b) : utf8;
}
function readFileAsBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}
function looksLikeHTML(text) { return /<\s*(html|table|tr)\b/i.test(text.slice(0, 20000)); }
// Toutes les lignes de tous les tableaux d'une page HTML (les cellules fusionnées sont dépliées pour garder l'alignement).
function htmlTablesToRows(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const rows = [];
  doc.querySelectorAll('tr').forEach(tr => {
    const cells = [];
    tr.querySelectorAll(':scope > th, :scope > td').forEach(td => {
      const span = Math.max(1, Math.min(20, parseInt(td.getAttribute('colspan') || '1', 10) || 1));
      cells.push(td.textContent.replace(/\s+/g, ' ').trim());
      for (let i = 1; i < span; i++) cells.push('');
    });
    if (cells.some(Boolean)) rows.push(cells);
  });
  // Texte « à plat » (titre compris) : chaque balise devient un espace pour ne pas coller « USD » à « Leverage ».
  const flat = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  return { rows, text: flat };
}
// Date + heure d'un relevé : « 2024.01.15 10:30:45 », « 2024-01-15 10:30 », « 15/01/2024 10:30:45.123 ».
function parsePlatformDateTime(raw) {
  const s = String(raw || '').trim();
  let m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})(?:[ T,]+(\d{1,2}):(\d{2}))?/);
  if (m) return { date: m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'), time: m[4] !== undefined ? m[4].padStart(2, '0') + ':' + m[5] : '', hour: m[4] !== undefined ? parseInt(m[4], 10) : null };
  m = s.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/);
  if (m) {
    let d = parseInt(m[1], 10), mo = parseInt(m[2], 10);
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];   // format mois/jour
    return { date: m[3] + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0'), time: m[4] !== undefined ? m[4].padStart(2, '0') + ':' + m[5] : '', hour: m[4] !== undefined ? parseInt(m[4], 10) : null };
  }
  return { date: '', time: '', hour: null };
}
// Repère l'en-tête du tableau des positions clôturées et l'index de chaque colonne utile.
function findPlatformHeader(rows) {
  for (let i = 0; i < rows.length; i++) {
    const h = rows[i].map(c => normHeaderCSV(String(c || '')));
    if (h.length < 5) continue;
    const find = re => h.findIndex(x => re.test(x));
    const all = re => h.map((x, j) => re.test(x) ? j : -1).filter(j => j > -1);
    const col = {
      symbol: find(/^(symbol|symbole|item|instrument|actif|market|marche)$/),
      type: find(/^(type|direction|side|sens|openingdirection|tradeside|buysell|achatvente)$/),
      volume: find(/^(volume|size|taille|lots?|quantity|closingquantity|quantite|qty|volumelots|amount)$/),
      sl: find(/^(sl|stoploss|stop)$/), tp: find(/^(tp|takeprofit|target)$/),
      commission: find(/^(commissions?|comm|frais|fees?)$/), swap: find(/^(swaps?|rollover|financing)$/), taxes: find(/^(taxes|tax)$/),
      net: find(/^(net|netprofit|netpl|netpnl|net(usd|eur|gbp|chf|jpy|cad|aud)|resultatnet)$/),
      profit: find(/^(profit|gross|grossprofit|gross(usd|eur|gbp|chf|jpy|cad|aud)|pl|pnl|benefice|gain|profitloss)$/),
      id: find(/^(ticket|position|positionid|id|order|ordre|deal|tradeid)$/)
    };
    const times = all(/^(time|heure|date|datetime|opentime|openingtime|entrytime|opendate|closetime|closingtime|exittime|closedate|heuredouverture|heuredefermeture|ouverture|fermeture|cloture)/);
    const prices = all(/^(price|prix|openprice|entryprice|openingprice|closeprice|closingprice|exitprice|prixdouverture|prixdefermeture)/);
    if (col.symbol < 0 || col.type < 0 || !times.length || (col.profit < 0 && col.net < 0)) continue;
    const pick = (list, re, nth) => { const named = list.find(j => re.test(h[j])); return named !== undefined ? named : list[nth] !== undefined ? list[nth] : -1; };
    col.openTime = pick(times, /open|entry|ouvert/, 0);
    col.closeTime = pick(times.filter(j => j !== col.openTime), /clos|exit|ferm|clotur/, 0);
    col.openPrice = pick(prices, /open|entry|ouvert/, 0);
    col.closePrice = pick(prices.filter(j => j !== col.openPrice), /clos|exit|ferm/, 0);
    return { index: i, col, headers: rows[i] };
  }
  return null;
}
function guessPlatform(text, headers) {
  const t = (text || '').slice(0, 5000);
  if (/MetaTrader\s*5|Trade History Report|ReportHistory/i.test(t)) return 'MT5';
  if (/MetaTrader|Detailed Statement|Statement:/i.test(t)) return 'MT4';
  if (/cTrader/i.test(t) || headers.some(h => /opening direction|closing quantity/i.test(h))) return 'cTrader';
  return 'Broker';
}
function detectStatementCcy(text, headers, col) {
  const t = (text || '').slice(0, 8000);
  const m = t.match(/Currency\s*:?\s*([A-Z]{3})\b/i) || t.match(/Devise\s*:?\s*([A-Z]{3})\b/i) || t.match(/\((USD|EUR|GBP|CHF|JPY|CAD|AUD)[,)]/);
  if (m) return m[1].toUpperCase();
  const h = col.net > -1 ? headers[col.net] : col.profit > -1 ? headers[col.profit] : '';
  return detectCcyFromHeader(h);
}
// Convertit les lignes d'un relevé en trades du journal (null si ce n'est pas un relevé reconnu).
function tryParsePlatformStatement(rows, text) {
  const hdr = findPlatformHeader(rows);
  if (!hdr) return null;
  const { col, headers } = hdr;
  const platform = guessPlatform(text, headers);
  const ccy = detectStatementCcy(text, headers, col), fx = fxForCcy(ccy);
  const num = (r, j) => { if (j < 0) return null; const v = parseNumCSV(r[j]); return isNaN(v) ? null : v; };
  const out = [];
  for (let i = hdr.index + 1; i < rows.length; i++) {
    const r = rows[i];
    const first = String(r[0] || '').trim();
    // Fin du tableau des positions : nouvelle section (Ordres, Transactions, Résumé…) ou nouvel en-tête.
    if (r.filter(Boolean).length <= 2 && /^(orders?|ordres|deals?|transactions?|summary|r[ée]sum[ée]|working orders|open (positions|trades)|positions ouvertes|results|r[ée]sultats|total|closed p\/l)/i.test(first)) break;
    const type = String(r[col.type] || '').trim().toLowerCase();
    if (!/^(buy|sell|achat|vente|long|short)\b/.test(type)) continue;   // dépôts, retraits, crédits, ordres annulés…
    if (/cancel|annul|limit|stop/.test(type) && !/stop out/.test(type)) continue;   // ordres en attente non exécutés
    const open = parsePlatformDateTime(r[col.openTime]), close = col.closeTime > -1 ? parsePlatformDateTime(r[col.closeTime]) : { date: '', time: '', hour: null };
    const date = close.date || open.date;
    if (!date) continue;
    const comm = num(r, col.commission) || 0, swap = num(r, col.swap) || 0, taxes = num(r, col.taxes) || 0;
    const net = col.net > -1 ? num(r, col.net) : null, profit = num(r, col.profit);
    if (net === null && profit === null) continue;
    const netRaw = net !== null ? net : profit + comm + swap + taxes;
    const feesRaw = -(comm + swap + taxes);
    const pnlEur = Math.round(netRaw * fx * 100) / 100, fees = Math.round(feesRaw * fx * 100) / 100;
    const res = pnlEur > 0.000001 ? 'TP' : pnlEur < -0.000001 ? 'SL' : 'BE';
    const dir = /sell|vente|short/.test(type) ? 'Short' : 'Long';
    const pos = v => v !== null && v > 0 ? v : null;
    const entryPrice = pos(num(r, col.openPrice)), exitPrice = pos(num(r, col.closePrice));
    const slPrice = pos(num(r, col.sl)), tpPrice = pos(num(r, col.tp));
    // Le relevé donne le stop FINAL : s'il a été déplacé (break-even, suiveur), la distance ne reflète plus le risque
    // initial → un R par distance hors de toute plausibilité est écarté, comme pour l'import TradingView.
    const distR = computeDistanceR(entryPrice, slPrice, exitPrice, dir);
    const okDist = distR !== null && Math.abs(distR) <= 15;
    const cr = computeRWithSource(pnlEur, res);
    const id = col.id > -1 ? String(r[col.id] || '').trim() : '';
    out.push({
      date, asset: cleanSymbol(String(r[col.symbol] || '')), dir, res, tf: '', emotion: null, desc: '',
      entry: open.time, exit: close.time, session: sessionFromHour(open.hour),
      entryPrice, exitPrice, slPrice: okDist ? slPrice : null, tpPrice,
      size: num(r, col.volume), pnlEur, fees: fees || null, ccy: ccy || '', fxRate: fx,
      pnl: okDist ? distR : cr.r, rr: okDist ? Math.abs(distR) || null : (cr.r !== null ? Math.abs(cr.r) || null : null), rSrc: okDist ? 'prix' : cr.src,
      tvKey: id ? platform.toLowerCase() + ':' + id : '', importSource: platform
    });
  }
  return out.length ? out : null;
}
