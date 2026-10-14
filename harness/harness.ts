// Tooling harness: renders stills straight from the renderer and runs the
// measurement loop from handoff/MEASUREMENTS.md. Exposed as window.KK for Playwright.

import { framing, project } from '../src/camera';
import { FACES, FH, FW, paintFace, paintFaceCanvas, paintTile, type FaceName } from '../src/faces';
import { faceCorners } from '../src/geometry';
import { Renderer } from '../src/renderer';
import { Rig } from '../src/rig';
import type { Level } from '../src/shader';
import { VARIANTS, type Version } from '../src/variants';

interface Mask { m: Uint8Array; w: number; h: number }
interface Box { x0: number; y0: number; x1: number; y1: number }

const loadImage = (url: string): Promise<HTMLImageElement> => new Promise((res, rej) => {
  const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('load ' + url)); im.src = url;
});

function pixels(src: CanvasImageSource, w: number, h: number): Uint8ClampedArray {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

/**
 * Steps 1–3: background = median of a 20 px border; RGB distance > 22; 7 px median filter.
 * Plus: neutral grey pixels (max − min of RGB ≤ 12) are floor shadow, never resin. Every part
 * of the character is tinted (the palest rim, #d3d9e4, has 17); the contact shadows under
 * Buddy's and Tall's feet are grey (≈ 8) and would otherwise stretch the bbox.
 */
function refMask(img: HTMLImageElement): Mask {
  const w = img.naturalWidth, h = img.naturalHeight, d = pixels(img, w, h);
  const ch: number[][] = [[], [], []];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x >= 20 && x < w - 20 && y >= 20 && y < h - 20) continue;
    const i = (y * w + x) * 4; ch[0]!.push(d[i]!); ch[1]!.push(d[i + 1]!); ch[2]!.push(d[i + 2]!);
  }
  const med = ch.map(a => { a.sort((p, q) => p - q); return a[a.length >> 1]!; });
  const raw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4]!, g = d[i * 4 + 1]!, b = d[i * 4 + 2]!;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    raw[i] = Math.hypot(r - med[0]!, g - med[1]!, b - med[2]!) > 22 && chroma > 12 ? 1 : 0;
  }
  return dropFloorShadow({ m: median(raw, w, h, 3), w, h });
}

/**
 * Step 3b: the Pod's floor shadow is darker than the threshold and would stretch the
 * bbox (MEASUREMENTS.md's Pod body range y ≈ 520–1660 excludes it). Drop every
 * connected component that lies entirely below the largest one.
 */
function dropFloorShadow(k: Mask): Mask {
  const { w, h, m } = k, lab = new Int32Array(w * h), stack: number[] = [];
  const comps: Array<{ n: number; y0: number; y1: number }> = [];
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || lab[s]) continue;
    const id = comps.length + 1, c = { n: 0, y0: h, y1: 0 };
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i - x) / w;
      c.n++; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && m[j] && !lab[j]) { lab[j] = id; stack.push(j); }
    }
    comps.push(c);
  }
  const main = comps.reduce((a, b) => (b.n > a.n ? b : a), comps[0]!);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { const l = lab[i]!; if (l && comps[l - 1]!.y0 <= main.y1) out[i] = 1; }
  return { m: out, w, h };
}

/** Binary median over a (2r+1)² window via a summed-area table. */
function median(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const S = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) { row += m[y * w + x]!; S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1]! + row; }
  }
  const out = new Uint8Array(w * h), half = ((2 * r + 1) ** 2) / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(w, x + r + 1), y1 = Math.min(h, y + r + 1);
    const n = S[y1 * (w + 1) + x1]! - S[y0 * (w + 1) + x1]! - S[y1 * (w + 1) + x0]! + S[y0 * (w + 1) + x0]!;
    out[y * w + x] = n > ((x1 - x0) * (y1 - y0) === (2 * r + 1) ** 2 ? half : ((x1 - x0) * (y1 - y0)) / 2) ? 1 : 0;
  }
  return out;
}

function bbox(k: Mask): Box {
  let x0 = k.w, y0 = k.h, x1 = -1, y1 = -1;
  for (let y = 0; y < k.h; y++) for (let x = 0; x < k.w; x++) if (k.m[y * k.w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Step 5: scale to a common bbox height, centre on the bbox centre. */
function place(k: Mask, b: Box, H: number, W: number, pad: number): Uint8Array {
  const s = (b.y1 - b.y0) / H, out = new Uint8Array(W * (H + 2 * pad));
  const cx = (b.x0 + b.x1) / 2;
  for (let y = 0; y < H + 2 * pad; y++) for (let x = 0; x < W; x++) {
    const sx = Math.floor(cx + (x + 0.5 - W / 2) * s), sy = Math.floor(b.y0 + (y - pad + 0.5) * s);
    if (sx >= 0 && sy >= 0 && sx < k.w && sy < k.h) out[y * W + x] = k.m[sy * k.w + sx]!;
  }
  return out;
}

interface RenderOpts { level?: Level; face?: FaceName | null; t?: number; bg?: string | null }

const glCanvas = document.createElement('canvas');
let renderer: Renderer | null = null;

/** Renders the rest pose of a version into a w×h transparent canvas. */
async function renderStill(version: Version, w: number, h: number, o: RenderOpts = {}): Promise<HTMLCanvasElement> {
  glCanvas.width = w; glCanvas.height = h;
  renderer ??= Renderer.create(glCanvas, { allowSoftware: true, preserve: true });
  if (!renderer) throw new Error('no WebGL');
  const level = o.level ?? 2;
  while (renderer.request(version, level) === 'pending') await new Promise(r => setTimeout(r, 30));
  if (renderer.request(version, level) === 'failed') throw new Error('shader failed');
  const face = document.createElement('canvas'); face.width = FW; face.height = FH;
  if (o.face !== null) paintFaceCanvas(face, o.face ?? 'neutral', { t: o.t ?? 0, open: 1, talk: 0, lx: 0, ly: 0 });
  renderer.uploadFace(face);
  renderer.draw(version, level, Rig.restWorld(version), framing(VARIANTS[version], w, h), w, h);
  renderer.gl.finish();
  return glCanvas;
}

const toURL = (c: HTMLCanvasElement, type = 'image/png', q?: number): string => c.toDataURL(type, q);

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

/** Steps 4–5 for one version: IoU plus a red/green overlay and a same-scale side-by-side. */
async function fidelity(version: Version, refUrl: string, oursUrl?: string): Promise<{ iou: number; overlay: string; side: string; ours: string }> {
  const img = await loadImage(refUrl);
  const ref = refMask(img), rb = bbox(ref);
  let cv: CanvasImageSource, rw: number, rh: number;
  if (oursUrl) {
    // an external render (the original prototype, captured by scripts/fidelity.mjs --prototype)
    const o = await loadImage(oursUrl); cv = o; rw = o.naturalWidth; rh = o.naturalHeight;
  } else {
    rw = img.naturalWidth > 1200 ? Math.round(img.naturalWidth / 2) : img.naturalWidth;
    rh = Math.round((rw / img.naturalWidth) * img.naturalHeight);
    cv = await renderStill(version, rw, rh, { level: 2 });
  }
  const d = pixels(cv, rw, rh);
  const ourM = new Uint8Array(rw * rh);
  for (let i = 0; i < rw * rh; i++) ourM[i] = d[i * 4 + 3]! > 110 ? 1 : 0;
  const ours: Mask = { m: ourM, w: rw, h: rh }, ob = bbox(ours);

  const H = 800, pad = 20;
  const wOf = (b: Box): number => ((b.x1 - b.x0) / (b.y1 - b.y0)) * H;
  const W = Math.ceil(Math.max(wOf(rb), wOf(ob))) + 2 * pad, HH = H + 2 * pad;
  const A = place(ref, rb, H, W, pad), B = place(ours, ob, H, W, pad);
  let inter = 0, uni = 0;
  const [oc, octx] = canvasOf(W, HH), od = octx.createImageData(W, HH);
  for (let i = 0; i < W * HH; i++) {
    const a = A[i]!, b = B[i]!;
    inter += a & b; uni += a | b;
    const col = a && b ? [196, 200, 210] : a ? [222, 40, 40] : b ? [30, 170, 60] : [255, 255, 255];
    od.data.set([col[0]!, col[1]!, col[2]!, 255], i * 4);
  }
  octx.putImageData(od, 0, 0);

  // same-scale side-by-side: reference crop | ours on the reference background
  const [sc, sctx] = canvasOf(W * 2 + 10, HH + 36);
  sctx.fillStyle = '#ffffff'; sctx.fillRect(0, 0, sc.width, sc.height);
  const drawCrop = (src: CanvasImageSource, b: Box, x: number, bgFill: string | null): void => {
    const s = (b.y1 - b.y0) / H, cx = (b.x0 + b.x1) / 2;
    if (bgFill) { sctx.fillStyle = bgFill; sctx.fillRect(x, 0, W, HH); }
    sctx.drawImage(src, cx - (W / 2) * s, b.y0 - pad * s, W * s, HH * s, x, 0, W, HH);
  };
  drawCrop(img, rb, 0, null);
  drawCrop(cv, ob, W + 10, '#f0f3f0');
  sctx.fillStyle = '#16204a'; sctx.font = '600 20px system-ui, sans-serif';
  sctx.fillText('reference', 12, HH + 26); sctx.fillText(`ours · IoU ${(inter / uni).toFixed(3)}`, W + 22, HH + 26);

  const [fc, fctx] = canvasOf(rw, rh);
  fctx.fillStyle = '#f0f3f0'; fctx.fillRect(0, 0, rw, rh); fctx.drawImage(cv, 0, 0);
  return { iou: inter / uni, overlay: toURL(oc), side: toURL(sc, 'image/jpeg', 0.9), ours: toURL(fc, 'image/jpeg', 0.92) };
}

/** Poster: rest pose with a blank screen, transparent background, as WebP under a byte budget. */
async function poster(version: Version, w: number, h: number, maxBytes: number): Promise<{ url: string; bytes: number; q: number }> {
  const cv = await renderStill(version, w, h, { level: 2, face: null });
  const [c, ctx] = canvasOf(w, h); ctx.drawImage(cv, 0, 0);
  // feather the borders so the soft floor shadow never ends in a hard edge on the page
  ctx.globalCompositeOperation = 'destination-in';
  const f = 0.07;
  for (const [x0, y0, x1, y1] of [[0, 0, w, 0], [0, 0, 0, h]] as const) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(f, '#000'); g.addColorStop(1 - f, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
  let q = 0.9, url = '', bytes = Infinity;
  while (q >= 0.3) {
    url = c.toDataURL('image/webp', q);
    bytes = Math.floor(((url.length - url.indexOf(',') - 1) * 3) / 4);
    if (bytes <= maxBytes) break;
    q -= 0.05;
  }
  return { url, bytes, q };
}

/** Where the face texture sits on a poster (for checking the Low-tier overlay). */
function posterFaceQuad(version: Version, w: number, h: number): Array<[number, number] | null> {
  const v = VARIANTS[version], cam = framing(v, w, h);
  return faceCorners(v, Rig.restWorld(version)).map(p => project(cam, p, w, h));
}

// ---- expression grid laid out like references/expression-sheet.jpg ----
const SHEET: FaceName[][] = [
  ['neutral', 'happy', 'sad', 'surprised'],
  ['confused', 'excited', 'tired', 'wink'],
  ['crying', 'laughing', 'giggling', 'shy'],
  ['love', 'thinking', 'sleeping', 'dizzy', 'bored'],
  ['proud', 'skeptical', 'scared', 'skeptical', 'determined'],
  ['playful', 'curious', 'shocked', 'relaxed', 'gloating'],
  ['nervous', 'jittery', 'cheeky', 'peaceful', 'glitch'],
  ['listening', 'talking']
];
const LABEL = Object.fromEntries(FACES) as Record<FaceName, string>;

function faceGrid(t: number): string {
  const W = 1856, M = 70, rowH = 316;
  const [c, ctx] = canvasOf(W, M * 2 + rowH * SHEET.length + 40);
  ctx.fillStyle = '#f3f4f1'; ctx.fillRect(0, 0, c.width, c.height);
  SHEET.forEach((row, r) => {
    const n = row.length === 4 || r === SHEET.length - 1 ? 4 : 5;
    const gap = n === 4 ? 106 : 46, tw = (W - 2 * M - gap * (n - 1)) / n, th = tw / 1.6;
    row.forEach((f, i) => {
      const x = M + i * (tw + gap), y = M + r * rowH;
      paintTile(ctx, x, y, tw, th);
      const s = (tw * 0.95) / FW;
      ctx.save(); ctx.setTransform(s, 0, 0, s, x + tw * 0.025, y + (th - FH * s) / 2);
      paintFace(ctx, f, { t, open: 1, talk: 0.7, lx: 0, ly: 0 }, s);
      ctx.restore();
      ctx.fillStyle = '#16204a'; ctx.font = '500 34px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText((r === SHEET.length - 1 ? LABEL[f] + ' (extra)' : LABEL[f]).toUpperCase(), x + tw / 2, y + th + 50);
    });
  });
  return toURL(c);
}

/** The sheet and our grid next to each other at the same width. */
async function faceCompare(sheetUrl: string, gridUrl: string): Promise<string> {
  const [sheet, grid] = await Promise.all([loadImage(sheetUrl), loadImage(gridUrl)]);
  const W = 900, hs = (sheet.naturalHeight * W) / sheet.naturalWidth, hg = (grid.naturalHeight * W) / grid.naturalWidth;
  const [c, ctx] = canvasOf(W * 2 + 20, Math.ceil(Math.max(hs, hg)));
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(sheet, 0, 0, W, hs); ctx.drawImage(grid, W + 20, 0, W, hg);
  return toURL(c, 'image/jpeg', 0.88);
}

/**
 * Flash check: luminance of the glyph layer over 4 s at 60 fps, measured per cell of an
 * 8 × 5 grid over the screen (a glyph jumping in one spot is a flash even if the face's mean
 * barely moves). A transition is a swing of more than 10 % of the brightest cell's peak
 * against the previous direction; a flash is a pair of them. Returns the worst cell's worst
 * 1 s window, in flashes per second.
 */
function flashRate(face: FaceName): number {
  const CW = 8, CH = 5, W = 256, H = 160, cw = W / CW, ch = H / CH;
  const [, ctx] = canvasOf(W, H);
  const series: number[][] = Array.from({ length: CW * CH }, () => []);
  for (let i = 0; i < 240; i++) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
    paintFace(ctx, face, { t: 10 + i / 60, open: 1, talk: 0.8, lx: 0, ly: 0 }, 0.25);
    const d = ctx.getImageData(0, 0, W, H).data, sums = new Array<number>(CW * CH).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      sums[Math.floor(y / ch) * CW + Math.floor(x / cw)]! += ((0.2126 * d[k]! + 0.7152 * d[k + 1]! + 0.0722 * d[k + 2]!) * d[k + 3]!) / 255;
    }
    sums.forEach((v, c) => series[c]!.push(v));
  }
  const thr = Math.max(...series.map(s => Math.max(...s))) * 0.1;
  let worst = 0;
  for (const lum of series) {
    const trans: number[] = [];
    let ext = lum[0]!, dir = 0;
    lum.forEach((v, i) => {
      if (dir === 0) { if (v > ext + thr) { dir = 1; ext = v; trans.push(i); } else if (v < ext - thr) { dir = -1; ext = v; trans.push(i); } }
      else if (dir === 1) { if (v > ext) ext = v; else if (v < ext - thr) { dir = -1; ext = v; trans.push(i); } }
      else if (v < ext) ext = v; else if (v > ext + thr) { dir = 1; ext = v; trans.push(i); }
    });
    for (let i = 0; i < trans.length; i++) {
      let n = 0;
      for (let j = i; j < trans.length && trans[j]! - trans[i]! < 60; j++) n++;
      worst = Math.max(worst, n / 2);
    }
  }
  return worst;
}

/** A still on the reference background colour, as a PNG data URL. */
async function still(version: Version, w: number, h: number, level: Level): Promise<string> {
  const cv = await renderStill(version, w, h, { level });
  const [c, ctx] = canvasOf(w, h);
  ctx.fillStyle = '#f0f3f0'; ctx.fillRect(0, 0, w, h); ctx.drawImage(cv, 0, 0);
  return toURL(c);
}

/** Mean draw + finish time per level at the 750 px drawing-buffer cap (4:3 stage). */
async function drawCost(version: Version, levels: Level[], n: number): Promise<Array<{ level: Level; ms: number; w: number; h: number; n: number }>> {
  const h = 750, w = 1000, out: Array<{ level: Level; ms: number; w: number; h: number; n: number }> = [];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const r = Renderer.create(c, { allowSoftware: true })!;
  const face = document.createElement('canvas'); face.width = 512; face.height = 320;
  paintFaceCanvas(face, 'neutral', { t: 0, open: 1, talk: 0, lx: 0, ly: 0 });
  r.uploadFace(face);
  const world = Rig.restWorld(version), cam = framing(VARIANTS[version], w, h);
  for (const level of levels) {
    while (r.request(version, level) === 'pending') await new Promise(res => setTimeout(res, 20));
    r.draw(version, level, world, cam, w, h); r.gl.finish(); // warm-up
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { r.draw(version, level, world, cam, w, h); r.gl.finish(); }
    out.push({ level, ms: (performance.now() - t0) / n, w, h, n });
  }
  r.destroy();
  return out;
}

// ---- tuning: score a patched variant quickly (low resolution, Medium level) ----
const ORIGINAL = JSON.parse(JSON.stringify(VARIANTS)) as typeof VARIANTS;
const refCache = new Map<string, { k: Mask; b: Box; w: number; h: number }>();

function applyPatch(version: Version, patch: Record<string, unknown>): void {
  const base = JSON.parse(JSON.stringify(ORIGINAL[version])) as Record<string, unknown>;
  for (const [k, val] of Object.entries(patch)) {
    const cur = base[k];
    base[k] = cur && typeof cur === 'object' && !Array.isArray(cur) && val && typeof val === 'object' && !Array.isArray(val)
      ? { ...cur, ...val } : val;
  }
  Object.assign(VARIANTS[version], base);
}

async function score(version: Version, refUrl: string, patch: Record<string, unknown>, width = 480): Promise<number> {
  let ref = refCache.get(refUrl);
  if (!ref) {
    const img = await loadImage(refUrl), k = refMask(img);
    ref = { k, b: bbox(k), w: img.naturalWidth, h: img.naturalHeight };
    refCache.set(refUrl, ref);
  }
  applyPatch(version, patch);
  const w = width, h = Math.round((width / ref.w) * ref.h);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const r = Renderer.create(c, { allowSoftware: true, preserve: true })!;
  while (r.request(version, 1) === 'pending') await new Promise(res => setTimeout(res, 20));
  const face = document.createElement('canvas'); face.width = 64; face.height = 40; r.uploadFace(face);
  r.draw(version, 1, Rig.restWorld(version), framing(VARIANTS[version], w, h), w, h);
  const px = new Uint8Array(w * h * 4);
  r.gl.readPixels(0, 0, w, h, r.gl.RGBA, r.gl.UNSIGNED_BYTE, px);
  r.destroy();
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = px[((h - 1 - y) * w + x) * 4 + 3]! > 110 ? 1 : 0;
  const ours: Mask = { m, w, h }, ob = bbox(ours);
  const H = 400, pad = 10, wOf = (b: Box): number => ((b.x1 - b.x0) / (b.y1 - b.y0)) * H;
  const W = Math.ceil(Math.max(wOf(ref.b), wOf(ob))) + 2 * pad;
  const A = place(ref.k, ref.b, H, W, pad), B = place(ours, ob, H, W, pad);
  let inter = 0, uni = 0;
  for (let i = 0; i < A.length; i++) { inter += A[i]! & B[i]!; uni += A[i]! | B[i]!; }
  return inter / uni;
}

declare global { interface Window { KK: unknown } }
window.KK = {
  fidelity, poster, posterFaceQuad, faceGrid, faceCompare, flashRate, score, drawCost, still,
  faces: FACES.map(f => f[0]),
  ready: true
};
