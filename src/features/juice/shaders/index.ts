import { Skia } from '@shopify/react-native-skia';
import { AMBIENT_AURA_SKSL } from './ambientAura.sksl';
import { ENERGY_POP_SKSL } from './energyPop.sksl';
import { OVERDRIVE_BURST_SKSL } from './overdriveBurst.sksl';

/**
 * Compile an SkSL source into a Skia RuntimeEffect.
 * Skia.RuntimeEffect.Make returns null on a compile error — we warn loudly so a broken shader is
 * never shipped as an invisible no-op (spec §6.4: a broken shader must be obvious, not silent).
 * Callers should fall back to the Reanimated JUICE v0 when this returns null.
 */
export function compileEffect(source: string) {
  const effect = Skia.RuntimeEffect.Make(source);
  if (!effect) {
    console.warn('[JUICE] SkSL compile failed — falling back to non-shader effect');
  }
  return effect;
}

// Compile each constant shader at most ONCE per process. The sources are static module-level
// strings, so recompiling per call would re-run the synchronous SkSL compiler on the JS thread on
// every mount — e.g. each tab re-focus remounts AmbientAura, and every burst remounts the overlay
// (spec §6: never hitch the logging/UI thread). On a compile failure the slot stays nullish and the
// next call retries (and re-warns), which is the right behavior for a broken constant shader.
let energyPopEffect: ReturnType<typeof compileEffect> | undefined;
let overdriveBurstEffect: ReturnType<typeof compileEffect> | undefined;
let ambientAuraEffect: ReturnType<typeof compileEffect> | undefined;

export const makeEnergyPopEffect = () => (energyPopEffect ??= compileEffect(ENERGY_POP_SKSL));
export const makeOverdriveBurstEffect = () => (overdriveBurstEffect ??= compileEffect(OVERDRIVE_BURST_SKSL));
export const makeAmbientAuraEffect = () => (ambientAuraEffect ??= compileEffect(AMBIENT_AURA_SKSL));

export { AMBIENT_AURA_SKSL, ENERGY_POP_SKSL, OVERDRIVE_BURST_SKSL };
