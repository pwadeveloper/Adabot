// WebGL plumbing: one fullscreen triangle, one program per (version, level), the face texture.
// Programs compile asynchronously when KHR_parallel_shader_compile is available.

import type { Camera } from './camera';
import { halos } from './geometry';
import { add, apply, mulv, toGL, transpose } from './math';
import type { World } from './rig';
import { fragSource, VERT, type Level } from './shader';
import { VARIANTS, type Version } from './variants';

type ProgState = 'pending' | 'ready' | 'failed';
interface Prog {
  p: WebGLProgram; fs: WebGLShader; state: ProgState;
  u: Record<string, WebGLUniformLocation | null>;
}

export interface RendererOptions {
  /** allow software (SwiftShader-class) WebGL; off for real users, on for tooling */
  allowSoftware?: boolean;
  /** keep the drawing buffer so it can be read back (tooling) */
  preserve?: boolean;
}

const COMPLETION_STATUS_KHR = 0x91b1;

export class Renderer {
  readonly gl: WebGLRenderingContext;
  private quad: WebGLBuffer | null = null;
  private tex: WebGLTexture | null = null;
  private vs: WebGLShader | null = null;
  private progs = new Map<string, Prog>();
  private parallel: boolean;
  private texW = 0;
  private texH = 0;

  static create(canvas: HTMLCanvasElement, o: RendererOptions = {}): Renderer | null {
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl', {
        alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: !!o.preserve, powerPreference: 'default',
        failIfMajorPerformanceCaveat: !o.allowSoftware
      });
    } catch { gl = null; }
    return gl ? new Renderer(gl) : null;
  }

  private constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.parallel = !!gl.getExtension('KHR_parallel_shader_compile');
    this.init();
  }

  /** (Re)creates GPU resources, e.g. after a context restore. */
  init(): void {
    const gl = this.gl;
    this.progs.clear();
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    this.texW = this.texH = 1;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    this.vs = gl.createShader(gl.VERTEX_SHADER);
    if (this.vs) { gl.shaderSource(this.vs, VERT); gl.compileShader(this.vs); }
  }

  get lost(): boolean { return this.gl.isContextLost(); }

  has(version: Version, level: Level): boolean { return this.progs.has(version + level); }

  /** Leaves the canvas transparent (used when switching to the Low tier). */
  clear(): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Starts compiling a program if needed and reports its state. Never blocks with the parallel extension. */
  request(version: Version, level: Level): ProgState {
    const key = version + level;
    const have = this.progs.get(key);
    if (have) return this.poll(have);
    const gl = this.gl;
    const fs = gl.createShader(gl.FRAGMENT_SHADER), p = gl.createProgram();
    if (!fs || !this.vs) return 'failed';
    gl.shaderSource(fs, fragSource(VARIANTS[version], level));
    gl.compileShader(fs);
    gl.attachShader(p, this.vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'a');
    gl.linkProgram(p);
    const prog: Prog = { p, fs, state: 'pending', u: {} };
    this.progs.set(key, prog);
    return this.poll(prog);
  }

  private poll(prog: Prog): ProgState {
    if (prog.state !== 'pending') return prog.state;
    const gl = this.gl;
    if (this.parallel && !gl.getProgramParameter(prog.p, COMPLETION_STATUS_KHR)) return 'pending';
    if (!gl.getProgramParameter(prog.p, gl.LINK_STATUS)) {
      if (!gl.isContextLost()) console.error('[kaykav-guide] shader failed:', gl.getShaderInfoLog(prog.fs) || gl.getProgramInfoLog(prog.p));
      prog.state = 'failed';
      return prog.state;
    }
    const n = gl.getProgramParameter(prog.p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog.p, i);
      if (!info) continue;
      const nm = info.name.replace(/\[0\]$/, '');
      prog.u[nm] = gl.getUniformLocation(prog.p, nm);
    }
    prog.state = 'ready';
    return prog.state;
  }

  /** Uploads the face canvas (only call when it changed). */
  uploadFace(src: HTMLCanvasElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (src.width === this.texW && src.height === this.texH) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); this.texW = src.width; this.texH = src.height; }
  }

  /** Draws one frame; returns false if the program is not ready yet. */
  draw(version: Version, level: Level, w: World, cam: Camera, bw: number, bh: number): boolean {
    const prog = this.progs.get(version + level);
    if (!prog || this.poll(prog) !== 'ready') return false;
    const gl = this.gl, u = prog.u, v = VARIANTS[version];
    const U = (n: string): WebGLUniformLocation | null => u[n] ?? null;
    gl.viewport(0, 0, bw, bh);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(U('uFace'), 0);
    gl.uniform2f(U('uRes'), bw, bh);
    gl.uniform3fv(U('uCamPos'), cam.pos); gl.uniform3fv(U('uCamX'), cam.X); gl.uniform3fv(U('uCamY'), cam.Y);
    gl.uniform3fv(U('uCamZ'), cam.Z); gl.uniform1f(U('uFocal'), cam.focal);
    gl.uniformMatrix3fv(U('uBodyInv'), false, toGL(transpose(w.Rb)));
    gl.uniform3fv(U('uBodyPos'), w.bodyPos); gl.uniform3fv(U('uSquash'), w.squash);
    gl.uniformMatrix3fv(U('uHeadInv'), false, toGL(transpose(w.Rh)));
    gl.uniform3fv(U('uHeadPivot'), v.pivot);
    gl.uniformMatrix3fv(U('uAntInvL'), false, toGL(transpose(w.antRot[0])));
    gl.uniformMatrix3fv(U('uAntInvR'), false, toGL(transpose(w.antRot[1])));
    const [aL, aR, a2] = w.arm;
    gl.uniform4f(U('uArm'), Math.cos(-aL), Math.sin(-aL), Math.cos(-aR), Math.sin(-aR));
    gl.uniform4f(U('uArm2'), Math.cos(-a2), Math.sin(-a2), 0, 0);
    gl.uniform1f(U('uGlow'), w.glow);
    const bc = add(apply(w.Rb, mulv(v.bound.c, w.squash)), w.bodyPos);
    gl.uniform3fv(U('uBoundC'), bc);
    gl.uniform1f(U('uBoundR'), v.bound.r * Math.max(...w.squash) + 0.15);
    gl.uniform1f(U('uGroundY'), v.ground);
    const h = halos(v, w);
    gl.uniform3fv(U('uHaloP'), h.p); gl.uniform4fv(U('uHaloC'), h.c);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  /** Alpha (0..255) of the last drawn frame at buffer pixel (x, y from the top). */
  readAlpha(x: number, y: number, bh: number): number {
    const px = new Uint8Array(4);
    this.gl.readPixels(Math.floor(x), Math.floor(bh - 1 - y), 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, px);
    return px[3] ?? 0;
  }

  destroy(): void {
    const gl = this.gl;
    for (const p of this.progs.values()) { gl.deleteProgram(p.p); gl.deleteShader(p.fs); }
    this.progs.clear();
    if (this.vs) gl.deleteShader(this.vs);
    if (this.quad) gl.deleteBuffer(this.quad);
    if (this.tex) gl.deleteTexture(this.tex);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
