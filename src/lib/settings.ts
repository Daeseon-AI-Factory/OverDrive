// User settings (spec §5 User.settings jsonb). Stored as JSON text in the `user` table,
// mirrored into settingsStore at runtime. → JSONB in Postgres (Phase 2).

import type { UnitSystem } from './units';

export type AestheticPref = 'battle' | 'glow' | 'neon';
export type JuiceIntensity = 'full' | 'mid' | 'minimal';

export interface UserSettings {
  heightCm: number | null;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  proteinTargetG: number | null;
  aestheticPref: AestheticPref;
  juiceIntensity: JuiceIntensity;
  soundOn: boolean;
  /** Weight stepper increment (kg) in the set logger. */
  weightStep: number;
  /** Display units. Storage is always metric (kg/m); this only affects display + input. */
  unitSystem: UnitSystem;
}

export const DEFAULT_SETTINGS: UserSettings = {
  heightCm: null,
  startWeightKg: null,
  targetWeightKg: null,
  proteinTargetG: null,
  aestheticPref: 'battle',
  juiceIntensity: 'full',
  soundOn: true,
  weightStep: 2.5,
  unitSystem: 'metric',
};

/** Tolerant parse of the stored settings JSON — always returns a complete object. */
export function parseSettings(json: string | null | undefined): UserSettings {
  if (!json) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(json) as Partial<UserSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
