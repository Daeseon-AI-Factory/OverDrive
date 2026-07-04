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
  silentStartArmed: boolean;
  /** One-shot arm: the next start() skips the enter ritual — for implicit auto-starts (first set /
   * body-map tap), where the 1.6s ritual must never delay logging (spec §6). Explicit forge entry
   * keeps the ritual. start() consumes the flag; callers disarm in a finally as a safety net. */
  setSilentStart: (armed: boolean) => void;
  start: (id: string, cpAtStart: number) => void;
  resume: (id: string, cpAtStart: number, setCount: number, volumeKg: number) => void;
  recordSet: (volumeKg: number) => void;
  undoSet: (volumeKg: number) => void;
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
  silentStartArmed: false,
  setSilentStart: (armed) => set({ silentStartArmed: armed }),
  start: (id, cpAtStart) =>
    set((s) => ({
      activeSessionId: id,
      startedAt: Date.now(),
      setCount: 0,
      volumeKg: 0,
      cpAtStart,
      ritual: s.silentStartArmed ? null : { id: ++ritualId, kind: 'enter' },
      silentStartArmed: false,
    })),
  resume: (id, cpAtStart, setCount, volumeKg) =>
    set({
      activeSessionId: id,
      startedAt: Date.now(),
      setCount,
      volumeKg,
      cpAtStart,
      ritual: null,
    }),
  recordSet: (volumeKg) => set((s) => ({ setCount: s.setCount + 1, volumeKg: s.volumeKg + volumeKg })),
  undoSet: (volumeKg) =>
    set((s) => ({
      setCount: Math.max(0, s.setCount - 1),
      volumeKg: Math.max(0, s.volumeKg - volumeKg),
    })),
  end: (summary) => set({ activeSessionId: null, startedAt: null, ritual: { id: ++ritualId, kind: 'complete', summary } }),
  clearRitual: () => set({ ritual: null }),
}));
