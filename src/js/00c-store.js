// ── DONNÉES : point d'entrée unique ─────────────────────────────────────
// Toute modification des trades passe par TradeStore (ajout, modification, suppression, import, modification en lot) :
// le jour de la synchronisation, elle se branche ici et nulle part ailleurs (TradeStore.onChange).
// Modèle d'un trade, prêt pour la synchronisation entre appareils :
//   - id        : identifiant LOCAL (numérique, utilisé par l'interface) ;
//   - uid       : identifiant UNIVERSEL, identique sur tous les appareils ;
//   - createdAt / updatedAt : dates (ms) pour savoir quelle version d'un trade est la plus récente ;
//   - imgs      : références des captures, rangées à part dans le magasin d'images (ImageStore).
// Une suppression laisse une trace (« tombstone » : uid + date) pour qu'un autre appareil ne recrée pas le trade.

function newUid() {
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
}
function newLocalTradeId() {
  const used = new Set(trades.map(t => t.id));
  let id = Date.now();
  while (used.has(id)) id++;
  return id;
}

// ── Captures : une entrée par image, le trade ne garde que les références ──
const ImageStore = {
  key(id) { return JP + 'img_' + id; },
  get(id) { return safeImgSrc(DB.getItem(this.key(id)) || ''); },
  put(dataUrl) {
    const src = safeImgSrc(dataUrl);
    if (!src) return null;
    const id = 'i' + newUid().replace(/[^0-9a-z]/gi, '').slice(0, 20).toLowerCase();
    DB.setItem(this.key(id), src);   // peut lever une erreur « stockage plein » : l'appelant annule
    return id;
  },
  replace(id, dataUrl) { const src = safeImgSrc(dataUrl); if (src) DB.setItem(this.key(id), src); },
  remove(id) { DB.removeItem(this.key(id)); },
  allIds() { const p = JP + 'img_'; return DB.keys().filter(k => k.indexOf(p) === 0).map(k => k.slice(p.length)); }
};
function tradeImages(t) { return (t && Array.isArray(t.imgs) ? t.imgs : []).map(id => ImageStore.get(id)).filter(Boolean); }

// Ancien format (captures dans le trade : cap + caps, la première souvent en double) → magasin d'images.
// Les images données à part (backup récent : { idImage: dataUrl }) sont rangées sous le même identifiant.
function externalizeTradeImages(t, imagesById) {
  const ids = [];
  (t.imgs || []).forEach(id => { if (imagesById && imagesById[id] && safeImgSrc(imagesById[id])) DB.setItem(ImageStore.key(id), imagesById[id]); if (ImageStore.get(id)) ids.push(id); });
  const legacy = [t.cap].concat(Array.isArray(t.caps) ? t.caps : []).map(safeImgSrc).filter(Boolean);
  [...new Set(legacy)].forEach(src => { if (ids.length < 8) { const id = ImageStore.put(src); if (id) ids.push(id); } });
  t.imgs = ids;
  delete t.cap; delete t.caps;
  return t;
}
// Trade complet pour un export / la corbeille : les captures sont recopiées dans le trade (_images).
function tradeWithImages(t) { return Object.assign({}, t, { _images: tradeImages(t) }); }
function imagesOf(list) { const out = {}; list.forEach(t => (t.imgs || []).forEach(id => { const src = ImageStore.get(id); if (src) out[id] = src; })); return out; }

// Prépare un trade venant de l'extérieur (formulaire, import, backup, corbeille) pour le journal.
function prepareIncomingTrade(raw, imagesById, now) {
  const t = sanitizeTrade(raw);
  if (!t) return null;
  const inline = Array.isArray(raw && raw._images) ? raw._images : null;
  if (inline) {
    // Captures fournies telles quelles (formulaire, corbeille) : rangées une par une, sans dédoublonnage.
    t.imgs = []; delete t.cap; delete t.caps;
    inline.map(safeImgSrc).filter(Boolean).slice(0, 8).forEach(src => { const id = ImageStore.put(src); if (id) t.imgs.push(id); });
  } else externalizeTradeImages(t, imagesById);
  if (!t.uid) t.uid = newUid();
  now = now || Date.now();
  if (!t.createdAt) t.createdAt = (t.id > 1e12 && t.id < now + 864e5) ? Math.floor(t.id) : now;
  if (!t.updatedAt) t.updatedAt = t.createdAt;
  delete t._images;
  return t;
}

const TradeStore = (() => {
  const listeners = [];
  const TOMB_KEY = () => JP + 'tombstones';
  function emit(type, list) {
    const info = { type, uids: (list || []).map(t => t && t.uid).filter(Boolean) };
    listeners.forEach(fn => { try { fn(info); } catch (e) { console.error(e); } });
  }
  function tombstones() { try { const a = JSON.parse(DB.getItem(TOMB_KEY()) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function addTombstones(list) {
    if (!list.length) return;
    const now = Date.now(), all = tombstones().concat(list.filter(t => t.uid).map(t => ({ uid: t.uid, deletedAt: now })));
    try { DB.setItem(TOMB_KEY(), JSON.stringify(all.slice(-20000))); } catch (e) { console.error(e); }
  }
  // Applique une modification ; si l'enregistrement échoue (stockage plein), tout revient comme avant.
  function commit(prev, type, list, cleanup) {
    sortTradesChrono();
    if (!save()) { trades = prev; invalidateViews(); return false; }
    if (cleanup) cleanup();
    emit(type, list);
    return true;
  }
  function removeImages(ids) { ids.forEach(id => ImageStore.remove(id)); }
  function referencedImages() { const s = playbookImageIds(); trades.forEach(t => (t.imgs || []).forEach(id => s.add(id))); return s; }

  return {
    onChange(fn) { listeners.push(fn); },
    tombstones,
    // Ajoute un trade (champs du formulaire, captures en data URL dans images).
    add(fields, images) {
      const prev = trades.slice();
      let t;
      try { t = prepareIncomingTrade(Object.assign({}, fields, { id: newLocalTradeId(), uid: '', createdAt: 0, updatedAt: 0, imgs: [], _images: images || [] })); }
      catch (e) { reportStorageError(e); return null; }
      if (!t) return null;
      trades.unshift(t);
      if (!commit(prev, 'add', [t])) { removeImages(t.imgs); return null; }
      return t;
    },
    // Ajoute plusieurs trades (import CSV, saisie rapide) ; renvoie les trades ajoutés ou null.
    addMany(list, imagesById) {
      const prev = trades.slice(), now = Date.now(), added = [];
      try {
        list.forEach(raw => {
          const t = prepareIncomingTrade(Object.assign({}, raw, { id: newLocalTradeId() }), imagesById, now);
          if (t) { trades.push(t); added.push(t); }
        });
      } catch (e) { reportStorageError(e); trades = prev; return null; }
      if (!commit(prev, 'add', added, () => {
        const back = new Set(added.map(t => t.uid)), tomb = tombstones();
        if (tomb.some(x => back.has(x.uid))) { added.forEach(t => { t.updatedAt = now; }); save(); try { DB.setItem(TOMB_KEY(), JSON.stringify(tomb.filter(x => !back.has(x.uid)))); } catch (e) {} }
      })) { added.forEach(t => removeImages(t.imgs)); return null; }
      return added;
    },
    // Modifie un trade ; images (facultatif) = nouvelle liste complète de captures en data URL.
    update(id, patch, images) {
      const idx = trades.findIndex(t => t.id === id);
      if (idx === -1) return null;
      const prev = trades.slice(), old = trades[idx];
      const next = Object.assign({}, old, patch, { id: old.id, uid: old.uid, createdAt: old.createdAt, updatedAt: Date.now() });
      let newIds = [];
      if (images) {
        try {
          const keep = new Map(old.imgs.map(i => [ImageStore.get(i), i]));
          next.imgs = images.map(safeImgSrc).filter(Boolean).slice(0, 8).map(src => keep.get(src) || (() => { const n = ImageStore.put(src); newIds.push(n); return n; })()).filter(Boolean);
        } catch (e) { reportStorageError(e); removeImages(newIds); return null; }
      }
      trades[idx] = next;
      const dropped = images ? old.imgs.filter(i => !next.imgs.includes(i)) : [];
      if (!commit(prev, 'update', [next], () => removeImages(dropped))) { removeImages(newIds); return null; }
      return next;
    },
    // Remplace une capture (annotation) sans changer les autres.
    replaceImage(id, index, dataUrl) {
      const t = trades.find(x => x.id === id);
      if (!t || !t.imgs[index]) return false;
      const before = ImageStore.get(t.imgs[index]);
      try { ImageStore.replace(t.imgs[index], dataUrl); } catch (e) { reportStorageError(e); return false; }
      return this.update(id, {}) ? true : (ImageStore.replace(t.imgs[index], before), false);
    },
    // Supprime des trades : trace de suppression + captures retirées (sauf si on les garde pour la corbeille).
    remove(ids, keepImages, opts) {
      const set = new Set(ids), prev = trades.slice();
      const gone = trades.filter(t => set.has(t.id));
      if (!gone.length) return [];
      trades = trades.filter(t => !set.has(t.id));
      if (!commit(prev, 'remove', gone, () => { if (!(opts && opts.noTrace)) addTombstones(gone); if (!keepImages) removeImages(gone.flatMap(t => t.imgs)); })) return null;
      return gone;
    },
    // Remplace tout le journal (backup, restauration) ; les traces de suppression des trades disparus sont ajoutées.
    replaceAll(list, imagesById) {
      const prev = trades.slice(), now = Date.now();
      let next;
      try { next = list.map(raw => prepareIncomingTrade(raw, imagesById, now)).filter(Boolean); }
      catch (e) { reportStorageError(e); return false; }
      const seen = new Set(), used = new Set();
      next = next.filter(t => { if (seen.has(t.uid)) return false; seen.add(t.uid); return true; });
      next.forEach(t => { while (used.has(t.id)) t.id++; used.add(t.id); });
      const keepUids = new Set(next.map(t => t.uid));
      const removed = prev.filter(t => !keepUids.has(t.uid));
      trades = next;
      if (!commit(prev, 'replace', next, () => {
        addTombstones(removed);
        const ref = referencedImages();
        ImageStore.allIds().forEach(id => { if (!ref.has(id) && !trashImageIds().has(id)) ImageStore.remove(id); });
      })) return false;
      return true;
    },
    // Fusionne un backup venant d'un autre appareil : le trade modifié le plus récemment gagne, les suppressions
    // (traces) sont appliquées des deux côtés. Un même trade importé sur deux appareils (même clé broker ou mêmes
    // date / actif / sens / P&L) n'est pas doublé. Renvoie { added, updated, deleted, skipped } ou null.
    merge(list, imagesById, remoteTombs) {
      const prev = trades.slice(), now = Date.now(), stats = { added: 0, updated: 0, deleted: 0, skipped: 0 };
      const tomb = new Map();
      tombstones().concat(Array.isArray(remoteTombs) ? remoteTombs : []).forEach(x => {
        if (x && typeof x.uid === 'string') tomb.set(x.uid, Math.max(tomb.get(x.uid) || 0, +x.deletedAt || 0));
      });
      const sig = t => [t.date, t.asset, t.dir, Math.round((+t.pnlEur || 0) * 100), +t.entryPrice || 0].join('|');
      const byUid = new Map(), byTv = new Map(), bySig = new Map();
      trades.forEach(t => { byUid.set(t.uid, t); if (t.tvKey) byTv.set(t.tvKey, t); bySig.set(sig(t), t); });
      const dropped = [], touched = [];
      try {
        (Array.isArray(list) ? list : []).forEach(raw => {
          const clean = sanitizeTrade(raw);
          if (!clean) return;
          const ruid = clean.uid, rUpd = +raw.updatedAt || +raw.createdAt || 0;
          if (ruid && tomb.has(ruid) && tomb.get(ruid) >= rUpd) { stats.skipped++; return; }
          const local = (ruid && byUid.get(ruid)) || (clean.tvKey && byTv.get(clean.tvKey)) || bySig.get(sig(clean));
          if (!local) {
            const t = prepareIncomingTrade(Object.assign({}, raw, { id: newLocalTradeId() }), imagesById, now);
            if (!t) return;
            trades.push(t); byUid.set(t.uid, t); if (t.tvKey) byTv.set(t.tvKey, t); bySig.set(sig(t), t);
            touched.push(t); stats.added++;
            return;
          }
          // Identifiant commun aux deux appareils : le plus petit des deux, pour que les fusions suivantes convergent.
          const uid = ruid && ruid < local.uid ? ruid : local.uid;
          if (rUpd > (local.updatedAt || 0)) {
            const t = prepareIncomingTrade(Object.assign({}, raw, { id: local.id, uid, createdAt: Math.min(local.createdAt || rUpd, +raw.createdAt || rUpd), updatedAt: rUpd }), imagesById, now);
            if (!t) return;
            trades[trades.indexOf(local)] = t;
            byUid.set(t.uid, t);
            local.imgs.forEach(i => { if (!t.imgs.includes(i)) dropped.push(i); });
            touched.push(t); stats.updated++;
          } else if (uid !== local.uid) { local.uid = uid; byUid.set(uid, local); }
          else stats.skipped++;
        });
      } catch (e) { reportStorageError(e); trades = prev; invalidateViews(); return null; }
      // Supprimés sur l'autre appareil après leur dernière modification ici.
      const gone = trades.filter(t => tomb.has(t.uid) && tomb.get(t.uid) > (t.updatedAt || 0));
      if (gone.length) { const g = new Set(gone); trades = trades.filter(t => !g.has(t)); gone.forEach(t => dropped.push(...t.imgs)); stats.deleted = gone.length; }
      if (!commit(prev, 'merge', touched.concat(gone), () => {
        const alive = new Set(trades.map(t => t.uid));
        const all = [...tomb].filter(([u]) => !alive.has(u)).map(([uid, deletedAt]) => ({ uid, deletedAt }));
        try { DB.setItem(TOMB_KEY(), JSON.stringify(all.slice(-20000))); } catch (e) { console.error(e); }
        const ref = referencedImages(), trash = trashImageIds();
        dropped.forEach(id => { if (!ref.has(id) && !trash.has(id)) ImageStore.remove(id); });
      })) return null;
      return stats;
    },
    // Modification en lot (renommer un setup, recalculer les sessions…) : fn modifie les trades et renvoie ceux touchés.
    mutate(fn) {
      const snapshot = JSON.stringify(trades), prev = trades.slice();
      let touched;
      try { touched = fn(trades) || []; } catch (e) { trades = JSON.parse(snapshot); throw e; }
      if (!touched.length) return [];
      const now = Date.now();
      touched.forEach(t => { t.updatedAt = now; });
      if (!commit(prev, 'update', touched)) { trades = JSON.parse(snapshot); invalidateViews(); return null; }
      return touched;
    }
  };
})();
function trashImageIds() { const s = new Set(); try { (JSON.parse(DB.getItem(JP + 'trash') || '[]') || []).forEach(e => ((e && e.trade && e.trade.imgs) || []).forEach(id => s.add(id))); } catch (e) {} return s; }

// ── Réglages : registre unique + date de dernière modification de chaque réglage ──
// Les réglages restent rangés sous leurs clés habituelles ; le registre dit lesquels se synchronisent, et chaque écriture
// note sa date (g_settings_mtime) pour savoir, entre deux appareils, quelle valeur est la plus récente.
const SYNCED_SETTINGS = {
  journal: ['account', 'calc', 'dd_limit_pct', 'dd_manual', 'nav_order', 'stats_subtab', 'pf_enabled', 'pf_target_pct', 'pf_maxdd_pct',
    'pf_dd_type', 'pf_min_days', 'pf_consistency_on', 'pf_consistency_pct', 'dash_layout_v2', 'scaling', 'scaling_seen', 'r_mode',
    'tz_offset_hours', 'import_fx_rate', 'plan', 'watch', 'daily', 'guard', 'guard_custom', 'prog'],
  global: ['theme', 'custom_themes', 'cal_heat_intensity', 'chart_intensity', 'theme_texture', 'theme_autosystem', 'journals', 'lang']
};
const SETTINGS_MTIME_KEY = 'g_settings_mtime';
function settingNameOf(key) {
  const m = /^([a-z0-9]+)_(.+)$/i.exec(key);
  if (!m) return null;
  if (m[1] === 'g') return SYNCED_SETTINGS.global.includes(m[2]) ? m[2] : null;
  return SYNCED_SETTINGS.journal.includes(m[2]) ? m[2] : null;
}
(function trackSettingsChanges() {
  if (DB.__tracked) return;
  const set = DB.setItem.bind(DB), del = DB.removeItem.bind(DB);
  const stamp = (k, t) => {
    if (k === SETTINGS_MTIME_KEY || !settingNameOf(k)) return;
    let mtimes;
    try { mtimes = JSON.parse(DB.getItem(SETTINGS_MTIME_KEY) || '{}') || {}; } catch (e) { mtimes = {}; }
    mtimes[k] = t || Date.now();
    set(SETTINGS_MTIME_KEY, JSON.stringify(mtimes));
  };
  // Écriture d'un réglage reçu d'un autre appareil : il garde sa date d'origine.
  DB.setItemAt = (k, v, t) => { set(k, v); stamp(String(k), t); };
  DB.setItem = (k, v) => { const prev = DB.getItem(k); set(k, v); if (prev !== String(v)) stamp(String(k)); };
  DB.removeItem = k => { del(k); stamp(String(k)); };
  DB.__tracked = true;
})();
// Instantané des réglages synchronisés de ce journal (+ communs) : { clé: { v: valeur, t: date } }.
function settingsSnapshot() {
  let mt = {};
  try { mt = JSON.parse(DB.getItem(SETTINGS_MTIME_KEY) || '{}') || {}; } catch (e) {}
  const out = {};
  SYNCED_SETTINGS.journal.map(n => JP + n).concat(SYNCED_SETTINGS.global.map(n => 'g_' + n)).forEach(k => {
    const v = DB.getItem(k);
    if (v !== null) out[k] = { v, t: mt[k] || 0 };
  });
  return out;
}

// ── Migration unique vers ce modèle (par journal) : uid, dates, captures rangées à part ──
(function migrateTradeModel() {
  if (!trades.some(t => !t.uid || !t.createdAt || t.cap || (t.caps && t.caps.length))) return;
  const before = DB.getItem(JP + 'trades');
  const now = Date.now(), seen = new Set();
  try {
    trades = trades.map(t => {
      const o = prepareIncomingTrade(t, null, now);
      if (seen.has(o.uid)) o.uid = newUid();
      seen.add(o.uid);
      return o;
    });
    // Corbeille : les captures restent dans l'entrée (_images) tant que le trade n'est pas restauré.
    const trash = JSON.parse(DB.getItem(JP + 'trash') || '[]');
    if (Array.isArray(trash) && trash.some(e => e && e.trade && (e.trade.cap || e.trade.caps))) {
      DB.setItem(JP + 'trash', JSON.stringify(trash.map(e => {
        if (!e || !e.trade) return e;
        const imgs = [e.trade.cap].concat(e.trade.caps || []).map(safeImgSrc).filter(Boolean);
        const tr = Object.assign({}, e.trade, { _images: [...new Set(imgs)] }); delete tr.cap; delete tr.caps;
        return Object.assign({}, e, { trade: tr });
      })));
    }
    DB.setItem(JP + 'trades', JSON.stringify(trades));
  } catch (e) {
    console.error('Migration du modèle de données impossible (rien n\'est modifié) :', e);
    if (before !== null) trades = sanitizeTrades(JSON.parse(before));
  }
})();
