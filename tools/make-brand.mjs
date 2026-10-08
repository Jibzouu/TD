// Génère les fichiers de la marque LockIn à partir des tracés de src/js/00j-brand.js (source unique) :
//  - src/pwa/icon.svg + icônes PNG de l'application (Android, iPhone, Windows) ;
//  - brand/ : logos (fond sombre, clair, transparent), symbole, mot seul, icône PNG, planche d'aperçu.
// À relancer seulement si le logo change : node tools/make-brand.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PWA = join(ROOT, 'src', 'pwa'), BRAND = join(ROOT, 'brand');
const src = readFileSync(join(ROOT, 'src', 'js', '00j-brand.js'), 'utf8');
const pick = name => src.match(new RegExp(`const ${name} = '([^']+)'`))[1];
const ACC = pick('BRAND_ACC'), WORD = pick('BRAND_WORD_PATH'), SHACKLE = pick('BRAND_SHACKLE_PATH');
const INK = '#0E1020', PAPER = '#F5F7FB';

// Symbole (cadenas + bulle) dans le repère du logo : boîte x 1,5…102,5, y 13,5…90,5 → centre (52, 52).
const mark = c => `<path d="${SHACKLE}" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round"/><rect x="6" y="52" width="92" height="34" rx="17" fill="none" stroke="${c}" stroke-width="9"/><circle cx="52" cy="69" r="9.5" fill="${ACC}"/>`;
const word = c => `<path d="${WORD}" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="226" cy="20" r="9" fill="${ACC}"/>`;
const logo = (c, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="140" viewBox="0 0 480 140">${bg ? `<rect width="480" height="140" fill="${bg}"/>` : ''}<g transform="translate(30 16)">${mark(c)}<g transform="translate(118 0)">${word(c)}</g></g></svg>`;
const GRAD = '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#151935"/><stop offset="1" stop-color="#0E1020"/></linearGradient></defs>';
// Icône : symbole centré sur fond dégradé. rx = coins (0 pour iPhone et « maskable », que le système découpe lui-même) ;
// k = échelle du symbole (plus petite pour « maskable » : il doit tenir dans la zone sûre de 80 %).
const icon = (size, rx, k) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">${GRAD}<rect width="512" height="512" rx="${rx}" fill="url(#g)"/><g transform="translate(256 262) scale(${k}) translate(-52 -52)">${mark(PAPER)}</g></svg>`;

const files = {
  [join(PWA, 'icon.svg')]: icon(512, 116, 3.6),
  [join(BRAND, 'lockin-icon.svg')]: icon(512, 116, 3.6),
  [join(BRAND, 'lockin-logo-dark.svg')]: logo(PAPER, INK),
  [join(BRAND, 'lockin-logo-light.svg')]: logo(INK, '#FFFFFF'),
  [join(BRAND, 'lockin-logo-transparent.svg')]: logo(INK),
  [join(BRAND, 'lockin-mark.svg')]: `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="128" viewBox="-8 2 120 96">${mark(INK)}</svg>`,
  [join(BRAND, 'lockin-wordmark.svg')]: `<svg xmlns="http://www.w3.org/2000/svg" width="312" height="118" viewBox="-6 -2 312 118">${word(INK)}</svg>`
};
mkdirSync(BRAND, { recursive: true });
for (const [f, svg] of Object.entries(files)) { writeFileSync(f, svg + '\n'); console.log('✓', f.slice(ROOT.length + 1)); }

const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(svg, size, out, transparent) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  writeFileSync(out, await page.screenshot({ omitBackground: !!transparent, clip: { x: 0, y: 0, width: size, height: size } }));
  console.log('✓', out.slice(ROOT.length + 1));
}
await shot(icon(192, 116, 3.6), 192, join(PWA, 'icon-192.png'), true);
await shot(icon(512, 116, 3.6), 512, join(PWA, 'icon-512.png'), true);
await shot(icon(512, 0, 2.9), 512, join(PWA, 'icon-maskable-512.png'));
await shot(icon(180, 0, 3.3), 180, join(PWA, 'apple-touch-icon.png'));
for (const s of [512, 192, 32]) await shot(icon(s, 116, 3.6), s, join(BRAND, `lockin-icon-${s}.png`), true);
// Logos en PNG haute définition (×3), pour les outils qui n'ouvrent pas le SVG (Canva, Word, réseaux sociaux…).
async function png(name, w, h) {
  await page.setViewportSize({ width: w * 3, height: h * 3 });
  const svg = readFileSync(join(BRAND, name + '.svg'), 'utf8').replace(/width="\d+" height="\d+"/, `width="${w * 3}" height="${h * 3}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  writeFileSync(join(BRAND, name + '.png'), await page.screenshot({ omitBackground: true }));
  console.log('✓', 'brand/' + name + '.png');
}
for (const n of ['lockin-logo-dark', 'lockin-logo-light', 'lockin-logo-transparent']) await png(n, 480, 140);
await png('lockin-mark', 160, 128);
await png('lockin-wordmark', 312, 118);
// Planche d'aperçu : logos sombre / clair, icône à 3 tailles, mot seul.
const f = n => readFileSync(join(BRAND, n), 'utf8');
await page.setViewportSize({ width: 1200, height: 760 });
await page.setContent(`<body style="margin:0;font-family:system-ui;background:#e9ebf1;display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:32px">
<div style="background:${INK};border-radius:20px;display:flex;align-items:center;justify-content:center;padding:40px">${f('lockin-logo-dark.svg')}</div>
<div style="background:#fff;border-radius:20px;display:flex;align-items:center;justify-content:center;padding:40px">${f('lockin-logo-light.svg')}</div>
<div style="background:#fff;border-radius:20px;display:flex;align-items:center;justify-content:center;gap:40px;padding:30px">${[180, 96, 48].map(s => icon(s, 116, 3.6)).join('')}</div>
<div style="background:#fff;border-radius:20px;display:flex;align-items:center;justify-content:center;padding:30px">${f('lockin-wordmark.svg').replace('width="312" height="118"', 'width="390" height="148"')}</div></body>`);
await page.screenshot({ path: join(BRAND, 'lockin-apercu.png') });
console.log('✓ brand/lockin-apercu.png');
await browser.close();
