import { persistHealthState } from './persistHealthState';
import type { UserSettings } from '@/lib/settings';

const SNAPSHOT = {
  connected: true,
  workouts7d: 3,
  vo2Max: 42,
  bodyMassKg: 80,
  bodyFatFraction: 0.18,
  syncedAt: '2026-07-12T00:00:00.000Z',
} satisfies NonNullable<UserSettings['health']>;

describe('persistHealthState', () => {
  it('keeps the new state only after the database write succeeds', async () => {
    let health: UserSettings['health'] = null;

    await expect(
      persistHealthState(SNAPSHOT, {
        current: () => health,
        apply: (next) => {
          health = next;
        },
        persist: async () => true,
      }),
    ).resolves.toBe(true);
    expect(health).toEqual(SNAPSHOT);
  });

  it('restores the previous state when disconnect cannot be persisted', async () => {
    let health: UserSettings['health'] = SNAPSHOT;

    await expect(
      persistHealthState(null, {
        current: () => health,
        apply: (next) => {
          health = next;
        },
        persist: async () => false,
      }),
    ).resolves.toBe(false);
    expect(health).toEqual(SNAPSHOT);
  });
});
