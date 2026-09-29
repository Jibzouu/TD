// Build du journal : rassemble les modules de src/ en UN SEUL fichier HTML autonome.
//   - styles/*.css, partials/*.html et js/*.js sont concaténés dans l'ordre alphabétique (préfixes 00-, 10-…)
//   - Chart.js et les polices (Inter, JetBrains Mono) sont intégrés : le journal fonctionne entièrement hors ligne
//   - sortie : dist/journal.html (+ manifest et service worker pour l'installation en application),
//     recopiée en journal-complet.html à la racine pour un usage direct (double-clic).
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const NM = join(ROOT, 'node_modules');

const readDir = (dir, ext) => readdirSync(join(SRC, dir)).filter(f => f.endsWith(ext)).sort()
  .map(f => `/* ═══ ${dir}/${f} ═══ */\n` + readFileSync(join(SRC, dir, f), 'utf8'));
const readDirHtml = dir => readdirSync(join(SRC, dir)).filter(f => f.endsWith('.html')).sort()
  .map(f => readFileSync(join(SRC, dir, f), 'utf8')).join('\n');
// Un script intégré ne doit jamais contenir « </script » (fermerait la balise trop tôt).
const safeScript = s => s.replace(/<\/script/gi, '<\\/script');

function fontFaces() {
  const faces = [
    ['Inter', '@fontsource/inter/files/inter-latin-%w-normal.woff2', [400, 500, 600, 700]],
    ['JetBrains Mono', '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-%w-normal.woff2', [400, 500, 600]],
  ];
  return faces.flatMap(([family, pattern, weights]) => weights.map(w => {
    const b64 = readFileSync(join(NM, pattern.replace('%w', w))).toString('base64');
    return `@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
  })).join('\n');
}

export function build({ quiet } = {}) {
  let html = readFileSync(join(SRC, 'index.html'), 'utf8');
  const chartJs = readFileSync(join(NM, 'chart.js/dist/chart.umd.js'), 'utf8');
  const vendor = `<style>\n/* Polices intégrées (fonctionnent hors ligne) */\n${fontFaces()}\n</style>\n<script>\n/* Chart.js ${JSON.parse(readFileSync(join(NM, 'chart.js/package.json'), 'utf8')).version} — MIT © Chart.js Contributors */\n${safeScript(chartJs)}\n</script>`;
  const parts = {
    vendor,
    styles: readDir('styles', '.css').join('\n'),
    body: readDirHtml('partials'),
    scripts: safeScript(readDir('js', '.js').join('\n')),
  };
  // Remplacement par fonction : les « $ » du code ne doivent pas être interprétés.
  html = html.replace(/<!-- @(\w+) -->/g, (m, k) => { if (!(k in parts)) throw new Error('Emplacement inconnu : ' + k); return parts[k]; });
  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, 'journal.html'), html);
  for (const f of ['manifest.webmanifest', 'sw.js', 'icon.svg']) if (existsSync(join(SRC, 'pwa', f))) copyFileSync(join(SRC, 'pwa', f), join(DIST, f));
  writeFileSync(join(ROOT, 'journal-complet.html'), html);
  if (!quiet) console.log(`✓ dist/journal.html — ${(html.length / 1024).toFixed(0)} Ko (copié en journal-complet.html)`);
  return html;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) build();
