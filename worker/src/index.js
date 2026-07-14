// Reploom AI parsing proxy. User content is forwarded only after the app's explicit consent gate.
// The Worker does not persist request bodies or model output. Groq is the sole v1 AI provider so
// runtime behavior, the in-app disclosure, and the public privacy policy stay aligned.

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });

const MAX_JSON_BYTES = 128 * 1024;
const MAX_TEXT_CHARS = 2_000;
const MAX_WORKOUT_CATALOG_ENTRIES = 64;
const MAX_WORKOUT_CATALOG_NAMES = 4;
const MAX_WORKOUT_CATALOG_FIELD_CHARS = 60;
const MAX_AUDIO_BYTES = 1 * 1024 * 1024;
const MAX_AUDIO_SECONDS = 35;
const MAX_PHOTO_BYTES = 2_750_000;
const MAX_MULTIPART_OVERHEAD = 256 * 1024;
const PARSE_PROVIDER_TIMEOUT_MS = 2_800;
const FOOD_TEXT_PROVIDER_TIMEOUT_MS = 7_000;
const FOOD_PHOTO_PROVIDER_TIMEOUT_MS = 15_000;
const TRANSCRIBE_PROVIDER_TIMEOUT_MS = 6_500;
const PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const AUDIO_MIMES = new Set(['audio/m4a', 'audio/mp4', 'audio/x-m4a']);
const CLIENT_HEADER_VALUE = 'ios-v1';
const APP_BUNDLE_ID = 'ai.daeseon.reploom';
const SUBSCRIPTION_PRODUCT_ID = 'ai.daeseon.reploom.pro.monthly.v1';
const ENTITLEMENT_SESSION_TTL_SECONDS = 15 * 60;
const MONTHLY_CREDIT_LIMIT = 1_000;
const MONTHLY_PHOTO_LIMIT = 60;
const APPLE_API_TIMEOUT_MS = 4_500;
const STALE_RESERVATION_MS = 2 * 60 * 1_000;
const UTC_DAY_MS = 24 * 60 * 60 * 1_000;
const APPLE_PRODUCTION_API = 'https://api.storekit.apple.com';
const APPLE_SANDBOX_API = 'https://api.storekit-sandbox.apple.com';
const ENTITLEMENT_PATHS = new Set([
  '/entitlements/session',
  '/entitlements/usage',
  '/entitlements/delete',
]);
const AI_RATE_COST = new Map([
  ['/parse', 1],
  ['/food', 2],
  ['/transcribe', 3],
]);

const utf8 = (value) => new TextEncoder().encode(value);

function base64UrlEncode(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlDecode(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
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

function randomHex(bytes = 16) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  if (!(left instanceof Uint8Array) || !(right instanceof Uint8Array) || left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function importHmacKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('invalid entitlement secret');
  return crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function hmacBytes(secret, value) {
  const key = await importHmacKey(secret);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(value)));
}

async function hmacHex(secret, value) {
  const bytes = await hmacBytes(secret, value);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function compactPemPrivateKey(value) {
  if (typeof value !== 'string') return null;
  const body = value
    .replace(/\\n/gu, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/gu, '')
    .replace(/-----END PRIVATE KEY-----/gu, '')
    .replace(/\s/gu, '');
  if (!body || !/^[A-Za-z0-9+/=]+$/u.test(body)) return null;
  try {
    return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function createAppStoreJwt(env, nowMs = Date.now()) {
  const issuerId = cleanText(env.APPLE_IAP_ISSUER_ID, 80);
  const keyId = cleanText(env.APPLE_IAP_KEY_ID, 80);
  const privateKeyBytes = compactPemPrivateKey(env.APPLE_IAP_PRIVATE_KEY);
  if (!issuerId || !keyId || !privateKeyBytes) throw new Error('missing App Store API configuration');
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const issuedAt = Math.floor(nowMs / 1_000);
  const header = base64UrlEncode(utf8(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })));
  const payload = base64UrlEncode(utf8(JSON.stringify({
    iss: issuerId,
    iat: issuedAt,
    exp: issuedAt + 5 * 60,
    aud: 'appstoreconnect-v1',
    bid: APP_BUNDLE_ID,
  })));
  const signingInput = `${header}.${payload}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    utf8(signingInput),
  ));
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function decodeAppleTransactionJws(value) {
  if (typeof value !== 'string') return null;
  const segments = value.split('.');
  if (segments.length !== 3 || !segments[2]) return null;
  const header = decodeJsonSegment(segments[0]);
  const payload = decodeJsonSegment(segments[1]);
  if (header?.alg !== 'ES256' || !payload || typeof payload !== 'object') return null;
  return payload;
}

function isTransactionId(value) {
  return typeof value === 'string' && /^\d{8,32}$/u.test(value);
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function isAppTransactionId(value) {
  // Apple exposes this identifier as an opaque String, not a UUID. Keep the exact bytes because
  // the native StoreKit bridge uses the same value as deterministic token input.
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 256
    && utf8(value).byteLength <= 512;
}

async function deriveAppAccountToken(appTransactionId) {
  if (!isAppTransactionId(appTransactionId)) return '';
  const digest = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    utf8(`reploom-app-account-token-v1\0${APP_BUNDLE_ID}\0${appTransactionId}`),
  ));
  const uuid = digest.slice(0, 16);
  uuid[6] = (uuid[6] & 0x0f) | 0x80;
  uuid[8] = (uuid[8] & 0x3f) | 0x80;
  const hex = Array.from(uuid, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validateAppleTransaction(payload, requestedTransactionId, expectedEnvironment, nowMs) {
  const purchaseDate = Number(payload?.purchaseDate);
  const expiresDate = Number(payload?.expiresDate);
  const signedDate = Number(payload?.signedDate);
  const valid = payload?.transactionId === requestedTransactionId
    && isTransactionId(payload?.originalTransactionId)
    && payload?.bundleId === APP_BUNDLE_ID
    && payload?.productId === SUBSCRIPTION_PRODUCT_ID
    && payload?.type === 'Auto-Renewable Subscription'
    && payload?.environment === expectedEnvironment
    && isAppTransactionId(payload?.appTransactionId)
    && isUuid(payload?.appAccountToken)
    && Number.isFinite(purchaseDate)
    && Number.isFinite(expiresDate)
    && Number.isFinite(signedDate)
    && purchaseDate > 0
    && expiresDate > purchaseDate
    && expiresDate > nowMs
    && signedDate > 0
    && signedDate <= nowMs + 5 * 60 * 1_000
    && payload?.revocationDate == null
    && payload?.isUpgraded !== true;
  return valid ? { ...payload, purchaseDate, expiresDate } : null;
}

async function queryAppleTransaction(baseUrl, transactionId, bearer) {
  let response;
  try {
    response = await fetchProvider(`${baseUrl}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${bearer}`, accept: 'application/json' },
    }, APPLE_API_TIMEOUT_MS);
  } catch {
    return { serviceError: true };
  }
  if (response.status === 404) return { notFound: true };
  if (!response.ok) return { serviceError: true };
  const body = await response.json().catch(() => null);
  const payload = decodeAppleTransactionJws(body?.signedTransactionInfo);
  return payload ? { payload } : { invalid: true };
}

async function verifySubscriptionWithApple(env, transactionId, nowMs = Date.now()) {
  let bearer;
  try {
    bearer = await createAppStoreJwt(env, nowMs);
  } catch {
    return { errorResponse: entitlementError('entitlement service is unavailable', 'entitlement_service_unavailable', 503) };
  }
  const production = await queryAppleTransaction(APPLE_PRODUCTION_API, transactionId, bearer);
  if (production.serviceError) {
    return { errorResponse: entitlementError('entitlement service is unavailable', 'entitlement_service_unavailable', 503) };
  }
  if (production.payload) {
    const transaction = validateAppleTransaction(production.payload, transactionId, 'Production', nowMs);
    return transaction
      ? { transaction }
      : { errorResponse: entitlementError('subscription is not active', 'subscription_not_active', 403) };
  }
  if (production.invalid) {
    return { errorResponse: entitlementError('subscription could not be verified', 'subscription_invalid', 403) };
  }

  const sandbox = await queryAppleTransaction(APPLE_SANDBOX_API, transactionId, bearer);
  if (sandbox.serviceError) {
    return { errorResponse: entitlementError('entitlement service is unavailable', 'entitlement_service_unavailable', 503) };
  }
  if (!sandbox.payload) {
    return { errorResponse: entitlementError('subscription is not active', 'subscription_not_active', 403) };
  }
  const transaction = validateAppleTransaction(sandbox.payload, transactionId, 'Sandbox', nowMs);
  return transaction
    ? { transaction }
    : { errorResponse: entitlementError('subscription could not be verified', 'subscription_invalid', 403) };
}

function rateLimited() {
  return new Response(JSON.stringify({ error: 'too many AI requests; try again shortly' }), {
    status: 429,
    headers: { ...JSON_HEADERS, 'retry-after': '60' },
  });
}

async function enforceAiRateLimit(req, env, cost, subscriberActor = null) {
  if (!env.AI_RATE_LIMITER || typeof env.AI_RATE_LIMITER.limit !== 'function') {
    // Fail closed if a deploy accidentally omits the cost-control binding.
    return json({ error: 'AI service is unavailable' }, 503);
  }
  // Session exchange is unauthenticated and remains IP-keyed. Paid AI is keyed by the validated
  // subscriber HMAC so unrelated members on gym Wi-Fi/carrier NAT never consume each other's bucket.
  const actor = subscriberActor
    ? `subscriber:${subscriberActor}`
    : `ip:${req.headers.get('cf-connecting-ip') || 'unknown-client'}`;
  for (let i = 0; i < cost; i += 1) {
    const result = await env.AI_RATE_LIMITER.limit({ key: actor });
    if (!result?.success) return rateLimited();
  }
  return null;
}

function entitlementError(error, code, status, extra = {}) {
  return json({ error, code, ...extra }, status);
}

function requireDatabase(env) {
  return env.DB && typeof env.DB.prepare === 'function';
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

async function readUsage(env, session) {
  await refundStaleReservations(env, Date.now(), session);
  const row = await env.DB.prepare(
    'SELECT credits_used, photos_used FROM ai_quota_period WHERE actor_key = ? AND period_key = ?',
  ).bind(session.actor, session.period).first();
  return usagePayload(row, session.periodEnd);
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

async function signEntitlementSession(env, payload) {
  const encoded = base64UrlEncode(utf8(JSON.stringify(payload)));
  const signature = await hmacBytes(env.ENTITLEMENT_SESSION_SECRET, `session:${encoded}`);
  return `${encoded}.${base64UrlEncode(signature)}`;
}

async function verifyEntitlementSessionToken(env, token, nowMs = Date.now()) {
  const segments = typeof token === 'string' ? token.split('.') : [];
  if (segments.length !== 2) return { code: 'entitlement_session_invalid' };
  const receivedSignature = base64UrlDecode(segments[1]);
  if (!receivedSignature) return { code: 'entitlement_session_invalid' };
  let expectedSignature;
  try {
    expectedSignature = await hmacBytes(env.ENTITLEMENT_SESSION_SECRET, `session:${segments[0]}`);
  } catch {
    return { code: 'entitlement_service_unavailable', status: 503 };
  }
  if (!constantTimeEqual(receivedSignature, expectedSignature)) {
    return { code: 'entitlement_session_invalid' };
  }
  const payload = decodeJsonSegment(segments[0]);
  const nowSeconds = Math.floor(nowMs / 1_000);
  if (!payload
    || payload.v !== 1
    || !/^[0-9a-f]{64}$/u.test(payload.actor)
    || !/^[0-9a-f]{64}$/u.test(payload.period)
    || !/^[0-9a-f]{32}$/u.test(payload.epoch)
    || payload.product !== SUBSCRIPTION_PRODUCT_ID
    || !['Production', 'Sandbox'].includes(payload.environment)
    || !Number.isInteger(payload.iat)
    || !Number.isInteger(payload.exp)
    || !Number.isFinite(payload.periodStart)
    || !Number.isFinite(payload.periodEnd)
    || payload.iat > nowSeconds + 60
    || payload.periodStart >= payload.periodEnd) {
    return { code: 'entitlement_session_invalid' };
  }
  if (payload.exp <= nowSeconds || payload.periodEnd <= nowMs) {
    return { code: 'entitlement_session_expired' };
  }
  return { session: payload };
}

async function authenticateEntitlement(req, env) {
  if (!requireDatabase(env)) {
    return { errorResponse: entitlementError('entitlement service is unavailable', 'entitlement_service_unavailable', 503) };
  }
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return { errorResponse: entitlementError('subscription session required', 'entitlement_session_required', 401) };
  }
  const verified = await verifyEntitlementSessionToken(env, authorization.slice(7).trim());
  if (!verified.session) {
    const status = verified.status || 401;
    const error = verified.code === 'entitlement_session_expired'
      ? 'subscription session expired'
      : verified.code === 'entitlement_service_unavailable'
        ? 'entitlement service is unavailable'
        : 'subscription session is invalid';
    return { errorResponse: entitlementError(error, verified.code, status) };
  }
  const principal = await env.DB.prepare(
    'SELECT session_epoch FROM ai_entitlement_principal WHERE actor_key = ?',
  ).bind(verified.session.actor).first();
  if (!principal || principal.session_epoch !== verified.session.epoch) {
    return { errorResponse: entitlementError('subscription session is invalid', 'entitlement_session_invalid', 401) };
  }
  return { session: verified.session };
}

async function initializeEntitlement(env, transaction, nowMs) {
  const identitySecret = env.ENTITLEMENT_IDENTITY_SECRET;
  let actor;
  let period;
  try {
    actor = await hmacHex(identitySecret, `actor:${transaction.appAccountToken.toLowerCase()}`);
    period = await hmacHex(
      identitySecret,
      `period:${transaction.originalTransactionId}:${transaction.purchaseDate}:${transaction.expiresDate}`,
    );
  } catch {
    return { errorResponse: entitlementError('entitlement service is unavailable', 'entitlement_service_unavailable', 503) };
  }

  const proposedEpoch = randomHex();
  try {
    // D1 batch is one transaction. Deletion cannot slip between the active-tombstone check and
    // entitlement creation, so a concurrent privacy deletion always wins before a token is usable.
    await env.DB.batch([
      env.DB.prepare(
        'DELETE FROM ai_entitlement_tombstone WHERE actor_key = ? AND blocked_until_ms <= ?',
      ).bind(actor, nowMs),
      env.DB.prepare(
        'INSERT OR IGNORE INTO ai_entitlement_principal '
          + '(actor_key, session_epoch, created_at_ms, updated_at_ms) '
          + 'SELECT ?, ?, ?, ? WHERE NOT EXISTS ('
          + 'SELECT 1 FROM ai_entitlement_tombstone WHERE actor_key = ? AND blocked_until_ms > ?)',
      ).bind(actor, proposedEpoch, nowMs, nowMs, actor, nowMs),
      env.DB.prepare(
        'INSERT OR IGNORE INTO ai_quota_period '
          + '(actor_key, period_key, period_start_ms, period_end_ms, credits_used, photos_used, updated_at_ms) '
          + 'SELECT ?, ?, ?, ?, 0, 0, ? WHERE NOT EXISTS ('
          + 'SELECT 1 FROM ai_entitlement_tombstone WHERE actor_key = ? AND blocked_until_ms > ?)',
      ).bind(actor, period, transaction.purchaseDate, transaction.expiresDate, nowMs, actor, nowMs),
    ]);
  } catch {
    return { errorResponse: entitlementError('entitlement service is unavailable', 'entitlement_service_unavailable', 503) };
  }
  const principal = await env.DB.prepare(
    'SELECT p.session_epoch FROM ai_entitlement_principal p '
      + 'WHERE p.actor_key = ? AND NOT EXISTS ('
      + 'SELECT 1 FROM ai_entitlement_tombstone t '
      + 'WHERE t.actor_key = p.actor_key AND t.blocked_until_ms > ?)',
  ).bind(actor, nowMs).first();
  if (!principal?.session_epoch) {
    const tombstone = await env.DB.prepare(
      'SELECT blocked_until_ms FROM ai_entitlement_tombstone WHERE actor_key = ?',
    ).bind(actor).first();
    if (Number(tombstone?.blocked_until_ms) > nowMs) {
      const resetAt = new Date(Number(tombstone.blocked_until_ms)).toISOString();
      return {
        errorResponse: entitlementError(
          'AI data was deleted for this billing period',
          'data_deleted_until_reset',
          403,
          { resetAt },
        ),
      };
    }
    return { errorResponse: entitlementError('entitlement service is unavailable', 'entitlement_service_unavailable', 503) };
  }

  return {
    session: {
      v: 1,
      actor,
      period,
      epoch: principal.session_epoch,
      product: SUBSCRIPTION_PRODUCT_ID,
      environment: transaction.environment,
      periodStart: transaction.purchaseDate,
      periodEnd: transaction.expiresDate,
    },
  };
}

async function handleEntitlementSession(req, env) {
  if (!requireDatabase(env)) {
    return entitlementError('entitlement service is unavailable', 'entitlement_service_unavailable', 503);
  }
  if (!(req.headers.get('content-type') || '').includes('application/json')) {
    return entitlementError('application/json required', 'invalid_entitlement_request', 415);
  }
  const parsedBody = await readJson(req);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const transactionId = parsedBody.value?.transactionId;
  const appAccountToken = typeof parsedBody.value?.appAccountToken === 'string'
    ? parsedBody.value.appAccountToken.toLowerCase()
    : '';
  if (!isTransactionId(transactionId)) {
    return entitlementError('invalid transaction id', 'invalid_transaction_id', 400);
  }
  if (!isUuid(appAccountToken)) {
    return entitlementError('invalid app account token', 'invalid_app_account_token', 400);
  }
  const limited = await enforceAiRateLimit(req, env, 1);
  if (limited) return limited;
  const nowMs = Date.now();
  const verified = await verifySubscriptionWithApple(env, transactionId, nowMs);
  if (verified.errorResponse) return verified.errorResponse;
  const derivedAppAccountToken = await deriveAppAccountToken(verified.transaction.appTransactionId);
  if (!derivedAppAccountToken
    || verified.transaction.appAccountToken.toLowerCase() !== derivedAppAccountToken
    || appAccountToken !== derivedAppAccountToken) {
    return entitlementError('subscription could not be verified', 'subscription_invalid', 403);
  }
  const initialized = await initializeEntitlement(env, verified.transaction, nowMs);
  if (initialized.errorResponse) return initialized.errorResponse;

  const nowSeconds = Math.floor(nowMs / 1_000);
  const session = {
    ...initialized.session,
    iat: nowSeconds,
    exp: Math.min(nowSeconds + ENTITLEMENT_SESSION_TTL_SECONDS, Math.floor(verified.transaction.expiresDate / 1_000)),
  };
  let token;
  try {
    token = await signEntitlementSession(env, session);
  } catch {
    return entitlementError('entitlement service is unavailable', 'entitlement_service_unavailable', 503);
  }
  const usage = await readUsage(env, session);
  return json({
    token,
    expiresAt: new Date(session.exp * 1_000).toISOString(),
    entitlement: {
      productId: SUBSCRIPTION_PRODUCT_ID,
      environment: verified.transaction.environment,
      expiresAt: new Date(verified.transaction.expiresDate).toISOString(),
    },
    usage,
  });
}

async function handleEntitlementUsage(req, env, session) {
  return json({ usage: await readUsage(env, session) });
}

async function handleEntitlementDelete(req, env, session) {
  const nowMs = Date.now();
  const tombstone = env.DB.prepare(
    'INSERT INTO ai_entitlement_tombstone (actor_key, blocked_until_ms, deleted_at_ms) VALUES (?, ?, ?) '
      + 'ON CONFLICT(actor_key) DO UPDATE SET '
      + 'blocked_until_ms = MAX(blocked_until_ms, excluded.blocked_until_ms), deleted_at_ms = excluded.deleted_at_ms',
  ).bind(session.actor, session.periodEnd, nowMs);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM ai_quota_request WHERE actor_key = ?').bind(session.actor),
    env.DB.prepare('DELETE FROM ai_quota_period WHERE actor_key = ?').bind(session.actor),
    env.DB.prepare('DELETE FROM ai_entitlement_principal WHERE actor_key = ?').bind(session.actor),
    tombstone,
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

async function readMultipart(req, maxBytes, errorMessage) {
  const read = await readLimitedBytes(req, maxBytes, errorMessage);
  if (read.errorResponse) return read;
  const contentType = req.headers.get('content-type') || '';
  const value = await new Response(read.bytes, { headers: { 'content-type': contentType } })
    .formData()
    .catch(() => null);
  return { value };
}

function readIsoBmffBox(bytes, view, offset, limit) {
  if (!Number.isInteger(offset) || offset < 0 || offset + 8 > limit) return null;
  const size32 = view.getUint32(offset, false);
  const type = String.fromCharCode(
    bytes[offset + 4],
    bytes[offset + 5],
    bytes[offset + 6],
    bytes[offset + 7],
  );
  let headerSize = 8;
  let size;
  if (size32 === 1) {
    if (offset + 16 > limit) return null;
    headerSize = 16;
    const size64 = (BigInt(view.getUint32(offset + 8, false)) << 32n)
      | BigInt(view.getUint32(offset + 12, false));
    if (size64 > BigInt(limit - offset)) return null;
    size = Number(size64);
  } else if (size32 === 0) {
    size = limit - offset;
  } else {
    size = size32;
  }
  if (!Number.isInteger(size) || size < headerSize || size > limit - offset) return null;
  return {
    type,
    payloadStart: offset + headerSize,
    end: offset + size,
  };
}

function parseMovieHeaderDurationSeconds(bytes, view, box) {
  const payloadBytes = box.end - box.payloadStart;
  if (payloadBytes < 4) return null;
  const version = bytes[box.payloadStart];
  let timescale;
  let durationUnits;
  if (version === 0) {
    if (payloadBytes < 20) return null;
    timescale = view.getUint32(box.payloadStart + 12, false);
    durationUnits = view.getUint32(box.payloadStart + 16, false);
    if (durationUnits === 0xffffffff) return null;
  } else if (version === 1) {
    if (payloadBytes < 32) return null;
    timescale = view.getUint32(box.payloadStart + 20, false);
    durationUnits = (BigInt(view.getUint32(box.payloadStart + 24, false)) << 32n)
      | BigInt(view.getUint32(box.payloadStart + 28, false));
    if (durationUnits === 0xffffffffffffffffn) return null;
  } else {
    return null;
  }
  if (!Number.isInteger(timescale) || timescale <= 0) return null;
  const durationSeconds = Number(durationUnits) / timescale;
  return Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null;
}

function parseIsoBmffDurationSeconds(input) {
  const bytes = input instanceof Uint8Array
    ? input
    : input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : null;
  if (!bytes || bytes.byteLength < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let hasFileType = false;
  let hasMovie = false;
  let durationSeconds = null;
  let offset = 0;

  while (offset < bytes.byteLength) {
    const box = readIsoBmffBox(bytes, view, offset, bytes.byteLength);
    if (!box) return null;
    if (box.type === 'ftyp') {
      if (box.end - box.payloadStart < 8) return null;
      hasFileType = true;
    } else if (box.type === 'moov') {
      hasMovie = true;
      let childOffset = box.payloadStart;
      while (childOffset < box.end) {
        const child = readIsoBmffBox(bytes, view, childOffset, box.end);
        if (!child) return null;
        if (child.type === 'mvhd' && durationSeconds == null) {
          durationSeconds = parseMovieHeaderDurationSeconds(bytes, view, child);
          if (durationSeconds == null) return null;
        }
        childOffset = child.end;
      }
    }
    offset = box.end;
  }

  return hasFileType && hasMovie ? durationSeconds : null;
}

function sanitizeRequestId(value) {
  const requestId = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9._:-]{8,128}$/u.test(requestId) ? requestId : '';
}

function duplicateRequestResponse(state) {
  if (state === 'completed') {
    return entitlementError('request already processed', 'request_already_completed', 409);
  }
  if (state === 'refunded') {
    return entitlementError('request previously failed; use a new request id', 'request_previously_failed', 409);
  }
  return entitlementError('request is already in progress', 'request_in_progress', 409);
}

async function sandboxAttemptWindow(env, session, nowMs) {
  if (session.environment !== 'Sandbox') return null;
  const dayStartMs = Math.floor(nowMs / UTC_DAY_MS) * UTC_DAY_MS;
  const dayEndMs = dayStartMs + UTC_DAY_MS;
  const dayKey = await hmacHex(
    env.ENTITLEMENT_IDENTITY_SECRET,
    `sandbox-day:${session.actor}:${dayStartMs}`,
  );
  return { dayKey, dayStartMs, dayEndMs };
}

async function reserveQuota(req, env, session, route, creditCost, photoCost) {
  const requestId = sanitizeRequestId(req.headers.get('x-reploom-request-id'));
  if (!requestId) {
    return { errorResponse: entitlementError('valid request id required', 'invalid_request_id', 400) };
  }
  const nowMs = Date.now();
  try {
    await refundStaleReservations(env, nowMs, session);
  } catch {
    return { errorResponse: entitlementError('usage service is unavailable', 'usage_service_unavailable', 503) };
  }
  const requestKey = await hmacHex(
    env.ENTITLEMENT_IDENTITY_SECRET,
    `request:${session.actor}:${requestId}`,
  );
  const existing = await env.DB.prepare(
    'SELECT state FROM ai_quota_request WHERE actor_key = ? AND request_key = ?',
  ).bind(session.actor, requestKey).first();
  if (existing) return { errorResponse: duplicateRequestResponse(existing.state) };

  let sandboxWindow;
  try {
    sandboxWindow = await sandboxAttemptWindow(env, session, nowMs);
  } catch {
    return { errorResponse: entitlementError('usage service is unavailable', 'usage_service_unavailable', 503) };
  }
  const requestStatement = env.DB.prepare(
    'INSERT OR IGNORE INTO ai_quota_request '
      + '(actor_key, request_key, period_key, sandbox_day_key, route, credit_cost, photo_cost, state, created_at_ms, updated_at_ms) '
      + "VALUES (?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?)",
  ).bind(
    session.actor,
    requestKey,
    session.period,
    sandboxWindow?.dayKey ?? null,
    route,
    creditCost,
    photoCost,
    nowMs,
    nowMs,
  );
  let result;
  try {
    if (sandboxWindow) {
      const results = await env.DB.batch([
        env.DB.prepare(
          'INSERT OR IGNORE INTO ai_sandbox_daily_attempt '
            + '(actor_key, day_key, day_start_ms, day_end_ms, attempt_credits, photo_attempts, updated_at_ms) '
            + 'VALUES (?, ?, ?, ?, 0, 0, ?)',
        ).bind(
          session.actor,
          sandboxWindow.dayKey,
          sandboxWindow.dayStartMs,
          sandboxWindow.dayEndMs,
          nowMs,
        ),
        requestStatement,
      ]);
      result = results[1];
    } else {
      result = await requestStatement.run();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const usage = await readUsage(env, session);
    if (message.includes('monthly_photo_limit_reached')) {
      return {
        errorResponse: quotaExceededResponse('monthly photo limit reached', 'monthly_photo_limit_reached', usage),
      };
    }
    if (message.includes('monthly_credit_limit_reached')) {
      return {
        errorResponse: quotaExceededResponse('monthly AI limit reached', 'monthly_credit_limit_reached', usage),
      };
    }
    if (message.includes('monthly_photo_attempt_limit_reached')) {
      return {
        errorResponse: quotaExceededResponse(
          'monthly meal-photo attempt safety limit reached',
          'monthly_photo_attempt_limit_reached',
          usage,
        ),
      };
    }
    if (message.includes('monthly_provider_attempt_limit_reached')) {
      return {
        errorResponse: quotaExceededResponse(
          'monthly AI attempt safety limit reached',
          'monthly_provider_attempt_limit_reached',
          usage,
        ),
      };
    }
    if (message.includes('sandbox_daily_photo_attempt_limit_reached')) {
      return {
        errorResponse: quotaExceededResponse(
          'daily Sandbox meal-photo attempt safety limit reached',
          'sandbox_daily_photo_attempt_limit_reached',
          usage,
          sandboxWindow?.dayEndMs,
        ),
      };
    }
    if (message.includes('sandbox_daily_provider_attempt_limit_reached')) {
      return {
        errorResponse: quotaExceededResponse(
          'daily Sandbox AI attempt safety limit reached',
          'sandbox_daily_provider_attempt_limit_reached',
          usage,
          sandboxWindow?.dayEndMs,
        ),
      };
    }
    return { errorResponse: entitlementError('usage service is unavailable', 'usage_service_unavailable', 503) };
  }

  if (Number(result?.meta?.changes) === 0) {
    const raced = await env.DB.prepare(
      'SELECT state FROM ai_quota_request WHERE actor_key = ? AND request_key = ?',
    ).bind(session.actor, requestKey).first();
    return { errorResponse: raced
      ? duplicateRequestResponse(raced.state)
      : entitlementError('usage service is unavailable', 'usage_service_unavailable', 503) };
  }
  return { requestKey };
}

function quotaExceededResponse(error, code, usage, resetAtMs = Date.parse(usage.resetAt)) {
  const resetAt = new Date(resetAtMs).toISOString();
  const retryAfter = Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1_000));
  return new Response(JSON.stringify({ error, code, usage, resetAt }), {
    status: 429,
    headers: { ...JSON_HEADERS, 'retry-after': String(retryAfter) },
  });
}

async function updateReservationState(env, session, requestKey, state) {
  const result = await env.DB.prepare(
    'UPDATE ai_quota_request SET state = ?, updated_at_ms = ? '
      + "WHERE actor_key = ? AND request_key = ? AND state = 'reserved'",
  ).bind(state, Date.now(), session.actor, requestKey).run();
  return Number(result?.meta?.changes) === 1;
}

function attachUsageHeaders(response, usage) {
  const headers = new Headers(response.headers);
  headers.set('x-reploom-credits-remaining', String(usage.creditsRemaining));
  headers.set('x-reploom-photos-remaining', String(usage.photosRemaining));
  headers.set('x-reploom-reset-at', usage.resetAt);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function executeMeteredAi(req, env, session, route, creditCost, photoCost, operation) {
  const reserved = await reserveQuota(req, env, session, route, creditCost, photoCost);
  if (reserved.errorResponse) return reserved.errorResponse;
  let response;
  try {
    response = await operation();
  } catch {
    await updateReservationState(env, session, reserved.requestKey, 'refunded').catch(() => {});
    return json({ error: 'AI provider is temporarily unreachable' }, 502);
  }
  if (response.status >= 500) {
    await updateReservationState(env, session, reserved.requestKey, 'refunded').catch(() => {});
    return response;
  }
  let completed = false;
  try {
    completed = await updateReservationState(env, session, reserved.requestKey, 'completed');
  } catch {
    // Never return an unmetered provider result if durable completion could not be recorded.
  }
  if (!completed) {
    return entitlementError('usage service is unavailable', 'usage_service_unavailable', 503);
  }
  try {
    return attachUsageHeaders(response, await readUsage(env, session));
  } catch {
    // Metering is already durable; a cosmetic usage-header refresh must not discard the AI result.
    return response;
  }
}

function cleanText(value, max = MAX_TEXT_CHARS) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function providerError(scope, response) {
  // Provider bodies can echo user content. Never reflect or log them from this proxy.
  return json({ error: `${scope} provider request failed`, providerStatus: response.status }, 502);
}

const SET_SHAPE =
  'Respond with ONLY a JSON object of shape ' +
  '{"sets":[{"exerciseId":string,"exerciseName":string,"weightKg":number,"reps":integer,"rir":integer|null,"isBodyweight":boolean}],"note":string}. ' +
  'exerciseId is the catalog id when it matches, or "" when the exercise is not in the catalog.';

function normalizeWorkoutSets(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap((item) => {
    const exerciseId = cleanText(item?.exerciseId, 80);
    const exerciseName = cleanText(item?.exerciseName, 120);
    const weight = Number(item?.weightKg);
    const repetitions = Number(item?.reps);
    if ((!exerciseId && !exerciseName) || !Number.isFinite(repetitions) || repetitions < 1) return [];
    const rir = item?.rir == null ? Number.NaN : Number(item.rir);
    return [{
      exerciseId,
      exerciseName: exerciseName || exerciseId,
      weightKg: Number.isFinite(weight) ? Math.max(0, Math.min(5_000, weight)) : 0,
      reps: Math.max(1, Math.min(100_000, Math.round(repetitions))),
      rir: Number.isInteger(rir) && rir >= 0 && rir <= 10 ? rir : null,
      isBodyweight: item?.isBodyweight === true,
    }];
  });
}

function buildWorkoutPrompt(text, unitSystem, exercises) {
  const catalog = exercises
    .slice(0, MAX_WORKOUT_CATALOG_ENTRIES)
    .map((exercise) => {
      const id = cleanText(exercise?.id, MAX_WORKOUT_CATALOG_FIELD_CHARS);
      const names = Array.isArray(exercise?.names)
        ? exercise.names
          .slice(0, MAX_WORKOUT_CATALOG_NAMES)
          .map((name) => cleanText(name, MAX_WORKOUT_CATALOG_FIELD_CHARS))
          .filter(Boolean)
        : [];
      return id ? `- ${id}: ${names.join(' / ')}` : '';
    })
    .filter(Boolean)
    .join('\n');

  return [
    'Convert a short free-text or spoken gym log into structured strength sets.',
    `The user's display unit system is "${unitSystem === 'imperial' ? 'imperial' : 'metric'}". weightKg MUST be kilograms.`,
    'Convert lb to kg (×0.453592). A bare weight is lb for imperial and kg for metric.',
    'Bodyweight moves use weightKg 0 unless extra load is stated.',
    'Map to the closest exact catalog id. Keep an unknown exercise with exerciseId "".',
    catalog,
    'Extract every set. reps is an integer; rir is null unless explicitly stated.',
    `User log: """${text}"""`,
  ].join('\n');
}

async function fetchProvider(url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function groqChat(env, { model, system, user, visionDataUrl, timeoutMs }) {
  const content = visionDataUrl
    ? [
        { type: 'text', text: user },
        { type: 'image_url', image_url: { url: visionDataUrl } },
      ]
    : user;
  let response;
  try {
    response = await fetchProvider('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        reasoning_effort: model.startsWith('qwen/')
          ? 'none'
          : model.startsWith('openai/gpt-oss-')
            ? 'low'
            : undefined,
        max_completion_tokens: 2_048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content },
        ],
      }),
    }, timeoutMs);
  } catch {
    return { errorResponse: json({ error: 'AI provider is temporarily unreachable' }, 502) };
  }
  if (!response.ok) return { errorResponse: providerError('AI', response) };
  const data = await response.json().catch(() => null);
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== 'string') return { errorResponse: json({ error: 'empty AI response' }, 502) };
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { errorResponse: json({ error: 'invalid AI response' }, 502) };
  }
}

async function handleParse(req, env, session) {
  if (!env.GROQ_API_KEY) return json({ error: 'AI service is unavailable' }, 503);
  if (!(req.headers.get('content-type') || '').includes('application/json')) {
    return json({ error: 'application/json required' }, 415);
  }
  const parsedBody = await readJson(req);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const body = parsedBody.value;
  const text = cleanText(body?.text);
  if (!text) return json({ error: 'missing text' }, 400);
  const exercises = Array.isArray(body?.exercises) ? body.exercises : [];
  return executeMeteredAi(req, env, session, 'workout_parse', 1, 0, async () => {
    const result = await groqChat(env, {
      model: env.GROQ_MODEL || 'openai/gpt-oss-120b',
      system: `You are a precise gym-log parser. ${SET_SHAPE}`,
      user: buildWorkoutPrompt(text, body?.unitSystem, exercises),
      timeoutMs: PARSE_PROVIDER_TIMEOUT_MS,
    });
    if (result.errorResponse) return result.errorResponse;
    const parsed = result.value;
    const sets = normalizeWorkoutSets(parsed?.sets);
    if (sets.length === 0) {
      return json({ error: 'AI response contained no usable workout sets' }, 502);
    }
    return json({ sets, note: cleanText(parsed?.note, 500) });
  });
}

async function handleTranscribe(req, env, session) {
  if (!env.GROQ_API_KEY) return json({ error: 'AI service is unavailable' }, 503);
  const parsedBody = await readMultipart(req, MAX_AUDIO_BYTES + MAX_MULTIPART_OVERHEAD, 'audio too large');
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const input = parsedBody.value;
  const file = input?.get('file');
  if (!file || typeof file === 'string') return json({ error: 'missing audio file' }, 400);
  const mime = AUDIO_MIMES.has(String(file.type).toLowerCase()) ? String(file.type).toLowerCase() : '';
  if (!mime) return json({ error: 'unsupported audio type' }, 415);
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_AUDIO_BYTES) {
    return json({ error: 'invalid audio size' }, 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const durationSeconds = parseIsoBmffDurationSeconds(bytes);
  if (durationSeconds == null) return json({ error: 'invalid M4A audio file' }, 400);
  if (durationSeconds > MAX_AUDIO_SECONDS) {
    return json({ error: `audio must be ${MAX_AUDIO_SECONDS} seconds or shorter` }, 413);
  }

  const form = new FormData();
  form.append('file', file, 'audio.m4a');
  form.append('model', env.GROQ_WHISPER_MODEL || 'whisper-large-v3');
  form.append('response_format', 'json');
  const language = cleanText(input.get('language'), 12);
  if (language) form.append('language', language);

  return executeMeteredAi(req, env, session, 'transcribe', 3, 0, async () => {
    let response;
    try {
      response = await fetchProvider('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.GROQ_API_KEY}` },
        body: form,
      }, TRANSCRIBE_PROVIDER_TIMEOUT_MS);
    } catch {
      return json({ error: 'AI provider is temporarily unreachable' }, 502);
    }
    if (!response.ok) return providerError('transcription', response);
    const data = await response.json().catch(() => null);
    const text = cleanText(data?.text, 8_000);
    return text ? json({ text }) : json({ error: 'invalid transcription response' }, 502);
  });
}

const FOOD_SHAPE =
  'Respond with ONLY a JSON object {"items":[{"name":string,"kcal":number,"proteinG":number}],"note":string}. ' +
  'Estimate realistic typical portions and scale explicit gram amounts.';

function bytesToDataUrl(bytes, mime) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

function normalizeFoodItems(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap((item) => {
    const name = cleanText(item?.name, 120);
    const rawKcal = Number(item?.kcal);
    const rawProteinG = Number(item?.proteinG);
    const kcal = Number.isFinite(rawKcal) ? Math.max(0, Math.min(20_000, rawKcal)) : 0;
    const proteinG = Number.isFinite(rawProteinG) ? Math.max(0, Math.min(1_000, rawProteinG)) : 0;
    return name ? [{ name, kcal: Math.round(kcal), proteinG: Math.round(proteinG * 10) / 10 }] : [];
  });
}

async function handleFood(req, env, session) {
  if (!env.GROQ_API_KEY) return json({ error: 'AI service is unavailable' }, 503);
  const contentType = req.headers.get('content-type') || '';
  let user;
  let visionDataUrl;
  let model = env.GROQ_MODEL || 'openai/gpt-oss-120b';

  if (contentType.includes('multipart/form-data')) {
    const parsedBody = await readMultipart(req, MAX_PHOTO_BYTES + MAX_MULTIPART_OVERHEAD, 'photo too large');
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const form = parsedBody.value;
    const file = form?.get('file');
    if (!file || typeof file === 'string') return json({ error: 'missing meal photo' }, 400);
    const mime = PHOTO_MIMES.has(file.type) ? file.type : '';
    if (!mime) return json({ error: 'unsupported photo type' }, 415);
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PHOTO_BYTES) {
      return json({ error: 'invalid photo size' }, 413);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    visionDataUrl = bytesToDataUrl(bytes, mime);
    user = 'Identify the foods in this selected meal photo and estimate calories and protein per item.';
    model = env.GROQ_VISION_MODEL || 'qwen/qwen3.6-27b';
  } else if (contentType.includes('application/json')) {
    const parsedBody = await readJson(req);
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const body = parsedBody.value;
    const text = cleanText(body?.text);
    if (!text) return json({ error: 'missing meal text' }, 400);
    user = text;
  } else {
    return json({ error: 'application/json or multipart/form-data required' }, 415);
  }

  const isPhoto = Boolean(visionDataUrl);
  return executeMeteredAi(req, env, session, isPhoto ? 'food_photo' : 'food_text', isPhoto ? 8 : 2, isPhoto ? 1 : 0, async () => {
    const result = await groqChat(env, {
      model,
      system: `You estimate meal nutrition for a fitness log. ${FOOD_SHAPE}`,
      user,
      visionDataUrl,
      timeoutMs: visionDataUrl ? FOOD_PHOTO_PROVIDER_TIMEOUT_MS : FOOD_TEXT_PROVIDER_TIMEOUT_MS,
    });
    if (result.errorResponse) return result.errorResponse;
    const items = normalizeFoodItems(result.value?.items);
    if (items.length === 0) {
      return json({ error: 'AI response contained no usable meal items' }, 502);
    }
    const totalKcal = items.reduce((sum, item) => sum + item.kcal, 0);
    const totalProteinG = items.reduce((sum, item) => sum + item.proteinG, 0);
    return json({
      items,
      totalKcal: Math.round(totalKcal),
      totalProteinG: Math.round(totalProteinG * 10) / 10,
      note: cleanText(result.value?.note, 500),
    });
  });
}

function sanitizeDeviceId(value) {
  const deviceId = cleanText(value, 64);
  return /^[A-Za-z0-9_-]{8,64}$/.test(deviceId) ? deviceId : '';
}

// Public ranking is not in v1. This endpoint exists only so prior TestFlight users can erase the
// legacy row whose random device id remains on their phone.
async function handleRankDelete(req, env) {
  if (!env.DB) return json({ error: 'legacy ranking store is unavailable' }, 503);
  if (!(req.headers.get('content-type') || '').includes('application/json')) {
    return json({ error: 'application/json required' }, 415);
  }
  const parsedBody = await readJson(req);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const body = parsedBody.value;
  const deviceId = sanitizeDeviceId(body?.deviceId);
  if (!deviceId) return json({ error: 'invalid deviceId' }, 400);
  await env.DB.prepare('DELETE FROM rank_entry WHERE device_id = ?').bind(deviceId).run();
  return json({ ok: true });
}

function retiredFeature() {
  return json({ error: 'feature not available in this release' }, 410);
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
    const knownPath = new Set([
      ...ENTITLEMENT_PATHS,
      '/parse',
      '/transcribe',
      '/food',
      '/rank/delete',
      '/rank/submit',
      '/rank/board',
      '/evolve',
      '/body-avatar',
    ]).has(pathname);
    if (!knownPath) return json({ error: 'not found' }, 404);
    const expectedMethod = pathname === '/entitlements/usage' ? 'GET' : 'POST';
    if (req.method !== expectedMethod) return json({ error: `${expectedMethod} required` }, 405);
    const livePath = ENTITLEMENT_PATHS.has(pathname) || AI_RATE_COST.has(pathname) || pathname === '/rank/delete';
    if (livePath && req.headers.get('x-reploom-client') !== CLIENT_HEADER_VALUE) {
      return json({ error: 'client marker required' }, 403);
    }
    if (pathname === '/entitlements/session') return handleEntitlementSession(req, env);

    let entitlement;
    if (pathname === '/entitlements/usage' || pathname === '/entitlements/delete' || AI_RATE_COST.has(pathname)) {
      entitlement = await authenticateEntitlement(req, env);
      if (entitlement.errorResponse) return entitlement.errorResponse;
    }
    if (pathname === '/entitlements/usage') return handleEntitlementUsage(req, env, entitlement.session);
    if (pathname === '/entitlements/delete') return handleEntitlementDelete(req, env, entitlement.session);

    const rateCost = pathname === '/food'
      && (req.headers.get('content-type') || '').includes('multipart/form-data')
      ? 8
      : AI_RATE_COST.get(pathname);
    if (rateCost) {
      const limited = await enforceAiRateLimit(req, env, rateCost, entitlement.session.actor);
      if (limited) return limited;
    }
    if (pathname === '/parse') return handleParse(req, env, entitlement.session);
    if (pathname === '/transcribe') return handleTranscribe(req, env, entitlement.session);
    if (pathname === '/food') return handleFood(req, env, entitlement.session);
    if (pathname === '/rank/delete') return handleRankDelete(req, env);
    return retiredFeature();
  },
  async scheduled(_event, env) {
    if (!requireDatabase(env)) return;
    await purgeExpiredEntitlementData(env, Date.now());
  },
};

export const __test = {
  createAppStoreJwt,
  decodeAppleTransactionJws,
  deriveAppAccountToken,
  parseIsoBmffDurationSeconds,
  signEntitlementSession,
  sandboxAttemptWindow,
  validateAppleTransaction,
  verifyEntitlementSessionToken,
};
