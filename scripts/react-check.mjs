// npm run check:react — mounts <KayKavGuide /> under React StrictMode (mount → unmount → mount)
// and checks that exactly one live canvas remains, the face prop applies and the label follows.
import { withHarness } from './lib.mjs';
await withHarness(async page => {
  await page.waitForTimeout(5000);
  const r = await page.evaluate(() => {
    const g = window.kk.ref.current;
    return { canvases: document.querySelectorAll('canvas').length, posters: document.querySelectorAll('[data-kaykav-poster]').length, stats: g && g.getStats(), label: document.querySelector('canvas')?.getAttribute('aria-label'), version: g?.version };
  });
  const label = (await page.evaluate(() => window.kk.setFace('happy')), await page.waitForTimeout(800), await page.evaluate(() => document.querySelector('canvas').getAttribute('aria-label')));
  const ok = r.canvases === 1 && r.stats && r.stats.webgl && r.version === 'pod' && /happy/.test(label);
  console.log(`canvases: ${r.canvases}, tier: ${r.stats?.tier}, webgl: ${r.stats?.webgl}, label after face prop: "${label}"`);
  console.log(ok ? 'React wrapper OK under StrictMode' : 'React wrapper check FAILED');
  if (!ok) process.exitCode = 1;
}, { path: '/harness/react.html', viewport: { width: 500, height: 520 } });
