// Reploom AI parsing proxy. User content is forwarded only after the app's explicit consent gate.
// The Worker does not persist request bodies or model output. Groq is the sole v1 AI provider so
// runtime behavior, the in-app disclosure, and the public privacy policy stay aligned.

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });

const MAX_JSON_BYTES = 128 * 1024;
const MAX_TEXT_CHARS = 2_000;
const MAX_AUDIO_BYTES = 18 * 1024 * 1024;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD = 256 * 1024;
const PARSE_PROVIDER_TIMEOUT_MS = 3_200;
const FOOD_TEXT_PROVIDER_TIMEOUT_MS = 8_500;
const FOOD_PHOTO_PROVIDER_TIMEOUT_MS = 18_000;
const TRANSCRIBE_PROVIDER_TIMEOUT_MS = 7_500;
const PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CLIENT_HEADER_VALUE = 'ios-v1';
const AI_RATE_COST = new Map([
  ['/parse', 1],
  ['/food', 2],
  ['/transcribe', 3],
]);

function rateLimited() {
  return new Response(JSON.stringify({ error: 'too many AI requests; try again shortly' }), {
    status: 429,
    headers: { ...JSON_HEADERS, 'retry-after': '60' },
  });
}

async function enforceAiRateLimit(req, env, cost) {
  if (!env.AI_RATE_LIMITER || typeof env.AI_RATE_LIMITER.limit !== 'function') {
    // Fail closed if a deploy accidentally omits the cost-control binding.
    return json({ error: 'AI service is unavailable' }, 503);
  }
  const actor = req.headers.get('cf-connecting-ip') || 'unknown-client';
  for (let i = 0; i < cost; i += 1) {
    const result = await env.AI_RATE_LIMITER.limit({ key: actor });
    if (!result?.success) return rateLimited();
  }
  return null;
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
    .slice(0, 400)
    .map((exercise) => {
      const id = cleanText(exercise?.id, 80);
      const names = Array.isArray(exercise?.names)
        ? exercise.names.slice(0, 8).map((name) => cleanText(name, 80)).filter(Boolean)
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

async function handleParse(req, env) {
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
  const result = await groqChat(env, {
    model: env.GROQ_MODEL || 'openai/gpt-oss-120b',
    system: `You are a precise gym-log parser. ${SET_SHAPE}`,
    user: buildWorkoutPrompt(text, body?.unitSystem, exercises),
    timeoutMs: PARSE_PROVIDER_TIMEOUT_MS,
  });
  if (result.errorResponse) return result.errorResponse;
  const parsed = result.value;
  return json({ sets: normalizeWorkoutSets(parsed?.sets), note: cleanText(parsed?.note, 500) });
}

async function handleTranscribe(req, env) {
  if (!env.GROQ_API_KEY) return json({ error: 'AI service is unavailable' }, 503);
  const parsedBody = await readMultipart(req, MAX_AUDIO_BYTES + MAX_MULTIPART_OVERHEAD, 'audio too large');
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const input = parsedBody.value;
  const file = input?.get('file');
  if (!file || typeof file === 'string') return json({ error: 'missing audio file' }, 400);
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_AUDIO_BYTES) {
    return json({ error: 'invalid audio size' }, 413);
  }

  const form = new FormData();
  form.append('file', file, 'audio.m4a');
  form.append('model', env.GROQ_WHISPER_MODEL || 'whisper-large-v3');
  form.append('response_format', 'json');
  const language = cleanText(input.get('language'), 12);
  if (language) form.append('language', language);

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

async function handleFood(req, env) {
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

  const result = await groqChat(env, {
    model,
    system: `You estimate meal nutrition for a fitness log. ${FOOD_SHAPE}`,
    user,
    visionDataUrl,
    timeoutMs: visionDataUrl ? FOOD_PHOTO_PROVIDER_TIMEOUT_MS : FOOD_TEXT_PROVIDER_TIMEOUT_MS,
  });
  if (result.errorResponse) return result.errorResponse;
  const items = normalizeFoodItems(result.value?.items);
  const totalKcal = items.reduce((sum, item) => sum + item.kcal, 0);
  const totalProteinG = items.reduce((sum, item) => sum + item.proteinG, 0);
  return json({
    items,
    totalKcal: Math.round(totalKcal),
    totalProteinG: Math.round(totalProteinG * 10) / 10,
    note: cleanText(result.value?.note, 500),
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

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    const knownPath = new Set([
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
    if (req.method !== 'POST') return json({ error: 'POST required' }, 405);
    const livePath = AI_RATE_COST.has(pathname) || pathname === '/rank/delete';
    if (livePath && req.headers.get('x-reploom-client') !== CLIENT_HEADER_VALUE) {
      return json({ error: 'client marker required' }, 403);
    }
    const rateCost = AI_RATE_COST.get(pathname);
    if (rateCost) {
      const limited = await enforceAiRateLimit(req, env, rateCost);
      if (limited) return limited;
    }
    if (pathname === '/parse') return handleParse(req, env);
    if (pathname === '/transcribe') return handleTranscribe(req, env);
    if (pathname === '/food') return handleFood(req, env);
    if (pathname === '/rank/delete') return handleRankDelete(req, env);
    return retiredFeature();
  },
};
