// Reploom emergency rollback Worker.
//
// This entry point deliberately contains no AI-provider client or forwarding path. It keeps the
// privacy deletion route available while remote AI is fail-closed during an incident.

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });

const MAX_JSON_BYTES = 128 * 1024;
const CLIENT_HEADER_VALUE = 'ios-v1';
const AI_PATHS = new Set(['/parse', '/transcribe', '/food']);
const RETIRED_PATHS = new Set(['/rank/submit', '/rank/board', '/evolve', '/body-avatar']);
const KNOWN_PATHS = new Set([...AI_PATHS, '/rank/delete', ...RETIRED_PATHS]);

function declaredTooLarge(req, maxBytes) {
  const length = Number(req.headers.get('content-length'));
  return Number.isFinite(length) && length > maxBytes;
}

async function readLimitedBytes(req, maxBytes, errorMessage) {
  if (declaredTooLarge(req, maxBytes)) {
    return { errorResponse: json({ error: errorMessage }, 413) };
  }
  if (!req.body) return { bytes: new Uint8Array() };

  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { errorResponse: json({ error: errorMessage }, 413) };
      }
      chunks.push(value);
    }
  } catch {
    return { errorResponse: json({ error: 'invalid request body' }, 400) };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes };
}

async function readJson(req) {
  const read = await readLimitedBytes(req, MAX_JSON_BYTES, 'request too large');
  if (read.errorResponse) return read;
  try {
    return { value: JSON.parse(new TextDecoder().decode(read.bytes)) };
  } catch {
    return { value: null };
  }
}

function sanitizeDeviceId(value) {
  const deviceId = typeof value === 'string' ? value.trim().slice(0, 64) : '';
  return /^[A-Za-z0-9_-]{8,64}$/.test(deviceId) ? deviceId : '';
}

async function handleRankDelete(req, env) {
  if (!env.DB) return json({ error: 'legacy ranking store is unavailable' }, 503);
  if (!(req.headers.get('content-type') || '').includes('application/json')) {
    return json({ error: 'application/json required' }, 415);
  }
  const parsedBody = await readJson(req);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const deviceId = sanitizeDeviceId(parsedBody.value?.deviceId);
  if (!deviceId) return json({ error: 'invalid deviceId' }, 400);
  await env.DB.prepare('DELETE FROM rank_entry WHERE device_id = ?').bind(deviceId).run();
  return json({ ok: true });
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (!KNOWN_PATHS.has(pathname)) return json({ error: 'not found' }, 404);
    if (req.method !== 'POST') return json({ error: 'POST required' }, 405);

    const livePath = AI_PATHS.has(pathname) || pathname === '/rank/delete';
    if (livePath && req.headers.get('x-reploom-client') !== CLIENT_HEADER_VALUE) {
      return json({ error: 'client marker required' }, 403);
    }
    if (AI_PATHS.has(pathname)) return json({ error: 'AI service is unavailable' }, 503);
    if (pathname === '/rank/delete') return handleRankDelete(req, env);
    return json({ error: 'feature not available in this release' }, 410);
  },
};
