# Reploom AI parsing proxy (Cloudflare Worker)

Holds the **LLM API key server-side** so it is never shipped in the app bundle (non-negotiable §3).
The app POSTs free text + the exercise catalog; the Worker calls the LLM in JSON mode and returns
structured sets. The v1 runtime uses **Groq only** for workout text, on-demand audio transcription,
meal text, and user-selected meal photos so the provider matches the consent and privacy copy.

## Prepare and stage a release

```bash
cd worker
npm install
npx wrangler login                       # opens browser, log into your Cloudflare account (free)
npx wrangler secret put GROQ_API_KEY     # paste the Groq key — Cloudflare secret, never in git
npm test
npx wrangler deploy --dry-run --config wrangler.toml
npx wrangler deploy --dry-run --config wrangler.safe-degraded.toml
```

Do not use `wrangler deploy` or an immediate-deploy package script for a release. Upload immutable
normal and safe-degraded versions first, record both IDs, and smoke-test each with a version
override while it has zero production traffic:

```bash
npx wrangler versions upload --strict --config wrangler.safe-degraded.toml --message "Reploom safe-degraded <FULL_HASH>"
npx wrangler versions upload --strict --config wrangler.toml --message "Reploom v1 <FULL_HASH>"

# Stage one candidate at zero percent beside the current live version, then smoke its version URL.
npx wrangler versions deploy <LIVE_VERSION_ID>@100% <CANDIDATE_VERSION_ID>@0% \
  --name overdrive-quicklog --message "Stage Reploom candidate at zero percent" --yes
```

Only after the matching TestFlight build is available and version-specific smoke tests pass may
the normal candidate be promoted to 100%. Emergency degraded activation must name the recorded ID:

```bash
npx wrangler versions deploy <NORMAL_VERSION_ID>@100% \
  --name overdrive-quicklog --message "Promote Reploom v1" --yes
npx wrangler versions deploy <SAFE_VERSION_ID>@100% \
  --name overdrive-quicklog --message "Activate safe-degraded rollback" --yes
```

Never run an ID-less rollback and never roll back to the pre-v1 live version. The Worker URL belongs
in the repo root `.env` (gitignored) before rebuilding the app:

```
EXPO_PUBLIC_QUICKLOG_ENDPOINT=https://overdrive-quicklog.<you>.workers.dev
```

Then rebuild the app. The common QuickLog format is parsed on-device first. Remote fallback, voice,
and meal estimation stay unavailable until the user enables the disclosed AI processing setting.

## Test it
```bash
curl -s -X POST "$URL/parse" -H 'content-type: application/json' \
  -H 'x-reploom-client: ios-v1' \
  -d '{"text":"벤치 100 5,5,4","unitSystem":"metric","exercises":[{"id":"barbell_bench_press","names":["벤치","bench"]}]}'
```

## Notes
- Text defaults to production `openai/gpt-oss-120b`; audio defaults to `whisper-large-v3`.
  Meal-photo estimation uses Groq's recommended Scout replacement, preview `qwen/qwen3.6-27b`.
  Keep that explicit override under review because Groq preview models can change on shorter notice.
- Request bodies are size-bounded and responses are `no-store`. The Worker does not write AI
  request content or output to D1. `/rank/delete` is the only live legacy-rank route; submit and
  board routes return `410 Gone`.
- Cloudflare's Rate Limiting API allows 30 cost tokens per minute per edge-observed client IP.
  Parse costs one, food costs two, and transcription costs three. This accountless fallback can
  group users behind shared mobile or gym networks, so an account-level Groq spend cap remains a
  separate launch gate.
