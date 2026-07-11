import type { SQLiteDatabase } from 'expo-sqlite';
import { addFoodItems, getLatestFoodBatch, undoFoodBatch } from './foodRepo';

const mockNewUuid = jest.fn();
jest.mock('../uuid', () => ({ newUuid: () => mockNewUuid() }));
jest.mock('../../lib/date', () => ({
  nowIso: jest.fn(() => '2026-07-09T15:30:00.000Z'),
  todayLocal: jest.fn(() => '2026-07-09'),
}));

describe('foodRepo meal batches', () => {
  beforeEach(() => {
    mockNewUuid.mockReset();
    mockNewUuid.mockReturnValueOnce('food-1').mockReturnValueOnce('food-2');
  });

  it('writes every item atomically in one statement with one batch timestamp', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = { runAsync } as unknown as SQLiteDatabase;

    const batch = await addFoodItems(
      db,
      [
        { name: ' chicken ', kcal: 300, proteinG: 45 },
        { name: 'rice', kcal: 250, proteinG: 5 },
      ],
      'photo',
    );

    expect(runAsync).toHaveBeenCalledTimes(1);
    expect(runAsync.mock.calls[0][0]).toContain('VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)');
    expect(runAsync.mock.calls[0][1]).toEqual([
      'food-1',
      'local',
      '2026-07-09',
      'chicken',
      300,
      45,
      'photo',
      '2026-07-09T15:30:00.000Z',
      'food-2',
      'local',
      '2026-07-09',
      'rice',
      250,
      5,
      'photo',
      '2026-07-09T15:30:00.000Z',
    ]);
    expect(batch).toEqual({
      ids: ['food-1', 'food-2'],
      items: [
        { name: ' chicken ', kcal: 300, proteinG: 45 },
        { name: 'rice', kcal: 250, proteinG: 5 },
      ],
      source: 'photo',
      loggedAt: '2026-07-09T15:30:00.000Z',
      date: '2026-07-09',
      userId: 'local',
    });
  });

  it('propagates a database write failure', async () => {
    const writeError = new Error('disk full');
    const runAsync = jest.fn().mockRejectedValue(writeError);
    const db = { runAsync } as unknown as SQLiteDatabase;

    await expect(addFoodItems(db, [{ name: 'rice', kcal: 250, proteinG: 5 }], 'text')).rejects.toBe(writeError);
  });

  it('returns every row sharing the latest logged_at as one meal batch', async () => {
    const getAllAsync = jest.fn().mockResolvedValue([
      {
        id: 'food-1',
        date: '2026-07-08',
        name: 'chicken',
        kcal: 300,
        protein_g: 45,
        source: 'text',
        logged_at: '2026-07-08T18:00:00.000Z',
      },
      {
        id: 'food-2',
        date: '2026-07-08',
        name: 'rice',
        kcal: 250,
        protein_g: 5,
        source: 'text',
        logged_at: '2026-07-08T18:00:00.000Z',
      },
    ]);
    const db = { getAllAsync } as unknown as SQLiteDatabase;

    await expect(getLatestFoodBatch(db)).resolves.toEqual({
      ids: ['food-1', 'food-2'],
      items: [
        { name: 'chicken', kcal: 300, proteinG: 45 },
        { name: 'rice', kcal: 250, proteinG: 5 },
      ],
      source: 'text',
      loggedAt: '2026-07-08T18:00:00.000Z',
      date: '2026-07-08',
      userId: 'local',
    });
    expect(getAllAsync).toHaveBeenCalledWith(expect.stringContaining('SELECT MAX(logged_at)'), ['local', 'local']);
  });

  it('atomically deletes exact ids and resets protein in the original date scope', async () => {
    const txRunAsync = jest
      .fn()
      .mockResolvedValueOnce({ changes: 2 })
      .mockResolvedValueOnce({ changes: 1 });
    const tx = {
      runAsync: txRunAsync,
      getFirstAsync: jest.fn().mockResolvedValue({ protein_g: 20 }),
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (task: (value: typeof tx) => Promise<void>) => task(tx)),
    } as unknown as SQLiteDatabase;

    await expect(
      undoFoodBatch(
        db,
        { ids: ['food-1', 'food-2'], userId: 'local', date: '2026-07-08' },
        { resetProteinIfBelowG: 120 },
      ),
    ).resolves.toEqual({ proteinReset: true });

    expect(txRunAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('DELETE FROM food_log'),
      ['local', 'food-1', 'food-2'],
    );
    expect(tx.getFirstAsync).toHaveBeenCalledWith(expect.stringContaining('SUM(protein_g)'), [
      'local',
      '2026-07-08',
    ]);
    expect(txRunAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE discipline'),
      ['2026-07-09T15:30:00.000Z', 'local', '2026-07-08'],
    );
  });
});
