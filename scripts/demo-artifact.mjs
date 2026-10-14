// npm run demo:artifact — the demo page as one self-contained HTML file (JS, CSS and the four
// posters inlined) at demo-dist/kaykav-demo.html, for hosting where only a single file is served.
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './lib.mjs';

execSync('npx vite build --config vite.demo.config.ts --logLevel error', { cwd: ROOT, stdio: 'inherit' });
const out = resolve(ROOT, 'demo-dist');
const html = readFileSync(resolve(out, 'index.html'), 'utf8');
const assets = readdirSync(resolve(out, 'assets'));
const js = readFileSync(resolve(out, 'assets', assets.find(f => f.endsWith('.js'))), 'utf8');
const css = readFileSync(resolve(out, 'assets', assets.find(f => f.endsWith('.css'))), 'utf8');
if (js.includes('</script')) throw new Error('bundle contains </script');
const posters = Object.fromEntries(['head', 'pod', 'buddy', 'tall'].map(v =>
  [v, 'data:image/webp;base64,' + readFileSync(resolve(ROOT, 'public/posters', v + '.webp')).toString('base64')]));
const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
const page = `${title}
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css}</style>
${body.trim()}
<script>window.__KK_POSTERS = ${JSON.stringify(posters)};</script>
<script type="module">${js}</script>
`;
writeFileSync(resolve(out, 'kaykav-demo.html'), page);
console.log(`demo-dist/kaykav-demo.html: ${(page.length / 1024).toFixed(0)} KB`);
