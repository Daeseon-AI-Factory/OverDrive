import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from './migrate';
import { DATABASE_VERSION, MIGRATION_006, MIGRATION_007 } from './schema';
import { seedExercises } from './seed';

jest.mock('./seed', () => ({ seedExercises: jest.fn().mockResolvedValue(undefined) }));

describe('migrateDbIfNeeded local schema migrations', () => {
  it('bumps an existing v6 database and atomically widens food_log for manual batches', async () => {
    const db = migrationDb(6, "CREATE TABLE food_log (source CHECK (source IN ('text','voice','photo')))");

    await migrateDbIfNeeded(db);

    expect(DATABASE_VERSION).toBe(7);
    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 7;');
    expect(db.execAsync).toHaveBeenCalledWith(MIGRATION_006);
    expect(db.execAsync).toHaveBeenCalledWith(MIGRATION_007);
    expect(seedExercises).toHaveBeenCalledWith(db);
  });

  it('self-heals a v7 database whose food table still has the old constraint', async () => {
    const db = migrationDb(7, "CREATE TABLE food_log (source CHECK (source IN ('text','voice','photo')))");

    await migrateDbIfNeeded(db);

    expect(db.execAsync).toHaveBeenCalledWith(MIGRATION_007);
  });

  it('does not rebuild a food table that already has batch ids and manual source', async () => {
    const db = migrationDb(
      7,
      "CREATE TABLE food_log (batch_id TEXT, source CHECK (source IN ('manual','text','voice','photo')))",
    );

    await migrateDbIfNeeded(db);

    expect(db.execAsync).not.toHaveBeenCalledWith(MIGRATION_007);
  });
});

function migrationDb(userVersion: number, foodSchema: string): SQLiteDatabase {
  const raw = {
    execAsync: jest.fn().mockResolvedValue(undefined),
    getFirstAsync: jest
      .fn()
      .mockResolvedValueOnce({ user_version: userVersion })
      .mockResolvedValueOnce({ sql: foodSchema }),
    runAsync: jest.fn(),
    withExclusiveTransactionAsync: jest.fn(),
  };
  raw.withExclusiveTransactionAsync.mockImplementation(async (task: (tx: typeof raw) => Promise<void>) => task(raw));
  return raw as unknown as SQLiteDatabase;
}
