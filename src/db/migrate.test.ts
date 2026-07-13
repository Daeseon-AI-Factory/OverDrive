import type { SQLiteDatabase } from 'expo-sqlite';
import { migrateDbIfNeeded } from './migrate';
import { DATABASE_VERSION, MIGRATION_006 } from './schema';
import { seedExercises } from './seed';

jest.mock('./seed', () => ({ seedExercises: jest.fn().mockResolvedValue(undefined) }));

describe('migrateDbIfNeeded body-composition migration', () => {
  it('bumps an existing v5 database and creates the additive table', async () => {
    const db = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      getFirstAsync: jest.fn().mockResolvedValue({ user_version: 5 }),
      runAsync: jest.fn(),
    } as unknown as SQLiteDatabase;

    await migrateDbIfNeeded(db);

    expect(DATABASE_VERSION).toBe(6);
    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA user_version = 6;');
    expect(db.execAsync).toHaveBeenCalledWith(MIGRATION_006);
    expect(seedExercises).toHaveBeenCalledWith(db);
  });

  it('self-heals a v6 database whose additive table is missing', async () => {
    const db = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      getFirstAsync: jest.fn().mockResolvedValue({ user_version: 6 }),
      runAsync: jest.fn(),
    } as unknown as SQLiteDatabase;

    await migrateDbIfNeeded(db);

    expect(db.execAsync).toHaveBeenCalledWith(MIGRATION_006);
  });
});
