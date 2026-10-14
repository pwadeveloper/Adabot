// State and motion: gaze, blinks, bob/jump/squash, spring antennas, arms, per-face body language.

import { blinks, type FaceName, type FaceParams } from './faces';
import { clamp, euler, IDENTITY, lerp, mul, rx, rz, type Mat3, type Vec3 } from './math';
import { VARIANTS, type Version } from './variants';

export type Mode = 'idle' | 'listening' | 'thinking' | 'talking' | 'sleep';
export const MODES: readonly Mode[] = ['idle', 'listening', 'thinking', 'talking', 'sleep'];

export interface World {
  Rb: Mat3; Rh: Mat3; bodyPos: Vec3; squash: Vec3;
  antRot: [Mat3, Mat3];
  /** left arm, right arm, right forearm angles (radians) */
  arm: Vec3;
  glow: number;
}

const MODE_FACE: Record<Mode, FaceName> = {
  idle: 'neutral', listening: 'listening', thinking: 'thinking', talking: 'talking', sleep: 'sleeping'
};

interface Reaction { jump?: number; wave?: number; flick?: number }
const REACT: Partial<Record<FaceName, Reaction>> = {
  happy: { jump: 1.2, wave: 1 }, excited: { jump: 2.2, wave: 1, flick: 5 }, love: { jump: 1.0 }, proud: { jump: 0.7 },
  playful: { jump: 0.9 }, surprised: { jump: 1.2, flick: 5 }, shocked: { jump: 1.7, flick: 8 }, laughing: { flick: 3 },
  giggling: { flick: 4 }, cheeky: { flick: 2 }
};
export const TAP_FACES: readonly FaceName[] = ['happy', 'excited', 'love', 'laughing', 'giggling', 'surprised', 'cheeky', 'proud'];
export const reactionJumps = (f: FaceName): boolean => !!REACT[f]?.jump;

/**
 * Buddy's right arm is modelled raised (the reference render's waving pose). At rest it hangs
 * by his side, rotated down by this much; gestures lift it back up.
 */
export const BUDDY_ARM_DOWN = -1.4;
/** Buddy's left arm lifted up and out, for the Excited cheer. */
const BUDDY_ARM_CHEER = -1.5;

/**
 * Which pose a still render uses: 'rest' is how the guide stands on the page (Buddy's hands
 * down); 'reference' matches the reference renders (Buddy waving), for fidelity measurement.
 */
export type StillPose = 'rest' | 'reference';

interface Motion { roll: number; pitch: number; yaw: number; x: number; droop: number }

/** Continuous, per-face body language. */
function faceMotion(f: FaceName, t: number, reduce: boolean): Motion {
  const m: Motion = { roll: 0, pitch: 0, yaw: 0, x: 0, droop: 0 };
  const amp = reduce ? 0.3 : 1;
  switch (f) {
    case 'sad': case 'crying': m.pitch = 0.16; m.droop = 1; break;
    case 'tired': case 'bored': m.pitch = 0.1; m.droop = 0.6; m.roll = 0.07; break;
    case 'sleeping': m.pitch = 0.14; m.droop = 1; m.roll = Math.sin(t * 0.8) * 0.05; break;
    case 'thinking': m.roll = 0.11; m.pitch = -0.08; break;
    case 'curious': m.roll = -0.13; m.pitch = 0.05; break;
    case 'confused': m.roll = 0.15 * Math.sin(t * 1.4); break;
    case 'shy': m.roll = -0.12; m.pitch = 0.12; m.yaw = -0.15; break;
    case 'skeptical': m.roll = -0.1; m.yaw = -0.08; break;
    case 'gloating': case 'proud': m.pitch = -0.1; m.roll = 0.05; break;
    case 'wink': case 'cheeky': m.roll = 0.09; break;
    case 'laughing': case 'giggling': m.pitch = Math.sin(t * 18) * 0.04 * amp; m.roll = Math.sin(t * 9) * 0.04 * amp; break;
    case 'scared': case 'nervous': case 'jittery': m.x = Math.sin(t * 46) * 0.018 * amp; m.roll = Math.sin(t * 31) * 0.02 * amp; break;
    case 'dizzy': m.roll = Math.sin(t * 3) * 0.12 * amp; m.pitch = Math.cos(t * 3) * 0.06 * amp; break;
    case 'relaxed': case 'peaceful': m.roll = Math.sin(t * 0.9) * 0.06; break;
    case 'determined': m.pitch = 0.05; break;
    case 'glitch': { const s = Math.floor(t * 2.5); m.x = Math.sin(s * 91.7) * 0.03 * amp; m.roll = Math.sin(s * 13.1) * 0.05 * amp; break; }
    default: break;
  }
  return m;
}

interface Spring { side: -1 | 1; x: number; vx: number; z: number; vz: number; k: number }

export class Rig {
  version: Version = 'buddy';
  mode: Mode = 'idle';
  face: FaceName | null = null;
  faceUntil = 0;
  talk = 0;
  waveUntil = 0;
  reduce = false;
  /** where the guide is asked to look, −1..1 */
  gaze = { x: 0, y: 0 };
  lastAct = 0;
  sleepAfter = 30000;
  autoSlept = false;
  onAutoMode: ((m: Mode) => void) | null = null;

  private pose = { lx: 0, ly: 0, yaw: 0, pitch: 0, roll: 0, hyaw: 0, hpitch: 0, hroll: 0, open: 1, blink: 0, nextBlink: 2.2 };
  private J = { y: 0, v: 0 };
  private SQ = { x: 0, v: 0 };
  private ants: [Spring, Spring] = [
    { side: -1, x: 0, vx: 0, z: 0, vz: 0, k: 70 },
    { side: 1, x: 0, vx: 0, z: 0, vz: 0, k: 82 }
  ];
  private prevYaw = 0;
  private t = 0;
  /** how far each of Buddy's arms is lifted for a gesture, 0 (hanging) .. 1 (raised) */
  private lift = { l: 0, r: 0, tl: 0, tr: 0 };
  world: World = Rig.restWorld('buddy');

  constructor(version: Version, now: number) {
    this.lastAct = now;
    this.setVersion(version);
  }

  setVersion(v: Version): void {
    this.version = v;
    for (const a of this.ants) { a.x = a.z = a.vx = a.vz = 0; }
    this.lift.l = this.lift.r = this.lift.tl = this.lift.tr = 0;
    const R = VARIANTS[v].rest;
    Object.assign(this.pose, { yaw: R.yaw, pitch: R.pitch, roll: R.roll, hyaw: R.hyaw, hpitch: R.hpitch, hroll: R.hroll });
    this.prevYaw = R.yaw + R.hyaw;
    this.world = Rig.restWorld(v);
  }

  currentFace(now: number): FaceName {
    if (this.face && now < this.faceUntil) return this.face;
    return MODE_FACE[this.mode];
  }

  jump(v = 1.3): void {
    if (this.J.y < 0.03) this.J.v = v * (this.reduce ? 0.35 : 1);
    this.SQ.v -= 2.5;
  }

  wave(now: number, ms = 1700): void { this.waveUntil = now + ms; }

  flick(i: 0 | 1, amount: number): void {
    const a = this.ants[i];
    a.vz += amount * a.side; a.vx -= amount * 0.43;
  }

  showFace(key: FaceName, ms: number, now: number): void {
    this.face = key;
    this.faceUntil = now + ms;
    const r = REACT[key];
    if (!r) return;
    if (r.jump) this.jump(r.jump);
    if (r.flick) for (const a of this.ants) a.vz += r.flick * a.side;
    if (r.wave) this.waveUntil = now + 1700;
  }

  wake(now: number): void {
    this.lastAct = now;
    if (this.autoSlept && this.mode === 'sleep') {
      this.autoSlept = false;
      this.mode = 'idle';
      this.onAutoMode?.('idle');
      this.showFace('surprised', 900, now);
    }
  }

  /** True while anything transient is moving: reactions, talking, springs, gaze or pose catching up. */
  busy(now: number): boolean {
    const p = this.pose, J = this.J, SQ = this.SQ;
    if (now < this.faceUntil || now < this.waveUntil || this.talk > 0.02) return true;
    if (J.y > 0 || Math.abs(J.v) > 0.01 || Math.abs(SQ.x) > 0.003 || Math.abs(SQ.v) > 0.03) return true;
    for (const a of this.ants) if (Math.abs(a.x) + Math.abs(a.z) > 0.004 || Math.abs(a.vx) + Math.abs(a.vz) > 0.04) return true;
    if (Math.abs(this.lift.r - this.lift.tr) > 0.01 || Math.abs(this.lift.l - this.lift.tl) > 0.01) return true;
    return Math.abs(p.lx - this.gaze.x) > 0.01 || Math.abs(p.ly - this.gaze.y) > 0.01;
  }

  faceParams(): FaceParams {
    const p = this.pose;
    return { t: this.reduce ? 0.7 : this.t, open: p.open, talk: this.talk, lx: p.lx * 0.9, ly: p.ly * 0.9 };
  }

  /** Advances the rig. `now` in ms, `dt` in seconds (clamped). Returns the face to show. */
  tick(now: number, dtIn: number): FaceName {
    const dt = Math.min(0.05, Math.max(0, dtIn));
    const t = (this.t = now / 1000);
    const v = VARIANTS[this.version], p = this.pose, reduce = this.reduce;

    if (this.mode === 'idle' && this.sleepAfter > 0 && now - this.lastAct > this.sleepAfter) {
      this.mode = 'sleep'; this.autoSlept = true; this.onAutoMode?.('sleep');
    }
    const f = this.currentFace(now);

    // gaze
    let lx = this.gaze.x, ly = this.gaze.y;
    if (f === 'thinking') { lx = 0.55 + Math.sin(t * 0.9) * 0.15; ly = 0.6; }
    else if (f === 'sleeping' || f === 'sad' || f === 'crying') { lx = 0; ly = -0.4; }
    const k = Math.min(1, dt * 5);
    p.lx = lerp(p.lx, clamp(lx, -1, 1), k); p.ly = lerp(p.ly, clamp(ly, -1, 1), k);

    // blinks
    p.nextBlink -= dt;
    if (p.nextBlink <= 0) { p.blink = 1; p.nextBlink = 2.4 + Math.random() * 3.2; }
    p.blink = Math.max(0, p.blink - dt * 7);
    p.open = blinks(f) ? 1 - Math.sin(p.blink * Math.PI) : 1;
    this.talk = Math.max(0, this.talk - dt * 1.6);

    const m = faceMotion(f, t, reduce), R = v.rest;
    const lookYaw = p.lx * 0.45, lookPitch = -p.ly * 0.24;
    const talkNod = f === 'talking' && !reduce ? Math.sin(t * 7.3) * 0.03 * this.talk : 0;
    let tY: number, tP: number, tR: number, hY = 0, hP = 0, hR = 0;
    if (v.floating) { tY = R.yaw + lookYaw + m.yaw; tP = R.pitch + lookPitch + m.pitch + talkNod; tR = R.roll + m.roll; }
    else {
      tY = R.yaw + lookYaw * 0.35; tP = R.pitch; tR = R.roll + m.roll * 0.3;
      hY = R.hyaw + lookYaw * 0.7 + m.yaw; hP = R.hpitch + lookPitch + m.pitch + talkNod; hR = R.hroll + m.roll;
    }
    const hk = Math.min(1, dt * 5);
    p.yaw = lerp(p.yaw, tY, hk); p.pitch = lerp(p.pitch, tP, hk); p.roll = lerp(p.roll, tR, hk);
    p.hyaw = lerp(p.hyaw, hY, hk); p.hpitch = lerp(p.hpitch, hP, hk); p.hroll = lerp(p.hroll, hR, hk);
    const yawVel = (p.yaw + p.hyaw - this.prevYaw) / Math.max(dt, 1e-3);
    this.prevYaw = p.yaw + p.hyaw;

    // bob / jump / squash
    const J = this.J, SQ = this.SQ;
    J.v -= 16 * dt; J.y += J.v * dt;
    if (J.y < 0) {
      if (J.v < -1.5) { SQ.v += -J.v * 2.2; for (const a of this.ants) a.vx += J.v * 0.5; }
      J.y = 0; J.v = 0;
    }
    SQ.v += (-140 * SQ.x - 9 * SQ.v) * dt; SQ.x += SQ.v * dt;
    const sleepy = f === 'sleeping';
    const bob = v.floating ? Math.sin(t * 1.6) * (reduce ? 0.015 : sleepy ? 0.03 : 0.07) : 0;
    const breathe = v.floating ? 0 : Math.sin(t * (sleepy ? 1.2 : 2.0)) * 0.012 * (reduce ? 0.3 : 1);
    const w = this.world;
    w.squash = [1 + SQ.x * 0.06 - breathe * 0.4, 1 - SQ.x * 0.08 + breathe, 1 + SQ.x * 0.06 - breathe * 0.4];
    w.bodyPos = [m.x, bob + J.y, 0];

    // antenna springs
    for (const a of this.ants) {
      a.vx += (-a.k * a.x - 4 * a.vx) * dt;
      a.vz += (-a.k * a.z - 4 * a.vz + clamp(yawVel, -6, 6) * 0.8 * (reduce ? 0.3 : 1)) * dt;
      a.x = clamp(a.x + a.vx * dt, -0.6, 0.6); a.z = clamp(a.z + a.vz * dt, -0.7, 0.7);
    }
    const droop = m.droop, wob = reduce ? 0 : 0.03;
    const [a0, a1] = this.ants;
    w.antRot = [
      mul(rz(a0.z + Math.sin(t * 1.3) * wob - droop * 0.32 * a0.side), rx(a0.x + droop * 0.1)),
      mul(rz(a1.z + Math.sin(t * 1.3 + 1.7) * wob - droop * 0.32 * a1.side), rx(a1.x + droop * 0.1))
    ];

    // arms (Buddy, Tall)
    const waving = now < this.waveUntil ? Math.sin((Math.PI * (this.waveUntil - now)) / 1700) : 0;
    const sway = reduce ? 0 : Math.sin(t * 1.3) * 0.04;
    let armL = sway + droop * 0.06, armR = 0, arm2 = 0;
    if (this.version === 'buddy') {
      // hands down unless a gesture needs them: waving lifts the right arm, Excited cheers with both
      const L = this.lift, cheer = f === 'excited' && now < this.faceUntil;
      L.tr = waving > 0 || cheer ? 1 : 0;
      L.tl = cheer ? 1 : 0;
      const up = Math.min(1, dt * 7), down = Math.min(1, dt * 4);
      L.r += (L.tr - L.r) * (L.tr > L.r ? up : down);
      L.l += (L.tl - L.l) * (L.tl > L.l ? up : down);
      const wv = waving * (reduce ? 0.4 : 1);
      const hang = BUDDY_ARM_DOWN - sway - droop * 0.06;
      armR = lerp(hang, Math.sin(t * 10) * 0.32 * wv, L.r);
      armL = lerp(armL, BUDDY_ARM_CHEER + Math.sin(t * 9) * 0.1 * (reduce ? 0.3 : 1), L.l);
    }
    if (this.version === 'tall') {
      const idleWave = reduce ? 0 : clamp((Math.sin(t * 0.55) - 0.9) / 0.1, 0, 1) * 0.5;
      arm2 = Math.sin(t * 9) * 0.38 * Math.max(waving, idleWave) * (reduce ? 0.4 : 1);
      armR = -droop * 0.6;
    }
    w.arm = [armL, armR, arm2];

    // antenna glow level
    let glow = 0.75;
    if (f === 'thinking') glow = 0.95 + (reduce ? 0 : 0.25 * Math.sin(t * 6));
    else if (f === 'talking') glow = 0.75 + this.talk * 0.4;
    else if (sleepy) glow = 0.25;
    w.glow = lerp(w.glow, glow, Math.min(1, dt * 5));

    w.Rb = euler(p.yaw, p.pitch, p.roll);
    w.Rh = euler(p.hyaw, p.hpitch, p.hroll);
    return f;
  }

  /** A still pose for posters, fidelity renders and Low-tier hit-testing (see StillPose). */
  static restWorld(version: Version, pose: StillPose = 'rest'): World {
    const R = VARIANTS[version].rest;
    const arm: Vec3 = version === 'buddy' && pose === 'rest' ? [0, BUDDY_ARM_DOWN, 0] : [0, 0, 0];
    return {
      Rb: euler(R.yaw, R.pitch, R.roll), Rh: euler(R.hyaw, R.hpitch, R.hroll),
      bodyPos: [0, 0, 0], squash: [1, 1, 1], antRot: [IDENTITY, IDENTITY], arm, glow: 0.75
    };
  }
}
