// Service worker du journal : met la page en cache pour qu'elle s'ouvre sans connexion.
// Stratégie « réseau d'abord, cache en secours » pour la page (toujours la dernière version quand on est en ligne),
// « cache d'abord » pour le manifeste et l'icône. Les données du journal ne passent jamais par ici (IndexedDB).
const CACHE = 'journal-8e56dd7733';
const FILES = ['./journal.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('journal-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./journal.html', copy)); return res; })
      .catch(() => caches.match('./journal.html')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
