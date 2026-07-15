import type { SQLiteDatabase } from 'expo-sqlite';
import { activateCatalogSnapshot, expectedCatalogEtag, getActiveCatalogEtag } from './cache';
import { CATALOG_ENDPOINT } from './config';
import { MAX_CATALOG_BYTES, validateCatalogBytes } from './validation';

export type CatalogRefreshStatus = 'disabled' | 'not_modified' | 'activated' | 'failed';

export interface CatalogRefreshResult {
  status: CatalogRefreshStatus;
  error?: string;
}

export interface RefreshCatalogOptions {
  endpoint?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

const inFlight = new WeakMap<SQLiteDatabase, Promise<CatalogRefreshResult>>();

/** Deduplicated fire-and-forget entry point owned by boot after local catalog hydration. */
export function refreshExerciseCatalog(
  db: SQLiteDatabase,
  options: RefreshCatalogOptions = {},
): Promise<CatalogRefreshResult> {
  const running = inFlight.get(db);
  if (running) return running;
  const refresh = refreshOnce(db, options).finally(() => {
    if (inFlight.get(db) === refresh) inFlight.delete(db);
  });
  inFlight.set(db, refresh);
  return refresh;
}

async function refreshOnce(
  db: SQLiteDatabase,
  options: RefreshCatalogOptions,
): Promise<CatalogRefreshResult> {
  const endpoint = (options.endpoint ?? CATALOG_ENDPOINT).trim();
  if (!endpoint) return { status: 'disabled' };
  const fetcher = options.fetcher ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);

  try {
    const activeEtag = await getActiveCatalogEtag(db);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (activeEtag) headers['If-None-Match'] = activeEtag;
    const response = await fetcher(endpoint, { method: 'GET', headers, signal: controller.signal });
    if (response.status === 304) {
      return activeEtag ? { status: 'not_modified' } : { status: 'failed', error: '304 without active cache' };
    }
    if (response.status !== 200) return { status: 'failed', error: `HTTP ${response.status}` };

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/.test(contentType)) {
      return { status: 'failed', error: 'invalid content type' };
    }
    const contentLengthHeader = response.headers.get('content-length') ?? '';
    if (!/^[1-9][0-9]*$/.test(contentLengthHeader)) {
      return { status: 'failed', error: 'missing or invalid content length' };
    }
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength > MAX_CATALOG_BYTES) {
      return { status: 'failed', error: 'payload exceeds catalog byte limit' };
    }
    const checksum = response.headers.get('x-catalog-checksum') ?? '';
    const version = response.headers.get('x-catalog-version') ?? '';
    const etag = response.headers.get('etag') ?? '';
    const rawBytes = new Uint8Array(await response.arrayBuffer());
    if (rawBytes.byteLength !== contentLength || rawBytes.byteLength > MAX_CATALOG_BYTES) {
      return { status: 'failed', error: 'catalog content length mismatch' };
    }
    const validated = await validateCatalogBytes(rawBytes, checksum);
    if (validated.snapshot.catalogVersion !== version) {
      return { status: 'failed', error: 'catalog version header mismatch' };
    }
    if (etag !== expectedCatalogEtag(version, validated.checksumHex)) {
      return { status: 'failed', error: 'catalog ETag header mismatch' };
    }
    await activateCatalogSnapshot(db, validated, { etag, source: 'remote' });
    return { status: 'activated' };
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'catalog refresh failed' };
  } finally {
    clearTimeout(timeout);
  }
}
