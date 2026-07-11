import type { SQLiteDatabase } from 'expo-sqlite';
import type { SetLogRow } from '@/db/types';
import { setScore } from '@/features/logging/detectPr';
import { deleteSet, updateSet } from './setLogRepo';

const previous: SetLogRow = {
  id: 'set-1',
  client_uuid: 'client-1',
  session_id: 'session-1',
  exercise_id: 'barbell_bench_press',
  weight: 100,
  reps: 5,
  rir: 2,
  order_index: 0,
  is_pr: 0,
  score: setScore(100, 5),
  logged_via: 'quick',
  logged_at: '2026-07-11T10:00:00.000Z',
};

describe('updateSet', () => {
  it('updates the same row and recalculates its score and PR status', async () => {
    const tx = {
      getFirstAsync: jest.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce({ best: 110 }),
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn((work: (transaction: typeof tx) => Promise<void>) => work(tx)),
    } as unknown as SQLiteDatabase;

    const result = await updateSet(db, { setId: previous.id, weight: 105, reps: 5, rir: 1 });

    expect(result.previous).toBe(previous);
    expect(result.row).toMatchObject({ id: previous.id, weight: 105, reps: 5, rir: 1, is_pr: 1 });
    expect(result.row.score).toBeCloseTo(setScore(105, 5), 6);
    expect(tx.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE set_log'),
      [105, 5, 1, result.row.score, 1, previous.id],
    );
  });

  it('does not manufacture a first-set PR and preserves immutable row fields', async () => {
    const tx = {
      getFirstAsync: jest.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce({ best: null }),
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn((work: (transaction: typeof tx) => Promise<void>) => work(tx)),
    } as unknown as SQLiteDatabase;

    const result = await updateSet(db, { setId: previous.id, weight: 80, reps: 8, rir: null });

    expect(result.isPr).toBe(false);
    expect(result.row).toMatchObject({
      id: previous.id,
      session_id: previous.session_id,
      exercise_id: previous.exercise_id,
      order_index: previous.order_index,
      logged_at: previous.logged_at,
    });
  });

  it('fails without issuing a write when the target set no longer exists', async () => {
    const tx = {
      getFirstAsync: jest.fn().mockResolvedValueOnce(null),
      runAsync: jest.fn(),
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn((work: (transaction: typeof tx) => Promise<void>) => work(tx)),
    } as unknown as SQLiteDatabase;

    await expect(updateSet(db, { setId: 'missing', weight: 80, reps: 8, rir: null })).rejects.toThrow(
      'set_not_found',
    );
    expect(tx.runAsync).not.toHaveBeenCalled();
  });
});

describe('deleteSet', () => {
  it('returns the durable row once and null on an idempotent retry', async () => {
    const tx = {
      getFirstAsync: jest.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce(null),
      runAsync: jest.fn().mockResolvedValue({ changes: 1 }),
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn((work: (transaction: typeof tx) => Promise<void>) => work(tx)),
    } as unknown as SQLiteDatabase;

    await expect(deleteSet(db, previous.id)).resolves.toBe(previous);
    await expect(deleteSet(db, previous.id)).resolves.toBeNull();
    expect(tx.runAsync).toHaveBeenCalledTimes(1);
  });
});
