// SkSL runtime shader — T1/T2 "energy pop" (most-fired). Core glow + expanding ring + ~18 light
// sparks. Lighter sibling of overdriveBurst (anti-fatigue), still procedural (no assets).
// PREMULTIPLIED alpha. uIntensity/uProgress parameterize T1 vs T2.

export const ENERGY_POP_SKSL = `
uniform float  uTime;
uniform float  uProgress;
uniform float  uIntensity;
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

  float r = mix(0.0, 0.95, t);
  float ring = smoothstep(0.07, 0.0, abs(d - r)) * (1.0 - t);

  float parts = 0.0;
  for (int i = 0; i < 18; i++) {
    float fi = float(i);
    float a = (fi / 18.0) * 6.28318 + (hash21(float2(fi, 3.0)) - 0.5) * 0.6;
    float speed = 0.4 + hash21(float2(fi, 4.0)) * 0.7;
    float2 pp = float2(cos(a), sin(a)) * (t * speed);
    parts += smoothstep(0.03, 0.0, length(uv - pp)) * (1.0 - t);
  }
  parts = clamp(parts, 0.0, 1.0);

  float glow = uIntensity * exp(-d * 6.0) * (1.0 - t);
  float a = clamp(glow + ring * uIntensity * 1.4 + parts * 0.8 * uIntensity, 0.0, 1.0);
  float3 col = uColor * (0.75 + 0.25 * sin(uTime * 9.0));
  return half4(col * a, a);
}
`;
