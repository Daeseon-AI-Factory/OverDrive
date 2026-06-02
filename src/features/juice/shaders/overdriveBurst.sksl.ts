// SkSL runtime shader — T3/T4 "OVERDRIVE burst". PROCEDURAL (no art assets): expanding shockwave
// + ~48 radial particle sparks flying out + fbm-ish turbulence + hot core + chromatic shimmer.
// Everything is GPU math (§6.4 — the "professional graphics" IS the shader). PREMULTIPLIED alpha.

export const OVERDRIVE_BURST_SKSL = `
uniform float  uTime;
uniform float  uProgress;    // 0..1
uniform float  uIntensity;   // 0..1
uniform float2 uResolution;
uniform float3 uColor;

float hash21(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

half4 main(float2 fragCoord) {
  float2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;
  float d = length(uv);
  float t = uProgress;

  // expanding shockwave ring
  float r = mix(0.0, 1.35, t);
  float ring = smoothstep(0.13, 0.0, abs(d - r)) * (1.0 - t);

  // procedural particle sparks flying outward (organic via per-particle hash)
  float parts = 0.0;
  for (int i = 0; i < 48; i++) {
    float fi = float(i);
    float a = (fi / 48.0) * 6.28318 + (hash21(float2(fi, 1.0)) - 0.5) * 0.7;
    float speed = 0.55 + hash21(float2(fi, 2.0)) * 1.0;
    float pr = t * speed * 1.5;
    float2 pp = float2(cos(a), sin(a)) * pr;
    float pd = length(uv - pp);
    float size = mix(0.045, 0.012, t); // sparks shrink as they fly
    parts += smoothstep(size, 0.0, pd) * (1.0 - t);
  }
  parts = clamp(parts, 0.0, 1.2);

  // turbulent energy haze near the core
  float haze = hash21(uv * 8.0 + uTime) * exp(-d * 3.5) * (1.0 - t) * 0.5;

  // hot core
  float core = exp(-d * 5.5) * (1.0 - t * 0.6);

  float a = clamp((ring * 1.5 + parts * 1.3 + core + haze) * uIntensity, 0.0, 1.0);

  // chromatic shimmer
  float3 col = uColor + float3(0.28 * sin(uTime * 12.0), 0.06, 0.28 * cos(uTime * 11.0));
  col = clamp(col, 0.0, 1.0);
  return half4(col * a, a);
}
`;
