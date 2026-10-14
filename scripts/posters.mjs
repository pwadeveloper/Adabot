// npm run posters — renders one WebP poster per version from the shader (High tier,
// rest pose, blank screen, transparent background) into public/posters/.
// `vite build` copies public/ into dist/, so the package ships them as dist/posters/*.webp.
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pad, ROOT, withHarness, writeDataURL } from './lib.mjs';

const VERSIONS = ['head', 'pod', 'buddy', 'tall'];
const POSTER_W = 480, POSTER_H = 600, MAX = 40 * 1024; // keep in sync with src/poster-meta.ts
// Render above layout size so the poster stays crisp on 2× screens; step down if the budget demands it.
const SCALES = [1.5, 1.25, 1];

const rows = await withHarness(async page => {
  const out = [];
  for (const v of VERSIONS) {
    let best = null;
    for (const s of SCALES) {
      const w = Math.round(POSTER_W * s), h = Math.round(POSTER_H * s);
      const r = await page.evaluate(([v, w, h, max]) => window.KK.poster(v, w, h, max), [v, w, h, MAX]);
      best = { ...r, w, h };
      if (r.bytes <= MAX && r.q >= 0.6) break;
    }
    if (best.bytes > MAX) throw new Error(`${v}: poster is ${best.bytes} B, over the ${MAX} B budget`);
    const file = resolve(ROOT, 'public/posters', `${v}.webp`);
    writeDataURL(file, best.url);
    out.push({ v, size: statSync(file).size, w: best.w, h: best.h, q: best.q });
  }
  return out;
});

console.log(`\n${pad('Poster', 14)}${pad('Pixels', 12)}${pad('Quality', 9)}Size`);
for (const r of rows) console.log(`${pad(r.v + '.webp', 14)}${pad(`${r.w}×${r.h}`, 12)}${pad(r.q.toFixed(2), 9)}${(r.size / 1024).toFixed(1)} KB (limit 40 KB)`);
