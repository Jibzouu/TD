// Génère les icônes PNG de l'application (Android, iPhone, Windows) à partir de src/pwa/icon.svg.
// À relancer seulement si l'icône change : node tools/make-icons.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PWA = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'pwa');
const svg = readFileSync(join(PWA, 'icon.svg'), 'utf8');
// Version « maskable » : fond plein bord à bord, dessin réduit dans la zone sûre (80 %) que les lanceurs ne rognent pas.
const inner = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '').replace(/<rect width="512" height="512" rx="96" fill="#0a0c10"\/>/, '');
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0a0c10"/><g transform="translate(64 64) scale(.75)">${inner}</g></svg>`;
const opaque = svg.replace('rx="96"', 'rx="0"');   // iPhone : l'icône est arrondie par le système, pas de coins transparents

const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(src, size, out) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  writeFileSync(join(PWA, out), await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  console.log('✓', out);
}
await shot(svg, 192, 'icon-192.png');
await shot(svg, 512, 'icon-512.png');
await shot(maskable, 512, 'icon-maskable-512.png');
await shot(opaque, 180, 'apple-touch-icon.png');
await browser.close();
