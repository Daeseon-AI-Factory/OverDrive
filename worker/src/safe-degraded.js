// Reploom emergency rollback Worker.
//
// This entry point deliberately contains no AI-provider client or forwarding path. It keeps the
// privacy deletion route available while remote AI is fail-closed during an incident.

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });

const MAX_JSON_BYTES = 128 * 1024;
const CLIENT_HEADER_VALUE = 'ios-v1';
const SUBSCRIPTION_PRODUCT_ID = 'ai.daeseon.reploom.pro.monthly.v1';
const MONTHLY_CREDIT_LIMIT = 1_000;
const MONTHLY_PHOTO_LIMIT = 60;
const STALE_RESERVATION_MS = 2 * 60 * 1_000;
const AI_PATHS = new Set(['/parse', '/transcribe', '/food']);
const ENTITLEMENT_PATHS = new Set([
  '/entitlements/session',
  '/entitlements/usage',
  '/entitlements/delete',
]);
const RETIRED_PATHS = new Set(['/rank/submit', '/rank/board', '/evolve', '/body-avatar']);
const KNOWN_PATHS = new Set([...AI_PATHS, ...ENTITLEMENT_PATHS, '/rank/delete', ...RETIRED_PATHS]);

const utf8 = (value) => new TextEncoder().encode(value);

function base64UrlDecode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  try {
    return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function decodeJsonSegment(value) {
  const decoded = base64UrlDecode(value);
  if (!decoded) return null;
  try {
    return JSON.parse(new TextDecoder().decode(decoded));
  } catch {
    return null;
  }
}

function constantTimeEqual(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function hmacBytes(secret, value) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('invalid entitlement secret');
  const key = await crypto.subtle.importKey(
    'raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(value)));
}

function entitlementError(error, code, status, extra = {}) {
  return json({ error, code, ...extra }, status);
}

async function authenticateEntitlement(req, env) {
  if (!env.DB || typeof env.DB.prepare !== 'function') {
    return { errorResponse: entitlementError('entitlement service is unavailable', 'entitlement_service_unavailable', 503) };
  }
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return { errorResponse: entitlementError('subscription session required', 'entitlement_session_required', 401) };
  }
  const segments = authorization.slice(7).trim().split('.');
  const received = segments.length === 2 ? base64UrlDecode(segments[1]) : null;
  let expected;
  try {
    expected = segments.length === 2
      ? await hmacBytes(env.ENTITLEMENT_SESSION_SECRET, `session:${segments[0]}`)
      : null;
  } catch {
    return { errorResponse: entitlementError('entitlement service is unavailable', 'entitlement_service_unavailable', 503) };
  }
  if (!received || !expected || !constantTimeEqual(received, expected)) {
    return { errorResponse: entitlementError('subscription session is invalid', 'entitlement_session_invalid', 401) };
  }
  const session = decodeJsonSegment(segments[0]);
  const nowMs = Date.now();
  if (!session
    || session.v !== 1
    || !/^[0-9a-f]{64}$/u.test(session.actor)
    || !/^[0-9a-f]{64}$/u.test(session.period)
    || !/^[0-9a-f]{32}$/u.test(session.epoch)
    || session.product !== SUBSCRIPTION_PRODUCT_ID
    || !Number.isInteger(session.exp)
    || !Number.isFinite(session.periodEnd)
    || session.exp <= Math.floor(nowMs / 1_000)
    || session.periodEnd <= nowMs) {
    return { errorResponse: entitlementError('subscription session expired', 'entitlement_session_expired', 401) };
  }
  const principal = await env.DB.prepare(
    'SELECT session_epoch FROM ai_entitlement_principal WHERE actor_key = ?',
  ).bind(session.actor).first();
  if (!principal || principal.session_epoch !== session.epoch) {
    return { errorResponse: entitlementError('subscription session is invalid', 'entitlement_session_invalid', 401) };
  }
  return { session };
}

function usagePayload(row, resetAt) {
  const creditsUsed = Math.max(0, Number(row?.credits_used) || 0);
  const photosUsed = Math.max(0, Number(row?.photos_used) || 0);
  return {
    creditsUsed,
    creditsLimit: MONTHLY_CREDIT_LIMIT,
    creditsRemaining: Math.max(0, MONTHLY_CREDIT_LIMIT - creditsUsed),
    photosUsed,
    photosLimit: MONTHLY_PHOTO_LIMIT,
    photosRemaining: Math.max(0, MONTHLY_PHOTO_LIMIT - photosUsed),
    resetAt: new Date(resetAt).toISOString(),
  };
}

async function handleEntitlementUsage(env, session) {
  await refundStaleReservations(env, Date.now(), session);
  const row = await env.DB.prepare(
    'SELECT credits_used, photos_used FROM ai_quota_period WHERE actor_key = ? AND period_key = ?',
  ).bind(session.actor, session.period).first();
  return json({ usage: usagePayload(row, session.periodEnd) });
}

async function refundStaleReservations(env, nowMs, session = null) {
  const staleBeforeMs = nowMs - STALE_RESERVATION_MS;
  const statement = session
    ? env.DB.prepare(
      "UPDATE ai_quota_request SET state = 'refunded', updated_at_ms = ? "
        + "WHERE actor_key = ? AND period_key = ? AND state = 'reserved' AND updated_at_ms <= ?",
    ).bind(nowMs, session.actor, session.period, staleBeforeMs)
    : env.DB.prepare(
      "UPDATE ai_quota_request SET state = 'refunded', updated_at_ms = ? "
        + "WHERE state = 'reserved' AND updated_at_ms <= ?",
    ).bind(nowMs, staleBeforeMs);
  return statement.run();
}

async function handleEntitlementDelete(env, session) {
  const nowMs = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ai_quota_request WHERE actor_key = ?').bind(session.actor),
    env.DB.prepare('DELETE FROM ai_quota_period WHERE actor_key = ?').bind(session.actor),
    env.DB.prepare('DELETE FROM ai_entitlement_principal WHERE actor_key = ?').bind(session.actor),
    env.DB.prepare(
      'INSERT INTO ai_entitlement_tombstone (actor_key, blocked_until_ms, deleted_at_ms) VALUES (?, ?, ?) '
        + 'ON CONFLICT(actor_key) DO UPDATE SET '
        + 'blocked_until_ms = MAX(blocked_until_ms, excluded.blocked_until_ms), deleted_at_ms = excluded.deleted_at_ms',
    ).bind(session.actor, session.periodEnd, nowMs),
  ]);
  return json({ ok: true, blockedUntil: new Date(session.periodEnd).toISOString() });
}

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

async function purgeExpiredEntitlementData(env, nowMs) {
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE ai_quota_request SET state = 'refunded', updated_at_ms = ? "
        + "WHERE state = 'reserved' AND updated_at_ms <= ?",
    ).bind(nowMs, nowMs - STALE_RESERVATION_MS),
    env.DB.prepare(
      'DELETE FROM ai_quota_request WHERE EXISTS ('
        + 'SELECT 1 FROM ai_quota_period '
        + 'WHERE ai_quota_period.actor_key = ai_quota_request.actor_key '
        + 'AND ai_quota_period.period_key = ai_quota_request.period_key '
        + 'AND ai_quota_period.period_end_ms <= ?)',
    ).bind(nowMs),
    env.DB.prepare('DELETE FROM ai_quota_period WHERE period_end_ms <= ?').bind(nowMs),
    env.DB.prepare('DELETE FROM ai_sandbox_daily_attempt WHERE day_end_ms <= ?').bind(nowMs),
    env.DB.prepare(
      'DELETE FROM ai_entitlement_principal WHERE NOT EXISTS ('
        + 'SELECT 1 FROM ai_quota_period '
        + 'WHERE ai_quota_period.actor_key = ai_entitlement_principal.actor_key)',
    ),
    env.DB.prepare(
      'DELETE FROM ai_entitlement_tombstone WHERE blocked_until_ms <= ?',
    ).bind(nowMs),
  ]);
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (!KNOWN_PATHS.has(pathname)) return json({ error: 'not found' }, 404);
    const expectedMethod = pathname === '/entitlements/usage' ? 'GET' : 'POST';
    if (req.method !== expectedMethod) return json({ error: `${expectedMethod} required` }, 405);

    const livePath = AI_PATHS.has(pathname) || ENTITLEMENT_PATHS.has(pathname) || pathname === '/rank/delete';
    if (livePath && req.headers.get('x-reploom-client') !== CLIENT_HEADER_VALUE) {
      return json({ error: 'client marker required' }, 403);
    }
    if (pathname === '/entitlements/session') {
      return entitlementError('entitlement service is unavailable during rollback', 'entitlement_service_unavailable', 503);
    }
    if (pathname === '/entitlements/usage' || pathname === '/entitlements/delete') {
      const entitlement = await authenticateEntitlement(req, env);
      if (entitlement.errorResponse) return entitlement.errorResponse;
      return pathname === '/entitlements/usage'
        ? handleEntitlementUsage(env, entitlement.session)
        : handleEntitlementDelete(env, entitlement.session);
    }
    if (AI_PATHS.has(pathname)) return json({ error: 'AI service is unavailable' }, 503);
    if (pathname === '/rank/delete') return handleRankDelete(req, env);
    return json({ error: 'feature not available in this release' }, 410);
  },
  async scheduled(_event, env) {
    if (!env.DB || typeof env.DB.prepare !== 'function') return;
    await purgeExpiredEntitlementData(env, Date.now());
  },
};
