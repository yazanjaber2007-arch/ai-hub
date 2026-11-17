/* GLSL for the hologram core. Everything is additive light on black; the final pass turns it into premultiplied alpha, and the page composites it with
   plain source-over (black is transparent, no blend mode needed). Colours are authored in display space.
   GLSL: pow(x, y) is undefined for x < 0 (NaN on real GPUs), and 1.0 - dot(a, b) can round to -1e-7, so every pow base is clamped. */

export const NOISE = /* glsl */ `
float hash31(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

/* expanding wavefronts on the shell: uWave[i] = (direction.xyz, start time) */
export const WAVES = /* glsl */ `
#define NW 6
uniform vec4 uWave[NW];
float waveAt(vec3 dir, float t){
  float s = 0.0;
  for (int i = 0; i < NW; i++) {
    vec4 w = uWave[i]; float age = t - w.w;
    if (age > 0.0 && age < 2.4) {
      float d = acos(clamp(dot(dir, w.xyz), -1.0, 1.0));
      float k = (d - age * 1.75) * 7.0;
      s += exp(-k * k) * (1.0 - age / 2.4);
    }
  }
  return s;
}
`;

/* ---------------- energy core ---------------- */
export const CORE_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vP; varying vec3 vV;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vP = position; vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
export const CORE_FRAG = /* glsl */ `
uniform float uTime, uPulse, uAlert, uIntro; uniform vec3 uColA, uColB, uAlertA, uAlertB;
varying vec3 vN; varying vec3 vP; varying vec3 vV;
${NOISE}
void main(){
  float fres = pow(clamp(1.0 - dot(normalize(vN), normalize(vV)), 0.0, 1.0), 2.4);
  float n1 = fbm(vP * 3.4 + vec3(0.0, uTime * 0.38, uTime * 0.21));
  float n2 = fbm(vP * 7.0 - vec3(uTime * 0.55, 0.0, uTime * 0.3));
  float plasma = smoothstep(0.28, 0.9, n1 * 0.75 + n2 * 0.45);
  vec3 a = mix(uColA, uAlertA, uAlert), b = mix(uColB, uAlertB, uAlert);
  vec3 col = mix(a, b, clamp(plasma * 0.8 + fres * 0.45, 0.0, 1.0));
  float k = (0.3 + 0.95 * fres + 0.85 * plasma) * (1.0 + uPulse * 1.2) * uIntro;
  gl_FragColor = vec4(col * k, 1.0);
}`;

/* ---------------- camera-facing sprites (glow, ring bursts) ---------------- */
export const SPRITE_VERT = /* glsl */ `
uniform float uSize; varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * uSize;
  gl_Position = projectionMatrix * c;
}`;
export const SPRITE_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha, uMode, uProg; varying vec2 vUv;
void main(){
  float d = length(vUv - 0.5) * 2.0; float g;
  if (uMode < 0.5) { g = (exp(-d * d * 3.6) * 0.85 + exp(-d * d * 16.0) * 0.8) * (1.0 - smoothstep(0.55, 1.0, d)); }
  else { float k = (d - uProg) * 13.0; g = exp(-k * k) * (1.0 - uProg) * (1.0 - smoothstep(0.8, 1.0, d)); }
  gl_FragColor = vec4(uColor * g * uAlpha, 1.0);
}`;

/* ---------------- geodesic shell (lines) ---------------- */
export const SHELL_VERT = /* glsl */ `
uniform float uIntro; varying vec3 vDir; varying vec3 vWN; varying vec3 vWP;
void main(){
  vec3 p = position * (0.8 + 0.2 * uIntro);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWP = wp.xyz; vDir = normalize(position); vWN = normalize(mat3(modelMatrix) * vDir);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
export const SHELL_FRAG = /* glsl */ `
uniform float uTime, uIntro, uAlert, uScanY, uHover; uniform vec3 uColor, uAlertCol, uHoverDir;
varying vec3 vDir; varying vec3 vWN; varying vec3 vWP;
${WAVES}
void main(){
  vec3 v = normalize(cameraPosition - vWP);
  float facing = dot(normalize(vWN), v);
  float rim = pow(clamp(1.0 - abs(facing), 0.0, 1.0), 1.7);
  float base = mix(0.13, 0.5, smoothstep(-0.35, 0.9, facing)) + rim * 0.55;
  float sy = (vWP.y - uScanY) * 5.0; float scan = exp(-sy * sy);
  float w = waveAt(vDir, uTime);
  float hv = uHover * smoothstep(0.5, 1.0, dot(vDir, uHoverDir));
  float edge = uIntro * 2.8 - 1.4;
  float reveal = smoothstep(edge - 0.25, edge + 0.25, vDir.y);
  float a = (base + scan * 0.85 + w * 1.7 + hv * 0.55) * reveal * uIntro;
  vec3 col = mix(uColor, uAlertCol, uAlert * 0.9);
  col = mix(col, vec3(1.0), clamp(w * 0.45 + scan * 0.2, 0.0, 0.75));
  gl_FragColor = vec4(col * a, 1.0);
}`;

/* ---------------- shell vertices (soft points) ---------------- */
export const NODES_VERT = /* glsl */ `
attribute float aSeed; attribute float aSize; uniform float uScale, uIntro;
varying vec3 vDir; varying float vSeed; varying float vFacing;
void main(){
  vec3 p = position * (0.8 + 0.2 * uIntro);
  vec4 wp = modelMatrix * vec4(p, 1.0); vec4 mv = viewMatrix * wp;
  vDir = normalize(position); vSeed = aSeed;
  vFacing = dot(normalize(mat3(modelMatrix) * vDir), normalize(cameraPosition - wp.xyz));
  gl_PointSize = max(aSize * uScale / -mv.z, 1.6);
  gl_Position = projectionMatrix * mv;
}`;
export const NODES_FRAG = /* glsl */ `
uniform float uTime, uIntro, uAlert; uniform vec3 uColor, uAlertCol;
varying vec3 vDir; varying float vSeed; varying float vFacing;
${WAVES}
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
  float g = pow(clamp(1.0 - d, 0.0, 1.0), 2.0);
  float tw = 0.55 + 0.45 * sin(uTime * (1.1 + vSeed * 2.3) + vSeed * 40.0);
  float w = waveAt(vDir, uTime);
  float front = mix(0.3, 1.0, smoothstep(-0.2, 0.8, vFacing));
  float edge = uIntro * 2.8 - 1.4;
  float reveal = smoothstep(edge - 0.25, edge + 0.25, vDir.y);
  float a = g * (tw * front + w * 2.4) * uIntro * reveal;
  vec3 col = mix(uColor, uAlertCol, uAlert * 0.9);
  col = mix(col, vec3(1.0), clamp(w * 0.55, 0.0, 0.9));
  gl_FragColor = vec4(col * a, 1.0);
}`;

/* ---------------- atmosphere (fresnel rim around the shell) ---------------- */
export const ATMO_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;
export const ATMO_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uIntro, uAlpha;
varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(clamp(1.0 - dot(normalize(vN), normalize(vV)), 0.0, 1.0), 3.2); gl_FragColor = vec4(uColor * f * uAlpha * uIntro, 1.0); }`;

/* ---------------- soft round points (dust, pulses) ---------------- */
export const POINTS_VERT = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale;
varying float vA; varying vec3 vC;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aAlpha; vC = aColor;
  gl_PointSize = max(aSize * uScale / -mv.z, 1.0);
  gl_Position = projectionMatrix * mv;
}`;
export const POINTS_FRAG = /* glsl */ `
varying float vA; varying vec3 vC;
void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float g = pow(clamp(1.0 - d, 0.0, 1.0), 2.2); gl_FragColor = vec4(vC * g * max(vA, 0.0), 1.0); }`;

/* ---------------- holo table pieces ---------------- */
export const PLANE_VERT = /* glsl */ `varying vec2 vUv; varying vec3 vL; void main(){ vUv = uv; vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const SWEEP_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha, uSpan; varying vec2 vUv; varying vec3 vL;
void main(){
  float ang = atan(vL.y, vL.x);               // CircleGeometry lives in local XY; angle within the sector
  float k = clamp(ang / uSpan, 0.0, 1.0);
  float r = length(vL.xy);
  float fade = smoothstep(3.8, 0.5, r);
  gl_FragColor = vec4(uColor * pow(k, 2.4) * fade * uAlpha, 1.0);
}`;
export const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uAlpha, uIntro; varying vec2 vUv;
void main(){ float k = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6); float edge = 1.0; gl_FragColor = vec4(uColor * k * uAlpha * uIntro * edge, 1.0); }`;

/* ---------------- post-processing ---------------- */
export const FULLSCREEN_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
export const PREFILTER_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold, uKnee; varying vec2 vUv;
vec3 prefilter(vec3 c){
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 1e-4);
  return c * (max(soft, br - uThreshold) / max(br, 1e-4));
}
void main(){
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
         + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  gl_FragColor = vec4(prefilter(c * 0.25), 1.0);
}`;
export const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
void main(){
  vec3 s = texture2D(tSrc, vUv).rgb * 0.2270270270;
  s += (texture2D(tSrc, vUv + uDir * 1.3846153846).rgb + texture2D(tSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  s += (texture2D(tSrc, vUv + uDir * 3.2307692308).rgb + texture2D(tSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}`;
export const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D tScene, tBloomA, tBloomB;
uniform float uBloomA, uBloomB, uTime, uExposure, uAberration, uScan, uGrain; uniform vec2 uRes;
varying vec2 vUv;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 c = vUv - 0.5; float ab = uAberration * dot(c, c);
  vec3 col = vec3(texture2D(tScene, vUv + c * ab).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - c * ab).b);
  col += texture2D(tBloomA, vUv).rgb * uBloomA + texture2D(tBloomB, vUv).rgb * uBloomB;
  float sl = 0.5 + 0.5 * sin(vUv.y * uRes.y * 3.14159);
  col *= 1.0 - uScan * (1.0 - sl);
  col = 1.0 - exp(-col * uExposure);
  float lum = dot(col, vec3(0.333));
  col += (hash12(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5) * uGrain * min(1.0, lum * 6.0);
  // premultiplied alpha: light on black becomes real transparency, so the page needs no blend mode (those break inside isolated / backdrop-filter panels)
  vec3 rgb = clamp(col, 0.0, 1.0); gl_FragColor = vec4(rgb, max(rgb.r, max(rgb.g, rgb.b)));
}`;

/* ---------------- bot nodes ---------------- */
export const NODE_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uBright; varying vec3 vN; varying vec3 vV;
void main(){
  float f = pow(clamp(1.0 - dot(normalize(vN), normalize(vV)), 0.0, 1.0), 1.5);
  vec3 col = mix(vec3(1.0), uColor, clamp(f * 1.15, 0.0, 1.0));
  gl_FragColor = vec4(col * (0.85 + 0.9 * f) * uBright, 1.0);
}`;
