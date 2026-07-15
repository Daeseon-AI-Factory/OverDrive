import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from './migrate';
import { DATABASE_VERSION, MIGRATION_006, MIGRATION_007, MIGRATION_008 } from './schema';
import { seedExercises } from './seed';

jest.mock('./seed', () => ({ seedExercises: jest.fn().mockResolvedValue(undefined) }));

describe('migrateDbIfNeeded local schema migrations', () => {
  it('bumps an existing v6 database and atomically widens food_log for manual batches', async () => {
    const db = migrationDb(6, "CREATE TABLE food_log (source CHECK (source IN ('text','voice','photo')))");

    await migrateDbIfNeeded(db);

    expect(DATABASE_VERSION).toBe(8);
    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 8;');
    expect(db.execAsync).toHaveBeenCalledWith(MIGRATION_006);
    expect(db.execAsync).toHaveBeenCalledWith(MIGRATION_007);
    expect(db.execAsync).toHaveBeenCalledWith(MIGRATION_008);
    expect(seedExercises).toHaveBeenCalledWith(db);
  });

  it('gives the main SQLiteProvider connection a bounded wait for catalog activation writes', async () => {
    const db = migrationDb(
      8,
      "CREATE TABLE food_log (batch_id TEXT, source CHECK (source IN ('manual','text','voice','photo')))",
    );

    await migrateDbIfNeeded(db);

    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA busy_timeout = 5000;');
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
    expect(db.execAsync).toHaveBeenCalledWith(MIGRATION_008);
  });

  it('defines normalized catalog children and byte-shape constraints in v8', () => {
    expect(MIGRATION_008).toContain('CREATE TABLE IF NOT EXISTS catalog_exercise_localization');
    expect(MIGRATION_008).toContain('CREATE TABLE IF NOT EXISTS catalog_exercise_alias');
    expect(MIGRATION_008).toContain('CREATE TABLE IF NOT EXISTS catalog_exercise_equipment');
    expect(MIGRATION_008).toContain('CREATE TABLE IF NOT EXISTS catalog_exercise_region');
    expect(MIGRATION_008).toContain("typeof(payload_blob) = 'blob'");
    expect(MIGRATION_008).toContain('length(payload_blob) = payload_bytes');
    expect(MIGRATION_008).toContain('ON DELETE RESTRICT');
    expect(MIGRATION_008).toContain('FOREIGN KEY (catalog_id, bridge_exercise_id)');
  });

  it('creates a fresh schema and advances to v8 inside the exclusive migration transaction', async () => {
    const db = migrationDb(0, "CREATE TABLE food_log (source CHECK (source IN ('text','voice','photo')))");
    await migrateDbIfNeeded(db);

    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL;');
    expect(db.execAsync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS exercise'));
    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 8;');
    expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it('does not advance user_version when v8 DDL fails', async () => {
    const raw = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      getFirstAsync: jest
        .fn()
        .mockResolvedValueOnce({ user_version: 7 })
        .mockResolvedValueOnce({ sql: "CREATE TABLE food_log (batch_id TEXT, source CHECK (source IN ('manual','text')))" }),
      runAsync: jest.fn(),
      withExclusiveTransactionAsync: jest.fn(),
    };
    raw.withExclusiveTransactionAsync.mockImplementation(async (task: (tx: typeof raw) => Promise<void>) => {
      const tx = {
        ...raw,
        execAsync: jest.fn((sql: string) => sql === MIGRATION_008
          ? Promise.reject(new Error('v8 ddl failed'))
          : Promise.resolve(undefined)),
      };
      await task(tx);
      expect(tx.execAsync).not.toHaveBeenCalledWith('PRAGMA user_version = 8;');
    });

    await expect(migrateDbIfNeeded(raw as unknown as SQLiteDatabase)).rejects.toThrow('v8 ddl failed');
    expect(seedExercises).not.toHaveBeenCalledWith(raw);
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
