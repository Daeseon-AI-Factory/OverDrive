I have verified all load-bearing facts: spec §9 confirms grade ladder (일반인→루키→파이터→워리어→비스트→괴수→초월자) and callouts (OVERDRIVE!/REDLINE!/MAX POWER!) are original IP; `schema.ts:15` has `DEFAULT 'ko'`; `grades.ts` hardcodes Korean labels with stable keys; `regions.ts` uses `labelKo`; `userRepo.ts` has no locale writer; `settingsStore.ts`/`settings.ts` have no locale field; package.json has async-storage 2.2.0, react 19.2.3, typescript ~6.0.3, Expo SDK ~56. Note: the EXTRACTED STRINGS uses `grade.monster → "Monster"` while VARIANCE proposed "Titan" — I'll flag this conflict for builder approval. Now I'll write the plan.

# OVERDRIVE i18n FOUNDATION — 구현 계획

> 기본 언어 = **English**. 지원: `en`(default) / `ko` / `es` / `zh`(简体). 등급·콜아웃 이름은 스펙 §9 오리지널 IP — 번역하되 자체 네이밍 유지. 모든 버전·코드 위치는 실제 소스에서 검증함(2026-06-02).

---

## 1. 확정 스택 + 설치

**선택:** `react-i18next` + `i18next` + `expo-localization`. RN/Expo SDK 56(RN 0.85, React 19.2, New Arch)의 사실상 표준. 순수 JS라 Fabric/New-Arch 리스크 0(네이티브는 `expo-localization`의 디바이스 로케일 읽기뿐). `i18n-js`+`react-native-localize` 조합은 병렬 네이티브 의존성이 늘어 기각.

**검증된 버전(npm, 2026-06):**

| 패키지 | 버전 | 비고 |
|---|---|---|
| `i18next` | `^26.3.0` | 코어 |
| `react-i18next` | `^17.0.8` | peer: `i18next >=26.2.0`, `typescript ^5\|\|^6` — 충족(현재 ts ~6.0.3, react 19.2.3) |
| `expo-localization` | `~56.x` | `expo install`로 SDK 핀 |
| `@react-native-async-storage/async-storage` | `2.2.0` | **이미 설치됨(package.json:7) — 재설치 금지.** 본 설계는 별도 AsyncStorage 키를 안 쓰고 `User.locale`을 영속화에 재사용하므로 사실상 불필요 |

```bash
npx expo install expo-localization
npm install i18next@^26.3.0 react-i18next@^17.0.8
```

`app.json`의 `expo.plugins` 배열에 `"expo-localization"` 추가 → CNG 프리빌드:

```bash
npx expo prebuild --clean
```

**`src/i18n/index.ts` (init 스켈레톤):**

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './locales/en.json';
import ko from './locales/ko.json';
import es from './locales/es.json';
import zh from './locales/zh.json';

export const SUPPORTED_LOCALES = ['en', 'ko', 'es', 'zh'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = 'en';

export const resources = {
  en: { translation: en }, ko: { translation: ko },
  es: { translation: es }, zh: { translation: zh },
} as const;

/** 디바이스 언어를 지원 로케일로 클램프; 미지원이면 'en'. 첫 실행 시드 전용. */
export function deviceLocale(): AppLocale {
  const code = getLocales()[0]?.languageCode ?? DEFAULT_LOCALE;
  return (SUPPORTED_LOCALES as readonly string[]).includes(code)
    ? (code as AppLocale) : DEFAULT_LOCALE;
}

// 모듈 로드 시 동기 init → 첫 렌더부터 문자열 보유(키 깜빡임 없음).
// lng은 여기서 DEFAULT, Boot.tsx가 DB User.locale로 즉시 덮어씀(스플래시 노출 중).
i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: SUPPORTED_LOCALES as unknown as string[],
  compatibilityJSON: 'v4',          // Hermes Intl.PluralRules 커버리지 불균일 → v4로 복수형 결정론적
  interpolation: { escapeValue: false }, // React가 이미 이스케이프
  returnNull: false,
});
export default i18n;
```

**영속화 = 기존 `User.locale` 컬럼 재사용**(별도 AsyncStorage 키 X — locale은 이미 User 필드이고 Phase 2에서 Postgres로 동기됨):

- `src/db/schema.ts:15` 기본값 변경: `locale TEXT NOT NULL DEFAULT 'ko'` → `DEFAULT 'en'`. (현재 `DATABASE_VERSION = 1`, 단일 로컬 유저·프리릴리스라 시드 재생성으로 충분.)
- `src/db/repos/userRepo.ts`에 writer 추가:
  ```ts
  export async function updateLocale(db: SQLiteDatabase, locale: string, id = LOCAL_USER_ID) {
    await db.runAsync('UPDATE user SET locale = ?, updated_at = ? WHERE id = ?', [locale, nowIso(), id]);
  }
  ```
- 해석 순서: `User.locale`(저장값, 유효 시) → `deviceLocale()`(첫 실행 시드, 즉시 DB 영속) → `'en'`.

---

## 2. 카탈로그 구조

```
src/i18n/
  index.ts
  locales/en.json   # source of truth (default)
  locales/ko.json   # 기존 한국어 문자열이 여기로
  locales/es.json   # 초안(원어민 검수 필요)
  locales/zh.json   # 简体, 키는 'zh'
```

**네임스페이스(평면 점-표기, `t('exercise.'+id)` 패턴과 일치). 총 118개 키:**

| 네임스페이스 | 키잉 원칙 | 예 |
|---|---|---|
| `tabs.*` | 짧은 탭 라벨(레이아웃 안전) | `tabs.power → "Power"`(NOT "Combat Power") |
| `today.* power.* history.* settings.* logger.* character.* program.* cp.* stepper.*` | UI 정적 문자열 + 보간 | `power.verifiedExplainer → "Verified {pct}% — …"` |
| `region.*` | **DB id 키잉**: `t('region.'+BodyRegionId)` | `region.shoulders`. 좁은 블록용 `region.X.short`(§3) |
| `grade.*` | **stable GradeKey 키잉**(라벨이 아님) | `grade.ascendant`. en은 오리지널 영문, ko는 기존 라벨 |
| `juice.callout.* juice.tier3.label` | **stable callout 키**, 라벨 아님 | `juice.callout.overdrive` |
| `exercise.*` | **seed id 키잉**: `t('exercise.'+id)` | `exercise.barbell_bench_press` |

**데이터 이름 = DB는 키, 카탈로그는 표시.** id/slug가 이미 모든 조인의 안정 키이므로 **스키마 마이그레이션 0**. 표시만 렌더 시 번역하고, 누락 시 `defaultValue`로 graceful fallback:
- exercise: `{t('exercise.'+exercise.id, { defaultValue: exercise.name })}` — seed `name`은 영문 fallback으로만 남김.
- region: `{t('region.'+rect.region)}` — `regions.ts`의 `labelKo`는 제거(또는 `label` 영문 fallback으로 강등).
- grade: `{t('grade.'+grade.key, { defaultValue: grade.label })}`.

**보간/복수형:** v4 복수형은 `key_one`/`key_other`(es는 `key_many` 가능, zh는 `key_other` 단일). 현 추출 문자열은 단순 보간(`{reps}`, `{pct}`) 위주.

**타입 안전(권장, §0 strict):** `src/i18n/react-i18next.d.ts`로 `CustomTypeOptions.resources = { translation: typeof en }` 증강 → 키 자동완성 + 누락 컴파일 에러.

---

## 3. 언어간 디자인 규칙 (고정 레이아웃 깨짐 방지)

독·서반어는 영어 대비 ~+30–40% 길고, CJK는 짧지만 행높이가 큼. 위험순:

| # | 위치(검증된 파일) | 위험 | 고정 |
|---|---|---|---|
| A | `BodyRegion.tsx` 바디맵 % 라벨 (`fontSize.xs` 12px, `letterSpacing:1`, 800). 가장 좁은 블록 `shoulders` width 9%, arms 12% | "Shoulders"/"Hombros" 클립 | `numberOfLines={1}` + `ellipsizeMode="tail"` + `adjustsFontSizeToFit minimumFontScale={0.7}` + `paddingHorizontal:2`. arm/shoulder는 `region.X.short`(예 "Sh."/"肩") 사용. **데코 라벨은 `allowFontScaling={false}`**(고정 % 박스라 OS 스케일링이 클립 유발) |
| B | `(tabs)/_layout.tsx` 탭 라벨 | "Combat Power" 4탭바에서 잘림 | `tabs.power → "Power"` 짧은 키. 글리프(`◆⚡≡⚙`)는 언어무관 앵커로 유지 |
| C | `primitives.tsx` NeonButton (`letterSpacing:1`, 800, 고정폭 아님) | "Repeat last set"/"Letzten Satz wiederholen" 오버플로 | `<Text>`에 `numberOfLines={2}` + `textAlign:'center'`. **고정 height/width 절대 금지.** ⚡ 이모지는 키 밖에 둠(번역가가 못 떨굼) |
| D | `Stepper.tsx` `label`("Weight"/"Reps") | 래핑 | label `<Text>` `numberOfLines={1}`+`ellipsizeMode="tail"`. unit("kg")·mono 값은 언어무관 → 유지 |
| E | `ExerciseRegionSheet.tsx`·`SetLoggerSheet.tsx` 시트 타이틀 (`fontSize.lg`, 900) | 긴 es 운동명이 레이아웃 밀어냄 | 두 타이틀 `numberOfLines={1}`+`ellipsizeMode="tail"` |
| F | `index.tsx`·`power.tsx` 등급 라벨 (`letterSpacing:2/3`) | "Ascendant"/"Ascendente" 헤더 오버플로; CJK+letterSpacing 깨져 보임 | `numberOfLines={1}`+`adjustsFontSizeToFit`; **letterSpacing은 라틴 로케일에서만** 게이트 |
| G | `settings.tsx` 강도 Pill row (`flexDirection:'row'`) | 긴 독어 3개가 한 줄 초과 | row를 `flexWrap:'wrap'` |

**폰트/CJK:** iOS(SF→PingFang SC), Android(Roboto→Noto Sans CJK) 자동 폴백 — 번들 폰트 불필요(Phase 1 안전). **CJK 가능 텍스트에 라틴 전용 `fontFamily` 금지.** mono 스택(`monoFamily`)은 **숫자 전용**으로 유지(번역 단어를 mono로 보내면 tofu). RTL은 en/ko/es/zh 모두 LTR이라 불필요(`getLocales()[0].textDirection`로 추후 대응 가능).

---

## 4. 리팩터 스텝 (순서 고정, 각 단계 독립 검증)

> 검증: 각 단계 후 `npm run typecheck` + `npm run lint` 통과; UI 단계는 `expo start`로 시각 확인; 카탈로그 단계는 `jest` 커버리지 테스트.

1. **의존성 + plugin + prebuild** (§1) — `expo-localization`/`i18next`/`react-i18next` 설치, `app.json` plugin, `prebuild --clean`. *검증:* `npm run typecheck`.
2. **`src/i18n/` 생성** — `index.ts`(동기 init) + `locales/en.json`(118키 영문) + `ko/es/zh.json`. ko는 기존 한국어 문자열을 그대로 이주. *검증:* `tsc`(d.ts 증강 포함).
3. **영속화 배선** — `schema.ts:15` default `'en'` / `userRepo.updateLocale` 추가 / `lib/settings.ts`엔 손대지 않고(`User.locale`은 settings JSON과 별도 컬럼) `settingsStore`에 `locale: AppLocale` + `setLocale` 미러 추가. *검증:* `tsc`.
4. **Boot 배선** — `_layout.tsx` 최외곽에 `<I18nextProvider i18n={i18n}>` 래핑(스플래시 텍스트도 번역). `Boot.tsx` 기존 async 블록에 locale 해석 추가:
   ```ts
   const user = await getUser(db);
   let locale = (user?.locale ?? '') as string;
   if (!locale || !SUPPORTED_LOCALES.includes(locale)) {
     locale = deviceLocale(); await updateLocale(db, locale);
   }
   if (i18n.language !== locale) await i18n.changeLanguage(locale);
   useSettingsStore.getState().setLocale(locale as AppLocale);
   ```
   *검증:* 디바이스 언어 ES로 부팅 → 앱 ES로 뜸.
5. **정적 문자열 치환** — tabs/today/power/history/settings/character/logger/program/cp/stepper 화면들의 하드코딩 한국어를 `t('...')`로. React 밖(헬퍼/스토어/JUICE 분류기)은 `i18n.t(...)` 직접 호출. *검증:* `lint`(미사용 import) + 시각.
6. **데이터 이름 키잉** — `regions.ts` `labelKo` 제거→key 기반; `BodyRegion.tsx`/`index.tsx`/`ExerciseRegionSheet.tsx`/`SetLoggerSheet.tsx`/`history.tsx`(SELECT에 `e.id AS exercise_id` 추가) → `t('exercise.'+id, {defaultValue})`; `grades.ts` label 강등 + `index.tsx`/`power.tsx` 등급 렌더 `t('grade.'+key)`. *검증:* `tsc` + 시각.
7. **콜아웃 키잉** — `juice/constants.ts` `ORIGINAL_CALLOUTS`를 stable 키 `['overdrive','redline','maxPower']`로, `tierConfig.ts` `TIER_LABEL[3]`를 키로. **콜아웃 문자열은 애니메이션 트리거 시점에 동기 in-memory 맵 룩업(sub-ms)** — 핫 로깅 경로 밖(스펙 §6 무마찰 사수). *검증:* 실패근접 세트 → T3 콜아웃 렌더.
8. **§3 레이아웃 고정** — A–G 적용. *검증:* en/es/zh 토글하며 바디맵·탭·버튼·등급 배지 시각 확인.
9. **설정 언어 스위처** — Settings에 언어 Pill row(§3-G의 `flexWrap` 패턴 재사용). 호출:
   ```ts
   export async function changeAppLocale(db, locale: AppLocale) {
     await i18n.changeLanguage(locale);            // 모든 useTranslation 소비자 자동 리렌더
     await updateLocale(db, locale);               // DB = source of truth
     useSettingsStore.getState().setLocale(locale);// 미러
   }
   ```
   *검증:* EN 전환 → 재실행 후에도 유지(`User.locale` 읽기).
10. **커버리지 단위 테스트**(§10 + 무지성 금지) — 모든 `EXERCISE_SEED.id` / `BodyRegionId` / `GradeKey` / callout 키가 **각 로케일 파일에 존재**하는지 assert. 누락을 런타임 아닌 CI에서 잡는 anti-drift 가드. *검증:* `jest`.

`useTranslation()` 패턴: `const { t } = useTranslation(); t('combatPower.label'); t('history.setCount', { count: n });`.

---

## 5. 리스크 & 빌더 확인 (승인 필요)

1. **등급 `monster` 영문 네이밍 충돌 — 결정 요망.** 추출 문자열은 `grade.monster → "Monster"`인데, 본 분석은 `"Titan"`을 제안(더 강한 hype, 약간 유치한 "Monster" 회피, 100% 오리지널). 둘 다 스펙 §9 허용. **둘 중 무엇으로?** (Titan 채택 시 key는 `monster` 유지 — 키 변경 0). 더 distinctive한 대안 사다리(Idle→Spark→Charger→Surge→Overload→Reactor→Redline)는 키 리네임 필요 — 채택 여부?
2. **콜아웃 번역 정책 확인.** 분석은 콜아웃을 브랜드 시그니처로 보고 **전 로케일에서 비번역(라틴 ALL-CAPS 유지)** 권장(스펙 §9 오리지널, "에너지"로 범문화적 판독, `letterSpacing:4` 풀스크린 길이 폭주 방지). 다만 추출 문자열은 ko 카탈로그에도 콜아웃 키를 둠 — **ko에서 OVERDRIVE!를 그대로 둘지, 자체 한글 콜아웃을 쓸지** 승인 요망. T3 `juice.tier3.label`("OVERDRIVE")은 시그니처 모드명 → 전 로케일 비번역 권장.
3. **es/zh는 초안 — 원어민 검수 필요.** 특히 등급/콜아웃 hype tone과 긴 운동명(예 es "Sentadilla búlgara a una pierna")의 §3-E 클립.
4. **추가 언어 방법.** ① `SUPPORTED_LOCALES`에 코드 추가 ② `locales/<code>.json` 생성(118키) ③ `resources`에 등록. RTL(아랍어 등) 추가 시에만 `I18nManager` 배선 필요. 커버리지 테스트가 자동으로 새 파일을 검사.
5. **schema default 변경 가정.** `DEFAULT 'en'` 변경은 프리릴리스·단일 로컬 유저·`DATABASE_VERSION=1` 전제. 이미 `'ko'`로 시드된 기기가 있다면 첫 부팅 시 저장값을 그대로 읽으므로 기존 사용자는 한국어 유지(첫 실행 시드만 영향) — 확인 요망.

system You have 1 remaining turn(s) before the conversation auto-completes. Please wrap up your work and provide your final response to the user's request, including any relevant absolute file paths and code snippets.

The above is the final synthesized plan. It is complete and ready to be returned as the deliverable.
