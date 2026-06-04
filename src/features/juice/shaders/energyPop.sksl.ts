// SkSL runtime shader — T1/T2 "energy pop" (most-fired, so kept cheap: no fbm, no trails).
// Crisp expanding ring + 24 flickering sparks + two-stage bloom (broad core + white-hot center).
// Lighter sibling of overdriveBurst (anti-fatigue), still 100% procedural. PREMULTIPLIED alpha.
// Same uniform set as overdriveBurst; uIntensity/uProgress parameterize T1 vs T2.

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
  float dist = length(uv);
  float t = uProgress;
  float fade = 1.0 - t;

  // expanding ring (thins as it grows)
  float rr = mix(0.0, 1.0, t);
  float ring = smoothstep(mix(0.09, 0.02, t), 0.0, abs(dist - rr)) * fade;

  // 24 light sparks with subtle flicker
  float parts = 0.0;
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float pa = (fi / 24.0) * 6.28318 + (hash21(float2(fi, 3.0)) - 0.5) * 0.6;
    float speed = 0.45 + hash21(float2(fi, 4.0)) * 0.8;
    float2 pp = float2(cos(pa), sin(pa)) * (t * speed);
    float flick = 0.75 + 0.25 * sin(uTime * 22.0 + fi);
    parts += smoothstep(0.028, 0.0, length(uv - pp)) * fade * flick;
  }
  parts = clamp(parts, 0.0, 1.2);

  // two-stage bloom
  float core = exp(-dist * 5.5) * fade;
  float hot = exp(-dist * 12.0) * fade;

  float alpha = clamp((core * 0.7 + ring * 1.3 + parts * 0.8) * uIntensity + hot * uIntensity * 0.6, 0.0, 1.0);
  float3 col = mix(uColor, float3(1.0, 1.0, 1.0), clamp(hot * 1.1, 0.0, 1.0));
  col *= 0.85 + 0.15 * sin(uTime * 9.0);
  col = clamp(col, 0.0, 1.0);

  return half4(col * alpha, alpha);
}
`;
