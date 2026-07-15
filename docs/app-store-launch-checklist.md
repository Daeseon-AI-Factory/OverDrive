# Reploom App Store Launch Checklist

Updated: 2026-07-15. App Store Connect app `6786831176`, bundle `ai.daeseon.reploom`.

The original free Build 13 submission was accepted into the review queue and then deliberately
withdrawn on 2026-07-13 after the decision to prepare Reploom Pro and server-enforced AI limits.
Review submission `72f01614-39bb-4b0e-95e7-a3810e5fbb97` read back `COMPLETE`, its item `REMOVED`,
and version 1.0 initially `DEVELOPER_REJECTED`. Build 13 remains valid as a binary rollback artifact but must
not be resubmitted as the subscription release. Builds 14 and 15 are uploaded and read `VALID` /
`APP_STORE_ELIGIBLE`; Build 15 is the current code candidate. Version 1.0 was changed from Build 13
to Build 15 on 2026-07-15 and the relationship read back Build 15. Version 1.0 then read back
`PREPARE_FOR_SUBMISSION`, but no replacement submission exists.

## Verified before this release candidate

- App Store version `1.0` read `DEVELOPER_REJECTED` after the deliberate withdrawal and now reads
  `PREPARE_FOR_SUBMISSION` after the Build 15 relationship change.
- TestFlight build 12 is `VALID`, but it predates this compliance/usability release candidate and
  must not be selected for App Review.
- TestFlight build 14 is `VALID` / `APP_STORE_ELIGIBLE`; it is not attached to version 1.0.
- TestFlight build 15 (`7123db21-dbc0-4126-8f30-5a7105278602`) is `VALID` /
  `APP_STORE_ELIGIBLE`, minimum iOS 16.4, non-exempt encryption false, and internal
  `IN_BETA_TESTING`. Version 1.0 now points to it, but it is not an App Review submission.
- Store-facing brand is Reploom; OverDrive remains only an internal repository/concept name.
- Public ranking and remote photo-avatar entry points are removed from v1 UI.
- Worker candidate source uses Groq only for optional workout text, audio, meal text, and selected meal photos.
- Remote AI consent is versioned, defaults off, and can be withdrawn without disabling local logs.
- HealthKit access is minimized to the types actually displayed or written.
- `expo-dev-client`, launcher, and menu packages were removed from package and clean native pods.
- A tracked Expo config plugin excludes the complete SQLite directory (DB/WAL/SHM) from iCloud
  backup and applies complete file protection during native startup.
- Privacy manifest generation is tracked in `app.json` rather than an ignored local `ios/` tree.
- Root `npm audit` reports high/critical 0 and 11 moderate findings through Expo's build-time
  `xcode → uuid` graph; npm's offered fix is an invalid Expo/Splash major downgrade. Worker audit is 0.

## Gates before creating a production build

- [x] Replace the placeholder with `showep12@gmail.com`; read back the connected Gmail profile and
  a new inbound Build 13 TestFlight notification on 2026-07-13.
- [x] Record the verified operator and copyright owner as `Daeseon Yoo` in the release sources.
- [x] Keep the initial release outside Europe and do not invent a postal address or governing-law
  venue. This is a storefront-scope decision, not a legal conclusion about every enabled market;
  reassess public trader/contact requirements before expanding distribution.
- [ ] Render and inspect the current Privacy, Support, Terms, and Data candidate at mobile and
  desktop widths. Historical production Privacy and preview home/privacy passed iPhone 17 Pro Max
  Safari inspection, but the 2026-07-15 catalog/manual-meal edits are not deployed and this session's
  Browser/Chrome connections were unavailable. No current-source visual QA or production promotion.
- [x] Run full Jest, strict TypeScript, lint, Expo config/doctor, Worker dry-run, plist validation.
- [x] Build Release for a 6.9-inch simulator with realistic seeded data.
- [ ] App verification: AI OFF → zero Remote AI calls, AI ON → disclosed Remote AI calls only,
  withdrawal → zero future Remote AI calls. The public read-only catalog GET is not a Remote AI call
  and must be inspected separately for its documented no-user-data request boundary.
- [ ] Verify local QuickLog save/edit/undo while AI is off and while the optional Remote AI endpoint
  is unavailable. Build 15 Release QA verified touch-driven local set save and a catalog-backed
  Quick Log write, but did not independently inject every endpoint failure state.
- [ ] Verify local QuickLog and saved-meal repeat remain unblocked while unsubscribed and after AI
  quota exhaustion. Build 15 Release QA verified manual meal save/edit/undo against the realistic
  seed; unsubscribed/exhausted fixture coverage for every local path remains open.
- [x] Verify body-region recommendations on the final Build 15 Release build: actual chest-region
  touch opened Chest recommendations containing Barbell Bench Press.
- [x] Verify full exercise search on Release product code: English and Korean aliases, English
  fallback in Korean locale, per-side/total semantics, trap-bar Quick Log, and the plank
  unsupported-tracking fail-closed guard were touch-driven and visually inspected. The final Build 15 metadata-only
  rebuild repeated the chest flow without mutating the restored baseline.
- [x] Verify SQLite directory, DB, WAL, and SHM backup exclusion in Simulator.
- [ ] Verify `FileProtection.complete` after locking a physical iPhone.
- [x] Inspect the built app for no dev-client dependency and no retired avatar/rank API or UI.
- [x] Upgrade-path check: pre-v1 avatar photos are deleted; request-time voice/photo cache files are
  deleted after success/failure/cancel and swept after an interrupted session.

Build 15 QA evidence is curated in `docs/artifacts/release-qa-build-15/`. It contains 11 original
1320×2868 screenshots and a per-file hash/verification ledger. The final installed app read bundle
`ai.daeseon.reploom`, version `1.0`, build `15`; its schema-v8 database retained 5 sessions / 1 open /
20 sets / 1 cardio / 3 foods with `integrity_check=ok` and zero foreign-key violations. Catalog
exercise/cache-bridge/localization/alias/equipment/region counts read
64/64/256/256/76/97 with active `1.0.0`, 66,654 bytes, and the expected SHA-256.

## Public services

- [x] Deploy `website/` to `https://reploom.pages.dev`; production deployment
  `1798ec5a-4134-4b02-b553-b00f6ea7e720` is branch `main`, source `b9ddda1`.
- [x] At production source `b9ddda1`, verify `/`, `/privacy`, `/support`, `/terms`, `/data` return
  HTTPS 200 without redirects, contain the intended title/contact, and match that deployed source.
- [x] Deploy the subscription website source to noindex preview
  `14bd35fa-5d7b-41ce-aedc-65fb8baa5cc9`; both `https://14bd35fa.reploom.pages.dev` and the
  branch alias return 200, and the five routes plus CSS match deployed source `7f4560d` by SHA-256.
- [ ] The current 2026-07-15 website edits differ from both deployed sources and have not received
  fresh browser visual QA. Keep them source-only until the payment and visual gates close.
- [ ] Promote the subscription website to Pages production only after the matching entitlement
  Worker is live; production currently remains `1798ec5a-4134-4b02-b553-b00f6ea7e720`.
- [ ] Keep the revised Pages and App Store listing source as candidate-only while it advertises Pro
  behavior that is not backed by a production entitlement service. Do not promote either public
  surface until payment is live and the claims can be exercised end to end.
- [x] Publish exercise catalog `1.0.0` at
  `https://overdrive-catalog.daeseon.workers.dev/catalog/v1` using dedicated D1
  `4bf0e085-56d8-405e-a7a7-333d5eeff03f` and Worker version
  `e19c7975-be71-456b-95cf-400c43703b2f`.
- [x] Read back the production catalog as 64 rows / 66,654 bytes / SHA-256
  `43491e64b66fbd16f87325d8e8ea9e5d2325d888b71c700b61b80da19566604a`; verify exact-body
  HTTP 200, conditional 304, unknown-path 404, and unsupported-method 405. App fallback remains
  bundled and non-blocking.
- [x] Deploy the Worker with `logpush=false`; the Cloudflare script-settings readback returned
  `observability=null` and no tail consumer, so Worker observability is not enabled.
- [ ] Independently verify `/parse`, `/transcribe`, and `/food` success/error/size contracts; consent remains a client-side gate.
  Live Groq text parsing returned a structured set and local Worker tests cover error/size behavior;
  live audio and meal-photo success paths remain open.
- [x] Verify `/rank/delete` invalid-input validation; verify `/rank/submit`, `/rank/board`, `/evolve`,
  `/body-avatar` return 410 on both the normal live version and immutable safe version.
- [ ] Confirm Cloudflare edge rate limiting and Groq spend limits; Worker version readback confirms
  30 cost tokens per 60 seconds, while the account-level Groq spend cap remains unverified.
- [ ] After immutable-version promotion, run `wrangler triggers deploy` with the matching config
  and read back the live `17 4 * * *` Cron Trigger; versions upload/deploy does not apply triggers.
- [x] Local subscription Worker tests cover authenticated App Store Server API response and
  transaction-field validation, 15-minute session auth, D1
  idempotency, 1,000-credit and 60-photo limits, provider-failure refund, stale-reservation recovery,
  non-refundable 1,250/75 period attempt ceilings, 200/12 Apple-test UTC-day ceilings that survive
  accelerated renewal and privacy deletion, authenticated deletion/tombstones, and expired-request/
  period/orphan-principal cleanup. Persistent
  actor/period/request HMACs use a separately backed-up identity secret that must never rotate;
  session signing uses an independently rotatable secret. This source has not been deployed.
- [x] Apply `0001_ai_subscription_quota.sql` remotely through the atomic file-ingestion runner.
  Readback found no pending migration, 11 `ai_*` objects, `quick_check=ok`, zero foreign-key errors,
  and all 4 existing `rank_entry` rows preserved.
- [ ] Deferred to the separate payment-platform integration: deploy and read back the subscription
  Worker only after its Apple In-App Purchase credentials are installed. Record new immutable normal
  and safe rollback IDs before changing production traffic.
- [ ] Verify the live production text and preview vision model IDs, latency, JSON behavior, and model permissions.
- [x] Track and dry-run a cost-zero safe-degraded Worker that keeps AI fail-closed and legacy deletion available.
- [x] Upload and smoke-test safe-degraded Worker `33abed25-1f2e-497f-8580-72b29e267840`
  as the explicit rollback version; its marked `/parse` is 503 and legacy deletion validation remains available.
- [x] Document the safe rollback boundary: subscription usage/deletion works only with an existing,
  unexpired 15-minute token; session exchange is deliberately disabled, while automatic expiry
  cleanup continues. Do not claim fresh in-app subscription-data deletion during a rollback.
- [x] Record normal Worker `dee65f64-88ee-491f-962f-f9b686bfd561`, safe Worker
  `33abed25-1f2e-497f-8580-72b29e267840`, Pages production
  `1798ec5a-4134-4b02-b553-b00f6ea7e720`, and latest preview
  `14bd35fa-5d7b-41ce-aedc-65fb8baa5cc9`. The first Pages production has no earlier rollback target.
- [x] Ensure the rollback target also keeps rank/evolve/body-avatar retired; never roll back to a
  version that reactivates the removed Gemini or leaderboard paths.

## Production build and store record

- [x] Create signed production build 13 from release commit `35c980d` using local Xcode account
  signing after EAS and API-key cloud-signing paths were unavailable.
- [x] Export and inspect `/tmp/Reploom-13-export-local-account/Reploom.ipa`; SHA-256
  `72e97bcc23796f2cf637214b9d8c68bc908501d0ea3bf29e1edc0a65e7c3a24c`.
- [x] Upload and wait for App Store Connect `VALID` / `APP_STORE_ELIGIBLE`; delivery UUID
  `60e4f17c-e5a9-4cba-93f9-0554a50b543c` and TestFlight build 13 notification received.
- [x] Upload five truthful 1320×2868 Release screenshots to en-US `APP_IPHONE_67`; read back every
  file as `COMPLETE` in the intended order on 2026-07-13.
- [x] Set and read back Health & Fitness category, content-rights declaration, description,
  subtitle, keywords, copyright `2026 Daeseon Yoo`, and reviewer notes.
- [x] After exact Pages route HTTPS verification, set and read back Marketing, Support, Privacy,
  and Privacy Choices URLs from `store.config.json`.
- [x] Confirm `usesIdfa = false`, price = Free in all 175 territories, and Version Release Setting = Manual.
- [ ] Select and read back Tax Category (`Fitness and health`, subject to Account Holder confirmation).
- [x] Record the approved territory plan: `Specific Countries or Regions`, excluding the exact 42
  European storefronts listed in `docs/launch/app-store-listing.md` plus `China mainland`.
- [x] Apply that plan in App Store Connect and independently read back all 175 rows: 132 enabled,
  the exact 43 planned exclusions, no pre-orders, and automatic inclusion of new storefronts off.
  Hong Kong, Macau, and Taiwan are enabled.
- [ ] Keep v1 iPhone-only; read back and disable unverified Apple-silicon Mac and Apple Vision
  compatibility distribution unless those platforms are separately tested.
- [x] Exclude Mainland China until ICP/service availability is separately verified.
- [x] Record Korea e-Commerce Act compliance as `Active` (App Store Connect readback supplied by the
  Account Holder, last updated 2026-06-16).
- [ ] Complete App Privacy using the inventory in `docs/launch/app-store-listing.md`.
- [x] Complete and read back the current age-rating questionnaire: `Health/Wellness = Yes`,
  `Age Assurance = Yes`, `Contests = No`, and every other disclosed content category is none/no.
- [ ] Declare `Regulated Medical Device = No` in App Information and read it back; Reploom makes no
  diagnosis, treatment, or medical-device claim.
- [ ] Complete the required DSA trader/non-trader self-declaration even while every Europe storefront
  is disabled. Do not enable Europe until any required public address, phone, and email verification
  is complete.
- [ ] Verify export-compliance readback, copyright `2026 Daeseon Yoo`, Account Holder agreements,
  and tax/banking gates.
- [x] Add and read back the required review contact name, phone, and email; demo account is not required.
- [x] Document Gmail as the support mailbox plus support-message retention and deletion handling in
  the publishable Privacy Policy.
- [x] Associate only validated Build 13 with version 1.0.
- [x] Re-read every public-API-accessible server-side field and all five screenshots after upload;
  the private App Privacy/DSA/Medical/Mac/Vision gates remain explicitly open above.
- [x] Submit the free Build 13 candidate, read back `WAITING_FOR_REVIEW`, then withdraw it after the
  product decision to add Reploom Pro; final withdrawal readback is recorded at the top of this file.
- [x] Create signed Build 15 from code candidate `c98e021`; export
  `/tmp/Reploom-15-export-local-account/Reploom.ipa` (35,692,630 bytes), SHA-256
  `69cd59077d4b93f80cc36b5ce5e9ae774d15c8f2b1113801cf3e7c6bdeda2936`.
- [x] Apple validation and upload succeeded. Build 15 resource/delivery ID
  `7123db21-dbc0-4126-8f30-5a7105278602` reads `VALID` / `APP_STORE_ELIGIBLE`, minimum iOS 16.4,
  encryption false, and `internalBuildState=IN_BETA_TESTING`.
- [x] Read back the `Internal` TestFlight group with `hasAccessToAllBuilds=true` and Build 15 listed;
  Build 15 is `externalBuildState=READY_FOR_BETA_SUBMISSION`, has no beta App Review, and has no
  App Store version relationship.
- [x] Confirm after Build 15 upload that version 1.0 remains `DEVELOPER_REJECTED` and associated with
  Build 13; the only review submission is still `COMPLETE` with its item `REMOVED`. No new review was
  requested.

## Reploom Pro rebuild and resubmission gates

Scope fence: completed items below mean only the evidence named on that line (repository tests,
local Release simulator, or an App Store Connect readback). The separate payment platform,
Apple server credentials, cleanup cron deployment, production Worker traffic, real
purchase/entitlement exchange, version/first-subscription association, and App Review resubmission
are deferred and remain unchecked. Remote D1 and the Build 14/15 TestFlight uploads are completed only
at the evidence levels named below.

- [ ] Paid Applications Agreement, tax, and banking status are active and read back. Korea
  e-Commerce `Active` is not evidence for this separate gate.
- [x] Create subscription group `22233430` and one-month subscription `6790532250` with product ID
  `ai.daeseon.reploom.pro.monthly.v1`, Family Sharing off, and no introductory offer. The product
  remains `MISSING_METADATA` until its remaining review metadata is supplied.
- [x] Set and read back the USA customer price as US $4.99 and Apple's equalized prices for exactly
  the same 132 storefronts where the app is available. All 132 price rows read back
  `planType=UPFRONT` and `startDate=null`; automatic new-territory inclusion remains off.
- [x] App Store product metadata and implemented paywall copy state the exact allowance: 1,000 AI
  credits per paid period, at most 60 meal photos; workout text 1, meal text 2, transcription 3,
  meal photo 8, and an extra 1 when a voice transcript needs flexible parsing (voice total 3–4,
  preflight requires 4 remaining).
- [x] Billing Grace Period readback is disabled in both production and Sandbox (`optIn=false`,
  `sandboxOptIn=false`, with no duration or renewal type); v1 entitlement behavior depends on it
  remaining disabled.
- [ ] App Store Server API In-App Purchase key is generated once, stored only as Worker secrets, and
  its Key ID/Issuer/bundle/product environment is verified without printing the private key.
  Current Worker secret readback is missing all five required Apple IAP/entitlement names; only
  the older `GROQ_API_KEY` and unused `GEMINI_API_KEY` names exist. Both existing ASC API keys
  authenticated a nonexistent Sandbox transaction as `4040010` but returned HTTP 401 from the
  production StoreKit server, so neither is accepted as the production IAP key.
- [ ] App Store Connect App Privacy answers include linked Product Interaction for successful-use,
  provider-attempt, request-state, period-reset, and Apple-test daily safety aggregates.
- [ ] Before App Privacy Publish, confirm whether Cloudflare retains catalog-request platform
  security metadata in readable form beyond real-time request service. Worker observability is
  disabled; if platform retention still applies, add the relevant IP-derived App Privacy data type
  for its actual App Functionality/security purpose.
- [ ] StoreKit 2 product loading, purchase success, user cancellation, pending approval, renewal,
  expiration/refund, current entitlement, restore, and manage-subscription links are exercised.
- [ ] Non-subscribers and exhausted subscribers can still complete all manual/local logging paths.
- [x] Historical Build 14 Release simulator app (`ai.daeseon.reploom`, version `1.0`, build `14`) preserved the
  realistic v6 seed (5 sessions / 1 open / 20 sets / 1 cardio / 3 foods; integrity `ok`) and visually
  rendered the free Pro card, purchase disclosure, active `412/1000` + `18/60` fixture, and exhausted
  `1000/1000` + `60/60` fixture. This proves only simulator UI behavior, not StoreKit ownership or a
  Worker-backed entitlement.
- [ ] Release simulator + realistic DB seed + StoreKit Test visually verifies product loading,
  paywall, purchase/cancel/pending UI, Terms/Privacy/Restore, VoiceOver labels, and localized price;
  the simulator-only `-ReploomSubscriptionUIFixture=active|quota` launch argument verifies
  entitlement/usage/quota visuals without claiming a Worker-backed entitlement. Native
  `targetEnvironment(simulator)` is the hard gate; the App Store device binary always returns null.
- [ ] TestFlight/Sandbox on a real device verifies purchase → immediate Worker session → quota use →
  restore across reinstall. Simulator-only StoreKit Test is not a substitute for this gate.
- [ ] Upload a truthful paywall review screenshot and set/read back both subscription-group and
  product localizations, product review note, availability, price, tax category, and state
  `READY_TO_SUBMIT`. The live screenshot relationship is `data:null`; the simulator capture that
  says `Loading the App Store price…` / `Subscription unavailable` must not be submitted. Build 15
  live-product loading was repeated with the realistic seed and still showed the same state after
  15 seconds.
- [x] Historical Build 14 Apple validation and TestFlight upload succeeded; Build 14 resource
  `ad2c1d7a-74f9-4516-94be-0c3a226e15d6` reads `VALID` / `APP_STORE_ELIGIBLE`.
- [x] Historical Build 14 is available to the one-tester `Internal` group and reads
  `internalBuildState=IN_BETA_TESTING`; no external group or beta App Review submission exists.
- [x] Tracked Expo build number, generated Debug/Release Xcode settings, final Release simulator,
  device archive, and exported IPA all read Build 15; the IPA independently read bundle
  `ai.daeseon.reploom`, version `1.0`, arm64, minimum iOS 16.4, and encryption false.
- [x] Build 15 Apple validation/TestFlight upload and ASC processing succeeded; resource
  `7123db21-dbc0-4126-8f30-5a7105278602` reads `VALID` / `APP_STORE_ELIGIBLE` and internal
  `IN_BETA_TESTING`. External state is only `READY_FOR_BETA_SUBMISSION`; beta review is absent.
- [ ] Install and launch Build 15 itself on the internal tester's physical iPhone before treating
  group availability or any tester account's general `INSTALLED` state as evidence for this build.
- [x] Replace the Build 13 association with Build 15 on version 1.0. The PATCH returned 204 and
  `/build` read back Build 15, `version=15`, `VALID`, `expired=false`.
- [ ] Select the first subscription with version 1.0 in App Store Connect before creating a new
  review submission. Apple requires the first subscription/app-version association in the web UI.
- [ ] New submission and version both read back `WAITING_FOR_REVIEW`; never infer success from the
  submit click alone.

Future payment-platform gaps, not completion work for this change:

- [ ] If Billing Grace Period is ever enabled, redesign and retest the nominal-expiry entitlement
  policy before changing the App Store setting.
- [ ] Exercise Ask to Buy from pending through later approval without leaving a stale cancellation
  message or losing the initiating AI action.
- [ ] Verify signed-out/offline purchase and restore behavior on a physical device.
- [ ] Install Apple credentials, deploy/read back normal + safe versions and the cleanup cron, and
  verify the live entitlement session against the already-applied D1 schema.
- [ ] Confirm App Privacy Product Interaction answers, the Groq account spend cap, and unit economics
  before treating the allowance as a profitability guarantee.

## Verification ledger required at handoff

- **Function verification:** `npm run typecheck`, `npm run lint`, full app/worker/catalog test
  commands, Release build/archive/export, Apple validation/upload, ASC processing readback, catalog
  HTTP 200/304/404/405, and final Build 15 actual-touch chest flow executed. Build 15 is `VALID` /
  `APP_STORE_ELIGIBLE` / internal `IN_BETA_TESTING`; no review submission was created.
- **Quality verification:** strict TypeScript and lint passed; app Jest passed 64 suites / 458 tests,
  catalog validation 39/39, Worker tests 86/86, and `git diff --check` passed. IPA metadata/string/
  privacy-manifest inspection and 11 original-resolution simulator screenshots were reviewed. This
  is not StoreKit/payment quality evidence.
- **Product/workflow verification:** realistic-seed simulator touch flows covered body-region
  recommendations, aliases/search, set logging, trap-bar Quick Log, and manual meal save/edit/undo;
  QA writes were removed and the baseline integrity/counts were re-read. Physical iPhone TestFlight,
  Health paths, purchase/renew/refund/restore, production entitlement/quota, and App Review remain
  explicitly unverified.
