// npm run bench — average frame time per tier on this machine.
//  1. live demo page per forced tier, pointer kept moving so the loop runs at full rate:
//     mean interval between display frames (what a student would feel)
//  2. raw GPU cost: draw + gl.finish() per program at the capped drawing-buffer size
//  3. what Auto settles on here, and why
import { pad, withHarness } from './lib.mjs';

const VERSION = process.argv[2] ?? 'buddy';
const SECONDS = 8;

async function live(tier) {
  return withHarness(async page => {
    await page.waitForFunction(() => window.guide && window.guide.getStats().fps > 0 || window.guide.getStats().tier === 'low', null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const run = page.evaluate(sec => new Promise(res => {
      const t = []; let last = 0; const end = performance.now() + sec * 1000;
      const f = now => { if (last) t.push(now - last); last = now; if (now < end) requestAnimationFrame(f); else res(t); };
      requestAnimationFrame(f);
    }), SECONDS);
    // keep the guide "active" (full rate) with a moving pointer
    const t0 = Date.now();
    for (let i = 0; Date.now() - t0 < SECONDS * 1000; i++) {
      await page.mouse.move(300 + Math.sin(i / 5) * 200, 300 + Math.cos(i / 7) * 150);
      await page.waitForTimeout(40);
    }
    const iv = await run;
    const stats = await page.evaluate(() => window.guide.getStats());
    const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
    return { tier, mean, fps: 1000 / mean, stats };
  }, { path: `/?soft=1&tier=${tier}&v=${VERSION}`, viewport: { width: 1200, height: 900 } });
}

async function auto() {
  return withHarness(async page => {
    const t0 = Date.now(), steps = [];
    await page.evaluate(() => { window.__steps = []; window.guide.on('tierchange', e => window.__steps.push(e)); });
    for (let i = 0; Date.now() - t0 < 20000; i++) {
      await page.mouse.move(300 + Math.sin(i / 5) * 200, 300 + Math.cos(i / 7) * 150);
      await page.waitForTimeout(50);
    }
    steps.push(...await page.evaluate(() => window.__steps));
    return { steps, stats: await page.evaluate(() => window.guide.getStats()) };
  }, { path: `/?soft=1&v=${VERSION}`, viewport: { width: 1200, height: 900 } });
}

const raw = await withHarness(page => page.evaluate(v => window.KK.drawCost(v, [1, 2], 8), VERSION));
const rows = [];
for (const t of ['high', 'medium', 'low']) rows.push(await live(t));
const a = await auto();

console.log(`\nVersion: ${VERSION}; 500 CSS px tall stage at DPR 1; software WebGL (SwiftShader) in headless Chromium\n`);
console.log('Live page, pointer moving (full rate):');
console.log(`  ${pad('Tier', 9)}${pad('Frame (ms)', 13)}${pad('FPS', 8)}Drawing buffer`);
for (const r of rows) {
  const s = r.stats;
  console.log(`  ${pad(r.tier, 9)}${pad(r.mean.toFixed(1), 13)}${pad(r.fps.toFixed(1), 8)}${s.bufferWidth ? `${s.bufferWidth}×${s.bufferHeight}` : 'poster + 2D face'}`);
}
console.log('\nRaw draw + gl.finish() per frame, 750 px tall buffer (the cap):');
for (const r of raw) console.log(`  ${pad(r.level === 2 ? 'high' : 'medium', 9)}${r.ms.toFixed(1)} ms (${r.w}×${r.h}, mean of ${r.n})`);
console.log(`\nAuto tier after 20 s: ${a.stats.tier} (${a.stats.reason}); steps: ${a.steps.map(s => `${s.tier} [${s.reason}]`).join(' → ') || 'none'}`);
