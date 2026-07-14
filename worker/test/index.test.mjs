import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertRetentionCleanup,
  createApplePrivateKeyPem,
  encodeJws,
  MemoryD1,
  seedRetentionFixture,
} from './helpers.mjs';

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { default: worker, __test } = await import(moduleUrl);
const applePrivateKey = await createApplePrivateKeyPem();
const originalFetch = globalThis.fetch;

const CLIENT = { 'x-reploom-client': 'ios-v1' };
const SECRET = 'test-entitlement-secret-that-is-longer-than-thirty-two-characters';
const IDENTITY_SECRET = 'test-identity-secret-that-must-remain-stable-after-launch';
const PRODUCT_ID = 'ai.daeseon.reploom.pro.monthly.v1';
const BUNDLE_ID = 'ai.daeseon.reploom';
const APP_TRANSACTION_ID = '4000001234567890';
const APP_ACCOUNT_TOKEN = await __test.deriveAppAccountToken(APP_TRANSACTION_ID);
const TRANSACTION_ID = '2000001234567890';
const allowRateLimiter = { limit: async () => ({ success: true }) };

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function baseEnv(extra = {}) {
  return {
    DB: new MemoryD1(),
    AI_RATE_LIMITER: allowRateLimiter,
    GROQ_API_KEY: 'test-groq-key',
    ENTITLEMENT_IDENTITY_SECRET: IDENTITY_SECRET,
    ENTITLEMENT_SESSION_SECRET: SECRET,
    APPLE_IAP_ISSUER_ID: '00000000-0000-0000-0000-000000000001',
    APPLE_IAP_KEY_ID: 'ABCDEFGHIJ',
    APPLE_IAP_PRIVATE_KEY: applePrivateKey,
    ...extra,
  };
}

function transaction(overrides = {}) {
  const now = Date.now();
  return {
    transactionId: TRANSACTION_ID,
    originalTransactionId: '2000001234000000',
    bundleId: BUNDLE_ID,
    productId: PRODUCT_ID,
    type: 'Auto-Renewable Subscription',
    environment: 'Production',
    appTransactionId: APP_TRANSACTION_ID,
    appAccountToken: APP_ACCOUNT_TOKEN,
    purchaseDate: now - 24 * 60 * 60 * 1_000,
    expiresDate: now + 29 * 24 * 60 * 60 * 1_000,
    signedDate: now,
    ...overrides,
  };
}

function sessionRequest(
  body = { transactionId: TRANSACTION_ID, appAccountToken: APP_ACCOUNT_TOKEN },
  headers = {},
) {
  return new Request('https://worker.test/entitlements/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...CLIENT, ...headers },
    body: JSON.stringify(body),
  });
}

function stubApple(payload, { productionStatus = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith('https://api.storekit.apple.com')) {
      return productionStatus === 200
        ? new Response(JSON.stringify({ signedTransactionInfo: encodeJws(payload) }), { status: 200 })
        : new Response(JSON.stringify({ errorCode: 4040010 }), { status: productionStatus });
    }
    if (String(url).startsWith('https://api.storekit-sandbox.apple.com')) {
      return new Response(JSON.stringify({
        signedTransactionInfo: encodeJws({ ...payload, environment: 'Sandbox' }),
      }), { status: 200 });
    }
    throw new Error(`unexpected provider URL: ${url}`);
  };
  return calls;
}

async function authenticatedFixture(overrides = {}) {
  const env = baseEnv(overrides.env);
  const now = Date.now();
  const session = {
    v: 1,
    actor: 'a'.repeat(64),
    period: 'b'.repeat(64),
    epoch: 'c'.repeat(32),
    product: PRODUCT_ID,
    environment: 'Production',
    periodStart: now - 24 * 60 * 60 * 1_000,
    periodEnd: now + 29 * 24 * 60 * 60 * 1_000,
    iat: Math.floor(now / 1_000),
    exp: Math.floor(now / 1_000) + 15 * 60,
    ...overrides.session,
  };
  env.DB.principals.set(session.actor, session.epoch);
  env.DB.periods.set(`${session.actor}|${session.period}`, {
    actor: session.actor,
    period: session.period,
    period_start_ms: session.periodStart,
    period_end_ms: session.periodEnd,
    credits_used: overrides.creditsUsed || 0,
    photos_used: overrides.photosUsed || 0,
    attempt_credits: overrides.attemptCredits ?? overrides.creditsUsed ?? 0,
    photo_attempts: overrides.photoAttempts ?? overrides.photosUsed ?? 0,
  });
  const token = await __test.signEntitlementSession(env, session);
  return {
    env,
    session,
    token,
    headers: (requestId = 'request-0001') => ({
      ...CLIENT,
      authorization: `Bearer ${token}`,
      'x-reploom-request-id': requestId,
    }),
  };
}

const providerChat = (value) => new Response(
  JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }),
  { status: 200, headers: { 'content-type': 'application/json' } },
);
const validWorkoutChat = () => providerChat({
  sets: [{ exerciseId: 'bench', exerciseName: 'Bench', weightKg: 80, reps: 8 }],
});
const validFoodChat = () => providerChat({
  items: [{ name: 'Meal', kcal: 1, proteinG: 0 }],
});

function parseRequest(headers, text = 'bench 100 5') {
  return new Request('https://worker.test/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ text, exercises: [] }),
  });
}

function foodPhotoRequest(headers) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'meal.jpg', { type: 'image/jpeg' }));
  return new Request('https://worker.test/food', { method: 'POST', headers, body: form });
}

function isoBmffBox(type, payload, { extended = false } = {}) {
  const header = Buffer.alloc(extended ? 16 : 8);
  header.writeUInt32BE(extended ? 1 : header.length + payload.length, 0);
  header.write(type, 4, 4, 'ascii');
  if (extended) header.writeBigUInt64BE(BigInt(header.length + payload.length), 8);
  return Buffer.concat([header, payload]);
}

function minimalM4a(durationSeconds = 30, {
  version = 0,
  extendedFtyp = false,
  extendedMoov = false,
  extendedMvhd = false,
} = {}) {
  const timescale = 1_000;
  const durationUnits = Math.round(durationSeconds * timescale);
  const movieHeader = Buffer.alloc(version === 1 ? 32 : 20);
  movieHeader[0] = version;
  if (version === 1) {
    movieHeader.writeUInt32BE(timescale, 20);
    movieHeader.writeBigUInt64BE(BigInt(durationUnits), 24);
  } else {
    movieHeader.writeUInt32BE(timescale, 12);
    movieHeader.writeUInt32BE(durationUnits, 16);
  }
  const ftyp = isoBmffBox(
    'ftyp',
    Buffer.concat([Buffer.from('M4A ', 'ascii'), Buffer.alloc(4), Buffer.from('isom', 'ascii')]),
    { extended: extendedFtyp },
  );
  const mvhd = isoBmffBox('mvhd', movieHeader, { extended: extendedMvhd });
  return Buffer.concat([ftyp, isoBmffBox('moov', mvhd, { extended: extendedMoov })]);
}

function transcribeRequest(headers, {
  bytes = minimalM4a(),
  mime = 'audio/m4a',
  filename = 'voice.m4a',
} = {}) {
  const form = new FormData();
  form.append('file', new File([bytes], filename, { type: mime }));
  return new Request('https://worker.test/transcribe', { method: 'POST', headers, body: form });
}

test('exchanges a production transaction returned by the authenticated Apple API for a 15-minute session', async () => {
  const env = baseEnv();
  const appleCalls = stubApple(transaction());
  const response = await worker.fetch(sessionRequest(), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.entitlement.productId, PRODUCT_ID);
  assert.equal(body.entitlement.environment, 'Production');
  assert.equal(body.usage.creditsLimit, 1_000);
  assert.equal(body.usage.photosLimit, 60);
  assert.equal(typeof body.token, 'string');
  assert.ok(Date.parse(body.expiresAt) <= Date.now() + 15 * 60 * 1_000);
  assert.equal(env.DB.principals.size, 1);
  assert.equal(env.DB.periods.size, 1);

  const jwt = appleCalls[0].init.headers.authorization.slice(7);
  const [header, payload, signature] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), {
    alg: 'ES256', kid: 'ABCDEFGHIJ', typ: 'JWT',
  });
  assert.deepEqual(
    Object.fromEntries(Object.entries(JSON.parse(Buffer.from(payload, 'base64url')))
      .filter(([key]) => ['iss', 'aud', 'bid'].includes(key))),
    { iss: '00000000-0000-0000-0000-000000000001', aud: 'appstoreconnect-v1', bid: BUNDLE_ID },
  );
  assert.equal(Buffer.from(signature, 'base64url').length, 64);
});

test('derives the native-compatible account token from the exact opaque app transaction string', async () => {
  assert.equal(APP_ACCOUNT_TOKEN, 'f54bc028-84ed-8023-a31b-4da3c2d4c25c');
  assert.equal(
    await __test.deriveAppAccountToken('CaseSensitive.App:Txn-42'),
    '7685d053-2c0e-8219-b182-e3f5fdce6325',
  );
  assert.notEqual(
    await __test.deriveAppAccountToken('CaseSensitive.App:Txn-42'),
    await __test.deriveAppAccountToken('casesensitive.app:txn-42'),
  );
  assert.equal(await __test.deriveAppAccountToken(''), '');
  assert.equal(await __test.deriveAppAccountToken('x'.repeat(257)), '');
  assert.match(await __test.deriveAppAccountToken('opaque 유니코드 ID'), /^[0-9a-f-]{36}$/u);
});

test('keeps quota identity stable when the short-lived session signing key rotates', async () => {
  const env = baseEnv();
  const tx = transaction();
  stubApple(tx);
  const first = await worker.fetch(sessionRequest(), env);
  assert.equal(first.status, 200);
  const firstToken = (await first.json()).token;
  const actor = [...env.DB.principals.keys()][0];
  const period = [...env.DB.periods.keys()][0];

  env.ENTITLEMENT_SESSION_SECRET = 'rotated-session-secret-that-is-also-longer-than-thirty-two';
  stubApple(tx);
  const second = await worker.fetch(sessionRequest(), env);
  assert.equal(second.status, 200);
  const secondToken = (await second.json()).token;

  assert.equal([...env.DB.principals.keys()][0], actor);
  assert.equal([...env.DB.periods.keys()][0], period);
  assert.equal(env.DB.principals.size, 1);
  assert.equal(env.DB.periods.size, 1);
  assert.notEqual(secondToken, firstToken);
  assert.equal(
    (await __test.verifyEntitlementSessionToken(env, firstToken)).code,
    'entitlement_session_invalid',
  );
});

test('falls back to Apple sandbox only when production reports transaction not found', async () => {
  const env = baseEnv();
  const calls = stubApple(transaction({ environment: 'Sandbox' }), { productionStatus: 404 });
  const response = await worker.fetch(sessionRequest(), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).entitlement.environment, 'Sandbox');
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /api\.storekit\.apple\.com/u);
  assert.match(calls[1].url, /api\.storekit-sandbox\.apple\.com/u);
});

test('rejects wrong bundle, product, expired, revoked, and mismatched app account claims', async () => {
  const cases = [
    { payload: transaction({ bundleId: 'ai.attacker.app' }), code: 'subscription_not_active' },
    { payload: transaction({ productId: 'ai.daeseon.reploom.fake' }), code: 'subscription_not_active' },
    { payload: transaction({ expiresDate: Date.now() - 1 }), code: 'subscription_not_active' },
    { payload: transaction({ revocationDate: Date.now() - 1 }), code: 'subscription_not_active' },
  ];
  for (const entry of cases) {
    const env = baseEnv();
    stubApple(entry.payload);
    const response = await worker.fetch(sessionRequest(), env);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, entry.code);
    assert.equal(env.DB.principals.size, 0);
  }

  const env = baseEnv();
  stubApple(transaction());
  const response = await worker.fetch(sessionRequest({
    transactionId: TRANSACTION_ID,
    appAccountToken: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  }), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'subscription_invalid');

  const arbitraryToken = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const arbitraryEnv = baseEnv();
  stubApple(transaction({ appAccountToken: arbitraryToken }));
  const arbitraryBinding = await worker.fetch(sessionRequest({
    transactionId: TRANSACTION_ID,
    appAccountToken: arbitraryToken,
  }), arbitraryEnv);
  assert.equal(arbitraryBinding.status, 403);
  assert.equal((await arbitraryBinding.json()).code, 'subscription_invalid');
  assert.equal(arbitraryEnv.DB.principals.size, 0);
});

test('rejects malformed exchange input before contacting Apple', async () => {
  let calls = 0;
  let rateCalls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('{}');
  };
  const env = baseEnv({
    AI_RATE_LIMITER: { limit: async () => { rateCalls += 1; return { success: true }; } },
  });
  const invalidTransaction = await worker.fetch(sessionRequest({
    transactionId: 'not-a-transaction',
    appAccountToken: APP_ACCOUNT_TOKEN,
  }), env);
  assert.equal(invalidTransaction.status, 400);
  assert.equal((await invalidTransaction.json()).code, 'invalid_transaction_id');
  const invalidAccount = await worker.fetch(sessionRequest({
    transactionId: TRANSACTION_ID,
    appAccountToken: 'not-a-uuid',
  }), env);
  assert.equal(invalidAccount.status, 400);
  assert.equal((await invalidAccount.json()).code, 'invalid_app_account_token');
  assert.equal(calls, 0);
  assert.equal(rateCalls, 0);
});

test('rate-limits valid entitlement exchange before any Apple API request', async () => {
  let appleCalls = 0;
  let limiterKey = '';
  globalThis.fetch = async () => {
    appleCalls += 1;
    return new Response('{}');
  };
  const blocked = await worker.fetch(sessionRequest(undefined, { 'cf-connecting-ip': '203.0.113.10' }), baseEnv({
    AI_RATE_LIMITER: { limit: async ({ key }) => { limiterKey = key; return { success: false }; } },
  }));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal(limiterKey, 'ip:203.0.113.10');
  assert.equal(appleCalls, 0);

  const missing = await worker.fetch(sessionRequest(), baseEnv({ AI_RATE_LIMITER: undefined }));
  assert.equal(missing.status, 503);
  assert.equal(appleCalls, 0);
});

test('blocks forged and expired sessions before rate-limit or AI provider cost', async () => {
  const fixture = await authenticatedFixture();
  let providerCalls = 0;
  let rateCalls = 0;
  fixture.env.AI_RATE_LIMITER = { limit: async () => { rateCalls += 1; return { success: true }; } };
  globalThis.fetch = async () => {
    providerCalls += 1;
    return validWorkoutChat();
  };
  const [forgedPayload, forgedSignature] = fixture.token.split('.');
  const forged = `${forgedPayload}.${forgedSignature.startsWith('a') ? 'b' : 'a'}${forgedSignature.slice(1)}`;
  const forgedResponse = await worker.fetch(parseRequest({
    ...CLIENT,
    authorization: `Bearer ${forged}`,
    'x-reploom-request-id': 'forged-001',
  }), fixture.env);
  assert.equal(forgedResponse.status, 401);
  assert.equal((await forgedResponse.json()).code, 'entitlement_session_invalid');

  const expiredFixture = await authenticatedFixture({
    session: { iat: Math.floor(Date.now() / 1_000) - 1_000, exp: Math.floor(Date.now() / 1_000) - 1 },
  });
  const expiredResponse = await worker.fetch(
    parseRequest(expiredFixture.headers('expired-001')),
    expiredFixture.env,
  );
  assert.equal(expiredResponse.status, 401);
  assert.equal((await expiredResponse.json()).code, 'entitlement_session_expired');
  assert.equal(providerCalls, 0);
  assert.equal(rateCalls, 0);
});

test('allows the exact 1000-credit boundary then blocks without invoking the provider', async () => {
  const fixture = await authenticatedFixture({ creditsUsed: 999 });
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return providerChat({ sets: [{ exerciseId: 'bench', exerciseName: 'Bench', weightKg: 100, reps: 5 }] });
  };
  const allowed = await worker.fetch(parseRequest(fixture.headers('boundary-allowed')), fixture.env);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('x-reploom-credits-remaining'), '0');

  const blocked = await worker.fetch(parseRequest(fixture.headers('boundary-blocked')), fixture.env);
  const body = await blocked.json();
  assert.equal(blocked.status, 429);
  assert.equal(body.code, 'monthly_credit_limit_reached');
  assert.equal(body.usage.creditsUsed, 1_000);
  assert.equal(providerCalls, 1);
});

test('enforces the independent 60-photo cap and charges photo requests eight credits', async () => {
  const fixture = await authenticatedFixture({ creditsUsed: 400, photosUsed: 59 });
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return providerChat({ items: [{ name: 'Meal', kcal: 500, proteinG: 35 }] });
  };
  const allowed = await worker.fetch(foodPhotoRequest(fixture.headers('photo-allowed')), fixture.env);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('x-reploom-credits-remaining'), '592');
  assert.equal(allowed.headers.get('x-reploom-photos-remaining'), '0');

  const blocked = await worker.fetch(foodPhotoRequest(fixture.headers('photo-blocked')), fixture.env);
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).code, 'monthly_photo_limit_reached');
  assert.equal(providerCalls, 1);
});

test('parses v0 and v1 M4A movie durations including extended-size boxes', () => {
  assert.equal(__test.parseIsoBmffDurationSeconds(minimalM4a(30)), 30);
  assert.equal(__test.parseIsoBmffDurationSeconds(minimalM4a(12.5, {
    version: 1,
    extendedFtyp: true,
    extendedMoov: true,
    extendedMvhd: true,
  })), 12.5);
  assert.equal(__test.parseIsoBmffDurationSeconds(new Uint8Array([1, 2, 3])), null);
});

test('accepts a bounded valid M4A before metering and transcription', async () => {
  const fixture = await authenticatedFixture();
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response(JSON.stringify({ text: 'bench press 100 for 5' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const response = await worker.fetch(transcribeRequest(
    fixture.headers('valid-m4a-transcription'),
    { bytes: minimalM4a(30, { version: 1, extendedMoov: true }) },
  ), fixture.env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { text: 'bench press 100 for 5' });
  assert.equal(providerCalls, 1);
  const quota = fixture.env.DB.periods.get(`${fixture.session.actor}|${fixture.session.period}`);
  assert.equal(quota.credits_used, 3);
  assert.equal(quota.attempt_credits, 3);
  assert.equal(fixture.env.DB.requests.size, 1);
});

test('rejects disallowed or out-of-contract audio inputs before quota reservation or provider cost', async () => {
  const cases = [
    {
      request: (headers) => transcribeRequest(headers, { mime: 'audio/wav' }),
      status: 415,
      error: 'unsupported audio type',
    },
    {
      request: (headers) => transcribeRequest(headers, { bytes: new Uint8Array([1, 2, 3]) }),
      status: 400,
      error: 'invalid M4A audio file',
    },
    {
      request: (headers) => transcribeRequest(headers, { bytes: minimalM4a(35.001) }),
      status: 413,
      error: 'audio must be 35 seconds or shorter',
    },
    {
      request: (headers) => transcribeRequest(headers, { bytes: new Uint8Array(1 * 1024 * 1024 + 1) }),
      status: 413,
      error: 'invalid audio size',
    },
  ];

  for (const [index, entry] of cases.entries()) {
    const fixture = await authenticatedFixture();
    let providerCalls = 0;
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response('{}');
    };
    const response = await worker.fetch(
      entry.request(fixture.headers(`unsafe-audio-${index}`)),
      fixture.env,
    );
    assert.equal(response.status, entry.status);
    assert.equal((await response.json()).error, entry.error);
    assert.equal(providerCalls, 0);
    assert.equal(fixture.env.DB.requests.size, 0);
    const quota = fixture.env.DB.periods.get(`${fixture.session.actor}|${fixture.session.period}`);
    assert.equal(quota.credits_used, 0);
    assert.equal(quota.attempt_credits, 0);
  }
});

test('rejects meal photos over 2,750,000 raw bytes before quota reservation or provider cost', async () => {
  const fixture = await authenticatedFixture();
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response('{}');
  };
  const form = new FormData();
  form.append('file', new File([new Uint8Array(2_750_001)], 'meal.jpg', { type: 'image/jpeg' }));
  const response = await worker.fetch(new Request('https://worker.test/food', {
    method: 'POST', headers: fixture.headers('oversized-meal-photo'), body: form,
  }), fixture.env);
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'invalid photo size');
  assert.equal(providerCalls, 0);
  assert.equal(fixture.env.DB.requests.size, 0);
  const quota = fixture.env.DB.periods.get(`${fixture.session.actor}|${fixture.session.period}`);
  assert.equal(quota.credits_used, 0);
  assert.equal(quota.photos_used, 0);
  assert.equal(quota.attempt_credits, 0);
  assert.equal(quota.photo_attempts, 0);
});

test('makes request retries idempotent and never double-invokes the provider', async () => {
  const fixture = await authenticatedFixture();
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return validWorkoutChat();
  };
  const first = await worker.fetch(parseRequest(fixture.headers('idempotent-001')), fixture.env);
  assert.equal(first.status, 200);
  const retry = await worker.fetch(parseRequest(fixture.headers('idempotent-001')), fixture.env);
  assert.equal(retry.status, 409);
  assert.equal((await retry.json()).code, 'request_already_completed');
  assert.equal(providerCalls, 1);
  const quota = fixture.env.DB.periods.get(`${fixture.session.actor}|${fixture.session.period}`);
  assert.equal(quota.credits_used, 1);
  assert.equal(fixture.env.DB.requests.size, 1);
});

test('refunds quota on provider and malformed provider-response failures', async () => {
  const fixture = await authenticatedFixture();
  globalThis.fetch = async () => new Response('provider failed', { status: 503 });
  const providerFailure = await worker.fetch(parseRequest(fixture.headers('refund-provider')), fixture.env);
  assert.equal(providerFailure.status, 502);

  globalThis.fetch = async () => new Response('not-json', { status: 200 });
  const malformed = await worker.fetch(
    transcribeRequest(fixture.headers('refund-invalid-response')),
    fixture.env,
  );
  assert.equal(malformed.status, 502);
  assert.equal((await malformed.json()).error, 'invalid transcription response');

  const quota = fixture.env.DB.periods.get(`${fixture.session.actor}|${fixture.session.period}`);
  assert.equal(quota.credits_used, 0);
  assert.deepEqual([...fixture.env.DB.requests.values()].map((row) => row.state), ['refunded', 'refunded']);
  assert.equal(quota.attempt_credits, 4);
  assert.equal(quota.photo_attempts, 0);
});

test('refunds structurally empty workout and meal-photo results without restoring attempt caps', async () => {
  const fixture = await authenticatedFixture();
  globalThis.fetch = async () => providerChat({ sets: [{}] });
  const emptyWorkout = await worker.fetch(
    parseRequest(fixture.headers('refund-empty-workout')),
    fixture.env,
  );
  assert.equal(emptyWorkout.status, 502);
  assert.equal((await emptyWorkout.json()).error, 'AI response contained no usable workout sets');

  globalThis.fetch = async () => providerChat({ items: [] });
  const emptyPhoto = await worker.fetch(
    foodPhotoRequest(fixture.headers('refund-empty-photo')),
    fixture.env,
  );
  assert.equal(emptyPhoto.status, 502);
  assert.equal((await emptyPhoto.json()).error, 'AI response contained no usable meal items');

  const quota = fixture.env.DB.periods.get(`${fixture.session.actor}|${fixture.session.period}`);
  assert.equal(quota.credits_used, 0);
  assert.equal(quota.photos_used, 0);
  assert.equal(quota.attempt_credits, 9);
  assert.equal(quota.photo_attempts, 1);
  assert.deepEqual([...fixture.env.DB.requests.values()].map((row) => row.state), ['refunded', 'refunded']);
});

test('bounds refunded provider attempts and request rows without charging successful-use quota', async () => {
  const fixture = await authenticatedFixture({ attemptCredits: 1_249 });
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response('provider failed', { status: 503 });
  };

  const responses = await Promise.all([
    worker.fetch(parseRequest(fixture.headers('attempt-headroom-a')), fixture.env),
    worker.fetch(parseRequest(fixture.headers('attempt-headroom-b')), fixture.env),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [429, 502]);
  const blocked = responses.find((response) => response.status === 429);
  assert.equal((await blocked.json()).code, 'monthly_provider_attempt_limit_reached');

  const quota = fixture.env.DB.periods.get(`${fixture.session.actor}|${fixture.session.period}`);
  assert.equal(providerCalls, 1);
  assert.equal(quota.credits_used, 0);
  assert.equal(quota.attempt_credits, 1_250);
  assert.equal(fixture.env.DB.requests.size, 1);
});

test('bounds refunded meal-photo attempts independently of successful photo allowance', async () => {
  const fixture = await authenticatedFixture({ attemptCredits: 600, photoAttempts: 74 });
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response('provider failed', { status: 503 });
  };

  const lastHeadroom = await worker.fetch(foodPhotoRequest(fixture.headers('photo-attempt-headroom')), fixture.env);
  assert.equal(lastHeadroom.status, 502);
  const blocked = await worker.fetch(foodPhotoRequest(fixture.headers('photo-attempt-blocked')), fixture.env);
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).code, 'monthly_photo_attempt_limit_reached');
  assert.equal(providerCalls, 1);
  assert.equal(fixture.env.DB.requests.size, 1);
  const quota = fixture.env.DB.periods.get(`${fixture.session.actor}|${fixture.session.period}`);
  assert.equal(quota.photos_used, 0);
  assert.equal(quota.photo_attempts, 75);
});

test('keeps the Sandbox daily safety budget across accelerated billing periods and privacy deletion', async () => {
  const fixture = await authenticatedFixture({
    session: { environment: 'Sandbox', periodEnd: Date.now() + 5 * 60 * 1_000 },
  });
  const window = await __test.sandboxAttemptWindow(fixture.env, fixture.session, Date.now());
  fixture.env.DB.sandboxDaily.set(`${fixture.session.actor}|${window.dayKey}`, {
    actor: fixture.session.actor,
    dayKey: window.dayKey,
    day_start_ms: window.dayStartMs,
    day_end_ms: window.dayEndMs,
    attempt_credits: 200,
    photo_attempts: 12,
    updated_at_ms: Date.now(),
  });

  const deleted = await worker.fetch(new Request('https://worker.test/entitlements/delete', {
    method: 'POST', headers: { ...CLIENT, authorization: `Bearer ${fixture.token}` },
  }), fixture.env);
  assert.equal(deleted.status, 200);
  assert.equal(fixture.env.DB.principals.size, 0);
  assert.equal(fixture.env.DB.periods.size, 0);
  assert.equal(fixture.env.DB.requests.size, 0);
  assert.equal(fixture.env.DB.sandboxDaily.size, 1);

  const renewedSession = {
    ...fixture.session,
    period: 'd'.repeat(64),
    periodStart: fixture.session.periodEnd,
    periodEnd: fixture.session.periodEnd + 5 * 60 * 1_000,
  };
  fixture.env.DB.tombstones.clear();
  fixture.env.DB.principals.set(renewedSession.actor, renewedSession.epoch);
  fixture.env.DB.periods.set(`${renewedSession.actor}|${renewedSession.period}`, {
    actor: renewedSession.actor,
    period: renewedSession.period,
    period_start_ms: renewedSession.periodStart,
    period_end_ms: renewedSession.periodEnd,
    credits_used: 0,
    photos_used: 0,
    attempt_credits: 0,
    photo_attempts: 0,
  });
  const renewedToken = await __test.signEntitlementSession(fixture.env, renewedSession);
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return validWorkoutChat();
  };
  const blocked = await worker.fetch(parseRequest({
    ...CLIENT,
    authorization: `Bearer ${renewedToken}`,
    'x-reploom-request-id': 'sandbox-renewed-blocked',
  }), fixture.env);
  assert.equal(blocked.status, 429);
  const body = await blocked.json();
  assert.equal(body.code, 'sandbox_daily_provider_attempt_limit_reached');
  assert.equal(body.resetAt, new Date(window.dayEndMs).toISOString());
  assert.equal(providerCalls, 0);
});

test('refunds only stale reservations before usage reads and preserves active work', async () => {
  const fixture = await authenticatedFixture({ creditsUsed: 9, photosUsed: 1 });
  const now = Date.now();
  fixture.env.DB.requests.set(`${fixture.session.actor}|${'d'.repeat(64)}`, {
    actor: fixture.session.actor,
    period: fixture.session.period,
    requestKey: 'd'.repeat(64),
    route: 'food_photo',
    credit_cost: 8,
    photo_cost: 1,
    state: 'reserved',
    created_at_ms: now - 180_000,
    updated_at_ms: now - 180_000,
  });
  fixture.env.DB.requests.set(`${fixture.session.actor}|${'e'.repeat(64)}`, {
    actor: fixture.session.actor,
    period: fixture.session.period,
    requestKey: 'e'.repeat(64),
    route: 'workout_parse',
    credit_cost: 1,
    photo_cost: 0,
    state: 'reserved',
    created_at_ms: now - 30_000,
    updated_at_ms: now - 30_000,
  });

  const response = await worker.fetch(new Request('https://worker.test/entitlements/usage', {
    method: 'GET', headers: { ...CLIENT, authorization: `Bearer ${fixture.token}` },
  }), fixture.env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).usage, {
    creditsUsed: 1,
    creditsLimit: 1_000,
    creditsRemaining: 999,
    photosUsed: 0,
    photosLimit: 60,
    photosRemaining: 60,
    resetAt: new Date(fixture.session.periodEnd).toISOString(),
  });
  assert.equal(fixture.env.DB.requests.get(`${fixture.session.actor}|${'d'.repeat(64)}`).state, 'refunded');
  assert.equal(fixture.env.DB.requests.get(`${fixture.session.actor}|${'e'.repeat(64)}`).state, 'reserved');
});

test('fails closed if a reservation was refunded before provider completion', async () => {
  const fixture = await authenticatedFixture();
  globalThis.fetch = async () => {
    const row = [...fixture.env.DB.requests.values()].find((candidate) => candidate.state === 'reserved');
    assert.ok(row);
    row.state = 'refunded';
    const quota = fixture.env.DB.periods.get(`${fixture.session.actor}|${fixture.session.period}`);
    quota.credits_used = Math.max(0, quota.credits_used - row.credit_cost);
    return validWorkoutChat();
  };

  const response = await worker.fetch(parseRequest(fixture.headers('late-completion')), fixture.env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'usage_service_unavailable');
  assert.equal(fixture.env.DB.periods.get(`${fixture.session.actor}|${fixture.session.period}`).credits_used, 0);
});

test('returns a completed AI result when only the post-completion usage refresh fails', async () => {
  const fixture = await authenticatedFixture();
  const prepare = fixture.env.DB.prepare.bind(fixture.env.DB);
  fixture.env.DB.prepare = (sql) => {
    if (
      sql.startsWith('SELECT credits_used, photos_used FROM ai_quota_period')
      && [...fixture.env.DB.requests.values()].some((row) => row.state === 'completed')
    ) {
      return {
        bind() {
          return { async first() { throw new Error('temporary usage read failure'); } };
        },
      };
    }
    return prepare(sql);
  };
  globalThis.fetch = async () => providerChat({
    sets: [{ exerciseId: 'bench', exerciseName: 'Bench', weightKg: 80, reps: 8 }],
  });

  const response = await worker.fetch(parseRequest(fixture.headers('usage-header-failure')), fixture.env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-reploom-credits-remaining'), null);
  assert.equal((await response.json()).sets[0].exerciseId, 'bench');
  assert.equal(fixture.env.DB.periods.get(`${fixture.session.actor}|${fixture.session.period}`).credits_used, 1);
});

test('returns usage without changing it and requires a valid principal epoch', async () => {
  const fixture = await authenticatedFixture({ creditsUsed: 41, photosUsed: 2 });
  const response = await worker.fetch(new Request('https://worker.test/entitlements/usage', {
    method: 'GET', headers: { ...CLIENT, authorization: `Bearer ${fixture.token}` },
  }), fixture.env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).usage, {
    creditsUsed: 41,
    creditsLimit: 1_000,
    creditsRemaining: 959,
    photosUsed: 2,
    photosLimit: 60,
    photosRemaining: 58,
    resetAt: new Date(fixture.session.periodEnd).toISOString(),
  });

  fixture.env.DB.principals.delete(fixture.session.actor);
  const invalidated = await worker.fetch(new Request('https://worker.test/entitlements/usage', {
    method: 'GET', headers: { ...CLIENT, authorization: `Bearer ${fixture.token}` },
  }), fixture.env);
  assert.equal(invalidated.status, 401);
  assert.equal((await invalidated.json()).code, 'entitlement_session_invalid');
});

test('authenticated deletion erases detail, invalidates the session, and blocks reset abuse until renewal', async () => {
  const fixture = await authenticatedFixture({ creditsUsed: 20, photosUsed: 1 });
  const deleted = await worker.fetch(new Request('https://worker.test/entitlements/delete', {
    method: 'POST', headers: { ...CLIENT, authorization: `Bearer ${fixture.token}` },
  }), fixture.env);
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), {
    ok: true,
    blockedUntil: new Date(fixture.session.periodEnd).toISOString(),
  });
  assert.equal(fixture.env.DB.principals.size, 0);
  assert.equal(fixture.env.DB.periods.size, 0);
  assert.equal(fixture.env.DB.requests.size, 0);
  assert.equal(fixture.env.DB.tombstones.size, 1);

  const oldToken = await worker.fetch(new Request('https://worker.test/entitlements/usage', {
    method: 'GET', headers: { ...CLIENT, authorization: `Bearer ${fixture.token}` },
  }), fixture.env);
  assert.equal(oldToken.status, 401);

  const tx = transaction({
    purchaseDate: fixture.session.periodStart,
    expiresDate: fixture.session.periodEnd,
  });
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(IDENTITY_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const appleActorBytes = new Uint8Array(await crypto.subtle.sign(
    'HMAC', hmacKey, new TextEncoder().encode(`actor:${APP_ACCOUNT_TOKEN}`),
  ));
  const appleActor = Buffer.from(appleActorBytes).toString('hex');
  fixture.env.DB.tombstones.clear();
  fixture.env.DB.tombstones.set(appleActor, {
    blocked_until_ms: fixture.session.periodEnd,
    deleted_at_ms: Date.now(),
  });
  stubApple(tx);
  const reissue = await worker.fetch(sessionRequest(), fixture.env);
  assert.equal(reissue.status, 403);
  const reissueBody = await reissue.json();
  assert.equal(reissueBody.code, 'data_deleted_until_reset');
  assert.equal(reissueBody.resetAt, new Date(fixture.session.periodEnd).toISOString());
});

test('keeps deletion tombstones atomic with concurrent entitlement initialization', async () => {
  const env = baseEnv();
  const tx = transaction();
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(IDENTITY_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const actorBytes = new Uint8Array(await crypto.subtle.sign(
    'HMAC', hmacKey, new TextEncoder().encode(`actor:${APP_ACCOUNT_TOKEN}`),
  ));
  const actor = Buffer.from(actorBytes).toString('hex');
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async (statements) => {
    env.DB.tombstones.set(actor, {
      blocked_until_ms: tx.expiresDate,
      deleted_at_ms: Date.now(),
    });
    return batch(statements);
  };
  stubApple(tx);

  const response = await worker.fetch(sessionRequest(), env);
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'data_deleted_until_reset');
  assert.equal(env.DB.principals.size, 0);
  assert.equal(env.DB.periods.size, 0);
  assert.equal(env.DB.tombstones.has(actor), true);
});

test('scheduled cleanup removes expired quota detail and orphan principals while preserving active data', async () => {
  const env = baseEnv();
  const ids = seedRetentionFixture(env.DB);
  const activePeriod = env.DB.periods.get(`${ids.activeActor}|${ids.activePeriod}`);
  activePeriod.credits_used = 2;
  env.DB.requests.set(`${ids.activeActor}|${'9'.repeat(64)}`, {
    actor: ids.activeActor,
    period: ids.activePeriod,
    requestKey: '9'.repeat(64),
    route: 'food_text',
    credit_cost: 2,
    photo_cost: 0,
    state: 'reserved',
    created_at_ms: Date.now() - 180_000,
    updated_at_ms: Date.now() - 180_000,
  });
  await worker.scheduled({}, env);
  assertRetentionCleanup(assert, env.DB, ids);
  assert.equal(env.DB.requests.get(`${ids.activeActor}|${'9'.repeat(64)}`).state, 'refunded');
  assert.equal(activePeriod.credits_used, 0);
});

test('validates request bodies before reserving quota or invoking a provider', async () => {
  const fixture = await authenticatedFixture();
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return providerChat({ sets: [] });
  };
  const oversized = await worker.fetch(new Request('https://worker.test/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...fixture.headers('oversized-body') },
    body: JSON.stringify({ text: 'bench', padding: 'x'.repeat(140 * 1024) }),
  }), fixture.env);
  assert.equal(oversized.status, 413);

  const missingRequestId = await worker.fetch(parseRequest({
    ...CLIENT, authorization: `Bearer ${fixture.token}`,
  }), fixture.env);
  assert.equal(missingRequestId.status, 400);
  assert.equal((await missingRequestId.json()).code, 'invalid_request_id');
  assert.equal(providerCalls, 0);
  assert.equal(fixture.env.DB.requests.size, 0);
});

test('caps the workout catalog before constructing the paid provider prompt', async () => {
  const fixture = await authenticatedFixture();
  const exercises = Array.from({ length: 70 }, (_, index) => ({
    id: `exercise-${index}`,
    names: Array.from({ length: 5 }, (_unused, nameIndex) => `alias-${index}-${nameIndex}`),
  }));
  let providerBody;
  globalThis.fetch = async (_url, init) => {
    providerBody = JSON.parse(String(init?.body));
    return validWorkoutChat();
  };

  const response = await worker.fetch(new Request('https://worker.test/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...fixture.headers('bounded-catalog') },
    body: JSON.stringify({ text: 'messy workout', unitSystem: 'metric', exercises }),
  }), fixture.env);

  assert.equal(response.status, 200);
  const prompt = providerBody.messages[1].content;
  assert.match(prompt, /- exercise-63:/u);
  assert.doesNotMatch(prompt, /- exercise-64:/u);
  assert.match(prompt, /alias-0-3/u);
  assert.doesNotMatch(prompt, /alias-0-4/u);
  assert.ok(prompt.length < 25_000);
});

test('normalizes workout and food provider responses while preserving response shapes', async () => {
  const fixture = await authenticatedFixture();
  globalThis.fetch = async (url) => String(url).includes('/chat/completions')
    ? providerChat({
      sets: [
        { exerciseId: 'bench', exerciseName: 'Bench', weightKg: -2, reps: 5.6, rir: null },
        { exerciseId: 'row', exerciseName: 'Row', weightKg: 99_999, reps: 4, rir: 99, isBodyweight: true },
      ],
    })
    : new Response('{}');
  const parse = await worker.fetch(parseRequest(fixture.headers('normalize-workout')), fixture.env);
  assert.equal(parse.status, 200);
  assert.deepEqual((await parse.json()).sets, [
    { exerciseId: 'bench', exerciseName: 'Bench', weightKg: 0, reps: 6, rir: null, isBodyweight: false },
    { exerciseId: 'row', exerciseName: 'Row', weightKg: 5_000, reps: 4, rir: null, isBodyweight: true },
  ]);

  globalThis.fetch = async () => providerChat({
    items: [
      { name: 'Impossible meal', kcal: 'Infinity', proteinG: '1e999' },
      { name: 'Normal meal', kcal: 640.4, proteinG: 42.26 },
    ],
  });
  const food = await worker.fetch(new Request('https://worker.test/food', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...fixture.headers('normalize-food') },
    body: JSON.stringify({ text: 'meal' }),
  }), fixture.env);
  assert.equal(food.status, 200);
  assert.deepEqual((await food.json()).items, [
    { name: 'Impossible meal', kcal: 0, proteinG: 0 },
    { name: 'Normal meal', kcal: 640, proteinG: 42.3 },
  ]);
});

test('keeps subscriber cost limiting as a second fail-closed layer after subscription auth', async () => {
  const fixture = await authenticatedFixture({ env: { AI_RATE_LIMITER: undefined } });
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return providerChat({ sets: [] });
  };
  const missing = await worker.fetch(parseRequest(fixture.headers('rate-missing')), fixture.env);
  assert.equal(missing.status, 503);

  fixture.env.AI_RATE_LIMITER = { limit: async () => ({ success: false }) };
  const blocked = await worker.fetch(parseRequest(fixture.headers('rate-blocked')), fixture.env);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal(providerCalls, 0);
  assert.equal(fixture.env.DB.requests.size, 0);
});

test('isolates paid AI edge buckets for two subscribers on the same gym IP', async () => {
  const callsByKey = new Map();
  const keys = [];
  const limiter = {
    limit: async ({ key }) => {
      keys.push(key);
      const next = (callsByKey.get(key) || 0) + 1;
      callsByKey.set(key, next);
      return { success: next <= 1 };
    },
  };
  const first = await authenticatedFixture({
    env: { AI_RATE_LIMITER: limiter },
    session: { actor: 'a'.repeat(64) },
  });
  const second = await authenticatedFixture({
    env: { AI_RATE_LIMITER: limiter },
    session: { actor: 'd'.repeat(64), period: 'e'.repeat(64), epoch: 'f'.repeat(32) },
  });
  globalThis.fetch = async () => validWorkoutChat();
  const sharedIp = { 'cf-connecting-ip': '198.51.100.25' };

  const firstResponse = await worker.fetch(parseRequest({
    ...first.headers('shared-gym-first'),
    ...sharedIp,
  }), first.env);
  const secondResponse = await worker.fetch(parseRequest({
    ...second.headers('shared-gym-second'),
    ...sharedIp,
  }), second.env);

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 200);
  assert.deepEqual(keys, [
    `subscriber:${'a'.repeat(64)}`,
    `subscriber:${'d'.repeat(64)}`,
  ]);
});

test('charges the edge limiter with the full meal-photo weight before provider work', async () => {
  let rateCalls = 0;
  const fixture = await authenticatedFixture({
    env: { AI_RATE_LIMITER: { limit: async () => { rateCalls += 1; return { success: true }; } } },
  });
  globalThis.fetch = async () => validFoodChat();

  const photo = await worker.fetch(foodPhotoRequest(fixture.headers('edge-photo-weight')), fixture.env);
  assert.equal(photo.status, 200);
  const textFood = await worker.fetch(new Request('https://worker.test/food', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...fixture.headers('edge-text-weight') },
    body: JSON.stringify({ text: 'rice' }),
  }), fixture.env);
  assert.equal(textFood.status, 200);
  assert.equal(rateCalls, 10);
});

test('keeps native marker, legacy delete, retired routes, and browser CORS behavior', async () => {
  const missingMarker = await worker.fetch(new Request('https://worker.test/entitlements/session', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }), baseEnv());
  assert.equal(missingMarker.status, 403);

  const env = baseEnv();
  const deleted = await worker.fetch(new Request('https://worker.test/rank/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...CLIENT },
    body: JSON.stringify({ deviceId: 'device_id_123' }),
  }), env);
  assert.equal(deleted.status, 200);
  assert.deepEqual(env.DB.rankDeletes, ['device_id_123']);

  for (const path of ['/rank/submit', '/rank/board', '/evolve', '/body-avatar']) {
    const response = await worker.fetch(new Request(`https://worker.test${path}`, { method: 'POST' }), {});
    assert.equal(response.status, 410);
  }
  const options = await worker.fetch(new Request('https://worker.test/parse', { method: 'OPTIONS' }), {});
  assert.equal(options.status, 405);
  assert.equal(options.headers.get('access-control-allow-origin'), null);
});
