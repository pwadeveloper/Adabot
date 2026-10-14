import { add, cross, normalize, sub, type Vec3 } from './math';
import type { Variant } from './variants';

export interface Camera { pos: Vec3; X: Vec3; Y: Vec3; Z: Vec3; focal: number }

const FOV = (26 * Math.PI) / 180;

/** Fits the version's frame box into a w×h viewport (any units; only the aspect matters). */
export function framing(v: Variant, w: number, h: number): Camera {
  const th = Math.tan(FOV / 2), aspect = w / h;
  const fr = v.frame, Hh = (fr.y1 - fr.y0) / 2, Wh = (fr.x1 - fr.x0) / 2;
  const dist = Math.max(Hh / th, Wh / (th * aspect * 0.96)) * 1.04;
  const target: Vec3 = [(fr.x0 + fr.x1) / 2, (fr.y0 + fr.y1) / 2, 0];
  const pos = add(target, [0, dist * 0.1, dist]);
  const Z = normalize(sub(target, pos)), X = normalize(cross(Z, [0, 1, 0])), Y = cross(X, Z);
  return { pos, X, Y, Z, focal: 0.5 / th };
}

/** World point → viewport coordinates (same units as the w×h given to framing), y down. */
export function project(cam: Camera, p: Vec3, w: number, h: number): [number, number] | null {
  const d = sub(p, cam.pos);
  const z = d[0] * cam.Z[0] + d[1] * cam.Z[1] + d[2] * cam.Z[2];
  if (z <= 0) return null;
  const x = ((d[0] * cam.X[0] + d[1] * cam.X[1] + d[2] * cam.X[2]) * cam.focal) / z;
  const y = ((d[0] * cam.Y[0] + d[1] * cam.Y[1] + d[2] * cam.Y[2]) * cam.focal) / z;
  return [w / 2 + x * h, h / 2 - y * h];
}
