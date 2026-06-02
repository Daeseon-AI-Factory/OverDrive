import { create } from 'zustand';
import { DEFAULT_SETTINGS, type UserSettings } from '../lib/settings';

// In-memory mirror of User.settings (source of truth = the `user` table). Hydrated from DB on
// boot; writes go back through userRepo.updateSettings.
interface SettingsState extends UserSettings {
  hydrated: boolean;
  hydrate: (s: UserSettings) => void;
  apply: (patch: Partial<UserSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,
  hydrate: (s) => set({ ...s, hydrated: true }),
  apply: (patch) => set(patch),
}));

/** Snapshot of just the settings fields (for passing to userRepo). */
export function currentSettings(): UserSettings {
  const s = useSettingsStore.getState();
  return {
    heightCm: s.heightCm,
    startWeightKg: s.startWeightKg,
    targetWeightKg: s.targetWeightKg,
    proteinTargetG: s.proteinTargetG,
    aestheticPref: s.aestheticPref,
    juiceIntensity: s.juiceIntensity,
    soundOn: s.soundOn,
  };
}
