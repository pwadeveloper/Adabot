# kaykav-guide: session report

## Commands

- `npm run build`: exit 0. Vite: `dist/kaykav-guide.js 72.86 kB │ gzip: 23.57 kB`, `dist/react.js 2.45 kB │ gzip: 1.10 kB`. Posters 36–37 KB each.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run fidelity`: exit 0; all four versions meet their targets (table below).
- `npm run faces`: exit 0; 33 faces; worst flash rate is Talking at 2 per second (limit 3).
- `npm run check:runtime`: 13/13 checks pass.
- `npm run check:react`: passes under React StrictMode.
- `npm run posters`: exit 0; 36.2 / 36.9 / 37.4 / 36.6 KB (limit 40 KB).
- `npm run bench`: numbers below.

## Size

Core JS is **23.57 kB gzipped** (Vite's build output), against a 35 KB budget. `scripts/size.mjs`
measures 22.85 KiB at gzip -9. The React wrapper adds 1.10 kB and imports the core. Nothing else
loads at runtime except one ≤ 40 KB WebP poster, and only when the Low tier is shown.

## Silhouette IoU, before → after

"Before" is the original `handoff/prototype/kaykav-guide.html`, captured through the same loop
(`npm run fidelity -- --prototype`). The loop follows MEASUREMENTS.md, plus two rules that drop
floor shadows from the reference masks (see README). Those rules change the reference masks, so the
handoff's own numbers are listed separately; they don't compare directly.

| Version | Handoff (v2) | Before (prototype, this loop) | After | Target |
|---|---|---|---|---|
| Head | 0.886 | 0.889 | **0.940** | ≥ 0.92 |
| Pod | 0.864 | 0.901 | **0.933** | ≥ 0.92 |
| Buddy | 0.892 | 0.888 | **0.942** | ≥ 0.92 |
| Tall | 0.760 | 0.792 | **0.901** | ≥ 0.90 |

Colour, as mean ΔE (CIELAB) between the same-scale side-by-sides, cell by cell over the
character, with glyphs excluded. Lower is better:

| Version | Before | After |
|---|---|---|
| Head | 13.6 | 10.2 |
| Pod | 12.4 | 9.0 |
| Buddy | 14.4 | 10.7 |
| Tall | 12.3 | 9.7 |

Screen and eye line, measured on the renders against the references (head half-width = 1):

| Version | Screen half-size, ref → ours | Eye line, ref → before → ours |
|---|---|---|
| Head | 0.709×0.501 → 0.704×0.512 | 6.3° → 3.1° → 6.3° |
| Pod | 0.761×0.512 → 0.757×0.512 | 6.5° → 1.5° → 6.4° |
| Buddy | 0.760×0.512 → 0.750×0.515 | 6.5° → 1.5° → 6.8° |
| Tall | 0.757×0.486 → 0.755×0.481 | 6.0° → 1.8° → 6.0° |

What closed the gaps:
- **Every head:** the screen opening now has its own shear, separate from the outer shell, so the
  eye line rises about 6.4° as measured without tilting the silhouette. Screens are resized to the
  measured openings. Faces follow MEASUREMENTS: ring ≈ 0.15 of screen width, stroke 0.03, eyes 0.50 apart.
- **Head:** the body is wider and the top rim lower. The bottom-left lobe is smaller. The left-side
  glow is less saturated.
- **Pod:** the left side recedes toward the bottom. The glow now has the cyan patch left of
  centre, the cobalt patch right, and a pale bottom-left. The bulbs are calmer and the stems wider.
- **Buddy:** the torso is nearly straight-sided and narrows to the crotch. Legs are short columns
  at the measured positions. The head corners are rounder and the left arm sits higher.
- **Tall:** a slim neck widens to the chest. The left hand is a mitten with a thumb, and the feet
  flare into the leg. The torso and limbs carry the sampled blues.
- **Material:** floor bounce on undersides, lighter AO, the sampled screen palette, and less
  contrast between the lit and shadow sides. The antenna highlight is now a broad, dim sheen,
  not a dot.
- **Screen-to-rim seam:** the High tier supersamples silhouette, grazing and seam pixels
  (5 samples). The stair-stepping is gone at 280×360 (`fidelity/_work` comparison, not committed).

Shape parameters came from a bounded local search on IoU at low resolution. Every result was then
checked on the side-by-sides. Where the search was chasing mask artefacts, I pulled the values back
to MEASUREMENTS.md: the left antenna root on Head, the leg length and thickness on Buddy, and the
torso shape on Tall. For Buddy that cost IoU at first, until the floor-shadow rule fixed the
reference mask itself.

## Frame time per tier on this machine

This machine has no GPU: headless Chromium with SwiftShader (software WebGL) on 4 CPU cores. These
numbers say nothing about a phone except that the tier logic reacts correctly. Buddy, 500 CSS px
stage at DPR 1, pointer kept moving so the loop draws every frame:

| Tier | Mean frame interval | FPS | Buffer |
|---|---|---|---|
| High | 1417 ms | 0.7 | 591×498 |
| Medium | 767 ms | 1.3 | 591×498 |
| Low | 16.7 ms | 60 | poster + 2D face |

Raw GPU time per frame at the 1000×750 buffer cap (draw plus a synchronising 1-pixel readback):
Medium 575 / 638 / 959–1137 / 1328 ms and High 979 / 1069 / 1757–2138 / 2418 ms for
Head / Pod / Buddy / Tall. High costs about 1.8× Medium. Auto, left to itself here, steps down to Low
with "slow frames", which is the right call for a software renderer. On a real GPU, Medium and High
should be one to two orders of magnitude faster; I could not measure that here.

## Things to know / not finished

- **No real-device numbers.** Every frame time above is from software WebGL. The tier thresholds
  (Medium scales down above 24 ms, goes to Low above 30 ms at 0.6×, steps up below 18.5 ms) are
  untested on a mid-range Android phone. That is the first thing to try on hardware.
- **Tall is only just over target**, at 0.901. It is the version where IoU and looks pulled
  hardest against each other; any further shape change there needs a re-run of `npm run fidelity`.
- **Medium keeps the prototype's single-sample edges.** The seam and silhouette stair-step slightly
  at small sizes. Only High supersamples, as specified.
- **Colour is closer but not matched.** ΔE is still 9–11. The Head and Pod references disagree on
  the screen colour (Head's screen is lighter steel blue, Pod's a deeper blue), so the screen uses
  the sampled palette from MEASUREMENTS.md and doesn't follow either render exactly.
- **Untested paths:** the asynchronous compile (`KHR_parallel_shader_compile` is not exposed by
  SwiftShader, so only the synchronous path ran), WebGL context loss and restore, and real touch
  input.
- **Next.js:** checked only in a StrictMode React harness, not in an App Router app. Posters must be
  copied to `public/` and passed as `posterBase` (README explains why).
- **Antenna roots and the Pod bulbs** drop out of the reference masks (as MEASUREMENTS.md warns). I
  judged them by eye only.
- **Faces:** the shapes match the sheet cell for cell (`fidelity/faces-vs-sheet.jpg`). The sheet's
  glow is a touch heavier than ours at tile size.
