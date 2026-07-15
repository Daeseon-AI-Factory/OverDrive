import type { SQLiteDatabase } from 'expo-sqlite';
import { expectedCatalogEtag } from './cache';
import { refreshExerciseCatalog } from './refresh';
import { catalogFixture } from './testFixture';
import { sha256Hex } from './validation';

const mockGetActiveCatalogEtag = jest.fn();
const mockActivateCatalogSnapshot = jest.fn();

jest.mock('./cache', () => {
  const actual = jest.requireActual('./cache');
  return {
    ...actual,
    getActiveCatalogEtag: (...args: unknown[]) => mockGetActiveCatalogEtag(...args),
    activateCatalogSnapshot: (...args: unknown[]) => mockActivateCatalogSnapshot(...args),
  };
});

jest.mock('expo-crypto', () => {
  const { createHash: hash } = jest.requireActual('crypto') as {
    createHash: (algorithm: string) => {
      update: (data: Uint8Array) => { digest: () => { buffer: ArrayBuffer; byteOffset: number; byteLength: number } };
    };
  };
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digest: async (_algorithm: string, data: ArrayBuffer) => {
      const value = hash('sha256').update(new Uint8Array(data)).digest();
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    },
    randomUUID: () => '00000000-0000-4000-8000-000000000001',
  };
});

const db = {} as SQLiteDatabase;

describe('catalog refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetActiveCatalogEtag.mockResolvedValue(null);
    mockActivateCatalogSnapshot.mockResolvedValue(undefined);
  });

  it('sends the active ETag and performs no activation on 304', async () => {
    mockGetActiveCatalogEtag.mockResolvedValue('"catalog-v1-1.0.0-old"');
    const fetcher = jest.fn().mockResolvedValue(response(304));

    await expect(refreshExerciseCatalog(db, {
      endpoint: 'https://catalog.example/catalog/v1',
      fetcher: fetcher as unknown as typeof fetch,
    })).resolves.toEqual({ status: 'not_modified' });

    expect(fetcher).toHaveBeenCalledWith('https://catalog.example/catalog/v1', expect.objectContaining({
      headers: expect.objectContaining({ 'If-None-Match': '"catalog-v1-1.0.0-old"' }),
    }));
    expect(mockActivateCatalogSnapshot).not.toHaveBeenCalled();
  });

  it('rejects bad checksums and leaves the active cache untouched', async () => {
    const raw = new TextEncoder().encode(JSON.stringify(catalogFixture()));
    const fetcher = jest.fn().mockResolvedValue(response(200, raw, {
      'content-type': 'application/json; charset=utf-8',
      'x-catalog-checksum': `sha256:${'0'.repeat(64)}`,
      'x-catalog-version': '1.0.0',
      etag: '"catalog-v1-1.0.0-0000000000000000"',
    }));

    const result = await refreshExerciseCatalog(db, {
      endpoint: 'https://catalog.example/catalog/v1',
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(result.status).toBe('failed');
    expect(mockActivateCatalogSnapshot).not.toHaveBeenCalled();
  });

  it('fails closed before reading a 200 body without a valid bounded catalog byte count', async () => {
    const raw = new TextEncoder().encode(JSON.stringify(catalogFixture()));
    const arrayBuffer = jest.fn(async () => raw.buffer);
    const fetcher = jest.fn().mockResolvedValue({
      ...response(200, raw, {
        'content-type': 'application/json; charset=utf-8',
        'x-catalog-bytes': '',
      }),
      arrayBuffer,
    });
    const result = await refreshExerciseCatalog(db, {
      endpoint: 'https://catalog.example/catalog/v1',
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(result).toEqual({ status: 'failed', error: 'missing or invalid catalog byte count' });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects a body whose exact bytes do not match the catalog byte count', async () => {
    const raw = new TextEncoder().encode(JSON.stringify(catalogFixture()));
    const fetcher = jest.fn().mockResolvedValue(response(200, raw, {
      'content-type': 'application/json; charset=utf-8',
      'x-catalog-bytes': String(raw.byteLength - 1),
      'content-length': String(raw.byteLength - 1),
    }));
    const result = await refreshExerciseCatalog(db, {
      endpoint: 'https://catalog.example/catalog/v1',
      fetcher: fetcher as unknown as typeof fetch,
    });
    expect(result).toEqual({ status: 'failed', error: 'catalog byte count mismatch' });
    expect(mockActivateCatalogSnapshot).not.toHaveBeenCalled();
  });

  it('validates headers/raw bytes before one atomic activation', async () => {
    const raw = new TextEncoder().encode(JSON.stringify(catalogFixture()));
    const checksumHex = await sha256Hex(raw);
    const etag = expectedCatalogEtag('1.0.0', checksumHex);
    const fetcher = jest.fn().mockResolvedValue(response(200, raw, {
      'content-type': 'application/json; charset=utf-8',
      'x-catalog-checksum': `sha256:${checksumHex}`,
      'x-catalog-version': '1.0.0',
      etag,
    }));

    await expect(refreshExerciseCatalog(db, {
      endpoint: 'https://catalog.example/catalog/v1',
      fetcher: fetcher as unknown as typeof fetch,
    })).resolves.toEqual({ status: 'activated' });
    expect(mockActivateCatalogSnapshot).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ checksumHex }),
      { etag, source: 'remote' },
    );
  });

  it('accepts a Cloudflare weak ETag and missing transport Content-Length while storing the canonical ETag', async () => {
    const raw = new TextEncoder().encode(JSON.stringify(catalogFixture()));
    const checksumHex = await sha256Hex(raw);
    const etag = expectedCatalogEtag('1.0.0', checksumHex);
    const fetcher = jest.fn().mockResolvedValue(response(200, raw, {
      'content-type': 'application/json; charset=utf-8',
      'x-catalog-bytes': String(raw.byteLength),
      'x-catalog-checksum': `sha256:${checksumHex}`,
      'x-catalog-version': '1.0.0',
      etag: `W/${etag}`,
    }));

    await expect(refreshExerciseCatalog(db, {
      endpoint: 'https://catalog.example/catalog/v1',
      fetcher: fetcher as unknown as typeof fetch,
    })).resolves.toEqual({ status: 'activated' });
    expect(mockActivateCatalogSnapshot).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ checksumHex }),
      { etag, source: 'remote' },
    );
  });

  it('converts network failure into a non-throwing failed result without cache writes', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('offline'));
    await expect(refreshExerciseCatalog(db, {
      endpoint: 'https://catalog.example/catalog/v1',
      fetcher: fetcher as unknown as typeof fetch,
    })).resolves.toEqual({ status: 'failed', error: 'offline' });
    expect(mockActivateCatalogSnapshot).not.toHaveBeenCalled();
  });

  it('aborts a hung request at the bounded refresh timeout', async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const refresh = refreshExerciseCatalog(db, {
      endpoint: 'https://catalog.example/catalog/v1',
      fetcher: fetcher as unknown as typeof fetch,
      timeoutMs: 50,
    });
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(51);
    await expect(refresh).resolves.toEqual({ status: 'failed', error: 'aborted' });
    expect(mockActivateCatalogSnapshot).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});

function response(status: number, body = new Uint8Array(), headerValues: Record<string, string> = {}) {
  const headers = new Map(Object.entries(headerValues).map(([key, value]) => [key.toLowerCase(), value]));
  if (status === 200 && !headers.has('x-catalog-bytes')) headers.set('x-catalog-bytes', String(body.byteLength));
  return {
    status,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
  };
}
