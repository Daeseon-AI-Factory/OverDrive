<!-- OVERDRIVE Phase 1 구현 플랜 — overdrive-phase1-plan 워크플로(8 에이전트: 버전검증 3 + 설계 4 + 합성 1, 버전 confidence: high)로 2026-06-01 생성. 정본 스펙: docs/overdrive-spec.md. 빌더 승인 전 제안본. -->

# OVERDRIVE — Phase 1 (로컬 MVP) 통합 구현 계획

> 백엔드 없이 온디바이스. 스펙 §8 Phase 1 / §11 시작 지시 기준. **JUICE 엔진(T1–T4)을 최우선**으로 빌드한다(§11.2). 비-협상 항목 전부 준수: Phase 순서 · TS strict · 클라이언트 키 0개(Phase 1은 외부 호출 자체가 없음) · 오리지널 IP만 · JUICE는 로깅을 1ms도 안 막음 · 전투력은 "재미용 자체 산식" 라벨 필수.

---

## 1. 확정 패키지 + 버전

> **SDK 락: Expo SDK 56** (RN 0.85.2 / React 19.2 / Hermes v1 / New Architecture 강제 — `newArchEnabled` 플래그 없음). 리서치의 SDK 55 제안은 폐기 — storage/app-structure/expo-rn 세 블록이 모두 56으로 수렴하고, skia-reanimated의 정확한 핀(2.6.4/4.4.0/0.9.1)이 RN 0.85의 peer 윈도(`0.83 - 0.86`) 안에 들어오므로 충돌 없음.
> **철칙(§0.8): 네이티브 라이브러리는 전부 `npx expo install`로 설치** — SDK 56 `bundledNativeModules`에 핀을 맞춘다. 손으로 버전 올리지 말 것(특히 reanimated↔worklets↔skia 삼각).

| 패키지 | 확정 버전 | 설치 | 신뢰도 / 비고 |
|---|---|---|---|
| `expo` (SDK) | `~56.0.x` (npm 최신 56.0.8) | `create-expo-app --template default@sdk-56` | high. New Arch 강제, 옵트아웃 불가 |
| `react-native` | `0.85.2` (SDK가 핀) | (SDK 자동) | high. 손으로 bump 금지 |
| `react` | `19.2` (SDK가 핀) | (SDK 자동) | high |
| `expo-router` | v7 (SDK 56 번들) | `npx expo install expo-router` | high. **`@react-navigation/*` 직접 import 금지** (내부 포크) |
| `expo-dev-client` | SDK 56 핀 | `npx expo install expo-dev-client` | high. 네이티브 추가/SDK 변경 시마다 **재빌드 필수** |
| `@shopify/react-native-skia` | `2.6.4` | `npx expo install @shopify/react-native-skia` | high. React 19 필요(충족). `next` dist-tag(2.6.3-next.1) 무시 |
| `react-native-reanimated` | `4.4.0` | `npx expo install react-native-reanimated` | high. **New Arch 전용.** 4.5.x(nightly) 금지 |
| `react-native-worklets` | `0.9.1` | `npx expo install react-native-worklets` | high. **reanimated 4.4↔worklets 0.9 강결합.** 한쪽만 bump 시 `_WORKLET is not defined` |
| `expo-sqlite` | `56.0.4` | `npx expo install expo-sqlite` | high. async-first. WAL + PRAGMA user_version |
| `expo-haptics` | `56.0.3` | `npx expo install expo-haptics` | high. fire-and-forget |
| `expo-audio` | `56.0.11` | `npx expo install expo-audio` | high. **expo-av는 SDK 56에서 제거됨 — expo-audio 사용.** canary 56.0.12 금지 |
| `zustand` | `^5.0.14` | `npm install zustand@^5.0.14` | high. named `create`, default export 없음 |
| `@react-native-async-storage/async-storage` | SDK 56 핀 | `npx expo install @react-native-async-storage/async-storage` | high. settings persist 백엔드 |
| `expo-font` | SDK 56 핀 | `npx expo install expo-font` | med — 디스플레이 폰트 로드용(설치 시 확인) |
| `expo-crypto` | SDK 56 핀 | `npx expo install expo-crypto` | med — `client_uuid`(randomUUID)용(설치 시 확인) |
| **(Phase 1 제외)** `@tanstack/react-query` | `5.100.14` | — | 온디바이스라 dead weight. **Phase 2로 미룸** |
| **(채택 안 함)** `drizzle-orm` | `0.45.2` | — | 7테이블 소규모 → raw expo-sqlite가 더 가볍다. 라이브 CP UI에 reactive 필요해지면 재검토 |

**Dev 도구(`npm install -D`):** `eslint-config-expo eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-import eslint-import-resolver-typescript eslint-config-prettier prettier jest jest-expo @testing-library/react-native @types/jest`

**설치 시 재확인할 것(§0.8):** dev-client/router/skia/sqlite/haptics/audio/async-storage/font/crypto의 정확한 패치는 `npx expo install`이 SDK 56 manifest에서 해결. 위 패치 번호(56.0.4 등)는 2026-06-01 npm latest 기준이며 설치 시점에 미세 변동 가능.

---

## 2. 파일 트리 (병합본)

> 4개 설계 핀의 경로를 통합. 충돌 해소: combat-power는 **app-structure 경로 `src/features/combat-power/`**로 통일(data-layer/combat-power 핀의 `src/domain/combatPower/`는 폐기 — feature-sliced 일관성). JUICE는 **`src/features/juice/`**로 통일(juice-engine 핀의 `src/juice/`는 폐기). DB는 **`src/db/repos/`**(app-structure) 채택. 스토어는 **`src/stores/`**(cross-feature 가시성).

```
OverDrive/
├── app.json · package.json · tsconfig.json · babel.config.js · metro.config.js
├── eslint.config.js · .prettierrc · eas.json
├── app/                                   # Expo Router v7 — thin screens only, DB 직접 접근 금지
│   ├── _layout.tsx                        # <SQLiteProvider onInit={migrateDbIfNeeded}> → ThemeProvider
│   │                                      #   → <JuiceProvider>(전역 Skia overlay + setAudioModeAsync once) → <Stack>
│   ├── +not-found.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx                    # <Tabs> 4개: 오늘/전투력/기록/설정 (라벨 한글, 파일명 ASCII)
│   │   ├── index.tsx                      # 오늘: 요일별 day_type 프로그램 + 빠른 로깅
│   │   ├── power.tsx                      # 전투력: 오도미터 + 등급 + breakdown + "재미용 자체 산식·과학적 지표 아님" 라벨(필수)
│   │   ├── history.tsx                    # 기록: 날짜별 세션/세트 타임라인
│   │   └── settings.tsx                   # 설정: juice_intensity / sound_on / 단백질 / 신체지표 / aesthetic_pref
│   ├── session/[sessionId].tsx            # 진행 중 세션 세트별 로깅 surface
│   ├── log/quick.tsx                      # 모달: 빠른 탭 폴백(프리필 + "지난 세트 반복")
│   └── power/breakdown.tsx                # 모달: 전투력 breakdown 상세
├── assets/sfx/                            # 오리지널 SFX + 콜아웃 VO (tick/chunk/bass/supernova/"OVERDRIVE!"...)
└── src/
    ├── features/
    │   ├── logging/
    │   │   ├── components/{SetLoggerRow,QuickLogSheet,LogButton}.tsx
    │   │   ├── hooks/{useLogSet,useLastSet}.ts
    │   │   ├── detectPr.ts                # 순수: PR 판정 (단위 테스트)
    │   │   ├── detectPr.test.ts
    │   │   └── logging.types.ts
    │   ├── program/
    │   │   ├── components/TodayCard.tsx
    │   │   ├── hooks/useTodayProgram.ts
    │   │   ├── defaultProgram.ts          # §6.2 월상체A/화하체A/수인터벌... (코드 상수, DB 테이블 아님)
    │   │   └── program.types.ts
    │   ├── combat-power/
    │   │   ├── computeCombatPower.ts      # 순수: basket → score+breakdown+verifiedRatio (단위 테스트)
    │   │   ├── computeCombatPower.test.ts # 8 케이스(아래 §3)
    │   │   ├── constants.ts               # BASE_SCALE/CP_FLOOR/K_*/BASE_WEIGHTS (튜닝 다이얼)
    │   │   ├── curves.ts                  # sat()/ramp()
    │   │   ├── grades.ts                  # score → 등급 (오리지널 7등급)
    │   │   ├── combatPower.types.ts
    │   │   ├── hooks/useCombatPower.ts
    │   │   └── components/{PowerOdometer,GradeBadge,BreakdownList}.tsx
    │   └── juice/                         # ⚡ 심장. fire-and-forget. 로깅 절대 안 막음
    │       ├── JuiceProvider.tsx          # shared-value 버스 + settingsRef + fire/skip/setIntensity/setSoundOn + audio/haptic 풀
    │       ├── JuiceOverlay.tsx           # 전역 absolute-fill <Canvas pointerEvents="none"> + useClock + useDerivedValue uniform 파이프
    │       ├── useJuice.ts                # useJuice() / useJuiceShared()
    │       ├── classifyEvent.ts           # 순수: LoggedEvent → {tier,delta,reason,intensity01} (단위 테스트)
    │       ├── classifyEvent.test.ts      # 안티-수치심 floor 포함
    │       ├── tierConfig.ts              # TIER_CONFIG: 길이/shake/chroma/bloom/sfx/haptic/콜아웃
    │       ├── recordPowerEvent.ts        # recordAndFire(): fire 먼저, PowerEvent insert는 비-await
    │       ├── haptics.ts                 # try/catch 래퍼 (never awaited)
    │       ├── audio/pool.ts              # expo-audio 플레이어 풀, playPooled(seekTo0+play)
    │       ├── components/{FloatUpDelta,Odometer}.tsx
    │       └── shaders/
    │           ├── energyPop.sksl.ts      # T1/T2 (★ 첫 번째로 빌드)
    │           └── overdriveBurst.sksl.ts # T3/T4 (두 번째)
    ├── db/
    │   ├── client.ts · migrate.ts         # migrateDbIfNeeded, DATABASE_VERSION
    │   ├── migrations/001_init.sql        # DDL (PG 모델 미러)
    │   ├── seed_exercises.ts              # 20개 시드 (INSERT OR IGNORE, idempotent)
    │   ├── uuid.ts · types.ts
    │   └── repos/
    │       ├── userRepo.ts · sessionRepo.ts · setLogRepo.ts   # setLogRepo = 프리필 + PR 판정 거처
    │       ├── cardioRepo.ts · combatPowerRepo.ts · powerEventRepo.ts
    │       └── setLogRepo.test.ts
    ├── stores/
    │   ├── sessionStore.ts                # 진행 세션(transient, SQLite가 원본)
    │   ├── settingsStore.ts               # persist(AsyncStorage). User.settings jsonb 미러
    │   └── combatPowerStore.ts            # 현재 CP 스냅샷(오도미터 슬램용 previous/score)
    ├── lib/
    │   ├── date.ts · id.ts · format.ts · result.ts · constants.ts
    └── ui/
        ├── theme/{tokens.ts,ThemeProvider.tsx,useTheme.ts}   # B급 네온 토큰
        └── primitives/{Screen,NeonText,NeonButton,Card,Stat,Pill}.tsx
```

**레이어 규칙(ESLint `no-restricted-paths`로 강제):** `app/`→`src/` OK / `src/features`는 `app/` import 금지 / `ui`·`lib`는 `features`·`db` import 금지(leaf) / **juice는 SQLite write가 resolve된 *후*에만 이벤트 구독 — write path를 절대 안 막음.**

---

## 3. 전투력 v1 산식 요약

> **재미용 자체 산식 · 과학적 지표 아님** (UI 라벨 필수, §6.3/§11.4). 0–9999 bounded, monotonic, 안티-수치심.

```
basket01  = Σ_i ( w_i_eff · s_i )           // 활성 컴포넌트만 가중평균, ∈[0,1]
trustMult = 1 + 0.15·clamp01(verifiedRatio) // 안티-수치심: 절대 1.0 미만 X. Phase1=1.00
score     = clamp( round(9999 · basket01 · trustMult), CP_FLOOR=50, 9999 )
```

**커브:** `sat(x,k)=1-e^(-x/k)` (포화, 천장 없음 = 추격감), `ramp(x,cap)=min(1,x/cap)`.

| 컴포넌트 | base w | Phase1 eff w | 입력 → s_i (Phase1 소스) |
|---|---|---|---|
| 7일 근력 볼륨 | 0.30 | **0.375** | Σ(weight·reps), PR 세트 ×1.15 → `sat(vol, 15000)` |
| 세션/주 | 0.15 | **0.1875** | 7일 완료 세션 distinct → `ramp(n, 5)` |
| 컨디셔닝 | 0.15 | **0.1875** | Σ(min(min,45)·rpe가중) → `sat(units, 90)` |
| 연속(streak) | 0.10 | **0.125** | 연속일 → `sat(days, 10)` |
| 규율(단백질/휴식) | 0.10 | **0.125** | (단백질일/7 + 휴식OK일/7)/2. **미추적 시 비활성** |
| 리컴프 | 0.08 | 0 (비활성) | BodyComp 없음 → renorm out (Phase 5) |
| 체력 마커 | 0.12 | 0 (비활성) | FitnessTest 없음 → renorm out (Phase 5) |

**graceful degradation:** 비활성 컴포넌트는 분모에서 제거(renorm) → 미래 데이터 부재가 점수에 숨은 천장을 만들지 않음. (규율 미추적이면 활성합 0.70으로 재정규화.)

**등급(오리지널, inclusive-lo):**
| 일반인 | 루키 | 파이터 | 워리어 | 비스트 | 괴수 | 초월자 |
|---|---|---|---|---|---|---|
| 0–799 | 800–1999 | 2000–3499 | 3500–4999 | 5000–6499 | 6500–8199 | 8200–9999 |

초반 좁고 상단 넓음(1–2주차 빠른 승급 = 유지/안티-수치심). 자기보고만으론 ~괴수 캡, 초월자는 검증+체력+리컴프(breadth-gated). **CP_FLOOR=50**: 첫 세트 1개도 양수 일반인.

**필수 단위 테스트 8개**(`computeCombatPower.test.ts`): ①빈 주=floor 50 ②자기보고 무처벌(mult=1.00) ③검증은 더하기만(0/0.5/1.0→1.0/1.075/1.15, monotonic) ④볼륨 monotonic+포화 ⑤renorm(미래 데이터가 천장 안 만듦) ⑥상단 clamp=9999=초월자 ⑦등급 경계 ⑧worked-example 골든마스터(basket01≈0.6446, score=6445, 비스트).

---

## 4. JUICE 티어 → 연출 표

> **비-블로킹 계약(§6.4 철칙·비-협상 #6, 재진술):** 로깅 path의 유일한 `await`는 SetLog DB write뿐. `juice.fire(verdict)`는 **동기 void 반환, 절대 await 안 함, never throws.** 비주얼은 전부 Reanimated shared value를 **UI 스레드**에서 변형(setState/runOnJS/React reconcile 0). uniform은 `useDerivedValue` 워클릿이 매 프레임 UI 스레드에서 GPU로 직주입 → **JS 브리지 라운드트립 0.** 햅틱/오디오는 fire-and-forget(에러 swallow). PowerEvent insert는 **자기 promise**로 비-await. `classifyEvent`는 순수·동기·<1ms.

| 티어 | 트리거 | 비주얼 | 사운드(오리지널) | 햅틱 | 길이 | 스킵 | 로깅 블록 |
|---|---|---|---|---|---|---|---|
| **T1** | 세트 1개 (오프데이 포함, 안티-수치심 floor intensity≥0.18) | 라디얼 에너지 팝 + "+N" 플로트업 + 옅은 bloom | tick/spark 원샷 | `impactAsync(Light)` | **≤0.4s** | 자동 | **절대 X** |
| **T2** | 견고한 세트(목표 reps + RIR 1–3) | 컬러 플래시 + 작은 프로시저럴 파티클 + 밝은 bloom | chunk/power-tick | `impactAsync(Medium)` | ≈0.6s | 자동 | X |
| **T3** | **PR** or 하드셋(RIR 0, PR 아님) — **OVERDRIVE 진입** | 스크린셰이크 + 프로시저럴 파티클 폭발 + 슬로모 + 오라 점화 + 크로마틱 애버레이션 + 오도미터 슬램 | 베이스 히트 + 아케이드 스웰 | `notificationAsync(Success)`+램프 `Heavy` | ≈1.2s | 탭 | X(비동기) |
| **T4** | 세션 완료 / streak 마일스톤 / 레벨업 | 풀스크린 슈퍼노바 + 오리지널 콜아웃("OVERDRIVE!"/"REDLINE!"/"MAX POWER!") + 등급/연속 배지 + 오라카드 자동생성(Phase 3 stub) | 베이스 드롭 + whoosh + 콜아웃 VO(오리지널) | `notificationAsync(Success)`+점증 럼블 | ≈1.5–2s | 탭 | X(비동기) |

**설정 연동:** `juice_intensity` 풀/중/미니멀 — 미니멀=셰이더 비주얼 OFF(셰이더 early-out=무료)지만 **햅틱+사운드 floor는 유지**(헬스장 무음 케이스). 중=길이 ×0.7, shake/chroma 캡. `sound_on=false`=오디오만 뮤트, 비주얼+햅틱 유지. **안티-수치심:** delta≤0이면 음수 숫자 대신 중립 spark + "기록됨".

**★ 먼저 빌드할 셰이더:** **두 개**가 felt-quality 80%를 책임 — ①**T1 energyPop**(매 로그마다 발동, 베이스라인 도파민, 가장 많이 보임 → 가장 먼저·여러 번 폴리시) ②**T3 overdriveBurst**(시그니처 OVERDRIVE 순간). T2=T1의 파라미터 변형, T4=T3 dialed to 1.0+슈퍼노바. **두 셰이더를 `uIntensity`/`uProgress`로 파라미터화해 4티어 전부 커버.** `RuntimeEffect.Make`는 컴파일 실패 시 **null 반환** → dev assert로 SkSL 에러 노출 필수(없으면 깨진 셰이더가 invisible no-op로 출시됨).

---

## 5. 로컬 DB 스키마 요약

**스택:** raw `expo-sqlite 56.0.4`, `<SQLiteProvider databaseName="overdrive.db" onInit={migrateDbIfNeeded}>`. **WAL 1회 설정 + `PRAGMA foreign_keys=ON`은 매 연결마다 재발행**(persist 안 됨 — 누락 시 CASCADE 침묵 실패).

**Phase 1 테이블(§5 subset, 7개):** `user`(단일 local, settings=jsonb-in-TEXT) · `exercise`(시드 카탈로그) · `workout_session` · `set_log`(is_pr, rir, order_index, logged_via) · `cardio_log` · `combat_power`(score, breakdown JSON, verified_ratio) · `power_event`(tier, delta, reason).

**미룸:** BodyComp/FitnessTest(Phase 5) · League/Friendship/AuraCard(Phase 3–4) · Program(코드 상수 `defaultProgram.ts`, 테이블 아님). Streak는 세션 행에서 즉석 계산(테이블 없음).

**PG 포워드-호환(Phase 2 마이그 = 기계적) 하드 컨벤션:**
- 모든 타임스탬프 = ISO-8601 UTC TEXT(`...Z`) → `TIMESTAMPTZ`
- 모든 트랜잭션 행에 `client_uuid TEXT UNIQUE`(생성 시 1회만, 수정 시 재생성 금지) = sync 키
- `CHECK (x IN ...)` → PG `ENUM`
- jsonb-in-TEXT(settings/breakdown) → `JSONB`
- `is_pr` INTEGER 0/1 → `BOOLEAN`
- `exercise.id` = slug(예 `barbell_bench_press`) — PG 키 + Phase 2 LLM 퍼지매칭 타깃

**마이그레이션:** `PRAGMA user_version` 증분. `DATABASE_VERSION` 상수 bump + 순차 `if (v === N)` 블록 추가, 출시된 마이그레이션은 절대 수정 금지(다음 추가). `IF NOT EXISTS`/`INSERT OR IGNORE`로 재실행 안전. `.sql` import vs 인라인 템플릿 스트링 — **인라인 템플릿 스트링 채택**(metro/babel inline-import 설정 회피, zero-config).

**시드:** 20개 운동(`INSERT OR IGNORE`, idempotent) — §6.2 상체A/하체A/상체B/하체B + 코어 + 인터벌 2종(hiit_intervals, zone2_run) 커버. default_sets/rep_low/rep_high 포함.

**핵심 로직 거처(UI 아님, 단위 테스트):** `setLogRepo.getLastSetForExercise()` = **"지난 기록 프리필"**(§6.1), `setLogRepo.detectPr()` = **is_pr/점진적 과부하**(Epley e1RM 비교, 재미용). `addSet`가 insert 전 detectPr 호출→is_pr 저장→반환→caller가 true면 JUICE T3 발동.

---

## 6. 빌드 순서 (스텝, 의존성 순)

> Accept 기준 매핑: **[A]=오프라인 동작** · **[B]=기록할 때마다 폭발** · **[C]=빌더가 매일 쓸 수준**. §11.2대로 JUICE 우선.

**0. ★ 스캐폴드 (첫 명령) — [A][C] 토대**
`cd ..` → `npx create-expo-app@latest OverDrive-scaffold --template default@sdk-56` → `rsync -a --exclude '.git' OverDrive-scaffold/ OverDrive/` (기존 CLAUDE.md/docs/content/.claude/.git 보존). create-expo-app은 빈 디렉터리를 기대하므로 **반드시 temp+rsync 머지**(`.` 직접 스캐폴드 금지 — 기존 파일 clobber).

**1. 그래픽/스토리지/상태 설치 + dev client — [A][B] 토대**
`npx expo install @shopify/react-native-skia react-native-reanimated react-native-worklets expo-sqlite expo-haptics expo-audio expo-dev-client @react-native-async-storage/async-storage expo-font expo-crypto` → `npm install zustand@^5.0.14` → dev 도구 `-D` 설치. **`npx expo run:ios`(or android)로 dev client 빌드**(Skia/sqlite/haptics/audio = 커스텀 네이티브, Expo Go 불가).

**2. 설정 강제: TS strict + lint + babel — [C] 품질 게이트**
`tsconfig`: `strict:true, noUncheckedIndexedAccess, exactOptionalPropertyTypes, paths {"@/*":["src/*"]}`. `app.json`: `experiments.typedRoutes:true`, name/slug "OverDrive", scheme "overdrive". **babel.config.js 최소 유지** — babel-preset-expo가 worklets 플러그인 자동 주입, `react-native-reanimated/plugin`(deprecated alias) **추가 금지**(double-plugin 충돌). ESLint `no-restricted-paths`로 레이어 경계 강제.

**3. 테마 토큰 + UI 프리미티브 — [C] 정체성 즉시**
`ui/theme/tokens.ts`(B급 네온: near-black 캔버스 + 핫마젠타/시안 + warm→hot 에너지 ramp + heavy mono 전투력 디지트) + ThemeProvider + Screen/NeonText/NeonButton/Card/Stat/Pill.

**4. DB 레이어 — [A] 온디바이스 영속의 원본**
`001_init.sql`(인라인 템플릿) + `migrate.ts`(user_version, WAL, FK ON 매 연결) + 20개 시드 + `repos/*`(타입드, raw SQL 위로 안 샘) + `setLogRepo.test.ts`. 루트 `_layout.tsx`에 SQLiteProvider 1회 마운트. **스모크: 부팅 시 user_version 0→1, WAL, 시드 적용 확인.**

**5. ⚡ JUICE 엔진 — [B] 핵심 뽕맛 (§11.2 최우선)**
순서: ①`classifyEvent.ts`+테스트(순수, 안티-수치심 floor) → ②`JuiceProvider`(shared-value 버스, settingsRef, audio/haptic 풀, setAudioModeAsync 1회) → ③`JuiceOverlay`(전역 absolute-fill Canvas + useClock + useDerivedValue uniform 파이프) → ④**★ energyPop.sksl(T1/T2) 작성·반복 폴리시** → ⑤`tierConfig`+`recordPowerEvent`(fire 먼저, PowerEvent 비-await)+`haptics`+`audio/pool` → ⑥**overdriveBurst.sksl(T3/T4)** → ⑦FloatUpDelta/Odometer. **계약 검증: fire()는 void·동기, write path 미차단.** (콜아웃 VO·SFX는 오리지널 — assets/sfx/ 채우기, 없으면 T4는 placeholder.)

**6. 전투력 도메인 — [B][C] 점수 + 라벨**
`computeCombatPower.ts`(순수)+constants/curves/grades+8 테스트 → combatPowerStore + repos.upsert. **전투력 탭에 "재미용 자체 산식 · 과학적 지표 아님" 라벨(필수, §11.4)** + PowerOdometer + GradeBadge + BreakdownList.

**7. 프로그램 + 로깅 — [B][C] 핫패스 (모든 게 여기서 만남)**
`defaultProgram.ts`(§6.2) + useTodayProgram + TodayCard → `useLogSet` 데이터플로: `setLogRepo.insertSet`(**유일한 await**) → `detectPr` → `computeCombatPower`(7일 basket from repos) → `combatPowerStore.setSnapshot` + `combatPowerRepo.upsert` + `powerEventRepo.append` → **`juice.fireEvent(...)` 마지막에, write durable 후.** 빠른탭 폴백(프리필 + "지난 세트 반복") + SetLoggerRow("지난: Xkg×Y" 힌트).

**8. 화면 조립 + Accept 검증 — [A][B][C] 통합**
4탭(오늘/전투력/기록/설정) + session/[sessionId] + 모달 2개 배선. **스모크(Phase 1 Accept):** 비행기모드 부팅→마이그레이션→4탭 렌더→전투력 라벨 표시→세트 로깅 시 SetLog insert + CP 재계산 + **T1 팝이 write 안 막고 발동**→PR 세트는 T3 폭발. **빌더 dogfooding 며칠 = [C] 최종 게이트.**

**9. 로깅 (CLAUDE.md dual-write)** — 스캐폴드 커밋은 LOC>200 + 새 의존성으로 positive trigger 발동. `[no-log]` 무효 → `docs/troubleshooting.md` + `content/logs/OverDrive/<날짜>-scaffold.mdx` dual-write 필수.

---

## 7. 리스크 & 빌더가 결정할 것

**즉시 결정(스캐폴드 전):**
- **SDK 락 확정?** 계획은 **SDK 56**으로 락(리서치 SDK 55 제안 폐기, 근거는 §1). → **승인 필요.**
- **스캐폴드 머지 방식?** temp+rsync(기존 .git/CLAUDE.md/docs 보존) — 채택. → 확인.
- **로컬 dev 루프?** `npx expo run:ios/android`(로컬 Xcode/Android Studio 필요) vs EAS dev build(클라우드). → 선택.

**전투력 튜닝(주1 dogfooding 후 조정 — 빌더 콜):**
- 가중치/커브 노브(K_VOL=15000, SESS_CAP=5, K_COND=90, K_STREAK=10, BASE_WEIGHTS, 등급 밴드) — 시작값일 뿐.
- 규율(단백질/휴식) Phase 1에 수동 체크마크 둘지? (활성합 0.80 vs 0.70 결정)
- 맨몸 운동 볼륨 추정법(고정 체중 vs %BW 테이블 vs 제외).
- 자기보고만으로 초월자 도달 가능하게 할지, breadth-gate 유지할지.
- 검증 보너스 +15%가 맞는지(Phase 2 센서 도착 시 +25%?).

**미감/JUICE(빌더 콜):**
- `aesthetic_pref` 기본값 = 배틀오라 vs 글로우 vs 네온? hue 매핑(uHue)을 Phase 1에 배선할지 Phase 3로 미룰지.
- 콜아웃 VO = 합성/가공 vs 실제 녹음? (T4 출시 전 녹음 스텝 필요 여부 — 없으면 T4는 placeholder로 진행)
- `SOLID_DELTA_REF=12`, 안티-수치심 floor 0.18, 하드셋 RIR 임계(0만 vs 0–1) — feel 기반, dev 튜닝 패널 노출 여부.
- OVERDRIVE MODE(세션 게이지 충전식)를 Phase 1에 넣을지, T1–T4 per-event만으로 MVP 충분한지.

**아키텍처 리스크(인지):**
- **reanimated 4.4↔worklets 0.9↔skia 2.6.4 강결합** = #1 footgun. 한쪽만 bump 시 `_WORKLET is not defined`. 항상 `npx expo install`.
- Skia overlay idle 비용(항상 마운트된 풀스크린 Canvas) → `if(uIntensity<0.001) return 0` early-out으로 완화, 저사양 안드로이드 on-device 검증 필요.
- expo-audio 단일 플레이어는 겹침 재생 불가 → 빠른 연속 T1 팝용 작은 풀(4개) 필요, 사이징 검증.
- T3/T4 프로시저럴 in-shader 파티클(48+ 루프) = fragment-heavy → PR 순간 프레임 드롭 위험, "중" intensity 자동 degrade(루프 축소) 필요.
- PowerEvent fire-and-forget(비-await) → write/insert 사이 크래시 시 CP-event 히스토리 약간 불일치(Phase 1 허용, debug/trend용).
- 단일 유저(`user.id='local'`) 가정 모든 DEFAULT에 박힘 — Phase 1 dogfooding 허용, 멀티프로필은 재작업.
- **drizzle vs raw** — raw 채택. 라이브 CP UI에 reactive `useLiveQuery` 필요해지면 재검토(빌더 콜).

**참고 파일:** 정본 스펙 `/Users/daeseonyoo/Documents/GitHub/ai-product/OverDrive/docs/overdrive-spec.md`. 위 §2 파일 트리가 4개 설계 핀 경로의 병합 결과(combat-power→`src/features/combat-power/`, juice→`src/features/juice/`로 통일).
