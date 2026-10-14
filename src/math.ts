// Small vector / 3×3 matrix kit (row-major arrays), enough for the rig and the camera.

export type Vec3 = [number, number, number];
export type Mat3 = readonly number[];

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export const rx = (a: number): Mat3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
export const ry = (a: number): Mat3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
export const rz = (a: number): Mat3 => {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};
export const mul = (A: Mat3, B: Mat3): Mat3 => {
  const r: number[] = new Array<number>(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      r[i * 3 + j] = A[i * 3]! * B[j]! + A[i * 3 + 1]! * B[3 + j]! + A[i * 3 + 2]! * B[6 + j]!;
  return r;
};
export const transpose = (A: Mat3): Mat3 => [A[0]!, A[3]!, A[6]!, A[1]!, A[4]!, A[7]!, A[2]!, A[5]!, A[8]!];
export const apply = (A: Mat3, v: Vec3): Vec3 => [
  A[0]! * v[0] + A[1]! * v[1] + A[2]! * v[2],
  A[3]! * v[0] + A[4]! * v[1] + A[5]! * v[2],
  A[6]! * v[0] + A[7]! * v[1] + A[8]! * v[2]
];
/** Column-major Float32Array for gl.uniformMatrix3fv. */
export const toGL = (A: Mat3): Float32Array =>
  new Float32Array([A[0]!, A[3]!, A[6]!, A[1]!, A[4]!, A[7]!, A[2]!, A[5]!, A[8]!]);

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const mulv = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
export const euler = (yaw: number, pitch: number, roll: number): Mat3 => mul(ry(yaw), mul(rx(pitch), rz(roll)));
export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
