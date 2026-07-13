# Reploom App Store Launch Checklist

Updated: 2026-07-13. App Store Connect app `6786831176`, bundle `ai.daeseon.reploom`.

## Verified before this release candidate

- App Store version `1.0` exists in `PREPARE_FOR_SUBMISSION`.
- TestFlight build 12 is `VALID`, but it predates this compliance/usability release candidate and
  must not be selected for App Review.
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
- [ ] Render and inspect Privacy, Support, Terms, and Data pages at mobile and desktop widths.
  Production Privacy and preview home/privacy passed visual inspection in iPhone 17 Pro Max Safari;
  desktop visual QA remains open after the fresh iPad Safari launch timed out.
- [x] Run full Jest, strict TypeScript, lint, Expo config/doctor, Worker dry-run, plist validation.
- [x] Build Release for a 6.9-inch simulator with realistic seeded data.
- [ ] App verification: AI OFF → zero HTTP calls, AI ON → disclosed calls only, withdrawal → zero future calls.
- [ ] Verify local QuickLog save/edit/undo while AI is off and while endpoint access fails.
- [x] Verify body-region recommendations on the final Release build.
- [x] Verify full exercise search on the final Release build: Maestro entered `bench`, the live
  catalog returned Barbell Bench Press with the seeded last-set context, and the result was visually inspected.
- [x] Verify SQLite directory, DB, WAL, and SHM backup exclusion in Simulator.
- [ ] Verify `FileProtection.complete` after locking a physical iPhone.
- [x] Inspect the built app for no dev-client dependency and no retired avatar/rank API or UI.
- [x] Upgrade-path check: pre-v1 avatar photos are deleted; request-time voice/photo cache files are
  deleted after success/failure/cancel and swept after an interrupted session.

## Public services

- [x] Deploy `website/` to `https://reploom.pages.dev`; production deployment
  `1798ec5a-4134-4b02-b553-b00f6ea7e720` is branch `main`, source `b9ddda1`.
- [x] Verify `/`, `/privacy`, `/support`, `/terms`, `/data` return HTTPS 200 without redirects,
  contain the intended title/contact, and are byte-identical to the tracked HTML.
- [x] Deploy the Worker with `logpush=false`; the Cloudflare script-settings readback returned
  `observability=null` and no tail consumer, so Worker observability is not enabled.
- [ ] Independently verify `/parse`, `/transcribe`, and `/food` success/error/size contracts; consent remains a client-side gate.
  Live Groq text parsing returned a structured set and local Worker tests cover error/size behavior;
  live audio and meal-photo success paths remain open.
- [x] Verify `/rank/delete` invalid-input validation; verify `/rank/submit`, `/rank/board`, `/evolve`,
  `/body-avatar` return 410 on both the normal live version and immutable safe version.
- [ ] Confirm Cloudflare edge rate limiting and Groq spend limits; Worker version readback confirms
  30 cost tokens per 60 seconds, while the account-level Groq spend cap remains unverified.
- [ ] Verify the live production text and preview vision model IDs, latency, JSON behavior, and model permissions.
- [x] Track and dry-run a cost-zero safe-degraded Worker that keeps AI fail-closed and legacy deletion available.
- [x] Upload and smoke-test safe-degraded Worker `33abed25-1f2e-497f-8580-72b29e267840`
  as the explicit rollback version; its marked `/parse` is 503 and legacy deletion validation remains available.
- [x] Record normal Worker `dee65f64-88ee-491f-962f-f9b686bfd561`, safe Worker
  `33abed25-1f2e-497f-8580-72b29e267840`, Pages production
  `1798ec5a-4134-4b02-b553-b00f6ea7e720`, and preview
  `21bfe398-a8f2-4461-90c0-24fd1eeec7f7`. The first Pages production has no earlier rollback target.
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
- [ ] Add the version to App Review and submit only after every item above is verified. URL completion
  did not close the gate: the version-item POST still returned `409 STATE_ERROR.ENTITY_STATE_INVALID`,
  the draft still has zero items, and no submission has occurred.

## Verification ledger required at handoff

- Function: exact commands, endpoints, UI controls, and ASC state observed.
- Quality: test totals, lint/type results, original-resolution screenshot review, archive scan.
- Product/workflow: real logging/meal/Health paths exercised; anything simulator-only or untested on
  a physical iPhone must remain explicitly labeled.
