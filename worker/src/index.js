// OVERDRIVE QuickLog proxy — Cloudflare Worker.
//
// The ONLY place the Gemini API key lives (server-side secret — never in the app, never in git).
// The app POSTs free text + the exercise catalog; this calls Gemini in JSON mode and returns
// structured sets. Set the key with:  wrangler secret put GEMINI_API_KEY
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

// Gemini responseSchema (uppercase TYPE enums per the v1beta REST API).
const RESP_SCHEMA = {
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

function buildPrompt(text, unitSystem, exercises) {
  const catalog = exercises.map((e) => `- ${e.id}: ${(e.names || []).join(' / ')}`).join('\n');
  return [
    'You convert a short free-text or spoken gym log into structured strength sets.',
    `The user's display unit system is "${unitSystem}". weightKg MUST be in kilograms:`,
    'convert lb→kg (×0.453592); a bare number with no unit is lb when unitSystem is "imperial", else kg;',
    'bodyweight moves → weightKg 0 unless extra load is stated.',
    'Map each exercise to the closest id from this catalog and output the EXACT id. If nothing matches, omit that set.',
    catalog,
    'Extract EVERY set mentioned. Examples: "벤치 100 5,5,4" = three sets of 100kg; "스쿼트 5세트 80 10" = five sets of 80kg×10.',
    'reps is an integer; rir only if explicitly stated (else null).',
    `User log: """${text}"""`,
    'If you cannot parse any exercise, return sets:[] and a short note explaining why.',
  ].join('\n');
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ error: 'POST /parse only' }, 405);
    if (!env.GEMINI_API_KEY) return json({ error: 'server missing GEMINI_API_KEY secret' }, 500);

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'invalid JSON body' }, 400);
    }
    const { text, unitSystem = 'metric', exercises = [] } = body || {};
    if (!text || typeof text !== 'string') return json({ error: 'missing text' }, 400);

    const model = env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(text, unitSystem, exercises) }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: RESP_SCHEMA, temperature: 0 },
        }),
      });
    } catch (e) {
      return json({ error: 'gemini fetch failed', detail: String(e) }, 502);
    }
    if (!res.ok) return json({ error: `gemini ${res.status}`, detail: await res.text().catch(() => '') }, 502);

    const data = await res.json().catch(() => null);
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!out) return json({ error: 'empty gemini response' }, 502);
    let parsed;
    try {
      parsed = JSON.parse(out);
    } catch {
      return json({ error: 'gemini returned non-JSON', raw: out }, 502);
    }
    return json({ sets: Array.isArray(parsed.sets) ? parsed.sets : [], note: parsed.note });
  },
};
