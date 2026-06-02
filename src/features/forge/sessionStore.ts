import { create } from 'zustand';

// The Forge = an active training session. Entering plays the entry ritual; finishing plays the
// completion (T4) ritual. Logging during a session feeds setCount/volume for the summary.

export interface ForgeSummary {
  sets: number;
  volumeKg: number;
  deltaCp: number;
  streakDays: number;
}

export interface ForgeRitual {
  id: number;
  kind: 'enter' | 'complete';
  summary?: ForgeSummary;
}

interface SessionState {
  activeSessionId: string | null;
  startedAt: number | null; // epoch ms (session timer)
  setCount: number;
  volumeKg: number;
  cpAtStart: number;
  ritual: ForgeRitual | null;
  start: (id: string, cpAtStart: number) => void;
  recordSet: (volumeKg: number) => void;
  end: (summary: ForgeSummary) => void;
  clearRitual: () => void;
}

let ritualId = 0;

export const useSessionStore = create<SessionState>((set) => ({
  activeSessionId: null,
  startedAt: null,
  setCount: 0,
  volumeKg: 0,
  cpAtStart: 0,
  ritual: null,
  start: (id, cpAtStart) =>
    set({
      activeSessionId: id,
      startedAt: Date.now(),
      setCount: 0,
      volumeKg: 0,
      cpAtStart,
      ritual: { id: ++ritualId, kind: 'enter' },
    }),
  recordSet: (volumeKg) => set((s) => ({ setCount: s.setCount + 1, volumeKg: s.volumeKg + volumeKg })),
  end: (summary) => set({ activeSessionId: null, startedAt: null, ritual: { id: ++ritualId, kind: 'complete', summary } }),
  clearRitual: () => set({ ritual: null }),
}));
