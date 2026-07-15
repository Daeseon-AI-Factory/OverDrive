import { EXERCISE_SEED } from '@/db/seed';
import compatibility from '../../../../docs/contracts/exercise-catalog-v1-compatibility.json';
import { boundedLevenshtein, normalizeCatalogSearch, typoDistanceLimit } from './normalization';
import { catalogFixture } from './testFixture';
import {
  CatalogValidationError,
  FROZEN_CATALOG_IDS,
  sha256Hex,
  validateCatalogBytes,
  validateCatalogSnapshot,
  validateGeneratedBundledCatalog,
} from './validation';

jest.mock('expo-crypto', () => {
  const { createHash } = jest.requireActual('crypto') as {
    createHash: (algorithm: string) => {
      update: (data: Uint8Array) => { digest: () => { buffer: ArrayBuffer; byteOffset: number; byteLength: number } };
    };
  };
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digest: async (_algorithm: string, data: Uint8Array) => {
      if (!(data instanceof Uint8Array)) throw new Error('native digest requires a TypedArray');
      const hash = createHash('sha256').update(data).digest();
      return hash.buffer.slice(hash.byteOffset, hash.byteOffset + hash.byteLength);
    },
    randomUUID: () => '00000000-0000-4000-8000-000000000001',
  };
});

describe('catalog validation', () => {
  it('hashes and validates the exact generated UTF-8 bytes without reserialization', async () => {
    const raw = JSON.stringify(catalogFixture());
    const bytes = new TextEncoder().encode(raw);
    const checksum = `sha256:${await sha256Hex(bytes)}`;

    await expect(validateGeneratedBundledCatalog({
      BUNDLED_CATALOG_RAW: raw,
      BUNDLED_CATALOG_CHECKSUM: checksum,
    })).resolves.toMatchObject({ checksumHex: checksum.slice('sha256:'.length) });
  });

  it('rejects a bad checksum before trusting the payload', async () => {
    const raw = new TextEncoder().encode(JSON.stringify(catalogFixture()));
    await expect(validateCatalogBytes(raw, `sha256:${'0'.repeat(64)}`)).rejects.toThrow(
      'raw response bytes do not match',
    );
  });

  it('rejects a checksum-valid but schema-invalid payload', async () => {
    const invalid = { ...catalogFixture(), searchNormalization: 'search-v2' };
    const raw = new TextEncoder().encode(JSON.stringify(invalid));
    const checksum = `sha256:${await sha256Hex(raw)}`;
    await expect(validateCatalogBytes(raw, checksum)).rejects.toBeInstanceOf(CatalogValidationError);
  });

  it.each([
    '2026-07-14',
    '2026-07-14T12:00:00',
    '2026-07-14T12:00:00-04:00',
    '2026-07-14T12:00:00.000Z',
    '2026-02-30T12:00:00Z',
    '2025-02-29T12:00:00Z',
    '2026-07-14T24:00:00Z',
  ])('rejects non-RFC3339 or calendar-invalid timestamp %s', (effectiveAt) => {
    expect(() => validateCatalogSnapshot(catalogFixture({ effectiveAt }))).toThrow('RFC 3339');
  });

  it('accepts a calendar-valid RFC3339 UTC-second timestamp', () => {
    expect(validateCatalogSnapshot(catalogFixture({ effectiveAt: '2026-07-14T12:00:00Z' })).effectiveAt)
      .toBe('2026-07-14T12:00:00Z');
  });

  it('freezes the original 32 at the exact index and displayOrder 1..32', () => {
    const snapshot = catalogFixture();
    snapshot.exercises[0] = { ...snapshot.exercises[0], displayOrder: 2 };
    expect(() => validateCatalogSnapshot(snapshot)).toThrow('frozen row barbell_bench_press must remain 1');

    const renamed = catalogFixture();
    renamed.exercises[0] = { ...renamed.exercises[0], id: 'renamed_bench' };
    expect(() => validateCatalogSnapshot(renamed)).toThrow('frozen row 1 must remain barbell_bench_press');
  });

  it('detects compatibility-registry drift against seed and validator identities', () => {
    const seedIds = EXERCISE_SEED.map((exercise) => exercise.id);
    expect(compatibility.contractVersion).toBe('1.0.0');
    expect(compatibility.canonicalIds).toEqual(seedIds);
    expect(FROZEN_CATALOG_IDS).toEqual(seedIds);
    expect(catalogFixture().exercises.map(({ id, displayOrder }) => [id, displayOrder])).toEqual(
      compatibility.canonicalIds.map((id, index) => [id, index + 1]),
    );
  });

  it.each(['display-alias', 'alias-alias'])('rejects cross-exercise normalized %s collisions', (kind) => {
    const snapshot = catalogFixture();
    const first = snapshot.exercises[0];
    const second = snapshot.exercises[1];
    snapshot.exercises[1] = {
      ...second,
      localizations: {
        ...second.localizations,
        en: {
          ...second.localizations.en,
          aliases: kind === 'display-alias'
            ? [first.localizations.en.displayName]
            : [first.localizations.en.aliases[0]],
        },
      },
    };

    expect(() => validateCatalogSnapshot(snapshot)).toThrow('collides with barbell_bench_press');
  });
});

describe('search-v1 primitives', () => {
  it.each([
    [' Bench-Press ', 'benchpress'],
    ['ＢＥＮＣＨ　１００', 'bench100'],
    ['벤치 프레스', '벤치프레스'],
    ['Zone 2', 'zone2'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeCatalogSearch(input)).toBe(expected);
  });

  it('uses Unicode-code-point Levenshtein and the frozen query thresholds', () => {
    expect(boundedLevenshtein('benc', 'bench', 1)).toBe(1);
    expect(boundedLevenshtein('benhc', 'bench', 1)).toBe(2);
    expect(boundedLevenshtein('benchprzs', 'benchpress', 2)).toBe(2);
    expect(typoDistanceLimit('rnu')).toBe(0);
    expect(typoDistanceLimit('benc')).toBe(1);
    expect(typoDistanceLimit('benchprzs')).toBe(2);
  });
});
