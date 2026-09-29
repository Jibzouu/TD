// ── APPLICATION INSTALLABLE (PWA) ─────────────────────────────────────
// Uniquement quand le journal est servi en http(s) : ouvert par double-clic (file://),
// il fonctionne déjà hors ligne et un service worker n'y est pas autorisé.
(function () {
  if (!/^https?:$/.test(location.protocol)) return;
  const link = document.createElement('link');
  link.rel = 'manifest'; link.href = 'manifest.webmanifest';
  document.head.appendChild(link);
  const theme = document.createElement('meta');
  theme.name = 'theme-color'; theme.content = '#0a0c10';
  document.head.appendChild(theme);
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker non enregistré :', err)));
  }
})();
