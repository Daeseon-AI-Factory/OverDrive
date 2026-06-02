import { Skia } from '@shopify/react-native-skia';
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

export const makeEnergyPopEffect = () => compileEffect(ENERGY_POP_SKSL);
export const makeOverdriveBurstEffect = () => compileEffect(OVERDRIVE_BURST_SKSL);

export { ENERGY_POP_SKSL, OVERDRIVE_BURST_SKSL };
