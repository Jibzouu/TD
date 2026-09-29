// Comparaison visuelle avant/après : capture toutes les pages avec la version de référence (git) puis avec le build
// actuel, et compare pixel par pixel. Usage : npm run test:visual -- [ref git, défaut HEAD]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const ref = process.argv[2] || 'HEAD';
const tmp = mkdtempSync(join(tmpdir(), 'journal-visuel-'));
const refHtml = join(tmp, 'reference.html');
writeFileSync(refHtml, execFileSync('git', ['show', `${ref}:dist/journal.html`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }));
const run = (args, env = {}) => execFileSync('node', args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
run(['build.mjs']);
run([join(HERE, 'shoot.mjs'), join(tmp, 'avant')], { JOURNAL_HTML: refHtml });
run([join(HERE, 'shoot.mjs'), join(tmp, 'apres')]);
try { run([join(HERE, 'diff.mjs'), join(tmp, 'avant'), join(tmp, 'apres'), join(tmp, 'diffs')]); }
finally { console.log('Captures et différences :', tmp); }
