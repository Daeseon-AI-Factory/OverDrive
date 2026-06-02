// SkSL runtime shader — T3/T4 "OVERDRIVE burst" (PR / session / level-up).
// Expanding shockwave ring + radial speed-lines + hot core + chromatic shimmer. Bigger sibling of
// energyPop; uIntensity dials T3→T4. Original effect — authored, not ported from any IP.
//
// PREMULTIPLIED alpha out. Heavy-ish per-pixel math — on low-end Android, degrade by reducing the
// speed-line frequency / dropping the streak term at 'mid' intensity (do this on-device, §6.4).

export const OVERDRIVE_BURST_SKSL = `
uniform float  uTime;
uniform float  uProgress;    // 0..1
uniform float  uIntensity;   // 0..1
uniform float2 uResolution;
uniform float3 uColor;

half4 main(float2 fragCoord) {
  float2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;
  float d = length(uv);
  float ang = atan(uv.y, uv.x);

  // expanding shockwave
  float r = mix(0.0, 1.2, uProgress);
  float ring = smoothstep(0.10, 0.0, abs(d - r)) * (1.0 - uProgress);

  // radial speed-lines, fading outward and over time
  float streak = pow(0.5 + 0.5 * sin(ang * 40.0), 8.0);
  streak *= smoothstep(r + 0.2, 0.0, d) * (1.0 - uProgress) * 0.6;

  // hot core
  float core = exp(-d * 5.0) * (1.0 - uProgress * 0.7);

  float a = clamp((ring * 1.5 + streak + core) * uIntensity, 0.0, 1.0);

  // chromatic shimmer on the color
  float3 col = uColor + float3(0.2 * sin(uTime * 10.0), 0.0, 0.2 * cos(uTime * 9.0));
  col = clamp(col, 0.0, 1.0);
  return half4(col * a, a);
}
`;
