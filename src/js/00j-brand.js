// ── MARQUE LOCKIN ──────────────────────────────────────────────────────
// Symbole : un cadenas dont la serrure est la bulle d'un niveau (verrouillé, à niveau). Mot « lockin » dessiné en trait
// arrondi ; le point du « i » est la bulle verte. Mêmes tracés partout : menu, écran de verrouillage (src/boot/db.js),
// rapport mentor, carte « ma semaine » (canvas, via Path2D), premier lancement, icônes et dossier brand/ (tools/make-brand.mjs).
const BRAND_NAME = 'LockIn';
const BRAND_ACC = '#3EE6A8';
const BRAND_SHACKLE_PATH = 'M30 52 V40 A22 22 0 0 1 74 40 V52';
const BRAND_WORD_PATH = 'M6 10 V86 A14 14 0 0 0 20 100 M92 70 A27 30 0 1 0 38 70 A27 30 0 1 0 92 70 M154.4 48.8 A26 30 0 1 0 154.4 91.2 M172 10 V100 M204 40 L172 76 M186 60 L206 100 M226 46 V100 M246 100 V40 M246 62 A22 22 0 0 1 290 62 V100';
// Logo horizontal (symbole + mot) en SVG ; color = couleur du trait (currentColor par défaut).
function brandLogoSVG(color, height) {
  const c = color || 'currentColor', h = height || 28;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 108" height="' + h + '" role="img" aria-label="' + BRAND_NAME + '">'
    + '<path d="' + BRAND_SHACKLE_PATH + '" fill="none" stroke="' + c + '" stroke-width="9" stroke-linecap="round"/>'
    + '<rect x="6" y="52" width="92" height="34" rx="17" fill="none" stroke="' + c + '" stroke-width="9"/><circle cx="52" cy="69" r="9.5" fill="' + BRAND_ACC + '"/>'
    + '<g transform="translate(118 0)"><path d="' + BRAND_WORD_PATH + '" fill="none" stroke="' + c + '" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="226" cy="20" r="9" fill="' + BRAND_ACC + '"/></g></svg>';
}
// Dessine le logo sur un canvas (x, y = coin haut gauche ; h = hauteur).
function drawBrandLogo(g, x, y, h, color) {
  const k = h / 108;
  g.save(); g.translate(x, y); g.scale(k, k);
  g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 9; g.stroke(new Path2D(BRAND_SHACKLE_PATH)); g.beginPath(); g.roundRect(6, 52, 92, 34, 17); g.stroke();
  g.fillStyle = BRAND_ACC; g.beginPath(); g.arc(52, 69, 9.5, 0, Math.PI * 2); g.fill();
  g.translate(118, 0); g.lineWidth = 12; g.stroke(new Path2D(BRAND_WORD_PATH));
  g.beginPath(); g.arc(226, 20, 9, 0, Math.PI * 2); g.fill();
  g.restore();
}
