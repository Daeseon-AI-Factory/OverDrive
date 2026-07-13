import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { default: worker } = await import(moduleUrl);
const originalFetch = globalThis.fetch;
const allowRateLimiter = { limit: async () => ({ success: true }) };
const env = (extra = {}) => ({ AI_RATE_LIMITER: allowRateLimiter, ...extra });
const clientHeaders = { 'x-reploom-client': 'ios-v1' };

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const providerChat = (value) =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

test('rejects oversized JSON by actual bytes when Content-Length is absent', async () => {
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return providerChat({ sets: [] });
  };
  const body = JSON.stringify({ text: 'bench', padding: 'x'.repeat(140 * 1024) });
  const request = new Request('https://worker.test/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...clientHeaders },
    body,
  });
  assert.equal(request.headers.get('content-length'), null);

  const response = await worker.fetch(request, env({ GROQ_API_KEY: 'test' }));
  assert.equal(response.status, 413);
  assert.equal(providerCalls, 0);
});

test('normalizes provider workout sets and preserves an omitted RIR as null', async () => {
  let providerRequest;
  globalThis.fetch = async (_url, init) => {
    providerRequest = JSON.parse(init.body);
    return providerChat({
      sets: [
        { exerciseId: 'bench', exerciseName: 'Bench', weightKg: -2, reps: 5.6, rir: null, isBodyweight: 'yes', ignored: true },
        { exerciseId: '', exerciseName: '', weightKg: 20, reps: 5 },
        { exerciseId: 'row', exerciseName: 'Row', weightKg: 99_999, reps: 4, rir: 99, isBodyweight: true },
      ],
      note: 'ok',
    });
  };
  const response = await worker.fetch(
    new Request('https://worker.test/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...clientHeaders },
      body: JSON.stringify({ text: 'bench 100 5', exercises: [] }),
    }),
    env({ GROQ_API_KEY: 'test' }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(providerRequest.model, 'openai/gpt-oss-120b');
  assert.equal(providerRequest.reasoning_effort, 'low');
  assert.equal(providerRequest.max_completion_tokens, 2_048);
  assert.deepEqual(body.sets, [
    { exerciseId: 'bench', exerciseName: 'Bench', weightKg: 0, reps: 6, rir: null, isBodyweight: false },
    { exerciseId: 'row', exerciseName: 'Row', weightKg: 5_000, reps: 4, rir: null, isBodyweight: true },
  ]);
});

test('normalizes non-finite food numbers to zero instead of maximum values', async () => {
  globalThis.fetch = async () => providerChat({
    items: [
      { name: 'Impossible meal', kcal: 'Infinity', proteinG: '1e999' },
      { name: 'Normal meal', kcal: 640.4, proteinG: 42.26 },
    ],
  });
  const response = await worker.fetch(
    new Request('https://worker.test/food', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...clientHeaders },
      body: JSON.stringify({ text: 'meal' }),
    }),
    env({ GROQ_API_KEY: 'test' }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items, [
    { name: 'Impossible meal', kcal: 0, proteinG: 0 },
    { name: 'Normal meal', kcal: 640, proteinG: 42.3 },
  ]);
});

test('rejects malformed successful transcription responses', async () => {
  globalThis.fetch = async () => new Response('not-json', { status: 200 });
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'voice.m4a', { type: 'audio/mp4' }));
  const response = await worker.fetch(
    new Request('https://worker.test/transcribe', { method: 'POST', headers: clientHeaders, body: form }),
    env({ GROQ_API_KEY: 'test' }),
  );
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'invalid transcription response' });
});

test('rejects oversized multipart bodies before provider invocation', async () => {
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return providerChat({ items: [] });
  };
  const request = new Request('https://worker.test/food', {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=test', ...clientHeaders },
    body: new Uint8Array(9 * 1024 * 1024),
  });
  assert.equal(request.headers.get('content-length'), null);

  const response = await worker.fetch(request, env({ GROQ_API_KEY: 'test' }));
  assert.equal(response.status, 413);
  assert.equal(providerCalls, 0);
});

test('fails closed without the rate-limit binding and blocks before provider cost', async () => {
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return providerChat({ sets: [] });
  };
  const request = () => new Request('https://worker.test/parse', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': '203.0.113.10',
      ...clientHeaders,
    },
    body: JSON.stringify({ text: 'bench 100 5' }),
  });

  const missing = await worker.fetch(request(), { GROQ_API_KEY: 'test' });
  assert.equal(missing.status, 503);

  const blocked = await worker.fetch(request(), env({
    GROQ_API_KEY: 'test',
    AI_RATE_LIMITER: { limit: async () => ({ success: false }) },
  }));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '60');
  assert.equal(providerCalls, 0);
});

test('rejects browser-simple requests without the native client marker', async () => {
  let providerCalls = 0;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return providerChat({ sets: [] });
  };
  const response = await worker.fetch(
    new Request('https://worker.test/parse', { method: 'POST', body: JSON.stringify({ text: 'bench' }) }),
    env({ GROQ_API_KEY: 'test' }),
  );
  assert.equal(response.status, 403);
  assert.equal(providerCalls, 0);
});

test('keeps retired features unavailable and disables browser CORS', async () => {
  for (const path of ['/rank/submit', '/rank/board', '/evolve', '/body-avatar']) {
    const response = await worker.fetch(new Request(`https://worker.test${path}`, { method: 'POST' }), {});
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  const options = await worker.fetch(new Request('https://worker.test/parse', { method: 'OPTIONS' }), {});
  assert.equal(options.status, 405);
});
