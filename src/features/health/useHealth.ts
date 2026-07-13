import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { nowIso } from '@/lib/date';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { persistSettings, useSettingsStore } from '@/stores/settingsStore';
import { healthAvailable, readHealthSnapshot, requestHealthAuthorization } from './health';
import { persistHealthState } from './persistHealthState';

/**
 * Apple Health (iOS) connect/sync/disconnect for Settings. Reads a snapshot → stores it in settings
 * → recomputes Combat Power (so sensor-verified activity lifts the trust bonus immediately). Disconnect
 * clears the stored health data and recomputes (consent withdrawal — compliance requires it). Android
 * Health Connect is a later platform impl; until then `available` is false off iOS.
 */
export function useHealth() {
  const db = useSQLiteContext();
  const health = useSettingsStore((s) => s.health);
  const apply = useSettingsStore((s) => s.apply);

  const recompute = useCallback(async () => {
    const r = await recomputeAndStore(db);
    useCombatPowerStore.getState().setSnapshot(r.score, r.grade.key);
  }, [db]);

  const sync = useCallback(async (): Promise<boolean> => {
    const snap = await readHealthSnapshot();
    if (!snap.connected) return false;
    const next = {
      connected: true,
      workouts7d: snap.workouts7d,
      vo2Max: snap.vo2Max,
      bodyMassKg: snap.bodyMassKg,
      bodyFatFraction: snap.bodyFatFraction,
      syncedAt: nowIso(),
    };
    const saved = await persistHealthState(next, {
      current: () => useSettingsStore.getState().health,
      apply: (health) => apply({ health }),
      persist: () => persistSettings(db),
    });
    if (!saved) return false;
    try {
      await recompute();
    } catch (error) {
      // The source snapshot is durably saved; a derived-score refresh can retry on next launch.
      console.error('[health] combat power recompute failed', error);
    }
    return true;
  }, [db, apply, recompute]);

  const connect = useCallback(async (): Promise<boolean> => {
    const ok = await requestHealthAuthorization();
    if (!ok) return false;
    return sync();
  }, [sync]);

  const disconnect = useCallback(async (): Promise<boolean> => {
    const saved = await persistHealthState(null, {
      current: () => useSettingsStore.getState().health,
      apply: (health) => apply({ health }),
      persist: () => persistSettings(db),
    });
    if (!saved) return false;
    try {
      await recompute();
    } catch (error) {
      // Privacy deletion already committed; stale derived CP is corrected on the next launch.
      console.error('[health] combat power recompute failed', error);
    }
    return true;
  }, [db, apply, recompute]);

  return { available: healthAvailable(), connected: !!health?.connected, health, connect, sync, disconnect };
}
