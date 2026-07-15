import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../catalog/src/index.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { default: worker } = await import(moduleUrl);

const VERSION = '1.2.3';
const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=86400, no-transform';

function fixturePayload(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    catalogVersion: VERSION,
    effectiveAt: '2026-07-14T00:00:00Z',
    defaultLocale: 'en',
    supportedLocales: ['en', 'ko', 'es', 'zh-Hans'],
    searchNormalization: 'search-v1',
    // Transport-only test fixtures: publication/schema validation is a separate contract gate.
    exercises: Array.from({ length: 32 }, (_, index) => ({ fixtureIndex: index })),
    ...overrides,
  };
}

function compactBytes(overrides = {}) {
  return new TextEncoder().encode(JSON.stringify(fixturePayload(overrides)));
}

function checksum(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function releaseRow(overrides = {}) {
  const bytes = overrides.payload_json ?? compactBytes();
  const byteView = bytes instanceof Uint8Array ? bytes : compactBytes();
  return {
    channel: 'v1',
    version: VERSION,
    schema_version: '1.0.0',
    checksum_hex: checksum(byteView),
    item_count: 32,
    payload_bytes: byteView.byteLength,
    payload_json: bytes,
    state: 'published',
    published_at_ms: Date.parse('2026-07-14T00:00:00Z'),
    ...overrides,
  };
}

function catalogDb(row, options = {}) {
  return {
    prepare(sql) {
      if (options.prepareError) throw options.prepareError;
      options.onPrepare?.(sql);
      return {
        bind(channel) {
          if (options.bindError) throw options.bindError;
          options.onBind?.(channel);
          return {
            async first() {
              if (options.firstError) throw options.firstError;
              return row;
            },
          };
        },
      };
    },
  };
}

function request(path = '/catalog/v1', init = undefined) {
  return new Request(`https://catalog.test${path}`, init);
}

async function responseBytes(response) {
  return new Uint8Array(await response.arrayBuffer());
}

test('returns the immutable compact payload bytes with strong cache metadata', async () => {
  const bytes = compactBytes();
  const digest = checksum(bytes);
  const prepared = [];
  const bound = [];
  const response = await worker.fetch(request(), {
    CATALOG_DB: catalogDb(releaseRow({ payload_json: bytes }), {
      onPrepare: (sql) => prepared.push(sql),
      onBind: (value) => bound.push(value),
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await responseBytes(response), bytes);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('content-length'), String(bytes.byteLength));
  assert.equal(response.headers.get('cache-control'), CACHE_CONTROL);
  assert.equal(response.headers.get('etag'), `"catalog-v1-${VERSION}-${digest.slice(0, 16)}"`);
  assert.equal(response.headers.get('x-catalog-bytes'), String(bytes.byteLength));
  assert.equal(response.headers.get('x-catalog-version'), VERSION);
  assert.equal(response.headers.get('x-catalog-checksum'), `sha256:${digest}`);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(prepared.length, 1);
  assert.match(prepared[0], /^\s*SELECT\b/u);
  assert.deepEqual(bound, ['v1']);
});

test('accepts D1 BLOB readback as ArrayBuffer, Uint8Array, or byte number array without reserialization', async (t) => {
  const bytes = compactBytes({ effectiveAt: '2026-07-14T12:34:56Z' });
  const forms = [
    ['ArrayBuffer', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)],
    ['Uint8Array', bytes],
    ['number[]', Array.from(bytes)],
  ];

  for (const [name, payloadJson] of forms) {
    await t.test(name, async () => {
      const row = releaseRow({
        payload_json: payloadJson,
        payload_bytes: bytes.byteLength,
        checksum_hex: checksum(bytes),
      });
      const response = await worker.fetch(request(), { CATALOG_DB: catalogDb(row) });
      assert.equal(response.status, 200);
      assert.deepEqual(await responseBytes(response), bytes);
    });
  }
});

test('returns bodyless 304 with the same version, checksum, ETag, and cache headers', async () => {
  const bytes = compactBytes();
  const row = releaseRow({ payload_json: bytes });
  const etag = `"catalog-v1-${VERSION}-${row.checksum_hex.slice(0, 16)}"`;
  const response = await worker.fetch(request('/catalog/v1', {
    headers: { 'if-none-match': `"other", W/${etag}` },
  }), { CATALOG_DB: catalogDb(row) });

  assert.equal(response.status, 304);
  assert.equal((await responseBytes(response)).byteLength, 0);
  assert.equal(response.headers.get('content-type'), null);
  assert.equal(response.headers.get('content-length'), null);
  assert.equal(response.headers.get('cache-control'), CACHE_CONTROL);
  assert.equal(response.headers.get('etag'), etag);
  assert.equal(response.headers.get('x-catalog-bytes'), String(bytes.byteLength));
  assert.equal(response.headers.get('x-catalog-version'), VERSION);
  assert.equal(response.headers.get('x-catalog-checksum'), `sha256:${row.checksum_hex}`);
});

test('rejects every non-GET method before touching D1', async () => {
  for (const method of ['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    let databaseCalls = 0;
    const response = await worker.fetch(request('/catalog/v1', { method }), {
      CATALOG_DB: {
        prepare() {
          databaseCalls += 1;
        },
      },
    });
    assert.equal(response.status, 405, method);
    assert.equal(response.headers.get('allow'), 'GET', method);
    assert.equal(response.headers.get('cache-control'), 'no-store', method);
    assert.equal(databaseCalls, 0, method);
  }
});

test('returns 404 for unknown and publication-looking routes without touching D1', async () => {
  for (const path of ['/catalog/v2', '/catalog/v1/publish', '/publish', '/parse', '/unknown']) {
    let databaseCalls = 0;
    const response = await worker.fetch(request(path, { method: path.includes('publish') ? 'POST' : 'GET' }), {
      CATALOG_DB: {
        prepare() {
          databaseCalls += 1;
        },
      },
    });
    assert.equal(response.status, 404, path);
    assert.equal(response.headers.get('cache-control'), 'no-store', path);
    assert.equal(databaseCalls, 0, path);
  }
});

test('fails closed with no-store 503 when the D1 binding, statement, row, or query is unavailable', async () => {
  const cases = [
    ['missing binding', {}],
    ['missing prepare', { CATALOG_DB: {} }],
    ['missing row', { CATALOG_DB: catalogDb(null) }],
    ['prepare error', { CATALOG_DB: catalogDb(null, { prepareError: new Error('prepare failed') }) }],
    ['bind error', { CATALOG_DB: catalogDb(null, { bindError: new Error('bind failed') }) }],
    ['first error', { CATALOG_DB: catalogDb(null, { firstError: new Error('query failed') }) }],
  ];

  for (const [name, env] of cases) {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 503, name);
    assert.equal(response.headers.get('cache-control'), 'no-store', name);
    assert.deepEqual(await response.json(), { error: 'catalog unavailable' }, name);
  }
});

test('fails closed for draft, withdrawn, or incompletely published channel targets', async () => {
  for (const [name, overrides] of [
    ['draft', { state: 'draft', published_at_ms: null }],
    ['withdrawn', { state: 'withdrawn' }],
    ['missing published timestamp', { published_at_ms: null }],
    ['wrong channel', { channel: 'preview' }],
  ]) {
    const response = await worker.fetch(request(), { CATALOG_DB: catalogDb(releaseRow(overrides)) });
    assert.equal(response.status, 503, name);
    assert.equal(response.headers.get('cache-control'), 'no-store', name);
  }
});

test('fails closed for invalid release bounds and metadata', async () => {
  const bytes = compactBytes();
  for (const [name, overrides] of [
    ['unsupported schema', { schema_version: '2.0.0' }],
    ['unsupported catalog version', { version: '2.0.0' }],
    ['uppercase checksum', { checksum_hex: checksum(bytes).toUpperCase() }],
    ['too few rows', { item_count: 31 }],
    ['too many rows', { item_count: 513 }],
    ['declared length mismatch', { payload_bytes: bytes.byteLength + 1 }],
    ['payload too large', { payload_bytes: 524_289 }],
  ]) {
    const response = await worker.fetch(request(), {
      CATALOG_DB: catalogDb(releaseRow({ payload_json: bytes, ...overrides })),
    });
    assert.equal(response.status, 503, name);
    assert.equal(response.headers.get('cache-control'), 'no-store', name);
  }
});

test('fails closed for checksum mismatch, TEXT storage, invalid UTF-8, or envelope mismatch', async () => {
  const bytes = compactBytes();
  const invalidUtf8 = Uint8Array.from([0xff, 0xfe, 0xfd]);
  const cases = [
    ['checksum mismatch', releaseRow({ payload_json: bytes, checksum_hex: '0'.repeat(64) })],
    ['TEXT instead of BLOB', releaseRow({ payload_json: new TextDecoder().decode(bytes) })],
    ['invalid UTF-8', releaseRow({
      payload_json: invalidUtf8,
      payload_bytes: invalidUtf8.byteLength,
      checksum_hex: checksum(invalidUtf8),
    })],
    ['wrong envelope version', (() => {
      const wrong = compactBytes({ catalogVersion: '1.2.4' });
      return releaseRow({ payload_json: wrong, payload_bytes: wrong.byteLength, checksum_hex: checksum(wrong) });
    })()],
  ];

  for (const [name, row] of cases) {
    const response = await worker.fetch(request(), { CATALOG_DB: catalogDb(row) });
    assert.equal(response.status, 503, name);
    assert.equal(response.headers.get('cache-control'), 'no-store', name);
  }
});

test('fails closed for date-only, timezone-free, or calendar-normalized effectiveAt values', async () => {
  for (const effectiveAt of [
    '2026-07-14',
    '2026-07-14T00:00:00',
    '2026-02-30T00:00:00Z',
  ]) {
    const bytes = compactBytes({ effectiveAt });
    const response = await worker.fetch(request(), {
      CATALOG_DB: catalogDb(releaseRow({
        payload_json: bytes,
        payload_bytes: bytes.byteLength,
        checksum_hex: checksum(bytes),
      })),
    });
    assert.equal(response.status, 503, effectiveAt);
    assert.equal(response.headers.get('cache-control'), 'no-store', effectiveAt);
  }
});

test('catalog source is read-only, isolated from QuickLog, secrets, telemetry, cookies, and outbound fetch', () => {
  assert.doesNotMatch(source, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/u);
  assert.doesNotMatch(source, /(?:GROQ|APPLE|ENTITLEMENT|AI_RATE_LIMITER|overdrive-quicklog)/u);
  assert.doesNotMatch(source, /(?:Set-Cookie|console\.|analytics|telemetry|globalThis\.fetch)/u);
  assert.doesNotMatch(source, /\bimport\s/u);
  assert.doesNotMatch(source, /(?:await|return)\s+fetch\s*\(/u);
});
