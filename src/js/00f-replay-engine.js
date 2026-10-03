// ── REPLAY (BACKTEST) : MOTEUR ───────────────────────────────────────
// Calculs purs, sans interface : taille de position, ordres, déclenchement des stops / objectifs bougie par bougie,
// clôtures partielles, frais, MAE / MFE et conversion en trade du journal. Testé à part (tests/unit/replay.test.mjs).
// Prix et montants dans la devise de cotation de l'actif (USDT pour la crypto) ; conversion en € à l'enregistrement.

// Arrondi d'une quantité au pas de l'actif (vers le bas : on ne dépasse jamais le risque voulu).
function rpFloorStep(qty, step) {
  if (!(step > 0)) return qty;
  const d = Math.max(0, Math.round(-Math.log10(step)));
  return +(Math.floor(qty / step + 1e-9) * step).toFixed(d);
}
// Pas de quantité raisonnable selon le prix (BTC à 60 000 → 0,0001 ; un actif à 0,5 → 1).
function rpQtyStep(price) {
  if (!(price > 0)) return 0.001;
  if (price >= 10000) return 0.0001;
  if (price >= 1000) return 0.001;
  if (price >= 100) return 0.01;
  if (price >= 1) return 0.1;
  return 1;
}

// Calculateur de position : risque (% du solde ou montant) ÷ distance au stop = quantité.
// Renvoie aussi la valeur de la position, l'effet de levier nécessaire, le gain visé et le RR.
function rpSizePosition(o) {
  const entry = +o.entry, sl = +o.sl, tp = o.tp != null && o.tp !== '' ? +o.tp : null, balance = +o.balance || 0;
  const dist = Math.abs(entry - sl);
  if (!(entry > 0) || !(sl > 0) || !(dist > 0)) return { error: 'stop' };
  const side = o.side === 'short' ? 'short' : 'long';
  if ((side === 'long' && sl >= entry) || (side === 'short' && sl <= entry)) return { error: 'side' };
  const riskAmt = o.riskMode === 'amount' ? +o.riskValue : balance * (+o.riskValue) / 100;
  let qty = o.qty != null && o.qty !== '' && +o.qty > 0 ? +o.qty : riskAmt / dist;
  qty = rpFloorStep(qty, o.qtyStep != null ? o.qtyStep : rpQtyStep(entry));
  if (!(qty > 0)) return { error: 'qty' };
  const realRisk = qty * dist, notional = qty * entry;
  let reward = null, rr = null;
  if (tp != null && tp > 0) {
    const ok = side === 'long' ? tp > entry : tp < entry;
    if (ok) { reward = qty * Math.abs(tp - entry); rr = Math.abs(tp - entry) / dist; }
  }
  return { side, qty, risk: realRisk, riskPct: balance > 0 ? realRisk / balance * 100 : null, distance: dist,
    distancePct: dist / entry * 100, notional, leverage: balance > 0 ? notional / balance : null, reward, rr };
}

function rpPnl(side, entry, exit, qty) { return (exit - entry) * qty * (side === 'short' ? -1 : 1); }

// Nouvelle position (ordre au marché ou ordre en attente exécuté).
function rpOpenPosition(o) {
  const fee = (o.feeRate || 0) * o.qty * o.price;
  return { id: o.id, side: o.side, qty: o.qty, qty0: o.qty, entry: o.price, sl: o.sl ?? null, sl0: o.sl ?? null, tp: o.tp ?? null,
    openTime: o.time, setup: o.setup || '', fees: fee, realized: 0, fills: [], mfe: 0, mae: 0,
    risk0: o.sl != null ? Math.abs(o.price - o.sl) * o.qty : null };
}
// Clôture (totale ou partielle) d'une position à un prix donné.
function rpClose(pos, price, time, reason, qty, feeRate) {
  const q = Math.min(pos.qty, qty == null ? pos.qty : qty);
  if (!(q > 0)) return pos;
  const pnl = rpPnl(pos.side, pos.entry, price, q), fee = (feeRate || 0) * q * price;
  pos.fills.push({ qty: q, price, time, reason, pnl });
  pos.realized += pnl;
  pos.fees += fee;
  pos.qty = +(pos.qty - q).toFixed(10);
  if (pos.qty <= 1e-12) { pos.qty = 0; pos.closeTime = time; pos.closeReason = reason; }
  return pos;
}
function rpIsClosed(pos) { return pos.qty <= 0; }
function rpExitPrice(pos) {
  const q = pos.fills.reduce((s, f) => s + f.qty, 0);
  return q > 0 ? pos.fills.reduce((s, f) => s + f.qty * f.price, 0) / q : null;
}

// Fait avancer une bougie : ordres en attente exécutés, puis stops / objectifs des positions.
// Si le stop ET l'objectif sont touchés dans la même bougie, on retient le stop (hypothèse prudente).
// Un écart à l'ouverture (gap) au-delà du stop est exécuté au prix d'ouverture.
function rpStepCandle(state, c, opts) {
  const feeRate = (opts && opts.feeRate) || 0, events = [];
  // 1) Ordres en attente
  const still = [];
  state.orders.forEach(o => {
    let fill = null;
    if (o.type === 'limit') {
      if (o.side === 'long' && c.low <= o.price) fill = Math.min(o.price, c.open);
      if (o.side === 'short' && c.high >= o.price) fill = Math.max(o.price, c.open);
    } else if (o.type === 'stop') {
      if (o.side === 'long' && c.high >= o.price) fill = Math.max(o.price, c.open);
      if (o.side === 'short' && c.low <= o.price) fill = Math.min(o.price, c.open);
    }
    if (fill == null) { still.push(o); return; }
    const pos = rpOpenPosition({ id: o.id, side: o.side, qty: o.qty, price: fill, sl: o.sl, tp: o.tp, time: c.time, setup: o.setup, feeRate });
    state.positions.push(pos);
    events.push({ type: 'fill', pos, order: o });
  });
  state.orders = still;
  // 2) Positions ouvertes
  state.positions.forEach(p => {
    if (rpIsClosed(p)) return;
    const long = p.side !== 'short';
    let hit = null, px = null;
    const slHit = p.sl != null && (long ? c.low <= p.sl : c.high >= p.sl);
    const tpHit = p.tp != null && (long ? c.high >= p.tp : c.low <= p.tp);
    if (slHit) { hit = 'sl'; px = long ? Math.min(p.sl, c.open) : Math.max(p.sl, c.open); }
    else if (tpHit) { hit = 'tp'; px = long ? Math.max(p.tp, c.open) : Math.min(p.tp, c.open); }
    // Excursions (en devise de cotation, pour la quantité initiale) jusqu'à la sortie, sans dépasser le prix de sortie.
    let fav = long ? c.high - p.entry : p.entry - c.low, adv = long ? p.entry - c.low : c.high - p.entry;
    if (hit === 'sl') adv = Math.abs(p.entry - px);
    if (hit === 'tp') fav = Math.abs(px - p.entry);
    p.mfe = Math.max(p.mfe, Math.max(0, fav) * p.qty0);
    p.mae = Math.max(p.mae, Math.max(0, adv) * p.qty0);
    if (hit) { rpClose(p, px, c.time, hit, null, feeRate); events.push({ type: 'close', pos: p, reason: hit }); }
  });
  return events;
}
// Résultat latent d'une position au prix donné.
function rpOpenPnl(pos, price) { return rpPnl(pos.side, pos.entry, price, pos.qty); }

// Conversion d'une position clôturée en trade du journal (R calculé depuis le risque initial, frais déduits).
function rpToJournalTrade(pos, ctx) {
  const fx = ctx.fx || 1, tzDate = t => { const d = new Date(t * 1000); return d; };
  const pad = n => String(n).padStart(2, '0');
  const dOpen = tzDate(pos.openTime), dClose = tzDate(pos.closeTime || pos.openTime);
  const net = pos.realized - pos.fees;
  const R = pos.risk0 > 0 ? net / pos.risk0 : null;
  const exit = rpExitPrice(pos);
  const res = R == null ? (net > 0 ? 'TP' : net < 0 ? 'SL' : 'BE') : (Math.abs(R) < 0.1 ? 'BE' : R > 0 ? 'TP' : 'SL');
  return {
    date: dOpen.getFullYear() + '-' + pad(dOpen.getMonth() + 1) + '-' + pad(dOpen.getDate()),
    entry: pad(dOpen.getHours()) + ':' + pad(dOpen.getMinutes()),
    exit: pad(dClose.getHours()) + ':' + pad(dClose.getMinutes()),
    asset: ctx.asset, dir: pos.side === 'short' ? 'Short' : 'Long', tf: ctx.tf || '', setup: pos.setup || '',
    res, pnl: R != null ? Math.round(R * 100) / 100 : null, rSrc: R != null ? 'prix' : 'manuel',
    rr: pos.sl0 != null && pos.tp != null ? Math.round(Math.abs(pos.tp - pos.entry) / Math.abs(pos.entry - pos.sl0) * 100) / 100 : null,
    pnlEur: Math.round(net * fx * 100) / 100, fees: Math.round(pos.fees * fx * 100) / 100,
    entryPrice: pos.entry, slPrice: pos.sl0, tpPrice: pos.tp, exitPrice: exit != null ? +exit.toPrecision(10) : null,
    size: pos.qty0, mfe: Math.round(pos.mfe * fx * 100) / 100, mae: Math.round(pos.mae * fx * 100) / 100,
    importSource: 'Replay', tvKey: 'replay:' + pos.id, desc: ctx.desc || ''
  };
}

// Regroupement de bougies (unité de temps supérieure) pour un historique importé.
function rpResample(candles, seconds) {
  const out = [];
  candles.forEach(c => {
    const t = Math.floor(c.time / seconds) * seconds, last = out[out.length - 1];
    if (last && last.time === t) { last.high = Math.max(last.high, c.high); last.low = Math.min(last.low, c.low); last.close = c.close; last.volume = (last.volume || 0) + (c.volume || 0); }
    else out.push({ time: t, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 });
  });
  return out;
}
