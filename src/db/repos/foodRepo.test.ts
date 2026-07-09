import type { SQLiteDatabase } from 'expo-sqlite';
import { addFoodItems, getLatestFoodBatch } from './foodRepo';

jest.mock('../uuid', () => ({ newUuid: jest.fn(() => 'food-id') }));
jest.mock('../../lib/date', () => ({
  nowIso: jest.fn(() => '2026-07-09T15:30:00.000Z'),
  todayLocal: jest.fn(() => '2026-07-09'),
}));

describe('foodRepo meal batches', () => {
  it('writes every item atomically in one statement with one batch timestamp', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const db = { runAsync } as unknown as SQLiteDatabase;

    await addFoodItems(
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
      'food-id',
      'local',
      '2026-07-09',
      'chicken',
      300,
      45,
      'photo',
      '2026-07-09T15:30:00.000Z',
      'food-id',
      'local',
      '2026-07-09',
      'rice',
      250,
      5,
      'photo',
      '2026-07-09T15:30:00.000Z',
    ]);
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
        name: 'chicken',
        kcal: 300,
        protein_g: 45,
        source: 'text',
        logged_at: '2026-07-08T18:00:00.000Z',
      },
      {
        name: 'rice',
        kcal: 250,
        protein_g: 5,
        source: 'text',
        logged_at: '2026-07-08T18:00:00.000Z',
      },
    ]);
    const db = { getAllAsync } as unknown as SQLiteDatabase;

    await expect(getLatestFoodBatch(db)).resolves.toEqual({
      items: [
        { name: 'chicken', kcal: 300, proteinG: 45 },
        { name: 'rice', kcal: 250, proteinG: 5 },
      ],
      source: 'text',
      loggedAt: '2026-07-08T18:00:00.000Z',
    });
    expect(getAllAsync).toHaveBeenCalledWith(expect.stringContaining('SELECT MAX(logged_at)'), ['local', 'local']);
  });
});
