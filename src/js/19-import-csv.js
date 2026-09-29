// ── IMPORT CSV (broker / backtest) ──────────────────────────────────────
function normHeaderCSV(h) {
  return h.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Séparateur détecté sur la ligne d'en-tête (hors guillemets) : « , » (TradingView), « ; » (Excel FR) ou tabulation.
function detectCSVDelimiter(text) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQ = !inQ;
    else if (!inQ && c === '\n') break;
    else if (!inQ && counts[c] !== undefined) counts[c]++;
  }
  return Object.keys(counts).reduce((best, d) => counts[d] > counts[best] ? d : best, ',');
}
function parseCSVGeneric(text) {
  text = String(text || '').replace(/^\uFEFF/, '');   // BOM UTF-8 des exports Excel
  const delim = detectCSVDelimiter(text);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else { inQuotes = false; } }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

function guessSymbolFromFilenameCSV(filename) {
  if (!filename) return '';
  const codes = ['USD','EUR','GBP','JPY','CHF','AUD','CAD','NZD','BTC','ETH','XAU','XAG','USDT'];
  const tokens = filename.split(/[^A-Za-z0-9]+/).filter(Boolean);
  for (const tok of tokens) {
    const up = tok.toUpperCase();
    if (up.length >= 5 && up.length <= 8 && codes.some(c => up.indexOf(c) > -1)) return up;
  }
  return '';
}

function sessionFromHour(h) {
  if (h === null || h === undefined || isNaN(h)) return '';
  h = ((Math.round(h + TZ_OFFSET_HOURS) % 24) + 24) % 24;   // applique le décalage réglé par l'utilisateur, replié sur 0-23h
  if (h >= 0 && h < 6) return 'Asie';
  if (h >= 6 && h < 8) return 'Overlap Asie/Londres';
  if (h >= 8 && h < 12) return 'Londres';
  if (h >= 12 && h < 16) return 'Overlap LDN/NY';
  if (h >= 16 && h < 21) return 'New York';
  return 'Hors session';
}

// Handles the TradingView "List of trades" export: two rows per trade
// (Entrer.../Sortir...), grouped by a trade-number column, P&L already computed.
function cleanSymbol(raw) {
  if (!raw) return '';
  let s = raw.trim();
  const colonIdx = s.indexOf(':');
  if (colonIdx > -1) s = s.slice(colonIdx + 1);
  s = s.toUpperCase().trim();
  const FX = ['EUR','USD','GBP','JPY','CHF','AUD','CAD','NZD','XAU','XAG'];
  if (s.length === 6 && FX.includes(s.slice(0,3)) && FX.includes(s.slice(3,6))) {
    return s.slice(0,3) + '/' + s.slice(3,6);
  }
  return s;
}

// Table unique FR + EN (abrégé et complet) : les index concordent (mars/march, avr/april, etc.), donc un seul lookup couvre les deux locales.
const FR_MONTHS = {
  janv:0, jan:0, janvier:0, january:0,
  fevr:1, feb:1, fevrier:1, february:1,
  mars:2, mar:2, march:2,
  avr:3, apr:3, avril:3, april:3,
  mai:4, may:4,
  juin:5, jun:5, june:5,
  juil:6, jul:6, juillet:6, july:6,
  aout:7, aug:7, août:7, august:7,
  sept:8, sep:8, septembre:8, september:8,
  oct:9, octobre:9, october:9,
  nov:10, novembre:10, november:10,
  dec:11, decembre:11, december:11
};
function stripAccents(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
// ── Ordres (historique d'ordres) : source des prix Stop Loss / Take Profit ──
function parseOrdersCSV(headers, rows) {
  const nh = headers.map(normHeaderCSV);
  function findCol(patterns) {
    for (const p of patterns) { const idx = nh.findIndex(h => h.indexOf(p) > -1); if (idx > -1) return idx; }
    return -1;
  }
  const col = {
    symbol: findCol(['symbole','symbol']),
    type: findCol(['type']),
    qty: findCol(['quantite','quantity']),
    limitPrice: findCol(['prixlimite','limitprice']),
    stopPrice: findCol(['prixdarret','prixarret','stopprice']),
    status: findCol(['statut','status']),
    closeTime: findCol(['heuredecloture','closetime']),
    orderId: findCol(['iddordre','orderid'])
  };
  if (col.orderId === -1) return [];
  return rows.map(r => ({
    symbol: col.symbol > -1 ? cleanSymbol(r[col.symbol]) : '',
    type: col.type > -1 ? (r[col.type]||'').trim() : '',
    qty: col.qty > -1 ? parseNumCSV(r[col.qty]) : null,
    limitPrice: col.limitPrice > -1 ? (parseNumCSV(r[col.limitPrice]) || null) : null,
    stopPrice: col.stopPrice > -1 ? (parseNumCSV(r[col.stopPrice]) || null) : null,
    status: col.status > -1 ? (r[col.status]||'').trim() : '',
    closeTime: col.closeTime > -1 ? (r[col.closeTime]||'').trim() : '',
    orderId: col.orderId > -1 ? (r[col.orderId]||'').trim() : ''
  })).filter(o => o.orderId);
}
function findBracketLevels(ordersLookup, orderId) {
  if (!orderId || !ordersLookup || !ordersLookup.length) return { slPrice: null, tpPrice: null };
  const order = ordersLookup.find(o => o.orderId === orderId);
  if (!order) return { slPrice: null, tpPrice: null };

  let slPrice = null, tpPrice = null;
  const ownType = order.type.toLowerCase();
  if (ownType.indexOf('stop') > -1 && order.stopPrice !== null) slPrice = order.stopPrice;
  if (ownType.indexOf('limit') > -1 && order.limitPrice !== null) tpPrice = order.limitPrice;

  if ((slPrice === null || tpPrice === null) && order.closeTime && order.symbol) {
    ordersLookup.forEach(s => {
      if (s.orderId === order.orderId) return;
      if (s.symbol !== order.symbol || s.closeTime !== order.closeTime) return;
      if (order.qty !== null && s.qty !== null && Math.abs(s.qty - order.qty) > 0.0001) return;
      const t = s.type.toLowerCase();
      if (slPrice === null && t.indexOf('stop') > -1 && s.stopPrice !== null) slPrice = s.stopPrice;
      if (tpPrice === null && t.indexOf('limit') > -1 && s.limitPrice !== null) tpPrice = s.limitPrice;
    });
  }
  return { slPrice, tpPrice };
}

function tryParseTVPairsForJournal(headers, rows, filename, ordersLookup) {
  const nh = headers.map(normHeaderCSV);
  function findCol(patterns) {
    for (const p of patterns) { const idx = nh.findIndex(h => h.indexOf(p) > -1); if (idx > -1) return idx; }
    return -1;
  }
  const col = {
    tradeNum: findCol(['numerodetrade','numrodetrade','tradenumber','trade']),
    type: findCol(['type']),
    date: findCol(['dateetheure','datetime','date']),
    pnl: findCol(['plnet','netpl','pnlnet']),
    signal: findCol(['signal']),
    mfe: findCol(['excursionfavorableusd','favorableusd','mfeusd']),
    mae: findCol(['excursionadverseusd','adverseusd','maeusd']),
    symbol: findCol(['symbole','symbol','ticker']),
    orderId: findCol(['iddelordre','orderid']),
    price: findCol(['prixusd','prixeur','prix','price'])
  };
  if (col.tradeNum === -1 || col.type === -1 || col.date === -1 || col.pnl === -1) return null;

  const groups = {};
  rows.forEach(r => {
    const key = (r[col.tradeNum] || '').trim();
    if (key === '') return;
    (groups[key] = groups[key] || []).push(r);
  });

  const symbolGuess = guessSymbolFromFilenameCSV(filename);
  const srcCcy = detectCcyFromHeader(headers[col.pnl]);
  const fx = fxForCcy(srcCcy);
  function extractDateTime(raw) {
    if (!raw) return { date:'', hour:null, time:'' };
    // ISO — "2025-12-30 08:18" or "2025-12-30T08:18"
    const m = raw.match(/(\d{4}-\d{2}-\d{2})[ T]?(\d{1,2}):(\d{2})?/);
    if (m) return { date: m[1], hour: parseInt(m[2],10), time: m[2].padStart(2,'0')+':'+(m[3]||'00') };
    // Locale jour-premier — "4 sept. 2026, 14:41" ou "4 September 2026, 14:41" (export FR ou EN, jour puis mois)
    const mf = raw.match(/(\d{1,2})\s+([a-zA-ZÀ-ÿ]+)\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
    if (mf) {
      const monthIdx = FR_MONTHS[stripAccents(mf[2].toLowerCase())];
      if (monthIdx !== undefined) {
        const day = mf[1].padStart(2,'0');
        const dateStr = mf[3] + '-' + String(monthIdx+1).padStart(2,'0') + '-' + day;
        const hour = parseInt(mf[4],10);
        return { date: dateStr, hour, time: mf[4].padStart(2,'0')+':'+mf[5] };
      }
    }
    // Locale mois-premier — "Sep 4, 2026, 2:41 PM" (export anglais, style TradingView US)
    const me = raw.match(/^([a-zA-ZÀ-ÿ]+)\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*([AaPp][Mm])?/);
    if (me) {
      const monthIdx = FR_MONTHS[stripAccents(me[1].toLowerCase())];
      if (monthIdx !== undefined) {
        const day = me[2].padStart(2,'0');
        const dateStr = me[3] + '-' + String(monthIdx+1).padStart(2,'0') + '-' + day;
        let hour = parseInt(me[4],10);
        const ampm = me[6] ? me[6].toLowerCase() : null;
        if (ampm === 'pm' && hour < 12) hour += 12;
        if (ampm === 'am' && hour === 12) hour = 0;
        return { date: dateStr, hour, time: String(hour).padStart(2,'0')+':'+me[5] };
      }
    }
    // Numérique — accepte /, - ou . comme séparateur (DD-MM-YYYY, DD.MM.YYYY…), lève l'ambiguïté jour/mois quand un des deux dépasse 12.
    // Ancré en début de chaîne : sans ça, une date ISO sans heure ("2026-09-01") serait mal réinterprétée en cherchant
    // un motif jour/mois plus loin dans la chaîne (ex: "26-09-01" trouvé à l'intérieur de "2026-09-01").
    const mn = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[ T]?(\d{1,2}):(\d{2}))?/);
    if (mn) {
      const a = parseInt(mn[1],10), b = parseInt(mn[2],10), yyyy = mn[3].length===2?'20'+mn[3]:mn[3];
      let day, month;
      if (a > 12 && b <= 12) { day = a; month = b; }
      else if (b > 12 && a <= 12) { day = b; month = a; }
      else { day = a; month = b; }   // ambigu (les deux ≤ 12) : jour-premier par défaut, convention la plus courante hors USA
      const dateStr = yyyy + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
      const hour = mn[4] !== undefined ? parseInt(mn[4],10) : null;
      return { date: dateStr, hour, time: hour !== null ? String(hour).padStart(2,'0')+':'+mn[5] : '' };
    }
    const m2 = raw.match(/(\d{4}-\d{2}-\d{2})/);
    if (m2) return { date: m2[1], hour:null, time:'' };
    return { date:'', hour:null, time:'' };
  }

  const out = [];
  Object.values(groups).forEach(group => {
    let entryRow = null, exitRow = null;
    group.forEach(r => {
      const tv = (r[col.type] || '').toLowerCase();
      if (tv.indexOf('entr') > -1) entryRow = r;
      else if (tv.indexOf('sort') > -1 || tv.indexOf('exit') > -1) exitRow = r;
    });
    const anyRow = entryRow || exitRow;
    if (!anyRow) return;
    const typeVal = ((entryRow||exitRow)[col.type] || '').toLowerCase();
    const dir = typeVal.indexOf('short') > -1 ? 'Short' : 'Long';

    const entryDT = entryRow ? extractDateTime(entryRow[col.date]) : { date:'',hour:null,time:'' };
    const exitDT = exitRow ? extractDateTime(exitRow[col.date]) : { date:'',hour:null,time:'' };
    const date = exitDT.date || entryDT.date;
    const pnlRaw = parseNumCSV(anyRow[col.pnl]) || 0;
    const res = pnlRaw > 0.000001 ? 'TP' : (pnlRaw < -0.000001 ? 'SL' : 'BE');
    const pnl = Math.round(pnlRaw * fx * 100) / 100;   // montant converti en € (fx = 1 si l'export est déjà en euros)
    // Real R if a risk€ is configured, otherwise the flat default (see settings).
    const rmSrc = computeRWithSource(pnl, res);
    const rMultiple = rmSrc.r;
    const mfe = col.mfe > -1 ? Math.abs(parseNumCSV(anyRow[col.mfe]) || 0) * fx : null;
    const mae = col.mae > -1 ? Math.abs(parseNumCSV(anyRow[col.mae]) || 0) * fx : null;
    const rowSymbol = col.symbol > -1 ? cleanSymbol(anyRow[col.symbol]) : '';
    const asset = rowSymbol || symbolGuess;
    const entryOrderId = (col.orderId > -1 && entryRow) ? (entryRow[col.orderId]||'').trim() : '';
    const exitOrderId = (col.orderId > -1 && exitRow) ? (exitRow[col.orderId]||'').trim() : '';
    const tvKey = (entryOrderId || exitOrderId) ? `${asset}|${entryOrderId}|${exitOrderId}` : '';
    const entryPrice = (col.price > -1 && entryRow) ? (parseNumCSV(entryRow[col.price]) || null) : null;
    const exitPrice = (col.price > -1 && exitRow) ? (parseNumCSV(exitRow[col.price]) || null) : null;
    const levels = findBracketLevels(ordersLookup, exitOrderId || entryOrderId);
    // Prix disponibles (entrée + SL trouvé dans l'historique d'ordres + sortie réelle) → R exact par distance.
    // Garde-fou : l'export TradingView ne donne que le prix FINAL de chaque ordre, pas son historique de
    // modifications — si le stop a été remonté au break-even en cours de trade, la distance ici ne reflète plus
    // le risque initial et donnerait un R absurde. Un R au-delà d'un seuil réaliste est donc écarté.
    const DISTANCE_R_PLAUSIBLE_MAX = 15;
    const rawDistR = computeDistanceR(entryPrice, levels.slPrice, exitPrice, dir);
    const distRPlausible = rawDistR !== null && Math.abs(rawDistR) <= DISTANCE_R_PLAUSIBLE_MAX;
    const finalR = distRPlausible ? rawDistR : rMultiple;
    const finalSlPrice = distRPlausible ? levels.slPrice : null;

    out.push({
      id: Date.now() + Math.floor(Math.random()*100000),
      date, asset, tf: '', dir, session: sessionFromHour(entryDT.hour),
      entry: entryDT.time, exit: exitDT.time, emotion: null,
      res, rr: finalR, pnl: finalR, rSrc: distRPlausible ? 'prix' : rmSrc.src, pnlEur: pnl, ccy: srcCcy || '', fxRate: fx, size: null, cap: '',
      mfe, mae, tvKey, entryPrice, slPrice: finalSlPrice, tpPrice: levels.tpPrice, exitPrice,
      desc: (() => {
        if (!entryRow || col.signal === -1) return '';
        const s = (entryRow[col.signal] || '').trim();
        return /^\d+$/.test(s) ? '' : s;
      })()
    });
  });
  return out;
}

// Best-effort fallback for a plain one-row-per-trade CSV.
function tryGenericSingleRowImport(headers, rows) {
  const nh = headers.map(normHeaderCSV);
  function findCol(patterns) {
    for (const p of patterns) { const idx = nh.findIndex(h => h.indexOf(p) > -1); if (idx > -1) return idx; }
    return -1;
  }
  const col = {
    date: findCol(['date']),
    asset: findCol(['asset','symbol','symbole','actif','instrument','pair']),
    dir: findCol(['direction','side','sens']),
    res: findCol(['result','resultat']),
    rr: findCol(['rr','riskreward']),
    pnleur: findCol(['pnleur','profiteur','gaineur','pnlnet','netpnl','pnleuros']),
    pnl: findCol(['pnlr','rmultiple','pnlinr','resultr','rrealise'])
  };
  // Colonne « pnl / profit / net » sans unité : si une colonne en € existe déjà, celle-ci est du R ;
  // sinon on décide sur les valeurs (un R dépasse rarement ±20, un montant en € oui). Avant, « pnl_eur » était lue à la fois comme € ET comme R.
  const ambIdx = nh.findIndex((h, i) => i !== col.pnleur && i !== col.rr && /^(pnl|profit|net|gain|gains|pl)$/.test(h));
  if (col.pnl === -1 && ambIdx > -1) {
    if (col.pnleur > -1) col.pnl = ambIdx;
    else {
      const vals = rows.map(r => parseNumCSV(r[ambIdx])).filter(v => !isNaN(v));
      if (vals.some(v => Math.abs(v) > 20)) col.pnleur = ambIdx; else col.pnl = ambIdx;
    }
  }
  if (col.date === -1) return null;
  if (col.pnl === -1 && col.pnleur === -1 && col.res === -1) return null;
  const srcCcy = col.pnleur > -1 ? detectCcyFromHeader(headers[col.pnleur]) : '';
  const fx = fxForCcy(srcCcy);

  const out = [];
  rows.forEach(r => {
    let date = (r[col.date] || '').trim();
    if (!date) return;
    // ISO en premier ("2026-09-01") — sinon le motif jour/mois numérique ci-dessous la confondrait avec une date D-M-Y à tirets.
    const isoM = date.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoM) {
      date = isoM[0];
    } else {
      // Numérique, séparateur / ou . (le tiret est réservé à l'ISO ci-dessus) : lève l'ambiguïté jour/mois si l'un des deux dépasse 12.
      const m = date.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{2,4})/);
      if (m) {
        const a = parseInt(m[1],10), b = parseInt(m[2],10), yyyy = m[3].length===2?'20'+m[3]:m[3];
        let day, month;
        if (a > 12 && b <= 12) { day = a; month = b; }
        else if (b > 12 && a <= 12) { day = b; month = a; }
        else { day = a; month = b; }
        date = `${yyyy}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      } else {
        // DD-MM-YYYY à tirets (distingué de l'ISO par l'ordre des groupes : jour/mois à 1-2 chiffres en tête).
        const mDash = date.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
        if (mDash) {
          const a = parseInt(mDash[1],10), b = parseInt(mDash[2],10), yyyy = mDash[3].length===2?'20'+mDash[3]:mDash[3];
          let day, month;
          if (a > 12 && b <= 12) { day = a; month = b; }
          else if (b > 12 && a <= 12) { day = b; month = a; }
          else { day = a; month = b; }
          date = `${yyyy}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        } else {
          // Mois en toutes lettres (FR ou EN) : "5 Jan 2026" / "Jan 5, 2026" / "5 janvier 2026"
          const md = date.match(/(\d{1,2})\s+([a-zA-ZÀ-ÿ]+)\.?,?\s+(\d{4})/) || date.match(/([a-zA-ZÀ-ÿ]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
          if (md) {
            const dayFirst = /^\d/.test(md[1]);
            const monthIdx = FR_MONTHS[stripAccents((dayFirst ? md[2] : md[1]).toLowerCase())];
            if (monthIdx !== undefined) {
              const day = (dayFirst ? md[1] : md[2]).padStart(2,'0');
              date = md[3] + '-' + String(monthIdx+1).padStart(2,'0') + '-' + day;
            }
          }
        }
      }
    }

    const asset = col.asset > -1 ? (r[col.asset]||'').trim() : '';
    let dir = col.dir > -1 ? (r[col.dir]||'').trim() : '';
    dir = /short|sell|vente/i.test(dir) ? 'Short' : (dir ? 'Long' : '');
    let res = col.res > -1 ? (r[col.res]||'').trim().toUpperCase() : '';
    let pnlEur = col.pnleur > -1 ? parseNumCSV(r[col.pnleur]) : null;
    let pnl = col.pnl > -1 ? parseNumCSV(r[col.pnl]) : null;
    if (pnlEur !== null && isNaN(pnlEur)) pnlEur = null;
    if (pnlEur !== null) pnlEur = Math.round(pnlEur * fx * 100) / 100;
    if (pnl !== null && isNaN(pnl)) pnl = null;
    if (!res) {
      const ref = (pnlEur !== null) ? pnlEur : pnl;
      if (ref !== null) res = ref > 0.000001 ? 'TP' : (ref < -0.000001 ? 'SL' : 'BE');
    } else if (!['TP','SL','BE','OPEN'].includes(res)) {
      if (/WIN|GAIN|TP/.test(res)) res = 'TP';
      else if (/LOSS|PERTE|SL/.test(res)) res = 'SL';
      else if (/BE|BREAKEVEN|EQUILIBRE/.test(res)) res = 'BE';
      else res = '';
    }
    if (!res) return;
    let rr = col.rr > -1 ? parseNumCSV(r[col.rr]) : null;
    if (rr !== null && isNaN(rr)) rr = null;
    // No R value in the file (neither an rr column nor a pnl-in-R column) → real R from risk€, or flat default.
    let rSrc = (pnl !== null || rr !== null) ? 'manuel' : undefined;
    if (pnl === null && rr === null) {
      const cr = computeRWithSource(pnlEur, res); pnl = cr.r; rSrc = cr.src;
      if (rr === null) rr = pnl;
    }

    out.push({
      id: Date.now() + Math.floor(Math.random()*100000),
      date, asset, tf:'', dir, session:'', entry:'', exit:'', emotion:null,
      res, rr, pnl, rSrc, pnlEur, ccy: srcCcy || '', fxRate: fx, size:null, cap:'', desc:''
    });
  });
  return out;
}

function fixMissingRR() {
  let fixed = 0;
  const before = JSON.stringify(trades);
  trades.forEach(t => {
    if ((t.pnl === null || t.pnl === undefined) && ['TP','SL','BE'].includes(t.res)) {
      const cr = computeRWithSource(t.pnlEur, t.res, { entryPrice: t.entryPrice, slPrice: t.slPrice, exitPrice: t.exitPrice, dir: t.dir });
      t.pnl = cr.r; t.rSrc = cr.src;
      if (t.rr === null || t.rr === undefined) t.rr = t.pnl;
      fixed++;
    }
  });
  if (fixed > 0) {
    if (!save()) { trades = JSON.parse(before); return; }
    renderAll();
    showToast(fixed + ' trade(s) corrigé(s) ✓', 'success');
  } else {
    showToast('Aucun trade à corriger — tout est déjà à jour');
  }
}

function fixImplausibleDistanceR() {
  const DISTANCE_R_PLAUSIBLE_MAX = 15;
  let fixed = 0;
  const before = JSON.stringify(trades);
  trades.forEach(t => {
    if (t.pnl === null || t.pnl === undefined || Math.abs(t.pnl) <= DISTANCE_R_PLAUSIBLE_MAX) return;
    if (t.entryPrice === null || t.entryPrice === undefined || t.slPrice === null || t.slPrice === undefined) return;
    const cr = computeRWithSource(t.pnlEur, t.res);
    t.pnl = cr.r; t.rr = cr.r; t.rSrc = cr.src;
    t.slPrice = null;
    fixed++;
  });
  if (fixed > 0) {
    if (!save()) { trades = JSON.parse(before); return; }
    renderAll();
    showToast(fixed + ' trade(s) corrigé(s) (R invraisemblable détecté) ✓', 'success');
  } else {
    showToast('Aucun trade avec un R invraisemblable détecté');
  }
}

const SEED_ASSETS = ['EUR/USD','GBP/USD','USD/JPY','GBP/JPY','EUR/JPY','XAU/USD','DAX 40','CAC 40','NAS 100','SP 500'];
function getDiscoveredAssets() {
  const fromTrades = trades.map(t => t.asset).filter(Boolean);
  const discovered = Array.from(new Set(fromTrades)).filter(a => !SEED_ASSETS.includes(a));
  discovered.sort();
  return discovered;
}
function refreshAssetDropdowns() {
  const discovered = getDiscoveredAssets();
  const allAssets = [...SEED_ASSETS, ...discovered].sort();

  ['filter-asset', 'cal-filter-asset'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const current = el.value;
    el.innerHTML = '<option value="">Tous les assets</option>' + allAssets.map(a => `<option${a===current?' selected':''}>${esc(a)}</option>`).join('');
  });

  const fAsset = document.getElementById('f-asset');
  if (fAsset && discovered.length) {
    const existingExtra = fAsset.querySelector('optgroup[data-discovered]');
    if (existingExtra) existingExtra.remove();
    const og = document.createElement('optgroup');
    og.label = "Découverts à l'import";
    og.setAttribute('data-discovered', '1');
    og.innerHTML = discovered.map(a => `<option>${esc(a)}</option>`).join('');
    fAsset.appendChild(og);
  }
}

function classifyImportFile(filename) {
  const f = filename.toLowerCase();
  if (f.indexOf('ordre') > -1 || f.indexOf('order') > -1) return 'orders';
  if (f.indexOf('solde') > -1 || f.indexOf('balance') > -1) return 'balance';
  if (f.indexOf('activit') > -1 || f.indexOf('activity') > -1) return 'activity';
  if (f.indexOf('position') > -1) return 'positions';
  return 'trades';
}
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function handleCsvImport(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  const statusEl = document.getElementById('csv-import-status');
  if (statusEl) statusEl.textContent = `Lecture de ${files.length} fichier(s)…`;

  // Lecture de tous les fichiers d'abord, pour pouvoir construire la table
  // des ordres (SL/TP) avant de traiter les fichiers de trades, quel que soit l'ordre de sélection.
  const fileData = [];
  for (const file of files) {
    try {
      const text = await readFileAsText(file);
      const rows = parseCSVGeneric(text);
      fileData.push({ name: file.name, rows });
    } catch {
      fileData.push({ name: file.name, rows: null });
    }
  }

  let ordersLookup = [];
  fileData.forEach(fd => {
    if (!fd.rows || fd.rows.length < 2) return;
    if (classifyImportFile(fd.name) !== 'orders') return;
    const parsed = parseOrdersCSV(fd.rows[0], fd.rows.slice(1));
    if (parsed && parsed.length) ordersLookup = ordersLookup.concat(parsed);
  });

  function syntheticTradeKey(t) {
  // Montant d'origine (avant conversion de devise) : un changement de taux ne doit pas faire passer un doublon pour un nouveau trade.
  const amt = (t.pnlEur !== null && t.pnlEur !== undefined) ? t.pnlEur / (t.fxRate || 1) : t.pnl;
  return [t.date||'', (t.asset||'').toLowerCase(), t.res||'', t.entry||'', (amt===null||amt===undefined||isNaN(amt))?'':Number(amt).toFixed(2)].join('|');
}
const existingKeys = new Set(trades.map(t => t.tvKey).filter(Boolean));
const existingSynthKeys = new Set(trades.filter(t => !t.tvKey).map(syntheticTradeKey));
  const allNew = [];
  let dupCount = 0, tradesFilesCount = 0, secondaryFilesCount = 0, emptyFilesCount = 0, slEnrichedCount = 0, unconvertedCount = 0, foreignCcy = '';

  fileData.forEach(fd => {
    if (!fd.rows || fd.rows.length < 2) { emptyFilesCount++; return; }
    const headers = fd.rows[0];
    const dataRows = fd.rows.slice(1);
    const kind = classifyImportFile(fd.name);

    if (kind === 'orders' || kind === 'balance' || kind === 'activity' || kind === 'positions') {
      secondaryFilesCount++;
      return;
    }

    let imported = tryParseTVPairsForJournal(headers, dataRows, fd.name, ordersLookup);
    if (!imported || imported.length === 0) imported = tryGenericSingleRowImport(headers, dataRows);
    if (!imported || imported.length === 0) return;

    tradesFilesCount++;
    imported.forEach(t => {
      if (t.tvKey) {
        if (existingKeys.has(t.tvKey)) { dupCount++; return; }
        existingKeys.add(t.tvKey);
      } else {
        const sk = syntheticTradeKey(t);
        if (existingSynthKeys.has(sk)) { dupCount++; return; }
        existingSynthKeys.add(sk);
      }
      if (t.slPrice !== null && t.slPrice !== undefined) slEnrichedCount++;
      if (t.ccy && t.ccy !== 'EUR' && t.fxRate === 1) { unconvertedCount++; foreignCcy = t.ccy; }
      allNew.push(t);
    });
  });

  input.value = '';

  if (allNew.length === 0) {
    let msg;
    if (dupCount > 0) msg = `Rien de nouveau — ${dupCount} trade(s) déjà présent(s), ignoré(s) (pas de doublon).`;
    else if (tradesFilesCount === 0) msg = `Aucun fichier de trades reconnu parmi les ${files.length} fichier(s) sélectionné(s).`;
    else msg = `Aucun trade importé.`;
    if (statusEl) statusEl.textContent = msg;
    showToast(msg, tradesFilesCount === 0 && dupCount === 0 ? 'error' : 'success');
    return;
  }

  const prevTrades = trades.slice();
  createSafetySnapshot('avant import CSV');
  trades = trades.concat(sanitizeTrades(allNew));
  sortTradesChrono();
  if (!save()) {
    trades = prevTrades;
    const m = 'Import annulé : stockage plein — aucun trade ajouté. Libère de la place puis recommence.';
    if (statusEl) statusEl.textContent = m;
    showToast(m, 'error');
    return;
  }
  DB.setItem((JP + 'last_csv_import'), Date.now());
  sessionStorage.removeItem((JP + 'import_reminder_dismissed'));
  renderAll();
  refreshAssetDropdowns();

  const parts = [`${allNew.length} nouveau(x) trade(s) importé(s)`];
  if (slEnrichedCount > 0) parts.push(`${slEnrichedCount} avec R exact (SL retrouvé dans l'historique d'ordres)`);
  if (dupCount > 0) parts.push(`${dupCount} doublon(s) ignoré(s)`);
  if (secondaryFilesCount > 0) parts.push(`${secondaryFilesCount} fichier(s) secondaire(s) reconnu(s) (ordres/solde/activité/positions)`);
  if (emptyFilesCount > 0) parts.push(`${emptyFilesCount} fichier(s) vide(s) ignoré(s)`);
  if (unconvertedCount > 0) parts.push(`⚠️ ${unconvertedCount} montant(s) en ${foreignCcy} importé(s) SANS conversion (taux = 1) — règle le taux ci-dessous puis clique « Appliquer ce taux aux trades déjà importés »`);
  const msg = parts.join(' · ');
  if (statusEl) statusEl.textContent = msg;
  showToast(allNew.length + ' trade(s) importés ✓', 'success');
}

