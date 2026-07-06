# Codex Comprehensive Repository Review

## Review Metadata

- Review date/time: 2026-07-02 18:17:21 EDT
- Git branch: `main`
- HEAD commit: `3fe19bc312b749cbd1aee51b3eea4441b2a8b56c`
- Generated output directory: `codex_review/full/2026-07-02-1817/`
- Review type: full repository verification review. Weekly/monthly cadence was not specified by the user.
- Working tree status at start, excluding `claude_review/`: dirty. Existing modified/untracked files were present before this review, including `README.md`, `app.json`, `package.json`, `package-lock.json`, multiple `src/` files, `worker/src/index.js`, `website/`, `eas.json`, and prior `codex_review/full/` directories. This review did not modify source files.
- Final verification status: both requested report files exist. Both reports contain the same finding IDs F-001 through F-010 with the same severity levels. Final git status, scoped to the new output directory, shows only `?? codex_review/full/2026-07-02-1817/`.
- Independence constraint: `claude_review/` was intentionally excluded from scans and was not read, inspected, summarized, compared, or used as evidence.

## Review Scope

Inspected repository structure, README, package and build configuration, Expo app metadata, EAS config, environment example, SQLite schema and repositories, app routes, major feature components, HealthKit integration, AI/leaderboard Cloudflare Worker, website privacy/support pages, launch/compliance docs, iOS privacy manifest and plist, tests, scripts, and verification command output.

Not inspected: `claude_review/`; old generated review report contents under `codex_review/full/`; full dependency source under `node_modules`; generated build output under `.expo/`, `dist/`, `ios/build/`, and `ios/Pods/`; secret `.env` contents; deployed Cloudflare Worker behavior; remote D1 schema; App Store Connect state; real-device runtime UI.

## Executive Summary

The project is a substantial Expo/React Native fitness app with local SQLite persistence, workout logging, Combat Power scoring, JUICE feedback, HealthKit integration, optional AI parsing/photo flows through a Cloudflare Worker, leaderboards, onboarding, program generation, and a static website. TypeScript, lint, and all 19 Jest suites passed.

Based only on inspected evidence, the app is partially ready for local dogfooding but not ready for public production or App Review. The main blockers are security and compliance: the Worker is public and unauthenticated, HealthKit permissions are broader than inspected code uses, privacy disclosures/native privacy metadata do not match implemented data flows, and worker/D1 deployment is not reproducible from the repo alone.

## Project Overview

- Main stack: Expo SDK 56, React Native 0.85, React 19, Expo Router, TypeScript strict mode, Zustand, Expo SQLite, HealthKit via `@kingstinct/react-native-healthkit`, Skia/audio/haptics for visual feedback.
- Local data: SQLite schema in `src/db/schema.ts`, migration bootstrapped by `SQLiteProvider` in `src/app/_layout.tsx`.
- Backend-like component: Cloudflare Worker in `worker/src/index.js` for `/parse`, `/transcribe`, `/food`, `/rank/*`, and `/evolve`.
- Website/docs: static `website/` pages plus launch and compliance docs under `docs/`.
- Tests: 19 Jest suites, 137 tests, mostly pure logic plus one React component suite.

## Key Findings Summary

| ID | Severity | Category | Title | Confidence |
|---|---|---|---|---|
| F-001 | High | Security / Operations | Public Worker exposes AI, transcription, image, and rank endpoints without authentication or rate limiting | High |
| F-002 | High | Privacy / Compliance | Privacy disclosures and native privacy metadata do not match implemented outbound data flows | High |
| F-003 | High | Security / Health Data | HealthKit authorization requests sensitive data types not used by inspected code | High |
| F-004 | Medium | Data Integrity / UX | Several SQLite write repositories swallow failures, causing silent data loss or optimistic UI mismatch | High |
| F-005 | Medium | Health Data / Correctness | HealthKit workout export can write inaccurate workout metadata | High |
| F-006 | Medium | Deployment / API | D1 `rank_entry` schema and migrations are missing from the Worker repository | High |
| F-007 | Medium | Dependency Security | Production dependency audit includes test stack and reports high/moderate advisories | High |
| F-008 | Medium | Deployment / Release Readiness | `expo-dev-client` and dev menu pods remain in the production dependency/native tree | High |
| F-009 | Low | Operations / Reproducibility | Worker package has no lockfile, so Worker audit/reproducible install cannot be verified | High |
| F-010 | Low | Maintainability / Documentation | Root README is too sparse for setup, verification, and deployment onboarding | High |

## Critical Issues

No Critical issues were confirmed from the inspected evidence.

## High-Priority Issues

### F-001: Public Worker exposes AI, transcription, image, and rank endpoints without authentication or rate limiting

- Severity: High
- Category: Security / Operations
- Evidence:
  - `worker/src/index.js:13-17` sets `access-control-allow-origin: '*'`.
  - `worker/src/index.js:413-423` dispatches all POST routes without checking an auth token, signature, origin allowlist, or per-user quota.
  - `worker/src/index.js:107-131`, `135-165`, `174-244`, `255-280`, and `353-410` handle parse, transcribe, food, rank submit, and evolve operations that call paid/limited third-party services or write D1 data.
  - Client calls send only JSON/content headers, for example `src/features/quicklog/parseEntryAI.ts:46-50`, `src/features/rank/rankClient.ts:34-38`, `src/features/food/parseFoodAI.ts:45-49`, and `src/features/evolution/evolveClient.ts:45-50`.
  - `worker/README.md:36-38` explicitly states the endpoint has no auth and says to add Cloudflare Access or a per-user token before public launch.
- What is wrong: anyone who obtains the Worker URL can call AI parsing, transcription, photo food estimation, image evolution, and leaderboard submit/board routes. The inspected code also lacks app-level request size limits for uploaded audio/images.
- Why it matters: this can burn API quota/cost, degrade service, pollute rankings, and expose public abuse paths from browsers because CORS is open.
- Recommended fix: require a per-install or per-user token, HMAC, or backend-issued session credential; add Cloudflare rate limits/WAF rules; restrict CORS to expected origins where applicable; add upload/body size limits; log abuse signals; separate public read routes from expensive write/generation routes.
- Confidence: High

### F-002: Privacy disclosures and native privacy metadata do not match implemented outbound data flows

- Severity: High
- Category: Privacy / Compliance
- Evidence:
  - `docs/compliance/privacy-policy.md:54-59` and `website/privacy.html:71-76` say meal/avatar photos are processed by Google Gemini.
  - The inspected food-photo implementation sends `/food` multipart photos to Groq: `src/features/food/FoodCard.tsx:105-111`, `src/features/food/parseFoodAI.ts:27-40`, and `worker/src/index.js:217-227`.
  - `docs/compliance/privacy-policy.md:66-75` lists optional leaderboard data as handle, anonymous device ID, and crew code.
  - The app sends and Worker stores ranking score fields too: `src/features/rank/RankSection.tsx:65-72`, `src/features/rank/rankClient.ts:21-31`, and `worker/src/index.js:263-270`.
  - `docs/launch/app-store-listing.md:70-74` says Health/Fitness and optional handle/user ID should not be linked to identity.
  - `ios/OverDrive/PrivacyInfo.xcprivacy:45-56` marks `NSPrivacyCollectedDataTypeFitness` as linked, and `ios/OverDrive/PrivacyInfo.xcprivacy:93-104` marks `NSPrivacyCollectedDataTypeUserID` as linked.
  - `website/support.html:46-49` says voice logging is confirmed before saving, but `src/features/quicklog/QuickLogBar.tsx:76-83` transcribes and immediately calls `runSubmit(heard)`.
- What is wrong: policy/website/App Store guidance/native privacy manifest do not describe the same processors, data fields, linked status, or voice-save behavior as the code.
- Why it matters: mismatched privacy disclosures are an App Review and user-trust risk, especially because health, audio, photo, and optional leaderboard data are sensitive.
- Recommended fix: create one source-of-truth data inventory from code; update `docs/compliance/privacy-policy.md`, `website/privacy.html`, `website/support.html`, `docs/launch/app-store-listing.md`, and `PrivacyInfo.xcprivacy` to match; explicitly disclose CP, week gain, grade, optional region/crew, Groq photo processing, and auto-save voice behavior or change the product behavior to match the disclosures.
- Confidence: High

### F-003: HealthKit authorization requests sensitive data types not used by inspected code

- Severity: High
- Category: Security / Health Data
- Evidence:
  - `src/features/health/health.ts:15-23` includes `HKQuantityTypeIdentifierActiveEnergyBurned` and `HKQuantityTypeIdentifierHeartRate` in `READ_TYPES`.
  - `src/features/health/health.ts:27-32` includes `HKQuantityTypeIdentifierLeanBodyMass` in `WRITE_TYPES`.
  - `src/features/health/health.ts:46-50` requests all read and write types during authorization.
  - `src/features/health/health.ts:127-141` reads workouts, body mass, body fat, VO2 max, and resting heart rate, but not active energy or heart rate.
  - `src/features/health/InBodyScreen.tsx:43-44` writes only weight and body-fat fraction through `writeBodyComposition`, not lean body mass.
  - `app.json:67-68` describes reading energy and heart rate and writing strength workouts.
- What is wrong: the app asks for HealthKit read/write access beyond the data types used by the inspected user-facing code.
- Why it matters: HealthKit review expects minimum-necessary permissions. Over-requesting health data increases rejection risk and weakens the privacy posture.
- Recommended fix: remove unused HealthKit identifiers from authorization until the app actually uses them in visible features, or implement and document those features before requesting access. Keep usage strings and privacy disclosures in lockstep with the final permission set.
- Confidence: High

## Medium-Priority Issues

### F-004: Several SQLite write repositories swallow failures, causing silent data loss or optimistic UI mismatch

- Severity: Medium
- Category: Data Integrity / UX
- Evidence:
  - `src/db/repos/foodRepo.ts:22-33` catches all errors in `addFoodItems` and no-ops.
  - `src/features/food/FoodCard.tsx:51-55` awaits `addFoodItems`, clears the input, reloads, and reads totals without receiving a failure signal.
  - `src/db/repos/disciplineRepo.ts:30-40` catches all errors in `setDisciplineToday` and no-ops.
  - `src/features/discipline/DisciplineCard.tsx:45-64` optimistically toggles local state and only reverts in its own `catch`, but repository errors do not propagate.
  - `src/db/repos/dailyGoalRepo.ts:61-75` catches all errors in `addTarget`, and `src/db/repos/dailyGoalRepo.ts:98-117` returns `{ progress: 0, done: false }` on any `addProgress` failure.
- What is wrong: repository methods intended to tolerate pre-migration dev windows catch every SQLite failure, including real production failures.
- Why it matters: users can lose food logs, discipline toggles, or daily-goal changes without a visible error. Optimistic UI can show success even when no durable write happened.
- Recommended fix: narrow catches to the known missing-table migration case or return an explicit `{ ok, error }` result; let UI revert and show an error on real write failures; add tests for failed writes.
- Confidence: High

### F-005: HealthKit workout export can write inaccurate workout metadata

- Severity: Medium
- Category: Health Data / Correctness
- Evidence:
  - `src/db/repos/sessionRepo.ts:16-20` stores session `date`, `day_type`, and `started_at`.
  - `src/features/forge/useForge.ts:30-33` and `47-50` resume open sessions, but `src/features/forge/sessionStore.ts:52-60` sets resumed `startedAt` to `Date.now()` instead of the persisted `workout_session.started_at`.
  - `src/features/forge/useForge.ts:61-62` writes a HealthKit workout using `new Date(st.startedAt)` and `new Date()`.
  - `src/features/health/health.ts:56-63` always saves `WorkoutActivityType.traditionalStrengthTraining`, regardless of the session day type or cardio modality.
- What is wrong: resumed sessions export a shortened start time, and cardio sessions can be exported as traditional strength training.
- Why it matters: the app can write inaccurate health records, which conflicts with the project's own HealthKit compliance rule to write only real, accurate data.
- Recommended fix: when resuming, pass the persisted `started_at` into session state; fetch the completed session row before HealthKit export; choose the HealthKit activity type from `day_type` or logged cardio modality; consider skipping export when the session type cannot be represented accurately.
- Confidence: High

### F-006: D1 `rank_entry` schema and migrations are missing from the Worker repository

- Severity: Medium
- Category: Deployment / API
- Evidence:
  - `worker/src/index.js:271-279`, `299-319` reads/writes a D1 table named `rank_entry`.
  - `worker/wrangler.toml:15-18` binds a D1 database.
  - `find worker -maxdepth 3 -type f -not -path '*/node_modules/*' -print` returned only `worker/README.md`, `worker/package.json`, `worker/wrangler.toml`, and `worker/src/index.js`.
  - `worker/README.md:10-16` deploy steps do not create or migrate the D1 schema.
- What is wrong: the Worker depends on a D1 table whose schema is not reproducible from version-controlled Worker files.
- Why it matters: a new environment, CI deployment, or disaster recovery restore can deploy a Worker that fails at runtime on `/rank/*`.
- Recommended fix: add versioned D1 migration SQL for `rank_entry`, document `wrangler d1 migrations apply`, add an idempotent smoke command for `/rank/submit` and `/rank/board`, and keep schema changes with Worker code changes.
- Confidence: High

### F-007: Production dependency audit includes test stack and reports high/moderate advisories

- Severity: Medium
- Category: Dependency Security
- Evidence:
  - `package.json:35` lists `jest-expo` under `dependencies`, while other testing packages are in `devDependencies` at `package.json:49-56`.
  - `npm audit --omit=dev` failed with 13 vulnerabilities: 1 high (`form-data` CRLF injection) and 12 moderate.
  - `npm ls form-data js-yaml uuid` showed `form-data@4.0.5` via `jest-expo -> jest-environment-jsdom -> jsdom`, `js-yaml@3.14.2` via `jest-expo`, and `uuid@7.0.3` via `expo-splash-screen -> @expo/config-plugins -> xcode`.
- What is wrong: test tooling is part of the production dependency tree, and the production audit currently fails.
- Why it matters: it increases release dependency surface and can block security gates even when the vulnerable path is test-only in practice.
- Recommended fix: move `jest-expo` to `devDependencies`; remediate advisories through supported Expo-compatible upgrades; rerun `npm audit --omit=dev` and full tests after lockfile changes.
- Confidence: High

### F-008: `expo-dev-client` and dev menu pods remain in the production dependency/native tree

- Severity: Medium
- Category: Deployment / Release Readiness
- Evidence:
  - `package.json:17` includes `expo-dev-client` in app dependencies.
  - `ios/Podfile.lock` contains `expo-dev-client`, `expo-dev-launcher`, `expo-dev-menu`, and `expo-dev-menu-interface` entries, confirmed by `rg -n "expo-dev-client|expo-dev-launcher|expo-dev-menu" ...`.
  - `ios/Podfile.properties.json:3` sets `EX_DEV_CLIENT_NETWORK_INSPECTOR` to `true`.
  - `docs/app-store-launch-checklist.md:49-53` explicitly says to remove or deliberately justify `expo-dev-client` before the final archive.
- What is wrong: development client/native dev menu components remain in the dependency and pod graph even though launch docs flag this as a final archive gate.
- Why it matters: it increases binary surface and can create App Review or runtime-release risk if dev tooling is present in the submitted archive.
- Recommended fix: remove `expo-dev-client` for the release target, regenerate native pods, verify the archived plist and binary do not include dev launcher/menu/network inspector entries, or document a deliberate release-safe justification.
- Confidence: High

## Low-Priority Issues

### F-009: Worker package has no lockfile, so Worker audit/reproducible install cannot be verified

- Severity: Low
- Category: Operations / Reproducibility
- Evidence:
  - `worker/package.json:5-10` defines `wrangler` as a dev dependency.
  - `find worker -maxdepth 2 -name 'package-lock.json' -o -name 'npm-shrinkwrap.json' -o -name 'yarn.lock' -o -name 'pnpm-lock.yaml'` returned no files.
  - `npm audit --prefix worker --omit=dev` failed with `ENOLOCK`.
- What is wrong: Worker dependency resolution is not pinned independently, and audit cannot run for the Worker package.
- Why it matters: deploys can drift across machines and dates.
- Recommended fix: add and commit a Worker lockfile through a controlled package-manager operation, or fold the Worker into a root workspace with a shared lockfile.
- Confidence: High

### F-010: Root README is too sparse for setup, verification, and deployment onboarding

- Severity: Low
- Category: Maintainability / Documentation
- Evidence:
  - `README.md:1-3` contains only the project name and one-sentence description.
  - Setup details exist elsewhere, for example `worker/README.md`, `.env.example`, and launch docs, but the root entry point does not link them.
- What is wrong: a new contributor or release operator cannot discover install, test, environment, Worker, HealthKit, or release commands from the root README.
- Why it matters: operational knowledge remains scattered, increasing onboarding and release risk.
- Recommended fix: add a concise root quickstart with prerequisites, `npm run typecheck`, `npm run lint`, `npm test -- --runInBand`, Expo run commands, `.env.example`, Worker deploy/migration links, and release checklist links.
- Confidence: High

## Product Completeness Review

The inspected app covers a broad local fitness loop: onboarding, program generation/editing, active workout logging, QuickLog text/voice, food logging, daily goals, discipline, arena/rankings, evolution images, settings, HealthKit sync, and static support/privacy pages.

Confirmed product gaps:

- Public launch is not ready because launch docs still list required gates: trademark clearance, privacy labels, dev-client removal, production Worker verification, signed real-device dogfood, and store assets (`docs/app-store-launch-checklist.md:24-83`).
- Voice support copy says users confirm before saving (`website/support.html:46-49`), but the inspected app auto-saves after transcription (`src/features/quicklog/QuickLogBar.tsx:76-83`).

No additional concrete product-completeness issue was found from inspected evidence.

## Architecture Review

The app has understandable module boundaries: `src/db` for local persistence, `src/features` for domain features, `src/stores` for Zustand state, `src/app` for routes, and `worker/` for server-side AI/ranking proxy code. SQLite access is mostly parameterized and feature repos isolate SQL from UI components.

Confirmed architecture risks are F-004, F-006, and F-009. The largest architectural boundary concern is that the Worker is acting as both expensive AI proxy and public leaderboard API without an authentication or migration layer.

## Security Review

Confirmed security/compliance issues are F-001, F-002, F-003, F-007, and F-008.

Positive evidence:

- No client API keys were found in inspected source. `.env.example:1-7` states `EXPO_PUBLIC_*` is non-secret and the LLM key lives in Worker secrets.
- Local SQLite queries inspected in repositories use parameterized `?` bindings for dynamic values.
- `app.json:13-15` sets `ITSAppUsesNonExemptEncryption` false, and `app.json:46-71` provides usage strings for audio, photos, and HealthKit.

No concrete issue found for hardcoded API secret values in inspected source.

## Data and API Review

The local SQLite schema is explicit and versioned in `src/db/schema.ts`. `migrateDbIfNeeded` enables foreign keys on open (`src/db/migrate.ts:18-20`) and seeds exercises idempotently (`src/db/migrate.ts:50-52`, `src/db/seed.ts:57-68`).

Confirmed data/API issues are F-004, F-005, and F-006.

Assumption: remote D1 schema may already exist, but it was not verified from repository files or remote Cloudflare state.

## Frontend and UX Review

The app includes loading/error/empty states in several important screens, for example Active Workout loading/load-failed/empty/missing states (`src/features/workout/ActiveWorkoutCard.tsx:477-499`) and ranking empty/offline states (`src/features/rank/RankSection.tsx:146-147`). Many controls have accessibility labels/roles.

Confirmed UX issues:

- F-004 creates silent failure paths where the UI can clear input or stay optimistically toggled after a failed write.
- F-002 includes a support-page mismatch for voice confirmation versus actual auto-save behavior.

No full visual/responsiveness verification was performed because this was a repository-only review and no simulator/browser UI was launched.

## Testing Review

Verification results:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test -- --runInBand`: passed, 19 suites and 137 tests.

Confirmed testing gaps:

- Worker routes have no test script in `worker/package.json:5-7` and no Worker test files were found in the inspected test inventory.
- F-004 write-failure behavior is not covered by tests from inspected evidence.
- F-006 D1 migration/deploy smoke is not covered from repository evidence.

Recommended test additions:

- Unit tests for Worker request validation, auth rejection, JSON normalization, and D1 rank behavior.
- Repository/UI tests that simulate SQLite write failures and assert visible errors or rollback.
- HealthKit export mapping tests for session start time and activity type selection.

## Performance and Scalability Review

Confirmed scalability risks:

- F-001: public unauthenticated expensive endpoints can be abused.
- Worker upload paths read full files into memory and base64 strings before provider calls (`worker/src/index.js:189-192`, `369-372`) without inspected app-level size checks.
- D1 leaderboard queries rank by counting rows greater than the user's score (`worker/src/index.js:311-315`); acceptable for small dogfood data, but it needs indexes and load testing before public scale.

No concrete local-app performance issue was confirmed from tests or inspected code.

## Deployment and Operations Review

Confirmed deployment/ops issues are F-001, F-006, F-008, and F-009.

Additional evidence:

- `eas.json:27-31` contains App Store Connect IDs and an absolute local key path (`/Users/daeseonyoo/.secrets/...`). The private key itself is not committed, but the path is machine-specific.
- `docs/app-store-launch-checklist.md:55-58` says production Worker endpoints still need confirmation.

Recommended operational additions:

- CI job for typecheck/lint/test/audit.
- Worker migration/apply/smoke workflow.
- Release archive checklist that verifies dev-client removal and final privacy metadata.

## Maintainability Review

Confirmed maintainability issues are F-006, F-009, and F-010.

Positive evidence:

- TypeScript strict mode is enabled (`tsconfig.json:3-4`).
- Core algorithms have colocated tests.
- Settings persistence has an explicit success/failure API in `src/stores/settingsStore.ts:31-39`, which is a good pattern to extend to other repos.

No broad duplication or unreadable module-boundary issue was confirmed beyond the findings above.

## Recommended Fix Plan

Must fix before public production/App Review:

1. Fix Worker security: auth/token, rate limits, upload limits, abuse logging, and ranking write protection.
2. Align privacy policy, website, App Store listing guidance, and `PrivacyInfo.xcprivacy` with actual code data flows.
3. Reduce HealthKit permissions to only implemented, visible features.
4. Remove or explicitly release-gate `expo-dev-client` and verify the final archive.
5. Add Worker D1 migrations and production smoke tests.
6. Fix HealthKit workout export metadata before writing to Apple Health.

Should fix soon:

1. Stop swallowing real SQLite write failures and surface errors to UI.
2. Move test-only packages out of production dependencies and remediate audit advisories.
3. Add Worker lockfile or workspace management.
4. Add Worker route tests and write-failure UI tests.

Later improvements:

1. Expand root README into a runnable quickstart.
2. Add CI coverage for audit, Worker deploy checks, and privacy-manifest consistency.
3. Add public-launch observability for Worker errors, quota, latency, and abuse.

## Assumptions and Not Verified

- Not verified: deployed Worker URL behavior, Cloudflare secrets, Cloudflare rate-limit settings, and remote D1 schema.
- Not verified: App Store Connect privacy nutrition labels or submitted native privacy manifest.
- Not verified: real-device HealthKit behavior or exact HealthKit unit semantics at runtime.
- Not verified: visual layout, accessibility behavior with screen readers, or responsive rendering on devices.
- Not verified: `.env` contents, because local secret/config files were intentionally not read.
- Assumption: `claude_review/` may exist, but it was excluded and not used.
- Assumption: dependency advisories from `npm audit` are relevant to release gating even if some vulnerable paths are development/test-only in runtime practice.

## Commands Run

Read-only inspection and verification commands run before report creation:

| Command | Purpose | Result |
|---|---|---|
| `pwd` | Confirm repository path | Passed |
| `git branch --show-current` | Capture branch | Passed |
| `git rev-parse HEAD` | Capture HEAD commit | Passed |
| `git status --short -- . ':!claude_review/**'` | Capture working tree status excluding `claude_review/` | Passed |
| `find . -path './claude_review' -prune -o -maxdepth 2 -type d -print` | Map top-level directories while pruning `claude_review/` | Passed |
| `rg --files -g '!claude_review/**'` | File inventory excluding `claude_review/` | Passed |
| `nl -ba package.json` | Inspect root package scripts/dependencies | Passed |
| `nl -ba app.json` | Inspect Expo app config and permissions | Passed |
| `nl -ba eas.json` | Inspect EAS submit/build config | Passed |
| `nl -ba README.md` | Inspect root docs | Passed |
| `nl -ba jest.config.js` | Inspect test config | Passed |
| `nl -ba eslint.config.js` | Inspect lint config | Passed |
| `nl -ba tsconfig.json` | Inspect TypeScript config | Passed |
| `nl -ba worker/package.json` | Inspect Worker package | Passed |
| `nl -ba worker/src/index.js` | Inspect Worker routes | Passed |
| `nl -ba worker/wrangler.toml` | Inspect Worker deployment binding | Passed |
| `nl -ba worker/README.md` | Inspect Worker docs | Passed |
| `nl -ba src/features/quicklog/parseEntryAI.ts` | Inspect AI parse client | Passed |
| `nl -ba src/features/food/parseFoodAI.ts` | Inspect food AI client | Passed |
| `nl -ba src/features/rank/rankClient.ts` | Inspect rank client | Passed |
| `nl -ba src/features/evolution/evolveClient.ts` | Inspect evolution client | Passed |
| `nl -ba src/features/quicklog/config.ts` | Inspect public endpoint config | Passed |
| `nl -ba src/db/schema.ts` | Inspect SQLite schema | Passed |
| `nl -ba src/db/migrate.ts` | Inspect migrations | Passed |
| `nl -ba src/db/seed.ts` | Inspect seed data | Passed |
| `nl -ba src/db/uuid.ts` | Inspect ID generation | Passed |
| `nl -ba src/db/repos/setLogRepo.ts` | Inspect set repo | Passed |
| `nl -ba src/db/repos/cardioRepo.ts` | Inspect cardio repo | Passed |
| `nl -ba src/db/repos/userRepo.ts` | Inspect user repo | Passed |
| `nl -ba src/db/repos/foodRepo.ts` | Inspect food repo | Passed |
| `nl -ba src/features/food/FoodCard.tsx` | Inspect food UI flow | Passed |
| `nl -ba src/features/quicklog/useQuickLog.ts` | Inspect QuickLog flow | Passed |
| `nl -ba src/features/quicklog/QuickLogBar.tsx` | Inspect voice/text QuickLog UI | Passed |
| `nl -ba src/features/quicklog/transcribe.ts` | Inspect transcription client | Passed |
| `nl -ba src/features/logging/SetLoggerSheet.tsx` | Inspect manual set logger | Passed |
| `nl -ba src/features/logging/CardioLoggerSheet.tsx` | Inspect cardio logger | Passed |
| `nl -ba src/features/logging/useLogSet.ts` | Inspect set hot path | Passed |
| `nl -ba src/features/logging/useLogCardio.ts` | Inspect cardio hot path | Passed |
| `nl -ba src/features/forge/useForge.ts` | Inspect session lifecycle | Passed |
| `nl -ba src/features/forge/sessionStore.ts` | Inspect session state | Passed |
| `nl -ba src/db/repos/sessionRepo.ts` | Inspect session repo | Passed |
| `nl -ba src/db/repos/combatPowerRepo.ts` | Inspect Combat Power persistence | Passed |
| `nl -ba src/db/repos/powerEventRepo.ts` | Inspect power event repo | Passed |
| `nl -ba src/features/health/health.ts` | Inspect HealthKit access | Passed |
| `nl -ba src/features/health/useHealth.ts` | Inspect HealthKit store flow | Passed |
| `nl -ba src/features/health/InBodyScreen.tsx` | Inspect body composition UI | Passed |
| `nl -ba src/features/health/types.ts` | Inspect health data types | Passed |
| `nl -ba docs/compliance/health-data.md` | Inspect health compliance docs | Passed |
| `nl -ba docs/compliance/privacy-policy.md` | Inspect privacy policy | Passed |
| `nl -ba src/features/rank/RankSection.tsx` | Inspect ranking UI flow | Passed |
| `nl -ba src/features/arena/ArenaCard.tsx` | Inspect arena UI | Passed |
| `nl -ba src/features/arena/useArena.ts` | Inspect arena state | Passed |
| `nl -ba src/features/arena/weeklyBoss.ts` | Inspect weekly boss logic | Passed |
| `nl -ba src/features/arena/rival.ts` | Inspect rival logic | Passed |
| `nl -ba src/stores/settingsStore.ts` | Inspect settings persistence | Passed |
| `nl -ba src/lib/settings.ts` | Inspect settings parsing | Passed |
| `nl -ba src/app/_layout.tsx` | Inspect root layout/bootstrap | Passed |
| `nl -ba src/features/boot/Boot.tsx` | Inspect boot hydration | Passed |
| `nl -ba src/app/(tabs)/settings.tsx` | Inspect settings route | Failed, unquoted shell path glob |
| `nl -ba src/app/(tabs)/_layout.tsx` | Inspect tabs layout | Failed, unquoted shell path glob |
| `nl -ba 'src/app/(tabs)/settings.tsx'` | Inspect settings route | Passed |
| `nl -ba 'src/app/(tabs)/_layout.tsx'` | Inspect tabs layout | Passed |
| `nl -ba 'src/app/(tabs)/index.tsx'` | Inspect Today route | Passed |
| `nl -ba 'src/app/(tabs)/power.tsx'` | Inspect Power route | Passed |
| `nl -ba 'src/app/(tabs)/history.tsx'` | Inspect History route | Passed |
| `nl -ba src/app/plan.tsx` | Inspect plan route | Passed |
| `nl -ba src/app/program.tsx` | Inspect program route | Passed |
| `nl -ba src/app/inbody.tsx` | Inspect InBody route | Passed |
| `nl -ba src/features/program/ProgramEditorScreen.tsx` | Inspect program editor | Passed |
| `nl -ba src/features/program/AutoPlanScreen.tsx` | Inspect auto plan flow | Passed |
| `nl -ba src/features/program/useProgram.ts` | Inspect program resolution hook | Passed |
| `nl -ba src/features/program/generate.ts` | Inspect plan generation | Passed |
| `nl -ba src/features/program/resolve.ts` | Inspect program resolver | Passed |
| `nl -ba src/features/program/defaultProgram.ts` | Inspect default program | Passed |
| `nl -ba src/features/program/types.ts` | Inspect program types | Passed |
| `nl -ba src/features/workout/ActiveWorkoutCard.tsx` | Inspect active workout UI | Passed |
| `rg --files ... | rg '\.test\.(ts|tsx)$'` | Inventory tests excluding generated/dependency/review dirs | Passed |
| `rg -n "TODO|FIXME|HACK|XXX|not implemented|Phase [0-9]|before launch|launch" ...` | Search known issue comments/docs | Passed, output truncated by tool |
| `rg -n "EXPO_PUBLIC|API_KEY|SECRET|TOKEN|password|authorization|Bearer|endpoint|workers.dev|GROQ|GEMINI|D1|database_id" ...` | Search secrets/config/security-sensitive strings | Passed |
| `rg -n "catch ..."` | Search error-swallowing paths | Passed |
| `rg -n "Alert\.alert|accessibilityLabel|accessibilityRole|KeyboardAvoiding|SafeArea|TextInput|Pressable" src ...` | Inspect UX/accessibility signal | Passed |
| `npm run typecheck` | TypeScript verification | Passed |
| `npm run lint` | Lint verification | Passed |
| `npm test -- --runInBand` | Jest verification | Passed, 19 suites / 137 tests |
| `npm audit --omit=dev` | Root production dependency audit | Failed with vulnerabilities found |
| `npm audit --prefix worker --omit=dev` | Worker audit | Failed, no Worker lockfile |
| `npm ls form-data js-yaml uuid` | Trace audit dependency paths | Passed |
| `npm ls --prefix worker wrangler` | Inspect Worker dependency resolution | Passed |
| `find worker -maxdepth 2 -name ...lock...` | Check Worker lockfile presence | Passed, no lockfile found |
| `find . ... -name '.env*' -print` | Check env example presence without reading `.env` | Passed |
| `nl -ba .gitignore` | Inspect ignore rules | Passed |
| `nl -ba .env.example` | Inspect env example | Passed |
| `nl -ba docs/app-store-launch-checklist.md` | Inspect launch checklist | Passed |
| `nl -ba docs/launch/app-store-listing.md` | Inspect App Store listing guidance | Passed |
| `nl -ba website/privacy.html` | Inspect public privacy page | Passed |
| `nl -ba website/support.html` | Inspect support page | Passed |
| `nl -ba website/index.html` | Inspect marketing page | Passed |
| `find ios ... -name 'PrivacyInfo.xcprivacy' -print` | Locate iOS privacy manifest | Passed |
| `nl -ba ios/OverDrive/PrivacyInfo.xcprivacy` | Inspect privacy manifest | Passed |
| `plutil -p ios/OverDrive/Info.plist` | Inspect iOS plist | Passed |
| `plutil -p ios/OverDrive/PrivacyInfo.xcprivacy` | Parse privacy manifest | Passed |
| `find ios -maxdepth 2 -name 'Podfile*' -print` | Locate iOS pod config | Passed |
| `nl -ba ios/Podfile` | Inspect Podfile | Passed |
| `rg -n "expo-dev-client|expo-dev-launcher|expo-dev-menu|EXDev|DevLauncher|DevMenu" ...` | Check dev-client/native dev menu presence | Passed |
| `nl -ba ios/Podfile.properties.json` | Inspect pod properties | Passed |
| `rg -n "rank_entry|CREATE TABLE|migrations|D1|wrangler d1" worker docs content src ...` | Check D1 schema/migration evidence | Passed |
| `find worker -maxdepth 3 -type f -not -path '*/node_modules/*' -print` | Confirm Worker versioned file set | Passed |
| `find . ... \( -name '*schema*' -o -name '*migration*' -o -name '*.sql' \) -print` | Locate schema/migration/SQL files | Passed |
| `date '+%Y-%m-%d-%H%M %Y-%m-%d %H:%M:%S %Z'` | Generate output timestamp | Passed |
| `ls codex_review/full` | Check output directory collisions | Passed |
| `mkdir -p codex_review/full/2026-07-02-1817` | Create review output directory | Passed |
| `find codex_review/full/2026-07-02-1817 -maxdepth 1 -type f -print` | Verify both report files exist | Passed |
| `rg -n '^### F-[0-9]{3}|\| F-[0-9]{3} \|' codex_review/full/2026-07-02-1817/comprehensive-review.en.md` | Verify English finding IDs and summary | Passed |
| `rg -n '^### F-[0-9]{3}|\| F-[0-9]{3} \|' codex_review/full/2026-07-02-1817/comprehensive-review.ko.md` | Verify Korean finding IDs and summary | Passed |
| `rg -n 'Evidence:|src/|worker/|docs/|website/|ios/|package.json|README.md|npm audit|npm test|npm run' codex_review/full/2026-07-02-1817/comprehensive-review.en.md` | Verify evidence references in English report | Passed |
| `rg -n 'Evidence:|src/|worker/|docs/|website/|ios/|package.json|README.md|npm audit|npm test|npm run' codex_review/full/2026-07-02-1817/comprehensive-review.ko.md` | Verify evidence references in Korean report | Passed |
| `git status --short -- . ':!claude_review/**'` | Final repository status excluding `claude_review/` | Passed |
| `git status --short -- codex_review/full/2026-07-02-1817` | Confirm review-created path scope | Passed |

## Files Inspected

Important inspected files/directories:

- `README.md`
- `.env.example`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `app.json`
- `eas.json`
- `tsconfig.json`
- `jest.config.js`
- `eslint.config.js`
- `src/app/`
- `src/db/`
- `src/features/`
- `src/stores/`
- `src/lib/`
- `src/ui/`
- `worker/package.json`
- `worker/README.md`
- `worker/wrangler.toml`
- `worker/src/index.js`
- `docs/app-store-launch-checklist.md`
- `docs/launch/app-store-listing.md`
- `docs/compliance/health-data.md`
- `docs/compliance/privacy-policy.md`
- `website/index.html`
- `website/privacy.html`
- `website/support.html`
- `ios/OverDrive/Info.plist`
- `ios/OverDrive/PrivacyInfo.xcprivacy`
- `ios/Podfile`
- `ios/Podfile.properties.json`
- `ios/Podfile.lock`

Explicitly not inspected: any file under `claude_review/`.
