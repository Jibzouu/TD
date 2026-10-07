// ── CHIFFREMENT (WebCrypto) ───────────────────────────────────────────
// AES-GCM 256 bits, clé dérivée d'un mot de passe / code par PBKDF2-SHA-256 (sel aléatoire, 250 000 itérations).
// Sert au code de verrouillage (données chiffrées dans IndexedDB) et aux sauvegardes protégées par mot de passe.
// Chargé avant db.js : le stockage en a besoin dès le démarrage.
const JTC = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ITER = 250000, FORMAT = 'journal-chiffre-v1';
  const b64 = buf => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const ok = () => typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.deriveKey === 'function';
  function randomSalt() { return b64(crypto.getRandomValues(new Uint8Array(16))); }
  async function deriveKey(secret, salt, iter) {
    const base = await crypto.subtle.importKey('raw', enc.encode(String(secret)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(salt), iterations: iter || ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(key, text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(String(text)));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function decrypt(key, box) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
    return dec.decode(pt);
  }
  // Fichier protégé par mot de passe : { format, kdf, iter, salt, iv, ct } — tout le reste est illisible sans le mot de passe.
  async function sealText(secret, text, salt, key) {
    salt = salt || randomSalt();
    const k = key || await deriveKey(secret, salt, ITER);
    return Object.assign({ format: FORMAT, kdf: 'PBKDF2-SHA256', iter: ITER, salt }, await encrypt(k, text));
  }
  async function openText(secret, box) {
    const k = await deriveKey(secret, box.salt, box.iter || ITER);
    return decrypt(k, box);
  }
  const isSealed = o => !!(o && typeof o === 'object' && o.format === FORMAT && typeof o.ct === 'string' && typeof o.salt === 'string');
  return { ok, ITER, FORMAT, randomSalt, deriveKey, encrypt, decrypt, sealText, openText, isSealed };
})();
