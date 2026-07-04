// SkSL runtime shader — AMBIENT AURA (the resting-state "living background", spec §6.4 / §0.7).
// Unlike the burst shaders this runs CONTINUOUSLY behind the whole UI, so it is deliberately CHEAP:
// no 56-particle loops, no high-octave fbm. Just a slow breathing halo + a faint 2-octave drifting
// haze + 4 floating energy motes + a vignette that keeps screen edges dark so text stays readable.
// Premultiplied alpha, intentionally LOW peak alpha — this is atmosphere, never a wash over content.
//
// Uniforms (fed by AmbientAura.tsx):
//   uTime       seconds (Skia useClock — runs on the render thread, never touches JS/logging)
//   uResolution canvas pixels
//   uColor      active theme accent (aura/mogul/pro/forged)
//   uIntensity  0 (off) · 0.5 (mid) · 1.0 (full)   ← from settings.juiceIntensity
//   uEnergy     0..1 from combat-power grade        ← higher grade = more alive (earned, anti-empty-confetti)

export const AMBIENT_AURA_SKSL = `
uniform float  uTime;
uniform float2 uResolution;
uniform float3 uColor;
uniform float  uIntensity;
uniform float  uEnergy;

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
  float d = hash21(i + float2(1.0, 1.0));
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

half4 main(float2 fragCoord) {
  float2 uv = fragCoord / uResolution;
  float2 p  = (fragCoord - 0.5 * uResolution) / uResolution.y;

  // slow global breathing (≈10s period) — the whole field gently inhales/exhales
  float breath = 0.5 + 0.5 * sin(uTime * 0.6);

  // upper-centered halo — sits behind the hero Combat-Power number, giving it an aura
  float2 hc = float2(0.0, -0.30);
  float hd = length(p - hc);
  float halo = exp(-hd * hd * 6.0) * (0.6 + 0.4 * breath);

  // faint drifting energy haze (2-octave), rising slowly; faded out toward edges/bottom
  float2 np = float2(p.x * 1.5, p.y * 1.8 - uTime * 0.05);
  float haze = vnoise(np * 2.0) * 0.6 + vnoise(np * 4.0) * 0.4;
  haze *= smoothstep(1.0, 0.1, length(p));

  // 4 slow-floating motes — cheap, drift upward and re-wrap; gentle twinkle
  float motes = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float ph = hash21(float2(fi, 7.0));
    float mx = sin(uTime * 0.18 + fi * 1.7) * 0.42;
    float my = fract(ph - uTime * 0.025) * 1.7 - 0.85;
    float2 mp = float2(mx, my);
    float tw = 0.55 + 0.45 * sin(uTime * 1.6 + fi * 2.1);
    motes += smoothstep(0.05, 0.0, length(p - mp)) * tw;
  }

  // vignette — darken edges so card/text contrast is never hurt by the aura
  float vig = smoothstep(1.1, 0.25, length(uv - 0.5));

  float field = (halo * 0.5 + haze * 0.16 + motes * 0.5) * vig;

  // earned + user-tunable: more alive at higher grade, scaled by the intensity setting.
  // Hard cap well below 1.0 — this layer must read as atmosphere, never an opaque wash.
  float alpha = clamp(field * uIntensity * (0.45 + 0.55 * uEnergy), 0.0, 0.42);

  float3 col = uColor * (0.8 + 0.5 * breath);
  col = mix(col, float3(1.0, 1.0, 1.0), clamp(motes * 0.4 + halo * 0.12, 0.0, 0.6));
  col = clamp(col, 0.0, 1.0);

  return half4(col * alpha, alpha);
}
`;
