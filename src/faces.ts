// Face artwork: every expression from the sheet, drawn as glowing strokes on a
// 1024×640 design space that maps onto the screen glass (1024 = screen width).

export const FW = 1024;
export const FH = 640;
const CY = 320, EL = 256, ER = 768;
const YEL = '#FFE45C', BLUE = '#62C8FF';

// Glyph metrics in design units, from MEASUREMENTS.md: ring outer Ø ≈ 0.15 of the
// screen width, stroke ≈ 0.03, eyes 0.50 apart; dashes measured ≈ 0.078 long.
const RING = 60, STROKE = 30, DASH = 48;

export const FACES = [
  ['neutral', 'Neutral'], ['happy', 'Happy'], ['sad', 'Sad'], ['surprised', 'Surprised'],
  ['confused', 'Confused'], ['excited', 'Excited'], ['tired', 'Tired'], ['wink', 'Wink'],
  ['crying', 'Crying'], ['laughing', 'Laughing'], ['giggling', 'Laughing hard'], ['shy', 'Shy'],
  ['love', 'Love'], ['thinking', 'Thinking'], ['sleeping', 'Sleeping'], ['dizzy', 'Dizzy'], ['bored', 'Bored'],
  ['proud', 'Proud'], ['skeptical', 'Skeptical'], ['scared', 'Scared'], ['determined', 'Determined'],
  ['playful', 'Playful'], ['curious', 'Curious'], ['shocked', 'Shocked'], ['relaxed', 'Relaxed'], ['gloating', 'Gloating'],
  ['nervous', 'Nervous'], ['jittery', 'Jittery'], ['cheeky', 'Cheeky'], ['peaceful', 'Peaceful'], ['glitch', 'Glitch'],
  ['listening', 'Listening'], ['talking', 'Talking']
] as const;

export type FaceName = (typeof FACES)[number][0];
export const FACE_NAMES: readonly FaceName[] = FACES.map(f => f[0]);
export const FACE_LABEL = Object.fromEntries(FACES) as Record<FaceName, string>;
export const isFace = (s: string): s is FaceName => Object.prototype.hasOwnProperty.call(FACE_LABEL, s);

/** Faces whose eyes close when the guide blinks. */
const BLINKS: ReadonlySet<FaceName> = new Set<FaceName>([
  'neutral', 'listening', 'talking', 'surprised', 'wink', 'thinking', 'skeptical', 'curious',
  'playful', 'cheeky', 'shy', 'laughing', 'crying'
]);
/** Faces that change with time on their own (everything else is static between blinks). */
export const ANIMATED: ReadonlySet<FaceName> = new Set<FaceName>([
  'listening', 'talking', 'crying', 'love', 'thinking', 'sleeping', 'dizzy', 'relaxed', 'jittery', 'glitch'
]);
export const blinks = (f: FaceName): boolean => BLINKS.has(f);

/** The Glitch face changes state in discrete steps; 2.5 steps/s keeps it well under 3 flashes/s. */
export const GLITCH_RATE = 2.5;

export interface FaceParams {
  /** seconds; frozen under reduced motion */
  t: number;
  /** eyelid openness 0..1 (blink) */
  open: number;
  /** talk level 0..1 */
  talk: number;
  /** gaze offset −1..1 */
  lx: number;
  ly: number;
}

interface Item { k: 's' | 'f'; p: Path2D; a: number; w: number; col: string }

function faceItems(key: FaceName, o: FaceParams): Item[] {
  const it: Item[] = [];
  const st = (p: Path2D, a = 1, w = STROKE, col = YEL): void => { it.push({ k: 's', p, a, w, col }); };
  const fl = (p: Path2D, a = 1, col = YEL): void => { it.push({ k: 'f', p, a, w: 0, col }); };
  const P = (): Path2D => new Path2D();
  const Y = (v: number): number => CY + v;
  const open = BLINKS.has(key) ? o.open : 1;
  const t = o.t;
  const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

  const ring = (x: number, y: number, r = RING, op = open): void => {
    const p = P();
    if (op < 0.18) { p.moveTo(x - r, Y(y)); p.lineTo(x + r, Y(y)); }
    else { p.moveTo(x + r, Y(y)); p.ellipse(x, Y(y), r, r * op, 0, 0, Math.PI * 2); }
    st(p);
  };
  const dash = (x: number, y: number, len = DASH, a = 1): void => {
    const p = P(); p.moveTo(x - len / 2, Y(y)); p.lineTo(x + len / 2, Y(y)); st(p, a);
  };
  interface D3 { y?: number; dy?: (k: number) => number; len?: (k: number) => number; a?: (k: number) => number }
  const d3 = (opt: D3 = {}): void => {
    [404, 512, 620].forEach((x, k) =>
      dash(x, (opt.y ?? 0) + (opt.dy ? opt.dy(k) : 0), opt.len ? opt.len(k) : DASH, opt.a ? opt.a(k) : 1));
  };
  const dot = (x: number, y: number, r: number, a = 1): void => { const p = P(); p.arc(x, Y(y), r, 0, Math.PI * 2); fl(p, a); };
  const line = (x1: number, y1: number, x2: number, y2: number, a = 1, w = STROKE): void => {
    const p = P(); p.moveTo(x1, Y(y1)); p.lineTo(x2, Y(y2)); st(p, a, w);
  };
  const caret = (x: number, y: number): void => {
    const p = P(); p.moveTo(x - 56, Y(y + 24)); p.quadraticCurveTo(x, Y(y - 70), x + 56, Y(y + 24)); st(p);
  };
  const cup = (x: number, y: number): void => {
    const p = P(); p.moveTo(x - 50, Y(y - 22)); p.quadraticCurveTo(x, Y(y + 66), x + 50, Y(y - 22)); st(p);
  };
  const chev = (x: number, y: number, d: number): void => {
    const p = P(); p.moveTo(x - 34 * d, Y(y - 46)); p.lineTo(x + 38 * d, Y(y)); p.lineTo(x - 34 * d, Y(y + 46)); st(p);
  };
  const heart = (x: number, y: number, s = 1): void => {
    const p = P();
    p.moveTo(x, Y(y + 50 * s));
    p.bezierCurveTo(x - 74 * s, Y(y + 2 * s), x - 56 * s, Y(y - 62 * s), x, Y(y - 24 * s));
    p.bezierCurveTo(x + 56 * s, Y(y - 62 * s), x + 74 * s, Y(y + 2 * s), x, Y(y + 50 * s));
    p.closePath(); st(p, 1, 24);
  };
  const aster = (x: number, y: number, r = 48): void => {
    const p = P();
    for (const a of [Math.PI / 2, Math.PI / 6, -Math.PI / 6]) {
      p.moveTo(x - Math.cos(a) * r, Y(y - Math.sin(a) * r)); p.lineTo(x + Math.cos(a) * r, Y(y + Math.sin(a) * r));
    }
    st(p, 1, 24);
  };
  const zig = (x: number, y: number, d: number): void => {
    const pts = [[-30, -50], [34, -30], [-20, 0], [34, 30], [-30, 50]] as const;
    const p = P();
    pts.forEach(([px, py], i) => { if (i) p.lineTo(x + px * d, Y(y + py)); else p.moveTo(x + px * d, Y(y + py)); });
    st(p, 1, 24);
  };
  const bolt = (x: number, y: number): void => {
    const p = P();
    p.moveTo(x + 14, Y(y - 62)); p.lineTo(x - 26, Y(y + 6)); p.lineTo(x + 4, Y(y + 6));
    p.lineTo(x - 12, Y(y + 64)); p.lineTo(x + 28, Y(y - 8)); p.lineTo(x - 2, Y(y - 8)); p.closePath();
    st(p, 1, 20);
  };
  const quote = (x: number, y: number, flip: boolean): void => {
    const T = (px: number, py: number): [number, number] => flip ? [x - px, Y(y - py)] : [x + px, Y(y + py)];
    const c = T(0, 16), p = P(); p.arc(c[0], c[1], 31, 0, Math.PI * 2); fl(p);
    const q = P(), a = T(-26, 4), b = T(-30, -44), e = T(12, -60);
    q.moveTo(a[0], a[1]); q.quadraticCurveTo(b[0], b[1], e[0], e[1]); st(q, 1, 22);
  };
  const excl = (x: number, y: number): void => { line(x, y - 58, x, y + 4, 1, 24); dot(x, y + 44, 14); };
  const spiral = (x: number, y: number, rot: number): void => {
    const p = P(), tm = Math.PI * 2 * 1.75;
    for (let a = 0; a <= tm; a += 0.1) {
      const r = 8 + 54 * (a / tm), px = x + Math.cos(a + rot) * r, py = Y(y) + Math.sin(a + rot) * r;
      if (a) p.lineTo(px, py); else p.moveTo(px, py);
    }
    st(p, 1, 17);
  };
  const zed = (x: number, y: number, s: number, a: number): void => {
    const p = P();
    p.moveTo(x - s / 2, Y(y - s / 2)); p.lineTo(x + s / 2, Y(y - s / 2)); p.lineTo(x - s / 2, Y(y + s / 2)); p.lineTo(x + s / 2, Y(y + s / 2));
    st(p, a, Math.max(12, s * 0.2));
  };
  const question = (x: number, y: number): void => {
    const p = P();
    p.moveTo(x - 36, Y(y - 36));
    p.bezierCurveTo(x - 36, Y(y - 92), x + 44, Y(y - 92), x + 42, Y(y - 40));
    p.bezierCurveTo(x + 40, Y(y - 12), x, Y(y - 10), x, Y(y + 20));
    st(p, 1, 24); dot(x, y + 60, 14);
  };
  const tear = (x: number, y: number, a: number): void => {
    const p = P();
    p.moveTo(x, Y(y - 30)); p.bezierCurveTo(x + 6, Y(y - 16), x + 19, Y(y - 2), x + 19, Y(y + 8));
    p.arc(x, Y(y + 8), 19, 0, Math.PI); p.bezierCurveTo(x - 19, Y(y - 2), x - 6, Y(y - 16), x, Y(y - 30));
    fl(p, a, BLUE);
  };
  const wave = (x0: number, x1: number, y: number, amp: number, cyc: number, ph: number, tri: boolean): void => {
    const p = P();
    for (let i = 0; i <= 80; i++) {
      const u = i / 80, x = lerp(x0, x1, u), th = u * cyc * Math.PI * 2 + ph;
      const s = tri ? (2 / Math.PI) * Math.asin(Math.sin(th)) : Math.sin(th);
      if (i) p.lineTo(x, Y(y + s * amp)); else p.moveTo(x, Y(y + s * amp));
    }
    st(p, 1, 24);
  };
  const pGlyph = (x: number, y: number): void => { ring(x + 6, y - 8, 42, 1); line(x - 36, y - 8, x - 36, y + 82); };
  // Tired: droopy half-closed lids (the sheet reused the Excited glyph; see MEASUREMENTS.md)
  const lid = (x: number, y: number): void => {
    const p = P();
    p.moveTo(x - 56, Y(y - 4)); p.lineTo(x + 56, Y(y - 4));
    p.moveTo(x - 44, Y(y - 4)); p.arc(x, Y(y - 4), 44, Math.PI, 0, true);
    st(p);
  };

  switch (key) {
    case 'neutral': ring(EL, 0); ring(ER, 0); d3(); break;
    case 'listening': ring(EL, 0, RING + 6); ring(ER, 0, RING + 6); d3({ a: () => 0.55 + 0.45 * Math.sin(t * 4.2) }); break;
    case 'talking':
      ring(EL, 0); ring(ER, 0);
      d3({ dy: k => Math.sin(t * 15 + k * 2.1) * 24 * o.talk, len: k => DASH + Math.sin(t * 11 + k * 1.3) * 22 * o.talk });
      break;
    case 'happy': caret(EL, 0); caret(ER, 0); d3({ y: 4 }); break;
    case 'sad': cup(EL, 6); cup(ER, 6); d3({ y: -10 }); break;
    case 'surprised': ring(EL, 0, 72); ring(ER, 0, 72); d3(); break;
    case 'confused': ring(EL + 22, 0, 40); ring(ER - 22, 0, 40); dash(392, 0, 38); dash(632, 0, 38); question(512, 0); break;
    case 'excited': chev(EL, 0, 1); chev(ER, 0, -1); d3(); break;
    case 'tired': lid(EL, 0); lid(ER, 0); d3({ a: () => 0.75 }); break;
    case 'wink': ring(EL, 0); aster(ER, 0); d3(); break;
    case 'crying':
      ring(EL, 0); ring(ER, 0); d3();
      [EL, ER].forEach((x, i) => { const u = (t * 0.7 + i * 0.45) % 1; tear(x, 96 + u * 70, Math.sin(u * Math.PI)); });
      break;
    case 'laughing': ring(EL, 0); zig(ER, 0, 1); d3(); break;
    case 'giggling': zig(EL, 0, -1); zig(ER, 0, 1); d3(); break;
    case 'shy': ring(EL, 0); ring(ER, 0); dash(374, 42, 44); dash(468, 0, 44); dash(556, 0, 44); dash(650, 42, 44); break;
    case 'love': { const s = 1 + 0.07 * Math.sin(t * 7); heart(EL, 0, s); heart(ER, 0, s); d3(); break; }
    case 'thinking':
      ring(EL, 0); dot(ER, 0, 28 * (0.86 + 0.14 * Math.sin(t * 5)));
      d3({ a: k => 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(t * 5.5 - k * 1.1)), 2) });
      break;
    case 'sleeping':
      ([[330, 92, 62], [430, 52, 84], [548, 0, 108], [682, -66, 134]] as const).forEach(([x, y, s], i) =>
        zed(x, y + Math.sin(t * 1.6 + i) * 6, s, 0.55 + 0.45 * Math.sin(t * 1.6 + i * 0.9) ** 2));
      break;
    case 'dizzy': spiral(EL, 0, t * 4); spiral(ER, 0, t * 4); d3(); break;
    case 'bored': dot(EL, 0, 40); dot(ER, 0, 40); dash(398, 0, 40); dash(512, 30, 58); dash(626, 0, 40); break;
    case 'proud': caret(EL, 0); caret(ER, 0); d3({ y: 30 }); break;
    case 'skeptical': ring(EL, 0); line(ER - 50, -44, ER + 50, -54); d3(); break;
    case 'scared': bolt(EL, 0); bolt(ER, 0); d3(); break;
    case 'determined': chev(EL, 0, 1); chev(ER, 0, -1); dash(366, 42, 44); dash(468, 0, 44); dash(556, 0, 44); dash(658, 42, 44); break;
    case 'playful': chev(EL, 0, 1); ring(ER, 0); d3(); break;
    case 'curious': dot(EL, 0, 22); ring(ER, 0); d3(); break;
    case 'shocked': excl(EL - 24, 0); excl(EL + 24, 0); excl(ER - 24, 0); excl(ER + 24, 0); d3(); break;
    case 'relaxed': wave(262, 762, 0, 20, 3.5, t * 1.6, false); break;
    case 'gloating': quote(EL, 0, false); quote(ER, 0, false); d3(); break;
    case 'nervous': quote(EL, 0, false); quote(ER, 0, true); d3(); break;
    case 'jittery': wave(300, 724, Math.sin(t * 40) * 3, 34, 4.5, t * 6, true); break;
    case 'cheeky': ring(EL, 0); pGlyph(ER, 0); dash(450, 0, 54); dash(560, 0, 54); break;
    case 'peaceful': cup(EL, -4); cup(ER, -4); dash(512, 30, 62); break;
    case 'glitch': {
      // Discrete glitch steps at GLITCH_RATE per second. The prototype stepped 9×/s and
      // dropped dashes to 15 % brightness, which flashed; this keeps brightness ≥ 55 %.
      const s = Math.floor(t * GLITCH_RATE);
      const r = (n: number): number => { const v = Math.sin(n * 12.9898 + s * 78.233) * 43758.5453; return v - Math.floor(v); };
      ring(EL + (r(1) - 0.5) * 30, (r(2) - 0.5) * 16, 52, 1); ring(ER + (r(3) - 0.5) * 30, (r(4) - 0.5) * 16, 52, 1);
      d3({ a: k => (r(5 + k) > 0.25 ? 1 : 0.55), dy: k => (r(9 + k) - 0.5) * 14 });
      for (let i = 0; i < 7; i++) {
        const cx = (i < 4 ? EL : ER) + (r(20 + i) - 0.5) * 170, cy = (r(30 + i) - 0.5) * 150, z = 10 + r(40 + i) * 12, p = P();
        p.moveTo(cx, Y(cy - z)); p.lineTo(cx + z, Y(cy + z * 0.8)); p.lineTo(cx - z, Y(cy + z * 0.8)); p.closePath();
        st(p, 0.85, 9);
      }
      break;
    }
  }
  return it;
}

/**
 * Paints a face into a context whose current transform maps the 1024×640 design
 * space onto the target. `s` is that transform's scale (shadow blur ignores transforms).
 * Glow strokes: a wide warm halo, then a tight bright core (the sheet's neon look).
 */
export function paintFace(ctx: CanvasRenderingContext2D, key: FaceName, o: FaceParams, s: number): void {
  const items = faceItems(key, o);
  ctx.save();
  ctx.translate(o.lx * 58, -o.ly * 34);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [blur, warm] of [[30, 'rgba(255,172,20,0.95)'], [9, 'rgba(255,240,170,0.9)']] as const) {
    for (const i of items) {
      ctx.globalAlpha = i.a; ctx.shadowBlur = blur * s;
      ctx.shadowColor = i.col === BLUE ? 'rgba(70,175,255,0.95)' : warm;
      if (i.k === 's') { ctx.strokeStyle = i.col; ctx.lineWidth = i.w; ctx.stroke(i.p); }
      else { ctx.fillStyle = i.col; ctx.fill(i.p); }
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

/** Clears `cv` and paints the face across its full size (transparent background). */
export function paintFaceCanvas(cv: HTMLCanvasElement, key: FaceName, o: FaceParams): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const sx = cv.width / FW;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(sx, 0, 0, cv.height / FH, 0, 0);
  paintFace(ctx, key, o, sx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Superellipse path (n ≈ 3, like the screen opening) centred in a w×h box. */
function screenPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, n = 3.2): void {
  const cx = x + w / 2, cy = y + h / 2, a = w / 2, b = h / 2;
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) {
    const th = (i / 96) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const px = cx + a * Math.sign(c) * Math.abs(c) ** (2 / n), py = cy + b * Math.sign(s) * Math.abs(s) ** (2 / n);
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

/** The navy screen tile used for the face picker, the expression grid and the Low-tier fallback. */
export function paintTile(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = '#1C2A5E'; screenPath(ctx, x, y, w, h); ctx.fill();
  const g = ctx.createLinearGradient(x, y, x + w * 0.3, y + h);
  g.addColorStop(0, '#2B3E78'); g.addColorStop(0.55, '#1A2856'); g.addColorStop(1, '#131F47');
  const ix = x + w * 0.035, iy = y + h * 0.05, iw = w * 0.93, ih = h * 0.9;
  ctx.fillStyle = g; screenPath(ctx, ix, iy, iw, ih); ctx.fill();
  const hl = ctx.createRadialGradient(x + w * 0.78, y + h * 0.18, 0, x + w * 0.78, y + h * 0.18, w * 0.5);
  hl.addColorStop(0, 'rgba(120,140,190,0.35)'); hl.addColorStop(1, 'rgba(120,140,190,0)');
  ctx.fillStyle = hl; screenPath(ctx, ix, iy, iw, ih); ctx.fill();
  ctx.restore();
}

/** A face on its navy tile, filling `cv`. Handy for pickers and avatars. */
export function paintFaceTile(cv: HTMLCanvasElement, key: FaceName, t = 0.7): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const w = cv.width, h = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
  paintTile(ctx, 0, 0, w, h);
  const sc = w / FW;
  ctx.setTransform(sc, 0, 0, sc, 0, (h - FH * sc) / 2);
  paintFace(ctx, key, { t, open: 1, talk: 0.7, lx: 0, ly: 0 }, sc);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
