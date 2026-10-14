// Character versions: signed-distance shapes measured from the reference renders.
// Units: half the head's on-screen width = 1, origin at the head centre, y up.
// GLSL snippets are spliced into the fragment shader (see shader.ts).

import type { Vec3 } from './math';

export type Version = 'head' | 'pod' | 'buddy' | 'tall';
export const VERSIONS: readonly Version[] = ['head', 'pod', 'buddy', 'tall'];

export interface Rest { yaw: number; pitch: number; roll: number; hyaw: number; hpitch: number; hroll: number }

export interface Variant {
  label: string;
  /** floating heads bob; standing versions breathe and turn the head on the body */
  floating: boolean;
  /** head-space offset of the head pivot, and the pivot in body space */
  P0: Vec3; pivot: Vec3;
  /** head half-size, superellipse exponent, edge rounding, shear (eye-line tilt), taper */
  HS: Vec3; HN: number; HE: number; SHEAR: number; TAPER: number;
  /** shear of the screen opening and the face (the eye line); defaults to SHEAR */
  SSHEAR?: number;
  /** screen half-size, exponent, centre offset, face texture span */
  SH: [number, number]; SN: number; SO: [number, number]; span: number;
  /** antenna root / mid / tip centres in head space, and radii (root, mid, tip) */
  A: { bl: Vec3; ml: Vec3; tl: Vec3; br: Vec3; mr: Vec3; tr: Vec3; r: Vec3 };
  /** 1 = warm bulb tips with curved stems (Pod) */
  warm: 0 | 1;
  /** GLSL: extra head-space shaping (variable `h`, point `p`) */
  extra: string;
  /** GLSL: body-space torso/limbs distance, `pb` in, returns float */
  body: string;
  /** GLSL: interior glow blobs accumulated into `g` */
  glow: string;
  ground: number;
  bound: { c: Vec3; r: number };
  frame: { y0: number; y1: number; x0: number; x1: number };
  rest: Rest;
}

export const VARIANTS: Record<Version, Variant> = {
  head: {
    label: 'Head', floating: true, P0: [0, 0, 0], pivot: [0, 0, 0],
    HS: [1.015, 0.705, 0.56], HN: 2.8, HE: 0.425, SHEAR: 0.04, SSHEAR: 0.095, TAPER: -0.03,
    SH: [0.725, 0.5], SN: 3.0, SO: [0.045, 0.036], span: 1.0,
    A: { bl: [-0.56, 0.58, -0.12], ml: [-0.67, 0.9, -0.12], tl: [-0.78, 1.22, -0.12], br: [0.33, 0.58, -0.14], mr: [0.39, 0.95, -0.14], tr: [0.45, 1.32, -0.14], r: [0.095, 0.112, 0.13] },
    warm: 0,
    // the bottom-left lobe that hangs lowest
    extra: 'h = smin(h, sdEll(p - vec3(-0.28,-0.40,0.0), vec3(0.50,0.32,0.46)), 0.20);',
    body: 'return 1e5;',
    glow: `g += blob(ph, vec3(-0.72,-0.22,0.25), 0.34, vec3(0.32,0.55,0.86), 0.75);
g += blob(ph, vec3(-0.3,-0.62,0.25), 0.42, vec3(0.42,0.74,0.9), 1.0);
g += blob(ph, vec3(0.75,-0.5,0.15), 0.35, vec3(0.5,0.66,0.88), 0.5);`,
    ground: -1.75, bound: { c: [-0.1, 0.25, 0], r: 1.7 }, frame: { y0: -1.8, y1: 1.5, x0: -1.25, x1: 1.25 },
    rest: { yaw: 0.18, pitch: 0.05, roll: 0.0, hyaw: 0, hpitch: 0, hroll: 0 }
  },
  pod: {
    label: 'Pod', floating: true, P0: [0, 0, 0], pivot: [0, 0, 0],
    HS: [0.9775, 1.03, 0.62], HN: 2.85, HE: 0.41, SHEAR: 0.02, SSHEAR: 0.105, TAPER: 0.05,
    SH: [0.763, 0.485], SN: 3.0, SO: [-0.04, 0.33], span: 1.0,
    A: { bl: [-0.56, 0.9, -0.1], ml: [-0.64, 1.08, -0.1], tl: [-0.68, 1.22, -0.1], br: [0.29, 0.9, -0.12], mr: [0.36, 1.14, -0.12], tr: [0.45, 1.34, -0.12], r: [0.1, 0.1, 0.125] },
    warm: 1,
    // the left side recedes toward the bottom
    extra: '{ float wl = p.x < 0.0 ? 1.0 + 0.075*p.y/HS.y : 1.0; h = extrude(sdSE(vec2(p.x/wl, p.y), hb, HN), p.z, HS.z, HE); }',
    body: 'return 1e5;',
    // cyan patch left of centre, cobalt patch right, paler bottom-left (MEASUREMENTS known gap)
    glow: `g += blob(ph, vec3(-0.12,-0.4,0.3), 0.3, vec3(0.26,0.76,0.93), 1.3);
g += blob(ph, vec3(0.55,-0.3,0.22), 0.26, vec3(0.28,0.45,0.86), 1.3);
g += blob(ph, vec3(-0.8,0.25,0.1), 0.32, vec3(0.5,0.62,0.86), 0.4);
g += blob(ph, vec3(-0.45,-0.78,0.25), 0.36, vec3(0.86,0.91,0.96), 0.9);
g += blob(ph, vec3(0.45,-0.85,0.2), 0.3, vec3(0.75,0.84,0.94), 0.6);`,
    ground: -1.9, bound: { c: [0, 0.2, 0], r: 1.75 }, frame: { y0: -1.95, y1: 1.5, x0: -1.25, x1: 1.25 },
    rest: { yaw: 0.16, pitch: 0.0, roll: 0.0, hyaw: 0, hpitch: 0, hroll: 0 }
  },
  buddy: {
    label: 'Buddy', floating: false, P0: [0, -0.66, 0], pivot: [0, -0.66, 0],
    HS: [1.0, 0.75, 0.56], HN: 3.0, HE: 0.42, SHEAR: 0.06, TAPER: 0.0,
    SH: [0.85, 0.56], SN: 3.0, SO: [0.02, 0.03], span: 1.0,
    A: { bl: [-0.55, 0.62, -0.12], ml: [-0.64, 0.8, -0.12], tl: [-0.75, 0.98, -0.12], br: [0.38, 0.56, -0.14], mr: [0.41, 0.86, -0.14], tr: [0.44, 1.08, -0.14], r: [0.12, 0.13, 0.14] },
    warm: 0,
    extra: '',
    body: `vec3 t = pb - vec3(0.11,0.0,0.0);
vec3 tb = t - vec3(0.0,-1.18,0.0);
float d = mix(extrude(sdSE(tb.xy, vec2(0.64,0.56), 2.4), tb.z, 0.5, 0.3), sdEll(tb, vec3(0.68,0.6,0.52)), 0.3);
float lg = min(sdRC(t, vec3(-0.31,-1.45,0.02), vec3(-0.315,-1.8,0.04), 0.215, 0.205), sdRC(t, vec3(0.32,-1.45,0.02), vec3(0.32,-1.8,0.04), 0.215, 0.205));
lg = smin(lg, min(sdEll(t-vec3(-0.32,-1.87,0.06), vec3(0.22,0.11,0.25)), sdEll(t-vec3(0.33,-1.87,0.06), vec3(0.22,0.11,0.25))), 0.08);
d = smin(d, lg, 0.1);
vec3 al = pb - vec3(-0.5,-0.84,0.04); al.xy = mat2(uArm.x,uArm.y,-uArm.y,uArm.x)*al.xy;
vec3 ar = pb - vec3(0.6,-0.84,0.04); ar.xy = mat2(uArm.z,uArm.w,-uArm.w,uArm.z)*ar.xy;
d = smin(d, min(sdRC(al, vec3(0.0), vec3(-0.3,-0.48,0.04), 0.14, 0.15), sdRC(ar, vec3(0.0), vec3(0.48,0.32,0.04), 0.155, 0.175)), 0.12);
return d;`,
    glow: `vec3 t = pb - vec3(0.11,0.0,0.0);
g += blob(ph, vec3(0.0,-0.68,0.28), 0.32, vec3(0.24,0.45,0.84), 1.4);
g += blob(ph, vec3(-0.8,-0.2,0.15), 0.32, vec3(0.42,0.56,0.84), 0.5);
g += blob(t, vec3(-0.12,-1.3,0.32), 0.36, vec3(0.16,0.64,0.9), 2.4);
g += blob(t, vec3(0.1,-0.88,0.32), 0.33, vec3(0.17,0.37,0.82), 2.6);
g += blob(t, vec3(0.45,-1.3,0.2), 0.3, vec3(0.38,0.55,0.86), 1.0);
g += blob(t, vec3(0.0,-1.7,0.25), 0.3, vec3(0.5,0.8,0.9), 0.7);`,
    ground: -1.98, bound: { c: [0.15, -0.6, 0], r: 1.9 }, frame: { y0: -2.0, y1: 1.2, x0: -1.25, x1: 1.4 },
    rest: { yaw: 0.12, pitch: 0.03, roll: 0, hyaw: 0.08, hpitch: 0, hroll: 0 }
  },
  tall: {
    label: 'Tall', floating: false, P0: [0, -0.6, 0], pivot: [0, -0.6, 0],
    HS: [1.0, 0.67, 0.5], HN: 3.0, HE: 0.38, SHEAR: 0.03, TAPER: 0.0,
    SH: [0.84, 0.52], SN: 3.0, SO: [0.0, 0.05], span: 1.0,
    A: { bl: [-0.6, 0.53, -0.1], ml: [-0.68, 0.88, -0.1], tl: [-0.77, 1.2, -0.1], br: [0.41, 0.53, -0.12], mr: [0.45, 0.94, -0.12], tr: [0.49, 1.31, -0.12], r: [0.12, 0.125, 0.135] },
    warm: 0,
    extra: '',
    body: `vec3 q = pb;
float d = sdRC(vec3(q.x,q.y,q.z*1.3), vec3(0.04,-0.62,0.0), vec3(0.04,-1.96,0.0), 0.24, 0.34)/1.3;
d = smin(d, sdEll(q-vec3(0.04,-1.32,0.0), vec3(0.42,0.52,0.31)), 0.22);
float lg = min(sdRC(q, vec3(-0.2,-2.15,0.0), vec3(-0.22,-3.78,0.02), 0.145, 0.14), sdRC(q, vec3(0.28,-2.15,0.0), vec3(0.3,-3.78,0.02), 0.15, 0.14));
lg = smin(lg, min(sdEll(q-vec3(-0.3,-3.86,0.06), vec3(0.24,0.11,0.26)), sdEll(q-vec3(0.33,-3.86,0.06), vec3(0.28,0.11,0.27))), 0.1);
d = smin(d, lg, 0.1);
vec3 l = q - vec3(-0.42,-0.92,0.0); l.xy = mat2(uArm.x,uArm.y,-uArm.y,uArm.x)*l.xy;
float al = smin(sdRC(l, vec3(0.0), vec3(-0.2,-0.42,0.02), 0.12, 0.115), sdRC(l, vec3(-0.2,-0.42,0.02), vec3(-0.38,-1.2,0.04), 0.115, 0.105), 0.05);
al = smin(al, sdEll(l-vec3(-0.38,-1.6,0.05), vec3(0.12,0.24,0.085)), 0.08);
al = min(al, min(sdRC(l, vec3(-0.45,-1.7,0.06), vec3(-0.47,-1.88,0.09), 0.038, 0.034), sdRC(l, vec3(-0.32,-1.74,0.08), vec3(-0.31,-1.9,0.11), 0.038, 0.034)));
vec3 r = q - vec3(0.48,-0.97,0.0); r.xy = mat2(uArm.z,uArm.w,-uArm.w,uArm.z)*r.xy;
vec3 E = vec3(0.65,0.17,0.04);
float ar = sdRC(r, vec3(0.0), E, 0.125, 0.115);
vec3 f = r - E; f.xy = mat2(uArm2.x,uArm2.y,-uArm2.y,uArm2.x)*f.xy;
ar = smin(ar, sdRC(f, vec3(0.0), vec3(0.25,0.4,0.01), 0.115, 0.105), 0.05);
vec3 hp = f - vec3(0.34,0.68,0.01);
float hand = sdEll(hp, vec3(0.17,0.19,0.09));
hand = min(hand, sdRC(hp, vec3(-0.1,0.07,0.0), vec3(-0.22,0.2,0.0), 0.05, 0.048));
hand = min(hand, sdRC(hp, vec3(-0.03,0.11,0.0), vec3(-0.08,0.29,0.0), 0.052, 0.05));
hand = min(hand, sdRC(hp, vec3(0.04,0.11,0.0), vec3(0.06,0.3,0.0), 0.052, 0.048));
hand = min(hand, sdRC(hp, vec3(0.11,0.07,0.0), vec3(0.2,0.24,0.0), 0.048, 0.045));
hand = min(hand, sdRC(hp, vec3(-0.12,-0.04,0.0), vec3(-0.27,0.04,0.02), 0.052, 0.048));
ar = smin(ar, hand, 0.06);
return smin(d, min(al, ar), 0.08);`,
    glow: `g += blob(ph, vec3(-0.2,-0.55,0.15), 0.3, vec3(0.26,0.45,0.82), 0.6);
g += blob(pb, vec3(0.04,-1.5,0.22), 0.38, vec3(0.22,0.7,0.9), 1.8);
g += blob(pb, vec3(0.03,-0.98,0.2), 0.28, vec3(0.22,0.44,0.84), 1.4);
g += blob(pb, vec3(0.05,-2.0,0.2), 0.3, vec3(0.45,0.78,0.9), 0.6);`,
    ground: -3.98, bound: { c: [0.35, -1.4, 0], r: 2.98 }, frame: { y0: -4.02, y1: 1.45, x0: -1.15, x1: 1.9 },
    rest: { yaw: 0.08, pitch: 0.02, roll: 0, hyaw: 0.06, hpitch: 0, hroll: 0 }
  }
};

/** Antenna mid/tip points relative to their root, as the shader expects. */
export function antennaLocal(v: Variant): { ml: Vec3; tl: Vec3; mr: Vec3; tr: Vec3 } {
  const { bl, br, ml, tl, mr, tr } = v.A;
  const rel = (p: Vec3, o: Vec3): Vec3 => [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  return { ml: rel(ml, bl), tl: rel(tl, bl), mr: rel(mr, br), tr: rel(tr, br) };
}
