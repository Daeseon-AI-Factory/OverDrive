import { create } from 'zustand';
import type { ExerciseRow } from '@/db/types';
import type { CatalogExerciseSelection } from '@/features/exercises/catalog/types';
import type { SavedQuickSet } from './useQuickLog';

// Tiny cross-feature intent: the QuickLog confirm-card's [수정] wants the screen-level
// SetLoggerSheet opened prefilled with the just-logged exercise. The sheet lives in
// app/(tabs)/index.tsx (driven by the body-map picker state), so instead of threading a callback
// through the screen, the card writes the intent here and SetLoggerSheet itself subscribes —
// same zustand pattern as sessionStore/restTimerStore.

type LoggerIntent =
  | { kind: 'new'; selection: CatalogExerciseSelection }
  | { kind: 'edit'; exercise: ExerciseRow; saved: SavedQuickSet };

interface EditIntentState {
  /** New-set or exact-row correction request for the screen-level SetLoggerSheet. */
  intent: LoggerIntent | null;
  openExercise: (selection: CatalogExerciseSelection) => void;
  openEdit: (saved: SavedQuickSet) => void;
  close: () => void;
}

export const useEditIntentStore = create<EditIntentState>((set) => ({
  intent: null,
  openExercise: (selection) => set({ intent: { kind: 'new', selection } }),
  openEdit: (saved) => {
    if (saved.exercise) set({ intent: { kind: 'edit', exercise: saved.exercise, saved } });
  },
  close: () => set({ intent: null }),
}));
