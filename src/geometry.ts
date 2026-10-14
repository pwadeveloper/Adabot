import { add, apply, mulv, sub, type Vec3 } from './math';
import type { World } from './rig';
import { antennaLocal, type Variant } from './variants';

/** Head space → world space, mirroring toBody/toHead in the shader. */
export function headToWorld(v: Variant, w: World, ph: Vec3): Vec3 {
  const pb = add(apply(w.Rh, sub(ph, v.P0)), v.pivot);
  return add(apply(w.Rb, mulv(pb, w.squash)), w.bodyPos);
}

export interface AntennaPoints { bases: [Vec3, Vec3]; tips: [Vec3, Vec3]; tipR: number }

export function antennaPoints(v: Variant, w: World): AntennaPoints {
  const L = antennaLocal(v), top = v.HS[1] - v.A.bl[1];
  const pt = (i: 0 | 1, local: Vec3): Vec3 =>
    headToWorld(v, w, add(apply(w.antRot[i], local), i ? v.A.br : v.A.bl));
  return {
    bases: [pt(0, [0, top, 0]), pt(1, [0, top, 0])],
    tips: [pt(0, L.tl), pt(1, L.tr)],
    tipR: v.A.r[2]
  };
}

/** Halo points (antenna-root mint glow, or the Pod's warm bulb tips) as shader uniforms. */
export function halos(v: Variant, w: World): { p: Float32Array; c: Float32Array } {
  const L = antennaLocal(v), top = v.HS[1] - v.A.bl[1];
  const pt = (i: 0 | 1, local: Vec3): Vec3 =>
    headToWorld(v, w, add(apply(w.antRot[i], local), i ? v.A.br : v.A.bl));
  if (v.warm) {
    return {
      p: new Float32Array([...pt(0, L.tl), ...pt(1, L.tr), 0, -99, 0]),
      c: new Float32Array([1.0, 0.78, 0.55, 0.16, 1.0, 0.78, 0.55, 0.16, 0, 0, 0, 0])
    };
  }
  const a = 0.16 * w.glow;
  return {
    p: new Float32Array([...pt(0, [0, top + 0.05, 0]), ...pt(1, [0, top + 0.05, 0]), 0, -99, 0]),
    c: new Float32Array([0.35, 0.95, 0.8, a, 0.35, 0.95, 0.8, a, 0, 0, 0, 0])
  };
}

/**
 * World positions of the face texture's corners (canvas top-left, top-right,
 * bottom-right, bottom-left), on the screen glass. Used to lay the 2D face over a poster.
 */
export function faceCorners(v: Variant, w: World): [Vec3, Vec3, Vec3, Vec3] {
  const span = 2 * v.SH[0] * v.span, z = v.HS[2] - 0.15;
  const at = (u: number, vv: number): Vec3 => {
    const qx = (u - 0.5) * span, qy = (vv - 0.5) * (span / 1.6);
    const x = qx + v.SO[0];
    return headToWorld(v, w, [x, qy + v.SO[1] + v.SHEAR * x, z]);
  };
  // texture v = 1 is the canvas top (the texture is uploaded flipped)
  return [at(0, 1), at(1, 1), at(1, 0), at(0, 0)];
}
