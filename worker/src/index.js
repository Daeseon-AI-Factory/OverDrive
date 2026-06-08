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
  '{"sets":[{"exerciseId":string,"exerciseName":string,"weightKg":number,"reps":integer,"rir":integer|null}],"note":string}.';

function buildPrompt(text, unitSystem, exercises) {
  const catalog = exercises.map((e) => `- ${e.id}: ${(e.names || []).join(' / ')}`).join('\n');
  return [
    'Convert a short free-text or spoken gym log into structured strength sets.',
    `The user's display unit system is "${unitSystem}". weightKg MUST be kilograms:`,
    'convert lb→kg (×0.453592); a bare number with no unit is lb when unitSystem is "imperial", else kg;',
    'bodyweight moves → weightKg 0 unless extra load is stated.',
    'Map each exercise to the closest id from this catalog and output the EXACT id. If nothing matches, omit that set.',
    catalog,
    'Extract EVERY set. Examples: "벤치 100 5,5,4" = three sets of 100kg; "스쿼트 5세트 80 10" = five sets of 80kg×10.',
    'reps is an integer; rir only if explicitly stated (else null). If nothing parses, sets:[] with a short note.',
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
        },
        required: ['exerciseId', 'weightKg', 'reps'],
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

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'POST only (/parse or /transcribe)' }, 405);
    const { pathname } = new URL(req.url);
    if (pathname === '/transcribe') return handleTranscribe(req, env);
    return handleParse(req, env);
  },
};
