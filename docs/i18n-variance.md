## 0. Current state (verified by reading the source)

- No i18n dependency in `package.json` (no expo-localization / i18n-js / react-i18next). All UI strings are hardcoded Korean literals across `src/app/(tabs)/*.tsx`, `src/features/**`, `src/ui/primitives.tsx`.
- `User.locale` ALREADY exists (`src/db/types.ts` `UserRow.locale: string`), but `getSettings` never reads it and `UserSettings` (`src/lib/settings.ts`) has no `locale` field — so today nothing drives language.
- Exercise display names are persisted in Korean in the DB (`src/db/seed.ts` `name: '바벨 벤치프레스'` …) and read straight to the UI (`SetLoggerSheet` `{exercise.name}`, `ExerciseRegionSheet` `{item.name}`, `history.tsx` `e.name AS exercise_name`). This is the worst coupling: a persisted, user-locale-blind string.
- Region labels: `regions.ts` `RegionDef.labelKo` rendered by `BodyRegion.tsx` `{def.labelKo}` and used as a sheet title in `index.tsx` (`REGIONS[region].labelKo`).
- Grade labels: `grades.ts` `label: '일반인'…` rendered in `index.tsx` and `power.tsx` as `{grade.label}`.
- Callouts: `src/features/juice/constants.ts` `ORIGINAL_CALLOUTS = ['OVERDRIVE!','REDLINE!','MAX POWER!']` (already original IP, language-neutral hype — keep as-is, do NOT translate).

---

## 1. Text-expansion audit (the spots that break) + the fix for each

German/Spanish run ~+30–40% longer than English; CJK is shorter but taller and must not be clipped mid-glyph. The risk surfaces, concrete and ranked:

**A. Body-map region % labels — HIGHEST risk.** `BodyRegion.tsx` renders `def.labelKo` at `fontSize.xs` (12px, `letterSpacing:1`, `fontWeight:'800'`) inside a `%`-sized block. The narrowest block is `shoulders` (`width:9%` of a `maxWidth:280` stage ≈ 16px tall, and arms blocks `width:12%` ≈ 33px wide). "Shoulders"/"Hombros"/"Schultern" cannot fit; zh "肩" fits but at 12px is cramped.
- Fix: keep `numberOfLines={1}` (already present) and add `ellipsizeMode="tail"`; add `adjustsFontSizeToFit minimumFontScale={0.7}` so long Latin words shrink instead of clip; set explicit `paddingHorizontal: 2`. For the very narrow arm/shoulder blocks, prefer SHORT keys (`region.shoulders.short`) so the catalog can supply "Sh."/"Hom."/"肩" rather than relying on auto-shrink. The block is already `aspectRatio`/`%`-driven (good — no hardcoded width).

**B. Tab labels.** `(tabs)/_layout.tsx` `title: '오늘' | '전투력' | '기록' | '설정'`. "Combat Power" / "Potencia de combate" / "Kampfkraft" will truncate in a 4-tab bar. zh "战力" is fine.
- Fix: use SHORT tab keys — `tab.today`, `tab.power`, `tab.history`, `tab.settings` resolving to "Today"/"Power"/"History"/"Settings" (use "Power", not "Combat Power", in the tab). Expo Router tab bar already truncates with ellipsis; keep glyphs (`◆⚡≡⚙`) as the language-independent anchor.

**C. NeonButton labels.** `primitives.tsx` `buttonLabel` has `letterSpacing:1, fontWeight:'800'`, button is centered with horizontal padding, NOT a fixed width — good. But `SetLoggerSheet` "지난 세트 반복 ⚡" → "Repeat last set" / "Repetir última serie" / "Letzten Satz wiederholen" can wrap to 2 lines or overflow.
- Fix: allow wrapping — `NeonButton`'s `<Text>` add `numberOfLines={2}` + `textAlign:'center'`; keep button height auto (don't set fixed height). Keep the ⚡ emoji OUTSIDE the translated key so translators can't drop it. Never set a hardcoded button width.

**D. Stepper unit + label.** `Stepper.tsx` renders `unit` ("kg") inline after the mono value at `fontSize.md`. "kg"/"lbs" are short and language-neutral, low risk. The `label` prop ("무게"/"횟수") is the real variance: "Weight"/"Peso"/"Gewicht", "Reps"/"Repeticiones"/"Wiederholungen" at `fontSize.sm` above the row — can wrap.
- Fix: `label` `<Text>` add `numberOfLines={1}` + `ellipsizeMode="tail"`; the row below is unaffected. Unit stays a passed string (not a translated sentence). Note: the mono value uses `monoFamily` (tabular digits) — language-neutral, leave it.

**E. Sheet titles.** `ExerciseRegionSheet` `{picker.title}` (region/cardio name) and `SetLoggerSheet` `{exercise.name}` at `fontSize.lg, fontWeight:'900'`, single line by default with horizontal padding only.
- Fix: add `numberOfLines={1}` + `ellipsizeMode="tail"` to both titles. Long es exercise names ("Sentadilla búlgara a una pierna") will otherwise push layout. The sheet width is `%`-based (good).

**F. RIR / Pill rows + grade label.** `SetLoggerSheet` RIR pills use numeric labels (fine). Grade label in `index.tsx`/`power.tsx` has `letterSpacing:2/3` — "Ascendant"/"Ascendente"/"Aufgestiegener" at `fontSize.lg/xl` centered; the big letterSpacing makes long words overflow the centered header.
- Fix: grade `<Text>` add `numberOfLines={1}` + `adjustsFontSizeToFit`; consider dropping `letterSpacing` to 1 for non-Latin scripts (CJK + letterSpacing looks broken — gate it: `letterSpacing` only when locale starts with a Latin script).

**G. Settings INTENSITY/weight Pills.** `settings.tsx` `{ label:'풀'|'중'|'미니멀' }` → "Full"/"Medium"/"Minimal" in a horizontal `flexDirection:'row'` of Pills with `marginRight`. Three long German words ("Voll"/"Mittel"/"Minimal") may exceed one row.
- Fix: wrap the Pill row in `flexWrap:'wrap'` (or a horizontal ScrollView). Pills already size to content.

**allowFontScaling note (cross-cutting):** users with large OS font sizes compound the expansion. For the tiny body-map labels (A) set `allowFontScaling={false}` (they are decorative tap-target labels with a fixed % box — OS scaling there guarantees clipping). For all body/content text LEAVE `allowFontScaling` ON (accessibility) but pair it with the `numberOfLines`/`adjustsFontSizeToFit` fixes above so growth degrades gracefully.

**min touch size:** unrelated to text length but verify while touching these files — body-map arm/shoulder blocks are `~16–33px`; they already have `hitSlop={6}`. Keep ≥44pt effective target; do not let the i18n short-label change shrink the visual block.

---

## 2. CJK + font

- iOS system font (San Francisco) falls back to PingFang SC (Simplified Chinese) automatically; Android (Roboto) falls back to Noto Sans CJK. Both render zh/ja/ko out of the box with NO bundled font — confirmed safe for Phase 1. No custom font is required for CJK. Do NOT set a Latin-only `fontFamily` on any text node that can hold CJK (none currently do — only `monoFamily` is set, see below).
- The mono digit stack `monoFamily = "ui-monospace, SFMono-Regular, Menlo, monospace"` (`tokens.ts`) is used ONLY for numbers (CP odometer in `index.tsx`/`power.tsx`, Stepper value, JUICE "+N"). Numbers are language-neutral, so this stack is correct and needs no localization. Caveat: never route a translated WORD through `monoFamily` (those mono fonts lack CJK glyphs → tofu). Today nothing does — keep it that way.
- CJK has no spaces, so word-wrap differs; `numberOfLines` truncation is the safety net (covered in §1). CJK + large `letterSpacing` looks wrong — gate letterSpacing to Latin locales (§1F).

---

## 3. Data-name localization strategy (keep DB key, localize the display)

Principle: the database stores STABLE keys, the i18n catalog stores DISPLAY. The slug/id is already the stable join key everywhere (`exercise.id`, `BodyRegionId`, `GradeKey`), so we localize at render only — zero schema migration.

**3a. Exercise names.** Stop persisting `name` as the display source.
- `seed.ts`: keep the row's `name` as a build-time English fallback (or drop the column dependency for display), but the UI must NOT read `item.name`/`exercise.name` directly.
- `ExerciseRegionSheet.tsx` line 63: `<Text style={styles.exName}>{item.name}</Text>` → `{t('exercise.' + item.id, { defaultValue: item.name })}`.
- `SetLoggerSheet.tsx` line 96: `{exercise.name}` → `{t('exercise.' + exercise.id, { defaultValue: exercise.name })}`.
- `history.tsx`: the SQL selects `e.name AS exercise_name`; change the render `{item.exercise_name}` → `{t('exercise.' + item.exercise_id, { defaultValue: item.exercise_name })}` (add `e.id AS exercise_id` to the SELECT). `defaultValue: row.name` keeps the seeded English as a graceful fallback for any id missing from a catalog.
- Catalog shape: `exercise.barbell_bench_press`, etc., one entry per seed id, per locale file.

**3b. Region labels.** Replace `labelKo` with key-based lookup.
- `regions.ts`: change `RegionDef.labelKo: string` → either remove it and derive the key from the region id, or rename to a stable English `label` used only as fallback. Add a helper `regionLabel(t, id) => t('region.' + id, { defaultValue: REGIONS[id].label })`.
- `BodyRegion.tsx` line 39: `{def.labelKo}` → `{t('region.' + rect.region)}` (short variant for narrow blocks: `t('region.' + rect.region + '.short')`, see §1A).
- `index.tsx` line 35: `title: REGIONS[region].labelKo` → `title: t('region.' + region)`; line 40 cardio `title: '유산소 / 컨디셔닝'` → `t('region.cardio')`.

**3c. Grade labels.** `grades.ts` already has the stable `key` ('ordinary'…'ascendant'). Drop `label` as the display source.
- `grades.ts`: keep `key` + `min`; treat `label` as English fallback only (or remove and rely on catalog).
- `index.tsx` line 51 / `power.tsx` line 45: `{grade.label}` → `{t('grade.' + grade.key, { defaultValue: grade.label })}`.

**3d. Minimal i18n plumbing (recommended concrete setup):**
- Add `expo-localization` (device locale) + a tiny `i18n` module (i18n-js is enough for Phase 1; react-i18next if you want hooks/plural rules later).
- Resolution order: `User.locale` (if set) → `Localization.getLocales()[0].languageCode` → fallback `'en'`. DEFAULT = English.
- Add `locale: string` to `UserSettings` (`lib/settings.ts`, default deduced at boot, persisted), wire into `settingsStore`, and read it in `Boot.tsx` to set `i18n.locale` before first render. Settings screen gets a language Pill row (reuse the same `flexWrap` Pill pattern) writing `persist({ locale })`.
- Catalog files: `src/i18n/locales/{en,ko,es,zh}.ts` with namespaces `tab.*`, `region.*` (+ `.short`), `exercise.*`, `grade.*`, plus the existing UI strings (`today.*`, `power.*`, `settings.*`, `logger.*`, `history.*`). Keys are flat dotted strings to match `t('exercise.'+id)`.
- Add a unit test (spec §10 requires core-logic tests + the user wants no "무지성"): assert every `EXERCISE_SEED.id`, every `BodyRegionId`, and every `GradeKey` has a key present in EACH locale file — this is the anti-drift guard that catches a missing translation at CI, not at runtime.

---

## 4. Canonical English (default) original-IP set

These become the DEFAULT (English) catalog values; ko keeps the current strings; es/zh translate from these.

**Grade ladder (`grade.*`, maps to existing keys ordinary→ascendant):** the spec/code uses 7 tiers. Recommended canonical English, all original (no borrowed IP):
- ordinary → **Ordinary**  (ko 일반인)
- rookie → **Rookie**  (ko 루키)
- fighter → **Fighter**  (ko 파이터)
- warrior → **Warrior**  (ko 워리어)
- beast → **Beast**  (ko 비스트)
- monster → **Titan**  (ko 괴수 — I propose "Titan" over the literal "Monster": stronger hype, avoids the slightly negative/childish "Monster", still 100% original)
- ascendant → **Ascendant**  (ko 초월자)

Alternative all-original ladder if you want a more distinctive voice (rename keys too if adopted): Idle → Spark → Charger → Surge → Overload → Reactor → Redline. (Ties thematically to OVERDRIVE/REDLINE callouts. Optional — the Ordinary…Ascendant set is the safe default and matches existing `GradeKey`s with zero key churn.)

**Callouts (`ORIGINAL_CALLOUTS`, T4 — keep language-neutral, do NOT localize):** current `['OVERDRIVE!','REDLINE!','MAX POWER!']` are good and on-brand. Recommend adding one or two for variety so T4 doesn't repeat: **'REACTOR BREACH!'**, **'FULL THROTTLE!'**. Final set: `['OVERDRIVE!','REDLINE!','MAX POWER!','FULL THROTTLE!','REACTOR BREACH!']`. The T3 fixed label "OVERDRIVE" (`tierConfig.ts TIER_LABEL[3]`) stays as the signature mode name — language-neutral brand token, leave untranslated in all locales.

Rationale for keeping callouts untranslated: they are the brand's hype signature (like a logo/sound), they're short ALL-CAPS Latin that reads as "energy" cross-culturally, and translating them ("¡SOBREMARCHA!") dilutes the brand and risks length blowups in the full-screen `callout` style (`letterSpacing:4`).

---

## Files this touches when implemented (paths for the builder)
- `/Users/daeseonyoo/Documents/GitHub/ai-product/OverDrive/src/features/character/regions.ts` (labelKo → key/fallback)
- `/Users/daeseonyoo/Documents/GitHub/ai-product/OverDrive/src/features/character/BodyRegion.tsx` (t('region.'+id) + ellipsize/adjustsFontSizeToFit + allowFontScaling=false)
- `/Users/daeseonyoo/Documents/GitHub/ai-product/OverDrive/src/features/combat-power/grades.ts` (label → fallback) + `index.tsx`/`power.tsx` render
- `/Users/daeseonyoo/Documents/GitHub/ai-product/OverDrive/src/features/logging/ExerciseRegionSheet.tsx` and `SetLoggerSheet.tsx` (t('exercise.'+id), title numberOfLines)
- `/Users/daeseonyoo/Documents/GitHub/ai-product/OverDrive/src/app/(tabs)/_layout.tsx` (short tab keys), `history.tsx` (exercise_id + t)
- `/Users/daeseonyoo/Documents/GitHub/ai-product/OverDrive/src/ui/primitives.tsx` (NeonButton label numberOfLines/wrap)
- `/Users/daeseonyoo/Documents/GitHub/ai-product/OverDrive/src/features/logging/Stepper.tsx` (label ellipsize)
- `/Users/daeseonyoo/Documents/GitHub/ai-product/OverDrive/src/features/juice/constants.ts` (extend callouts)
- `/Users/daeseonyoo/Documents/GitHub/ai-product/OverDrive/src/lib/settings.ts` + `src/stores/settingsStore.ts` + `src/features/boot/Boot.tsx` (locale field + resolution)
- NEW: `/Users/daeseonyoo/Documents/GitHub/ai-product/OverDrive/src/i18n/index.ts` + `locales/{en,ko,es,zh}.ts` + a coverage unit test
