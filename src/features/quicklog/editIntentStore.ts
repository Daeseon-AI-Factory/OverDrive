import { create } from 'zustand';
import type { ExerciseRow } from '@/db/types';

// Tiny cross-feature intent: the QuickLog confirm-card's [수정] wants the screen-level
// SetLoggerSheet opened prefilled with the just-logged exercise. The sheet lives in
// app/(tabs)/index.tsx (driven by the body-map picker state), so instead of threading a callback
// through the screen, the card writes the intent here and SetLoggerSheet itself subscribes —
// same zustand pattern as sessionStore/restTimerStore.

interface EditIntentState {
  /** Exercise the SetLoggerSheet should open for (in addition to its screen-level prop). */
  exercise: ExerciseRow | null;
  open: (exercise: ExerciseRow) => void;
  close: () => void;
}

export const useEditIntentStore = create<EditIntentState>((set) => ({
  exercise: null,
  open: (exercise) => set({ exercise }),
  close: () => set({ exercise: null }),
}));
