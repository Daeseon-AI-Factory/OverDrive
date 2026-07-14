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
npx wrangler secret put APPLE_IAP_ISSUER_ID
npx wrangler secret put APPLE_IAP_KEY_ID
npx wrangler secret put APPLE_IAP_PRIVATE_KEY
npx wrangler secret put ENTITLEMENT_IDENTITY_SECRET # stable backup; NEVER rotate after launch
npx wrangler secret put ENTITLEMENT_SESSION_SECRET  # rotatable; at least 32 random characters
npm run d1:migrate:remote
npm test
npx wrangler deploy --dry-run --config wrangler.toml
npx wrangler deploy --dry-run --config wrangler.safe-degraded.toml
```

The quota migration contains SQLite triggers. Wrangler 4.110's remote `d1 migrations apply` sends
the whole migration through the query endpoint, which rejects this valid trigger batch with
`incomplete input` even though the same migration succeeds locally. `d1:migrate:remote` builds an
atomic temporary import from the canonical migration, records the same filename in
`d1_migrations`, executes it through D1's file-ingestion path, and deletes the temporary file. It
uses only the repository's pinned Wrangler and Node standard library and works on macOS and Windows.
Do not replace it with manual statement-by-statement production edits.

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
npx wrangler triggers deploy --config wrangler.toml
npx wrangler versions deploy <SAFE_VERSION_ID>@100% \
  --name overdrive-quicklog --message "Activate safe-degraded rollback" --yes
npx wrangler triggers deploy --config wrangler.safe-degraded.toml
```

`wrangler versions upload/deploy` does not apply routes or Cron Triggers. After promotion, deploy
the matching config's triggers and independently read back the live `17 4 * * *` Cron Trigger;
without it, the scheduled privacy-retention cleanup is not operationally verified.

Never run an ID-less rollback and never roll back to the pre-v1 live version. The Worker URL belongs
in the repo root `.env` (gitignored) before rebuilding the app:

```
EXPO_PUBLIC_QUICKLOG_ENDPOINT=https://overdrive-quicklog.<you>.workers.dev
```

Then rebuild the app. The common QuickLog format is parsed on-device first. Remote fallback, voice,
and meal estimation stay unavailable until the user enables the disclosed AI processing setting.

## Test it
```bash
# Exchange a native StoreKit-verified transaction. appAccountToken is deterministic from Apple's signed
# appTransactionId; the Worker recomputes and compares it before trusting either client value.
curl -s -X POST "$URL/entitlements/session" -H 'content-type: application/json' \
  -H 'x-reploom-client: ios-v1' \
  -d '{"transactionId":"<STOREKIT_TRANSACTION_ID>","appAccountToken":"<UUIDV8>"}'

curl -s -X POST "$URL/parse" -H 'content-type: application/json' \
  -H 'x-reploom-client: ios-v1' -H 'authorization: Bearer <SESSION_TOKEN>' \
  -H 'x-reploom-request-id: <NEW_UUID>' \
  -d '{"text":"벤치 100 5,5,4","unitSystem":"metric","exercises":[{"id":"barbell_bench_press","names":["벤치","bench"]}]}'
```

## Subscription and quota contract

- Product: `ai.daeseon.reploom.pro.monthly.v1`; bundle: `ai.daeseon.reploom`.
- `POST /entitlements/session` accepts only `transactionId` and `appAccountToken`. The Worker signs
  an ES256 App Store Server API JWT, queries Apple's current recommended production domain, falls back to
  sandbox only on a production `404`, then validates the Apple-returned transaction, bundle,
  product, environment, expiry, revocation state, opaque exact `appTransactionId` string, and
  deterministic account token. It does not accept a client-supplied transaction JWS or product
  claim. Valid exchange attempts consume one token from the fail-closed per-IP limiter before any
  Apple request, preventing an unauthenticated caller from exhausting the Apple API allowance.
- The returned HMAC session expires after 15 minutes or at subscription expiry, whichever is first.
  `GET /entitlements/usage`, all AI routes, and `POST /entitlements/delete` require that Bearer token
  and the native client marker. AI routes also require a unique `x-reploom-request-id`.
- One billing period accepted from Apple's authenticated server API includes 1,000 AI credits and
  60 meal-photo analyses. Workout parse costs 1, meal text 2, transcription 3, and meal photo 8
  credits. A complete voice-workout flow is
  3 credits when the transcript parses locally and 4 when it needs the workout-parser route; the
  client preflights 4 remaining credits. The independent per-subscriber Cloudflare
  limiter remains a second fail-closed cost-control layer.
- D1 reserves usage atomically using a SQLite trigger before any provider request. A repeated request
  id never charges or invokes the provider twice. Explicit provider failures and invalid provider
  responses mark the customer-visible reservation refunded; quota blocks never call the provider.
  Provider-attempt credits are deliberately not refunded and are capped at 1,250 per billing period,
  with an independent 75-attempt meal-photo ceiling. That 25% failure headroom keeps transient
  provider errors from consuming the advertised 1,000/60 allowance while bounding provider spend
  and request rows even when a caller rotates request ids. Apple Sandbox/TestFlight additionally
  uses a stable actor/day ceiling of 200 weighted attempts and 12 photos because accelerated test
  periods must not reset cost protection every few minutes. The multipart meal-photo path consumes
  all eight corresponding edge-limiter tokens before provider work. Reservations still
  in progress after two minutes are atomically refunded before the next usage/reserve operation and
  by both normal and safe-degraded crons. A late provider result is returned only if its reservation
  can still transition to completed. Successful AI
  responses preserve their existing JSON shape and expose remaining usage in
  `x-reploom-credits-remaining`, `x-reploom-photos-remaining`, and `x-reploom-reset-at` headers.

## Data minimization and deletion

D1 stores only HMAC-derived actor, billing-period, and request keys; billing timestamps; aggregate
credit/photo usage; aggregate weighted provider attempts and meal-photo attempts; a UTC-day Sandbox
attempt aggregate that prevents accelerated test renewals from resetting cost protection; request
route/cost/state timestamps; and a random session epoch. It never stores
App Store transaction ids/JWS, `appTransactionId`, `appAccountToken`, AI request content, or model
output. After a billing period ends, the daily cron deletes its request rows first, then the period
aggregate, then any principal with no remaining period. Expired detail therefore remains only until
the next successful daily cleanup; authenticated `POST /entitlements/delete` removes it immediately.

Deletion atomically removes that actor's principal, detailed request rows, and aggregate usage, and
immediately invalidates the current session. To prevent deletion from resetting a paid-period quota,
the Worker retains only the HMAC actor key plus the current period end in a tombstone. Session exchange
returns `data_deleted_until_reset` until then. The daily cron and later session exchanges purge expired
tombstones. This route does not cancel or alter the Apple subscription or Apple's purchase history.

For Apple test entitlements only, the one-way actor/day attempt aggregate is deliberately detached
from the principal and survives deletion until UTC day end; otherwise deletion plus accelerated
renewal would reset the provider-cost ceiling. Daily cleanup removes it after that boundary.

The safe-degraded rollback cannot query Apple or mint a new subscription session. It can serve
usage or deletion only to an app process that still holds an unexpired 15-minute token; daily automatic cleanup remains
active. Restore the normal Worker before describing fresh in-app subscription-data deletion as
available.

`ENTITLEMENT_IDENTITY_SECRET` is the stable key for the persistent actor/period/request HMACs. Back
it up outside Cloudflare and never rotate it after the first paid user; changing it would create new
pseudonymous quota identities. `ENTITLEMENT_SESSION_SECRET` signs only 15-minute bearer sessions and
may be rotated during an incident; rotation invalidates current sessions without resetting quota or
deletion tombstones.

## Notes
- Text defaults to production `openai/gpt-oss-120b`; audio defaults to `whisper-large-v3`.
  Meal-photo estimation uses Groq's recommended Scout replacement, preview `qwen/qwen3.6-27b`.
  Keep that explicit override under review because Groq preview models can change on shorter notice.
- Request bodies are size-bounded and responses are `no-store`. The Worker does not write AI
  request content or output to D1. `/rank/delete` is the only live legacy-rank route; submit and
  board routes return `410 Gone`.
- The native voice control stops at 30 seconds. The Worker enforces a 1 MiB audio byte ceiling,
  accepted M4A/MP4 MIME and container shape, and a declared `mvhd` duration of at most 35 seconds;
  that client-controlled metadata is an accidental-input check, not an adversarial duration proof.
  Meal-photo input is capped at 2,750,000 raw bytes before base64 expansion. The Groq account spend
  cap remains the fraud backstop for crafted low-bitrate audio.
- Cloudflare's Rate Limiting API allows 30 cost tokens per minute per validated subscriber for paid
  AI; unauthenticated session exchange remains IP-keyed. Parse costs one, food costs two, and
  transcription costs three at this second layer. This prevents unrelated users on shared gym Wi-Fi
  or carrier NAT from consuming each other's paid-AI bucket. The account-level Groq spend cap remains
  a separate launch gate in addition to the per-subscription D1 quota.
