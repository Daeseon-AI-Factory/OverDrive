import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { nowIso } from '@/lib/date';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { persistSettings, useSettingsStore } from '@/stores/settingsStore';
import { healthAvailable, readHealthSnapshot, requestHealthAuthorization } from './health';

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
    apply({
      health: {
        connected: true,
        workouts7d: snap.workouts7d,
        vo2Max: snap.vo2Max,
        bodyMassKg: snap.bodyMassKg,
        bodyFatFraction: snap.bodyFatFraction,
        syncedAt: nowIso(),
      },
    });
    await persistSettings(db);
    await recompute();
    return true;
  }, [db, apply, recompute]);

  const connect = useCallback(async (): Promise<boolean> => {
    const ok = await requestHealthAuthorization();
    if (!ok) return false;
    return sync();
  }, [sync]);

  const disconnect = useCallback(async (): Promise<void> => {
    apply({ health: null });
    await persistSettings(db);
    await recompute();
  }, [db, apply, recompute]);

  return { available: healthAvailable(), connected: !!health?.connected, health, connect, sync, disconnect };
}
