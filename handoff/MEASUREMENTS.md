# KayKav guide: measurements from the reference renders

All numbers were measured from the files in `references/`. Units are **half the head's on-screen width = 1**, origin at the head centre, y up. Measurements are of the 2D images, so they include each render's camera angle; treat them as targets for the silhouette, not exact model dimensions.

## How the silhouettes were measured

1. Background colour = median of a 20 px border strip (all four renders are about `rgb(240,243,240)`).
2. A pixel is "character" if its RGB distance from the background is greater than 22.
3. 7 px median filter to clean the edge.
4. Our render: draw with a transparent background, take alpha > 110 as the mask.
5. Scale both masks to the same bounding-box height, centre them, and compute IoU (intersection over union). Also save a red/green overlay (red = reference only, green = ours only) and a same-scale side-by-side crop.

Unreliable regions: the mint-glowing antenna roots and the Pod's warm bulb tips are close to the background colour, so they partly drop out of the reference masks. Judge those by eye.

## Current fit (prototype v2)

| Version | Reference file | IoU now | Target |
|---|---|---|---|
| Head | `head.jpg` | 0.886 | ≥ 0.92 |
| Pod | `pod.jpg` | 0.864 | ≥ 0.92 |
| Buddy | `buddy.jpg` | 0.892 | ≥ 0.92 |
| Tall | `tall.png` | 0.760 | ≥ 0.90 |

## Shape findings

**All heads**
- Head silhouette is a superellipse with exponent n ≈ 3 (not a rounded rectangle). Screen opening is n ≈ 2.6–3.
- The eye line rises to the right by about 7° on Head, Pod and Buddy (about 3.5° on Tall). The silhouette also sits higher on the right. The prototype models this as a shear in head space (`SHEAR`).
- Faces: eye-ring centres are about 0.50 of the visible screen width apart. Ring outer diameter is about 0.14–0.15 of screen width, dash length about 0.07, and stroke about 0.03. Eyes sit on the screen's vertical centre.

**Head** (`head.jpg`, 1918×2240)
- Head body: x 437–1516, y ≈ 690–1469. Height/width of head ≈ 0.72.
- Screen: x 647–1411, y 790–1325. Screen centre sits about +0.04 above head centre and is shifted right by the camera yaw.
- Bottom-left lobe hangs lowest (lowest point about 0.33 left of centre). Top edge sits highest right of centre.
- Antennas are straight, tapering wider toward a rounded tip, radius ≈ 0.10 at the root to 0.13 at the tip. Left root (−0.59, 0.72) → tip centre (−0.82, 1.23). Right root (0.32, 0.72) → tip centre (0.44, 1.33).

**Pod** (`pod.jpg`)
- Body: x 381–1492, y ≈ 520–1660 → half-height ≈ 1.03. Bottom is more rounded than the top; the left side recedes toward the bottom.
- Screen: x 526–1361, y 634–1191; centre about +0.32 above body centre.
- Antennas: short, slightly curved stems with warm bulb tips (tip radius ≈ 0.11–0.13). Left tip centre ≈ (−0.69, 1.25), right ≈ (0.43, 1.34).

**Buddy** (`buddy.jpg`)
- Head: x 378–1479, y 536–≈1300 → half-height ≈ 0.69–0.75.
- Screen: x 526–1361, y 630–1192 (the screen is large; rims are thin).
- Torso: nearly straight-sided, half-width 0.65 at y −1.31 and about 0.54 at the crotch (y −1.75); torso centre about +0.09 right of head centre.
- Legs: short columns, centres x −0.225 and +0.41, radius ≈ 0.2, feet bottom y −1.94.
- Left arm: shoulder (−0.5, −0.85) → hand centre (−0.76, −1.36), radius ≈ 0.13–0.14.
- Right (waving) arm: shoulder (0.64, −0.8) → hand centre (1.05, −0.58), radius ≈ 0.15–0.17.
- Antennas are short and stubby: left root (−0.55, 0.69) → tip (−0.72, 0.93); right root (0.38, 0.69) → tip (0.44, 1.07); radius ≈ 0.12.

**Tall** (`tall.png`, 877×1024)
- Head: x 268–597, y 200–420 → half-height 0.67. Screen: x 309–557, y 223–382.
- Antenna tips (−0.77, 1.22) and (0.49, 1.34), radius ≈ 0.13.
- Torso: half-width 0.47 at y −1.35, 0.39 at y −2.15; crotch at y −2.29. Slim, no boxy shoulders.
- Legs: centres x −0.2 and +0.28, radius ≈ 0.14, down to y −3.9. Feet flare (half-widths 0.24 and 0.31), bottom y −3.96.
- Left arm hangs slightly outward: shoulder (−0.53, −0.97) → (−0.60, −1.35) → (−0.78, −2.15) → hand centre (−0.76, −2.49), hand bottom −2.89. Radius ≈ 0.12.
- Right arm waves: shoulder (0.53, −0.97) → elbow (1.13, −0.85) → wrist (1.38, −0.43) → palm centre (1.47, −0.15); four fingers spread upward to about y +0.17, plus a thumb.

## Palette sampled from the renders

| Region | Hex |
|---|---|
| Head rim, top | `#c9d1e3` – `#d3d9e4` |
| Head rim, sides | `#a1b1d0` – `#b1bdd6` |
| Head rim, bottom (body glow showing through) | `#5d8ed5` (Buddy), `#90bde2` (Head) |
| Rim inner edge, lower-left (Head) | `#5e8ccc` |
| Antenna tip | `#dee3ee` |
| Antenna middle | `#c5e9fb` |
| Antenna root (mint glow) | `#e0fefa` – `#e7fef4` |
| Pod bulb tip / stem | `#fffdee` / `#fbeee5` |
| Belly cyan core | `#42ace1` – `#51c0e6` |
| Chest cobalt | `#3d75d3` |
| Torso sides | `#9eb7dc` |
| Lower torso | `#9fd2e8` |
| Arms and legs (thin, translucent) | `#cbd7e2` – `#dce4eb` |
| Screen centre | `#2b3d69` |
| Screen top-right reflection | `#3a578f` |
| Screen bottom-left | `#283f73` |
| Background | `#f0f3f0` |

## Known gaps in prototype v2

- Tall: torso still too broad at the shoulders, legs slightly short, left arm angle.
- Buddy: head a touch narrow at the bottom compared with the torso; left arm should sit higher and more outward.
- Head: top rim reads slightly thick; left side a little too saturated.
- Pod: lower body glow too even; the reference has a cyan patch left-centre, a cobalt patch right and paler bottom-left.
- Screen-to-rim seam still shows stair-stepping at low resolution (it is blended across about 1 px).
- Antenna tips show a small specular "dot"; the references have a softer highlight.

## Expression sheet decisions

`expression-sheet.jpg` has duplicates. The prototype resolved them like this:
- Two "Laughing": the second (zigzag both eyes) is named **Laughing hard**.
- Two "Skeptical": identical, kept once.
- Two "Nervous": the comma pair is **Nervous**, the wavy line is **Jittery**.
- "Tired" used the same glyph as "Excited"; it was redrawn with droopy lids so the two differ.
