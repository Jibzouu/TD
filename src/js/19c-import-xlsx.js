// ── IMPORT : fichier Excel (.xlsx) ─────────────────────────────────────
// MetaTrader 5 enregistre son rapport d'historique en HTML ou en Excel (« Open XML »). Un .xlsx est une archive zip :
// on lit son répertoire, on décompresse (DecompressionStream, sans bibliothèque) les chaînes partagées et la première
// feuille, puis on rend des lignes de cellules comme pour une page HTML → même lecteur de relevé (tryParsePlatformStatement).
const isZipBuffer = buf => { const a = new Uint8Array(buf, 0, Math.min(4, buf.byteLength)); return a[0] === 0x50 && a[1] === 0x4b && a[2] === 3 && a[3] === 4; };
async function unzipEntries(buf, wanted) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip illisible');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = {};
  for (let n = 0; n < count && p + 46 <= buf.byteLength; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loc = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!wanted(name)) continue;
    const start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true), data = u8.slice(start, start + csize);
    if (method === 0) out[name] = dec.decode(data);
    else if (method === 8 && typeof DecompressionStream === 'function') out[name] = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  return out;
}
const xlsxColIndex = ref => { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
async function xlsxToRows(buf) {
  const files = await unzipEntries(buf, n => n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const sheetName = Object.keys(files).filter(n => n.startsWith('xl/worksheets/')).sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))[0];
  if (!sheetName) throw new Error('aucune feuille');
  const parse = s => new DOMParser().parseFromString(s, 'application/xml');
  const tx = el => [...el.getElementsByTagName('t')].map(t => t.textContent).join('');
  const shared = files['xl/sharedStrings.xml'] ? [...parse(files['xl/sharedStrings.xml']).getElementsByTagName('si')].map(tx) : [];
  const rows = [];
  [...parse(files[sheetName]).getElementsByTagName('row')].forEach(r => {
    const cells = [];
    [...r.getElementsByTagName('c')].forEach(c => {
      const j = xlsxColIndex(c.getAttribute('r')), t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0];
      const val = t === 's' ? (shared[+(v ? v.textContent : -1)] || '') : t === 'inlineStr' ? tx(c) : v ? v.textContent : '';
      cells[j > -1 ? j : cells.length] = String(val).replace(/\s+/g, ' ').trim();
    });
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    if (cells.some(Boolean)) rows.push(cells);
  });
  return { rows, text: rows.map(r => r.join(' ')).join(' ') };
}
