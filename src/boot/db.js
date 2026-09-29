// ── STOCKAGE : IndexedDB avec cache mémoire ─────────────────────────
// Le journal lit toutes ses données en mémoire au démarrage, puis chaque écriture est répercutée dans IndexedDB
// en arrière-plan. L'API imite localStorage (getItem / setItem / removeItem / key / length) : le reste du code
// reste synchrone et simple, mais n'est plus limité aux ≈ 5 Mo de localStorage (IndexedDB = des centaines de Mo).
//   - Premier lancement : les données existantes de localStorage sont copiées dans IndexedDB (localStorage n'est
//     pas effacé : il reste une copie de secours lisible par l'ancienne version du journal).
//   - Si IndexedDB est indisponible (navigation privée de certains navigateurs…), repli transparent sur localStorage.
const DB = (() => {
  const NAME = 'journal-trading', STORE = 'kv', MIGRATED = '__migrated_from_localstorage';
  const mem = new Map();
  let idb = null, mode = 'memory', pending = new Map(), flushScheduled = false, lastError = null;
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
  function flush() {
    flushScheduled = false;
    if (!idb || !pending.size) return Promise.resolve();
    const batch = pending; pending = new Map();
    return new Promise(resolve => {
      let tx;
      try { tx = idb.transaction(STORE, 'readwrite'); } catch (e) { onError(e); return resolve(); }
      const st = tx.objectStore(STORE);
      batch.forEach((v, k) => { if (v === null) st.delete(k); else st.put(v, k); });
      tx.oncomplete = () => { lastError = null; resolve(); };
      tx.onerror = tx.onabort = () => { onError(tx.error || new Error('Écriture IndexedDB refusée')); resolve(); };
    });
  }
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
    init, flush, refreshEstimate,
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
