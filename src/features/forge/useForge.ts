import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { appendPowerEvent } from '@/db/repos/powerEventRepo';
import { completeSession, getCompletedSessionDates, getOpenSessionForDate, getSessionActivitySummary, startSession } from '@/db/repos/sessionRepo';
import { computeStreak } from '@/features/combat-power/aggregate';
import { playNamed } from '@/features/juice/audio/engine';
import { classifyEvent } from '@/features/juice/classifyEvent';
import { fireHaptic } from '@/features/juice/haptics';
import { useJuice } from '@/features/juice/JuiceProvider';
import { resolveProgramDay } from '@/features/program/resolve';
import { localDateDaysAgo, todayLocal } from '@/lib/date';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSessionStore } from './sessionStore';

/**
 * Forge lifecycle. enter() opens a session (+ entry ritual). finish() completes it → recomputes
 * Combat Power, resolves the streak (now that completed_at is set), fires the T4 "FORGE COMPLETE"
 * supernova, and hands the summary to the completion ritual.
 */
export function useForge() {
  const db = useSQLiteContext();
  const juice = useJuice();

  const enter = useCallback(async () => {
    if (useSessionStore.getState().activeSessionId) return;
    const cpAtStart = useCombatPowerStore.getState().score;
    const open = await getOpenSessionForDate(db, todayLocal());
    if (open) {
      const summary = await getSessionActivitySummary(db, open.id);
      useSessionStore.getState().resume(open.id, cpAtStart, summary.itemCount, summary.volumeKg);
      return;
    }
    const dayType = resolveProgramDay(useSettingsStore.getState().customProgram, new Date().getDay()).dayType;
    const s = await startSession(db, { dayType });
    useSessionStore.getState().start(s.id, cpAtStart);
    void fireHaptic(3); // entry thump
    playNamed('forge_enter'); // chamber drone — "entering the training chamber"
  }, [db]);

  const finish = useCallback(async () => {
    let st = useSessionStore.getState();
    let sid = st.activeSessionId;
    if (!sid) {
      const open = await getOpenSessionForDate(db, todayLocal());
      if (!open) return;
      const summary = await getSessionActivitySummary(db, open.id);
      useSessionStore.getState().resume(open.id, useCombatPowerStore.getState().score, summary.itemCount, summary.volumeKg);
      st = useSessionStore.getState();
      sid = open.id;
    }

    await completeSession(db, sid);
    const result = await recomputeAndStore(db); // streak now counts this session (completed_at set)
    useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);

    const deltaCp = result.score - st.cpAtStart;
    const dates = await getCompletedSessionDates(db, localDateDaysAgo(90));
    const streakDays = computeStreak(dates, todayLocal());

    juice.fire(classifyEvent({ kind: 'session', deltaCp })); // T4 supernova
    void appendPowerEvent(db, { tier: 4, delta: deltaCp, reason: 'session', sessionId: sid });

    useSessionStore.getState().end({ sets: st.setCount, volumeKg: st.volumeKg, deltaCp, streakDays });
  }, [db, juice]);

  return { enter, finish };
}
