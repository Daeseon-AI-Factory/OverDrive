# Codex Comprehensive Repository Review

## Review Metadata

- Review date/time: 2026-06-18 13:17 EDT (America/Toronto)
- Git branch: `main`
- HEAD commit: `d15d747f3893dc9715c43267ab89525fdab196e7`
- Working tree status at review start: dirty before this review. Existing modified/untracked paths included `docs/troubleshooting.md`, multiple files under `src/`, `worker/src/index.js`, and `src/features/theme/`.
- Generated output directory: `codex_review/full/2026-06-18-1317/`
- Review type: full repository verification review requested by the user; not verified as an automated weekly/monthly cadence.
- Independence: `claude_review/` was not read, inspected, summarized, compared, or used as evidence.

## Review Scope

Inspected repository source code, configuration, docs, tests, git metadata, and command results, excluding `claude_review/` and excluding existing `codex_review/` outputs. The review covered the Expo React Native app, local SQLite schema and repositories, HealthKit integration, AI proxy clients, Cloudflare Worker, D1 leaderboard code, i18n files, docs, tests, and package/security metadata.

Not inspected: `claude_review/`; local secrets such as `.env`; live Cloudflare account settings; app-store dashboards; real-device HealthKit behavior; external production logs; generated native build output. No dependencies were installed and no source files were modified.

## Executive Summary

The project appears partially ready for local dogfooding and Phase 1-style iteration: `npm run typecheck`, `npm test -- --runInBand`, `npm run lint`, and locale key parity passed. It is not ready for public production launch based on inspected evidence.

The highest-risk blockers are public unauthenticated Worker endpoints, privacy/compliance text that no longer matches implemented off-device AI and leaderboard flows, over-broad HealthKit permission requests, and unresolved public brand/app identifier readiness. No Critical issue is reported because the repository docs frame the current Worker as dogfooding-only; if the same endpoints are publicly launched without controls, CDX-001 should be treated as Critical.

## Project Overview

The repository is an Expo SDK 56 / React Native app named `OverDrive`. It tracks workouts, food/protein, daily goals, body composition, HealthKit-derived fitness inputs, and a gamified Combat Power score. It uses Expo Router, SQLite via `expo-sqlite`, Zustand stores, i18next locale files, Skia/Reanimated UI effects, and a Cloudflare Worker for AI parsing/transcription/food/evolution image generation plus a D1-backed leaderboard.

Major components inspected include:

- Mobile app routes under `src/app/`
- Feature modules under `src/features/`
- SQLite schema and repositories under `src/db/`
- Settings/state helpers under `src/lib/` and `src/stores/`
- Cloudflare Worker under `worker/`
- Documentation under `docs/`
- Jest tests and package scripts

## Key Findings Summary

| ID | Severity | Category | Title | Confidence |
|---|---|---|---|---|
| CDX-001 | High | Security / Operations | Public Worker endpoints have no authentication, rate limiting, or abuse controls in repo code | High |
| CDX-002 | High | Compliance / Privacy | Privacy docs and user-facing AI copy are outdated for implemented off-device flows | High |
| CDX-003 | High | Health / Store Compliance | HealthKit requests read permissions that current code does not use | High |
| CDX-004 | High | Release / Brand | App still ships as `OverDrive` despite launch-blocking brand research and placeholder identifiers | High |
| CDX-005 | Medium | Security / Product Integrity | D1 leaderboard scores are fully client-asserted and easy to spoof | High |
| CDX-006 | Medium | Data / Deployment | Worker D1 schema is not reproducible from versioned migrations | High |
| CDX-007 | Medium | Database / Migrations | SQLite migration versioning skips sequential migration semantics | High |
| CDX-008 | Medium | Frontend / Accessibility | Reusable controls and daily goal actions lack accessible roles/labels | High |
| CDX-009 | Medium | Dependency Security | `npm audit` reports unresolved vulnerabilities in the current lockfile | High |
| CDX-010 | Low | Documentation | Top-level README does not document setup, architecture, or operating flows | High |

## Critical Issues

No Critical issue was confirmed from the inspected evidence.

## High-Priority Issues

### CDX-001 - Public Worker endpoints have no authentication, rate limiting, or abuse controls in repo code

- Severity: High
- Category: Security / Operations
- Evidence:
  - `worker/src/index.js:13-17` sets CORS to `access-control-allow-origin: '*'`, `POST, OPTIONS`, and `content-type`.
  - `worker/src/index.js:413-423` routes POST requests to `/transcribe`, `/food`, `/rank/submit`, `/rank/board`, `/evolve`, or default parse without an auth/token check.
  - `worker/README.md:36-39` states the endpoint has no auth and says to add Cloudflare Access or a per-user token before public launch.
- What is wrong: Anyone who discovers the Worker URL can call AI, transcription, image, and D1 leaderboard endpoints. Repository code does not enforce authentication, per-user tokens, rate limits, request-size limits, or abuse throttles.
- Why it matters: Public launch would expose Groq/Gemini quota, D1 writes, and photo/audio upload paths to abuse. This can create cost, availability, privacy, and leaderboard-integrity problems.
- Recommended fix: Require per-install or per-user authentication for Worker requests; add Cloudflare WAF/rate limiting and request body size limits; restrict origins where useful; monitor endpoint abuse; keep unauthenticated mode only for local dogfooding.
- Confidence: High

### CDX-002 - Privacy docs and user-facing AI copy are outdated for implemented off-device flows

- Severity: High
- Category: Compliance / Privacy
- Evidence:
  - `docs/compliance/privacy-policy-draft.md:17-23` says Phase 1 runs entirely on-device with no backend upload.
  - `docs/compliance/privacy-policy-draft.md:57` says Phase 1 sends nothing off-device and does not share data with third-party AI services.
  - `docs/compliance/privacy-policy-draft.md:64-66` says all app data is stored locally and no server-side copies are maintained.
  - `docs/compliance/privacy-policy-draft.md:84` promises `[Settings -> Delete my data]`; `src/app/(tabs)/settings.tsx:86-260` contains settings sections for language, units, profile, program, health, theme, juice, sound, and weight step, but no delete-data action. A repository search for delete/clear data found only item-level deletes and the privacy doc.
  - Implemented off-device flows include QuickLog text/catalog to Worker (`src/features/quicklog/parseEntryAI.ts:46-50`, `src/features/quicklog/useQuickLog.ts:87-94`), voice/audio upload (`src/features/quicklog/transcribe.ts:10-17`, `src/features/quicklog/QuickLogBar.tsx:75-83`), food text/photo upload (`src/features/food/parseFoodAI.ts:28-40`, `src/features/food/parseFoodAI.ts:44-52`, `src/features/food/FoodCard.tsx:79-90`, `src/features/food/FoodCard.tsx:105-112`), evolution photo upload (`src/features/evolution/evolveClient.ts:43-60`), Gemini image processing (`worker/src/index.js:389-399`), and D1 leaderboard submissions (`src/features/rank/rankClient.ts:34-39`, `src/features/rank/RankSection.tsx:65-74`).
  - `src/i18n/locales/en.json:400` says the evolution photo passes through "your own server only", while `worker/src/index.js:389-399` forwards it to Gemini.
- What is wrong: The privacy policy draft and in-app privacy copy do not match implemented network behavior.
- Why it matters: Public or beta distribution with inaccurate privacy disclosures can create store-review, legal, trust, and user-consent problems, especially because the app handles health-adjacent logs, photos, audio, food, and AI processing.
- Recommended fix: Update privacy policy and in-app copy before any beta/public release. Disclose Cloudflare Worker, Groq, Gemini, D1 leaderboard, data categories, purposes, retention, deletion/withdrawal controls, and opt-in status. Implement the promised delete-data flow or remove the promise.
- Confidence: High

### CDX-003 - HealthKit requests read permissions that current code does not use

- Severity: High
- Category: Health / Store Compliance
- Evidence:
  - `src/features/health/health.ts:15-23` requests read permission for workouts, active energy burned, heart rate, resting heart rate, VO2 max, body mass, and body fat percentage.
  - `src/features/health/health.ts:127-141` reads workouts, body mass, body fat percentage, VO2 max, and resting heart rate; it does not read active energy burned or general heart rate.
  - `src/features/health/useHealth.ts:28-39` persists workouts, VO2 max, body mass, body fat percentage, and sync time only.
  - `src/lib/settings.ts:41-49` stores the same health fields and has no active-energy or heart-rate field.
  - `docs/compliance/health-data.md:12-14` and `docs/compliance/health-data.md:55-60` state that only minimum necessary data tied to real user-facing features should be requested.
- What is wrong: The permission request includes health data types not used by current code paths.
- Why it matters: Over-broad HealthKit permission prompts can trigger app-review rejection and reduce user trust.
- Recommended fix: Remove `HKQuantityTypeIdentifierActiveEnergyBurned` and `HKQuantityTypeIdentifierHeartRate` from read permissions until there is a real feature and storage path using them, or implement the feature and update user-facing permission copy accordingly.
- Confidence: High

### CDX-004 - App still ships as `OverDrive` despite launch-blocking brand research and placeholder identifiers

- Severity: High
- Category: Release / Brand
- Evidence:
  - `app.json:3-8` sets app name, slug, and scheme to `OverDrive` / `overdrive`.
  - `app.json:10-13` sets iOS `bundleIdentifier` to `com.anonymous.overdrive`.
  - `app.json:14-22` has Android configuration but no Android `package`.
  - `docs/compliance/brand-availability.md:11-17` says "NO-GO" on `OverDrive` for a consumer fitness app because of a same-category `Overdrive Fitness` collision.
  - `docs/compliance/brand-availability.md:100-108` recommends not using `OverDrive` as the public store-facing brand.
- What is wrong: Release configuration still uses the disputed name and placeholder identifiers.
- Why it matters: Store submission and public launch are likely to hit brand, trademark, app-store similarity, and package identity issues.
- Recommended fix: Pick a cleared public brand; update `app.json` name, slug, scheme, icons, iOS bundle identifier, and Android package; reserve domains/socials; obtain legal clearance before submission.
- Confidence: High

## Medium-Priority Issues

### CDX-005 - D1 leaderboard scores are fully client-asserted and easy to spoof

- Severity: Medium
- Category: Security / Product Integrity
- Evidence:
  - `worker/src/index.js:254-280` accepts caller-supplied `deviceId`, `handle`, `cp`, `weekGain`, `gradeKey`, `crew`, and `region`; it clamps only numeric ranges and upserts by caller-supplied `deviceId`.
  - `src/features/rank/rankClient.ts:21-40` sends score fields directly from the client.
  - `src/features/rank/RankSection.tsx:63-74` computes and submits current score and weekly gain client-side.
  - `src/features/rank/RankSection.tsx:18-22` and `src/i18n/locales/en.json:414` state Phase 1 scores are self-reported and verification comes later.
- What is wrong: The leaderboard has no server-owned identity, signature, replay protection, or server-side score derivation.
- Why it matters: The ranking can be trivially manipulated if presented as a real competitive public feature.
- Recommended fix: Keep Phase 1 rankings clearly labeled as self-reported, or add signed submissions, server-owned identities, replay protection, and score sanity checks based on server-verified sync/log data before public competitive use.
- Confidence: High

### CDX-006 - Worker D1 schema is not reproducible from versioned migrations

- Severity: Medium
- Category: Data / Deployment
- Evidence:
  - `worker/src/index.js:272`, `worker/src/index.js:301`, `worker/src/index.js:308`, and `worker/src/index.js:312` query the `rank_entry` table.
  - `worker/wrangler.toml:15-18` binds D1 database `overdrive-rank`.
  - `find worker -maxdepth 3 -type f -not -path '*/node_modules/*' -print` found only `worker/README.md`, `worker/package.json`, `worker/wrangler.toml`, and `worker/src/index.js`.
  - `rg -n "CREATE TABLE|CREATE INDEX|ALTER TABLE|DROP TABLE" worker -g '!node_modules/**'` returned no matches.
- What is wrong: The table required by Worker code is not created by any versioned schema or migration in the repository.
- Why it matters: A new environment cannot be reproduced reliably from source, and D1 schema drift can break `/rank/*` endpoints.
- Recommended fix: Add Cloudflare D1 migrations such as `worker/migrations/*.sql` with `CREATE TABLE rank_entry (...)`, indexes, and a documented `wrangler d1 migrations apply` process; add a CI or local check for migration presence.
- Confidence: High

### CDX-007 - SQLite migration versioning skips sequential migration semantics

- Severity: Medium
- Category: Database / Migrations
- Evidence:
  - `src/db/migrate.ts:21-42` handles version `0` and version `1`, then sets any other version mismatch directly to `DATABASE_VERSION`.
  - `src/db/migrate.ts:44-49` runs `MIGRATION_003`, `MIGRATION_004`, and `MIGRATION_005` every boot as idempotent additive migrations.
  - `src/db/schema.ts:148-200` confirms those current migrations are `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.
  - `src/db/migrate.ts:14-16` says future migrations should be added as version blocks and never edit shipped migrations.
- What is wrong: The current version bump pattern masks skipped versions and is safe only because current later migrations are idempotent table creation. Future non-additive transforms could be skipped or marked applied without running.
- Why it matters: This is a data-integrity risk for future releases with real user data.
- Recommended fix: Replace the direct jump with sequential migration execution, e.g. `while (version < DATABASE_VERSION)` with explicit cases that run migration N, then bump `user_version` after success. Keep boot self-healing only for idempotent safety operations.
- Confidence: High

### CDX-008 - Reusable controls and daily goal actions lack accessible roles/labels

- Severity: Medium
- Category: Frontend / Accessibility
- Evidence:
  - `src/features/logging/Stepper.tsx:80-82` and `src/features/logging/Stepper.tsx:110-112` render minus/plus `Pressable` controls without `accessibilityRole`, `accessibilityLabel`, or state.
  - The Stepper is used for onboarding/settings/InBody/daily-goal numeric inputs, including `src/app/(tabs)/settings.tsx:117-136`.
  - `src/features/dailyGoals/DailyGoalsCard.tsx:27-29` add action lacks role/label.
  - `src/features/dailyGoals/DailyGoalsCard.tsx:43-45` uses long-press removal on the goal label with only a hint, no explicit role/label.
  - `src/features/dailyGoals/DailyGoalsCard.tsx:59-72` done/increment/check actions lack role/label.
- What is wrong: Screen readers cannot reliably announce the intent of key controls, and a destructive remove action is hidden behind long-press.
- Why it matters: This degrades accessibility and can make daily workflows difficult or impossible for assistive-technology users.
- Recommended fix: Add explicit roles and labels such as "Decrease bodyweight", "Increase bodyweight", "Add daily goal", "Complete goal {label}", and "Reset goal {label}". Provide an explicit accessible remove control or accessible action for deletion.
- Confidence: High

### CDX-009 - `npm audit` reports unresolved vulnerabilities in the current lockfile

- Severity: Medium
- Category: Dependency Security
- Evidence:
  - `npm audit --audit-level=moderate` exited with failure and reported 37 vulnerabilities: 36 moderate and 1 high.
  - Audit output identified high severity `form-data` CRLF injection (`form-data` 4.0.0-4.0.5).
  - `npm ls form-data js-yaml uuid --all` showed `form-data@4.0.5` through `jest-expo -> jest-environment-jsdom -> jsdom`, `js-yaml@3.14.2` through Jest/Istanbul, and `uuid@7.0.3` through Expo config plugin / `xcode` dependencies.
- What is wrong: The lockfile contains vulnerable transitive packages.
- Why it matters: The confirmed exposure appears mostly in dev/test/build tooling rather than directly in mobile runtime paths, but unresolved high/moderate advisories should be tracked and updated before production hardening.
- Recommended fix: Update through Expo-compatible dependency versions; avoid blindly running `npm audit fix --force` because audit suggested breaking changes; document any temporary exceptions pinned by Expo tooling.
- Confidence: High

## Low-Priority Issues

### CDX-010 - Top-level README does not document setup, architecture, or operating flows

- Severity: Low
- Category: Documentation
- Evidence:
  - `README.md:1-2` contains only the title and `OverDrive`.
  - `package.json:58-67` has runnable scripts, and `worker/README.md:8-27` documents Worker deploy basics, but there is no top-level onboarding that ties app, worker, env vars, tests, and production caveats together.
- What is wrong: New developers/operators cannot bootstrap or review the system from the root README.
- Why it matters: This increases onboarding cost and makes release-critical caveats easier to miss.
- Recommended fix: Expand README with stack overview, setup, environment variables, app/worker run commands, D1 migration process, HealthKit requirements, test gates, and public-launch caveats.
- Confidence: High

## Product Completeness Review

The core product surface is broad: workout logging, AI QuickLog, food logging, daily goals, HealthKit sync, body composition entry, Combat Power, evolution image generation, arena, and rankings are represented in source code. Automated typecheck, lint, unit/component tests, and locale parity passed.

Confirmed product-readiness issues are CDX-002 and CDX-004. The privacy/compliance story and public brand identity do not match the implemented product. Also, the privacy draft promises an in-app delete-data path that was not found in the settings screen or repository search.

Not verified: real-device flows, app-store review behavior, HealthKit prompts, image/audio upload UX under poor network conditions, and end-to-end mobile navigation.

## Architecture Review

The repository is organized into reasonably clear app, feature, database, store, UI, and Worker boundaries. SQLite repositories keep most persistence logic under `src/db/repos/`. The Worker centralizes external AI keys server-side, which is a good boundary for secret handling.

Meaningful architecture risks are CDX-006 and CDX-007. The mobile database has a migration pattern that works for current idempotent additive migrations but is fragile for future non-additive changes. The Worker uses a D1 table that is not reproducible from repository migrations.

No concrete issue found from the inspected evidence in module naming or circular dependency behavior.

## Security Review

No committed API key value was found by secret-oriented searches over tracked source/docs excluding review directories. `.env` is ignored by `.gitignore`, and `.env.example` contains only `EXPO_PUBLIC_QUICKLOG_ENDPOINT` as a placeholder.

Confirmed security issues are CDX-001, CDX-005, and CDX-009. The Worker has public unauthenticated endpoints, the leaderboard trusts client-submitted scores, and dependency audit reports unresolved advisories.

Not verified: Cloudflare account-level WAF/rate limits, secret values, production DNS exposure, and external logging/redaction behavior.

## Data and API Review

The app uses local SQLite with schema and repository modules. Current Jest coverage includes multiple pure logic areas and at least one component. The Worker exposes JSON/multipart endpoints for AI parsing, transcription, food, rank, and evolution.

Confirmed data/API issues are CDX-006 and CDX-007. The D1 schema is missing from versioned source, and mobile migration version semantics can incorrectly mark future migrations as applied.

No concrete issue found from inspected evidence in the current local SQLite table definitions themselves.

## Frontend and UX Review

The frontend includes many loading/error/empty state strings and localized UI keys. Locale key parity across English, Korean, Spanish, and Chinese passed.

Confirmed UX/accessibility issue is CDX-008. Some key Pressable controls lack accessibility metadata, especially Stepper and daily goals. Product-copy mismatch in CDX-002 also affects UX because users are told an AI photo stays on "your own server only" while Worker code forwards it to Gemini.

Not verified: layout on physical devices, screen-reader behavior in simulator/device, visual regression screenshots, and responsiveness across all viewport sizes.

## Testing Review

Commands passed:

- `npm run typecheck`
- `npm test -- --runInBand` (18 test suites, 128 tests)
- `npm run lint`
- Locale key parity script for `en`, `ko`, `es`, and `zh`

Testing gaps from inspected evidence:

- No Worker endpoint tests were found for auth, bad payloads, AI provider failures, or D1 ranking behavior.
- No migration integration test was found for existing-user SQLite upgrades.
- No accessibility tests were found for custom Pressable controls.
- No real-device HealthKit tests were run.
- No production build/export command was run because it may create artifacts outside the requested review output directory.

## Performance and Scalability Review

The app uses local-first storage, which limits server scalability needs for core logging. Worker AI calls are bounded by some client-side timeouts in mobile code, such as QuickLog and food/evolution uploads.

The main scalability risk is CDX-001: public unauthenticated Worker endpoints can scale cost and abuse without user-level throttling. The D1 leaderboard also lacks anti-abuse controls (CDX-005).

Not verified: bundle size, startup performance, Skia/Reanimated runtime performance, D1 query performance at large table sizes, and Cloudflare Worker quotas.

## Deployment and Operations Review

The app has Expo scripts for start, platform runs, lint, typecheck, and tests. The Worker has a Wrangler config with model vars and a D1 binding. `.env.example` documents the mobile Worker endpoint placeholder.

Confirmed deployment/operations issues are CDX-001, CDX-004, CDX-006, CDX-009, and CDX-010. Before public launch, the project needs Worker access controls, brand/package cleanup, D1 migrations, dependency remediation/exception tracking, and root-level setup/release documentation.

No concrete issue found from inspected evidence in TypeScript or lint configuration.

## Maintainability Review

The codebase generally separates feature concerns and uses typed modules for app data. The strongest maintainability concerns are operational rather than stylistic: missing Worker migrations, README absence, and migration sequencing.

No broad refactor is recommended from this review. Fix the concrete risks first, with narrowly scoped changes and tests around migrations, Worker behavior, and accessibility.

## Recommended Fix Plan

Must fix before public production or broad beta:

1. CDX-001: Add Worker authentication, rate limiting, request size limits, and abuse monitoring.
2. CDX-002: Rewrite privacy policy and in-app privacy copy to match AI, photo/audio, food, and D1 flows; add or remove the promised delete-data flow.
3. CDX-003: Trim HealthKit permissions to current feature usage or implement real active-energy/heart-rate usage.
4. CDX-004: Select a cleared public brand and update app identifiers/package metadata.
5. CDX-006: Add versioned D1 migrations and document/apply them.
6. CDX-009: Remediate or explicitly track dependency advisories with Expo-compatible versions.

Should fix next:

1. CDX-005: Harden leaderboard integrity or keep it visibly self-reported.
2. CDX-007: Convert mobile migrations to sequential versioned execution.
3. CDX-008: Add accessibility metadata and accessible deletion controls.
4. CDX-010: Write a production-useful root README.

## Assumptions and Not Verified

- Not verified: contents of local `.env` or ignored secret files.
- Not verified: Cloudflare account-level WAF, rate limiting, Access, secrets, logs, or D1 schema in the live account.
- Not verified: app behavior on real iOS/Android devices, HealthKit authorization prompts, or App Store / Play Console submission behavior.
- Not verified: live trademark/domain/app-store availability beyond repository docs.
- Not verified: performance profiling, production build artifacts, or EAS build behavior.
- Assumption: The dirty working tree modifications that existed before report generation belong to the user or prior work and were not part of this review.
- Confirmed: `claude_review/` was not read, inspected, summarized, compared, or used.

## Commands Run

Metadata and repository inventory:

- `date '+%Y-%m-%d-%H%M %Z %z'` - captured local review timestamp; passed.
- `git branch --show-current` - captured branch; passed.
- `git rev-parse HEAD` - captured HEAD commit; passed.
- `git status --short` - captured working tree status; passed.
- `rg --files -g '!claude_review/**' -g '!codex_review/**'` - repository file inventory excluding review outputs; passed.
- `base="codex_review/full/$(date '+%Y-%m-%d-%H%M')"; dir="$base"; i=2; while [ -e "$dir" ]; do dir=$(printf '%s-%02d' "$base" "$i"); i=$((i+1)); done; mkdir -p "$dir"; printf '%s\n' "$dir"` - created unique output directory; passed.

Source and documentation reads:

- `sed -n` and `nl -ba` reads were run against important docs/configs/source files, including `README.md`, `package.json`, `app.json`, `tsconfig.json`, `jest.config.js`, `eslint.config.js`, `.gitignore`, `.env.example`, `docs/STATE.md`, `docs/overdrive-spec.md`, `docs/phase1-plan.md`, `docs/active-workout-blueprint.md`, `docs/troubleshooting.md`, `docs/compliance/health-data.md`, `docs/compliance/privacy-policy-draft.md`, `docs/compliance/brand-availability.md`, `src/db/schema.ts`, `src/db/migrate.ts`, `src/db/seed.ts`, repository files under `src/db/repos/`, app routes under `src/app/`, feature files under `src/features/`, state/settings files under `src/lib/` and `src/stores/`, UI primitives, i18n locale files, `worker/src/index.js`, `worker/wrangler.toml`, `worker/package.json`, and `worker/README.md`; passed unless noted below.
- Failed first due to unquoted shell glob characters, then rerun successfully with quotes: `nl -ba src/app/(tabs)/index.tsx`, `nl -ba src/app/(tabs)/power.tsx`, `nl -ba src/app/(tabs)/settings.tsx`, `nl -ba src/app/(tabs)/history.tsx`, and `nl -ba src/app/(tabs)/_layout.tsx`.
- `nl -ba 'src/app/(tabs)/settings.tsx' | sed -n '1,220p'` and `nl -ba 'src/app/(tabs)/settings.tsx' | sed -n '220,360p'` - inspected settings actions and absence of delete-data UI; passed.
- `nl -ba src/i18n/locales/en.json | sed -n '395,420p'` - inspected AI/privacy and rank strings; passed.

Search and verification commands:

- Secret/auth/logging-oriented `rg` searches over repository source/docs excluding `claude_review/` and `codex_review/`; passed with no committed API key value found.
- `git ls-files .env .env.example ios/.xcode.env ios/.xcode.env.local` - checked tracked env-related files; passed.
- `git check-ignore -v .env ios/.xcode.env.local` - checked ignored secret/native env files; passed.
- `rg -n "rank_entry" -g '!claude_review/**' -g '!codex_review/**' .` - searched D1 table references; passed.
- `find worker -maxdepth 3 -type f -not -path '*/node_modules/*' -print` - listed Worker source files excluding `node_modules`; passed.
- `rg -n "CREATE TABLE|CREATE INDEX|ALTER TABLE|DROP TABLE" worker -g '!node_modules/**'` - searched Worker DDL/migrations; returned no matches with exit code 1.
- `rg -n "Delete my data|delete my data|clear data|reset data|delete.*data|clear.*database|drop table|DELETE FROM" src docs -g '!claude_review/**' -g '!codex_review/**'` - searched delete-data functionality; passed.
- A broader `find worker ... -type f -print` was run once without excluding `worker/node_modules`; it listed filenames only and was not used as finding evidence.

Quality/security commands:

- `npm run typecheck` - TypeScript check; passed.
- `npm test -- --runInBand` - Jest tests; passed, 18 suites and 128 tests.
- `npm run lint` - Expo lint; passed.
- Node locale parity script comparing locale keys across `src/i18n/locales/en.json`, `ko.json`, `es.json`, and `zh.json` - passed with 0 missing and 0 extra keys.
- `npm audit --audit-level=moderate` - dependency audit; failed with 37 vulnerabilities (36 moderate, 1 high).
- `npm ls form-data js-yaml uuid --all` - traced vulnerable transitive dependencies; passed.

Post-write verification commands:

- `ls -l codex_review/full/2026-06-18-1317` - verified both report files exist; passed.
- Node script extracting `### CDX-*` headings from both reports - verified English/Korean finding ID parity; passed.
- Node script checking each `CDX-*` section for `Evidence:` and `Recommended fix:` - verified 10 findings in each report and no missing evidence/fix sections; passed.
- `git status --short` - verified final worktree status; passed. The only review-created path shown was `codex_review/full/2026-06-18-1317/`; other dirty paths were present before this review.

Commands intentionally not run:

- Dependency installation/update commands were not run.
- Destructive commands were not run.
- Production export/build commands were not run because they may create artifacts outside the requested review output directory.

## Files Inspected

Important inspected files and directories:

- `README.md`
- `package.json`, `package-lock.json` via audit/lock-dependent commands
- `app.json`, `tsconfig.json`, `jest.config.js`, `eslint.config.js`, `.gitignore`, `.env.example`
- `docs/STATE.md`, `docs/overdrive-spec.md`, `docs/phase1-plan.md`, `docs/active-workout-blueprint.md`, `docs/troubleshooting.md`
- `docs/compliance/health-data.md`, `docs/compliance/privacy-policy-draft.md`, `docs/compliance/brand-availability.md`
- `src/app/`
- `src/db/schema.ts`, `src/db/migrate.ts`, `src/db/seed.ts`, `src/db/repos/`
- `src/features/health/`, `src/features/quicklog/`, `src/features/food/`, `src/features/evolution/`, `src/features/rank/`, `src/features/dailyGoals/`, `src/features/logging/`, `src/features/program/`, `src/features/onboarding/`, `src/features/workout/`, `src/features/arena/`, `src/features/juice/`, `src/features/theme/`
- `src/lib/`, `src/stores/`, `src/ui/`, `src/i18n/`
- `worker/src/index.js`, `worker/wrangler.toml`, `worker/package.json`, `worker/README.md`
