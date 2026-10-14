// Exposes a guide below the fold for scripts/runtime-check.mjs. Counts WebGL context creation
// and frames actually drawn (gl.drawArrays calls).
import { createGuide, type GuideController } from '../src/index';

const counts = { contexts: 0, draws: 0, frames: 0 };
const tick = (): void => { counts.frames++; requestAnimationFrame(tick); };
requestAnimationFrame(tick);
// eslint-disable-next-line @typescript-eslint/unbound-method -- always invoked with .call(canvas)
const getContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
  const ctx = (getContext as (this: HTMLCanvasElement, t: string, ...r: unknown[]) => RenderingContext | null).call(this, type, ...rest);
  if (ctx && type === 'webgl' && this.id === 'c') {
    counts.contexts++;
    const gl = ctx as WebGLRenderingContext, draw = gl.drawArrays.bind(gl);
    gl.drawArrays = (...a: Parameters<WebGLRenderingContext['drawArrays']>) => { counts.draws++; draw(...a); };
  }
  return ctx;
} as typeof HTMLCanvasElement.prototype.getContext;

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
let guide: GuideController | null = createGuide(canvas, { version: 'head', allowSoftwareGL: true, tier: (params.get('tier') ?? 'auto') as 'auto', posterBase: '/posters/' });
const w = window as unknown as Record<string, unknown>;
w.counts = counts;
w.guide = () => guide;
w.destroyGuide = () => {
  guide?.destroy(); guide = null;
  const gl = (getContext as (this: HTMLCanvasElement, t: string) => RenderingContext | null).call(canvas, 'webgl') as WebGLRenderingContext | null;
  return { lost: !!gl && gl.isContextLost(), posters: document.querySelectorAll('[data-kaykav-poster]').length };
};
