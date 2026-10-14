// createGuide(): the public controller. Owns the render loop, visibility and idle
// throttling, tier selection, input, and the Low-tier poster layer.

import { framing, project, type Camera } from './camera';
import { ANIMATED, FACE_LABEL, FH, FW, isFace, paintFaceCanvas, type FaceName } from './faces';
import { antennaPoints, type AntennaPoints } from './geometry';
import { add, clamp, scale } from './math';
import { PosterLayer } from './poster';
import { POSTER_H, POSTER_W } from './poster-meta';
import { Renderer } from './renderer';
import { MODES, reactionJumps, Rig, TAP_FACES, type Mode } from './rig';
import type { Level } from './shader';
import { TierAuto, type Tier, type TierSetting } from './tier';
import { VARIANTS, VERSIONS, type Version } from './variants';

export type GuidePart = 'body' | 'leftAntenna' | 'rightAntenna';

export interface GuideEvents {
  /** a tap/click on the character; antennas are named from the viewer's side */
  tap: { part: GuidePart };
  tierchange: { tier: Tier; reason: string };
  facechange: { face: FaceName; label: string };
  modechange: { mode: Mode };
}

export interface GuideOptions {
  /** character version; default 'buddy' */
  version?: Version;
  /** default 'idle' */
  mode?: Mode;
  /** quality tier; 'auto' (default) picks from measured frame time */
  tier?: TierSetting;
  /** follow the pointer anywhere on the page; default true */
  pointerFollow?: boolean;
  /** built-in reactions (faces, jumps, antenna flicks) to taps; default true */
  tapReactions?: boolean;
  /** fall asleep after this many ms without interaction while idle; 0 = never. Default 30000 */
  sleepAfter?: number;
  /** start of the accessible label; the version and expression are appended. Default 'KayKav course guide' */
  label?: string;
  /** URL prefix where `head.webp`, `pod.webp`, … live (Low tier). Default: `posters/` next to this module */
  posterBase?: string;
  /** explicit poster URLs per version; overrides posterBase */
  posters?: Partial<Record<Version, string>>;
  /** cap on the drawing-buffer height in device px; default 750 */
  maxBufferHeight?: number;
  /** allow software-rendered WebGL (CI, tooling). Default false: such devices get the Low tier */
  allowSoftwareGL?: boolean;
}

export interface GuideStats {
  tier: Tier;
  setting: TierSetting;
  reason: string;
  bufferWidth: number;
  bufferHeight: number;
  /** average interval between rendered frames and the next display frame, ms */
  frameMs: number;
  /** frames drawn in the last second */
  fps: number;
  /** Medium drawing-buffer scale (0.6–1) */
  scale: number;
  webgl: boolean;
}

export interface GuideController {
  setVersion(version: Version): void;
  setMode(mode: Mode): void;
  /** 0..1, call as reply text streams in; decays on its own. 0 stops the mouth at once */
  setTalkLevel(level: number): void;
  /** show an expression for `ms` (default 4200; Infinity holds it) */
  showFace(name: FaceName, ms?: number): void;
  /** drop a face set with showFace and return to the mode's face */
  clearFace(): void;
  wave(): void;
  jump(): void;
  /** gaze direction, x and y in −1..1 (right / up positive) */
  lookAt(x: number, y: number): void;
  setPointerFollow(on: boolean): void;
  setTier(tier: TierSetting): void;
  on<K extends keyof GuideEvents>(event: K, handler: (e: GuideEvents[K]) => void): () => void;
  off<K extends keyof GuideEvents>(event: K, handler: (e: GuideEvents[K]) => void): void;
  getStats(): GuideStats;
  readonly version: Version;
  readonly mode: Mode;
  readonly face: FaceName;
  destroy(): void;
}

const MAX_CSS_H = 500;

function defaultPosterBase(): string {
  try {
    const here = import.meta.url; // a variable keeps bundlers from rewriting the URL at build time
    const u = new URL('posters/', here);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
  } catch { /* fall through */ }
  return '/kaykav-guide/posters/';
}

const saveData = (): boolean => {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!c?.saveData;
};

const segDist = (p: [number, number], a: [number, number], b: [number, number]): number => {
  const ab = [b[0] - a[0], b[1] - a[1]] as const, ap = [p[0] - a[0], p[1] - a[1]] as const;
  const t = clamp((ap[0] * ab[0] + ap[1] * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1), 0, 1);
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t);
};

type Handler = (e: never) => void;

class Guide implements GuideController {
  private rig: Rig;
  private renderer: Renderer | null = null;
  private glFailed = false;
  private poster: PosterLayer;
  private auto = new TierAuto();
  private setting: TierSetting;
  private tierNow: Tier;
  private reason = 'start';
  private level: Level | 0 = 0;
  private shown: Version;
  private target: Version;
  private faceCv = document.createElement('canvas');
  private faceSig = '';
  private posterSig = '';
  private cssW = 0;
  private cssH = 0;
  private cam: Camera;
  private near = false;
  private hidden = document.hidden;
  private destroyed = false;
  private raf = 0;
  private prevRaf = 0;
  private drewPrev = false;
  private lastDraw = 0;
  private lastTick = 0;
  private activeUntil = 0;
  private pointer = { x: 0, y: 0, at: 0, dirty: false };
  private pointerFollow: boolean;
  private drawTimes: number[] = [];
  private cleanups: Array<() => void> = [];
  private handlers = new Map<string, Set<Handler>>();
  private cancelIdle: (() => void) | null = null;
  private tapCount = 0;
  private currentFace: FaceName;
  private reduceMQ: MediaQueryList | null;
  private prevStyle: { maxHeight: string; touchAction: string };
  private beforeLoss: Tier | null = null;

  constructor(private canvas: HTMLCanvasElement, private o: GuideOptions) {
    const now = performance.now();
    const v = o.version && VERSIONS.includes(o.version) ? o.version : 'buddy';
    this.shown = this.target = v;
    this.rig = new Rig(v, now);
    this.rig.sleepAfter = o.sleepAfter ?? 30000;
    if (o.mode && MODES.includes(o.mode)) this.rig.mode = o.mode;
    this.rig.onAutoMode = m => this.emit('modechange', { mode: m });
    this.reduceMQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.rig.reduce = !!this.reduceMQ?.matches;
    this.pointerFollow = o.pointerFollow ?? true;
    this.setting = o.tier ?? 'auto';
    this.tierNow = this.pickTier();
    this.reason = this.tierNow === 'low' ? this.lowReason() : 'start';
    this.currentFace = this.rig.currentFace(now);
    this.cam = framing(VARIANTS[v], 1, 1);
    this.poster = new PosterLayer(canvas, ver => this.posterURL(ver), () => this.rig.reduce);

    this.prevStyle = { maxHeight: canvas.style.maxHeight, touchAction: canvas.style.touchAction };
    canvas.style.maxHeight = MAX_CSS_H + 'px';
    if (!canvas.style.touchAction) canvas.style.touchAction = 'manipulation';
    canvas.setAttribute('role', 'img');
    this.updateLabel();

    this.listen();
    this.setFollow(this.pointerFollow);
  }

  // ---------- setup ----------

  private listen(): void {
    const c = this.canvas;
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(c);
    if (c.parentElement) ro.observe(c.parentElement);
    const io = new IntersectionObserver(es => {
      for (const e of es) this.near = e.isIntersecting;
      this.updateRunning();
    }, { rootMargin: '200px' });
    io.observe(c);
    const vis = (): void => { this.hidden = document.hidden; this.updateRunning(); };
    document.addEventListener('visibilitychange', vis);
    const down = (e: PointerEvent): void => this.onPointerDown(e);
    c.addEventListener('pointerdown', down);
    const lost = (e: Event): void => {
      e.preventDefault();
      if (this.tierNow !== 'low') this.beforeLoss = this.tierNow;
      this.level = 0;
      this.applyTier('low', 'WebGL context lost');
    };
    const restored = (): void => {
      this.renderer?.init(); this.faceSig = '';
      if (this.beforeLoss) { this.applyTier(this.beforeLoss, 'WebGL context restored'); this.beforeLoss = null; }
    };
    c.addEventListener('webglcontextlost', lost);
    c.addEventListener('webglcontextrestored', restored);
    const mq = this.reduceMQ, onMQ = (): void => {
      this.rig.reduce = !!mq?.matches;
      if (this.setting === 'auto') this.applyTier(this.pickTier(), this.rig.reduce ? 'reduced motion' : 'motion allowed');
    };
    mq?.addEventListener('change', onMQ);
    this.cleanups.push(
      () => ro.disconnect(), () => io.disconnect(),
      () => document.removeEventListener('visibilitychange', vis),
      () => c.removeEventListener('pointerdown', down),
      () => c.removeEventListener('webglcontextlost', lost),
      () => c.removeEventListener('webglcontextrestored', restored),
      () => mq?.removeEventListener('change', onMQ)
    );
  }

  private followOff: (() => void) | null = null;
  private setFollow(on: boolean): void {
    this.followOff?.(); this.followOff = null;
    this.pointerFollow = on;
    if (!on) return;
    const move = (e: PointerEvent): void => {
      this.pointer.x = e.clientX; this.pointer.y = e.clientY; this.pointer.dirty = true;
      this.pointer.at = performance.now();
      this.rig.wake(this.pointer.at);
    };
    const leave = (): void => { this.rig.gaze.x = 0; this.rig.gaze.y = 0; this.pointer.dirty = false; };
    const root = document.documentElement;
    window.addEventListener('pointermove', move, { passive: true });
    root.addEventListener('pointerleave', leave);
    this.followOff = () => { window.removeEventListener('pointermove', move); root.removeEventListener('pointerleave', leave); };
  }

  private posterURL(v: Version): string {
    return this.o.posters?.[v] ?? (this.o.posterBase ?? defaultPosterBase()).replace(/\/?$/, '/') + v + '.webp';
  }

  private lowReason(): string {
    if (this.setting === 'low') return 'forced';
    if (this.rig.reduce) return 'reduced motion';
    if (saveData()) return 'data saver';
    if (this.glFailed) return 'WebGL unavailable';
    return 'slow frames';
  }

  private pickTier(): Tier {
    if (this.setting !== 'auto') return this.setting === 'low' || this.glFailed ? 'low' : this.setting;
    if (this.rig.reduce || saveData() || this.glFailed) return 'low';
    return 'medium';
  }

  // ---------- loop ----------

  private get shouldRun(): boolean { return this.near && !this.hidden && !this.destroyed; }

  private updateRunning(): void {
    if (this.shouldRun) {
      if (this.tierNow !== 'low') this.ensureGL();
      if (this.tierNow === 'low') this.poster.show(this.target);
      this.poster.setPaused(false);
      if (!this.raf) { this.prevRaf = 0; this.lastTick = 0; this.raf = requestAnimationFrame(this.frame); }
    } else {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.poster.setPaused(true);
    }
  }

  private ensureGL(): void {
    if (this.renderer || this.glFailed) return;
    this.renderer = Renderer.create(this.canvas, { allowSoftware: !!this.o.allowSoftwareGL });
    if (!this.renderer) { this.glFailed = true; this.applyTier('low', 'WebGL unavailable'); return; }
    this.resize();
  }

  private resize(): void {
    const c = this.canvas;
    this.cssW = c.clientWidth; this.cssH = Math.min(c.clientHeight, MAX_CSS_H);
    if (!this.cssW || !this.cssH) return;
    this.cam = framing(VARIANTS[this.shown], this.cssW, this.cssH);
    if (this.poster.shown) this.poster.layout();
    if (!this.renderer || this.tierNow === 'low') return;
    const dpr = window.devicePixelRatio || 1, cap = this.o.maxBufferHeight ?? 750;
    const sc = this.tierNow === 'medium' ? this.auto.scale : 1;
    const bh = Math.max(1, Math.round(Math.min(this.cssH * dpr, cap) * sc));
    const bw = Math.max(1, Math.round((bh * this.cssW) / this.cssH));
    if (c.width !== bw) c.width = bw;
    if (c.height !== bh) c.height = bh;
  }

  private isActive(now: number): boolean {
    return now - this.pointer.at < 1200 || now < this.activeUntil || this.target !== this.shown || this.rig.busy(now);
  }

  private readPointer(): void {
    if (!this.pointer.dirty || !this.pointerFollow) return;
    this.pointer.dirty = false;
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.rig.gaze.x = clamp((this.pointer.x - (r.left + r.width / 2)) / (r.width / 2), -1.6, 1.6) * 0.85;
    this.rig.gaze.y = clamp(-(this.pointer.y - (r.top + r.height * 0.45)) / (r.height / 2), -1.4, 1.4) * 0.85;
  }

  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (this.drewPrev && this.prevRaf) this.auto.sample(now - this.prevRaf, now);
    this.prevRaf = now; this.drewPrev = false;
    this.readPointer();
    const active = this.isActive(now), low = this.tierNow === 'low';
    const gap = low ? (active ? 33 : 50) : active ? 0 : 50;
    if (now - this.lastDraw < gap - 4) return;

    const dt = this.lastTick ? (now - this.lastTick) / 1000 : 1 / 60;
    this.lastTick = now;
    const f = this.rig.tick(now, dt);
    if (f !== this.currentFace) { this.currentFace = f; this.updateLabel(); this.emit('facechange', { face: f, label: FACE_LABEL[f] }); }

    if (low) { this.paintPoster(f); this.lastDraw = now; return; }
    if (this.drawGL(now, f)) {
      this.drewPrev = true; this.lastDraw = now;
      this.drawTimes.push(now);
      while (this.drawTimes.length && now - this.drawTimes[0]! > 1000) this.drawTimes.shift();
      if (this.setting === 'auto') {
        const step = this.auto.decide(now, this.tierNow);
        if (step === 'scale') { this.resize(); this.auto.settle(now); }
        else if (step) this.applyTier(step, step === 'high' ? 'fast frames' : 'slow frames');
      }
    }
  };

  private faceKey(f: FaceName, w: number): string {
    const p = this.rig.faceParams();
    return [f, w, ANIMATED.has(f) ? Math.round(p.t * 30) : 0, p.open.toFixed(2), p.talk.toFixed(2), p.lx.toFixed(3), p.ly.toFixed(3)].join('|');
  }

  private paintPoster(f: FaceName): void {
    const sig = this.faceKey(f, this.poster.face.width);
    if (sig === this.posterSig) return;
    this.posterSig = sig;
    this.poster.paint(f, this.rig.faceParams());
  }

  private drawGL(now: number, f: FaceName): boolean {
    const r = this.renderer;
    if (!r || r.lost) return false;
    const want: Level = this.tierNow === 'high' ? 2 : 1;
    if (this.target !== this.shown || this.level !== want) {
      const st = r.request(this.target, want);
      if (st === 'ready') {
        if (this.target !== this.shown) { this.shown = this.target; this.rig.setVersion(this.shown); this.cam = framing(VARIANTS[this.shown], this.cssW || 1, this.cssH || 1); }
        const first = this.level === 0;
        this.level = want;
        this.auto.settle(now);
        if (first || want === 2) this.queuePrecompile();
      } else if (st === 'failed') {
        if (want === 2) this.applyTier('medium', 'High shader failed');
        else { this.glFailed = true; this.applyTier('low', 'shader failed'); }
        return false;
      }
    }
    if (!this.level || !this.cssW) return false;
    const tw = this.level === 2 ? 768 : 512;
    if (this.faceCv.width !== tw) { this.faceCv.width = tw; this.faceCv.height = (tw * FH) / FW; }
    const sig = this.faceKey(f, tw);
    if (sig !== this.faceSig) {
      this.faceSig = sig;
      paintFaceCanvas(this.faceCv, f, this.rig.faceParams());
      r.uploadFace(this.faceCv);
    }
    return r.draw(this.shown, this.level, this.rig.world, this.cam, this.canvas.width, this.canvas.height);
  }

  /** Compiles the other versions for the current level, one per idle period. */
  private queuePrecompile(): void {
    if (this.cancelIdle) return;
    const w = window as Partial<Pick<Window, 'requestIdleCallback' | 'cancelIdleCallback'>>;
    const later = (cb: () => void): void => {
      // Safari has no requestIdleCallback
      if (w.requestIdleCallback && w.cancelIdleCallback) {
        const id = w.requestIdleCallback(cb), cancel = w.cancelIdleCallback;
        this.cancelIdle = () => cancel(id);
      } else {
        const id = window.setTimeout(cb, 1200);
        this.cancelIdle = () => window.clearTimeout(id);
      }
    };
    const step = (): void => {
      this.cancelIdle = null;
      const r = this.renderer;
      if (!r || this.destroyed || !this.level) return;
      const lvl = this.level;
      const next = VERSIONS.find(v => v !== this.shown && !r.has(v, lvl));
      if (!next) return;
      r.request(next, lvl);
      later(step);
    };
    later(step);
  }

  private applyTier(t: Tier, reason: string): void {
    if (t === this.tierNow && reason !== 'restart') return;
    this.tierNow = t;
    this.reason = reason;
    const now = performance.now();
    if (t === 'low') {
      this.level = 0;
      this.rig.setVersion(this.target); this.shown = this.target;
      if (this.renderer && !this.renderer.lost) this.renderer.clear();
      if (this.shouldRun) this.poster.show(this.target);
      this.posterSig = '';
    } else {
      this.poster.hide();
      this.ensureGL();
      this.auto.settle(now);
    }
    this.resize();
    this.emit('tierchange', { tier: t, reason });
  }

  // ---------- input ----------

  private antennaHit(x: number, y: number, pts: AntennaPoints, cam: Camera, w: number, h: number, minPx: number): 0 | 1 | -1 {
    for (const i of [0, 1] as const) {
      const a = project(cam, pts.bases[i], w, h), b = project(cam, pts.tips[i], w, h);
      const tip = project(cam, add(pts.tips[i], scale(cam.X, pts.tipR)), w, h);
      if (a && b && tip && segDist([x, y], a, b) < Math.max(minPx, Math.hypot(tip[0] - b[0], tip[1] - b[1]) * 1.3)) return i;
    }
    return -1;
  }

  private onPointerDown(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
    const v = VARIANTS[this.shown];
    let part: GuidePart | null = null;
    if (this.tierNow === 'low') {
      const cam = framing(v, POSTER_W, POSTER_H), [px, py] = this.poster.toPoster(x, y);
      const i = this.antennaHit(px, py, antennaPoints(v, Rig.restWorld(this.shown)), cam, POSTER_W, POSTER_H, 14 / (this.poster.scale || 1));
      part = i === 0 ? 'leftAntenna' : i === 1 ? 'rightAntenna' : this.poster.hit(x, y) ? 'body' : null;
    } else if (this.renderer && this.level && this.cssW) {
      const i = this.antennaHit(x, y, antennaPoints(v, this.rig.world), this.cam, this.cssW, this.cssH, 14);
      if (i >= 0) part = i ? 'rightAntenna' : 'leftAntenna';
      else {
        // draw now and read back the pixel under the pointer
        const r = this.renderer, bw = this.canvas.width, bh = this.canvas.height;
        r.draw(this.shown, this.level, this.rig.world, this.cam, bw, bh);
        if (r.readAlpha((x / this.cssW) * bw, (y / this.cssH) * bh, bh) > 150) part = 'body';
      }
    }
    if (!part) return;
    const now = performance.now();
    this.rig.wake(now);
    this.activeUntil = now + 1200;
    if (this.o.tapReactions ?? true) {
      if (part === 'body') {
        const f = TAP_FACES[this.tapCount++ % TAP_FACES.length]!;
        this.rig.showFace(f, 1800, now);
        if (!reactionJumps(f)) this.rig.jump(1.3);
        this.rig.wave(now);
        if (this.tierNow === 'low') this.poster.bounce();
      } else {
        const i = part === 'rightAntenna' ? 1 : 0;
        this.rig.flick(i, 7);
        this.rig.showFace(i ? 'wink' : 'playful', 1400, now);
      }
    }
    this.emit('tap', { part });
  }

  private updateLabel(): void {
    const base = this.o.label ?? 'KayKav course guide';
    this.canvas.setAttribute('aria-label', `${base}: ${VARIANTS[this.target].label}, ${FACE_LABEL[this.currentFace].toLowerCase()} expression`);
  }

  private emit<K extends keyof GuideEvents>(k: K, e: GuideEvents[K]): void {
    this.handlers.get(k)?.forEach(h => { try { (h as (e: GuideEvents[K]) => void)(e); } catch (err) { console.error(err); } });
  }

  private poke(): void {
    const now = performance.now();
    this.rig.lastAct = now;
    this.activeUntil = now + 600;
  }

  // ---------- public API ----------

  get version(): Version { return this.target; }
  get mode(): Mode { return this.rig.mode; }
  get face(): FaceName { return this.currentFace; }

  setVersion(version: Version): void {
    if (!VERSIONS.includes(version) || version === this.target) return;
    this.target = version;
    if (this.tierNow === 'low') {
      this.shown = version; this.rig.setVersion(version); this.posterSig = '';
      if (this.shouldRun) this.poster.show(version);
    }
    this.updateLabel();
    this.poke();
  }

  setMode(mode: Mode): void {
    if (!MODES.includes(mode)) return;
    this.rig.autoSlept = false;
    if (mode !== this.rig.mode) { this.rig.mode = mode; this.emit('modechange', { mode }); }
    this.poke();
  }

  setTalkLevel(level: number): void {
    const l = clamp(Number(level) || 0, 0, 1);
    this.rig.talk = l === 0 ? 0 : Math.max(this.rig.talk, l);
    this.rig.lastAct = performance.now();
  }

  showFace(name: FaceName, ms = 4200): void {
    if (!isFace(name)) { console.warn(`[kaykav-guide] unknown face "${String(name)}"`); return; }
    this.rig.showFace(name, ms, performance.now());
    this.poke();
  }

  clearFace(): void { this.rig.face = null; this.rig.faceUntil = 0; this.poke(); }

  wave(): void {
    const now = performance.now();
    this.rig.wave(now);
    if (VARIANTS[this.shown].floating) { this.rig.flick(0, 4); this.rig.flick(1, 4); }
    this.poke();
  }

  jump(): void {
    this.rig.jump(1.3);
    if (this.tierNow === 'low') this.poster.bounce();
    this.poke();
  }

  lookAt(x: number, y: number): void {
    this.rig.gaze.x = clamp(Number(x) || 0, -1, 1);
    this.rig.gaze.y = clamp(Number(y) || 0, -1, 1);
    this.pointer.dirty = false;
    this.poke();
  }

  setPointerFollow(on: boolean): void { if (on !== this.pointerFollow) this.setFollow(on); }

  setTier(tier: TierSetting): void {
    this.setting = tier;
    this.auto = new TierAuto();
    const t = this.pickTier();
    this.applyTier(t, tier === 'auto' ? (t === 'low' ? this.lowReason() : 'restart') : 'forced');
  }

  on<K extends keyof GuideEvents>(event: K, handler: (e: GuideEvents[K]) => void): () => void {
    let s = this.handlers.get(event);
    if (!s) this.handlers.set(event, (s = new Set()));
    s.add(handler as Handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof GuideEvents>(event: K, handler: (e: GuideEvents[K]) => void): void {
    this.handlers.get(event)?.delete(handler as Handler);
  }

  getStats(): GuideStats {
    const gl = this.tierNow !== 'low';
    return {
      tier: this.tierNow, setting: this.setting, reason: this.reason,
      bufferWidth: gl ? this.canvas.width : 0, bufferHeight: gl ? this.canvas.height : 0,
      frameMs: +this.auto.ema.toFixed(1), fps: this.drawTimes.length,
      scale: this.tierNow === 'medium' ? this.auto.scale : 1, webgl: !!this.renderer && !this.renderer.lost
    };
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.updateRunning();
    this.cancelIdle?.();
    this.followOff?.();
    for (const c of this.cleanups) c();
    this.cleanups = [];
    this.handlers.clear();
    this.poster.destroy();
    this.renderer?.destroy();
    this.renderer = null;
    this.canvas.style.maxHeight = this.prevStyle.maxHeight;
    this.canvas.style.touchAction = this.prevStyle.touchAction;
  }
}

/** Mounts the guide on a canvas. Nothing renders until the canvas is near the viewport. */
export function createGuide(canvas: HTMLCanvasElement, options: GuideOptions = {}): GuideController {
  return new Guide(canvas, options);
}
