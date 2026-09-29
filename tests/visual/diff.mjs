// Compare deux dossiers de captures pixel par pixel. Usage : node tests/visual/diff.mjs <avant> <après> [dossier-diffs]
import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const [A, B, D] = process.argv.slice(2);
if (D) mkdirSync(D, { recursive: true });
const b = await chromium.launch(); const page = await b.newPage();
let bad = 0;
for (const f of readdirSync(A).filter(f => f.endsWith('.png')).sort()) {
  if (!existsSync(join(B, f))) { console.log('MANQUANT', f); bad++; continue; }
  const a = readFileSync(join(A, f)).toString('base64'), c = readFileSync(join(B, f)).toString('base64');
  const r = await page.evaluate(async ([a, c]) => {
    const load = s => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(c)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { size: `${ia.width}x${ia.height} → ${ib.width}x${ib.height}` };
    const cv = document.createElement('canvas'); cv.width = ia.width; cv.height = ia.height; const x = cv.getContext('2d');
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, cv.width, cv.height);
    x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, cv.width, cv.height);
    let n = 0, minY = 1e9, maxY = -1;
    for (let p = 0; p < da.data.length; p += 4) {
      if (Math.abs(da.data[p] - db.data[p]) + Math.abs(da.data[p + 1] - db.data[p + 1]) + Math.abs(da.data[p + 2] - db.data[p + 2]) > 30) {
        n++; const y = Math.floor(p / 4 / cv.width); if (y < minY) minY = y; if (y > maxY) maxY = y;
        db.data[p] = 255; db.data[p + 1] = 0; db.data[p + 2] = 255;
      }
    }
    x.putImageData(db, 0, 0);
    return { n, minY, maxY, img: n ? cv.toDataURL('image/png').split(',')[1] : null };
  }, [a, c]);
  if (r.size) { console.log('TAILLE', f, r.size); bad++; }
  else if (r.n) { console.log('DIFF', f, r.n, 'px', `y ${r.minY}–${r.maxY}`); bad++; if (D) writeFileSync(join(D, f), Buffer.from(r.img, 'base64')); }
}
await b.close();
console.log(bad ? `${bad} capture(s) différente(s)` : 'identique');
