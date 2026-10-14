// Shared tooling: a Vite dev server plus a headless Chromium page on the harness.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Software WebGL is fine for stills; flags make headless Chromium expose it reliably.
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export async function withHarness(fn, { path = '/harness/index.html', viewport = { width: 800, height: 800 }, page: pageOpts = {} } = {}) {
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 0, strictPort: false } });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${server.config.server.port}/`;
  const browser = await chromium.launch({ args: GL_ARGS });
  try {
    const page = await browser.newPage({ viewport, ...pageOpts });
    page.on('pageerror', e => console.error('[page]', e.message));
    page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
    await page.goto(new URL(path.replace(/^\//, ''), url).href);
    if (path.startsWith('/harness')) await page.waitForFunction(() => window.KK && window.KK.ready, null, { timeout: 60000 });
    return await fn(page, url);
  } finally {
    await browser.close();
    await server.close();
  }
}

export function writeDataURL(file, dataURL) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(dataURL.slice(dataURL.indexOf(',') + 1), 'base64'));
}

export const pad = (s, n) => String(s).padEnd(n);
