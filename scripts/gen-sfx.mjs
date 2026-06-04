// OVERDRIVE — procedural SFX generator.
//
// Original IP, no samples, no external services, no deps. Pure math → 16-bit PCM mono WAV,
// the audio analogue of our SkSL shaders. Deterministic (seeded LCG) so re-runs are byte-stable.
//
//   node scripts/gen-sfx.mjs
//
// Outputs into assets/sfx/*.wav. Palette is tier-mapped (T1..T4) + named one-offs (PR, cardio,
// forge-enter, discipline). Short SFX, kept small; JUICE must never block the log hot path.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sfx');
const TAU = Math.PI * 2;

// ---- primitives -----------------------------------------------------------
const silence = (sec) => new Float32Array(Math.max(1, Math.round(sec * SR)));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const soft = (x) => Math.tanh(x * 1.4); // gentle analog-ish saturation

// deterministic white noise (fixed-seed LCG → reproducible builds; no Math.random)
let _seed = 0x2545f491 >>> 0;
const rnd = () => {
  _seed = (Math.imul(_seed, 1664525) + 1013904223) >>> 0;
  return (_seed / 0xffffffff) * 2 - 1;
};

// envelopes, k in [0,1]
const envExp = (tau) => (k) => Math.exp(-k / tau); // percussive decay
const swell = (k) => Math.sin(Math.PI * k); // bell-shaped in/out

// oscillator with optional linear freq sweep + amp envelope
function addOsc(out, { start = 0, dur, f0, f1 = f0, amp = 1, type = 'sine', env }) {
  const n = Math.round(dur * SR);
  const s = Math.round(start * SR);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    const f = f0 + (f1 - f0) * k;
    phase += (TAU * f) / SR;
    let v;
    switch (type) {
      case 'square': v = Math.sin(phase) >= 0 ? 1 : -1; break;
      case 'saw': v = ((phase / TAU) % 1) * 2 - 1; break;
      case 'tri': v = 2 * Math.abs(((phase / TAU) % 1) * 2 - 1) - 1; break;
      default: v = Math.sin(phase);
    }
    const idx = s + i;
    if (idx >= 0 && idx < out.length) out[idx] += v * amp * (env ? env(k) : 1);
  }
}

// noise with a one-pole lowpass (lp: 1 = bright, →0 = dark) + amp envelope
function addNoise(out, { start = 0, dur, amp = 1, env, lp = 1 }) {
  const n = Math.round(dur * SR);
  const s = Math.round(start * SR);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const k = i / n;
    prev = prev + lp * (rnd() - prev);
    const idx = s + i;
    if (idx >= 0 && idx < out.length) out[idx] += prev * amp * (env ? env(k) : 1);
  }
}

// ---- finishing ------------------------------------------------------------
function normalize(out, peak = 0.9) {
  let m = 0;
  for (const v of out) m = Math.max(m, Math.abs(v));
  if (m > 0) {
    const g = peak / m;
    for (let i = 0; i < out.length; i++) out[i] *= g;
  }
}
function declick(out) {
  const f = Math.round(0.004 * SR);
  for (let i = 0; i < f && i < out.length; i++) {
    const g = i / f;
    out[i] *= g;
    out[out.length - 1 - i] *= g;
  }
}
function toWav(out) {
  const n = out.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(clamp(out[i], -1, 1) * 32767), 44 + i * 2);
  return b;
}
function save(name, out) {
  declick(out);
  const wav = toWav(out);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, name), wav);
  console.log('  wrote', name.padEnd(20), (wav.length / 1024).toFixed(1) + ' KB');
}

// ---- the palette ----------------------------------------------------------
console.log('OVERDRIVE SFX →', OUT_DIR);

// T1 — light confirm. Normal set log, generic small pop.
{
  const o = silence(0.09);
  addOsc(o, { dur: 0.09, f0: 1320, f1: 990, amp: 0.8, env: envExp(0.18) });
  addOsc(o, { dur: 0.05, f0: 2640, amp: 0.2, env: envExp(0.1) });
  normalize(o, 0.7);
  save('t1_tick.wav', o);
}

// T2 — punchy body hit. Bigger set / volume milestone.
{
  const o = silence(0.22);
  addOsc(o, { dur: 0.22, f0: 180, f1: 90, amp: 1, env: envExp(0.22) });
  addOsc(o, { dur: 0.12, f0: 400, f1: 160, amp: 0.4, type: 'tri', env: envExp(0.14) });
  addNoise(o, { dur: 0.04, amp: 0.5, lp: 0.5, env: envExp(0.1) });
  for (let i = 0; i < o.length; i++) o[i] = soft(o[i]);
  normalize(o, 0.92);
  save('t2_punch.wav', o);
}

// T3 — OVERDRIVE: riser → impact.
{
  const o = silence(0.75);
  addNoise(o, { start: 0, dur: 0.46, amp: 0.35, lp: 0.25, env: (k) => k * k });
  addOsc(o, { start: 0, dur: 0.46, f0: 220, f1: 1400, amp: 0.4, type: 'saw', env: (k) => k });
  addOsc(o, { start: 0.45, dur: 0.3, f0: 160, f1: 60, amp: 1, env: envExp(0.25) });
  addNoise(o, { start: 0.45, dur: 0.12, amp: 0.6, lp: 0.4, env: envExp(0.12) });
  for (let i = 0; i < o.length; i++) o[i] = soft(o[i]);
  normalize(o, 0.95);
  save('t3_overdrive.wav', o);
}

// T4 — SUPERNOVA: crack + sub-drop + shimmer + long rumble. Forge finish / max event.
{
  const o = silence(1.6);
  addNoise(o, { start: 0, dur: 0.2, amp: 0.8, lp: 0.6, env: envExp(0.1) });
  addOsc(o, { start: 0, dur: 1.2, f0: 120, f1: 35, amp: 1, env: envExp(0.4) });
  addOsc(o, { start: 0.02, dur: 1.0, f0: 523, amp: 0.18, env: envExp(0.5) });
  addOsc(o, { start: 0.02, dur: 1.0, f0: 784, amp: 0.14, env: envExp(0.45) });
  addOsc(o, { start: 0.02, dur: 1.0, f0: 1046, amp: 0.1, env: envExp(0.4) });
  addNoise(o, { start: 0.1, dur: 1.4, amp: 0.25, lp: 0.12, env: envExp(0.5) });
  for (let i = 0; i < o.length; i++) o[i] = soft(o[i] * 1.1);
  normalize(o, 0.97);
  save('t4_supernova.wav', o);
}

// PR — triumphant ascending sparkle (original interval set, no recognizable melody).
{
  const o = silence(0.62);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, idx) => {
    const st = idx * 0.07;
    addOsc(o, { start: st, dur: 0.5 - idx * 0.05, f0: f, amp: 0.5, env: envExp(0.3) });
    addOsc(o, { start: st, dur: 0.3, f0: f * 2, amp: 0.12, env: envExp(0.2) });
  });
  addNoise(o, { dur: 0.5, amp: 0.12, lp: 0.8, env: envExp(0.4) });
  normalize(o, 0.85);
  save('pr_sting.wav', o);
}

// CARDIO — airy whoosh swell.
{
  const o = silence(0.6);
  addNoise(o, { dur: 0.6, amp: 0.7, lp: 0.3, env: swell });
  addOsc(o, { dur: 0.6, f0: 300, f1: 600, amp: 0.15, type: 'tri', env: swell });
  normalize(o, 0.7);
  save('cardio_whoosh.wav', o);
}

// FORGE ENTER — chamber: deep impact + detuned beating drone swell.
{
  const o = silence(1.4);
  addOsc(o, { start: 0, dur: 0.5, f0: 90, f1: 45, amp: 1, env: envExp(0.3) });
  addNoise(o, { start: 0, dur: 0.25, amp: 0.4, lp: 0.3, env: envExp(0.12) });
  const pad = (k) => Math.min(1, k * 4) * Math.exp(-k / 0.9);
  addOsc(o, { start: 0.05, dur: 1.3, f0: 55, amp: 0.4, env: pad });
  addOsc(o, { start: 0.05, dur: 1.3, f0: 55.4, amp: 0.4, env: pad });
  addOsc(o, { start: 0.05, dur: 1.3, f0: 110, amp: 0.18, env: pad });
  for (let i = 0; i < o.length; i++) o[i] = soft(o[i]);
  normalize(o, 0.9);
  save('forge_enter.wav', o);
}

// (Discipline toggles route through the JUICE choke-point → they get T1 'tick' by tier; no
//  dedicated asset, so we don't double-fire a sound on top of the juice burst.)

console.log('done.');
