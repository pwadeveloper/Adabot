// Raymarched frosted resin. Light enters the milky surface, is scattered, and picks up
// colour from glowing regions inside the body before it reaches the eye.
//
// One program per (version, level). Level 1 = Medium (prototype quality),
// level 2 = High (edge supersampling + a finer, longer interior march).

import { antennaLocal, type Variant } from './variants';

export type Level = 1 | 2;

const f1 = (n: number): string => (+n).toFixed(4);
const fv = (a: readonly number[]): string => `vec${a.length}(${a.map(f1).join(',')})`;

export const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';

export function fragSource(v: Variant, level: Level): string {
  const A = v.A, L = antennaLocal(v);
  return `precision highp float;
#define LEVEL ${level}
#if LEVEL >= 2
#define INTERIOR_N 16
#define INTERIOR_DT 0.062
#define SS 1
#else
#define INTERIOR_N 10
#define INTERIOR_DT 0.095
#define SS 0
#endif
uniform vec2 uRes;
uniform vec3 uCamPos, uCamX, uCamY, uCamZ; uniform float uFocal;
uniform mat3 uBodyInv; uniform vec3 uBodyPos; uniform vec3 uSquash;
uniform mat3 uHeadInv; uniform vec3 uHeadPivot;
uniform mat3 uAntInvL, uAntInvR;
uniform vec4 uArm, uArm2;
uniform sampler2D uFace;
uniform float uGlow;
uniform vec3 uBoundC; uniform float uBoundR; uniform float uGroundY;
uniform vec3 uHaloP[3]; uniform vec4 uHaloC[3];

const vec3 P0 = ${fv(v.P0)};
const vec3 HS = ${fv(v.HS)}; const float HN = ${f1(v.HN)}; const float HE = ${f1(v.HE)}; const float SHEAR = ${f1(v.SHEAR)}; const float SSHEAR = ${f1(v.SSHEAR ?? v.SHEAR)}; const float TAPER = ${f1(v.TAPER)};
const vec2 SH = ${fv(v.SH)}; const float SN = ${f1(v.SN)}; const vec2 SO = ${fv(v.SO)}; const float FACE_SPAN = ${f1(v.span)};
const vec3 ABL = ${fv(A.bl)}, AML = ${fv(L.ml)}, ATL = ${fv(L.tl)};
const vec3 ABR = ${fv(A.br)}, AMR = ${fv(L.mr)}, ATR = ${fv(L.tr)};
const vec3 AR = ${fv(A.r)};
const float ANT_TOP = ${f1(v.HS[1] - A.bl[1])};
const float TIP_Y = ${f1(L.tl[1])};
const float WARM = ${f1(v.warm)};

float smin(float a, float b, float k){ float h = max(k-abs(a-b),0.0)/k; return min(a,b) - h*h*k*0.25; }
float smax(float a, float b, float k){ return -smin(-a,-b,k); }
float extrude(float d2, float z, float hz, float e){ vec2 w = vec2(d2+e, abs(z)-hz+e); return min(max(w.x,w.y),0.0)+length(max(w,0.0))-e; }
float sdEll(vec3 p, vec3 r){ float k0 = length(p/r); float k1 = length(p/(r*r)); return k0*(k0-1.0)/k1; }
float sdRC(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba = b-a; float l2 = dot(ba,ba); float rr = r1-r2; float a2 = l2-rr*rr; float il2 = 1.0/l2;
  vec3 pa = p-a; float y = dot(pa,ba); float z = y-l2;
  vec3 xv = pa*l2-ba*y; float x2 = dot(xv,xv); float y2 = y*y*l2; float z2 = z*z*l2;
  float k = sign(rr)*rr*rr*x2;
  if(sign(z)*a2*z2 > k) return sqrt(x2+z2)*il2-r2;
  if(sign(y)*a2*y2 < k) return sqrt(x2+y2)*il2-r1;
  return (sqrt(x2*a2*il2)+y*rr)*il2-r1;
}
float sdSE(vec2 p, vec2 b, float n){ vec2 q = max(abs(p)/b, 1e-4); return (pow(pow(q.x,n)+pow(q.y,n), 1.0/n)-1.0)*min(b.x,b.y); }
vec4 blob(vec3 p, vec3 c, float r, vec3 col, float i){ vec3 d = p-c; float w = i*exp(-dot(d,d)/(r*r)); return vec4(col*w, w); }

vec2 headUnit(vec3 p0){
  vec3 p = p0; p.y -= SHEAR*p.x;
  vec2 hb = vec2(HS.x*(1.0+TAPER*p.y/HS.y), HS.y);
  float h = extrude(sdSE(p.xy, hb, HN), p.z, HS.z, HE);
  ${v.extra}
  vec3 ps = p0; ps.y -= SSHEAR*ps.x;
  vec3 q = ps - vec3(SO, HS.z);
  float cut = max(sdSE(q.xy, SH, SN), abs(q.z)-0.26);
  h = smax(h, -cut, 0.12);
  vec3 s = ps - vec3(SO, HS.z-0.27);
  float sd = extrude(sdSE(s.xy, SH-0.004, SN), s.z, 0.1, 0.075);
  sd -= 0.05*clamp(1.0-dot(s.xy/SH, s.xy/SH), 0.0, 1.0);
  return vec2(h, sd);
}
float antSeg(vec3 q, vec3 m, vec3 t){ return WARM > 0.5 ? smin(sdRC(q,vec3(0.0),m,AR.x,AR.y), sdRC(q,m,t,AR.y,AR.z), 0.06) : sdRC(q,vec3(0.0),t,AR.x,AR.z); }
float antInfo(vec3 ph, out float y){
  vec3 ql = uAntInvL*(ph-ABL), qr = uAntInvR*(ph-ABR);
  float dl = antSeg(ql, AML, ATL), dr = antSeg(qr, AMR, ATR);
  y = dl<dr ? ql.y : qr.y; return min(dl,dr);
}
float bodyV(vec3 pb){ ${v.body} }

vec3 toBody(vec3 p, out float sc){ vec3 pb = uBodyInv*(p-uBodyPos); sc = min(uSquash.x, min(uSquash.y, uSquash.z)); return pb/uSquash; }
vec3 toHead(vec3 pb){ return uHeadInv*(pb-uHeadPivot) + P0; }

vec2 mapV(vec3 pb, vec3 ph){
  vec2 hu = headUnit(ph);
  float y; float f = smin(hu.x, antInfo(ph, y), 0.07);
  f = smin(f, bodyV(pb), 0.05);
  return vec2(f, hu.y);
}
vec2 map(vec3 p){ float sc; vec3 pb = toBody(p, sc); vec2 d = mapV(pb, toHead(pb))*sc; return d.x < d.y ? vec2(d.x, 0.0) : vec2(d.y, 1.0); }
float mapF(vec3 p){ float sc; vec3 pb = toBody(p, sc); return mapV(pb, toHead(pb)).x*sc; }

vec4 glowV(vec3 pb, vec3 ph){
  vec4 g = vec4(0.0);
  g += blob(ph, ABL+vec3(0.0,ANT_TOP*0.6,0.0), 0.26, vec3(0.62,0.97,0.9), (1.0-WARM)*uGlow);
  g += blob(ph, ABR+vec3(0.0,ANT_TOP*0.6,0.0), 0.26, vec3(0.62,0.97,0.9), (1.0-WARM)*uGlow);
  ${v.glow}
  return g;
}

vec3 calcN(vec3 p){ vec2 e = vec2(1.0,-1.0)*0.0016; return normalize(e.xyy*map(p+e.xyy).x + e.yyx*map(p+e.yyx).x + e.yxy*map(p+e.yxy).x + e.xxx*map(p+e.xxx).x); }
float calcAO(vec3 p, vec3 n){ float o = 0.0, s = 1.0; for(int i=0;i<4;i++){ float h = 0.02+0.08*float(i); o += (h-map(p+n*h).x)*s; s *= 0.72; } return clamp(1.0-1.7*o, 0.0, 1.0); }

const vec3 LIGHT = vec3(-0.4,0.82,0.42);
const vec3 THIN = vec3(0.89,0.92,0.95);
const vec3 THICK = vec3(0.66,0.72,0.84);

vec3 shadeFrost(vec3 p, vec3 n, vec3 rd, vec3 ph){
  vec3 dir = refract(rd, n, 0.75); if(dot(dir,dir) < 0.5) dir = rd;
  vec3 acc = vec3(0.0); float ws = 0.0, th = 0.0; vec3 q = p - n*0.02;
  for(int i=0;i<INTERIOR_N;i++){
    q += dir*INTERIOR_DT; float sc; vec3 b = toBody(q, sc); vec3 h = toHead(b);
    if(mapV(b,h).x*sc < 0.0){ th += INTERIOR_DT; vec4 g = glowV(b,h); acc += g.rgb*INTERIOR_DT; ws += g.a*INTERIOR_DT; }
  }
  vec3 L = normalize(LIGHT); float wrap = clamp((dot(n,L)+0.8)/1.8, 0.0, 1.0);
  float nv = clamp(dot(n,-rd), 0.0, 1.0);
  vec3 col = mix(THIN, THICK, (1.0-exp(-th*2.0))*mix(1.0, 0.6, nv*nv));
  col *= 0.93 + 0.09*wrap + 0.04*n.y;
  // bounce light from the pale studio floor keeps undersides milky
  col = mix(col, vec3(0.86,0.9,0.95), clamp(-n.y, 0.0, 1.0)*0.22);
  vec3 ic = acc/max(ws, 1e-4); float is = 1.0-exp(-ws*2.2);
  col = mix(col, ic, is*0.9);
  float ay; float ad = antInfo(ph, ay); float onAnt = 0.0;
  if(ad < 0.03){
    onAnt = 1.0;
    float g = (1.0-smoothstep(ANT_TOP*0.6, ANT_TOP+0.3, ay))*uGlow*(1.0-WARM);
    float mid = smoothstep(ANT_TOP, ANT_TOP+0.25, ay)*(1.0-smoothstep(ANT_TOP+0.25, TIP_Y-0.05, ay));
    col = mix(col, vec3(0.78,0.9,0.98), mid*0.45);
    col = mix(col, vec3(0.88,1.0,0.98), g*0.9);
    float tip = smoothstep(ANT_TOP*0.5, TIP_Y-0.04, ay)*WARM;
    col = mix(col, mix(vec3(0.97,0.89,0.84), vec3(0.99,0.95,0.88), smoothstep(TIP_Y-0.15, TIP_Y, ay)), tip*0.85);
  }
  float fr = pow(1.0-nv, 3.0);
  col = mix(col, vec3(0.87,0.9,0.95), fr*0.55);
  float ao = calcAO(p, n);
  col *= mix(vec3(0.7,0.76,0.93), vec3(1.0), 0.35+0.65*ao);
  // broad, dim sheen; on the narrow antennas a tight lobe reads as a hard dot, so widen it there
  vec3 H = normalize(L-rd); col += pow(max(dot(n,H),0.0), mix(20.0, 5.0, onAnt))*mix(0.06, 0.035, onAnt);
  return col;
}

vec3 shadeScreen(vec3 p, vec3 n, vec3 rd, vec3 ph){
  vec2 sp = (ph.xy-SO)/SH;
  // sampled: centre #2b3d69, top-right reflection #3a578f, bottom-left #283f73, and a faint pillowy edge
  vec3 col = vec3(0.169,0.239,0.412);
  col = mix(col, vec3(0.227,0.341,0.561), smoothstep(-0.1, 1.1, sp.x*0.55+sp.y*0.65)*0.85);
  col = mix(col, vec3(0.157,0.247,0.451), smoothstep(0.1, 1.2, -sp.x*0.5-sp.y*0.3)*0.8);
  col *= mix(1.0, 0.92, smoothstep(0.6, 1.05, length(sp)));
  vec3 R = reflect(rd, n);
  float box = smoothstep(0.75, 0.98, dot(R, normalize(vec3(0.5,0.7,0.5))));
  float fr = pow(1.0-clamp(dot(n,-rd),0.0,1.0), 4.0);
  col += vec3(0.22,0.3,0.45)*(box*0.3 + fr*0.3);
  col *= mix(0.82, 1.0, calcAO(p, n));
  vec2 q = ph.xy - SO; q.y -= SSHEAR*ph.x; float span = 2.0*SH.x*FACE_SPAN;
  vec2 uv = vec2(q.x/span+0.5, q.y/(span/1.6)+0.5);
  if(uv.x>0.0 && uv.x<1.0 && uv.y>0.0 && uv.y<1.0){ vec4 f = texture2D(uFace, uv); col = mix(col, f.rgb, f.a); }
  return col;
}

vec3 rayDir(vec2 fc){ vec2 uv = (fc-0.5*uRes)/uRes.y; return normalize(uCamX*uv.x + uCamY*uv.y + uCamZ*uFocal); }

// Premultiplied colour of the character along one ray; edge = 1 when the pixel sits on
// a silhouette, a grazing surface or the screen seam (where High supersamples).
vec4 traceChar(vec3 ro, vec3 rd, out float edge){
  edge = 0.0;
  vec3 oc = ro-uBoundC; float b = dot(oc,rd); float c = dot(oc,oc)-uBoundR*uBoundR; float h = b*b-c;
  if(h <= 0.0) return vec4(0.0);
  float pxA = 1.0/(uRes.y*uFocal);
  bool hit = false; float minA = 1e9; vec2 res;
  float sh = sqrt(h); float t = max(-b-sh, 0.0); float tf = -b+sh;
  for(int i=0;i<96;i++){ res = map(ro+rd*t); if(res.x < 0.0012*t){ hit = true; break; } minA = min(minA, res.x/max(t,0.1)); t += res.x*0.88; if(t > tf) break; }
  if(hit){
    vec3 p = ro+rd*t; vec3 n = calcN(p);
    float sc; vec3 pb = toBody(p, sc); vec3 ph = toHead(pb);
    vec2 dd = mapV(pb, ph);
    float nv = clamp(dot(n,-rd), 0.0, 1.0);
    float bw = t*pxA*1.6/max(nv, 0.35);
    float w = clamp(0.5 + (dd.x-dd.y)/(2.0*bw), 0.0, 1.0);
    if((w > 0.0 && w < 1.0) || nv < 0.3) edge = 1.0;
    vec3 s;
    if(w > 0.98) s = shadeScreen(p, n, rd, ph);
    else if(w < 0.02) s = shadeFrost(p, n, rd, ph);
    else s = mix(shadeFrost(p, n, rd, ph), shadeScreen(p, n, rd, ph), w);
    return vec4(s, 1.0);
  }
  if(minA < pxA*3.0) edge = 1.0;
  float cov = (1.0-smoothstep(0.0, pxA*1.6, minA))*0.85;
  return vec4(THIN*0.97*cov, cov);
}

float groundShadow(vec3 g){
  vec3 L = normalize(vec3(0.12,1.0,0.22)); float res = 1.0, t = 0.05;
  for(int i=0;i<22;i++){ float h = mapF(g+L*t); res = min(res, 3.2*h/t); t += clamp(h, 0.06, 0.5); if(res < 0.002 || t > 6.0) break; }
  return clamp(res, 0.0, 1.0);
}

void main(){
  vec3 ro = uCamPos; vec3 rd = rayDir(gl_FragCoord.xy);
  float edge; vec4 outc = traceChar(ro, rd, edge);
#if SS
  if(edge > 0.5){
    vec2 o = vec2(0.125, 0.375); float e2;
    for(int s=0;s<4;s++){ outc += traceChar(ro, rayDir(gl_FragCoord.xy + o), e2); o = vec2(-o.y, o.x); }
    outc *= 0.2;
  }
#endif
  if(outc.a < 0.999 && rd.y < 0.0){
    float tg = (uGroundY-ro.y)/rd.y; vec3 g = ro+rd*tg;
    vec2 dxz = g.xz-uBoundC.xz;
    if(dot(dxz,dxz) < 9.0){
      float sh = groundShadow(g);
      float a = pow(1.0-sh, 1.4)*0.16*smoothstep(3.0, 1.2, length(dxz))*(1.0-outc.a);
      outc += vec4(vec3(0.5,0.55,0.72)*a, a);
    }
  }
  vec3 halo = vec3(0.0);
  for(int i=0;i<3;i++){ vec3 cp = uHaloP[i]; float tt = max(dot(cp-ro, rd), 0.0); vec3 d = ro+rd*tt-cp; halo += uHaloC[i].rgb*uHaloC[i].a*exp(-dot(d,d)/0.045); }
  outc.rgb += halo; outc.a = clamp(outc.a + max(halo.r, max(halo.g, halo.b))*0.6, 0.0, 1.0);
  gl_FragColor = outc;
}`;
}
