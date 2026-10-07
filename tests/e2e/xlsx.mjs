// Fabrique un petit fichier .xlsx (zip + XML, chaînes partagées) à partir de lignes de cellules — pour tester l'import Excel.
import { deflateRawSync, crc32 } from 'node:zlib';

const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const col = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
export function makeXlsx(rows) {
  const shared = [], idx = new Map();
  const sid = s => { if (!idx.has(s)) { idx.set(s, shared.length); shared.push(s); } return idx.get(s); };
  const sheet = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
    + rows.map((r, i) => '<row r="' + (i + 1) + '">' + r.map((v, j) => v === '' ? '' : /^-?\d+(\.\d+)?$/.test(v) ? '<c r="' + col(j) + (i + 1) + '"><v>' + v + '</v></c>' : '<c r="' + col(j) + (i + 1) + '" t="s"><v>' + sid(v) + '</v></c>').join('') + '</row>').join('')
    + '</sheetData></worksheet>';
  const sst = '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + shared.map(s => '<si><t>' + xmlEsc(s) + '</t></si>').join('') + '</sst>';
  const files = [['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'], ['xl/sharedStrings.xml', sst], ['xl/worksheets/sheet1.xml', sheet]];
  const parts = [], central = [];
  let off = 0;
  files.forEach(([name, text]) => {
    const raw = Buffer.from(text, 'utf8'), data = deflateRawSync(raw), nb = Buffer.from(name, 'utf8'), crc = crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, nb, data); central.push(ch, nb);
    off += 30 + nb.length + data.length;
  });
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}
