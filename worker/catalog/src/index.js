const CATALOG_PATH = '/catalog/v1';
const CATALOG_CHANNEL = 'v1';
const SCHEMA_VERSION = '1.0.0';
const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=86400, no-transform';
const MAX_EXERCISES = 512;
const MIN_EXERCISES = 32;
const MAX_PAYLOAD_BYTES = 524_288;
const VERSION_PATTERN = /^1\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/u;

const ACTIVE_RELEASE_SQL = `
  SELECT
    c.channel,
    r.version,
    r.schema_version,
    r.checksum_hex,
    r.item_count,
    r.payload_bytes,
    r.payload_json,
    r.state,
    r.published_at_ms
  FROM catalog_channel AS c
  JOIN catalog_release AS r ON r.version = c.version
  WHERE c.channel = ?
  LIMIT 1
`;

function errorResponse(status, error, extraHeaders = undefined) {
  const headers = new Headers(extraHeaders);
  headers.set('Cache-Control', 'no-store');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify({ error }), { status, headers });
}

function payloadBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (
    Array.isArray(value)
    && value.length <= MAX_PAYLOAD_BYTES
    && value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    return Uint8Array.from(value);
  }
  return null;
}

function hex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(bytes) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

function isUtcSecondTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  return (
    Number.isFinite(parsed)
    && new Date(parsed).toISOString() === `${value.slice(0, -1)}.000Z`
  );
}

function hasExpectedEnvelope(bytes, row) {
  let payload;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.startsWith('\uFEFF')) return false;
    payload = JSON.parse(text);
  } catch {
    return false;
  }

  return (
    payload != null
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && payload.schemaVersion === SCHEMA_VERSION
    && payload.schemaVersion === row.schema_version
    && payload.catalogVersion === row.version
    && isUtcSecondTimestamp(payload.effectiveAt)
    && payload.defaultLocale === 'en'
    && Array.isArray(payload.supportedLocales)
    && payload.supportedLocales.length === 4
    && payload.supportedLocales[0] === 'en'
    && payload.supportedLocales[1] === 'ko'
    && payload.supportedLocales[2] === 'es'
    && payload.supportedLocales[3] === 'zh-Hans'
    && payload.searchNormalization === 'search-v1'
    && Array.isArray(payload.exercises)
    && payload.exercises.length === row.item_count
  );
}

function releaseMetadataIsValid(row, bytes) {
  return (
    row != null
    && row.channel === CATALOG_CHANNEL
    && row.state === 'published'
    && Number.isInteger(row.published_at_ms)
    && row.published_at_ms > 0
    && row.schema_version === SCHEMA_VERSION
    && typeof row.version === 'string'
    && VERSION_PATTERN.test(row.version)
    && typeof row.checksum_hex === 'string'
    && CHECKSUM_PATTERN.test(row.checksum_hex)
    && Number.isInteger(row.item_count)
    && row.item_count >= MIN_EXERCISES
    && row.item_count <= MAX_EXERCISES
    && Number.isInteger(row.payload_bytes)
    && row.payload_bytes > 0
    && row.payload_bytes <= MAX_PAYLOAD_BYTES
    && bytes != null
    && bytes.byteLength === row.payload_bytes
    && hasExpectedEnvelope(bytes, row)
  );
}

async function loadActiveRelease(env) {
  if (env?.CATALOG_DB == null || typeof env.CATALOG_DB.prepare !== 'function') return null;

  const statement = env.CATALOG_DB.prepare(ACTIVE_RELEASE_SQL);
  if (statement == null || typeof statement.bind !== 'function') return null;
  const bound = statement.bind(CATALOG_CHANNEL);
  if (bound == null || typeof bound.first !== 'function') return null;

  const row = await bound.first();
  const bytes = payloadBytes(row?.payload_json);
  if (!releaseMetadataIsValid(row, bytes)) return null;
  if (await sha256Hex(bytes) !== row.checksum_hex) return null;

  return {
    bytes,
    version: row.version,
    checksum: row.checksum_hex,
    etag: `"catalog-v1-${row.version}-${row.checksum_hex.slice(0, 16)}"`,
  };
}

function catalogHeaders(release, includeContentType) {
  const headers = new Headers({
    'Cache-Control': CACHE_CONTROL,
    ETag: release.etag,
    'X-Catalog-Bytes': String(release.bytes.byteLength),
    'X-Catalog-Version': release.version,
    'X-Catalog-Checksum': `sha256:${release.checksum}`,
    'X-Content-Type-Options': 'nosniff',
  });
  if (includeContentType) {
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Content-Length', String(release.bytes.byteLength));
  }
  return headers;
}

function ifNoneMatchMatches(value, etag) {
  if (value == null) return false;
  return value.split(',').some((candidate) => {
    const token = candidate.trim();
    return token === '*' || token === etag || (token.startsWith('W/') && token.slice(2) === etag);
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname !== CATALOG_PATH) return errorResponse(404, 'not found');
    if (request.method !== 'GET') return errorResponse(405, 'method not allowed', { Allow: 'GET' });

    let release;
    try {
      release = await loadActiveRelease(env);
    } catch {
      return errorResponse(503, 'catalog unavailable');
    }
    if (release == null) return errorResponse(503, 'catalog unavailable');

    if (ifNoneMatchMatches(request.headers.get('if-none-match'), release.etag)) {
      return new Response(null, { status: 304, headers: catalogHeaders(release, false) });
    }

    return new Response(release.bytes, {
      status: 200,
      headers: catalogHeaders(release, true),
    });
  },
};
