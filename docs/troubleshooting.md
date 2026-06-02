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
