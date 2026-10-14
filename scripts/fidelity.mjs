// npm run fidelity — the measurement loop from handoff/MEASUREMENTS.md.
// Renders each version on a transparent background, computes IoU against the
// reference masks and writes overlays and same-scale side-by-sides to fidelity/.
//
//   npm run fidelity                 this package's renderer
//   npm run fidelity -- --prototype  the original handoff/prototype/kaykav-guide.html,
//                                    captured through the same loop (writes fidelity/prototype/)
//   npm run fidelity -- head tall    only some versions
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pad, ROOT, withHarness, writeDataURL } from './lib.mjs';

const ROWS = [
  { version: 'head', ref: 'head.jpg', target: 0.92, proto: 0.886 },
  { version: 'pod', ref: 'pod.jpg', target: 0.92, proto: 0.864 },
  { version: 'buddy', ref: 'buddy.jpg', target: 0.92, proto: 0.892 },
  { version: 'tall', ref: 'tall.png', target: 0.9, proto: 0.76 }
];
const args = process.argv.slice(2);
const prototype = args.includes('--prototype');
const only = args.filter(a => !a.startsWith('-'));
const out = resolve(ROOT, prototype ? 'fidelity/prototype' : 'fidelity');

/** Captures the original prototype's canvas with its UI hidden and a transparent page. */
async function capturePrototype(browserPage, base, version) {
  const ctx = await browserPage.context().browser().newContext({ viewport: { width: 1600, height: 1120 } });
  const p = await ctx.newPage();
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.addInitScript(v => {
    window.__KK_VARIANT = v; window.__KK_FACE = 'neutral'; window.__KK_FIXED_Q = 1; window.__KK_STOP = 12;
    localStorage.clear();
  }, version);
  await p.goto(new URL('handoff/prototype/kaykav-guide.html', base).href);
  await p.addStyleTag({ content: 'html,body,.stage{background:transparent!important;border:0!important}.stage-top,.stage-bottom,.chat,.sheet{visibility:hidden!important}' });
  await p.waitForTimeout(4000);
  const clip = await p.locator('#gl').boundingBox();
  const png = await p.screenshot({ clip, omitBackground: true, timeout: 120000 });
  await ctx.close();
  return 'data:image/png;base64,' + png.toString('base64');
}

const results = await withHarness(async (page, base) => {
  const res = [];
  for (const row of ROWS) {
    if (only.length && !only.includes(row.version)) continue;
    const ours = prototype ? await capturePrototype(page, base, row.version) : undefined;
    const r = await page.evaluate(([v, ref, o]) => window.KK.fidelity(v, ref, o), [row.version, `/handoff/references/${row.ref}`, ours]);
    writeDataURL(resolve(out, `${row.version}-overlay.png`), r.overlay);
    writeDataURL(resolve(out, `${row.version}-side-by-side.jpg`), r.side);
    writeDataURL(resolve(out, `${row.version}-render.jpg`), r.ours);
    res.push({ ...row, iou: r.iou });
  }
  return res;
});

console.log(`\nSilhouette fit, IoU vs reference masks (${prototype ? 'original prototype' : 'kaykav-guide renderer'})\n`);
console.log(`${pad('Version', 8)}${pad('Reference', 12)}${pad('Handoff v2', 12)}${pad('Now', 8)}${pad('Target', 9)}Result`);
for (const r of results) {
  console.log(`${pad(r.version, 8)}${pad(r.ref, 12)}${pad(r.proto.toFixed(3), 12)}${pad(r.iou.toFixed(3), 8)}${pad('≥ ' + r.target.toFixed(2), 9)}${r.iou >= r.target ? 'meets target' : 'below target'}`);
}
console.log(`\nOverlays (red = reference only, green = ours only) and side-by-sides written to ${prototype ? 'fidelity/prototype/' : 'fidelity/'}`);
if (!only.length) {
  writeFileSync(resolve(out, 'report.json'), JSON.stringify(results.map(({ version, ref, iou, target, proto }) => ({ version, ref, iou: +iou.toFixed(4), target, handoffV2: proto })), null, 2) + '\n');
}
