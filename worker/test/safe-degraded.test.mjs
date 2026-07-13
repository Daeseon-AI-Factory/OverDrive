import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/safe-degraded.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { default: worker } = await import(moduleUrl);
const originalFetch = globalThis.fetch;
const clientHeaders = { 'x-reploom-client': 'ios-v1' };

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
