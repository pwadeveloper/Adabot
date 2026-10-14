import { defineConfig } from 'vite';

// Builds the demo page as a plain app (one JS chunk, no library mode) for scripts/demo-artifact.mjs.
export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'demo-dist',
    emptyOutDir: true,
    target: 'es2020',
    modulePreload: false,
    rollupOptions: { input: 'index.html', output: { inlineDynamicImports: true } }
  }
});
