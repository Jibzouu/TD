// ── MARQUE UNTILT ──────────────────────────────────────────────────────
// Symbole (niveau à bulle) et mot « untilt » dessiné en trait arrondi ; le point du « i » est la bulle verte.
// Mêmes tracés partout : menu, rapport mentor, carte « ma semaine » (canvas, via Path2D), premier lancement.
const BRAND_ACC = '#3EE6A8';
const BRAND_WORD_PATH = 'M6 40 V78 A22 22 0 0 0 50 78 V40 M50 78 V100 M70 100 V40 M70 62 A22 22 0 0 1 114 62 V100 M140 18 V86 A14 14 0 0 0 154 100 H160 M128 42 H158 M180 46 V100 M200 10 V86 A14 14 0 0 0 214 100 M238 18 V86 A14 14 0 0 0 252 100 H258 M226 42 H256';
// Logo horizontal (symbole + mot) en SVG ; color = couleur du trait (currentColor par défaut).
function brandLogoSVG(color, height) {
  const c = color || 'currentColor', h = height || 28;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 108" height="' + h + '" role="img" aria-label="Untilt">'
    + '<rect x="6" y="52" width="92" height="34" rx="17" fill="none" stroke="' + c + '" stroke-width="9"/><circle cx="52" cy="69" r="9.5" fill="' + BRAND_ACC + '"/>'
    + '<g transform="translate(118 0)"><path d="' + BRAND_WORD_PATH + '" fill="none" stroke="' + c + '" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="180" cy="20" r="9" fill="' + BRAND_ACC + '"/></g></svg>';
}
// Dessine le logo sur un canvas (x, y = coin haut gauche ; h = hauteur).
function drawBrandLogo(g, x, y, h, color) {
  const k = h / 108;
  g.save(); g.translate(x, y); g.scale(k, k);
  g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = 9; g.beginPath(); g.roundRect(6, 52, 92, 34, 17); g.stroke();
  g.fillStyle = BRAND_ACC; g.beginPath(); g.arc(52, 69, 9.5, 0, Math.PI * 2); g.fill();
  g.translate(118, 0); g.lineWidth = 12; g.stroke(new Path2D(BRAND_WORD_PATH));
  g.beginPath(); g.arc(180, 20, 9, 0, Math.PI * 2); g.fill();
  g.restore();
}
