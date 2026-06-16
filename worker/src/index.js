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
const EVOLVE_LOOKS = {
  ordinary: 'a newly awakened hero — clean stylized hero art, a faint glowing energy outline, determined expression, heroic lighting',
  rookie: 'a rising fighter — dynamic anime/game hero art, light battle gear, a forming energy aura, bold dramatic lighting',
  fighter: 'a battle-hardened warrior — bold splash-art style, rugged armor, crackling energy aura, intense glare',
  warrior: 'an elite champion — epic game splash art, ornate heroic armor, radiant energy aura, glowing eyes, cinematic VFX',
  beast: 'an unstoppable powerhouse — high-impact stylized hero art, heavy battle armor, explosive energy aura, particle effects, lightning',
  monster: 'a legendary force of nature — over-the-top epic character art, imposing armor, enormous swirling energy aura, shattering ground, electric storm',
  ascendant: 'a transcendent god-tier hero in ultimate form — maximum stylization, divine armor, blinding radiant aura, cosmic energy, glowing runes',
};

async function handleEvolve(req, env) {
  if (!env.GEMINI_API_KEY) return json({ error: 'evolve requires GEMINI_API_KEY secret' }, 500);
  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'expected multipart form-data' }, 400);
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'missing file' }, 400);
  const gradeKey = sanitize(form.get('gradeKey'), 24) || 'rookie';
  const look = EVOLVE_LOOKS[gradeKey] || EVOLVE_LOOKS.rookie;

  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const b64 = btoa(bin);

  const model = env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
  const prompt =
    `Reimagine the person in this photo as an EPIC ORIGINAL HERO CHARACTER — stylized digital ` +
    `splash art / anime-game key art, NOT a photorealistic edit. This is a heroic power-up portrait. ` +
    `KEEP their face and likeness clearly recognizable (must still look like the SAME person) AND keep ` +
    `their real body type and build — do NOT slim them down, do NOT bulk or fatten them, do NOT change ` +
    `their body shape. A larger or heavier build must be rendered as a MIGHTY, imposing juggernaut/tank ` +
    `hero — any body type can look powerful and badass. Transform the styling into: ${look}. ` +
    `Make them look genuinely badass, powerful and awe-inspiring (flattering and heroic only — never ` +
    `mocking, never unflattering, and never a weight-loss "after" shot). Dramatic composition, bold colors, ` +
    `strong rim lighting and energy effects, portrait orientation. ` +
    `ORIGINAL design only — do NOT copy or imitate any existing franchise, named character, logo, mascot, or trademarked art style.`;

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: prompt }, { inline_data: { mime_type: file.type || 'image/jpeg', data: b64 } }] },
          ],
        }),
      },
    );
  } catch (e) {
    return json({ error: 'gemini evolve fetch failed', detail: String(e) }, 502);
  }
  if (!res.ok) return json({ error: `gemini evolve ${res.status}`, detail: await res.text().catch(() => '') }, 502);
  const data = await res.json().catch(() => null);
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
  const out = img?.inlineData ?? img?.inline_data;
  if (!out?.data) return json({ error: 'no image in response', detail: JSON.stringify(parts).slice(0, 200) }, 502);
  return json({ image: out.data, mimeType: out.mimeType ?? out.mime_type ?? 'image/png' });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'POST only (/parse, /transcribe, /food, /rank/*, /evolve)' }, 405);
    const { pathname } = new URL(req.url);
    if (pathname === '/transcribe') return handleTranscribe(req, env);
    if (pathname === '/food') return handleFood(req, env);
    if (pathname === '/rank/submit') return handleRankSubmit(req, env);
    if (pathname === '/rank/board') return handleRankBoard(req, env);
    if (pathname === '/evolve') return handleEvolve(req, env);
    return handleParse(req, env);
  },
};
