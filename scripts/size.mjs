// Runs after `vite build`: gzipped sizes of the shipped JS against the 35 KB core budget,
// and the posters against 40 KB each.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { pad, ROOT } from './lib.mjs';

const dist = resolve(ROOT, 'dist');
const kb = n => (n / 1024).toFixed(2) + ' KB';
let fail = false;
console.log(`\n${pad('File', 26)}${pad('Raw', 12)}${pad('Gzip', 12)}Budget`);
for (const f of ['kaykav-guide.js', 'react.js']) {
  const buf = readFileSync(resolve(dist, f)), gz = gzipSync(buf, { level: 9 }).length;
  const budget = f === 'kaykav-guide.js' ? 35 * 1024 : null;
  if (budget && gz > budget) fail = true;
  console.log(`${pad(f, 26)}${pad(kb(buf.length), 12)}${pad(kb(gz), 12)}${budget ? (gz <= budget ? '≤ 35 KB core: ok' : 'OVER 35 KB') : 'wrapper (imports the core)'}`);
}
for (const f of readdirSync(resolve(dist, 'posters')).filter(n => n.endsWith('.webp'))) {
  const n = statSync(resolve(dist, 'posters', f)).size;
  if (n > 40 * 1024) fail = true;
  console.log(`${pad('posters/' + f, 26)}${pad(kb(n), 12)}${pad('–', 12)}${n <= 40 * 1024 ? '≤ 40 KB: ok (Low tier only)' : 'OVER 40 KB'}`);
}
if (fail) { console.error('size budget exceeded'); process.exitCode = 1; }
