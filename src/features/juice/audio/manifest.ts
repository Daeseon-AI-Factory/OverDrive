import type { SfxName } from '../juice.types';
import t1_tick from '../../../../assets/sfx/t1_tick.wav';
import t2_punch from '../../../../assets/sfx/t2_punch.wav';
import t3_overdrive from '../../../../assets/sfx/t3_overdrive.wav';
import t4_supernova from '../../../../assets/sfx/t4_supernova.wav';
import pr_sting from '../../../../assets/sfx/pr_sting.wav';
import cardio_whoosh from '../../../../assets/sfx/cardio_whoosh.wav';
import forge_enter from '../../../../assets/sfx/forge_enter.wav';

/**
 * Asset manifest for the procedural SFX (synthesized by scripts/gen-sfx.mjs — original IP, no
 * samples). Metro resolves each .wav to a numeric asset id that expo-audio's createAudioPlayer
 * accepts. Isolated from selectSfx so the pure mapping stays asset-free / unit-testable.
 */
export const SFX_SOURCES: Record<SfxName, number> = {
  t1_tick,
  t2_punch,
  t3_overdrive,
  t4_supernova,
  pr_sting,
  cardio_whoosh,
  forge_enter,
};
