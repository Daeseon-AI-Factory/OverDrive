import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertRetentionCleanup,
  MemoryD1,
  seedRetentionFixture,
} from './helpers.mjs';

const source = await readFile(new URL('../src/safe-degraded.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { default: worker } = await import(moduleUrl);
const normalSource = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const normalModuleUrl = `data:text/javascript;base64,${Buffer.from(normalSource).toString('base64')}`;
const { __test } = await import(normalModuleUrl);
const originalFetch = globalThis.fetch;
const clientHeaders = { 'x-reploom-client': 'ios-v1' };
const entitlementSecret = 'safe-test-entitlement-secret-longer-than-thirty-two-characters';

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('fails every AI route closed without invoking a provider', async () => {
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response('{}');
  };

  for (const path of ['/parse', '/transcribe', '/food']) {
    const response = await worker.fetch(
      new Request(`https://worker.test${path}`, { method: 'POST', headers: clientHeaders }),
      { GROQ_API_KEY: 'present-but-inaccessible' },
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'AI service is unavailable' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(providerCalls, 0);
});

test('keeps the native client marker on AI and legacy deletion routes', async () => {
  for (const path of ['/parse', '/transcribe', '/food', '/rank/delete']) {
    const response = await worker.fetch(
      new Request(`https://worker.test${path}`, { method: 'POST' }),
      {},
    );
    assert.equal(response.status, 403);
  }
});

test('keeps retired public features unavailable', async () => {
  for (const path of ['/rank/submit', '/rank/board', '/evolve', '/body-avatar']) {
    const response = await worker.fetch(
      new Request(`https://worker.test${path}`, { method: 'POST' }),
      {},
    );
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: 'feature not available in this release' });
  }
});

test('preserves legacy rank deletion validation and exact D1 operation', async () => {
  const calls = [];
  const DB = {
    prepare(sql) {
      calls.push(['prepare', sql]);
      return {
        bind(deviceId) {
          calls.push(['bind', deviceId]);
          return {
            async run() {
              calls.push(['run']);
            },
          };
        },
      };
    },
  };

  const unsupported = await worker.fetch(
    new Request('https://worker.test/rank/delete', {
      method: 'POST',
      headers: clientHeaders,
      body: 'device_id_123',
    }),
    { DB },
  );
  assert.equal(unsupported.status, 415);

  const invalid = await worker.fetch(
    new Request('https://worker.test/rank/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...clientHeaders },
      body: JSON.stringify({ deviceId: 'short' }),
    }),
    { DB },
  );
  assert.equal(invalid.status, 400);

  const missingStore = await worker.fetch(
    new Request('https://worker.test/rank/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...clientHeaders },
      body: JSON.stringify({ deviceId: 'device_id_123' }),
    }),
    {},
  );
  assert.equal(missingStore.status, 503);

  const deleted = await worker.fetch(
    new Request('https://worker.test/rank/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...clientHeaders },
      body: JSON.stringify({ deviceId: 'device_id_123' }),
    }),
    { DB },
  );
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { ok: true });
  assert.deepEqual(calls, [
    ['prepare', 'DELETE FROM rank_entry WHERE device_id = ?'],
    ['bind', 'device_id_123'],
    ['run'],
  ]);
});

test('bounds the legacy deletion body by actual bytes', async () => {
  let databaseCalls = 0;
  const request = new Request('https://worker.test/rank/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...clientHeaders },
    body: new Uint8Array(129 * 1024),
  });
  assert.equal(request.headers.get('content-length'), null);

  const response = await worker.fetch(request, {
    DB: {
      prepare() {
        databaseCalls += 1;
      },
    },
  });
  assert.equal(response.status, 413);
  assert.equal(databaseCalls, 0);
});

test('aligns unknown, non-POST, and browser CORS behavior', async () => {
  const unknown = await worker.fetch(new Request('https://worker.test/unknown'), {});
  assert.equal(unknown.status, 404);

  const options = await worker.fetch(new Request('https://worker.test/parse', { method: 'OPTIONS' }), {});
  assert.equal(options.status, 405);
  assert.equal(options.headers.get('access-control-allow-origin'), null);

  const get = await worker.fetch(new Request('https://worker.test/rank/delete'), {});
  assert.equal(get.status, 405);
  assert.equal(get.headers.get('cache-control'), 'no-store');
});

test('keeps session exchange disabled but preserves authenticated usage and deletion', async () => {
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return new Response('{}');
  };
  const DB = new MemoryD1();
  const now = Date.now();
  const session = {
    v: 1,
    actor: 'a'.repeat(64),
    period: 'b'.repeat(64),
    epoch: 'c'.repeat(32),
    product: 'ai.daeseon.reploom.pro.monthly.v1',
    environment: 'Production',
    periodStart: now - 1_000,
    periodEnd: now + 60_000,
    iat: Math.floor(now / 1_000),
    exp: Math.floor(now / 1_000) + 60,
  };
  DB.principals.set(session.actor, session.epoch);
  DB.periods.set(`${session.actor}|${session.period}`, {
    actor: session.actor,
    period: session.period,
    credits_used: 12,
    photos_used: 1,
  });
  const token = await __test.signEntitlementSession(
    { ENTITLEMENT_SESSION_SECRET: entitlementSecret },
    session,
  );
  const env = { DB, ENTITLEMENT_SESSION_SECRET: entitlementSecret };

  const exchange = await worker.fetch(new Request('https://worker.test/entitlements/session', {
    method: 'POST', headers: clientHeaders,
  }), env);
  assert.equal(exchange.status, 503);
  assert.equal((await exchange.json()).code, 'entitlement_service_unavailable');

  const usage = await worker.fetch(new Request('https://worker.test/entitlements/usage', {
    method: 'GET', headers: { ...clientHeaders, authorization: `Bearer ${token}` },
  }), env);
  assert.equal(usage.status, 200);
  assert.equal((await usage.json()).usage.creditsUsed, 12);

  const deleted = await worker.fetch(new Request('https://worker.test/entitlements/delete', {
    method: 'POST', headers: { ...clientHeaders, authorization: `Bearer ${token}` },
  }), env);
  assert.equal(deleted.status, 200);
  assert.equal(DB.principals.size, 0);
  assert.equal(DB.periods.size, 0);
  assert.equal(DB.tombstones.size, 1);

  const invalidated = await worker.fetch(new Request('https://worker.test/entitlements/usage', {
    method: 'GET', headers: { ...clientHeaders, authorization: `Bearer ${token}` },
  }), env);
  assert.equal(invalidated.status, 401);
  assert.equal(providerCalls, 0);
});

test('safe scheduled cleanup removes only expired quota data, orphan principals, and tombstones', async () => {
  const DB = new MemoryD1();
  const ids = seedRetentionFixture(DB);
  const activePeriod = DB.periods.get(`${ids.activeActor}|${ids.activePeriod}`);
  activePeriod.credits_used = 8;
  activePeriod.photos_used = 1;
  DB.requests.set(`${ids.activeActor}|${'9'.repeat(64)}`, {
    actor: ids.activeActor,
    period: ids.activePeriod,
    requestKey: '9'.repeat(64),
    route: 'food_photo',
    credit_cost: 8,
    photo_cost: 1,
    state: 'reserved',
    created_at_ms: Date.now() - 180_000,
    updated_at_ms: Date.now() - 180_000,
  });
  await worker.scheduled({}, { DB });
  assertRetentionCleanup(assert, DB, ids);
  assert.equal(DB.requests.get(`${ids.activeActor}|${'9'.repeat(64)}`).state, 'refunded');
  assert.equal(activePeriod.credits_used, 0);
  assert.equal(activePeriod.photos_used, 0);
});
