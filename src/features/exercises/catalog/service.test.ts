import type { SQLiteDatabase } from 'expo-sqlite';
import type { ExerciseRow } from '@/db/types';
import {
  BUNDLED_CATALOG_CHECKSUM,
  BUNDLED_CATALOG_RAW,
} from '../../../../assets/catalog/exercise-catalog-v1.generated';
import { readCatalogViews } from './service';
import { catalogFixture } from './testFixture';
import { sha256Hex } from './validation';

const mockReadActiveCatalog = jest.fn();
const mockReadPreviousCatalog = jest.fn();
const mockRollbackToPreviousCatalog = jest.fn();
const mockActivateCatalogSnapshot = jest.fn();

jest.mock('./cache', () => ({
  readActiveCatalog: (...args: unknown[]) => mockReadActiveCatalog(...args),
  readPreviousCatalog: (...args: unknown[]) => mockReadPreviousCatalog(...args),
  rollbackToPreviousCatalog: (...args: unknown[]) => mockRollbackToPreviousCatalog(...args),
  activateCatalogSnapshot: (...args: unknown[]) => mockActivateCatalogSnapshot(...args),
  expectedCatalogEtag: (version: string, checksum: string) =>
    `"catalog-v1-${version}-${checksum.slice(0, 16)}"`,
}));

jest.mock('expo-crypto', () => {
  const { createHash: hash } = jest.requireActual('crypto') as {
    createHash: (algorithm: string) => {
      update: (data: Uint8Array) => { digest: () => { buffer: ArrayBuffer; byteOffset: number; byteLength: number } };
    };
  };
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digest: async (_algorithm: string, data: Uint8Array) => {
      if (!(data instanceof Uint8Array)) throw new Error('native digest requires a TypedArray');
      const value = hash('sha256').update(data).digest();
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    },
  };
});

const seedRow: ExerciseRow = {
  id: 'barbell_bench_press',
  name: '바벨 벤치프레스',
  muscle_group: 'chest',
  type: 'strength',
  default_sets: 3,
  rep_low: 5,
  rep_high: 8,
  is_bodyweight: 0,
  created_at: '2026-07-14T00:00:00.000Z',
};

describe('catalog local fallback order', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActivateCatalogSnapshot.mockResolvedValue(undefined);
    mockReadPreviousCatalog.mockResolvedValue(null);
    mockRollbackToPreviousCatalog.mockResolvedValue(true);
  });

  it('promotes and returns a verified previous snapshot before consulting the bundle', async () => {
    const views = [{ exercise: seedRow, catalog: null }];
    mockReadActiveCatalog.mockResolvedValue(null);
    mockReadPreviousCatalog.mockResolvedValue({
      validated: { snapshot: { catalogVersion: '1.0.1' } },
      views,
    });
    const loader = jest.fn();

    await expect(readCatalogViews({} as SQLiteDatabase, loader)).resolves.toEqual({ source: 'previous', views });
    expect(mockRollbackToPreviousCatalog).toHaveBeenCalledWith(expect.anything(), '1.0.1');
    expect(loader).not.toHaveBeenCalled();
  });

  it('returns a valid active cache without touching the bundle', async () => {
    const views = [{ exercise: seedRow, catalog: null }];
    mockReadActiveCatalog.mockResolvedValue({ views });
    const loader = jest.fn();

    await expect(readCatalogViews({} as SQLiteDatabase, loader)).resolves.toEqual({ source: 'active', views });
    expect(loader).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent Boot/picker local warm reads for the same database', async () => {
    let resolve!: (value: unknown) => void;
    mockReadActiveCatalog.mockReturnValue(new Promise((done) => { resolve = done; }));
    const db = {} as SQLiteDatabase;
    const first = readCatalogViews(db, jest.fn());
    const second = readCatalogViews(db, jest.fn());
    expect(second).toBe(first);
    resolve({ views: [{ exercise: seedRow, catalog: null }] });
    await expect(first).resolves.toMatchObject({ source: 'active' });
    expect(mockReadActiveCatalog).toHaveBeenCalledTimes(1);
  });

  it('validates and activates the bundle when active cache is unavailable', async () => {
    const snapshot = catalogFixture();
    const raw = JSON.stringify(snapshot);
    const checksum = await sha256Hex(new TextEncoder().encode(raw));
    const views = [{ exercise: seedRow, catalog: snapshot.exercises[0] }];
    mockReadActiveCatalog.mockResolvedValueOnce(null).mockResolvedValueOnce({ views });

    await expect(readCatalogViews(
      {} as SQLiteDatabase,
      () => ({ BUNDLED_CATALOG_RAW: raw, BUNDLED_CATALOG_CHECKSUM: `sha256:${checksum}` }),
    )).resolves.toEqual({ source: 'bundled', views });
    expect(mockActivateCatalogSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ checksumHex: checksum }),
      {
        etag: `"catalog-v1-1.0.0-${checksum.slice(0, 16)}"`,
        source: 'bundled',
        repairCorruptSameVersion: true,
      },
    );
  });

  it('validates the exact generated 64-row release bundle before activation', async () => {
    const views = [{ exercise: seedRow, catalog: null }];
    mockReadActiveCatalog.mockResolvedValueOnce(null).mockResolvedValueOnce({ views });

    await expect(readCatalogViews(
      {} as SQLiteDatabase,
      () => ({ BUNDLED_CATALOG_RAW, BUNDLED_CATALOG_CHECKSUM }),
    )).resolves.toEqual({ source: 'bundled', views });

    expect(mockActivateCatalogSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        snapshot: expect.objectContaining({
          catalogVersion: '1.0.0',
          exercises: expect.arrayContaining([
            expect.objectContaining({ id: 'hex_bar_deadlift' }),
            expect.objectContaining({
              id: 'hammer_curl',
              defaultPrescription: expect.objectContaining({ countingConvention: 'total' }),
            }),
          ]),
        }),
      }),
      expect.objectContaining({ source: 'bundled' }),
    );
  });

  it('falls through corrupt active/bundle state to the existing seed rows', async () => {
    mockReadActiveCatalog.mockResolvedValue(null);
    const db = {
      getAllAsync: jest.fn().mockResolvedValue([seedRow]),
    } as unknown as SQLiteDatabase;

    await expect(readCatalogViews(db, () => ({
      BUNDLED_CATALOG_RAW: '{}',
      BUNDLED_CATALOG_CHECKSUM: `sha256:${'0'.repeat(64)}`,
    }))).resolves.toEqual({
      source: 'seed',
      views: [{ exercise: seedRow, catalog: null }],
    });
    expect(mockActivateCatalogSnapshot).not.toHaveBeenCalled();
  });

  it('never reinterprets opaque/retired bridge rows as catalog-null seed exercises', async () => {
    mockReadActiveCatalog.mockResolvedValue(null);
    const opaque = { ...seedRow, id: 'catalog_00000000000040008000000000000001', name: 'Stale canonical' };
    const db = {
      getAllAsync: jest
        .fn()
        .mockResolvedValueOnce([seedRow, opaque])
        .mockResolvedValueOnce([{ exercise_id: opaque.id }]),
    } as unknown as SQLiteDatabase;

    const result = await readCatalogViews(db, () => ({
      BUNDLED_CATALOG_RAW: '{}',
      BUNDLED_CATALOG_CHECKSUM: `sha256:${'0'.repeat(64)}`,
    }));
    expect(result).toEqual({ source: 'seed', views: [{ exercise: seedRow, catalog: null }] });
  });

  it('retains frozen and ad-hoc rows while excluding opaque bridges in the final fallback', async () => {
    mockReadActiveCatalog.mockResolvedValue(null);
    const opaque = { ...seedRow, id: 'catalog_00000000000040008000000000000001', name: 'Stale canonical' };
    const adHoc = { ...seedRow, id: 'farmer_walk', name: 'Farmer Walk' };
    const db = {
      getAllAsync: jest
        .fn()
        .mockResolvedValueOnce([seedRow, opaque, adHoc])
        .mockResolvedValueOnce([
          { exercise_id: seedRow.id },
          { exercise_id: opaque.id },
        ]),
    } as unknown as SQLiteDatabase;

    const result = await readCatalogViews(db, () => ({
      BUNDLED_CATALOG_RAW: '{}',
      BUNDLED_CATALOG_CHECKSUM: `sha256:${'0'.repeat(64)}`,
    }));
    expect(result).toEqual({
      source: 'seed',
      views: [
        { exercise: seedRow, catalog: null },
        { exercise: adHoc, catalog: null },
      ],
    });
  });
});
