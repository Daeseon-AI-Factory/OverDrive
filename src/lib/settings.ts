// User settings (spec §5 User.settings jsonb). Stored as JSON text in the `user` table,
// mirrored into settingsStore at runtime. → JSONB in Postgres (Phase 2).

import type { WeeklyProgram } from '@/features/program/types';
import { normalizeThemeId, type ThemeId } from '@/features/theme/themes';
// Pure data module (registry → types only) — importing SkinContext here would cycle through
// stores/settingsStore back into this file, so id normalization is done against SKINS directly.
import { SKINS } from '@/ui/skins/registry';
import type { SkinId } from '@/ui/skins/types';
import type { UnitSystem } from './units';

/** Active power-fantasy theme (see features/theme/themes.ts). Legacy values fall back to 'aura'. */
export type AestheticPref = ThemeId;
export type JuiceIntensity = 'full' | 'mid' | 'minimal';

/**
 * Increment whenever the remote-processing disclosure materially changes. Stored consent for an
 * older disclosure never carries forward silently: the remote AI paths stay off until the user
 * accepts the current version.
 */
export const REMOTE_AI_CONSENT_VERSION = 2;

export interface RemoteAiConsent {
  version: number;
  acceptedAt: string;
}

function normalizeRemoteAiConsent(value: unknown): RemoteAiConsent | null {
  if (value == null || typeof value !== 'object') return null;
  const candidate = value as Partial<RemoteAiConsent>;
  if (
    candidate.version !== REMOTE_AI_CONSENT_VERSION ||
    typeof candidate.acceptedAt !== 'string' ||
    Number.isNaN(Date.parse(candidate.acceptedAt))
  ) {
    return null;
  }
  return { version: candidate.version, acceptedAt: candidate.acceptedAt };
}

/** The single gate used by every client-side remote AI entry point. */
export function hasCurrentRemoteAiConsent(value: RemoteAiConsent | null | undefined): boolean {
  return normalizeRemoteAiConsent(value) != null;
}

/** Tolerant id → SkinId for stored values. Unknown/legacy ids fall back to the default skin. */
function normalizeSkinId(id: unknown): SkinId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(SKINS, id) ? (id as SkinId) : 'reactor';
}

export interface UserSettings {
  heightCm: number | null;
  startWeightKg: number | null;
  targetWeightKg: number | null;
  proteinTargetG: number | null;
  aestheticPref: AestheticPref;
  /** Active HUD skin — full chrome swap (see ui/skins/registry.ts). Orthogonal to aestheticPref. */
  skinId: SkinId;
  juiceIntensity: JuiceIntensity;
  soundOn: boolean;
  /** Weight stepper increment (kg) in the set logger. */
  weightStep: number;
  /** Display units. Storage is always metric (kg/m); this only affects display + input. */
  unitSystem: UnitSystem;
  /** ARENA rival config (deterministic growth curve seed). null until first spawn. */
  rival: { name: string; epoch: string; cp0: number; seed: number } | null;
  /** Legacy TestFlight leaderboard handle. V1 never creates or submits one. */
  rankHandle: string | null;
  /** Legacy TestFlight crew/gym code. V1 never creates or submits one. */
  rankCrew: string | null;
  /** Legacy random deletion token. V1 only transmits it on an explicit delete request. */
  rankDeviceId: string | null;
  /** User-customized weekly program. null → use the built-in default (defaultProgram.ts). */
  customProgram: WeeklyProgram | null;
  /** ISO timestamp when first-run onboarding finished or was skipped. null → not onboarded yet. */
  onboardedAt: string | null;
  /**
   * Explicit, revocable consent for optional remote AI processing. null is the privacy-safe
   * default; version mismatch also normalizes to null and requires fresh consent.
   */
  remoteAiConsent: RemoteAiConsent | null;
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
  skinId: 'reactor',
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
  remoteAiConsent: null,
  health: null,
};

/** Tolerant parse of the stored settings JSON — always returns a complete object. */
export function parseSettings(json: string | null | undefined): UserSettings {
  if (!json) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(json) as Partial<UserSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      aestheticPref: normalizeThemeId(parsed.aestheticPref),
      skinId: normalizeSkinId(parsed.skinId),
      remoteAiConsent: normalizeRemoteAiConsent(parsed.remoteAiConsent),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
