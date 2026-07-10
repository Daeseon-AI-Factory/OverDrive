// OVERDRIVE QuickLog proxy — Cloudflare Worker (provider-agnostic).
//
// The ONLY place an LLM API key lives (server-side secret — never in the app, never in git).
// The app POSTs free text + the exercise catalog; this calls the configured LLM and returns
// structured sets. Provider is auto-selected:
//   - GROQ_API_KEY set   → Groq   (OpenAI-compatible, blazing fast — recommended for the instant feel)
//   - else GEMINI_API_KEY → Gemini (JSON-schema mode)
// Set one with:  wrangler secret put GROQ_API_KEY   (or GEMINI_API_KEY)
//
// Endpoint: POST /parse  { text, unitSystem, exercises: [{ id, names: [...] }] }
//   → { sets: [{ exerciseId, exerciseName, weightKg, reps, rir }], note }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });

const SHAPE =
  'Respond with ONLY a JSON object of shape ' +
  '{"sets":[{"exerciseId":string,"exerciseName":string,"weightKg":number,"reps":integer,"rir":integer|null,"isBodyweight":boolean}],"note":string}. ' +
  'exerciseId is the catalog id when it matches, or "" (empty) when the exercise is not in the catalog.';

function buildPrompt(text, unitSystem, exercises) {
  const catalog = exercises.map((e) => `- ${e.id}: ${(e.names || []).join(' / ')}`).join('\n');
  return [
    'Convert a short free-text or spoken gym log into structured strength sets.',
    `The user's display unit system is "${unitSystem}". weightKg MUST be kilograms:`,
    'convert lb→kg (×0.453592); a bare number with no unit is lb when unitSystem is "imperial", else kg;',
    'bodyweight moves → weightKg 0 unless extra load is stated.',
    'Map each exercise to the closest id from this catalog and output the EXACT id.',
    'If the exercise is NOT in the catalog, STILL include the set: set exerciseId to "" (empty string), put the exercise name in exerciseName, and set isBodyweight=true for bodyweight moves (burpees, push-ups, mountain climbers, lunges, etc.), false otherwise.',
    catalog,
    'Extract EVERY set. "10 burpees for 5 sets" = five sets of 10 reps. "벤치 100 5,5,4" = three sets of 100kg. "스쿼트 5세트 80 10" = five sets of 80kg×10.',
    'reps is an integer; weightKg is 0 for bodyweight; rir only if explicitly stated (else null). If nothing parses, sets:[] with a short note.',
    `User log: """${text}"""`,
  ].join('\n');
}

// ---- Groq (OpenAI-compatible chat completions, JSON mode) -------------------
async function callGroq(env, prompt) {
  const model = env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: `You are a precise gym-log parser. ${SHAPE}` },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) return { error: `groq ${res.status}`, detail: await res.text().catch(() => '') };
  const data = await res.json().catch(() => null);
  const out = data?.choices?.[0]?.message?.content;
  return { out };
}

// ---- Gemini (responseSchema JSON mode) -------------------------------------
const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sets: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          exerciseId: { type: 'STRING' },
          exerciseName: { type: 'STRING' },
          weightKg: { type: 'NUMBER' },
          reps: { type: 'INTEGER' },
          rir: { type: 'INTEGER', nullable: true },
          isBodyweight: { type: 'BOOLEAN', nullable: true },
        },
        required: ['exerciseName', 'weightKg', 'reps'],
      },
    },
    note: { type: 'STRING' },
  },
  required: ['sets'],
};

async function callGemini(env, prompt) {
  const model = env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA, temperature: 0 },
    }),
  });
  if (!res.ok) return { error: `gemini ${res.status}`, detail: await res.text().catch(() => '') };
  const data = await res.json().catch(() => null);
  const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return { out };
}

// POST /parse — free text → structured sets (LLM, provider auto-selected).
async function handleParse(req, env) {
  if (!env.GROQ_API_KEY && !env.GEMINI_API_KEY) {
    return json({ error: 'server missing GROQ_API_KEY or GEMINI_API_KEY secret' }, 500);
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }
  const { text, unitSystem = 'metric', exercises = [] } = body || {};
  if (!text || typeof text !== 'string') return json({ error: 'missing text' }, 400);

  const prompt = buildPrompt(text, unitSystem, exercises);
  const { out, error, detail } = env.GROQ_API_KEY ? await callGroq(env, prompt) : await callGemini(env, prompt);
  if (error) return json({ error, detail }, 502);
  if (!out) return json({ error: 'empty model response' }, 502);

  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    return json({ error: 'model returned non-JSON', raw: out }, 502);
  }
  return json({ sets: Array.isArray(parsed.sets) ? parsed.sets : [], note: parsed.note });
}

// POST /transcribe — multipart audio → text (Groq whisper-large-v3). Forwards the file to Groq.
async function handleTranscribe(req, env) {
  if (!env.GROQ_API_KEY) return json({ error: 'transcription requires GROQ_API_KEY' }, 500);
  let inForm;
  try {
    inForm = await req.formData();
  } catch {
    return json({ error: 'expected multipart form-data with a "file" field' }, 400);
  }
  const file = inForm.get('file');
  if (!file) return json({ error: 'missing file' }, 400);

  const out = new FormData();
  out.append('file', file, 'audio.m4a');
  out.append('model', env.GROQ_WHISPER_MODEL || 'whisper-large-v3');
  out.append('response_format', 'json');
  const lang = inForm.get('language');
  if (lang) out.append('language', String(lang));

  let r;
  try {
    r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: out,
    });
  } catch (e) {
    return json({ error: 'groq transcribe fetch failed', detail: String(e) }, 502);
  }
  if (!r.ok) return json({ error: `groq transcribe ${r.status}`, detail: await r.text().catch(() => '') }, 502);
  const data = await r.json().catch(() => null);
  return json({ text: data?.text ?? '' });
}

// POST /food — meal text OR photo → nutrition estimate. Text: JSON {text}. Photo: multipart "file".
// Returns { items: [{ name, kcal, proteinG }], totalKcal, totalProteinG, note }.
const FOOD_SHAPE =
  'Respond with ONLY a JSON object {"items":[{"name":string,"kcal":number,"proteinG":number}],"note":string}. ' +
  'Estimate per item. Be realistic for typical portions; if the user gives grams, scale accordingly.';

async function handleFood(req, env) {
  if (!env.GROQ_API_KEY) return json({ error: 'food parsing requires GROQ_API_KEY' }, 500);
  const ct = req.headers.get('content-type') || '';

  let messages;
  if (ct.includes('multipart/form-data')) {
    // photo mode → vision model
    let form;
    try {
      form = await req.formData();
    } catch {
      return json({ error: 'bad multipart' }, 400);
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') return json({ error: 'missing file' }, 400);
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    const dataUrl = `data:${file.type || 'image/jpeg'};base64,${btoa(bin)}`;
    messages = [
      { role: 'system', content: `You estimate nutrition from a meal photo. ${FOOD_SHAPE}` },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Identify the foods in this meal and estimate kcal + protein grams per item.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ];
  } else {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid JSON body' }, 400);
    }
    if (!body?.text) return json({ error: 'missing text' }, 400);
    messages = [
      { role: 'system', content: `You estimate nutrition from a short meal description (any language). ${FOOD_SHAPE}` },
      { role: 'user', content: String(body.text) },
    ];
  }

  const model = ct.includes('multipart/form-data')
    ? env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct'
    : env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  let res;
  try {
    res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, messages }),
    });
  } catch (e) {
    return json({ error: 'groq food fetch failed', detail: String(e) }, 502);
  }
  if (!res.ok) return json({ error: `groq food ${res.status}`, detail: await res.text().catch(() => '') }, 502);
  const data = await res.json().catch(() => null);
  const out = data?.choices?.[0]?.message?.content;
  if (!out) return json({ error: 'empty model response' }, 502);
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    return json({ error: 'model returned non-JSON', raw: out }, 502);
  }
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const totalKcal = items.reduce((s, i) => s + (Number(i.kcal) || 0), 0);
  const totalProteinG = items.reduce((s, i) => s + (Number(i.proteinG) || 0), 0);
  return json({ items, totalKcal: Math.round(totalKcal), totalProteinG: Math.round(totalProteinG), note: parsed.note });
}

// ---- Rankings (Cloudflare D1) ----------------------------------------------
// Opt-in: the app only submits once the user picks a handle. Phase 1 scores are self-reported
// (trust-tiering / verified weighting is Phase 4 hardening). Boards rank by week_gain
// (improvement — beginners can win) and by cp (absolute, for flavor).

const sanitize = (s, max) => String(s ?? '').trim().slice(0, max);

// POST /rank/submit { deviceId, handle, cp, weekGain, gradeKey, crew?, region? }
async function handleRankSubmit(req, env) {
  if (!env.DB) return json({ error: 'rank DB not bound' }, 500);
  let b;
  try {
    b = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const deviceId = sanitize(b.deviceId, 64);
  const handle = sanitize(b.handle, 20);
  if (!deviceId || !handle) return json({ error: 'missing deviceId/handle' }, 400);
  const cp = Math.max(0, Math.min(9999, Math.round(Number(b.cp) || 0)));
  const weekGain = Math.max(0, Math.min(9999, Math.round(Number(b.weekGain) || 0)));
  const gradeKey = sanitize(b.gradeKey, 24) || 'ordinary';
  const crew = sanitize(b.crew, 24).toUpperCase() || null;
  const region = sanitize(b.region, 8).toUpperCase() || null;
  await env.DB.prepare(
    `INSERT INTO rank_entry (device_id, handle, cp, week_gain, grade_key, crew, region, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(device_id) DO UPDATE SET
       handle=excluded.handle, cp=excluded.cp, week_gain=excluded.week_gain,
       grade_key=excluded.grade_key, crew=excluded.crew, region=excluded.region, updated_at=excluded.updated_at`,
  )
    .bind(deviceId, handle, cp, weekGain, gradeKey, crew, region)
    .run();
  return json({ ok: true });
}

// POST /rank/board { deviceId, sort: 'weekGain'|'cp', crew?, region? } → top 50 + your rank
async function handleRankBoard(req, env) {
  if (!env.DB) return json({ error: 'rank DB not bound' }, 500);
  let b;
  try {
    b = await req.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const deviceId = sanitize(b.deviceId, 64);
  const col = b.sort === 'cp' ? 'cp' : 'week_gain';
  const crew = sanitize(b.crew, 24).toUpperCase();
  const region = sanitize(b.region, 8).toUpperCase();
  const where = crew ? 'WHERE crew = ?' : region ? 'WHERE region = ?' : '';
  const bindScope = crew ? [crew] : region ? [region] : [];

  const top = await env.DB.prepare(
    `SELECT handle, cp, week_gain AS weekGain, grade_key AS gradeKey, crew, device_id = ? AS isMe
     FROM rank_entry ${where} ORDER BY ${col} DESC, updated_at ASC LIMIT 50`,
  )
    .bind(deviceId, ...bindScope)
    .all();

  let myRank = null;
  if (deviceId) {
    const me = await env.DB.prepare('SELECT cp, week_gain FROM rank_entry WHERE device_id = ?').bind(deviceId).first();
    if (me) {
      const myVal = col === 'cp' ? me.cp : me.week_gain;
      const r = await env.DB.prepare(
        `SELECT COUNT(*) + 1 AS rank FROM rank_entry ${where ? where + ' AND' : 'WHERE'} ${col} > ?`,
      )
        .bind(...bindScope, myVal)
        .first();
      myRank = r?.rank ?? null;
    }
  }
  return json({ entries: top.results ?? [], myRank });
}

// ---- EVOLUTION (Gemini image editing) ---------------------------------------
// POST /evolve — multipart { file, gradeKey } → AI-evolved physique photo (base64 JSON).
// Pass-through only: the photo is never stored server-side. Anti-shame: transformations only ever
// flatter (progressively heroic per grade) — there is no "downgrade" prompt.
// Stylized HERO-CHARACTER transformation per grade (not a photoreal tweak, and NOT a weight-loss
// edit). The power/aura/gear escalates with grade — the person's real body type is preserved (a
// larger build = a mighty juggernaut, not slimmed). Original IP only — generic epic hero, never a
// named franchise.
async function handleEvolve(req, env) {
  // The old client uploaded immediately after photo selection and had no explicit consent/delete
  // contract. Keep a deterministic tombstone instead of falling through to /parse for older builds.
  void req;
  void env;
  return json({ error: 'legacy evolve retired; use the consented /body-avatar flow' }, 410);
}

// ---- BODY AVATAR (consented sportswear turnaround atlas) --------------------
// POST /body-avatar — multipart
//   { file, outfit, adultConfirmed, ownershipConfirmed, aiConsent }
// → { mimeType, image }
// The image is pass-through only and is never stored by this Worker. The prompt is fixed except for
// a whitelisted opaque sportswear choice; clients cannot inject free-form prompt text.
const BODY_AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;
const BODY_AVATAR_MAX_OUTPUT_BYTES = 12 * 1024 * 1024;
const BODY_AVATAR_MAX_MULTIPART_BYTES = BODY_AVATAR_MAX_INPUT_BYTES + 256 * 1024;
const BODY_AVATAR_MIN_WIDTH = 400;
const BODY_AVATAR_MIN_HEIGHT = 500;
const BODY_AVATAR_MAX_PIXELS = 4_000_000;
const BODY_AVATAR_TARGET_ASPECT = 4 / 5;
const BODY_AVATAR_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BODY_AVATAR_OUTFITS = {
  compression:
    'a fully opaque long-sleeve compression training top with a high neckline, full-length athletic leggings, and plain training shoes',
  sport_top:
    'a fully opaque short-sleeve performance sport top, knee-length training shorts, and plain training shoes',
  sleeveless:
    'a fully opaque sleeveless performance top with a high neckline, knee-length training shorts, and plain training shoes',
};

function normalizeBodyAvatarMime(value) {
  const mime = String(value || '').toLowerCase().split(';', 1)[0].trim();
  if (mime === 'image/jpg') return 'image/jpeg';
  return BODY_AVATAR_MIMES.has(mime) ? mime : null;
}

function bodyAvatarSignatureMatches(bytes, mime) {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  return (
    mime === 'image/webp' &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  );
}

function base64DecodedBytes(value) {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function decodeBodyAvatarBase64(value) {
  if (
    typeof value !== 'string' ||
    value.length < 32 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value) ||
    base64DecodedBytes(value) > BODY_AVATAR_MAX_OUTPUT_BYTES
  ) {
    return null;
  }
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function bodyAvatarImageDimensions(bytes, mime) {
  if (mime === 'image/png' && bytes.length >= 24) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (mime !== 'image/jpeg' || bytes.length < 10) return null;

  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) return null;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (startOfFrame.has(marker) && segmentLength >= 7) {
      return {
        height: (bytes[offset + 3] << 8) | bytes[offset + 4],
        width: (bytes[offset + 5] << 8) | bytes[offset + 6],
      };
    }
    offset += segmentLength;
  }
  return null;
}

function validBodyAvatarDimensions(dimensions) {
  if (!dimensions) return false;
  const { width, height } = dimensions;
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= BODY_AVATAR_MIN_WIDTH &&
    height >= BODY_AVATAR_MIN_HEIGHT &&
    width * height <= BODY_AVATAR_MAX_PIXELS &&
    Math.abs(width / height - BODY_AVATAR_TARGET_ASPECT) <= 0.05
  );
}

async function handleBodyAvatar(req, env) {
  const contentLength = Number(req.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > BODY_AVATAR_MAX_MULTIPART_BYTES) {
    return json({ error: 'multipart body too large' }, 413);
  }
  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'expected multipart form-data' }, 400);
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'missing file' }, 400);
  if (
    form.get('adultConfirmed') !== 'true' ||
    form.get('ownershipConfirmed') !== 'true' ||
    form.get('aiConsent') !== 'true'
  ) {
    return json({ error: 'adult, ownership, and AI-processing confirmations must all be true' }, 400);
  }
  const outfit = String(form.get('outfit') || '');
  const outfitDescription = BODY_AVATAR_OUTFITS[outfit];
  if (!outfitDescription) return json({ error: 'invalid outfit' }, 400);

  const inputMime = normalizeBodyAvatarMime(file.type);
  if (!inputMime) return json({ error: 'unsupported image type' }, 415);
  if (!Number.isFinite(file.size) || file.size <= 0) return json({ error: 'empty image' }, 400);
  if (file.size > BODY_AVATAR_MAX_INPUT_BYTES) return json({ error: 'image too large' }, 413);
  if (!env.GEMINI_API_KEY) return json({ error: 'body-avatar requires GEMINI_API_KEY secret' }, 500);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length <= 0 || bytes.length > BODY_AVATAR_MAX_INPUT_BYTES) return json({ error: 'invalid image size' }, 413);
  if (!bodyAvatarSignatureMatches(bytes, inputMime)) return json({ error: 'image content does not match its type' }, 415);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const imageBase64 = btoa(binary);

  const prompt =
    `Create ONE fixed, neutral, two-panel full-body turnaround atlas of the same person in the input. ` +
    `The canvas must be a tall two-panel atlas with an overall 4:5 width-to-height ratio: LEFT panel ` +
    `is an exact neutral FRONT view; RIGHT panel is ` +
    `an exact neutral BACK view. Both panels must show the complete figure from head to shoes at the ` +
    `same scale, same camera height, same orthographic-like perspective, same relaxed A-pose, arms ` +
    `slightly away from the torso, feet parallel, centered with identical tight padding on a perfectly ` +
    `flat near-black studio background. Each half must be a tall 2:5 panel; align both heads and both ` +
    `soles exactly so a fixed body-region overlay can be reused. ` +
    `Render as stylized, clearly NON-PHOTOREAL original game-character concept art with clean shapes ` +
    `and restrained cel shading—not a photograph and not a beauty/body transformation. Preserve only ` +
    `the person's VISIBLE likeness, skin tone, hair, silhouette, and body proportions as shown. Do not ` +
    `slim, bulk, lengthen, idealize, sexualize, or exaggerate anatomy. Do not infer or label sex, gender, ` +
    `gender identity, health, fitness, body composition, disability, diagnosis, or any other sensitive ` +
    `attribute. Do not invent hidden anatomical detail; make the back view a conservative, fully ` +
    `garment-covered turnaround consistent with the visible silhouette. Dress the figure only in ` +
    `${outfitDescription}. Clothing must remain opaque and non-revealing. No nudity, underwear, ` +
    `lingerie, swimwear, transparent fabric, cleavage emphasis, fetish styling, or sexual pose. No text, ` +
    `logos, brands, weapons, aura, action pose, props, scenery, or extra views. ORIGINAL IP only: do not ` +
    `copy or imitate any existing franchise, character, mascot, costume, logo, or trademarked art style. ` +
    `Return a single image containing exactly the front and back panels.`;

  const model = env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: prompt }, { inline_data: { mime_type: inputMime, data: imageBase64 } }] },
          ],
          generationConfig: {
            responseModalities: ['IMAGE'],
            responseFormat: { image: { aspectRatio: '4:5' } },
          },
        }),
      },
    );
  } catch (error) {
    return json({ error: 'gemini body-avatar fetch failed', detail: String(error) }, 502);
  }
  if (!response.ok) {
    return json({ error: `gemini body-avatar ${response.status}`, detail: await response.text().catch(() => '') }, 502);
  }
  const data = await response.json().catch(() => null);
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
  const output = imagePart?.inlineData ?? imagePart?.inline_data;
  const outputMime = normalizeBodyAvatarMime(output?.mimeType ?? output?.mime_type);
  if (!outputMime || typeof output?.data !== 'string' || output.data.length === 0) {
    return json({ error: 'no supported image in body-avatar response' }, 502);
  }
  const outputBytes = decodeBodyAvatarBase64(output.data);
  if (!outputBytes || !bodyAvatarSignatureMatches(outputBytes, outputMime)) {
    return json({ error: 'body-avatar response is not a valid declared image' }, 502);
  }
  const dimensions = bodyAvatarImageDimensions(outputBytes, outputMime);
  if (!validBodyAvatarDimensions(dimensions)) {
    return json({ error: 'body-avatar response has invalid atlas dimensions' }, 502);
  }
  return json({ mimeType: outputMime, image: output.data });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') {
      return json({ error: 'POST only (/parse, /transcribe, /food, /rank/*, /evolve, /body-avatar)' }, 405);
    }
    const { pathname } = new URL(req.url);
    if (pathname === '/transcribe') return handleTranscribe(req, env);
    if (pathname === '/food') return handleFood(req, env);
    if (pathname === '/rank/submit') return handleRankSubmit(req, env);
    if (pathname === '/rank/board') return handleRankBoard(req, env);
    if (pathname === '/evolve') return handleEvolve(req, env);
    if (pathname === '/body-avatar') return handleBodyAvatar(req, env);
    return handleParse(req, env);
  },
};
