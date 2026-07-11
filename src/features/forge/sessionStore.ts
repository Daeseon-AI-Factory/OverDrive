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
  /** Durable session mutation currently in flight; mutations and completion are single-flight. */
  pendingLogWrites: number;
  /** True from the atomic finish gate until completion succeeds or rolls back. */
  finishing: boolean;
  /** Monotonic invalidation token for every set/cardio add, correction, or undo. */
  logRevision: number;
  /**
   * Epoch ms of the most recent recordSet — EVERY logging path funnels through recordSet, so this
   * is the coach's rest-ring anchor without touching the hot path (additive; callers unchanged).
   * Cleared on start/resume/end; a resumed session re-derives it from set_log.logged_at instead.
   * Deliberately NOT cleared by undoSet: the undone save is still the honest last-activity moment.
   * lastExerciseId is not mirrored here — it stays derivable from today's set_log rows.
   */
  lastSetAt: number | null;
  start: (id: string, cpAtStart: number, silent?: boolean) => void;
  resume: (id: string, cpAtStart: number, setCount: number, volumeKg: number) => void;
  tryBeginLogWrite: () => boolean;
  endLogWrite: () => void;
  tryBeginFinish: () => boolean;
  cancelFinish: () => void;
  recordSet: (volumeKg: number) => void;
  /** Correct a just-logged set without changing the set count or rest anchor. */
  replaceSetVolume: (previousVolumeKg: number, nextVolumeKg: number) => void;
  undoSet: (volumeKg: number) => void;
  /** Replace optimistic counters with the durable DB summary after a correction or deletion. */
  reconcileActivity: (sessionId: string, itemCount: number, volumeKg: number) => void;
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
  pendingLogWrites: 0,
  finishing: false,
  logRevision: 0,
  lastSetAt: null,
  start: (id, cpAtStart, silent = false) =>
    set({
      activeSessionId: id,
      startedAt: Date.now(),
      setCount: 0,
      volumeKg: 0,
      cpAtStart,
      ritual: silent ? null : { id: ++ritualId, kind: 'enter' },
      lastSetAt: null,
    }),
  resume: (id, cpAtStart, setCount, volumeKg) =>
    set({
      activeSessionId: id,
      startedAt: Date.now(),
      setCount,
      volumeKg,
      cpAtStart,
      ritual: null,
      lastSetAt: null,
    }),
  tryBeginLogWrite: () => {
    let accepted = false;
    set((s) => {
      if (s.finishing || s.pendingLogWrites > 0) return s;
      accepted = true;
      return { pendingLogWrites: 1 };
    });
    return accepted;
  },
  endLogWrite: () => set((s) => ({ pendingLogWrites: Math.max(0, s.pendingLogWrites - 1) })),
  tryBeginFinish: () => {
    let accepted = false;
    set((s) => {
      if (s.finishing || s.pendingLogWrites > 0) return s;
      accepted = true;
      return { finishing: true };
    });
    return accepted;
  },
  cancelFinish: () => set({ finishing: false }),
  recordSet: (volumeKg) =>
    set((s) => ({
      setCount: s.setCount + 1,
      volumeKg: s.volumeKg + volumeKg,
      lastSetAt: Date.now(),
      logRevision: s.logRevision + 1,
    })),
  replaceSetVolume: (previousVolumeKg, nextVolumeKg) =>
    set((s) => ({
      volumeKg: Math.max(0, s.volumeKg - previousVolumeKg + nextVolumeKg),
      logRevision: s.logRevision + 1,
    })),
  undoSet: (volumeKg) =>
    set((s) => ({
      setCount: Math.max(0, s.setCount - 1),
      volumeKg: Math.max(0, s.volumeKg - volumeKg),
      logRevision: s.logRevision + 1,
    })),
  reconcileActivity: (sessionId, itemCount, volumeKg) =>
    set((s) =>
      s.activeSessionId === sessionId
        ? {
            setCount: Math.max(0, itemCount),
            volumeKg: Math.max(0, volumeKg),
            logRevision: s.logRevision + 1,
          }
        : s,
    ),
  end: (summary) =>
    set({
      activeSessionId: null,
      startedAt: null,
      pendingLogWrites: 0,
      finishing: false,
      lastSetAt: null,
      ritual: { id: ++ritualId, kind: 'complete', summary },
    }),
  clearRitual: () => set({ ritual: null }),
}));
