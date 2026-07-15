import type { SQLiteDatabase } from 'expo-sqlite';
import { EXERCISE_SEED } from '@/db/seed';
import {
  activateCatalogSnapshot,
  expectedCatalogEtag,
  getActiveCatalogEtag,
  readActiveCatalog,
} from './cache';
import { catalogFixture } from './testFixture';
import { sha256Hex, validateCatalogBytes } from './validation';

jest.mock('expo-crypto', () => {
  const { createHash } = jest.requireActual('crypto') as {
    createHash: (algorithm: string) => {
      update: (data: Uint8Array) => { digest: () => { buffer: ArrayBuffer; byteOffset: number; byteLength: number } };
    };
  };
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digest: async (_algorithm: string, data: ArrayBuffer) => {
      const hash = createHash('sha256').update(new Uint8Array(data)).digest();
      return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
    },
  };
});

describe('active normalized catalog integrity', () => {
  it('accepts raw BLOB bytes only when every normalized child matches', async () => {
    const { db } = await activeDb();
    await expect(readActiveCatalog(db)).resolves.toMatchObject({
      views: expect.arrayContaining([expect.objectContaining({
        exercise: expect.objectContaining({ id: 'barbell_bench_press' }),
        catalog: expect.objectContaining({ id: 'barbell_bench_press' }),
      })]),
    });
  });

  it('rejects a snapshot whose normalized alias children are incomplete', async () => {
    const { db, children } = await activeDb();
    children.aliases.pop();
    await expect(readActiveCatalog(db)).resolves.toBeNull();
    await expect(getActiveCatalogEtag(db)).resolves.toBeNull();
  });

  it('rejects non-BLOB payload values even if metadata claims the right length', async () => {
    const { db, snapshotRow } = await activeDb();
    (snapshotRow as { payload_blob: unknown }).payload_blob = '{}';
    await expect(readActiveCatalog(db)).resolves.toBeNull();
  });

  it('rejects normalized child order gaps instead of sorting them away', async () => {
    const { db, children } = await activeDb();
    children.aliases[0].alias_order = 1;
    await expect(readActiveCatalog(db)).resolves.toBeNull();
  });

  it('repairs a corrupt same-version row only from a byte-verified bundle transaction', async () => {
    const base = await activeDb();
    const checksumHex = await sha256Hex(base.raw);
    const validated = await validateCatalogBytes(base.raw, `sha256:${checksumHex}`);
    const corruptRow = {
      ...base.snapshotRow,
      checksum_hex: '0'.repeat(64),
      payload_bytes: 2,
      payload_blob: new Uint8Array([0x7b, 0x7d]),
      etag: '"catalog-v1-1.0.0-corrupt"',
    };
    let activeVersion: string | null = '1.0.0';
    const runAsync = jest.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes('DELETE FROM catalog_cache_channel')) activeVersion = null;
      if (sql.includes("VALUES ('active', ?)")) activeVersion = String(params?.[0]);
      return { changes: 1, lastInsertRowId: 0 };
    });
    const tx = {
      getFirstAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM catalog_snapshot_cache')) return corruptRow;
        if (sql.includes('FROM catalog_exercise_bridge WHERE catalog_id')) {
          const id = String(params?.[0]);
          return { catalog_id: id, exercise_id: id, is_frozen: 1 };
        }
        if (sql.includes("slot = 'active'")) return activeVersion ? { catalog_version: activeVersion } : null;
        throw new Error(`unexpected first query: ${sql}`);
      }),
      getAllAsync: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql === 'SELECT catalog_version FROM catalog_snapshot_cache') return [{ catalog_version: '1.0.0' }];
        if (sql === 'SELECT slot, catalog_version FROM catalog_cache_channel') {
          return activeVersion ? [{ slot: 'active', catalog_version: activeVersion }] : [];
        }
        return (base.db.getAllAsync as jest.Mock)(sql, params);
      }),
      runAsync,
    };
    const db = {
      withExclusiveTransactionAsync: jest.fn(async (work: (value: typeof tx) => Promise<void>) => work(tx)),
    } as unknown as SQLiteDatabase;

    await expect(activateCatalogSnapshot(db, validated, {
      etag: expectedCatalogEtag('1.0.0', checksumHex),
      source: 'bundled',
      repairCorruptSameVersion: true,
      now: () => '2026-07-14T00:00:00Z',
    })).resolves.toBeUndefined();
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM catalog_cache_channel'),
      ['1.0.0'],
    );
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM catalog_snapshot_cache'),
      ['1.0.0'],
    );
    expect(runAsync.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO catalog_exercise_cache')))
      .toHaveLength(1);
    expect(runAsync.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO catalog_exercise_localization')))
      .toHaveLength(1);
    expect(runAsync.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO catalog_exercise_alias')))
      .toHaveLength(1);
    expect(activeVersion).toBe('1.0.0');
  });
});

async function activeDb() {
  const snapshot = catalogFixture();
  const raw = new TextEncoder().encode(JSON.stringify(snapshot));
  const checksumHex = await sha256Hex(raw);
  const snapshotRow = {
    catalog_version: snapshot.catalogVersion,
    schema_version: snapshot.schemaVersion,
    effective_at: snapshot.effectiveAt,
    etag: expectedCatalogEtag(snapshot.catalogVersion, checksumHex),
    checksum_hex: checksumHex,
    payload_bytes: raw.byteLength,
    payload_blob: raw,
    source: 'remote',
    validated_at: snapshot.effectiveAt,
  };
  const children = {
    cache: snapshot.exercises.map((exercise) => ({
      catalog_id: exercise.id,
      bridge_exercise_id: exercise.id,
      record_revision: exercise.recordRevision,
      status: exercise.status,
      effective_from: exercise.effectiveFrom,
      effective_to: exercise.effectiveTo,
      replacement_id: exercise.replacementId,
      display_order: exercise.displayOrder,
      exercise_type: exercise.exerciseType,
      is_bodyweight: exercise.isBodyweight ? 1 : 0,
      movement_pattern: exercise.movementPattern,
      difficulty: exercise.difficulty,
      default_sets: exercise.defaultPrescription.sets,
      tracking_mode: exercise.defaultPrescription.trackingMode,
      counting_convention: exercise.defaultPrescription.countingConvention,
      target_unit: exercise.defaultPrescription.target?.unit ?? null,
      target_low: exercise.defaultPrescription.target?.low ?? null,
      target_high: exercise.defaultPrescription.target?.high ?? null,
      provenance_json: JSON.stringify(exercise.provenance),
    })),
    localizations: snapshot.exercises.flatMap((exercise) => Object.entries(exercise.localizations).map(([locale, value]) => ({
      catalog_id: exercise.id,
      locale,
      display_name: value.displayName,
    }))),
    aliases: snapshot.exercises.flatMap((exercise) => Object.entries(exercise.localizations).flatMap(([locale, value]) =>
      value.aliases.map((alias, alias_order) => ({ catalog_id: exercise.id, locale, alias_order, alias })))),
    equipment: snapshot.exercises.flatMap((exercise) => (['required', 'optional'] as const).flatMap((role) =>
      exercise.equipment[role].map((equipment_id, item_order) => ({ catalog_id: exercise.id, role, item_order, equipment_id })))),
    regions: snapshot.exercises.flatMap((exercise) => (['primary', 'secondary'] as const).flatMap((role) =>
      (role === 'primary' ? exercise.primaryBodyRegions : exercise.secondaryBodyRegions)
        .map((region_id, item_order) => ({ catalog_id: exercise.id, role, item_order, region_id })))),
    exercises: EXERCISE_SEED.map((exercise) => ({
      ...exercise,
      is_bodyweight: exercise.is_bodyweight ? 1 : 0,
      created_at: snapshot.effectiveAt,
    })),
    bridges: snapshot.exercises.map((exercise) => ({
      catalog_id: exercise.id,
      exercise_id: exercise.id,
      is_frozen: 1,
    })),
  };
  const getAllAsync = jest.fn((sql: string) => {
    if (sql.includes('FROM catalog_exercise_cache')) return Promise.resolve(children.cache);
    if (sql.includes('FROM catalog_exercise_localization')) return Promise.resolve(children.localizations);
    if (sql.includes('FROM catalog_exercise_alias')) return Promise.resolve(children.aliases);
    if (sql.includes('FROM catalog_exercise_equipment')) return Promise.resolve(children.equipment);
    if (sql.includes('FROM catalog_exercise_region')) return Promise.resolve(children.regions);
    if (sql.includes('FROM catalog_exercise_bridge')) return Promise.resolve(children.bridges);
    if (sql.includes('FROM exercise')) return Promise.resolve(children.exercises);
    throw new Error(`unexpected query: ${sql}`);
  });
  const db = {
    getFirstAsync: jest.fn().mockResolvedValue(snapshotRow),
    getAllAsync,
  } as unknown as SQLiteDatabase;
  return { db, snapshot, raw, snapshotRow, children };
}
