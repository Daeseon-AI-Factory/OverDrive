// User settings (spec §5 User.settings jsonb). Stored as JSON text in the `user` table,
// mirrored into settingsStore at runtime. → JSONB in Postgres (Phase 2).

import type { WeeklyProgram } from '@/features/program/types';
import { normalizeThemeId, type ThemeId } from '@/features/theme/themes';
import type { UnitSystem } from './units';

/** Active power-fantasy theme (see features/theme/themes.ts). Legacy values fall back to 'aura'. */
export type AestheticPref = ThemeId;
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
  /** ARENA rival config (deterministic growth curve seed). null until first spawn. */
  rival: { name: string; epoch: string; cp0: number; seed: number } | null;
  /** Ranking opt-in: handle set = participate; null = nothing is ever sent (privacy default). */
  rankHandle: string | null;
  /** Crew/gym code for the crew leaderboard (free-form, uppercased). */
  rankCrew: string | null;
  /** Stable anonymous device id for rank upserts (generated once). */
  rankDeviceId: string | null;
  /** User-customized weekly program. null → use the built-in default (defaultProgram.ts). */
  customProgram: WeeklyProgram | null;
  /** ISO timestamp when first-run onboarding finished or was skipped. null → not onboarded yet. */
  onboardedAt: string | null;
  /**
   * Apple Health / Health Connect sync state. null until the user connects. Sensor-verified data —
   * feeds Combat Power's verifiedRatio (trust bonus only, never a penalty §9). Game numbers are
   * never written back to Health (§4).
   */
  health: {
    connected: boolean;
    /** Health-platform workouts in the last 7 days at last sync. */
    workouts7d: number;
    vo2Max: number | null;
    bodyMassKg: number | null;
    bodyFatFraction: number | null;
    syncedAt: string | null;
  } | null;
}

export const DEFAULT_SETTINGS: UserSettings = {
  heightCm: null,
  startWeightKg: null,
  targetWeightKg: null,
  proteinTargetG: null,
  aestheticPref: 'aura',
  juiceIntensity: 'full',
  soundOn: true,
  weightStep: 2.5,
  unitSystem: 'metric',
  rival: null,
  rankHandle: null,
  rankCrew: null,
  rankDeviceId: null,
  customProgram: null,
  onboardedAt: null,
  health: null,
};

/** Tolerant parse of the stored settings JSON — always returns a complete object. */
export function parseSettings(json: string | null | undefined): UserSettings {
  if (!json) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(json) as Partial<UserSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed, aestheticPref: normalizeThemeId(parsed.aestheticPref) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
