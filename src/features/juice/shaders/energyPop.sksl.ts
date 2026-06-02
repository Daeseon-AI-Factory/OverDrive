// SkSL runtime shader — T1/T2 "energy pop" (the most-fired effect; baseline dopamine).
// Radial core glow + an expanding ring, neon-tinted. Parameterized by uIntensity/uProgress so the
// SAME shader covers T1 (low intensity) and T2 (higher). Original effect — no ported/borrowed IP.
//
// Coordinates are local pixels (Skia passes fragCoord). Output is PREMULTIPLIED alpha (col*a, a).
// Iterate the constants on-device (spec §6.4): k of exp(), ring width, shimmer speed.

export const ENERGY_POP_SKSL = `
uniform float  uTime;        // seconds, for subtle shimmer
uniform float  uProgress;    // 0..1 burst lifetime
uniform float  uIntensity;   // 0..1 strength (tier/effort)
uniform float2 uResolution;  // canvas px
uniform float3 uColor;       // tier color, rgb 0..1

half4 main(float2 fragCoord) {
  float2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y; // centered, aspect-correct
  float d = length(uv);

  float radius = mix(0.0, 0.9, uProgress);
  float ring = smoothstep(0.06, 0.0, abs(d - radius)) * (1.0 - uProgress);
  float glow = uIntensity * exp(-d * 6.0) * (1.0 - uProgress);

  float a = clamp(glow + ring * uIntensity * 1.5, 0.0, 1.0);
  float3 col = uColor * (0.7 + 0.3 * sin(uTime * 8.0));
  return half4(col * a, a);
}
`;
