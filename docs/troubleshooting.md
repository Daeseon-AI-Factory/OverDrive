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
