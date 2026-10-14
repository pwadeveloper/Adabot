// Picks the quality tier from measured frame time. Starts at Medium; Medium also
// scales its drawing buffer (0.6–1×, like the prototype) before giving up to Low.
//
// Samples taken while the loop idles at ~20 fps are optimistic: with 50 ms between draws the
// GPU rarely backs up enough to delay the next display frame. So they may only ever count as
// evidence of slowness; stepping up needs samples from full-rate drawing.

export type Tier = 'high' | 'medium' | 'low';
export type TierSetting = 'auto' | Tier;

export type TierStep = 'high' | 'medium' | 'low' | 'scale' | null;

const WINDOW_MS = 1500, WARMUP_MS = 600, MIN_SAMPLES = 12;
/** frame-interval thresholds (ms) */
const HIGH_MAX = 21, SLOW = 24, VERY_SLOW = 30, FAST = 18.5;

export class TierAuto {
  /** Medium drawing-buffer scale */
  scale = 1;
  /** exponential average of frame intervals, for the readout */
  ema = 0;
  private sum = 0;
  private n = 0;
  private sumFull = 0;
  private nFull = 0;
  private win = 0;
  private skipUntil = 0;
  private bad = 0;
  private good = 0;
  private highFailed = false;

  /** Call after any tier/scale/program change: the next frames are not representative. */
  settle(now: number): void {
    this.skipUntil = now + WARMUP_MS; this.win = now + WARMUP_MS;
    this.sum = this.n = this.sumFull = this.nFull = 0;
  }

  /** `full`: the loop was drawing every frame (not the idle ~20 fps). */
  sample(ms: number, now: number, full: boolean): void {
    if (ms <= 0 || ms > 1000) return; // debugger pauses, stalls (resume resets timing)
    this.ema = this.ema ? this.ema * 0.92 + ms * 0.08 : ms;
    if (now < this.skipUntil) return;
    this.sum += ms; this.n++;
    if (full) { this.sumFull += ms; this.nFull++; }
  }

  /** Evaluates the current window; returns a step to take, if any. */
  decide(now: number, tier: Tier): TierStep {
    if (tier === 'low' || now - this.win < WINDOW_MS || this.n < MIN_SAMPLES) return null;
    const mean = this.sum / this.n;
    // fast only counts when measured at full rate, and only if the whole window agrees
    const fast = this.nFull >= MIN_SAMPLES && this.sumFull / this.nFull < FAST && mean < FAST;
    this.sum = this.n = this.sumFull = this.nFull = 0; this.win = now;
    if (tier === 'high') {
      if (mean > HIGH_MAX) { this.highFailed = true; this.good = 0; return 'medium'; }
      return null;
    }
    if (mean > SLOW) {
      this.good = 0;
      if (this.scale > 0.61) { this.scale = Math.max(0.6, this.scale - 0.15); return 'scale'; }
      if (mean > VERY_SLOW && ++this.bad >= 2) return 'low';
      return null;
    }
    this.bad = 0;
    if (fast) {
      if (++this.good < 2) return null;
      this.good = 0;
      if (this.scale < 0.99) { this.scale = Math.min(1, this.scale + 0.1); return 'scale'; }
      return this.highFailed ? null : 'high';
    }
    this.good = 0;
    return null;
  }
}
