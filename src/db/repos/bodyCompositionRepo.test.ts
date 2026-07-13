import type { SQLiteDatabase } from 'expo-sqlite';
import { DEFAULT_SETTINGS } from '@/lib/settings';
import { getLatestBodyCompositionEntry, saveBodyCompositionEntry } from './bodyCompositionRepo';

const mockNewUuid = jest.fn();
jest.mock('../uuid', () => ({ newUuid: () => mockNewUuid() }));
jest.mock('../../lib/date', () => ({ nowIso: jest.fn(() => '2026-07-12T20:00:00.000Z') }));

describe('bodyCompositionRepo', () => {
  beforeEach(() => {
    mockNewUuid.mockReset();
    mockNewUuid.mockReturnValue('body-1');
  });

  it('stores weight, body-fat, and updated profile settings in one transaction', async () => {
    const tx = {
      runAsync: jest.fn().mockResolvedValueOnce({ changes: 1 }).mockResolvedValueOnce({ changes: 1 }),
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn((work: (transaction: typeof tx) => Promise<void>) => work(tx)),
    } as unknown as SQLiteDatabase;
    const settings = { ...DEFAULT_SETTINGS, startWeightKg: 82.5 };

    await expect(
      saveBodyCompositionEntry(db, { weightKg: 82.5, bodyFatFraction: 0.17 }, settings),
    ).resolves.toEqual({
      id: 'body-1',
      client_uuid: 'body-1',
      user_id: 'local',
      weight_kg: 82.5,
      body_fat_fraction: 0.17,
      measured_at: '2026-07-12T20:00:00.000Z',
    });

    expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(tx.runAsync).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO body_composition_log'), [
      'body-1',
      'body-1',
      'local',
      82.5,
      0.17,
      '2026-07-12T20:00:00.000Z',
    ]);
    expect(tx.runAsync).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE user SET settings'), [
      JSON.stringify(settings),
      '2026-07-12T20:00:00.000Z',
      'local',
    ]);
  });

  it('rejects the whole save when the profile update cannot be made', async () => {
    const tx = {
      runAsync: jest.fn().mockResolvedValueOnce({ changes: 1 }).mockResolvedValueOnce({ changes: 0 }),
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn((work: (transaction: typeof tx) => Promise<void>) => work(tx)),
    } as unknown as SQLiteDatabase;

    await expect(
      saveBodyCompositionEntry(
        db,
        { weightKg: 82.5, bodyFatFraction: 0.17 },
        { ...DEFAULT_SETTINGS, startWeightKg: 82.5 },
      ),
    ).rejects.toThrow('body_composition_user_not_found');
  });

  it('returns the most recently measured local entry', async () => {
    const latest = {
      id: 'body-2',
      client_uuid: 'body-2',
      user_id: 'local',
      weight_kg: 81,
      body_fat_fraction: 0.16,
      measured_at: '2026-07-12T21:00:00.000Z',
    };
    const db = { getFirstAsync: jest.fn().mockResolvedValue(latest) } as unknown as SQLiteDatabase;

    await expect(getLatestBodyCompositionEntry(db)).resolves.toBe(latest);
    expect(db.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('ORDER BY measured_at DESC'), ['local']);
  });
});
