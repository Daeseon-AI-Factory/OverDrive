import type { UserSettings } from '@/lib/settings';

type HealthState = UserSettings['health'];

export interface HealthStateCommit {
  current: () => HealthState;
  apply: (health: HealthState) => void;
  persist: () => Promise<boolean>;
}

/**
 * Persist a Health snapshot as one observable state transition. A failed SQLite write restores the
 * previous in-memory value so reconnect/disconnect can never look successful and then reverse on
 * the next launch.
 */
export async function persistHealthState(next: HealthState, commit: HealthStateCommit): Promise<boolean> {
  const previous = commit.current();
  commit.apply(next);
  const saved = await commit.persist();
  if (!saved) commit.apply(previous);
  return saved;
}
