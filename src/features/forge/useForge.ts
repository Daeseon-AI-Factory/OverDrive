import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { appendPowerEvent } from '@/db/repos/powerEventRepo';
import {
  completeSession,
  getCompletedSessionDates,
  getOpenSessionForDate,
  getSessionActivitySummary,
  sessionStartedAtMs,
  startSession,
} from '@/db/repos/sessionRepo';
import { computeStreak } from '@/features/combat-power/aggregate';
import { playNamed } from '@/features/juice/audio/engine';
import { classifyEvent } from '@/features/juice/classifyEvent';
import { fireHaptic } from '@/features/juice/haptics';
import { useJuice } from '@/features/juice/JuiceProvider';
import { writeWorkout } from '@/features/health/health';
import { resolveProgramDay } from '@/features/program/resolve';
import { localDateDaysAgo, todayLocal } from '@/lib/date';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSessionStore } from './sessionStore';
import { coordinateSessionStart, type SessionStartMode } from './sessionCoordinator';

/**
 * Forge lifecycle. enter() opens a session (+ entry ritual). finish() completes it → recomputes
 * Combat Power, resolves the streak (now that completed_at is set), fires the T4 "FORGE COMPLETE"
 * supernova, and hands the summary to the completion ritual.
 */
export function useForge() {
  const db = useSQLiteContext();
  const juice = useJuice();

  const enterWithMode = useCallback(
    (mode: SessionStartMode): Promise<string> =>
      coordinateSessionStart(
        mode,
        () => useSessionStore.getState().activeSessionId,
        async (shouldStartSilently) => {
          const active = useSessionStore.getState().activeSessionId;
          if (active) return active;
          const cpAtStart = useCombatPowerStore.getState().score;
          const open = await getOpenSessionForDate(db, todayLocal());
          const activeAfterLookup = useSessionStore.getState().activeSessionId;
          if (activeAfterLookup) return activeAfterLookup;
          if (open) {
            const summary = await getSessionActivitySummary(db, open.id);
            const activeAfterSummary = useSessionStore.getState().activeSessionId;
            if (activeAfterSummary) return activeAfterSummary;
            useSessionStore
              .getState()
              .resume(open.id, cpAtStart, sessionStartedAtMs(open), summary.itemCount, summary.volumeKg);
            return open.id;
          }
          const dayType = resolveProgramDay(useSettingsStore.getState().customProgram, new Date().getDay()).dayType;
          const s = await startSession(db, { dayType });
          const silent = shouldStartSilently();
          useSessionStore.getState().start(s.id, cpAtStart, silent);
          if (!silent) {
            void fireHaptic(3); // explicit entry thump
            playNamed('forge_enter');
          }
          return s.id;
        },
      ),
    [db],
  );
  const enter = useCallback(() => enterWithMode('explicit'), [enterWithMode]);
  const enterSilently = useCallback(() => enterWithMode('silent'), [enterWithMode]);

  const finish = useCallback(async () => {
    if (!useSessionStore.getState().tryBeginFinish()) return false;
    let completed = false;
    try {
      let st = useSessionStore.getState();
      let sid = st.activeSessionId;
      if (!sid) {
        const open = await getOpenSessionForDate(db, todayLocal());
        if (!open) return false;
        const summary = await getSessionActivitySummary(db, open.id);
        useSessionStore
          .getState()
          .resume(
            open.id,
            useCombatPowerStore.getState().score,
            sessionStartedAtMs(open),
            summary.itemCount,
            summary.volumeKg,
          );
        st = useSessionStore.getState();
        sid = open.id;
      }

      await completeSession(db, sid);

      // `completed_at` is the durable success boundary. CP/streak/Health/JUICE are derived or
      // best-effort side effects and must never leave the same completed DB row active in memory.
      let deltaCp = 0;
      let streakDays = 0;
      let powerUpdated = false;
      try {
        const result = await recomputeAndStore(db); // streak now counts this session (completed_at set)
        useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
        deltaCp = result.score - st.cpAtStart;
        powerUpdated = true;
      } catch {
        // A later screen refresh recomputes CP. Session completion itself already succeeded.
      }

      try {
        const dates = await getCompletedSessionDates(db, localDateDaysAgo(90));
        streakDays = computeStreak(dates, todayLocal());
      } catch {
        // Completion remains valid; the next summary refresh restores the streak.
      }

      // Write the real, just-finished session to Apple Health (HKWorkout) — only if connected. Never
      // writes game numbers (§4). startedAt is epoch ms from the session store.
      if (st.startedAt && useSettingsStore.getState().health?.connected) {
        void writeWorkout(new Date(st.startedAt), new Date());
      }

      try {
        juice.fire(classifyEvent({ kind: 'session', deltaCp })); // T4 supernova
      } catch {
        // Visual celebration is never part of the completion transaction.
      }
      if (powerUpdated) {
        void appendPowerEvent(db, { tier: 4, delta: deltaCp, reason: 'session', sessionId: sid }).catch(() => {});
      }

      useSessionStore.getState().end({ sets: st.setCount, volumeKg: st.volumeKg, deltaCp, streakDays });
      completed = true;
      return true;
    } finally {
      if (!completed) useSessionStore.getState().cancelFinish();
    }
  }, [db, juice]);

  return { enter, enterSilently, finish };
}
