import type { JuiceVerdict, SfxName } from '../juice.types';

/**
 * Pure: pick the SFX for a JUICE verdict. Honors an explicit `verdict.sfx` hint (e.g. cardio's
 * whoosh, set by classifyEvent), otherwise maps from reason + tier. No I/O, no asset imports —
 * kept separate from the asset manifest so it's trivially unit-testable.
 */
export function selectSfx(v: JuiceVerdict): SfxName {
  if (v.sfx) return v.sfx;
  switch (v.reason) {
    case 'pr':
      return 'pr_sting';
    case 'session':
      return 't4_supernova';
    case 'levelup':
      return 'pr_sting';
    case 'streak':
      return v.tier >= 4 ? 't4_supernova' : 't2_punch';
    case 'set':
    default:
      return v.tier === 4
        ? 't4_supernova'
        : v.tier === 3
          ? 't3_overdrive'
          : v.tier === 2
            ? 't2_punch'
            : 't1_tick';
  }
}
