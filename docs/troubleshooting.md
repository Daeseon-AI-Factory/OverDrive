# Troubleshooting log

Issues hit and the fix for each. Newest at the bottom.

Format for each entry: **Symptom** · **Cause** · **Fix** · **Commit** · (optional **Pattern**).

When you fix a non-trivial issue, append an entry below. The Stop hook in `.claude/settings.json` reminds about this after any recent commit.

---

## How to add a new entry

```markdown
## <short title>

- **Symptom**: <literal error message or observable behavior>
- **Cause**: <verified explanation> (or `Hypothesis: ... Verified by: ...`)
- **Fix**: <files/functions changed, mechanism>
- **Commit**: <hash from `git rev-parse HEAD` AFTER committing>
- **Pattern**: <one-line recurring lesson — optional>
```

Concrete only. Numbers, file paths, commit hashes. No "lessons learned" essays.

---

## Stop hook references a CLAUDE.md that didn't exist (logging system half-wired)

- **Symptom**: The Stop hook references project rules that were not in the repo. `.claude/hooks/stop-check.sh:2` reads `# Project-log Stop hook — see CLAUDE.md "Project log (required, dual-write)".` and every block message emits `Per CLAUDE.md project log rules:`, but:
  ```
  $ test -f CLAUDE.md && echo EXISTS || echo MISSING
  MISSING
  ```
- **Cause**: The bootstrap was run only partially. Installed: `.claude/hooks/stop-check.sh` (v3, exec bit set, 6676 bytes), `.claude/settings.json` (Stop hook wired), `docs/troubleshooting.md` (seed), `content/logs/OverDrive/` (empty dir). The "append CLAUDE.md rule block" step was skipped. Verified by: `find` listing showed no CLAUDE.md, `git status --short` showed `.claude/` and `docs/` untracked, `content/logs/OverDrive` empty.
- **Fix**: Created `CLAUDE.md` with the `"Project log (required, dual-write)"` section the hook names (dual-write spec, .mdx frontmatter template, 7 anti-hallucination rules, visibility defaults, decision tiers, workflow) plus the OVERDRIVE non-negotiables. Added `content/logs/OverDrive/.gitkeep` so the empty dir survives git. Committed the whole scaffold (5 files, 287 insertions).
- **Commit**: 2675f48
- **Pattern**: A Stop hook that names CLAUDE.md is inert/misleading until CLAUDE.md actually exists — when installing the logging system, verify the referenced doc is present, not just the hook + settings.

## Expo SDK 56 scaffold — three install/type frictions

- **Symptom**: After `create-expo-app` (SDK 56 default template), `npx tsc --noEmit` failed:
  ```
  src/components/animated-icon.web.tsx(5,21): error TS2307: Cannot find module './animated-icon.module.css' or its corresponding type declarations.
  src/constants/theme.ts(6,8): error TS2882: Cannot find module or type declarations for side-effect import of '@/global.css'.
  ```
- **Cause**: SDK 56 template imports `global.css` / `*.module.css` (web styling) but ships no ambient TS declaration for CSS modules; `expo-env.d.ts` (which would cover it) is only generated on `expo start`, not at scaffold time.
- **Fix**: Added `types/css.d.ts` with `declare module '*.css';` + a typed `*.module.css` declaration. `tsconfig` `include: ["**/*.ts"]` picks it up → `tsc --noEmit` clean.
- **Commit**: 1cfc136

- **Symptom**: `npm install -D @testing-library/react-native` aborted:
  ```
  npm error code ERESOLVE
  npm error Could not resolve dependency:
  npm error peer react@"^19.2.7" from react-test-renderer@19.2.7
  ```
- **Cause**: RTL 13.3.3 pulls the latest `react-test-renderer` in the 19.2 line (19.2.7, peers react ^19.2.7), but Expo SDK 56 pins `react@19.2.3`. react / react-test-renderer must be the exact same version.
- **Fix**: `npm install -D @testing-library/react-native react-test-renderer@19.2.3` — pinning the renderer to the SDK's React version resolves cleanly (RTL peer is just `>=18.2.0`).
- **Commit**: 1cfc136
- **Pattern**: When a lib pulls `react-test-renderer` transitively, pin it to the project's exact `react` version (Expo-pinned) instead of `--legacy-peer-deps`.

- **Symptom**: `npx jest` validation error:
  ```
  Module @testing-library/react-native/extend-expect in the setupFilesAfterEnv option was not found.
  ```
- **Cause**: RTL v13 auto-registers its jest matchers; the old `@testing-library/react-native/extend-expect` entry point was removed.
- **Fix**: Removed `setupFilesAfterEnv` from `jest.config.js` (RTL 13 needs no extend-expect). Sanity test passes → jest + jest-expo + babel-preset-expo transforms TS.
- **Commit**: 1cfc136

## tsc can't find jest globals (describe/it/expect) despite @types/jest installed

- **Symptom**: Tests run green under `jest`, but `npx tsc --noEmit` fails on every test file:
  ```
  src/features/combat-power/computeCombatPower.test.ts(33,1): error TS2593: Cannot find name 'describe'. Do you need to install type definitions for a test runner?
  ...(135,3): error TS2304: Cannot find name 'expect'.
  ```
- **Cause**: `@types/jest@30.0.0` is installed and `expo/tsconfig.base` sets no `compilerOptions.types`, yet tsc's automatic `node_modules/@types` acquisition did not surface the jest ambient globals under this config (verified: `ls node_modules/@types/jest` present, base `types` field = none).
- **Fix**: Added `types/jest.d.ts` containing `/// <reference types="jest" />`. The reference directive force-loads @types/jest globally without a `compilerOptions.types` array (which would have suppressed @types/react etc.). `tsc --noEmit` clean afterward.
- **Commit**: d3dd577
- **Pattern**: Prefer a `/// <reference types="x" />` file over a `compilerOptions.types` array when you only need to *add* one ambient package — the array is exclusive and silently drops all other auto-included @types.
<!-- skipped: d3b66d1 docs(log): record combat-power v1 + jest-globals fix (d3dd577) [no-log] -->

## expo-doctor caught a native peer dep + version drift that tsc passed clean on

- **Symptom**: `tsc --noEmit` and `jest` both green, but `npx expo-doctor` failed 2/21:
  ```
  ✖ Check that required peer dependencies are installed
  Missing peer dependency: expo-asset  (Required by: expo-audio)
  Your app may crash outside of Expo Go without this dependency.
  ✖ Check that packages match versions required by installed Expo SDK
  @types/jest  expected 29.5.14  found 30.0.0
  ```
- **Cause**: expo-audio declares `expo-asset` as a native peer dep that `npx expo install expo-audio` did NOT pull transitively — a TypeScript build never references it, so tsc stays green while the dev/EAS build would crash at runtime. Separately, `@types/jest@30` was installed against jest-expo's bundled jest 29.
- **Fix**: `npx expo install expo-asset` (added its config plugin) + `npm i -D @types/jest@~29.5.14` (align types to the jest 29 runtime). `expo-doctor` → 21/21, tsc still clean, 39/39 jest.
- **Commit**: aa9d668
- **Pattern**: Run `expo-doctor` before declaring an Expo feature done — typecheck/tests can't see missing NATIVE peer deps or SDK version drift, and those surface only at build/runtime on device.

- **Symptom**: `tsc` error on the tab layout: `Type '({ color }: { color: string; }) => Element' is not assignable to ... { color: ColorValue }`.
- **Cause**: expo-router `Tabs.Screen` `tabBarIcon` passes `color: ColorValue` (which includes `OpaqueColorValue`), not `string`.
- **Fix**: typed the icon render prop param as `{ color: ColorValue }` (imported from react-native). `<Text style={{ color }}>` accepts ColorValue.
- **Commit**: aa9d668
<!-- skipped: efab586 docs(log): record Phase 1 runnable slice + expo-doctor fixes (aa9d668) [no-log] -->
<!-- skipped: f2db76f docs(log): record SkSL shader sources (061b378) [no-log] -->
<!-- skipped: 071a147 docs(log): record brand NO-GO research (1da3947) [no-log] -->
<!-- skipped: fe7be02 docs(log): record dev-client build + prebuild config (71b56bd) [no-log] -->

## React Compiler era react-hooks lint rules block ref-write-in-render and setState-in-effect

- **Symptom**: `expo lint` (eslint-config-expo flat) errored on patterns tsc/jest pass clean on:
  ```
  src/features/logging/Stepper.tsx:31  Cannot update ref during render  react-hooks/refs
  src/features/logging/SetLoggerSheet.tsx:42  Avoid calling setState() directly within an effect  react-hooks/set-state-in-effect
  ```
- **Cause**: SDK 56 ships the newer `react-hooks` rules and the project has `reactCompiler: true`. `valueRef.current = value` during render and a synchronous `setCount(0)` inside `useEffect` both break the React Compiler's assumptions.
- **Fix**: (1) Stepper — moved the ref sync into `useEffect(() => { valueRef.current = value; }, [value])`. (2) SetLoggerSheet — removed the in-effect `setCount(0)` and reset state via a remount `key={activeExercise?.id}` on the parent (idiomatic "reset state on prop change"). (3) ExerciseRegionSheet — dropped a synchronous `setRows([])` (modal hidden when picker is null → stale rows never shown).
- **Commit**: 88cdbd9
- **Pattern**: Under React Compiler, treat `expo lint` as a gate — it catches ref-in-render / setState-in-effect that typecheck and bundling miss. Prefer a remount `key` over an in-effect reset.
<!-- skipped: d87e62d docs(log): record body-map redesign + react-hooks lint fixes (88cdbd9) [no-log] -->

## Type-guard narrowing lost after reassigning a `let` (i18n locale resolution)

- **Symptom**: `tsc` error in Boot's locale resolution:
  ```
  src/features/boot/Boot.tsx(33,45): error TS2345: Argument of type 'string' is not assignable to parameter of type '"en" | "ko" | "es" | "zh"'.
  ```
- **Cause**: `let locale = user?.locale ?? ''` is `string`; `if (!isSupportedLocale(locale)) { locale = DEFAULT_LOCALE }` reassigns it, but after the block TS widens `locale` back to `string` (a type-guard's narrowing doesn't survive reassignment of the same `let` in the negative branch), so `setLocale(locale)`/`changeLanguage(locale)` (expecting `AppLocale`) fail.
- **Fix**: guard a `const stored`, assign into a typed `let locale: AppLocale` in both branches (`if (isSupportedLocale(stored)) locale = stored; else { locale = DEFAULT_LOCALE; ... }`).
- **Commit**: 9948c04
- **Pattern**: When a value must end up as a narrowed union, declare it `let x: TheUnion` and assign inside the guard branches — don't rely on a type guard narrowing a reassigned `let` afterward.

## Stop-hook keyword trigger fires on [no-log] commits that merely NAME a trigger word

- **Symptom**: the dual-write LOG commit for a migration (a `[no-log]` docs/log `.mdx`) was itself blocked — `subject contains keyword: migration` — though it is pure documentation. Recursive: logging the log re-triggers.
- **Cause**: the hook's keyword trigger matches the commit SUBJECT substring (`migration`), regardless of whether the diff is code or a doc-log *about* a migration.
- **Fix**: (1) acknowledge genuine false positives with an `override-trigger` line (below); (2) going forward, keep trigger keywords (migration/refactor/auth/security/…) OUT of `[no-log]` doc-log subjects — e.g. "record DB v2 profile-en fix" instead of "record migration v2".
- **Commit**: (documentation only)
- **Pattern**: Don't put hook trigger keywords in `[no-log]` log-commit subjects — describe the change without the keyword to avoid a recursive block.

<!-- override-trigger: 2176fd4 docs(log): record migration v2 profile-en (d30fa9b) [no-log] — false positive: this commit IS the docs-only dual-write log entry for the migration; the keyword is incidental (it names what the log documents), and logging a log entry would recurse. -->

<!-- skipped: 6a2c81e docs(log): note hook keyword false-positive + override (2176fd4) [no-log] -->
<!-- skipped: c6715fc docs(log): record THE FORGE session ritual (901d481) [no-log] -->

## i18n interpolation renders literal {placeholders} (single vs double braces)

- **Symptom**: on-device, the FORGE COMPLETE summary showed the placeholder names literally instead of values (screenshot): `{count}세트`, `볼륨 {vol}`, `전투력 +{delta}`, `{days}일 연속`. Same for every interpolated string.
- **Cause**: the translation catalogs use SINGLE-brace placeholders (`{count}`), but i18next's default interpolation delimiters are DOUBLE braces (`{{count}}`). With single braces, i18next finds no placeholders and returns the raw string verbatim. (tsc/jest/bundle all pass — it's a runtime templating mismatch.)
- **Fix**: configured the i18next delimiters to single braces in `src/i18n/index.ts`: `interpolation: { escapeValue: false, prefix: '{', suffix: '}' }`. Fixes every placeholder at once without editing the 4 catalogs.
- **Commit**: e50abc0
- **Pattern**: When hand-authoring i18next catalogs with `{single}` placeholders, set `interpolation.prefix/suffix` to match — or author `{{double}}`. A wrong delimiter fails silently (literal text), not loudly.

## "no such table: discipline" on device after adding a migration (dev hot-reload vs full boot)

- **Symptom**: red console error on device after the discipline feature shipped:
  ```
  Uncaught (in promise) Error: Calling the 'prepareAsync' function has failed
  → Caused by: Error code 1: no such table: discipline
  ```
- **Cause**: DB migrations run in `<SQLiteProvider onInit={migrateDbIfNeeded}>`, which only runs on a FULL app boot. Fast Refresh hot-reloaded the new `DisciplineCard` (which queries `discipline`) onto a still-running app whose DB was at the pre-migration version (v2, no `discipline` table) → the query threw. Worse, `disciplineCountSince` runs inside Combat Power recompute, so it would also break logging.
- **Fix**: (1) full reload (Cmd+R) runs the v2→v3 migration and creates the table. (2) Hardened `disciplineRepo` reads (`getDisciplineToday`/`disciplineCountSince`) with try/catch → return defaults when the table is absent, so a pre-migration DB never red-screens or breaks CP/logging.
- **Commit**: 51e3452
- **Pattern**: A new migration only applies on full app boot, not Fast Refresh. Make repo reads that a hot-reloaded component depends on resilient to the not-yet-created table, and remember to fully reload after adding a migration.

## expo-audio plugin auto-adds mic/record/background permissions for a playback-only app

- **Symptom**: After wiring the audio layer, an adversarial review of the prebuild config found the app would declare these even though it only plays short SFX (no recording, no background audio):
  - iOS: `NSMicrophoneUsageDescription`, `UIBackgroundModes: ['audio']`
  - Android: `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (+ a media-playback foreground service)
- **Cause**: `app.json` registered the plugin as bare `"expo-audio"`. Its config-plugin defaults are `recordAudioAndroid: true`, `enableBackgroundPlayback: true`, and an undefined `microphonePermission` falls back to injecting the mic usage string (`node_modules/expo-audio/plugin/build/withAudio.js:8,9-13,26,33,36,60`). The manual `android.permissions` array had also been pre-seeded with the four audio perms. Violates CLAUDE.md §4 (minimal permissions).
- **Fix**: Register with options `{ microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false }` and delete the manual `android.permissions` array. Net Android perm left = `MODIFY_AUDIO_SETTINGS` only (plugin adds it unconditionally; non-dangerous, no user prompt, legitimate for playback). Re-run prebuild (`expo run:ios`) to regenerate the gitignored native config.
- **Verified by**: Read of the installed `withAudio.js` option branches; `expo-doctor` 21/21.
- **Commit**: 8a4d18f
- **Pattern**: A media/permission Expo config plugin can silently broaden the permission surface. Register such plugins with explicit options scoped to what you actually use, and re-check Info.plist / AndroidManifest after prebuild — `expo-doctor` does NOT flag over-broad-but-valid permissions.
<!-- skipped: f31f237 docs(log): record kinetic juice + fonts + i18n interpolation fix (e50abc0) [no-log] -->
<!-- skipped: 6208e30 docs(log): record GPU particle explosion wiring (99adbdc) [no-log] -->
<!-- skipped: e5c1415 docs(log): record cardio logging + weekly per-region summary (a5897c2) [no-log] -->
<!-- skipped: 481ac78 docs(log): record product scope — food via photo AI in Phase 2 [no-log] -->
<!-- skipped: d03db82 docs(log): record one-tap discipline toggle (8cb70f5) [no-log] -->
<!-- skipped: b8c3894 docs(log): record no-such-table discipline fix (51e3452) [no-log] -->
<!-- skipped: 26a331b fix(db): create discipline table every boot (self-heal version-ahead-of-table) [no-log] -->
<!-- skipped: 440ce15 docs: add STATE.md — roadmap/handoff snapshot for context continuity [no-log] -->
<!-- skipped: f60251a docs(state): add '새 세션 첫 행동' handoff pointer + model/context note [no-log] -->
<!-- skipped: f330555 docs(troubleshooting): record expo-audio permission scoping (8a4d18f) [no-log] -->
<!-- skipped: b3b53f8 docs(log): record burst shader upgrade + visual round 2 backlog (0c9b4bc) [no-log] -->
<!-- skipped: 64202b1 docs(log): record daily training goals + CP bonus design (4fae73e) [no-log] -->
<!-- override-trigger: ff15bcb docs(log): record full audit + Today simplification (70fb670, 40cdc00) [no-log] — log-commit recursion: ff15bcb IS the narrative log; the substantive commits (70fb670 audit fixes, 40cdc00 Today simplification) are both already documented in content/logs/OverDrive/2026-06-07-audit-and-simplify.mdx. The word "audit" only appears because it is this log entry's subject. No separate entry needed. -->
<!-- skipped: ff15bcb docs(log): record full audit + Today simplification (70fb670, 40cdc00) [no-log] -->
<!-- override-note: the recurring footgun (STATE.md/CLAUDE.md) — a docs(log) commit whose SUBJECT contains a trigger keyword (audit/migration/refactor/…) re-fires the Stop hook. Keep trigger keywords out of log-commit subjects. -->
<!-- skipped: 4e15b13 docs: override-trigger for ff15bcb log-commit recursion [no-log] -->
<!-- skipped: 374ee4c docs(log): record QuickLog AI proxy + key-handling choice (108bc43) [no-log] -->
<!-- skipped: 93fb974 docs(log): record Groq Whisper voice logging (f630201) [no-log] -->

## Voice logging failed silently — three stacked bugs (New-Arch FormData, Whisper language, cwd)

- **Symptom**: 🎤 voice logging on the iPhone kept failing. On-screen errors (surfaced via temporary diagnostic hints) walked through three causes in order:
  ```
  Unsupported FormDataPart Implementation       (upload)
  원헌드레드 벤치  (English shown as Hangul)        (transcription)
  Didn't catch the exercise                      (parse — "burpees" not in catalog)
  ```
- **Cause**:
  1. **Upload** — RN `FormData.append('file', { uri, name, type })` is rejected on the New Architecture (`Unsupported FormDataPart Implementation`); the old file-part object shape isn't supported.
  2. **Transcription** — Groq Whisper with `language` omitted (auto-detect) detected Korean for a Korean speaker's English and transliterated it into Hangul → no exercise matched.
  3. **Parse** — the AI was instructed to map ONLY to the seed catalog; "burpees" isn't in it → omitted → no_exercise.
- **Fix**:
  1. Upload via `expo-file-system` `uploadAsync` (`FileSystemUploadType.MULTIPART`) — native multipart, bypasses RN FormData. (`src/features/quicklog/transcribe.ts`)
  2. Pass the UI locale as the Whisper `language` (`QuickLogBar` → transcribeAudio).
  3. Worker returns out-of-catalog exercises (exerciseId '' + name + isBodyweight); client `ensureExercise()` creates them. (`worker/src/index.js`, `src/db/repos/setLogRepo.ts`, `useQuickLog.ts`)
- **Commit**: 866e295
- **Pattern**: On New-Arch RN, upload files with `expo-file-system uploadAsync`, not `FormData` + `{uri}`. Surface the REAL error on-device (a generic "failed" message hid three distinct causes and cost several rebuild cycles).

## Rebuilds silently shipped a STALE app — leftover cwd from `cd worker`

- **Symptom**: After fixing voice bugs, repeated `expo run:ios` "succeeded" (app launched) but the phone still ran old code — fixes appeared to do nothing for ~2 cycles.
- **Cause**: A `cd worker && wrangler deploy` left the Bash tool's working directory in `worker/` (it persists across calls). The next `npx expo run:ios` ran INSIDE `worker/`, found the worker's tiny `package.json`, hit "Dependencies changed → install?" which can't prompt in non-interactive mode, and **aborted before building** — yet `devicectl process launch` still launched the previously-installed (stale) app, masking that no new build happened. `expo run:ios` in `worker/` also generated junk there (`worker/app.json`, `worker/ios/`, `worker/package-lock.json`, expo/react deps in `worker/package.json`).
- **Fix**: Reset cwd to the project root before `expo run:ios`; removed the worker junk artifacts; always run app builds from root. Verified via the build log showing real `Bundled … modules` + `Build Succeeded` + `Installing`.
- **Commit**: 866e295
- **Pattern**: `cd` in one Bash call persists to later calls. After `cd`-ing into a subdir for one command, return to root (or use absolute `--config`/`--prefix`). A green "launch" ≠ a fresh build — confirm `Build Succeeded` + `Installing` in the build log, not just that the app opened.

## Active Workout progress reset every render (effect re-ran on unstable deps)

- **Symptom**: While wiring per-slot set/rep targets, the Active Workout card stopped accumulating sets — tapping COMPLETE SET logged the set (`useLogSet` fired) but the count never advanced and the workout never reached "complete". A component-test debug run showed the load effect re-firing repeatedly (`setLoadFailed(false)` / `setLoggedCounts({})` logged ~32× across renders), wiping `loggedCounts` back to 0 on every render.
- **Cause**: `useTodayProgram()` returns a fresh `slots` array every render (the built-in default path rebuilds it). The load effect depended on the derived `exerciseIds` / `slotTargets` **memos**, whose referential identity is not reliably stable across renders under React Compiler — so the effect re-ran each render and reset progress. (In the RTL test this was compounded by a mock `useSQLiteContext` that returned a new `db` object per render; fixed separately by giving the test a stable `db` ref.)
- **Fix**: `src/features/workout/ActiveWorkoutCard.tsx` — derive a content-stable string key `slotsKey` (`exerciseId:targetSets:repLow:repHigh` joined) and key the load effect, the slot-target memo, and the prefill effect on that **string** instead of array/object identity. The effect now re-runs only when the program content actually changes. The adversarial review confirmed this would manifest in the real app (not just the test), since `db` is stable in production but the memo identity was not.
- **Commit**: 896a30c
- **Pattern**: When an effect depends on a value that a hook/selector rebuilds fresh each render (array/object), depend on a content-derived **primitive** key, not the reference — especially under React Compiler, where manual `useMemo` identity can't be assumed stable.

## EVOLUTION fails with a "key" error while text logging works (GROQ vs GEMINI provider split)

- **Symptom**: On the phone, EVOLUTION (photo → evolved physique) showed a key/endpoint error. Hitting the worker directly:
  ```
  POST /parse  -> HTTP 200   {"sets":[{"exerciseId":"BenchPress",...}]}   # text works
  POST /evolve -> HTTP 500   {"error":"evolve requires GEMINI_API_KEY secret"}
  ```
- **Cause**: The QuickLog worker (`worker/src/index.js`) auto-selects provider — `GROQ_API_KEY` → Groq for ALL text (`/parse`, `/food`, `/transcribe`), `GEMINI_API_KEY` → Gemini. Image editing (`/evolve`, model `gemini-2.5-flash-image`) is Gemini-only and hard-requires `GEMINI_API_KEY` (`index.js:337`). `wrangler secret list` showed **only `GROQ_API_KEY`** set → text worked, EVOLUTION 500'd. The in-app "endpoint/key needed" message was the same root, masked further by a stale phone bundle.
- **Fix**: Piped the key from the central store into the worker secret (no repo change, value never printed): `grep '^GEMINI_API_KEY=' ~/.secrets/api-keys.env | cut -d= -f2- | npx wrangler secret put GEMINI_API_KEY`. Verified `wrangler secret list` then showed both `GEMINI_API_KEY` + `GROQ_API_KEY`.
- **Commit**: — (Cloudflare Worker secret deploy; no repo change)
- **Pattern**: A `200` on one route (`/parse` via Groq) does NOT validate a different provider's route (`/evolve` via Gemini). Test the actual failing endpoint, not a sibling.

## EVOLUTION still 429s after the key is set — Gemini free tier image quota is 0

- **Symptom**: After setting `GEMINI_API_KEY`, `POST /evolve` no longer 500'd but returned:
  ```
  HTTP 502   {"error":"gemini evolve 429", "detail": ...}
  code: 429  status: RESOURCE_EXHAUSTED
  * Quota exceeded ... "limit: 0", model: gemini-2.5-flash-preview-image
  ```
- **Cause**: The Gemini **free tier allows ZERO image-generation requests** (`limit: 0`) for `gemini-2.5-flash-preview-image`. This is permanent on free tier, not a resetting rate limit (the "retry in 7s" is misleading). The worker wraps Gemini's 429 as an outer 502.
- **Fix**: NONE in code — requires enabling **paid Gemini billing** on the Google AI project (https://ai.dev/rate-limit). Key wiring is correct; app is otherwise fine (text features run on Groq). **Unresolved** pending the billing decision.
- **Commit**: — (external billing; no code fix)
- **Pattern**: "Key accepted" ≠ "model usable". A working API key can still have `limit: 0` quota for a specific (paid-only) model.

## Phone stuck on "Finding Dev Servers" — a Debug build overwrote the working Release standalone

- **Symptom**: The iPhone app, which previously "just opened and ran", got stuck on the Expo dev launcher's **`Finding Dev Servers`** screen and never loaded. (The simulator path earlier showed the parallel symptoms: `No development servers found` and an un-tappable `Open in "OverDrive"?` dialog.)
- **Cause**: To deploy new JS I ran `expo run:ios --device` with no `--configuration`, which **defaults to Debug** (build log: `Debug-iphoneos`). With `expo-dev-client` installed, a Debug build does NOT embed JS — it expects a live metro and shows "Finding Dev Servers" when it can't auto-discover one. A physical device cannot be handed the dev-server URL from the host (there is no `devicectl openurl`, unlike the simulator's `simctl openurl`), and LAN auto-discovery was failing. Worse, this Debug build **overwrote the user's prior Release standalone** (DerivedData held `Release-iphoneos/OverDrive.app/main.jsbundle`, 4.8 MB, built Jun 11 14:34) which embeds JS and runs with no metro — i.e. the "걍 아이폰에 바로 떴다" build.
- **Fix**: Rebuild standalone: `npx expo run:ios --device "00008140-00186DE43CFA801C" --configuration Release` → JS embedded, runs by tapping the icon, no metro, no launcher. (No repo change.)
- **Commit**: — (build/deploy config; no repo change)
- **Pattern**: Physical-iPhone dogfooding = **Release** (embedded JS, standalone). Debug + metro live-reload is a **simulator-only** workflow. Check what kind of build is already installed before overwriting it.

## `expo run:ios --device <id>` — "No device UDID or name matching"

- **Symptom**:
  ```
  CommandError: No device UDID or name matching "dd394f75-bfac-50f6-bf99-ec47bc2e77b5"
  ```
- **Cause**: That id is the **`devicectl` coredevice UUID** (`xcrun devicectl list devices` → Identifier). Expo/xcodebuild match a different value — the classic device **UDID** from `xcrun xctrace list devices`.
- **Fix**: Get the right UDID: `xcrun xctrace list devices` → `Daeseon's iPhone (26.5) (00008140-00186DE43CFA801C)`; pass `--device "00008140-00186DE43CFA801C"`.
- **Commit**: — (tooling; no repo change)
- **Pattern**: `devicectl` Identifier ≠ `xctrace` UDID. For `expo run:ios --device`, use the `xctrace` UDID.

## Release build: "Cannot launch … because the device is locked" (install still succeeded)

- **Symptom**:
  ```
  › Installing …/Release-iphoneos/OverDrive.app
  ✔ Complete 100%
  CommandError: Cannot launch OverDrive on Daeseon's iPhone because the device is locked.
  ```
- **Cause**: The build + install (`✔ Complete 100%`) finished, but the phone was screen-locked at the final auto-launch step.
- **Fix**: Unlock the phone, then tap the icon (Release runs standalone) or `xcrun devicectl device process launch --device <udid> ai.daeseon.reploom`.
- **Commit**: — (runtime; no repo change)
- **Pattern**: A `run:ios` error AFTER `Installing … ✔ Complete 100%` means the install succeeded — only the launch failed. Don't rebuild; just launch.

## Home "Daily Goals" card shows tiny / can't be found by scrolling down

- **Symptom** (user, verbatim): "Daily Goals 영역이 존나 작고 스크롤 내려도 안 보임."
- **Cause**: `src/app/(tabs)/index.tsx` renders Today as a **horizontal** snap-pager (`FlatList horizontal`, pages `arena → goals → food → discipline → manual`) — `goals` is the 2nd page, reached by swiping sideways, not scrolling down. The deck is `flex: 1`, so a tall fixed zone above it (Combat Power header + `ActiveWorkoutCard` + RestTimerBar + ForgeBar) leaves the deck a thin strip → cards look tiny. The horizontal "one viewing position" deck was a prior builder directive (`index.tsx:41`). (Squish height not yet measured → cause partly `Hypothesis`.)
- **Fix** (chose A): `src/app/(tabs)/index.tsx` rewritten — removed the horizontal `FlatList` deck (and the page state / dots / `snapToInterval` / `pageW` logic) and put everything in ONE vertical `ScrollView`: Combat Power header → `ActiveWorkoutCard` → RestTimerBar → ForgeBar → ArenaCard → DailyGoalsCard → FoodCard → DisciplineCard → QuickLogBar → MyCharacter. No `flex: 1` scroll region competing for height, nothing behind a sideways swipe. Gates green: tsc 0, lint 0, jest 15 suites/108.
- **Commit**: 0686460
- **Pattern**: A `flex: 1` scroll region competes with everything above it; if the fixed header grows, the region collapses. Give scroll decks an explicit `minHeight` or shrink the fixed zone.

## All server-AI dead on the iPhone — Release build didn't inline EXPO_PUBLIC_* from .env

- **Symptom**: On the installed Release (standalone) app, photo upload (EVOLUTION), voice, and food AI all did nothing — only on-device text logging worked. The installed bundle had zero trace of the worker endpoint:
  ```
  $ grep -aq "overdrive-quicklog.daeseon.workers.dev" .../Release-iphoneos/OverDrive.app/main.jsbundle; echo $?
  1   # absent (dev/metro bundle: 25 hits; standalone `expo export:embed` from root: 32 hits)
  ```
- **Cause**: `QUICKLOG_ENDPOINT = (process.env.EXPO_PUBLIC_QUICKLOG_ENDPOINT ?? '').trim()` (`src/features/quicklog/config.ts`) resolved to `''` because the **iOS Release build did not inline EXPO_PUBLIC vars**. The metro bundle inlined it and a standalone `expo export:embed` from the project root inlined it — so the bundler is fine; the Xcode "Bundle React Native code and images" build phase ran the embed in an environment where `.env` wasn't picked up, so babel saw no `process.env.EXPO_PUBLIC_*` and emitted empty. Empty endpoint → `/parse` silently falls back to the on-device rule parser (text "works"), but `/evolve`·`/transcribe`·`/food` have no fallback → all dead. (Earlier this was misread as "all AI broken"; text was actually still logging via the fallback.)
- **Fix**: Added `export EXPO_PUBLIC_QUICKLOG_ENDPOINT="…"` to `ios/.xcode.env.local` (gitignored). The RN "Bundle React Native code and images" phase sources `.xcode.env` + `.xcode.env.local` before bundling (verified in `project.pbxproj:228`), so the var lands in the embed process's env → babel inlines it. Rebuilt Release → installed `main.jsbundle` now contains the endpoint (`grep -aq` → exit 0). Verified at bundle level; in-app voice/food retest pending. (EVOLUTION still blocked separately — Gemini billing, see the 429 entry above.)
- **Commit**: — (fix lives in gitignored `ios/.xcode.env.local`; no repo change)
- **Pattern**: EXPO_PUBLIC_* inline for metro/`export:embed` but NOT reliably for the iOS **Release** Xcode bundle phase. Inject them via `ios/.xcode.env.local` (the RN build phase sources it). Always verify by grepping the installed `.app/main.jsbundle` (`grep -a`, treat as text) — a green build ≠ the var is in the bundle.

## Food/EVOLUTION photo upload returns 0 items ("couldn't estimate") — full-res photo overflows Groq's image limit

- **Symptom**: Uploading a real meal photo from the iPhone album to the food card always showed "Couldn't estimate". Live worker logs (`wrangler tail`) showed the requests SUCCEEDING, not erroring:
  ```
  POST .../food - Ok    (×6, all HTTP 200)
  ```
  So the worker returned 200 but with `items: []` → the client (`FoodCard.tsx:46`) shows the fail message.
- **Cause**: The food (and EVOLUTION) photo path uploaded the **full-resolution** picked image (`ImagePicker` `quality: 0.7`, no resize). Reproduced against the live worker: a 203 KB food photo → `items: 3`; the SAME photo upscaled to 4032px / **10 MB → HTTP 413 `groq food 413`** (Payload Too Large, wrapped as 502 to the client); mid-size full-res photos are accepted (200) but the vision model returns 0 items. Groq vision caps base64 images (~4 MB). EVOLUTION had the identical latent bug (it would 413 once Gemini billing is on).
- **Fix**: Added `src/lib/image.ts` `downscaleForUpload(uri, 1024)` (`expo-image-manipulator` `manipulateAsync`, resize width 1024, compress 0.7, JPEG) and call it before upload in `FoodCard.onPhoto` and `evolveClient.pickPhoto`. Proof: the 10 MB photo resized to 1024px / 218 KB → `/food` 200 WITH items. Added `expo-image-manipulator` (native dep → Release rebuild). tsc 0 / lint 0 / jest 108.
- **Commit**: 996f423
- **Pattern**: Always downscale a picked photo before sending it to a vision API — full-res phone photos (12 MP, multi-MB) either 413 or silently yield empty results. Triage a "couldn't estimate"-type failure against live worker logs first: `200 + empty` (model saw nothing) vs `502/413` (upload rejected) are different bugs.

## App crashes instantly on launch (signal 6) after adding expo-image-manipulator — native version skew

- **Symptom**: After adding `expo-image-manipulator` for photo downscaling, the Release app died the instant it opened ("앱 키자마자 꺼진다"). Device console (`devicectl … process launch --console`):
  ```
  dyld: Symbol not found: _$s15ExpoModulesCore6RecordPAAE4from10dictionary10appContext…
    Referenced from: .../OverDrive.app/Frameworks/ExpoImageManipulator.framework/ExpoImageManipulator
    Expected in:     .../ExpoModulesCore.framework/ExpoModulesCore
  App terminated due to signal 6.
  ```
- **Cause**: `npx expo install expo-image-manipulator` resolved **56.0.18**, but the project's `expo-modules-core` is **56.0.14** (the whole project trails the SDK's expected versions — `expo install --check` flagged ~16 packages). ImageManipulator 56.0.18's compiled Swift references an ExpoModulesCore symbol (`Record.from(dictionary:appContext:)`) absent in 56.0.14 → dyld abort at process start, before any JS/UI runs.
- **Fix**: Pinned `expo-image-manipulator@56.0.14` to match `expo-modules-core@56.0.14` (same release train → symbol-compatible), `npx pod-install` (Podfile.lock → ExpoImageManipulator 56.0.14), rebuilt Release. App now launches and stays running (process alive >10 s). tsc 0.
- **Commit**: 54e0c7b
- **Pattern**: When `expo install <module>` resolves a version NEWER than the project's `expo-modules-core`, native Swift symbols mismatch → instant signal-6 crash — invisible to tsc/lint/jest (it's a native link error, not JS). Match a new Expo native module to the installed `expo-modules-core`, or `expo install --fix` the whole set. Diagnose launch crashes with `devicectl device process launch --console`.

## Settings saves could fail silently — fire-and-forget persist swallowed errors (data-loss risk)

- **Symptom**: Surfaced by the architecture/wiring audit (not a runtime crash). Onboarding completion, program-editor saves, rival spawn, and rank-handle persistence all ran `void updateSettings(db, currentSettings()).catch(() => {})`. A failed write was INVISIBLE — onboarding could re-trigger every launch (lost `onboardedAt`); a reorganized weekly program could silently fail to save with the UI looking fine.
- **Cause**: `.catch(() => {})` swallowed every persistence error. The in-memory zustand store held the value for the session, so the screen looked correct while the DB never received it.
- **Fix**: Added `persistSettings(db)` in `src/stores/settingsStore.ts` — awaits `updateSettings`, `console.error`s + returns `false` on failure (never throws). Replaced the 4 silent sites (`OnboardingFlow.tsx`, `ProgramEditorScreen.tsx`, `useArena.ts`, `RankSection.tsx`); the program editor now also shows `Alert(t('common.saveFailed'))` (added to en/ko/es/zh). Genuinely harmless swallows (haptics, audio, image-picker cancel, file-existence checks) were left as-is. tsc 0 / lint 0 / jest 108.
- **Commit**: c59ac04
- **Pattern**: `.catch(() => {})` on a persistence call is invisible data loss. Route writes through a helper that logs (and surfaces, for user-initiated saves). Reserve silent catches for truly non-data side effects (haptics/audio/cancel/existence-checks).

## Goals/discipline writes failed silently; empty program day had no way out (audit follow-up)

- **Symptom**: Audit follow-up (reliability + UX). (1) `useDailyGoals` bump/reset/add/remove `await`ed DB writes with no try/catch — a failed write was an unhandled rejection (tap did nothing, no feedback). (2) `DisciplineCard.toggle` set the optimistic pill state BEFORE the write but had no `catch` — on failure the pill stayed toggled while the DB never saved (UI/DB mismatch). (3) An empty (non-rest) program day showed "No exercises yet" with NO way to fix it — the user had to dig into Settings ▸ Program.
- **Cause**: Missing error handling on the goals hook + discipline toggle; the empty-state block was read-only text.
- **Fix**: (1) wrapped all four `useDailyGoals` writes in try/catch + `console.error`. (2) `DisciplineCard.toggle` now has a `catch` that reverts the optimistic toggle to its pre-tap value + logs. (3) `ActiveWorkoutCard` empty (non-rest) state now renders an `activeWorkout.editProgram` Pressable → `router.push('/program')` (key added to en/ko/es/zh). tsc 0 / lint 0 / jest 108.
- **Commit**: 92bdfed (reliability), 7cb2c41 (empty-day CTA)
- **Pattern**: An optimistic UI write needs a `catch` that REVERTS the optimistic state, not just logs — otherwise the screen lies about what's persisted. Every dead-end empty state should offer the action that resolves it.

## Text inputs had no screen-reader names (a11y audit follow-up)

- **Symptom**: UX audit — all 7 `TextInput`s (QuickLogBar, FoodCard, ProgramEditorScreen day name, RankSection handle + crew, DailyGoalEditorSheet, Stepper edit) had no `accessibilityLabel`. A screen reader announces an unlabeled text field as just "text field", so a VoiceOver/TalkBack user can't tell what to type.
- **Cause**: Inputs relied on `placeholder` only — placeholders aren't read once a field has content, and aren't a reliable accessible name.
- **Fix**: Added `accessibilityLabel` to every `TextInput`, reusing the existing placeholder/field-label i18n key (no new strings). Stepper's type-it-in field uses its `label` prop. (Buttons/Pills already had roles/labels from the earlier OD-FR-008 pass.) tsc 0 / lint 0 / jest 108.
- **Commit**: f3aae1b
- **Pattern**: A `placeholder` is not an accessible name — every `TextInput` needs an explicit `accessibilityLabel` (reuse the placeholder/label key so it stays localized and DRY).

## Voice/photo/evolve uploads could hang forever — uploadAsync has no timeout (audit follow-up)

- **Symptom**: UX/architecture audit. The `fetch`-based AI calls (`/parse`, `/food` text) had AbortController timeouts (7–9 s), but the three `expo-file-system` `uploadAsync` calls — voice `/transcribe`, food-photo `/food`, `/evolve` — had NONE. A slow or stuck server would spin the mic / photo / evolve UI indefinitely with no failure and no fallback.
- **Cause**: `uploadAsync` exposes no `AbortSignal`, so the usual `fetch(..., { signal })` timeout pattern can't be applied; the calls were left unbounded.
- **Fix**: Added `src/lib/async.ts` `withTimeout(p, ms, label)` (races the promise against a rejecting timer; unit-tested, 3 cases). Wrapped the three uploads: `transcribe` + food photo at 20 s, `evolve` at 60 s (image gen is slow). On timeout the existing try/catch turns it into a graceful failure (voice/text falls back to the rule parser; photo/evolve show their error). tsc 0 / lint 0 / jest 16 suites / 111.
- **Commit**: 19f9298
- **Pattern**: `uploadAsync` (and any awaitable with no AbortSignal) must be wrapped in a timeout race — otherwise a hung server hangs the UI forever. Pick the bound from the work: short for voice/photo, longer for generation.

## Removing a daily goal was undiscoverable — long-press only, no hint (audit follow-up)

- **Symptom**: UX audit. The ONLY way to delete a daily goal is long-pressing its label (`DailyGoalsCard`), with zero visible affordance — a user can't discover it and is stuck with goals they can't remove.
- **Cause**: `onLongPress={() => remove(...)}` on the goal label with no hint text and no `accessibilityHint`.
- **Fix**: Added a subtle `goals.removeHint` line under the goals list (only when goals exist) + an `accessibilityHint` on the goal-label Pressable (key added to en/ko/es/zh). Stepper's long-press "type a value" is left hint-less on purpose — it's an escape hatch and ±/hold already works. tsc 0 / lint 0 / jest 111.
- **Commit**: 2d7853d
- **Pattern**: A long-press that is the SOLE way to do something needs a visible hint (and `accessibilityHint`). Long-press is fine as a shortcut, never as the only path.
<!-- skipped: fd583b0 docs(log): record voice end-to-end fixes + cwd/FormData traps (866e295) [no-log] -->
<!-- skipped: 7de255a docs(log): record ARENA + AI food + comfort glue (6e5726a, 0ebc924) [no-log] -->
<!-- override-trigger: c3d3ad4 docs(log): record real leaderboards decision (60be727) [no-log] — log-commit recursion again: c3d3ad4 IS the T2 decision narrative itself (content/logs/OverDrive/2026-06-09-real-rankings.mdx contains the full Context/Options/Trade-off/Reversibility/Verified-by template for 60be727). The trigger word "decision" is only in the log-commit's subject. Recurring footgun noted twice already — log-commit subjects must avoid trigger keywords; switching to neutral subjects like "docs(log): add entry for <hash>" from now on. -->
<!-- skipped: 74c7123 docs: add override note for c3d3ad4 [no-log] -->
<!-- skipped: 5bc3abf docs(log): add entry for 67c4427 [no-log] -->
<!-- skipped: 2d5147a docs(state): refresh handoff — arena/rank/voice/food/evolution + infra map [no-log] -->
<!-- skipped: 0a14cba chore: ignore local secret stores [no-log] -->
<!-- skipped: 33e0d4e docs(log): add entry for global key-store pattern [no-log] -->
<!-- skipped: d5654bd docs(log): correct hash reference to 7434504 [no-log] -->
<!-- skipped: 9fbd907 docs(log): add entries for 896a30c, bda2526 [no-log] -->
<!-- skipped: 73cdea0 docs(log): dogfooding deploy/debug casebook — 6 cases [no-log] -->
<!-- skipped: 8306b4c docs(log): close Daily Goals case with 0686460 [no-log] -->
<!-- skipped: a13f373 docs(log): record Release EXPO_PUBLIC inline gap + .xcode.env.local fix [no-log] -->
<!-- skipped: 5caab0a docs(log): record photo-too-large food/evolution bug + resize fix (996f423) [no-log] -->
<!-- skipped: 69d7aad docs(log): record launch-crash from image-manipulator version skew (54e0c7b) [no-log] -->
<!-- skipped: 1d74c15 docs(log): EVOLUTION direction switch to stylized hero character (fdccae7) [no-log] -->
<!-- skipped: 6f9aa93 docs(log): body-type honesty refinement for EVOLUTION (67466ab) [no-log] -->
<!-- skipped: 245c0f1 docs(log): record silent-persist data-loss fix (c59ac04) [no-log] -->
<!-- skipped: 8e8e50d docs(log): record goals/discipline reliability + empty-day CTA (92bdfed, 7cb2c41) [no-log] -->
<!-- skipped: 600095a docs(log): record text-input a11y labels (f3aae1b) [no-log] -->
<!-- skipped: b7ecec9 docs(log): record upload timeout resilience (19f9298) [no-log] -->
<!-- skipped: be46664 docs(log): HealthKit foundation + read service entry (3c64f57, bf42c93) [no-log] -->
<!-- skipped: 918efee docs(log): HealthKit Combat Power integration + Settings UI update (88d0d38) [no-log] -->
<!-- skipped: 48d4c99 docs(log): Apple Health connect-screen clarity fix (e9a8c7b) [no-log] -->
<!-- skipped: 62fe3ff docs(log): write-back A — workouts to Apple Health (ce57560) [no-log] -->
<!-- skipped: 4b83a6e docs(log): InBody body-composition screen B (2262cb2) [no-log] -->
<!-- override-trigger: 57d4e56 docs(log): lazy one-tap auto-plan + value pivot (6524eb0) [no-log] — log-commit recursion: 57d4e56 IS the dual-write log commit (it added content/logs/.../2026-06-17-lazy-auto-plan.mdx, which logs feature commit 6524eb0). "pivot" appears only in the LOG commit's subject, not in a code change. The pivot decision itself is now recorded as a full T1 in content/logs/.../2026-06-17-value-focus-t1.mdx. Recurring footgun (see c3d3ad4 note above): log-commit subjects must avoid trigger keywords. -->
<!-- skipped: 6524eb0 feat(plan): one-tap auto-generate weekly program — logged in content/logs 2026-06-17-lazy-auto-plan.mdx + value-focus-t1.mdx -->
<!-- skipped: 0ed94b3 docs(log): T1 value-focus record + 57d4e56 override note [no-log] -->
<!-- skipped: add390b docs(log): juice crank — value axis 2 (81c79f0) [no-log] -->
<!-- override-trigger: 21f2909 docs(log): power-fantasy themes — value + IP decision (0933f13) [no-log] — log-commit recursion (same footgun as 57d4e56): 21f2909 IS the dual-write log commit (it added content/logs/.../2026-06-17-power-fantasy-themes.mdx, which logs feature commit 0933f13). "decision" appears only in the LOG commit's subject describing the §5 IP call, not in any code change — 21f2909 touches one .mdx file. The theme system + §5 decision (Context/Options/Chosen/Trade-off/Reversibility/Verified) is already fully recorded in that .mdx. Reminder: log-commit subjects must avoid trigger keywords. -->
<!-- skipped: d008bad docs: troubleshooting override note for 21f2909 log-commit [no-log] -->
<!-- skipped: d15d747 docs(state): refresh handoff for Codex — session work + open/unverified items [no-log] -->
<!-- override-trigger: f99f867 docs: plain-language stack walkthrough — every dependency, why, tradeoffs [no-log] — LOC trigger (222 LOC) misfired on a pure prose explainer (docs/STACK-EXPLAINED.md). Zero code/behavior change, no new architecture decision (it *explains* existing tech choices for the builder's portfolio/onboarding, it doesn't make one), not a bug → no Symptom/Cause/Fix and nothing to put in a decision-tier log. The >200 LOC rule targets substantive code diffs; a long educational markdown doc is the routine case the rule isn't for. -->
<!-- skipped: 8870d86 docs: override note for f99f867 stack explainer (LOC false positive) [no-log] -->
<!-- skipped: 9fcad25 docs(log): share artifacts for external validation (e688bc2) [no-log] -->
<!-- skipped: 4d9022b docs(state): worker deployed — theme EVOLUTION loop wired + verified (ver 1aef7442) [no-log] -->
<!-- skipped: 3fe19bc docs(log): warrior completion spine + product synthesis (de9a973) [no-log] -->

## TestFlight build shipped with an EMPTY AI endpoint — food/voice logging dead, ".env" jargon shown to users

- **Symptom**: First real-device dogfood (TestFlight Build 4): every typed meal returned "추정 실패 — 더 간단히 써봐." regardless of input; mic showed "음성은 AI 엔드포인트 설정 필요(.env)", photo showed the same .env copy. Verified against the shipped artifact: the IPA's Hermes bundle contains the surrounding control strings but NOT "workers.dev" — `QUICKLOG_ENDPOINT` compiled to `''`.
- **Cause**: `src/features/quicklog/config.ts` read the endpoint ONLY from `process.env.EXPO_PUBLIC_QUICKLOG_ENDPOINT`; `.env` is gitignored and `eas.json` had no `env` block, so EAS cloud builds never received it. Local dev worked (dotenv), production silently didn't.
- **Fix**: `config.ts` now defaults to the deployed worker URL (`https://overdrive-quicklog.daeseon.workers.dev`, verified live) when the env var is absent; `eas.json` also injects `EXPO_PUBLIC_QUICKLOG_ENDPOINT` in all three build profiles. User copy no longer mentions ".env": endpoint-missing and network-fail states have distinct honest messages (`food.aiUnavailable`, `quicklog.fail.ai_offline`).
- **Commit**: 41b3885
- **Pattern**: EXPO_PUBLIC_* values that only live in a gitignored .env do not exist in EAS builds. Every client-required env var needs an eas.json `env` entry (or an in-code default) + a signed-build smoke test before distribution.

## Logging waited up to 7s on the AI network call before saving — spec §6 violation (JUICE/logging must never block)

- **Symptom**: TestFlight dogfood: typing "벤치 100 5" then tapping 기록 froze the row with zero feedback until the Gemini round-trip finished (up to the 7s abort timeout on gym LTE); the set only saved AFTER the network call. Voice could lock the bar ~27s (20s transcribe + 7s parse). First body-map tap was also swallowed: it silently started a session and played the 1.6s enter ritual (absolute-fill Pressable eating every touch) instead of opening the exercise picker — 2-3 taps to start logging.
- **Cause**: `useQuickLog.submitText` called `parseEntryAI()` (network) BEFORE the on-device rule parser and saved only after it resolved. `index.tsx onRegionPress/onCardioPress` early-returned into `enter()` whose store-set ritual rendered the blocking `ForgeRitualOverlay` (1600ms). No busy/confirmation states existed.
- **Fix**: Inverted parse order in `useQuickLog.ts` — rule parser first, save + JUICE fire immediately, AI only as fallback (timeout 7s→3.5s); transcribe timeout 20s→8s with mic-as-cancel. Silent one-shot session start (`sessionStore.silentStartArmed`) so body-map/cardio taps open the picker in the same gesture; enter ritual reserved for explicit 용광로 진입. Busy line ("기록 중…") + success echo of exactly what saved ("⚡ 벤치프레스 100 kg×5") in `QuickLogBar.tsx`. Keyboard: `keyboardShouldPersistTaps="handled"` + `automaticallyAdjustKeyboardInsets` on the Today ScrollView, `submitBehavior="submit"` keeps the keyboard for the next set.
- **Commit**: 41b3885
- **Pattern**: The core-loop action must complete locally before any network hop; remote calls enrich, never gate. Any full-screen overlay with an absolute-fill Pressable is a tap-eater — never mount one on an implicit path.

## EAS free-tier submit queue stalled 29 min — bypassed with direct altool upload (5s)

- **Symptom**: `eas submit` (submission 70dfa86c) stayed `IN_QUEUE` for 29+ minutes (`updatedAt == createdAt`, never started); ASC showed "No Builds" the whole time.
- **Cause**: EAS free-tier submission queue congestion — config was fine (verified via EAS GraphQL: status IN_QUEUE, error null).
- **Fix**: Canceled the queued submission (GraphQL `cancelSubmission` → CANCELED), downloaded the IPA artifact from `build:view --json`'s `applicationArchiveUrl`, uploaded directly with `xcrun altool --upload-app --apiKey 84HQ6ZG4L2 --apiIssuer <issuer>` (`.p8` in `~/.appstoreconnect/private_keys/`) — "UPLOAD SUCCEEDED", 36.4MB in 5.2s; build 4 was VALID on ASC minutes later. Pipeline for future releases: `eas build --non-interactive` → curl IPA → altool.
- **Commit**: a873470 (eas.json submit profile), pipeline itself is ops (no code).
- **Pattern**: EAS submit is a convenience queue, not the only path — with an ASC API key, altool direct upload is seconds and unblocks TestFlight instantly.
<!-- override-trigger: 112b1b9 docs(log): first-dogfood verdict + 45-finding audit pass (41b3885, a873470) [no-log] — log-commit recursion (same footgun as 57d4e56 and 21f2909): 112b1b9 IS the dual-write log commit — it only adds docs/troubleshooting.md entries (3) and content/logs/OverDrive/2026-07-03-first-dogfood-ux-pass.mdx, which LOG the actual work commits 41b3885 (UX pass) and a873470 (launch scaffolding). "audit" appears in the log commit's subject describing what was logged, not in any code change. The audited work itself is fully dual-written by exactly this commit. Third occurrence of this footgun — keep trigger keywords out of log-commit subjects. -->
<!-- skipped: 9bc7747 docs: override note for 112b1b9 log-commit recursion [no-log] -->
<!-- skipped: 05d304a docs(log): MONOLITH visual language T2 record (ac0d450) [no-log] -->
<!-- skipped: 138a64a docs(log): HUD skin engine T2 record (ab1eaba) [no-log] -->

## 기록 루프에 확인 단계가 없었다 — 오인식이 침묵 저장되고, 히스토리는 타임라인이 아니었다

- **Symptom**: 빌더 실기기 피드백(빌드 7): "말하면 → 뭘 알아들었는지 좁혀서 보여주고 → 운동 그림(GIF처럼) → 최종 컨펌 → 일별 타임라인" 기대 대비, 코드 실측: 파서는 최장 별칭 매치 하나를 침묵 선택(후보 UI 없음), 운동 이미지 에셋 0개, 저장 후 텍스트 에코만(수정/취소 불가), history 탭은 주간 부위 집계+평면 최근 목록.
- **Cause**: 스펙 §6(즉시 저장)을 "확인 단계 금지"로 과잉 해석. 확인·수정·시각 피드백이 전부 미구현.
- **Fix**: save-first 유지 + confirm-as-undo 패턴. `exercise-art/`(12 동작 패밀리 2-키프레임 Skia 포즈 애니메이션, usePathInterpolation UI-thread 루프), parseEntry near-tie 후보 반환 → 애매할 때만 후보 칩(저장 보류), 저장 직후 ConfirmUndoCard(포즈+수치+[수정][취소], 4.5s 자동 소멸, undoSave→deleteSet+CP 재계산), history.tsx 일별 타임라인 재구축(일 요약 헤더+시간순 레일+PR 칩+운동별 그룹).
- **Commit**: c723937
- **Pattern**: "즉시 저장"과 "확실한 확인"은 충돌하지 않는다 — 저장을 먼저 하고 확인을 되돌리기로 만들면 둘 다 가진다.
<!-- skipped: c04ae46 docs(log): certainty loop record (c723937) [no-log] -->

## 홈이 정보 나열이라 터치가 많았다 — 다음 액션 엔진으로 전환

- **Symptom**: 빌더 실기기 피드백(빌드 9): "여전히 텍스트 위주, 액션별 분리가 안 됨, 손 대는 걸 최소화해야" — 세트 기록에 입력창 타이핑 또는 시트 조작 필요, 홈 카드들이 글줄 위주.
- **Cause**: 홈이 '상태 표시' 중심 설계. 운동 중 실사용 순간(세트 사이 5초)에 필요한 건 다음 액션 하나인데 그걸 유저가 조립해야 했음.
- **Fix**: src/features/coach/ — nextAction.ts 순수 상태 엔진(시작/휴식 중 제안/방치/마무리, 단위 테스트 21개), CoachCard 히어로(포즈+제안 세트 대형 숫자+자동 휴식 카운트다운+[했어] 원탭 → 기존 useLogSet 핫패스), MicButton 추출+홈 FAB(MicDock), RingGauge 등 4개 카드 탈텍스트 타일화. tsc 0/lint 0/jest 184.
- **Commit**: 0ca0e20
- **Pattern**: 모바일 도구 앱의 홈은 대시보드가 아니라 다음 액션의 버튼이어야 한다 — 상태는 엔진이 읽고, 유저는 확인만.
<!-- skipped: 665f969 docs(log): next-action engine record (0ca0e20) [no-log] -->

## 실기기/시뮬레이터 렌더 검증 없이 10개 빌드 출고 — 육안 3초면 잡힐 결함 8건이 누적

- **Symptom**: 빌더가 "이게 최대냐" 지적 → 첫 시뮬레이터 스크린샷 감사에서 즉시 8건: Orbitron 슬래시-제로가 소형 크기에서 ⊘(에러 글리프)로 렌더, CP 히어로 숫자 뒤 사각 글로우 박스, "Measu/re" 단어 중간 줄바꿈(width:44 고정), 코치 카드 데드스페이스+88pt 포즈 미니어처, History 빈 주간 "Not trained" 8줄 반복, 로케일 이모지(💪📸✨) 노출.
- **Cause**: (1) 파이프라인에 렌더 검증 단계 부재 — 코드→빌드→TestFlight 직행. (2) 글로우 박스의 근본 원인: RN 새 아키텍처 iOS에서 Text의 textShadow가 글리프가 아닌 뷰 사각형 레이어 섀도로 떨어짐. (3) Orbitron의 0은 디자인상 슬래시 — 20pt 미만에서 판독 불가.
- **Fix**: numType.mid/small → 시스템 폰트 tabular(Orbitron은 대형 전용), Metric 히어로 글로우를 Skia GradientDigits 경로로 통일(플랫 스킨은 2-stop 동일색 그라디언트, blur 패딩 1.6×), heroTextGlow 호출 제거, CoachCard 2열 그리드+포즈 128pt, WeeklyCard 빈 부위 1줄 축약, 이모지 4개 로케일 제거. 시뮬레이터 v2/v3 스크린샷으로 8건 전부 해소 실측.
- **Commit**: c7c8852
- **Pattern**: UI는 코드가 아니라 픽셀이 진실이다 — 모든 UI 변경은 시뮬레이터 스크린샷 검증 통과 후 출고(expo run:ios Release → 전 화면 캡처 → 육안 대조). textShadow는 새 아키텍처에서 금지, 글로우는 Skia로.
<!-- override-trigger: 39bf77d docs(log): sim-audit visual pass record (c7c8852) [no-log] — log-commit recursion, FOURTH occurrence (57d4e56, 21f2909, 112b1b9): 39bf77d only appends the troubleshooting.md entry that LOGS work commit c7c8852; "audit" appears solely in the log commit's subject describing what was logged. The audited work is fully dual-written by exactly this commit. Root fix adopted: log-commit subjects will use neutral wording (e.g. "docs(log): record for <hash>") from now on. -->
<!-- skipped: 3d95b57 docs: override note for 39bf77d [no-log] -->

## 코치 원탭 루프가 앱 재실행 후 사라짐 — 진행 중 세션이 부팅 시 복원되지 않음

- **Symptom**: 시뮬레이터에 진행 중 세션(오늘 스쿼트 2세트, 45초 전 마지막)을 seed하고 앱을 재실행하니, 홈 코치 카드가 "휴식 중·다음 세트" 대신 처음부터 "HIIT Intervals — Start"를 표시. 진행 중이던 운동을 앱이 잊음.
- **Cause**: `sessionStore.activeSessionId`가 매 실행 `null`로 시작하는데 `Boot.tsx`가 DB의 open session(`completed_at IS NULL`)을 `resume()`하지 않음. `useCoachPlan.compute`는 `active = activeSessionId != null`로 게이트 → 세션이 DB엔 있지만 코치는 "세션 없음"으로 판단 → 휴식/다음세트/[했어] 루프 미표시. 헬스장에서 iOS가 백그라운드 앱을 죽이면 "손 최소화" 플래그십 루프가 소실.
- **Fix**: `Boot.tsx` 하이드레이션에 `getOpenSessionForDate → getSessionActivitySummary → sessionStore.resume` 추가(기존 enter()/finish() 복원 경로와 동일 인프라 재사용). 휴식 앵커는 `useCoachPlan`이 set_log.logged_at에서 재파생하므로 resume(lastSetAt:null)로 충분. 시뮬레이터 seed→재실행으로 복원 확인(코치가 "IN SESSION·Set 3/3·100×5·Continue" 표시).
- **Commit**: ba80eed
- **Pattern**: 세션성 UX 상태(진행 중 운동)는 인메모리 스토어만이 아니라 부팅 시 DB에서 재수화해야 한다 — 모바일 앱은 언제든 죽고 다시 뜬다. 기능은 "한 세션 안에서" 되는 걸로 완성이 아니다.
<!-- skipped: 6c30d3b docs(log): record for ba80eed [no-log] -->

## 전체 운동 검색에서 유산소가 `Bodyweight · 0–0 reps`로 표시됨

- **Symptom**: 첫 시뮬레이터 운동 탐색 점검의 accessibility tree가 유산소 결과를 문자 그대로 다음처럼 보고했다.
  ```text
  Cycling, Bodyweight · 0–0 reps
  ```
  기존 부위 picker에는 검색 입력도 없어서 정적 `exerciseIds` 밖의 운동과 QuickLog가 만든 ad-hoc 운동을 찾을 수 없었다.
- **Cause**: `ExerciseRegionSheet.tsx`가 모든 운동에 근력용 `is_bodyweight + rep_low–rep_high` 메타를 렌더했고, DB 전체 카탈로그가 아니라 `RegionPicker.exerciseIds`만 SQL `IN`으로 조회했다.
- **Fix**: `src/features/exercises/discovery.ts`를 추가해 전체 DB 카탈로그를 현지화 이름·DB 이름·ID 토큰·근육군·현지화 부위어로 검색하고, 빈 검색에서는 기존 부위 추천을 최근 세트 순으로 유지했다. 유산소는 `시간/거리/강도` 메타로 분기했다. `src/app/(tabs)/exercises.tsx`와 `log.tsx`를 추가해 탐색과 중앙 기록 진입을 분리했고, 선택만으로 빈 세션이 생기지 않도록 세션 생성은 실제 저장 시점으로 미뤘다.
- **Commit**: 490c039

## 6개 고정 블록 바디맵이 실제 부위 탐색과 추천을 막았다

- **Symptom**: 빌더 피드백은 "운동 부위별 추천·검색이 제대로 되지 않고, 몸을 직접 눌러 고르고 싶다"였다. 코드 실측에서도 기존 캐릭터는 6개 고정 사각형과 seed `exerciseIds`에 묶여 있었고, 첫 스포츠웨어 시안의 하체 좌표는 정강이 일부를 대퇴사두로 판정했다. 좁은 팔·종아리 타깃과 단일 접근성 버튼 때문에 헬스장 한손 터치와 VoiceOver 선택도 불안정했다.
- **Cause**: 이미지, 터치 계약, 추천 데이터가 하나의 정적 목록에 결합돼 있었다. 비트맵 위치와 히트 영역을 별도로 보정하지 않았고, 부위 선택 시점에 세션을 미리 만들어 추천만 보고 닫아도 빈 운동이 남는 경로도 있었다.
- **Fix**: 불투명 스포츠웨어 정면·후면 아바타와 자산 기준 10부위 polygon을 추가하고, 22pt nearest-edge 보정과 방향 무관 10부위 접근성 action을 적용했다. 추천은 DB 근육군을 기준으로 `오늘 프로그램 → 최근 기록 → 전체 부위 카탈로그` 순으로 만들고, 부위→운동→로거를 2동작으로 연결했다. 세션은 실제 저장 때만 생성한다. 사진형 아바타는 3중 동의, 실제 이미지·4:5 검사, 정면/후면 미리보기 확인 후에만 활성화하며 닫기·재시도는 pending 결과만 폐기한다.
- **Commit**: b646643
- **Verification**: Jest 29 suites / 246 tests, strict TypeScript, lint, diff check 통과. iPhone 17 Pro Release 빌드 0 errors / 기존 경고 3건. 시드 DB에서 등→Lat Pulldown→로거 2동작과 앞/뒤 10개 접근성 action을 확인했고, workout/session/food 행 수는 5/14/0으로 전후 동일했다.
- **Pattern**: 몸 기반 탐색에서 비트맵은 표현이고 히트맵·추천 순위·저장 시점이 기능 계약이다. 생성 이미지는 프롬프트만 믿지 말고 envelope 검사와 사용자 activation gate를 둔다.

## 구형 사진 진화가 선택 즉시 전송돼 신규 동의 계약을 우회했다

- **Symptom**: Power 화면의 기존 Evolution은 사진을 고른 직후 `runEvolve()`를 호출했고, `/evolve` 요청과 Worker 모두 명시적 동의 필드가 없었다. 신규 스포츠웨어 화면만 3중 동의를 받아도 접근 가능한 구형 경로가 그대로라면 개인정보 고지와 실제 동작이 달라진다.
- **Cause**: 사진 생성 기능이 두 계약으로 분리돼 있었다. 구형 영웅 초상 경로는 선택과 업로드를 결합했고, 신규 body-avatar 경로도 초기에는 모델 프롬프트 외에 실제 이미지 signature·비율 검사가 없었다.
- **Fix**: 구형 Power 진입점을 제거하고 Worker `/evolve`를 410 tombstone으로 퇴역했다. `/body-avatar`는 18세·사진 권리·Google AI 처리 동의가 모두 literal `true`여야 하며, outfit 화이트리스트, 입력 MIME/signature/size, 출력 base64/signature/4:5 dimensions/pixel 수를 검사한다. Gemini 요청에도 공식 `responseFormat.image.aspectRatio: 4:5`를 명시했고 개인정보 문서에 전송 시점·제공자·로컬 삭제를 반영했다.
- **Commit**: d0ce5be
- **Verification**: Wrangler dry-run 번들 통과. 로컬 Worker handler에서 `/evolve` 410, 동의 없는 `/body-avatar` 400을 확인했다. 실제 Gemini 호출과 Worker 배포는 실행하지 않았다.
- **Pattern**: 새 개인정보 게이트는 새 화면만 보호해서는 안 된다. 같은 데이터에 닿는 구형 진입점·서버 라우트·로컬 파일 삭제까지 하나의 계약으로 닫는다.

## 빠른 기록이 중복 세션·중복 세트·엉뚱한 Undo를 만들 수 있었다

- **Symptom**: 사용성 재검토에서 한 번의 빠른 입력이 여러 데이터 무결성 경로와 충돌했다. Today·Log·Explore가 각각 세션을 시작할 수 있었고, 세트 저장 뒤 CP/JUICE 계산 실패를 전체 실패로 취급해 재시도하면 같은 세트가 중복 저장될 수 있었다. 세트 수정은 정확한 원본 행이 아니라 새 기록 경로로 흘렀고, 완료와 수정·삭제·Undo가 겹치면 세션 요약이 실제 DB와 달라질 수 있었다. 같은 세션의 코치는 방금 든 중량에도 다시 증량을 적용했다.
- **Cause**: 영속 행과 파생 효과가 하나의 성공 경계였고, session start·finish·mutation에 공통 단일 실행/상호배제 계약이 없었다. correction/undo도 exact row ID와 원래 session/date/user 범위를 끝까지 보존하지 않았다. 저장 확인 카드는 중첩 Pressable과 짧은 자동 소멸로 실제 헬스장 수정 동선을 불안정하게 했다.
- **Fix**: 중앙 session coordinator와 mutation/finish lease를 추가했다. 세트·유산소 INSERT를 durable success boundary로 삼아 CP/JUICE 실패가 중복 재시도를 만들지 않게 했고, 수정·삭제·Undo는 exclusive transaction과 exact ID를 사용한 뒤 DB 요약으로 store를 재조정한다. 완료는 `completed_at` 조건부 갱신을 성공 경계로 삼고 파생 Health/CP/streak 실패와 분리했다. 코치는 같은 세션에서 실제 직전 중량·횟수를 유지한다. 확인 카드는 Edit/Undo를 형제 버튼으로 분리하고 15초·screen-reader 무제한·busy 중 고정으로 바꿨다. 식사 Undo는 원래 batch ID/date/user 범위를 보존한다.
- **Commit**: ba8aeaf
- **Verification**: Jest 36 suites / 271 tests, strict TypeScript, lint, diff check 통과. iPhone 17 Pro / iOS 26.5 Release 빌드 0 errors / 기존 경고 3건. 시드 DB에서 14세트→QuickLog 1회 후 15세트, 같은 행을 105 kg×5로 수정해 15세트 유지, 코치가 같은 세션에 105×5를 유지하는 것을 확인했다. 스페인어·extra-extra-large에서 `Frente / Espalda / Cardio`와 스포츠웨어 아바타가 잘리지 않았다. 식사 Repeat→Undo의 실제 터치 완주는 Maestro가 ScrollView 밖 1pt를 탭한 자동화 오류로 미검증이며 repo 테스트만 통과했다. 검증 뒤 DB는 5 sessions / 14 sets / 0 foods, locale `en`, integrity `ok`로 복원했다.
- **Pattern**: 기록 앱에서 영속 행이 저장되면 그 행이 성공의 기준이다. 파생 점수·효과는 재시도 가능한 후처리로 두고, 수정·삭제·완료는 exact identity와 하나의 동기적 lease 계약 아래에서만 움직여야 한다.

## 릴리스 후보의 개인정보 고지와 실제 저장·전송 경계가 어긋날 수 있었다

- **Symptom**: 빌드 12는 유효했지만 현재 v1 코드보다 오래됐고, 공개 랭킹·사진 아바타·광범위 Health 권한·기본 활성 AI 동의가 남은 설명과 실제 후보 동작이 일치하지 않았다. 체성분 Health 저장은 native `false`를 성공으로 오판할 수 있었고, AI가 여러 세트를 만든 뒤 Undo는 마지막 행만 지웠다. 음성 취소·타임아웃 경쟁은 늦은 결과 승인이나 다음 요청 controller 제거로 이어질 수 있었다.
- **Cause**: 앱, Worker, App Store 메타데이터, 공개 정책을 하나의 출시 계약으로 검증하지 않았고, 네트워크/Health의 비동기 반환값과 한 명령에서 생성된 여러 행을 단일 성공·취소 경계로 다루지 않았다. 즉시 `wrangler deploy` 절차도 버전 고정과 0% smoke 단계를 우회했다.
- **Fix**: 공개 랭킹과 사진 아바타 UI·원격 경로를 퇴역하고, Remote AI를 버전 동의·기본 OFF·native client marker로 fail-closed 처리했다. Health 권한과 저장 결과를 최소화·검증하고, 체성분 v6 로컬 원장과 DB 보호/백업 제외를 추가했다. 여러 세트 INSERT/Undo를 각각 단일 SQLite 문장으로 묶고, 음성/사진 임시파일 정리와 취소·타임아웃 경쟁을 닫았다. Worker는 Groq-only 후보와 cost-zero safe-degraded 버전을 분리하고 immutable upload → 0% smoke → 명시적 ID 승격 절차로 바꿨다. Privacy/Support/Terms/Data 페이지와 출시 체크리스트는 미확인 운영자·연락처·자산 권리를 숨기지 않고 publication gate로 남겼다.
- **Commit**: 59c05ec
- **Verification**: Jest 45 suites / 294 tests, strict TypeScript, lint, Expo Doctor 21/21, Worker 14 tests, 정상·safe dry-run, diff check 통과. iPhone 17 Pro Max / iOS 26.5 Release 빌드 0 errors / 1 warning. 시드 DB는 v6, 6 sessions / 15 sets / 3 foods / 3 body-composition rows, integrity `ok`; DB/WAL/SHM backup exclusion과 ATS fail-closed를 확인했다. 1320×2868 원본 스크린샷에서 진행 중 운동·QuickLog·식사 상태를 육안 확인했다. 다중 세트 Undo 실제 터치, 물리 iPhone 잠금 후 FileProtection, 라이브 Worker/Pages, 새 TestFlight 빌드와 App Review 제출은 미검증이다.
- **Pattern**: 출시 가능 여부는 테스트 통과가 아니라 앱 동작·정책 문구·서버 배포·스토어 답변이 같은 버전을 설명하는지로 판정한다. 미확인 법적 정보나 live 상태는 placeholder와 gate로 표시하고, 배포와 rollback은 반드시 immutable version ID로 실행한다.

## 공개 정책이 확인된 운영자 이름까지 미확인으로 표시했다

- **Symptom**: Reploom 공개 Privacy/Terms와 출시 체크리스트가 법적 운영자 이름을 미확인 상태로 남겼지만, 빌더가 기존 App Store 판매자와 동일한 `Daeseon Yoo`를 Reploom 운영자·저작권자로 사용하라고 확정했다.
- **Cause**: 저장소만으로 법적 신원을 추측하지 않는 publication gate는 맞았지만, 사용자의 명시적 확인 뒤에도 해당 gate를 운영자 이름·주소·메일·DSA가 결합된 하나의 미완료 항목으로 유지했다.
- **Fix**: Privacy/Terms의 계약 당사자와 모든 공개 푸터를 `Daeseon Yoo`로 통일하고, App Store 예상 copyright를 `2026 Daeseon Yoo`로 기록했다. 주소·관할·지원메일·DSA는 별도 미확인 gate로 유지했다.
- **Commit**: a66cf44
- **Verification**: 5개 공개 HTML을 `xmllint --html --noout`으로 파싱해 exit 0을 확인했고, operator/copyright 문구 전수 검색과 `git diff --check`를 통과했다. HTML5 semantic tag에 대한 xmllint 경고는 있었으며, 브라우저 연결 실패로 모바일/데스크톱 시각 렌더는 미검증이다.
- **Pattern**: 법적 메타데이터는 확인된 필드만 독립적으로 완료 처리한다. 이름 확인이 주소·연락처·DSA 확인을 대신하지 않으며, 남은 gate를 뭉뚱그려 완료하거나 전체를 계속 미확인으로 둘 이유도 없다.

## `유럽 제외`를 단일 region 토글로 가정하면 storefront가 새어 들어간다

- **Symptom**: 빌더는 v1을 유럽과 중국 본토를 제외한 나머지 storefront에 출시하기로 결정했다. App Store Connect 배포 UI에 단일 `Europe` 제외 계약이 있다고 가정하면 EU 밖 유럽 국가나 향후 신규 storefront가 포함될 수 있다.
- **Cause**: Apple의 분석/문서 리전과 `Pricing and Availability`의 실제 국가·지역 선택 단위를 혼동했다. DSA 회피 범위(EU)와 빌더가 말한 유럽 전체 범위도 다르다.
- **Fix**: `Specific Countries or Regions`를 사용해 EU 27, 기타 유럽 15, China mainland의 정확한 43개 storefront를 제외하고 신규 storefront 자동 포함을 끄는 계획을 출시 listing과 checklist에 기록했다. Hong Kong, Macau, Taiwan은 별도 storefront로 포함한다. DSA self-declaration과 Regulated Medical Device=`No` readback은 별도 gate로 유지했다.
- **Commit**: 66ab422
- **Verification**: Apple 공식 availability/localization 목록에 맞춰 제외 43개를 열거하고, 27+15+1 산술과 `git diff --check`를 확인했다. App Store Connect 실제 설정 변경과 최종 selected storefront readback은 아직 미검증이다.
- **Pattern**: 스토어 배포 범위는 대륙 이름이 아니라 App Store Connect의 정확한 storefront 집합으로 기록한다. 신규 국가 자동 포함 설정까지 고정하지 않으면 시간이 지나며 승인 범위가 조용히 넓어진다.

## Xcode 아카이브 명령의 Build 13 덮어쓰기가 최종 번들에 남지 않았다

- **Symptom**:
  ```text
  "CFBundleVersion" => "1"
  error: exportArchive Cloud signing permission error
  error: exportArchive No signing certificate "iOS Distribution" found
  ```
- **Cause**: 추적되는 Expo 설정 `app.json`에 iOS `buildNumber`가 없었고, 생성된 iOS `Info.plist`는 `CFBundleVersion`을 `1`로 직접 가지고 있었다. 명령행의 `CURRENT_PROJECT_VERSION=13`은 빌드 설정에는 보였지만 최종 번들의 하드코딩 값을 바꾸지 못했다. 로컬 키체인은 유효한 배포 서명 identity를 제공하지 않았고, App Store Connect API 키를 사용한 export는 Cloud Signing 권한 오류를 반환했다.
- **Fix**: `app.json`에 `ios.buildNumber: "13"`을 추가해 Expo 정본에 출시 빌드 번호를 고정했다. 배포 인증서·프로비저닝 변경은 외부 credential 조치이므로 이 커밋 범위에 포함하지 않았다.
- **Commit**: 122e4da
- **Verification**: `expo config`가 version `1.0`, buildNumber `13`, bundle ID `ai.daeseon.reploom`을 반환했고 Xcode Release build settings의 `CURRENT_PROJECT_VERSION`도 `13`이었다. 두 번째 로컬 아카이브는 성공했으며 아카이브와 앱의 최종 `CFBundleVersion`이 모두 `13`이었다. PrivacyInfo 파싱과 은퇴 라우트 무검출, 기대 client marker 검출은 통과했다. App Store 배포용 export는 배포 인증서·Cloud Signing 권한 부재로 실패했으므로 Apple 업로드와 심사 요청은 하지 않았다.
- **Pattern**: Expo 네이티브 프로젝트의 출시 번호는 일회성 Xcode 명령이 아니라 추적되는 Expo 설정에 고정하고, 아카이브 안의 최종 앱 `Info.plist`를 다시 읽어 확인한다.

## App Store 출시 문서의 계획 상태가 실제 서버 상태보다 뒤처졌다

- **Symptom**: Build 13은 App Store Connect에서 `VALID`였지만 출시 체크리스트는 가격·지역·연령 등급·리뷰 연락처·스크린샷을 한 체크박스에 섞어 미완료로 표시했다. 공개 Privacy 페이지도 배포 전 Worker observability 설정을 이미 운영 중인 사실처럼 읽힐 수 있었다.
- **Cause**: 로컬 정책 문구, App Store Connect 공개 API readback, private 웹 설문, Cloudflare 배포를 서로 다른 검증 경계로 기록하지 않았다. 스크린샷도 이전 빌드 산출물과 이번 Release/seed 원본이 분리돼 있지 않았다.
- **Fix**: 1320×2868 Release 앱에 5 sessions / 20 sets / 1 cardio / 3 foods를 시드해 Today, 스포츠웨어 body map, Chest 추천, History, Power를 원본 해상도로 검수했다. 다섯 PNG를 en-US `APP_IPHONE_67`에 올려 모두 `COMPLETE`로 읽고 저장소 정본에도 보존했다. 무료 가격 175개, 판매 132·제외 43, 신규 storefront 자동 포함 off, Build 13 연결, Health & Fitness·연령·리뷰 메타데이터의 live readback을 체크리스트에 분리 반영했다. Worker 로깅 문구는 정확한 후보 버전이 배포·검증되기 전에는 운영 사실이 아니라고 명시했다.
- **Commit**: ca82eb4
- **Verification**: strict TypeScript, lint, Jest 45 suites / 294 tests, Worker 14 tests, `git diff --check`, EAS metadata lint 통과. SQLite `foreign_key_check`는 빈 결과, `integrity_check`는 `ok`. Maestro에서 Chest 추천과 `bench` 검색을 실제 입력해 확인했고 Apple은 스크린샷 5장을 모두 `COMPLETE`로 반환했다. Browser 런타임 부재로 공개 페이지 모바일/데스크톱 시각 렌더는 미검증이다. App Privacy·DSA·Regulated Medical Device·Mac/Vision 토글, Worker/Pages 배포, App Review 제출은 아직 완료되지 않았다.
- **Pattern**: 출시 체크리스트는 계획·공개 API readback·private UI·실배포를 한 완료 표시로 합치지 않는다. 스크린샷과 정책 문구도 실제 제출 빌드와 운영 버전의 증거가 있을 때만 완료로 기록한다.

## 구독 해제 뒤 늦은 응답이 권한을 되살리고 빈 AI 결과가 사용량을 소진할 수 있었다

- **Symptom**: 미배포 결제 기반을 적대 검토하면서 세 가지 회귀 경로가 확인됐다. 진행 중 entitlement 교환 뒤 로컬 세션을 지워도 늦은 성공 응답이 다시 active로 만들 수 있었고, 구매 검증 중 paywall 닫기가 시작한 AI gate를 `cancelled`로 정리할 수 있었다. Worker는 구조상 JSON이지만 usable set/item이 없는 provider 응답도 완료 처리할 수 있었다. production incident는 관찰되지 않았으며 source는 배포 전이었다.
- **Cause**: `src/features/subscription/workerClient.ts`의 비동기 교환에는 clear 이후 결과를 폐기할 generation identity가 없었고, `SubscriptionProvider.tsx`의 close 경계가 busy 작업과 pending gate 소유권을 구분하지 않았다. `worker/src/index.js`의 성공 판정은 normalized collection의 실제 usable row 수를 요구하지 않았다.
- **Fix**: `workerClient.ts`에 session generation과 same-transaction coalescing을 추가해 stale success/error/null 결과를 모두 폐기했다. `SubscriptionProvider.tsx`는 busy 동안 close를 무시하고 구매 전에 현재 18+ remote-AI 동의를 검사한다. `worker/src/index.js`는 usable workout/meal row가 없으면 502로 실패시키고 고객 표시 quota를 환급하되 provider-attempt cap은 유지한다. custom StoreKit bridge, 월 1,000-credit/60-photo 계약, simulator-only active/quota fixture, 정책 문구와 회귀 테스트를 같은 변경 단위에 포함했다.
- **Commit**: b5c170a
- **Verification**: 앱 Jest 50 suites / 351 tests, Worker 42 tests, strict TypeScript, lint, `git diff --check` 통과. 최종 Swift를 포함한 Build 14 Release simulator build가 성공했고, schema 6 seed가 5 sessions / open 1 / 20 sets / 1 cardio / 3 foods, integrity `ok`로 보존됐다. free paywall, active 412/1000·18/60, exhausted 1000/1000·60/60 화면을 원본 캡처로 육안 확인했다. 실제 Apple 결제, 별도 결제 backend, Cloudflare migration/deploy, TestFlight, 재심사는 범위 밖이며 미검증이다.

## 세션 핸드오프가 Build 12를 현재 출시 후보로 가리켰다

- **Symptom**: `docs/HANDOFF-codex.md`가 2026-07-09의 Build 12와 `6c30d3b`를 최신 상태로 기록해, 새 세션이 이미 검증된 Build 13과 App Store Review draft를 무시하고 오래된 파이프라인을 재실행할 수 있었다.
- **Cause**: 앱 코드 커밋의 dual-write는 유지했지만, Apple/Cloudflare 외부 상태와 출시 자산이 바뀔 때 세션 진입 문서를 함께 갱신하지 않았다.
- **Fix**: Build 13 ID·IPA hash·ASC version/review draft·가격·132/43 storefront·5개 screenshot 상태, private Apple gate, Cloudflare 승인 gate, 실사용 seed UI 검증, 다음 제출 순서를 하나의 현재 핸드오프로 다시 작성했다.
- **Commit**: 29fe123
- **Verification**: GitHub `codex/usability-cockpit` push 상태, App Store Connect public API readback, Apple screenshot list, 로컬 commit log와 각 ID를 교차 확인했다. Review Submission은 `READY_FOR_REVIEW` draft이지만 item 0·submitted date null이며 심사 제출 완료로 표시하지 않았다.
- **Pattern**: 핸드오프는 코드 요약이 아니라 코드·빌드·외부 서비스·검증 수준의 동시 스냅샷이다. 출시 단계가 바뀔 때 오래된 성공 빌드를 “현재”로 남겨두지 않는다.

## Worker와 정책 사이트가 배포되지 않아 App Store URL과 심사 item이 닫히지 않았다

- **Symptom**: Build 13과 스크린샷은 Apple에서 유효했지만 live Worker는 퇴역 전 pre-v1 버전이었고 `reploom.pages.dev`는 존재하지 않았다. Marketing, Support, Privacy, Privacy Choices URL은 모두 null이었으며 Review Submission은 item 0에서 `409 STATE_ERROR.ENTITY_STATE_INVALID`를 반환했다.
- **Cause**: 앱 바이너리 검증과 외부 서비스 배포, 공개 ASC 메타데이터, private ASC 설문이 서로 다른 출시 경계인데 앞의 두 단계가 실행되지 않았다. Worker도 즉시 배포가 아니라 immutable safe/normal ID와 0% version override smoke가 필요한 상태였다.
- **Fix**: source `b9ddda1`에서 safe `33abed25-1f2e-497f-8580-72b29e267840`와 normal `dee65f64-88ee-491f-962f-f9b686bfd561`을 불변 업로드했다. safe와 normal을 각각 0%에서 smoke한 뒤 normal을 100%로 승격했다. Pages project `reploom`을 만들고 preview를 확인한 뒤 production `1798ec5a-4134-4b02-b553-b00f6ea7e720`을 배포했으며, HTTPS 검증 뒤 ASC URL 네 개를 입력했다. private 설문은 완료로 가장하지 않고 별도 gate로 남겼다.
- **Commit**: 2929f54
- **Verification**: Worker 테스트 14/14와 두 dry-run 통과. normal deployment `9c686a48-0b0f-4c52-b7cc-a3fac00c9c8f` 100% readback, live `/parse` 200, markerless 요청 403, legacy delete invalid input 400, normal/safe의 네 퇴역 경로 410을 확인했다. Cloudflare settings는 `logpush=false`, `observability=null`, tail consumer 없음이었다. Pages 5개 extensionless 경로는 HTTPS 200·redirect 없음·로컬 HTML과 SHA-256 일치했고 iPhone Safari에서 production Privacy를 육안 확인했다. ASC URL 네 개도 readback됐지만 Review item POST는 계속 409, item 0, submitted date null이므로 App Review는 제출되지 않았다.
- **Pattern**: 출시 서비스는 “배포했다”가 아니라 source hash, immutable normal/safe ID, traffic 비율, live 응답, rollback 명령, 스토어 readback을 함께 기록해야 한다. 공개 URL 완료가 private 법적 설문 완료를 대신하지 않는다.

## Wrangler remote D1 migration이 trigger 본문에서 `incomplete input`으로 중단됐다

- **Symptom**: `npx wrangler d1 migrations apply overdrive-rank --remote`가 두 번 모두 `incomplete input: SQLITE_ERROR [code: 7500]`으로 실패했다. 두 시도는 atomic rollback됐고 기존 ranking 4행은 유지됐다.
- **Cause**: Wrangler 4.110의 remote migration 경로는 trigger를 포함한 migration 전체를 query endpoint로 보내고, trigger 내부 세미콜론이 있는 유효한 SQLite batch를 거부했다. SQL 주석을 제거한 `b0ead93` 뒤에도 같은 오류가 재현돼 주석 가설은 반증됐다.
- **Fix**: `7f4560d`에서 주석을 복원하고 `worker/scripts/apply-d1-migration.mjs`를 추가했다. runner는 canonical migration을 임시 atomic import로 감싸 같은 파일명을 `d1_migrations`에 기록하고 repository-pinned Wrangler의 file-ingestion 경로로 실행한 뒤 임시 파일을 지운다. Node 표준 라이브러리만 사용하고 macOS/Windows의 Wrangler 실행 파일 경로를 모두 처리한다.
- **Commit**: `b0ead93` (반증된 가설), `7f4560d` (실제 수정), `da28116` (release-state 정합화)
- **Verification**: local runner와 remote import가 성공했고 remote는 14 queries / 24 rows written을 반환했다. readback은 pending migration 0, `ai_*` object 11개(table 5, index 4, trigger 2), 기존 `rank_entry` 4행, `quick_check=ok`, `foreign_key_check` 오류 0이었다. Worker 44/44와 `git diff --check`를 통과했다. Build 14는 별도 Apple validation/upload 뒤 `VALID` / `APP_STORE_ELIGIBLE`이며 one-tester `Internal` group에서 `IN_BETA_TESTING`으로 읽혔지만 production Worker와 실제 결제 entitlement는 미검증이다.
- **Pattern**: trigger가 있는 D1 migration은 local 성공만으로 remote 적용 가능성을 추론하지 않는다. canonical SQL과 migration ledger를 보존한 file-ingestion 경로를 쓰고, 기존 데이터 수·schema object·무결성·pending migration을 함께 읽는다.

## 앱 재실행이 열린 운동 시간을 초기화하고 다른 세션의 세트를 이어갈 수 있었다

- **Symptom**: 열린 운동 복원과 코치 CTA의 기존 코드는 문자 그대로 다음 경계를 가지고 있었다.
  ```text
  startedAt: Date.now(),
  else if (canOneTap) void onDidIt();
  dv('이어서', 'Continue')
  ```
  같은 날짜에 완료 세션과 열린 세션이 함께 있으면 코치의 마지막 운동·휴식 기준도 `session_id`가 아니라 당일 전체 `set_log` 중 최신 행에서 선택됐다.
- **Cause**: `sessionStore.resume()`이 DB의 `workout_session.started_at`을 입력받지 않았고, `useCoachPlan.ts`가 일일 프로그램 집계와 현재 세션 연속성 데이터를 하나의 스냅샷으로 취급했다. `CoachCard.tsx`는 `session_idle`의 `Continue` 라벨을 실제 one-tap INSERT handler와 연결했다.
- **Fix**: `src/db/repos/sessionRepo.ts`, `src/features/forge/sessionStore.ts`, `src/features/boot/Boot.tsx`, `src/features/forge/useForge.ts`에서 원래 `started_at`을 epoch로 복원해 전달했다. `src/features/coach/coachSnapshot.ts`와 `useCoachPlan.ts`는 일일 세트 합계는 유지하되 현재 열린 `session_id`의 마지막 세트·운동·휴식 anchor를 별도로 계산한다. `nextAction.ts`는 idle episode의 안정된 anchor를 노출하고, `CoachCard.tsx`는 첫 `Continue`를 무기록 상태 전환으로 만든 뒤 `82.5kg × 7 기록`처럼 payload가 보이는 CTA에서만 저장한다.
- **Commit**: 4e511a4
- **Verification**: 집중 6 suites / 36 tests와 전체 Jest 53 suites / 357 tests, strict TypeScript, lint, `git diff --check`를 통과했다. 회귀 fixture는 같은 날 완료 세션과 25분 된 열린 세션, 열린 세션의 12분 된 다른 운동 세트를 분리했고 `Continue` 뒤 행 수 불변, 명시 세트 CTA 뒤 +1을 확인했다. Release simulator의 실사용 seed·원본 screenshot 육안 검증은 통합 브랜치에서 아직 실행하지 않았다.
- **Pattern**: 당일 목표 집계와 현재 세션의 타이머·직전 운동은 같은 날짜를 공유해도 identity 경계가 다르다. 재개 UI의 동사는 쓰기 여부를 숨기지 않아야 한다.

## AI를 쓸 수 없으면 새 식사를 로컬에 기록할 수 없었다

- **Symptom**: 신규 식사 이름을 입력해도 Remote AI가 꺼진 상태에서는 저장 대신 다음 문구가 표시됐고, 무료 로컬 경로는 이미 저장된 마지막 식사 반복만 제공했다.
  ```text
  Remote AI is off — enable it in Settings before estimating a meal.
  ```
- **Cause**: `src/features/food/FoodCard.tsx`의 신규 식사 입력과 사진 버튼이 모두 consent·구독·quota를 거쳐 Worker 추정을 호출했고, `food_log.source` CHECK도 `text|voice|photo`만 허용했다. 최근 식사의 경계는 별도 ID가 아니라 같은 `logged_at` 값에 의존했다.
- **Fix**: `src/features/food/FoodCard.tsx`에 이름·kcal·단백질 직접 입력을 항상 노출하고 `src/features/food/manualMeal.ts`에서 입력·0.5×/1×/1.5× 재기록을 순수 계산한다. `src/db/schema.ts`의 v7 migration은 기존 행을 보존하며 `batch_id`와 `manual` source를 추가하고, `src/db/repos/foodRepo.ts`는 exact batch undo·단일 manual row edit·최근 distinct meal 조회를 제공한다. 네 locale 모두 사용자 입력값이며 영양 정확도를 검증하지 않는다고 명시했다.
- **Commit**: 750f674
- **Verification**: focused 4 suites / 18 tests와 전체 Jest 52 suites / 363 tests, strict TypeScript, lint, `git diff --check` 통과. 실제 SQLite v6형 테이블 1행에 v7 SQL을 적용해 원본 `old-1` 행·source를 보존하고 manual 행 삽입 뒤 2행 / 430 kcal / 22g / `integrity_check=ok`를 확인했다. Release simulator 실사용 상태의 터치·레이아웃·원본 스크린샷 검증은 통합 단계에 남겼다.
- **Pattern**: 유료 AI 추정은 값 생성 보조일 뿐 로컬 원장을 여는 권한이 아니다. 사용자가 직접 아는 값은 계정·네트워크·quota와 무관하게 먼저 저장돼야 한다.

## D1 카탈로그 payload가 TEXT이거나 published release를 수정하면 게시 작업이 거부된다

- **Symptom**:
  ```text
  Error: stepping, CHECK constraint failed: typeof(payload_json) = 'blob' AND length(payload_json) = payload_bytes (19)
  Error: stepping, published_catalog_release_is_immutable (19)
  ```
- **Cause**: `worker/catalog/migrations/0001_catalog.sql`은 응답 원문과 checksum의 바이트 계약을 보존하기 위해 `payload_json`의 SQLite storage class를 BLOB으로 제한하고, `published` 또는 `withdrawn` release의 payload·metadata 변경을 trigger로 거부한다. 위 출력은 production incident가 아니라 잘못된 게시 입력을 in-memory SQLite에 주입해 확인한 의도된 fail-closed 경계다.
- **Fix**: publisher는 compact UTF-8 JSON을 한 번만 직렬화해 byte binding으로 draft에 저장하고, 검증 후 새 version을 `published`로 전환한 다음 `catalog_channel('v1')` 포인터를 갱신해야 한다. 이미 게시한 payload를 고치지 말고 새 version을 발행한다. `worker/catalog/src/index.js`는 D1 BLOB의 ArrayBuffer·typed-array·byte-array readback만 허용하고 TEXT, checksum 불일치, unpublished row는 `Cache-Control: no-store` 503으로 닫는다.
- **Commit**: 7509fe884f6b06f50b89f2c5512ee896242d9dc6
- **Verification**: migration을 in-memory SQLite에 적용해 8 tables / 25 triggers / foreign-key 오류 0을 확인했다. v1 포인터를 `1.0.1`에서 `1.0.0`으로 되돌린 뒤 bad release를 `withdrawn`으로 전환하면 `v1|1.0.0`, `1.0.0|published`, `1.0.1|withdrawn`이 출력됐다. Worker 전체 테스트는 60/60, Wrangler local dry-run은 `CATALOG_DB` 하나만 포함해 통과했다. 실제 D1 생성·게시·배포는 하지 않았다.

## 최초 운동 카탈로그가 과거 반복을 재해석하고 D1 import 한도를 넘을 수 있었다

- **Symptom**: 최초 공개 전 draft의 정적 검토에서 아래 규칙이 그대로 고정돼 있었다. 동결 `db_curl`·`hammer_curl`은 이전 로그가 양쪽 반복을 별도로 저장했다는 근거 없이 `per_side`였고, 바디웨이트 행은 kg 로거가 정확히 저장할 수 없는 선택 중량을 광고했다. D1 draft는 명시 트랜잭션과 전체 payload 한 번의 hex literal을 사용했다.
  ```text
  reps(3, 8, 12, 'per_side')
  'BEGIN IMMEDIATE;'
  X'${raw.toString('hex')}'
  ```
- **Cause**: `scripts/catalog/catalog-source.mjs`와 `catalog-validation.mjs`가 미검증 좌우 반복 가정을 정본처럼 잠그고, frozen `isBodyweight`를 장비 사실과 로그 UX bridge로 분리하지 않았다. `prepare-exercise-catalog.mjs`는 Wrangler file-ingestion이 바깥 원자성 경계라는 사실과 statement 크기 한도를 산출물 규칙으로 인코딩하지 않았다. 전이 validator도 counting convention 하나만 동결해 다른 과거 로그 identity, revision jump, lifecycle 역행을 막지 못했다.
- **Fix**: `scripts/catalog/catalog-source.mjs`에서 frozen curl을 `total`로 복원하고 `walking_lunge`, `step_platform_step_up`, `glute_bridge`의 optional mass를 제거했다. `docs/exercise-catalog-v1.md`와 JSON Schema는 `external_resistance`를 kg/lb로 정직하게 표현할 수 있는 질량으로 한정하고 band·assistance를 제외했다. `catalog-validation.mjs`는 log identity·SemVer·revision·lifecycle·replacement·effective window을 fail-closed로 검증한다. `prepare-exercise-catalog.mjs`는 draft인 경우만 FK 순서로 재생성하고, `zeroblob` 후 24 KiB 이하 청크로 payload를 복원하며, published/withdrawn 버전은 PK 충돌로 거부한다. 산출물·README·release-specific verifier·39개 적대적 테스트를 같이 갱신했다.
- **Commit**: `389a3e3ee6c4cc9269ef4934fc13a952868ec3ff`
- **Verification**: `catalog:validate` 39/39, Jest 55 suites / 369 tests, strict TypeScript, zero-warning lint, `git diff --check`가 통과했다. 생성 SQL은 760 statements, 최대 49,353 bytes, BLOB 청크 24,576 / 24,576 / 17,502 bytes였다. Node SQLite에서 exact BLOB·draft 재실행·published/withdrawn 불변을 검증했고, Wrangler 4.110 local file import를 두 번 적용한 뒤 `blob` 66,654 bytes, 64 exercise rows, `foreign_key_check` 0을 확인했다. 생성 checksum은 `sha256:43491e64b66fbd16f87325d8e8ea9e5d2325d888b71c700b61b80da19566604a`다. 네 locale의 사람 편집 검토와 실제 앱 검색·기록 흐름은 미검증이다.
- **Pattern**: revision이 없는 과거 로그가 참조하는 카탈로그 ID는 입력 의미를 같은 ID에서 바꾸지 않는다. 원격 DB import는 payload 정확성뿐 아니라 statement 크기, 재실행, published 불변을 같은 생성기와 테스트에서 잠근다.
