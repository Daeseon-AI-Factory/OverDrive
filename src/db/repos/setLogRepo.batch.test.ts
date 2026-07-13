import type { SQLiteDatabase } from 'expo-sqlite';
import { setScore } from '@/features/logging/detectPr';
import { addSets, deleteSets } from './setLogRepo';

jest.mock('../uuid', () => {
  let next = 0;
  return { newUuid: () => `uuid-${++next}` };
});

describe('deleteSets', () => {
  it('deletes a deduplicated quick-log batch with one SQLite statement', async () => {
    const db = { runAsync: jest.fn().mockResolvedValue({ changes: 2 }) } as unknown as SQLiteDatabase;

    await expect(deleteSets(db, ['set-1', 'set-2', 'set-1'])).resolves.toBe(2);

    expect(db.runAsync).toHaveBeenCalledTimes(1);
    expect(db.runAsync).toHaveBeenCalledWith('DELETE FROM set_log WHERE id IN (?,?)', ['set-1', 'set-2']);
  });

  it('does not issue SQL for an empty batch', async () => {
    const db = { runAsync: jest.fn() } as unknown as SQLiteDatabase;

    await expect(deleteSets(db, [])).resolves.toBe(0);
    expect(db.runAsync).not.toHaveBeenCalled();
  });
});

describe('addSets', () => {
  it('writes a multi-set command in one atomic SQLite statement with stable ordering', async () => {
    const db = {
      getFirstAsync: jest
        .fn()
        .mockResolvedValueOnce({ best: setScore(80, 5) })
        .mockResolvedValueOnce({ next: 4 }),
      runAsync: jest.fn().mockResolvedValue({ changes: 2 }),
    } as unknown as SQLiteDatabase;

    const result = await addSets(db, [
      { sessionId: 'session-1', exerciseId: 'bench', weight: 90, reps: 5, rir: 2 },
      { sessionId: 'session-1', exerciseId: 'bench', weight: 85, reps: 5, rir: 1 },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ isPr: true, row: { order_index: 4, is_pr: 1 } });
    expect(result[1]).toMatchObject({ isPr: false, row: { order_index: 5, is_pr: 0 } });
    expect(Date.parse(result[1].row.logged_at) - Date.parse(result[0].row.logged_at)).toBe(1);
    expect(db.runAsync).toHaveBeenCalledTimes(1);
    expect(db.runAsync).toHaveBeenCalledWith(expect.stringContaining('VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'), expect.any(Array));
    const params = (db.runAsync as jest.Mock).mock.calls[0][1] as unknown[];
    expect(params).toHaveLength(24);
  });

  it('rejects mixed sessions before issuing any database reads or writes', async () => {
    const db = { getFirstAsync: jest.fn(), runAsync: jest.fn() } as unknown as SQLiteDatabase;

    await expect(
      addSets(db, [
        { sessionId: 'session-1', exerciseId: 'bench', weight: 80, reps: 5, rir: null },
        { sessionId: 'session-2', exerciseId: 'bench', weight: 80, reps: 5, rir: null },
      ]),
    ).rejects.toThrow('batch_session_mismatch');
    expect(db.getFirstAsync).not.toHaveBeenCalled();
    expect(db.runAsync).not.toHaveBeenCalled();
  });
});
