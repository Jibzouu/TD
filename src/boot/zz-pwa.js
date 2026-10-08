// ── APPLICATION INSTALLABLE (PWA) ─────────────────────────────────────
// Uniquement quand le journal est servi en http(s) : ouvert par double-clic (file://),
// il fonctionne déjà hors ligne et un service worker n'y est pas autorisé.
(function () {
  if (!/^https?:$/.test(location.protocol)) return;
  const link = document.createElement('link');
  link.rel = 'manifest'; link.href = 'manifest.webmanifest';
  document.head.appendChild(link);
  // iPhone / iPad : icône d'écran d'accueil et ouverture en plein écran comme une application.
  [['link', { rel: 'apple-touch-icon', href: 'apple-touch-icon.png' }], ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
   ['meta', { name: 'mobile-web-app-capable', content: 'yes' }], ['meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }],
   ['meta', { name: 'apple-mobile-web-app-title', content: 'LockIn' }]].forEach(([tag, attrs]) => {
    const el = document.createElement(tag); Object.assign(el, attrs); if (attrs.content) el.setAttribute('content', attrs.content); document.head.appendChild(el);
  });
  const theme = document.createElement('meta');
  theme.name = 'theme-color'; theme.content = '#0e1020';
  document.head.appendChild(theme);
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service worker non enregistré :', err)));
  }
})();
