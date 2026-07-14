import type { SQLiteDatabase } from 'expo-sqlite';
import {
  addFoodItems,
  getLatestFoodBatch,
  getRecentFoodBatches,
  undoFoodBatch,
  updateManualFoodItem,
} from './foodRepo';

const mockNewUuid = jest.fn();
jest.mock('../uuid', () => ({ newUuid: () => mockNewUuid() }));
jest.mock('../../lib/date', () => ({
  nowIso: jest.fn(() => '2026-07-09T15:30:00.000Z'),
  todayLocal: jest.fn(() => '2026-07-09'),
}));

describe('foodRepo meal batches', () => {
  beforeEach(() => {
    mockNewUuid.mockReset();
    mockNewUuid.mockReturnValueOnce('batch-1').mockReturnValueOnce('food-1').mockReturnValueOnce('food-2');
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
    expect(runAsync.mock.calls[0][0]).toContain(
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    expect(runAsync.mock.calls[0][1]).toEqual([
      'food-1',
      'batch-1',
      'local',
      '2026-07-09',
      'chicken',
      300,
      45,
      'photo',
      '2026-07-09T15:30:00.000Z',
      'food-2',
      'batch-1',
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
      batchId: 'batch-1',
      items: [
        { name: 'chicken', kcal: 300, proteinG: 45 },
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
        batch_id: 'batch-old',
        date: '2026-07-08',
        name: 'chicken',
        kcal: 300,
        protein_g: 45,
        source: 'text',
        logged_at: '2026-07-08T18:00:00.000Z',
      },
      {
        id: 'food-2',
        batch_id: 'batch-old',
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
      batchId: 'batch-old',
      items: [
        { name: 'chicken', kcal: 300, proteinG: 45 },
        { name: 'rice', kcal: 250, proteinG: 5 },
      ],
      source: 'text',
      loggedAt: '2026-07-08T18:00:00.000Z',
      date: '2026-07-08',
      userId: 'local',
    });
    expect(getAllAsync).toHaveBeenCalledWith(expect.stringContaining('ORDER BY logged_at DESC'), ['local', 'local']);
  });

  it('returns distinct recent batches in query order for one-tap local repeat', async () => {
    const getAllAsync = jest.fn().mockResolvedValue([
      {
        id: 'food-3',
        batch_id: 'batch-3',
        date: '2026-07-09',
        name: 'yogurt',
        kcal: 180,
        protein_g: 17,
        source: 'manual',
        logged_at: '2026-07-09T12:00:00.000Z',
      },
      {
        id: 'food-2',
        batch_id: 'batch-2',
        date: '2026-07-08',
        name: 'chicken',
        kcal: 300,
        protein_g: 45,
        source: 'photo',
        logged_at: '2026-07-08T18:00:00.000Z',
      },
      {
        id: 'food-1',
        batch_id: 'batch-2',
        date: '2026-07-08',
        name: 'rice',
        kcal: 250,
        protein_g: 5,
        source: 'photo',
        logged_at: '2026-07-08T18:00:00.000Z',
      },
    ]);
    const db = { getAllAsync } as unknown as SQLiteDatabase;

    const recent = await getRecentFoodBatches(db, 3);

    expect(recent.map((batch) => batch.batchId)).toEqual(['batch-3', 'batch-2']);
    expect(recent[1].items).toEqual([
      { name: 'chicken', kcal: 300, proteinG: 45 },
      { name: 'rice', kcal: 250, proteinG: 5 },
    ]);
    expect(getAllAsync).toHaveBeenCalledWith(expect.stringContaining('GROUP BY batch_id'), ['local', 12, 'local']);
  });

  it('edits only the exact one-row manual batch', async () => {
    const runAsync = jest.fn().mockResolvedValue({ changes: 1 });
    const db = { runAsync } as unknown as SQLiteDatabase;
    const original = {
      ids: ['food-1'],
      batchId: 'batch-1',
      items: [{ name: 'rice', kcal: 250, proteinG: 5 }],
      source: 'manual' as const,
      loggedAt: '2026-07-08T18:00:00.000Z',
      date: '2026-07-08',
      userId: 'local',
    };

    await expect(
      updateManualFoodItem(db, original, { name: ' chicken bowl ', kcal: 550, proteinG: 50 }),
    ).resolves.toEqual({
      ...original,
      items: [{ name: 'chicken bowl', kcal: 550, proteinG: 50 }],
      loggedAt: '2026-07-09T15:30:00.000Z',
    });
    expect(runAsync).toHaveBeenCalledWith(expect.stringContaining("source = 'manual'"), [
      'chicken bowl',
      550,
      50,
      '2026-07-09T15:30:00.000Z',
      'food-1',
      'batch-1',
      'local',
    ]);
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
