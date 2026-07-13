# Reploom App Store Launch Checklist

Updated: 2026-07-12. App Store Connect app `6786831176`, bundle `ai.daeseon.reploom`.

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

- [ ] Replace the unverified `support@reploom.app` placeholder with a working public contact.
- [ ] Add the verified operator identity required for the published privacy/terms pages.
- [ ] Render and inspect Privacy, Support, Terms, and Data pages at mobile and desktop widths.
- [x] Run full Jest, strict TypeScript, lint, Expo config/doctor, Worker dry-run, plist validation.
- [x] Build Release for a 6.9-inch simulator with realistic seeded data.
- [ ] App verification: AI OFF → zero HTTP calls, AI ON → disclosed calls only, withdrawal → zero future calls.
- [ ] Verify local QuickLog save/edit/undo while AI is off and while endpoint access fails.
- [x] Verify body-region recommendations on the final Release build.
- [ ] Verify full exercise search on the final Release build (unit tests pass; final UI automation did not complete).
- [x] Verify SQLite directory, DB, WAL, and SHM backup exclusion in Simulator.
- [ ] Verify `FileProtection.complete` after locking a physical iPhone.
- [x] Inspect the built app for no dev-client dependency and no retired avatar/rank API or UI.
- [x] Upgrade-path check: pre-v1 avatar photos are deleted; request-time voice/photo cache files are
  deleted after success/failure/cancel and swept after an interrupted session.

## Public services

- [ ] Deploy `website/` to `https://reploom.pages.dev`.
- [ ] Verify `/`, `/privacy`, `/support`, `/terms`, `/data` return HTTPS 200 without redirect loops.
- [ ] Deploy the Worker with observability disabled.
- [ ] Independently verify `/parse`, `/transcribe`, and `/food` success/error/size contracts; consent remains a client-side gate.
- [ ] Verify `/rank/delete`; verify `/rank/submit`, `/rank/board`, `/evolve`, `/body-avatar` return 410.
- [ ] Confirm Cloudflare edge rate limiting and Groq spend limits; record the chosen thresholds.
- [ ] Verify the live production text and preview vision model IDs, latency, JSON behavior, and model permissions.
- [x] Track and dry-run a cost-zero safe-degraded Worker that keeps AI fail-closed and legacy deletion available.
- [ ] Upload and smoke-test that safe-degraded Worker as the explicit rollback version.
- [ ] Record the deployed Worker and Pages version identifiers for rollback.
- [ ] Ensure the rollback target also keeps rank/evolve/body-avatar retired; never roll back to a
  version that reactivates the removed Gemini or leaderboard paths.

## Production build and store record

- [ ] Create the new EAS production build (expected build number 13; verify, do not assume).
- [ ] Download and inspect the IPA before upload.
- [ ] Upload with App Store Connect API credentials and wait for `VALID` / App Store eligibility.
- [ ] Upload 1–10 truthful 6.9-inch screenshots from the same release candidate.
- [ ] Set Health & Fitness category, content-rights declaration, description, subtitle, keywords,
  copyright, Support/Privacy/Privacy Choices URLs, and reviewer notes.
- [ ] Confirm `usesIdfa = false`, price = Free, Tax Category (`Fitness and health`, subject to account
  owner confirmation), distribution territories, and Version Release Setting = Manual.
- [ ] Keep v1 iPhone-only; read back and disable unverified Apple-silicon Mac and Apple Vision
  compatibility distribution unless those platforms are separately tested.
- [ ] For chosen storefronts, resolve conditional China ICP/service availability and organization-
  account Korea requirements before enabling those territories.
- [ ] Complete App Privacy using the inventory in `docs/launch/app-store-listing.md`.
- [ ] Complete the current age-rating questionnaire (`Health/Wellness = Yes`, likely
  `Age Assurance = Yes`, `Contests = No` because Arena has no user-to-user competition); record the
  live answers and Apple's generated global and regional results.
- [ ] Declare `Regulated Medical Device = No` in App Information and read it back.
- [ ] Complete DSA trader self-assessment; if trader, verify the public address, phone, and email.
- [ ] Verify export-compliance readback, exact copyright, Account Holder agreements, and tax/banking gates.
- [ ] Add required review contact name, phone, and email; set demo account required to false.
- [ ] If support uses email, document the mailbox provider, support-message fields, retention, and
  deletion handling in the published Privacy Policy.
- [ ] Associate only the new validated build.
- [ ] Re-read every server-side field and screenshot after upload.
- [ ] Add the version to App Review and submit only after every item above is verified.

## Verification ledger required at handoff

- Function: exact commands, endpoints, UI controls, and ASC state observed.
- Quality: test totals, lint/type results, original-resolution screenshot review, archive scan.
- Product/workflow: real logging/meal/Health paths exercised; anything simulator-only or untested on
  a physical iPhone must remain explicitly labeled.
