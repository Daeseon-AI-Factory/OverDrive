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
- **Fix**: Unlock the phone, then tap the icon (Release runs standalone) or `xcrun devicectl device process launch --device <udid> com.anonymous.overdrive`.
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
