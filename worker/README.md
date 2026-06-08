# OVERDRIVE QuickLog proxy (Cloudflare Worker)

Holds the **LLM API key server-side** so it is never shipped in the app bundle (non-negotiable §3).
The app POSTs free text + the exercise catalog; the Worker calls the LLM in JSON mode and returns
structured sets. **Provider is auto-selected by which key you set:** `GROQ_API_KEY` → Groq
(OpenAI-compatible, fastest — recommended); else `GEMINI_API_KEY` → Gemini.

## Deploy (one time, ~5 min)

```bash
cd worker
npm install
npx wrangler login                       # opens browser, log into your Cloudflare account (free)
npx wrangler secret put GROQ_API_KEY     # paste your free Groq key (console.groq.com) — CF secret, never in git
# or instead:  npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

`deploy` prints a URL like `https://overdrive-quicklog.<you>.workers.dev`. Give that URL to the app:
put it in the repo root `.env` (gitignored):

```
EXPO_PUBLIC_QUICKLOG_ENDPOINT=https://overdrive-quicklog.<you>.workers.dev
```

Then rebuild the app. If the var is empty/unreachable, the app silently falls back to the on-device
rule parser, so logging never breaks.

## Test it
```bash
curl -s -X POST "$URL/parse" -H 'content-type: application/json' \
  -d '{"text":"벤치 100 5,5,4","unitSystem":"metric","exercises":[{"id":"barbell_bench_press","names":["벤치","bench"]}]}'
```

## Notes
- Model defaults to `gemini-2.0-flash` (free tier); change `GEMINI_MODEL` in `wrangler.toml`.
- The endpoint has no auth (fine for personal dogfooding — the *key* is safe; worst case someone who
  finds the URL spends your free quota). Add Cloudflare Access or a per-user token (Phase 2 backend)
  before any public launch.
