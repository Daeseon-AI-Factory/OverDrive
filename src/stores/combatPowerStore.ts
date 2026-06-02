import { create } from 'zustand';
import { CP_FLOOR } from '../features/combat-power/constants';

// Current Combat Power snapshot for the UI. Keeps `prev` so the odometer can animate prev→score
// (the T3 "slam"). Updated after each recompute on the logging hot path.
interface CombatPowerState {
  score: number;
  prev: number;
  gradeKey: string;
  setSnapshot: (score: number, gradeKey: string) => void;
}

export const useCombatPowerStore = create<CombatPowerState>((set) => ({
  score: CP_FLOOR,
  prev: CP_FLOOR,
  gradeKey: 'ordinary',
  setSnapshot: (score, gradeKey) =>
    set((s) => ({ prev: s.score, score, gradeKey })),
}));
