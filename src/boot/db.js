// ── STOCKAGE : IndexedDB avec cache mémoire ─────────────────────────
// Le journal lit toutes ses données en mémoire au démarrage, puis chaque écriture est répercutée dans IndexedDB
// en arrière-plan. L'API imite localStorage (getItem / setItem / removeItem / key / length) : le reste du code
// reste synchrone et simple, mais n'est plus limité aux ≈ 5 Mo de localStorage (IndexedDB = des centaines de Mo).
//   - Premier lancement : les données existantes de localStorage sont copiées dans IndexedDB (localStorage n'est
//     pas effacé : il reste une copie de secours lisible par l'ancienne version du journal).
//   - Si IndexedDB est indisponible (navigation privée de certains navigateurs…), repli transparent sur localStorage.
//   - Code de verrouillage (optionnel) : chaque valeur est chiffrée (AES-GCM, crypto.js) avant d'être écrite dans IndexedDB ;
//     au démarrage, l'écran de verrouillage demande le code, puis tout est déchiffré en mémoire. Sans le code, les
//     données sur le disque sont illisibles. La fiche du verrou (sel + témoin chiffré) est rangée sous la clé LOCK.
const DB = (() => {
  const NAME = 'journal-trading', STORE = 'kv', MIGRATED = '__migrated_from_localstorage', LOCK = '__lock', CHECK = 'journal-ok';
  const mem = new Map();
  let idb = null, mode = 'memory', pending = new Map(), flushScheduled = false, lastError = null;
  let lockKey = null, lockMeta = null, flushChain = Promise.resolve();
  const isBox = v => !!(v && typeof v === 'object' && typeof v.ct === 'string' && typeof v.iv === 'string');
  const listeners = [];

  function openIDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponible'));
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB bloqué par un autre onglet'));
    });
  }
  function readAll(db) {
    return new Promise((resolve, reject) => {
      const out = new Map();
      const tx = db.transaction(STORE, 'readonly'), st = tx.objectStore(STORE);
      const req = st.openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { out.set(String(c.key), c.value); c.continue(); } else resolve(out); };
      req.onerror = () => reject(req.error);
    });
  }
  function lsSafe(fn) { try { return fn(); } catch (e) { return null; } }

  async function init() {
    try {
      idb = await openIDB();
      const all = await readAll(idb);
      if (!all.size && !all.has(MIGRATED)) {
        // Migration unique depuis localStorage.
        const n = lsSafe(() => localStorage.length) || 0;
        for (let i = 0; i < n; i++) { const k = localStorage.key(i); all.set(k, localStorage.getItem(k)); }
        all.set(MIGRATED, String(Date.now()));
        await new Promise((resolve, reject) => {
          const tx = idb.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
          all.forEach((v, k) => st.put(v, k));
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        });
      }
      if (all.has(LOCK)) {
        lockMeta = all.get(LOCK);
        lockKey = await askUnlock(lockMeta);
        for (const [k, v] of all) if (isBox(v)) all.set(k, await JTC.decrypt(lockKey, v));
        all.delete(LOCK);
      }
      all.forEach((v, k) => mem.set(k, v));
      mode = 'indexeddb';
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      console.warn('IndexedDB indisponible, repli sur localStorage :', e);
      idb = null; mode = 'localstorage';
      const n = lsSafe(() => localStorage.length) || 0;
      for (let i = 0; i < n; i++) { const k = localStorage.key(i); mem.set(k, localStorage.getItem(k)); }
    }
    await refreshEstimate();
  }

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    Promise.resolve().then(flush);
  }
  // Les écritures passent l'une après l'autre (chaîne) : avec le chiffrement (asynchrone), un lot plus récent ne peut
  // jamais être écrit avant un lot plus ancien.
  function flush() {
    flushScheduled = false;
    if (!idb || !pending.size) return flushChain;
    const batch = pending; pending = new Map();
    flushChain = flushChain.then(() => writeBatch(batch));
    return flushChain;
  }
  async function writeBatch(batch) {
    const key = lockKey, rows = [];
    for (const [k, v] of batch) rows.push([k, v === null || !key ? v : await JTC.encrypt(key, v)]);
    return new Promise(resolve => {
      let tx;
      try { tx = idb.transaction(STORE, 'readwrite'); } catch (e) { onError(e); return resolve(); }
      const st = tx.objectStore(STORE);
      rows.forEach(([k, v]) => { if (v === null) st.delete(k); else st.put(v, k); });
      tx.oncomplete = () => { lastError = null; resolve(); };
      tx.onerror = tx.onabort = () => { onError(tx.error || new Error('Écriture IndexedDB refusée')); resolve(); };
    });
  }
  // Réécrit tout le contenu (chiffré ou en clair selon le verrou), plus la fiche du verrou.
  async function rewriteAll() {
    await flush();
    const batch = new Map(mem);
    batch.set(MIGRATED, mem.get(MIGRATED) || String(Date.now()));
    await (flushChain = flushChain.then(() => writeBatch(batch)));
    await new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
      if (lockMeta) st.put(lockMeta, LOCK); else st.delete(LOCK);
      tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  async function verify(meta, code) {
    try { const k = await JTC.deriveKey(code, meta.salt, meta.iter); return (await JTC.decrypt(k, meta.check)) === CHECK ? k : null; } catch (e) { return null; }
  }
  async function enableLock(code) {
    if (mode !== 'indexeddb' || !JTC.ok()) throw new Error('Verrouillage indisponible dans ce navigateur');
    const salt = JTC.randomSalt(), key = await JTC.deriveKey(code, salt, JTC.ITER);
    lockMeta = { v: 1, salt, iter: JTC.ITER, check: await JTC.encrypt(key, CHECK) };
    lockKey = key;
    await rewriteAll();
    // L'ancienne copie de secours en clair (localStorage, avant IndexedDB) est effacée : sinon elle resterait lisible.
    lsSafe(() => localStorage.clear());
  }
  async function disableLock(code) {
    if (!lockMeta) return true;
    if (!(await verify(lockMeta, code))) return false;
    lockKey = null; lockMeta = null;
    await rewriteAll();
    return true;
  }
  // Écran de verrouillage (avant que le journal ne démarre) : se résout avec la clé une fois le bon code saisi.
  function askUnlock(meta) {
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.id = 'lock-screen';
      wrap.innerHTML = '<form class="lk-box" autocomplete="off"><div class="lk-brand" aria-label="Untilt"><svg class="lk-mark" viewBox="0 0 52 24" aria-hidden="true"><rect x="5" y="3.5" width="42" height="17" rx="8.5" fill="none" stroke="currentColor" stroke-width="3.4"/><circle cx="26" cy="12" r="4.3" fill="#3EE6A8"/></svg><svg class="lk-word" viewBox="0 0 262 108" aria-hidden="true"><path d="M6 40 V78 A22 22 0 0 0 50 78 V40 M50 78 V100 M70 100 V40 M70 62 A22 22 0 0 1 114 62 V100 M140 18 V86 A14 14 0 0 0 154 100 H160 M128 42 H158 M180 46 V100 M200 10 V86 A14 14 0 0 0 214 100 M238 18 V86 A14 14 0 0 0 252 100 H258 M226 42 H256" fill="none" stroke="currentColor" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="180" cy="20" r="9" fill="#3EE6A8"/></svg></div><h1>🔒 Journal verrouillé</h1><p>Entre ton code pour ouvrir le journal.<br><small>Journal locked: enter your code.</small></p>'
        + '<input type="password" id="lock-code" inputmode="numeric" aria-label="Code" autofocus><button type="submit" id="lock-go">Ouvrir</button><p class="lk-err" id="lock-err" role="alert"></p>'
        + '<details class="lk-forgot"><summary>Code oublié ?</summary><p>Les données sont chiffrées avec ton code : sans lui, personne (pas même nous) ne peut les lire. Tu peux tout effacer et repartir de zéro, puis restaurer une sauvegarde.</p><button type="button" id="lock-wipe">Effacer toutes les données de ce navigateur</button></details></form>';
      document.body.appendChild(wrap);
      const input = wrap.querySelector('#lock-code'), err = wrap.querySelector('#lock-err');
      setTimeout(() => input.focus(), 30);
      wrap.querySelector('form').addEventListener('submit', async e => {
        e.preventDefault();
        err.textContent = 'Vérification…';
        const k = await verify(meta, input.value);
        if (!k) { err.textContent = 'Code incorrect.'; input.select(); return; }
        wrap.remove();
        resolve(k);
      });
      wrap.querySelector('#lock-wipe').addEventListener('click', () => {
        if (!confirm('Effacer DÉFINITIVEMENT toutes les données du journal dans ce navigateur ?')) return;
        if (idb) idb.close();
        const req = indexedDB.deleteDatabase(NAME);
        req.onsuccess = req.onerror = req.onblocked = () => { lsSafe(() => localStorage.clear()); location.reload(); };
      });
    });
  }
  // Sauvegarde automatique d'un journal verrouillé : chiffrée avec le même code (restaurable avec lui).
  async function sealWithLock(text) { return lockKey ? JTC.sealText(null, text, lockMeta.salt, lockKey) : null; }
  function onError(e) {
    lastError = e;
    console.error('Écriture impossible dans IndexedDB :', e);
    listeners.forEach(fn => { try { fn(e); } catch (x) {} });
  }

  // Place occupée / disponible (octets) : estimation du navigateur pour IndexedDB, ≈ 5 Mo de caractères sinon.
  let usage = null, quota = null;
  async function refreshEstimate() {
    if (mode === 'indexeddb' && navigator.storage && navigator.storage.estimate) {
      try { const e = await navigator.storage.estimate(); usage = e.usage || 0; quota = e.quota || null; } catch (e) {}
    }
  }

  return {
    init, flush, refreshEstimate, enableLock, disableLock, sealWithLock,
    get locked() { return !!lockMeta; },
    async checkCode(code) { return !!(lockMeta && await verify(lockMeta, code)); },
    get mode() { return mode; },
    get usage() { return usage; },
    get quota() { return quota; },
    get lastError() { return lastError; },
    onError(fn) { listeners.push(fn); },
    getItem(k) { k = String(k); return mem.has(k) ? mem.get(k) : null; },
    setItem(k, v) {
      k = String(k); v = String(v);
      if (mode === 'localstorage') localStorage.setItem(k, v);   // peut lever QuotaExceededError : l'appelant la gère
      mem.set(k, v);
      if (mode === 'indexeddb') { pending.set(k, v); scheduleFlush(); }
    },
    removeItem(k) {
      k = String(k);
      if (mode === 'localstorage') lsSafe(() => localStorage.removeItem(k));
      mem.delete(k);
      if (mode === 'indexeddb') { pending.set(k, null); scheduleFlush(); }
    },
    key(i) { return [...mem.keys()].filter(k => k !== MIGRATED)[i] ?? null; },
    get length() { return mem.size - (mem.has(MIGRATED) ? 1 : 0); },
    keys() { return [...mem.keys()].filter(k => k !== MIGRATED); }
  };
})();

// Démarrage différé : le code du journal ne s'exécute qu'une fois les données chargées.
// onReady() remplace DOMContentLoaded : les fonctions enregistrées sont appelées, dans l'ordre, juste après le chargement du code.
const __readyQueue = [];
function onReady(fn) { __readyQueue.push(fn); }
async function __bootJournal() {
  await DB.init();
  const src = document.getElementById('app-src');
  const s = document.createElement('script');
  s.textContent = src.textContent;
  document.body.appendChild(s);          // exécution synchrone du code du journal
  __readyQueue.splice(0).forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  document.documentElement.classList.add('app-ready');
}
window.addEventListener('pagehide', () => { DB.flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') DB.flush(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', __bootJournal); else __bootJournal();
