// npm run faces — one grid image of every face on the navy screen tile, laid out like
// handoff/references/expression-sheet.jpg (same rows and order; Listening and Talking,
// which are not on the sheet, go on an extra last row). Also writes a side-by-side with
// the sheet and checks that no face flashes more than 3 times per second.
import { resolve } from 'node:path';
import { pad, ROOT, withHarness, writeDataURL } from './lib.mjs';

const { grid, compare, flashes } = await withHarness(async page => {
  const grid = await page.evaluate(() => window.KK.faceGrid(0.7));
  const compare = await page.evaluate(async g => window.KK.faceCompare('/handoff/references/expression-sheet.jpg', g), grid);
  const names = await page.evaluate(() => window.KK.faces);
  const flashes = [];
  for (const f of names) flashes.push([f, await page.evaluate(n => window.KK.flashRate(n), f)]);
  return { grid, compare, flashes };
});

writeDataURL(resolve(ROOT, 'fidelity/faces.png'), grid);
writeDataURL(resolve(ROOT, 'fidelity/faces-vs-sheet.jpg'), compare);
console.log('Wrote fidelity/faces.png (grid) and fidelity/faces-vs-sheet.jpg (sheet | ours)\n');

const worst = flashes.reduce((a, b) => (b[1] > a[1] ? b : a));
const moving = flashes.filter(([, n]) => n > 0).map(([f, n]) => `${f} ${n}`);
console.log(`Flash check (per screen cell, swings > 10 % of peak, worst 1 s window over 4 s):`);
console.log(`  ${pad(flashes.length + ' faces checked', 20)}worst: ${worst[0]} at ${worst[1]} flashes/s (limit 3)`);
if (moving.length) console.log(`  faces with any flashes: ${moving.join(', ')}`);
if (worst[1] > 3) { console.error(`  FAIL: ${worst[0]} flashes ${worst[1]} times per second`); process.exitCode = 1; }
