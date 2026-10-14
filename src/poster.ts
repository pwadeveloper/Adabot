// Low tier: a static poster of the current version, the live 2D face laid over its
// screen with a CSS perspective transform, and a CSS bob. No WebGL needed.

import { framing, project } from './camera';
import { FH, FW, paintFace, paintTile, type FaceName, type FaceParams } from './faces';
import { faceCorners } from './geometry';
import { POSTER_H, POSTER_W } from './poster-meta';
import { Rig } from './rig';
import { VARIANTS, type Version } from './variants';

type P2 = [number, number];

// 3×3 helpers for the quad → quad projective transform (row-major)
const adj = (m: number[]): number[] => [
  m[4]! * m[8]! - m[5]! * m[7]!, m[2]! * m[7]! - m[1]! * m[8]!, m[1]! * m[5]! - m[2]! * m[4]!,
  m[5]! * m[6]! - m[3]! * m[8]!, m[0]! * m[8]! - m[2]! * m[6]!, m[2]! * m[3]! - m[0]! * m[5]!,
  m[3]! * m[7]! - m[4]! * m[6]!, m[1]! * m[6]! - m[0]! * m[7]!, m[0]! * m[4]! - m[1]! * m[3]!
];
const mm = (a: number[], b: number[]): number[] => {
  const r: number[] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!);
  return r;
};
const basis = (p: P2[]): number[] => {
  const m = [p[0]![0], p[1]![0], p[2]![0], p[0]![1], p[1]![1], p[2]![1], 1, 1, 1];
  const a = adj(m), x = p[3]![0], y = p[3]![1];
  const v = [a[0]! * x + a[1]! * y + a[2]!, a[3]! * x + a[4]! * y + a[5]!, a[6]! * x + a[7]! * y + a[8]!];
  return mm(m, [v[0]!, 0, 0, 0, v[1]!, 0, 0, 0, v[2]!]);
};
/** CSS matrix3d mapping a w×h box (origin 0 0) onto quad `q` (tl, tr, br, bl). */
export function quadMatrix(w: number, h: number, q: P2[]): string {
  const t = mm(basis(q), adj(basis([[0, 0], [w, 0], [w, h], [0, h]])));
  const k = t[8]!;
  const n = t.map(x => x / k);
  return `matrix3d(${[n[0], n[3], 0, n[6], n[1], n[4], 0, n[7], 0, 0, 1, 0, n[2], n[5], 0, n[8]].map(x => +(x ?? 0).toFixed(8)).join(',')})`;
}

export class PosterLayer {
  readonly root = document.createElement('div');
  private stage = document.createElement('div');
  private bobEl = document.createElement('div');
  private img = new Image();
  readonly face = document.createElement('canvas');
  private bob: Animation | null = null;
  private version: Version | null = null;
  private hitData: { d: Uint8ClampedArray; w: number; h: number } | null = null;
  private failed = false;
  /** stage → canvas CSS px */
  private fit = { s: 1, x: 0, y: 0 };
  private quad: P2[] = [];

  constructor(private canvas: HTMLCanvasElement, private urlFor: (v: Version) => string, private reduce: () => boolean) {
    const r = this.root.style;
    r.position = 'absolute'; r.pointerEvents = 'none'; r.overflow = 'hidden'; r.display = 'none';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.dataset.kaykavPoster = '';
    Object.assign(this.stage.style, { position: 'absolute', left: '0', top: '0', width: POSTER_W + 'px', height: POSTER_H + 'px', transformOrigin: '0 0' });
    Object.assign(this.bobEl.style, { position: 'absolute', inset: '0' });
    Object.assign(this.img.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', userSelect: 'none' });
    this.img.alt = '';
    this.img.decoding = 'async';
    this.img.draggable = false;
    this.img.onerror = () => { this.failed = true; this.img.style.visibility = 'hidden'; this.hitData = null; };
    this.img.onload = () => { this.failed = false; this.img.style.visibility = ''; this.readHit(); };
    this.face.width = 512; this.face.height = 320;
    Object.assign(this.face.style, { position: 'absolute', left: '0', top: '0', width: '512px', height: '320px', transformOrigin: '0 0' });
    this.bobEl.append(this.img, this.face);
    this.stage.append(this.bobEl);
    this.root.append(this.stage);
  }

  get shown(): boolean { return this.root.style.display !== 'none'; }

  show(version: Version): void {
    if (!this.root.isConnected) this.canvas.insertAdjacentElement('afterend', this.root);
    this.root.style.display = '';
    if (version !== this.version) {
      this.version = version;
      this.hitData = null;
      this.img.src = this.urlFor(version);
      const v = VARIANTS[version], cam = framing(v, POSTER_W, POSTER_H);
      this.quad = faceCorners(v, Rig.restWorld(version)).map(p => project(cam, p, POSTER_W, POSTER_H) ?? [0, 0]);
      this.face.style.transform = quadMatrix(this.face.width, this.face.height, this.quad);
      this.startBob(v.floating);
    }
    this.layout();
  }

  hide(): void {
    this.root.style.display = 'none';
    this.bob?.cancel(); this.bob = null; this.version = null;
  }

  private startBob(floating: boolean): void {
    this.bob?.cancel(); this.bob = null;
    if (this.reduce() || typeof this.bobEl.animate !== 'function') return;
    this.bobEl.style.transformOrigin = '50% 100%';
    this.bob = floating
      ? this.bobEl.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-1.6%)' }, { transform: 'translateY(0)' }],
        { duration: 3930, iterations: Infinity, easing: 'ease-in-out' })
      : this.bobEl.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.012)' }, { transform: 'scaleY(1)' }],
        { duration: 3140, iterations: Infinity, easing: 'ease-in-out' });
  }

  /** Pauses the CSS bob while the guide is offscreen or the tab is hidden. */
  setPaused(paused: boolean): void {
    if (!this.bob) return;
    if (paused) this.bob.pause(); else this.bob.play();
  }

  /** Small reactions; skipped under reduced motion. */
  bounce(): void {
    if (this.reduce() || typeof this.stage.animate !== 'function') return;
    const { s, x, y } = this.fit, base = `translate(${x}px,${y}px) scale(${s})`;
    this.stage.animate([
      { transform: base }, { transform: `translate(${x}px,${y - 18}px) scale(${s})`, offset: 0.4 }, { transform: base }
    ], { duration: 520, easing: 'cubic-bezier(.3,.7,.4,1)' });
  }

  /** Lays the layer over the canvas and fits the poster (contain). */
  layout(): void {
    const c = this.canvas, w = c.offsetWidth, h = Math.min(c.offsetHeight, 500);
    if (!w || !h) return;
    Object.assign(this.root.style, { left: c.offsetLeft + 'px', top: c.offsetTop + 'px', width: w + 'px', height: h + 'px' });
    const s = Math.min(w / POSTER_W, h / POSTER_H);
    this.fit = { s, x: (w - POSTER_W * s) / 2, y: (h - POSTER_H * s) / 2 };
    this.stage.style.transform = `translate(${this.fit.x}px,${this.fit.y}px) scale(${s})`;
    // size the face bitmap to its on-screen width (× DPR), within 256..768
    const qw = Math.hypot(this.quad[1]![0] - this.quad[0]![0], this.quad[1]![1] - this.quad[0]![1]) * s * (window.devicePixelRatio || 1);
    const fw = Math.max(256, Math.min(768, Math.round(qw / 64) * 64));
    if (fw !== this.face.width) {
      this.face.width = fw; this.face.height = Math.round((fw * FH) / FW);
      Object.assign(this.face.style, { width: fw + 'px', height: this.face.height + 'px' });
      this.face.style.transform = quadMatrix(fw, this.face.height, this.quad);
    }
  }

  /** Paints the face; when the poster failed to load, a navy screen tile stands in. */
  paint(key: FaceName, o: FaceParams): void {
    const cv = this.face, ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (this.failed) paintTile(ctx, 0, 0, cv.width, cv.height);
    const s = cv.width / FW;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    paintFace(ctx, key, o, s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private readHit(): void {
    try {
      const w = POSTER_W / 4, h = POSTER_H / 4, c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(this.img, 0, 0, w, h);
      this.hitData = { d: ctx.getImageData(0, 0, w, h).data, w, h };
    } catch { this.hitData = null; } // cross-origin poster without CORS: fall back to the face quad
  }

  /** Converts canvas CSS px to poster layout px. */
  toPoster(x: number, y: number): P2 { return [(x - this.fit.x) / this.fit.s, (y - this.fit.y) / this.fit.s]; }

  /** Is (x, y) in canvas CSS px over the character? */
  hit(x: number, y: number): boolean {
    const [px, py] = this.toPoster(x, y);
    const hd = this.hitData;
    if (hd) {
      const ix = Math.floor(px / 4), iy = Math.floor(py / 4);
      return ix >= 0 && iy >= 0 && ix < hd.w && iy < hd.h && hd.d[(iy * hd.w + ix) * 4 + 3]! > 150;
    }
    const q = this.quad, cx = (q[0]![0] + q[2]![0]) / 2, cy = (q[0]![1] + q[2]![1]) / 2;
    return Math.abs(px - cx) < POSTER_W * 0.3 && Math.abs(py - cy) < POSTER_H * 0.3;
  }

  get scale(): number { return this.fit.s; }

  destroy(): void {
    this.bob?.cancel();
    this.img.onload = this.img.onerror = null;
    this.img.removeAttribute('src');
    this.root.remove();
  }
}
