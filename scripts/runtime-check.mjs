// npm run check:runtime — checks the runtime-cost rules on a real page:
// lazy start near the viewport, stop when offscreen / hidden, ~20 fps when idle,
// full rate on interaction, Low for reduced motion and Data Saver, destroy() frees the context.
import { withHarness } from './lib.mjs';

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
const counts = page => page.evaluate(() => ({ ...window.counts }));
const drawsOver = async (page, ms) => { const a = (await counts(page)).draws; await page.waitForTimeout(ms); return ((await counts(page)).draws - a) * 1000 / ms; };
// draws per display frame: 1 = drawing every frame (full rate)
const perFrame = async (page, ms) => {
  const a = await counts(page); await page.waitForTimeout(ms); const b = await counts(page);
  return { ratio: (b.draws - a.draws) / Math.max(1, b.frames - a.frames), fps: ((b.frames - a.frames) * 1000) / ms, draws: ((b.draws - a.draws) * 1000) / ms };
};

await withHarness(async page => {
  await page.waitForTimeout(1500);
  let c = await counts(page);
  check('nothing renders while far below the fold', c.contexts === 0 && c.draws === 0, `contexts ${c.contexts}, draws ${c.draws}`);

  // within ~200 px of the viewport: starts
  await page.evaluate(() => window.scrollTo(0, 3000 - window.innerHeight - 150));
  await page.waitForFunction(() => window.counts.draws > 5, null, { timeout: 60000 });
  check('starts when within 200 px of the viewport', true, `context created ${(await counts(page)).contexts}×`);

  await page.evaluate(() => window.scrollTo(0, 3000 - 200));
  await page.waitForTimeout(3500);
  const idle = await perFrame(page, 3000);
  check('idle drops to ~20 fps', idle.draws > 12 && idle.draws < 26 && idle.ratio < 0.7,
    `${idle.draws.toFixed(1)} draws/s on ${idle.fps.toFixed(0)} display frames/s (${idle.ratio.toFixed(2)} per frame) with no input`);

  let i = 0;
  const wiggle = (async () => { const end = Date.now() + 3000; while (Date.now() < end) { await page.mouse.move(100 + (i++ % 40) * 8, 300); await page.waitForTimeout(16); } })();
  await page.waitForTimeout(200);
  const active = await perFrame(page, 2500);
  await wiggle;
  check('pointer movement returns to full rate', active.ratio > 0.9,
    `${active.draws.toFixed(1)} draws/s on ${active.fps.toFixed(0)} display frames/s (${active.ratio.toFixed(2)} per frame) while the pointer moves`);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  const off = await drawsOver(page, 2000);
  check('stops completely when offscreen', off === 0, `${off} draws/s`);

  await page.evaluate(() => window.scrollTo(0, 3000 - 200));
  await page.waitForTimeout(800);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(500);
  const hidden = await drawsOver(page, 2000);
  check('stops completely when the tab is hidden', hidden === 0, `${hidden} draws/s`);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });

  const label = await page.evaluate(() => document.getElementById('c').getAttribute('aria-label'));
  check('role="img" with the expression in the label', /neutral|sleeping|surprised/.test(label) && (await page.evaluate(() => document.getElementById('c').getAttribute('role'))) === 'img', label);

  const tap = async (x, y) => {
    await page.evaluate(() => { window.__taps = []; window.guide().on('tap', e => window.__taps.push(e.part)); });
    const b = await page.locator('#c').boundingBox();
    await page.mouse.click(b.x + b.width * x, b.y + b.height * y);
    await page.waitForTimeout(300);
    return page.evaluate(() => window.__taps.join(','));
  };
  const onBody = await tap(0.5, 0.5), onEmpty = await tap(0.03, 0.97);
  check('tap on the body reports "body"; empty space reports nothing (WebGL readback)', onBody === 'body' && onEmpty === '', `centre → "${onBody}", corner → "${onEmpty}"`);

  const d = await page.evaluate(() => window.destroyGuide());
  const after = await drawsOver(page, 1000);
  check('destroy() frees the GL context and stops', d.lost && after === 0 && d.posters === 0, `context lost: ${d.lost}, draws/s after: ${after}`);
}, { path: '/harness/runtime.html', viewport: { width: 600, height: 700 } });

for (const [name, opts] of [['prefers-reduced-motion → Low, no WebGL', { reducedMotion: 'reduce' }], ['Data Saver → Low, no WebGL', null]]) {
  await withHarness(async page => {
    if (!opts) await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }));
    if (!opts) await page.reload();
    await page.evaluate(() => window.scrollTo(0, 3000 - 300));
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => window.guide().getStats());
    const c = await counts(page);
    const img = await page.evaluate(() => [...document.querySelectorAll('[data-kaykav-poster] img')].map(i => i.getAttribute('src')).join(','));
    check(name, s.tier === 'low' && c.contexts === 0, `tier ${s.tier} (${s.reason}), WebGL contexts ${c.contexts}, poster ${img}`);
    if (opts) {
      await page.evaluate(() => { window.__taps = []; window.guide().on('tap', e => window.__taps.push(e.part)); });
      const b = await page.locator('#c').boundingBox();
      await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.5);
      await page.mouse.click(b.x + b.width * 0.03, b.y + b.height * 0.97);
      await page.waitForTimeout(300);
      const taps = await page.evaluate(() => window.__taps.join(','));
      check('Low tier: tap on the body reports "body" (poster alpha), empty space nothing', taps === 'body', `taps: "${taps}"`);
    }
  }, { path: '/harness/runtime.html', viewport: { width: 600, height: 700 }, page: opts ?? {} });
}

await withHarness(async page => {
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/posters/')).length);
  check('posters are not fetched before Low is shown', before === 0, `${before} poster requests while below the fold`);
}, { path: '/harness/runtime.html?tier=low', viewport: { width: 600, height: 700 } });

const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} runtime checks passed`);
if (failed) process.exitCode = 1;
