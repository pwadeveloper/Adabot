You're taking over a working prototype of the KayKav Academy course-guide mascot and turning it into a small, production-quality web component. Read everything in `handoff/` before writing any code.

## What's in handoff/
- `prototype/kaykav-guide.html`: the working prototype, one file. A single raymarched WebGL fragment shader draws a frosted-resin character with colour glowing inside it. A 2D canvas draws the screen face and is sampled by the shader as a texture. It has four versions (Head, Pod, Buddy, Tall), about 33 expressions, pointer-follow, spring antennas, tap reactions and a demo chat. The chat uses `window.claude.use('sample')`, which only exists inside claude.ai, so ignore that part.
- `references/`: the target renders (`head.jpg`, `pod.jpg`, `buddy.jpg`, `tall.png`, `head-original.png`) and `expression-sheet.jpg`.
- `MEASUREMENTS.md`: silhouette and palette measurements taken from the references, current fit scores, known gaps, and decisions about duplicate faces on the sheet. Treat its numbers as the spec.

## Goal of this session
Build `kaykav-guide` as a standalone package (Vite + TypeScript strict, zero runtime dependencies). It renders the guide at most 500 CSS px tall and is light enough to sit on an LMS page. Keep visual fidelity to the references at least as good as the prototype, then improve it. Do not build any AI backend in this session.

## Hard constraints
1. Size: the guide's canvas is never taller than 500 CSS px, and must also work down to 280 × 360.
2. Fixed pixel budget: cap the drawing-buffer height (start with `min(cssHeight × devicePixelRatio, 750)`) instead of tying it to the window. Because the pixel count is bounded, spend the saved budget on quality per pixel (supersampled edges, more interior samples), not on more pixels.
3. Weight: no three.js or any other 3D library. Core JS ≤ 35 KB gzipped; report the number from the build output.
4. Runtime cost:
   - Render nothing until the canvas is within about 200 px of the viewport (IntersectionObserver). Stop the loop completely when offscreen or when the tab is hidden.
   - When nothing is changing (no pointer movement, no talking, no reaction playing), drop to about 20 fps for the idle bob and blinks; return to full rate on interaction.
   - Pick a quality tier from measured frame time. Start at Medium and step up or down:
     - High: edge supersampling plus the full interior march.
     - Medium: prototype quality.
     - Low: a static poster image of the current version, with the live 2D face canvas positioned over the screen and a CSS bob.
   - Low is also used for `prefers-reduced-motion`, failed WebGL, and `navigator.connection.saveData`.
   - Design for students on mid-range Android phones and metered mobile data.
5. Posters: `npm run posters` renders one WebP per version from the shader (Playwright), at most 40 KB each. They load only when Low is chosen.
6. Shader compile must not stall the page: compile only the version being shown, and precompile the others lazily on idle.
7. Accessibility: `role="img"` with a label that includes the current expression. Respect reduced motion. Nothing may flash more than 3 times a second (check the Glitch face).

## Public API (what the LMS will call later)
`createGuide(canvas, options)` returns a controller with:
- `setVersion('head' | 'pod' | 'buddy' | 'tall')`
- `setMode('idle' | 'listening' | 'thinking' | 'talking' | 'sleep')`
- `setTalkLevel(0..1)`, called as reply text streams in; it drives the dash "mouth"
- `showFace(name, ms?)`, with names exactly as in the prototype's FACES list
- `wave()`, `jump()`
- `lookAt(x, y)` with x and y in −1..1, plus pointer-follow on/off
- `on('tap', handler)`, reporting which part was tapped: body, left antenna, right antenna
- `destroy()`, which frees the GL context, observers and listeners

Also export a thin React wrapper `<KayKavGuide />` (client component, no SSR) taking the same options as props. The LMS it will go into is Next.js 15 App Router, TypeScript strict, Tailwind v4.

## Fidelity work
- Rebuild the measurement loop described in MEASUREMENTS.md as `npm run fidelity`. It renders each version with Playwright on a transparent background, computes IoU against the reference masks, and writes red/green overlays and same-scale side-by-sides to `fidelity/`. Print a table with one row per version.
- Then close the known gaps listed in MEASUREMENTS.md. Targets: IoU ≥ 0.92 for Head, Pod and Buddy; ≥ 0.90 for Tall. The side-by-sides are the final judge: do not trade looking right for a higher number.
- Keep the prototype's material model (milky surface, colour gathered along a refracted ray inside the body, thickness tint, fresnel lightening, soft AO) and tune toward the sampled palette.
- Port every face. Add `npm run faces`, which writes one grid image of all faces on the navy screen tile, laid out like `expression-sheet.jpg`, for comparison by eye.

## Demo page
`npm run dev` serves one page with:
- the guide in a 500 px tall box
- a version switcher and a face picker
- buttons for each mode and a talk-level slider
- a tier override (Auto / High / Medium / Low)
- a small readout of the current tier, drawing-buffer size and average frame time

## Out of scope
- No AI or chat backend, no API keys, no network calls at runtime.
- Do not touch the LMS repository.

## Done means
- `npm run build`, `npm run typecheck`, `npm run lint`, `npm run fidelity` and `npm run faces` all run. Report each result on its own line; never summarise them as "all green".
- A README covering the API, the tiers, and how to regenerate posters and fidelity reports.
- A short report with:
  - gzipped size
  - the IoU table before → after
  - average frame time per tier on this machine
  - anything you could not finish
