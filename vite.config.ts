import { defineConfig } from 'vite';

// `npm run dev` serves the demo page (index.html) and the tooling harness (harness/).
// `npm run build` builds the library: the core and the React wrapper as separate entries.
export default defineConfig({
  build: {
    target: 'es2020',
    sourcemap: true,
    lib: {
      entry: { 'kaykav-guide': 'src/index.ts', react: 'src/react.tsx' },
      formats: ['es']
    },
    rollupOptions: {
      external: ['react', 'react/jsx-runtime'],
      output: {
        // keep the React entry a client component for the Next.js App Router
        banner: chunk => (chunk.name === 'react' ? "'use client';" : '')
      }
    }
  },
  esbuild: { jsx: 'automatic' }
});
