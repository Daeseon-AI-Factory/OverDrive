import {
  assertCatalogTransition,
  catalogExerciseCacheValues,
  chooseOpaqueBridgeId,
  expectedCatalogEtag,
  insertRowsInChunks,
  prunableCatalogVersions,
  rollbackToPreviousCatalog,
} from './cache';
import type { SQLiteDatabase } from 'expo-sqlite';
import { catalogFixture, exerciseFixture } from './testFixture';

describe('catalog cache safety helpers', () => {
  it('never uses a canonical or occupied local id for a future bridge', () => {
    const canonicalId = 'single_leg_romanian_deadlift';
    const collidingUuid = '00000000-0000-4000-8000-000000000001';
    const safeUuid = '00000000-0000-4000-8000-000000000002';
    const occupied = new Set([canonicalId, `catalog_${collidingUuid.replace(/-/g, '')}`]);
    const ids = [collidingUuid, safeUuid];

    expect(chooseOpaqueBridgeId(occupied, () => ids.shift()!)).toBe(
      `catalog_${safeUuid.replace(/-/g, '')}`,
    );
    expect(occupied.has(canonicalId)).toBe(true);
  });

  it('prunes only snapshots outside active and previous channel pointers', () => {
    expect(prunableCatalogVersions(
      ['1.0.0', '1.0.1', '1.0.2'],
      [
        { catalog_version: '1.0.2' },
        { catalog_version: '1.0.1' },
      ],
    )).toEqual(['1.0.0']);
  });

  it('derives the strong ETag from immutable version and checksum bytes', () => {
    expect(expectedCatalogEtag('1.2.3', '0123456789abcdef'.repeat(4))).toBe(
      '"catalog-v1-1.2.3-0123456789abcdef"',
    );
  });

  it('binds exactly 20 scalar cache columns without shifting isBodyweight into movement data', () => {
    const exercise = { ...exerciseFixture('future_press', 33), isBodyweight: true };
    const values = catalogExerciseCacheValues('1.0.0', exercise, 'catalog_00000000000040008000000000000001');
    expect(values).toHaveLength(20);
    expect(values.slice(9, 16)).toEqual([
      'strength',
      1,
      'horizontal_push',
      'beginner',
      3,
      'reps',
      'total',
    ]);
  });

  it('chunks multi-row catalog inserts at no more than 900 SQLite binds', async () => {
    const runAsync = jest.fn().mockResolvedValue({ changes: 1, lastInsertRowId: 0 });
    const db = { runAsync } as unknown as SQLiteDatabase;
    const rows = Array.from({ length: 46 }, (_, row) =>
      Array.from({ length: 20 }, (_, column) => row * 20 + column),
    );

    await insertRowsInChunks(db, 'INSERT INTO bounded_table (twenty_columns)', 20, rows);

    expect(runAsync).toHaveBeenCalledTimes(2);
    const bindCounts = runAsync.mock.calls.map(([, values]) => (values as unknown[]).length);
    expect(bindCounts).toEqual([900, 20]);
    for (const [sql, values] of runAsync.mock.calls as [string, unknown[]][]) {
      expect((sql.match(/\?/g) ?? [])).toHaveLength(values.length);
      expect(values.length).toBeLessThanOrEqual(900);
    }
  });

  it('atomically swaps a verified previous pointer with a corrupt active pointer', async () => {
    const tx = {
      getAllAsync: jest.fn().mockResolvedValue([
        { slot: 'active', catalog_version: '1.0.2' },
        { slot: 'previous', catalog_version: '1.0.1' },
      ]),
      runAsync: jest.fn().mockResolvedValue(undefined),
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (work: (value: typeof tx) => Promise<void>) => work(tx)),
    } as unknown as SQLiteDatabase;

    await expect(rollbackToPreviousCatalog(db, '1.0.1')).resolves.toBe(true);
    expect(tx.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("VALUES ('active', ?)"),
      ['1.0.1'],
    );
    expect(tx.runAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("slot = 'previous'"),
      ['1.0.2'],
    );
  });

  it('promotes a verified previous version even when the active pointer is missing', async () => {
    const tx = {
      getAllAsync: jest.fn().mockResolvedValue([
        { slot: 'previous', catalog_version: '1.0.1' },
      ]),
      runAsync: jest.fn().mockResolvedValue(undefined),
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (work: (value: typeof tx) => Promise<void>) => work(tx)),
    } as unknown as SQLiteDatabase;

    await expect(rollbackToPreviousCatalog(db, '1.0.1')).resolves.toBe(true);
    expect(tx.runAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("VALUES ('active', ?)"),
      ['1.0.1'],
    );
    expect(tx.runAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("slot = 'previous'"),
    );
  });

  it('requires recordRevision to increase for same-id semantic changes', () => {
    const active = catalogFixture();
    const next = catalogFixture({ catalogVersion: '1.0.1' });
    next.exercises[0] = {
      ...next.exercises[0],
      localizations: {
        ...next.exercises[0].localizations,
        en: { ...next.exercises[0].localizations.en, displayName: 'Changed Bench Name' },
      },
    };

    expect(() => assertCatalogTransition(active, next)).toThrow('without recordRevision increment');
    next.exercises[0] = { ...next.exercises[0], recordRevision: 2 };
    expect(() => assertCatalogTransition(active, next)).not.toThrow();
  });

  it('never changes historical set interpretation under the same stable id', () => {
    const active = catalogFixture();
    const next = catalogFixture({ catalogVersion: '1.0.1' });
    next.exercises[0] = {
      ...next.exercises[0],
      recordRevision: 2,
      defaultPrescription: {
        ...next.exercises[0].defaultPrescription,
        countingConvention: 'per_side',
      },
    };

    expect(() => assertCatalogTransition(active, next)).toThrow('historical interpretation');
    next.exercises[0] = {
      ...next.exercises[0],
      status: 'deprecated',
      replacementId: 'bench_per_side',
    };
    expect(() => assertCatalogTransition(active, next)).toThrow('historical interpretation');

    const correct = catalogFixture({ catalogVersion: '1.0.1' });
    correct.exercises[0] = {
      ...correct.exercises[0],
      recordRevision: 2,
      status: 'deprecated',
      replacementId: 'bench_per_side',
    };
    correct.exercises.push({
      ...exerciseFixture('bench_per_side', 33),
      defaultPrescription: {
        ...exerciseFixture('bench_per_side', 33).defaultPrescription,
        countingConvention: 'per_side',
      },
    });
    expect(() => assertCatalogTransition(active, correct)).not.toThrow();
  });

  it('rejects downgrade activation while exact cached previous rollback stays a separate path', () => {
    const active = catalogFixture({ catalogVersion: '1.0.2' });
    const older = catalogFixture({ catalogVersion: '1.0.1' });
    expect(() => assertCatalogTransition(active, older)).toThrow('not newer');
  });
});
