import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getScoreOnOrBefore } from '@/db/repos/combatPowerRepo';
import { bossCandidates, hasPrSince } from '@/db/repos/setLogRepo';
import { updateSettings } from '@/db/repos/userRepo';
import { CP_FLOOR } from '@/features/combat-power/constants';
import { classifyEvent } from '@/features/juice/classifyEvent';
import { useJuice } from '@/features/juice/JuiceProvider';
import { localDateDaysAgo, todayLocal } from '@/lib/date';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { currentSettings, useSettingsStore } from '@/stores/settingsStore';
import { addDays, createRival, rivalCpOn, rivalGainOn, weekStartLocal, type RivalConfig } from './rival';
import { pickWeeklyBoss, type WeeklyBoss } from './weeklyBoss';

export interface ArenaState {
  rival: RivalConfig | null;
  rivalCp: number;
  rivalGainToday: number;
  /** Weekly showdown: GAINS this week (improvement-based — always winnable by training). */
  youWeekGain: number;
  rivalWeekGain: number;
  boss: WeeklyBoss | null;
  bossDefeated: boolean;
}

/**
 * ARENA: the rival + weekly boss. Spawns the rival once (persisted in settings), computes
 * everything else deterministically per day. Fires a T4 JUICE when you OVERTAKE the rival's
 * absolute CP while the app is open (transition only — never on mount).
 */
export function useArena(): ArenaState {
  const db = useSQLiteContext();
  const juice = useJuice();
  const score = useCombatPowerStore((s) => s.score);
  const rival = useSettingsStore((s) => s.rival);
  const apply = useSettingsStore((s) => s.apply);

  const [weekBase, setWeekBase] = useState<number | null>(null);
  const [boss, setBoss] = useState<WeeklyBoss | null>(null);
  const [bossDefeated, setBossDefeated] = useState(false);
  const spawning = useRef(false);

  const today = todayLocal();
  const weekStart = weekStartLocal(today);

  // Spawn the rival exactly once, after CP has hydrated.
  useEffect(() => {
    if (rival || spawning.current) return;
    spawning.current = true;
    const cfg = createRival(score, today);
    apply({ rival: cfg });
    void updateSettings(db, currentSettings()).catch(() => {});
  }, [rival, score, today, apply, db]);

  const reload = useCallback(async () => {
    const [base, cands] = await Promise.all([
      getScoreOnOrBefore(db, addDays(weekStart, -1)),
      bossCandidates(db, localDateDaysAgo(14)),
    ]);
    setWeekBase(base);
    const picked = pickWeeklyBoss(cands, weekStart);
    setBoss(picked);
    setBossDefeated(picked ? await hasPrSince(db, picked.exerciseId, weekStart) : false);
  }, [db, weekStart]);

  useFocusEffect(
    useCallback(() => {
      void reload().catch(() => {});
    }, [reload]),
  );

  const rivalCp = rival ? rivalCpOn(rival, today) : CP_FLOOR;

  // OVERTAKE: fire only on a behind→ahead transition while mounted (never on first render).
  const wasAhead = useRef<boolean | null>(null);
  useEffect(() => {
    if (!rival) return;
    const ahead = score >= rivalCp;
    if (wasAhead.current === false && ahead) {
      juice.fire(classifyEvent({ kind: 'levelup', deltaCp: score - rivalCp }));
    }
    wasAhead.current = ahead;
  }, [score, rivalCp, rival, juice]);

  return {
    rival: rival ?? null,
    rivalCp,
    rivalGainToday: rival ? rivalGainOn(rival, today) : 0,
    youWeekGain: Math.max(0, score - (weekBase ?? CP_FLOOR)),
    rivalWeekGain: rival ? Math.max(0, rivalCp - rivalCpOn(rival, addDays(weekStart, -1))) : 0,
    boss,
    bossDefeated,
  };
}
