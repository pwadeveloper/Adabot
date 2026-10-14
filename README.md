# kaykav-guide

The KayKav Academy course-guide mascot as a small web component: one raymarched WebGL
fragment shader draws a frosted-resin character with colour glowing inside it, and a 2D
canvas draws the screen face. Four versions (Head, Pod, Buddy, Tall), 33 expressions,
pointer-follow, spring antennas, tap reactions.

- Zero runtime dependencies, no 3D library. Core is 23.6 kB gzipped (`npm run build` prints it).
- Never taller than 500 CSS px; works down to 280 × 360.
- Renders nothing until it is within 200 px of the viewport; stops when offscreen or the tab is hidden.
- Drops to ~20 fps when nothing is changing; picks a quality tier from measured frame time.
- No network calls at runtime other than one poster image, and only in the Low tier.

```ts
import { createGuide } from 'kaykav-guide';

const guide = createGuide(document.querySelector('canvas')!, { version: 'buddy' });
guide.setMode('thinking');
// …as the reply streams in
guide.setMode('talking');
guide.setTalkLevel(0.8);
guide.on('tap', ({ part }) => console.log(part)); // 'body' | 'leftAntenna' | 'rightAntenna'
```

Give the canvas a size with CSS (for example `width: 100%; height: 420px`). The guide sets
`max-height: 500px` on it, `role="img"` and an `aria-label` that names the version and the
current expression ("KayKav course guide: Buddy, happy expression").

## API

### `createGuide(canvas, options?)`

| Option | Default | |
|---|---|---|
| `version` | `'buddy'` | `'head' \| 'pod' \| 'buddy' \| 'tall'` |
| `mode` | `'idle'` | `'idle' \| 'listening' \| 'thinking' \| 'talking' \| 'sleep'` |
| `tier` | `'auto'` | `'auto' \| 'high' \| 'medium' \| 'low'` (see [Tiers](#quality-tiers)) |
| `pointerFollow` | `true` | look toward the pointer anywhere on the page |
| `tapReactions` | `true` | built-in faces, jumps and antenna flicks when tapped |
| `sleepAfter` | `30000` | ms of no interaction in `idle` before it dozes off (`0` = never); it wakes on the next pointer move |
| `label` | `'KayKav course guide'` | start of the accessible label |
| `posterBase` | `posters/` next to the module | URL prefix for `head.webp`, `pod.webp`, … (Low tier) |
| `posters` | | explicit URL per version, overrides `posterBase` |
| `maxBufferHeight` | `750` | cap on the drawing-buffer height in device pixels |
| `allowSoftwareGL` | `false` | let software WebGL (SwiftShader) run the live tiers; for CI and tooling |

### Controller

| Method | |
|---|---|
| `setVersion(v)` | switch version. The new program compiles in the background; the old version stays on screen until it is ready |
| `setMode(m)` | `idle`, `listening`, `thinking`, `talking`, `sleep`; each has its own face and body language |
| `setTalkLevel(0..1)` | call as reply text streams in; drives the dash "mouth" while the Talking face shows. Decays by itself (≈0.6 s from 1 to 0), so call it per chunk; `0` stops it at once |
| `showFace(name, ms = 4200)` | any name from `FACES` (the prototype's keys, e.g. `'giggling'` is "Laughing hard"); `Infinity` holds it |
| `clearFace()` | back to the mode's face |
| `wave()`, `jump()` | Buddy and Tall wave an arm; Head and Pod wiggle their antennas |
| `lookAt(x, y)` | gaze, both in −1..1 (right and up are positive). The next pointer move takes over while pointer-follow is on |
| `setPointerFollow(on)` | |
| `setTier(t)` | override the tier, or `'auto'` |
| `on(event, fn)` → `off()` | `tap` `{ part }`, `facechange` `{ face, label }`, `modechange` `{ mode }`, `tierchange` `{ tier, reason }` |
| `getStats()` | `{ tier, setting, reason, bufferWidth, bufferHeight, frameMs, fps, scale, webgl }` |
| `version`, `mode`, `face` | current values (read-only) |
| `destroy()` | stops the loop, disconnects observers, removes listeners and the poster layer, frees the GL context. A canvas hosts one guide: use a fresh canvas after `destroy()` |

Antenna names in `tap` are from the viewer's side: `leftAntenna` is the one on the left of the screen.

Also exported: `FACES` (`[key, label]` pairs), `FACE_NAMES`, `FACE_LABEL`, `MODES`, `VERSIONS`,
`paintFaceTile(canvas, face)` (draws a face on its navy tile, for pickers) and the types.

### React

```tsx
// app/components/guide.tsx
'use client';
import { KayKavGuide } from 'kaykav-guide/react';

export function Guide({ talking, level }: { talking: boolean; level: number }) {
  return (
    <KayKavGuide
      className="h-[420px] w-full"
      version="buddy"
      mode={talking ? 'talking' : 'idle'}
      talkLevel={level}
      posterBase="/kaykav-guide/posters/"
      onTap={({ part }) => console.log(part)}
    />
  );
}
```

`<KayKavGuide />` takes every `createGuide` option as a prop, plus `face` / `faceMs`,
`talkLevel`, `lookAt={[x, y]}`, `onTap`, `onFaceChange`, `onModeChange`, `onTierChange`,
`className`, `style` and `height`. A `ref` gives you the controller. The built file starts with
`'use client'`, and nothing touches `window` until the component mounts, so it is safe to import
from a Server Component; with `next/dynamic` you can also load it with `{ ssr: false }` to keep it
out of the server bundle entirely. It creates its own canvas inside the box, so React StrictMode's
mount → unmount → mount works.

**Posters in Next.js:** copy `node_modules/kaykav-guide/dist/posters/*.webp` to
`public/kaykav-guide/posters/` (for example in a `postinstall` script) and pass
`posterBase="/kaykav-guide/posters/"`. Webpack rewrites `import.meta.url`, so the default
(next to the module) cannot be relied on there; when the module URL is not http(s), the default
falls back to `/kaykav-guide/posters/`.

## Quality tiers

| Tier | What it draws | When |
|---|---|---|
| **High** | the full shader with 5-sample supersampling on silhouette, grazing and screen-seam pixels, and a 16-step interior march (vs 10) | Auto steps up from Medium after two 1.5 s windows averaging under 18.5 ms per frame at full buffer scale, measured while drawing every frame (idle-rate samples never count toward stepping up); steps back (for good) if it averages over 21 ms |
| **Medium** | prototype quality: single sample, 10-step interior march. Scales its drawing buffer between 0.6× and 1× like the prototype | the start tier. Buffer scale drops 0.15 per window over 24 ms and recovers 0.1 per two windows under 18.5 ms |
| **Low** | a static WebP poster of the current version, the live 2D face mapped onto its screen with a CSS perspective transform, and a CSS bob | `prefers-reduced-motion`, `navigator.connection.saveData`, no WebGL (or a software-only GPU), a lost context, a shader that fails to compile, or Medium still over 30 ms at 0.6× for two windows |

Frame time is the interval from a drawn frame to the next display frame (so a slow GPU shows up
as late frames), averaged per 1.5 s window, ignoring 0.6 s after any change. At the idle ~20 fps
the GPU has 50 ms per draw and rarely delays the next display frame, so idle samples can only
ever argue for stepping down.

**Pixel budget.** The drawing buffer is `min(cssHeight × devicePixelRatio, 750)` tall
(× the Medium scale), whatever the window size. The pixel count is bounded, so High spends the
headroom on quality per pixel (extra edge samples, a finer interior march), not on more pixels.

**Idle.** While nothing changes (no pointer movement in the last 1.2 s, no talking, no
reaction, springs at rest) the loop draws at ~20 fps: enough for the bob and blinks. Anything
else returns it to full rate. The Low tier paints its face at 20 fps idle and 30 fps when active,
and only when the face actually changes.

**Shader compiles.** Only the version on screen is compiled (asynchronously when
`KHR_parallel_shader_compile` is available). The other versions compile one at a time in
`requestIdleCallback` once the first frame is up.

**Accessibility.** `role="img"` with a label that includes the current expression. Reduced
motion selects the Low tier: no bob, no shake, no animated glyphs. Under a forced live tier
it still cuts body motion. The Glitch face steps 2.5×/s and never drops below 55 % brightness.
`npm run faces` measures every face for flashes, per cell of an 8 × 5 grid over the screen
(a glyph jumping in one spot is a flash even if the face's average brightness barely moves):
the worst is Talking at 2 per second. The prototype's Glitch measured 4.5.

## Development

```sh
npm install
npm run dev        # demo page: version switcher, faces, modes, talk slider, tier override, readout
npm run build      # dist/: kaykav-guide.js, react.js, types/, posters/; prints the gzip sizes
npm run typecheck
npm run lint
npm run fidelity   # silhouette IoU vs the references → fidelity/
npm run faces      # expression grid + flash check → fidelity/faces.png
npm run posters    # re-render the Low-tier posters → public/posters/
npm run bench      # frame time per tier on this machine
npm run check:runtime  # lazy start, offscreen/hidden stop, 20 fps idle, taps, Low for reduced motion / Data Saver, destroy()
npm run check:react    # <KayKavGuide /> under React StrictMode
```

The tooling scripts start a Vite server and drive headless Chromium with Playwright, using
software WebGL. They need the Chromium build that matches the pinned `playwright` version
(`npx playwright install chromium` if it is missing). `?soft=1` on the demo page allows software
WebGL there too; `?tier=low|medium|high` and `?v=head|pod|buddy|tall` preset the controls.

### Fidelity reports

`npm run fidelity` follows `handoff/MEASUREMENTS.md`: reference background = median of a 20 px
border; character = RGB distance > 22; 7 px median filter; our render on a transparent
background with alpha > 110; both scaled to the same bbox height and centred; IoU. Two
additions, both about floor shadows, which pass the RGB-distance threshold and would stretch the
reference bbox (MEASUREMENTS.md's body ranges exclude them):

- neutral grey pixels (max − min of RGB ≤ 12) are shadow, never resin: every part of the
  character is tinted (the palest rim, `#d3d9e4`, has 17) while the contact shadows under Buddy's
  and Tall's feet are ≈ 8;
- mask components that lie entirely below the main silhouette are dropped (the Pod's floor shadow).

It writes per version: `<v>-overlay.png` (red = reference only, green = ours only),
`<v>-side-by-side.jpg` (same scale) and `<v>-render.jpg`, plus `report.json`.
`npm run fidelity -- --prototype` runs the original `handoff/prototype/kaykav-guide.html`
through the same loop (into `fidelity/prototype/`) for a before/after on equal terms;
`npm run fidelity -- head tall` limits the versions.

The antenna roots (mint glow) and the Pod's warm bulbs are close to the background colour and
partly drop out of the reference masks, so judge those by eye on the side-by-sides.

### Posters

`npm run posters` renders each version at High quality in its rest pose with a blank screen,
on a transparent background, at 720 × 900 (1.5× the 480 × 600 layout box), feathers the borders
so the floor shadow never ends in a hard edge, and lowers the WebP quality until the file is at
most 40 KB. The script fails if a poster cannot meet the budget. Files go to `public/posters/`,
which `vite build` copies to `dist/posters/`. Re-run it after any change to shapes or materials;
the face is drawn live on top, so face changes need no new posters.

## Layout

```
src/
  index.ts      public exports
  guide.ts      createGuide(): loop, visibility, idle rate, tiers, input, events
  renderer.ts   WebGL: programs per (version, level), face texture, draw
  shader.ts     the fragment shader (material model, tier defines)
  variants.ts   the four versions as signed-distance shapes + glow blobs
  rig.ts        motion: gaze, blinks, bob/jump/squash, spring antennas, arms, per-face body language
  faces.ts      every expression as glowing 2D strokes
  poster.ts     Low tier: poster + face overlay + CSS bob
  tier.ts       frame-time based tier selection
  react.tsx     <KayKavGuide />
demo/           npm run dev page
harness/        page the tooling scripts drive (not shipped)
scripts/        fidelity, faces, posters, bench
handoff/        the prototype, references and MEASUREMENTS.md this was built from
```
