// SkSL runtime shader — T3/T4 "OVERDRIVE burst". The hero explosion (spec §6.4 — the
// "professional graphics" IS the shader, pushed to the limit). 100% procedural GPU math, no assets:
//   · 3 staggered shockwave rings (layered blast front)
//   · 56 particle sparks, each with a radial motion-blur streak + per-spark flicker
//   · fbm energy tendrils swirling out of the core (3-octave value noise in polar space)
//   · two-stage bloom (broad core + tight white-hot center) → blackbody-ish white→color falloff
//   · in-shader chromatic shimmer on the rings
// PREMULTIPLIED alpha (returns col*alpha, alpha). Same uniform set as energyPop (SkiaBurst feeds it).

export const OVERDRIVE_BURST_SKSL = `
uniform float  uTime;        // 0..~6 (progress*6), drives flicker/turbulence
uniform float  uProgress;    // 0..1 burst lifetime
uniform float  uIntensity;   // 0..1
uniform float2 uResolution;
uniform float3 uColor;

float hash21(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + float2(1.0, 0.0));
  float c = hash21(i + float2(0.0, 1.0));
  float dd = hash21(i + float2(1.0, 1.0));
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, dd, u.x), u.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    v += amp * vnoise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return v;
}

half4 main(float2 fragCoord) {
  float2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;
  float dist = length(uv);
  float ang = atan(uv.y, uv.x);
  float t = uProgress;
  float fade = 1.0 - t;
  float decay = fade * fade; // punchy fast-decay envelope: slam at t=0, then collapse (not a soft linear whoosh)

  // multi-ring shockwave — 3 staggered blast fronts, each thinning as it expands
  float ring = 0.0;
  for (int k = 0; k < 3; k++) {
    float kk = float(k);
    float rt = clamp(t * 1.25 - kk * 0.12, 0.0, 1.0);
    float rr = mix(0.0, 1.5, rt);
    float w = mix(0.16, 0.015, rt);
    ring += smoothstep(w, 0.0, abs(dist - rr)) * (1.0 - rt) * (1.0 - kk * 0.22);
  }

  // organic energy tendrils — fbm in polar space, swirling outward from the core
  float n = fbm(float2(ang * 2.5, dist * 4.0 - uTime * 1.5));
  float tendrils = smoothstep(0.5, 1.0, n) * exp(-dist * 2.2) * fade * 0.9;

  // 40 particle sparks: bright head + one-sided radial motion-blur trail + flicker.
  // One sqrt (from r2) feeds both head and perp — ~40% cheaper than two length() calls.
  float parts = 0.0;
  for (int i = 0; i < 40; i++) {
    float fi = float(i);
    float pa = (fi / 40.0) * 6.28318 + (hash21(float2(fi, 1.0)) - 0.5) * 0.8;
    float speed = 0.5 + hash21(float2(fi, 2.0)) * 1.3;
    float2 dir = float2(cos(pa), sin(pa));
    float2 pp = dir * (t * speed * 1.6);
    float2 rel = uv - pp;
    float along = dot(rel, dir);
    float r2 = dot(rel, rel);
    float perp = sqrt(max(r2 - along * along, 0.0));
    float head = smoothstep(mix(0.05, 0.012, t), 0.0, sqrt(r2));
    float trail = smoothstep(0.12, 0.0, abs(along)) * smoothstep(0.014, 0.0, perp) * step(along, 0.0);
    float flick = 0.7 + 0.3 * sin(uTime * 28.0 + fi);
    parts += (head + trail * 0.55) * decay * flick;
  }
  parts = clamp(parts, 0.0, 2.0);

  // two-stage bloom: broad core + tight white-hot center. Steeper core falloff + decay envelope
  // keep a bright center / dark edge (the contrast that reads as a violent explosion, not a wash).
  float core = exp(-dist * 5.5) * decay;
  float hot = exp(-dist * 11.0) * decay;

  float energy = (ring * 1.3 + parts * 1.0 + tendrils * 0.8 + core * 0.7) * uIntensity;
  float alpha = clamp(energy + hot * uIntensity, 0.0, 1.0);

  // color ramp: white-hot center → tier color → brighter energy edge, + ring chromatic shimmer
  float3 edge = clamp(uColor * 1.5 + float3(0.10, 0.05, 0.18), 0.0, 1.0);
  float3 col = mix(uColor, edge, clamp(dist, 0.0, 1.0));
  col = mix(col, float3(1.0, 1.0, 1.0), clamp(hot * 1.3, 0.0, 1.0));
  col += ring * 0.25 * float3(0.4 * sin(uTime * 10.0), 0.0, 0.4 * cos(uTime * 9.0));
  col = clamp(col, 0.0, 1.0);

  return half4(col * alpha, alpha);
}
`;
