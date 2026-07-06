# Codex Comprehensive Repository Review

## Review Metadata

- 리뷰 일시: 2026-07-02 18:17:21 EDT
- Git 브랜치: `main`
- HEAD 커밋: `3fe19bc312b749cbd1aee51b3eea4441b2a8b56c`
- 생성된 출력 디렉터리: `codex_review/full/2026-07-02-1817/`
- 리뷰 유형: 전체 저장소 검증 리뷰. 주간/월간 정기 리뷰 여부는 사용자가 지정하지 않았다.
- 시작 시 작업 트리 상태, `claude_review/` 제외: dirty. 이 리뷰 전에 이미 `README.md`, `app.json`, `package.json`, `package-lock.json`, 여러 `src/` 파일, `worker/src/index.js`, `website/`, `eas.json`, 기존 `codex_review/full/` 디렉터리 등이 수정 또는 미추적 상태였다. 이 리뷰는 소스 파일을 수정하지 않았다.
- 최종 verification 상태: 요청된 두 report file이 모두 존재한다. 두 report 모두 동일한 finding ID F-001부터 F-010까지 포함하며 severity level도 동일하다. 새 output directory로 scope를 좁힌 final git status는 `?? codex_review/full/2026-07-02-1817/`만 보여준다.
- 독립성 제약: `claude_review/`는 모든 스캔에서 의도적으로 제외했으며 읽거나, 검사하거나, 요약하거나, 비교하거나, 증거로 사용하지 않았다.

## Review Scope

저장소 구조, README, 패키지/빌드 설정, Expo 앱 메타데이터, EAS 설정, 환경변수 예시, SQLite 스키마와 repository, 앱 라우트, 주요 feature 컴포넌트, HealthKit 통합, AI/리더보드 Cloudflare Worker, 웹사이트 privacy/support 페이지, 출시/컴플라이언스 문서, iOS privacy manifest와 plist, 테스트, 스크립트, 검증 명령 결과를 검사했다.

검사하지 않은 것: `claude_review/`; 기존 생성 리뷰 파일 내용(`codex_review/full/` 하위 기존 보고서); `node_modules` 전체 의존성 소스; `.expo/`, `dist/`, `ios/build/`, `ios/Pods/` 생성 산출물; secret `.env` 내용; 배포된 Cloudflare Worker 동작; 원격 D1 스키마; App Store Connect 상태; 실제 디바이스 런타임 UI.

## Executive Summary

이 프로젝트는 local SQLite 영속성, 운동 로깅, Combat Power 점수, JUICE 피드백, HealthKit 통합, Cloudflare Worker를 통한 선택적 AI 파싱/사진 플로우, 리더보드, 온보딩, 프로그램 생성, 정적 웹사이트를 갖춘 상당히 큰 Expo/React Native 피트니스 앱이다. TypeScript, lint, Jest 19개 suite는 모두 통과했다.

검사한 증거만 기준으로 보면 이 앱은 로컬 dogfooding에는 부분적으로 준비되어 있으나, 공개 프로덕션 또는 App Review 제출에는 준비되지 않았다. 주요 차단 요인은 보안과 컴플라이언스다. Worker가 공개 무인증 상태이고, HealthKit 권한이 검사한 코드가 사용하는 범위보다 넓으며, 개인정보 고지/native privacy 메타데이터가 구현된 데이터 흐름과 맞지 않고, Worker/D1 배포가 저장소만으로 재현되지 않는다.

## Project Overview

- 주요 스택: Expo SDK 56, React Native 0.85, React 19, Expo Router, TypeScript strict mode, Zustand, Expo SQLite, `@kingstinct/react-native-healthkit`, 시각 피드백용 Skia/audio/haptics.
- 로컬 데이터: `src/db/schema.ts`의 SQLite 스키마, `src/app/_layout.tsx`의 `SQLiteProvider`에서 마이그레이션.
- 백엔드 유사 구성요소: `worker/src/index.js`의 Cloudflare Worker. `/parse`, `/transcribe`, `/food`, `/rank/*`, `/evolve` 처리.
- 웹사이트/문서: `website/` 정적 페이지와 `docs/` 출시/컴플라이언스 문서.
- 테스트: Jest 19개 suite, 137개 테스트. 대부분 순수 로직 테스트이며 React 컴포넌트 suite 1개가 있다.

## Key Findings Summary

| ID | Severity | Category | Title | Confidence |
|---|---|---|---|---|
| F-001 | High | Security / Operations | 공개 Worker가 인증 또는 rate limit 없이 AI, transcription, image, rank endpoint를 노출한다 | High |
| F-002 | High | Privacy / Compliance | 개인정보 고지와 native privacy 메타데이터가 구현된 외부 전송 데이터 흐름과 맞지 않는다 | High |
| F-003 | High | Security / Health Data | HealthKit authorization이 검사한 코드에서 사용하지 않는 민감 데이터 타입을 요청한다 | High |
| F-004 | Medium | Data Integrity / UX | 여러 SQLite write repository가 실패를 삼켜 silent data loss 또는 optimistic UI 불일치를 만든다 | High |
| F-005 | Medium | Health Data / Correctness | HealthKit workout export가 부정확한 workout metadata를 쓸 수 있다 | High |
| F-006 | Medium | Deployment / API | Worker 저장소에 D1 `rank_entry` 스키마와 migration이 없다 | High |
| F-007 | Medium | Dependency Security | production dependency audit에 test stack이 포함되고 high/moderate advisory가 보고된다 | High |
| F-008 | Medium | Deployment / Release Readiness | `expo-dev-client`와 dev menu pod가 production dependency/native tree에 남아 있다 | High |
| F-009 | Low | Operations / Reproducibility | Worker package에 lockfile이 없어 Worker audit과 재현 가능한 install을 검증할 수 없다 | High |
| F-010 | Low | Maintainability / Documentation | root README가 setup, verification, deployment onboarding에 너무 빈약하다 | High |

## Critical Issues

검사한 증거에서 Critical 이슈는 확인되지 않았다.

## High-Priority Issues

### F-001: 공개 Worker가 인증 또는 rate limit 없이 AI, transcription, image, rank endpoint를 노출한다

- Severity: High
- Category: Security / Operations
- Evidence:
  - `worker/src/index.js:13-17`에서 `access-control-allow-origin: '*'`를 설정한다.
  - `worker/src/index.js:413-423`은 auth token, signature, origin allowlist, per-user quota 확인 없이 모든 POST route를 dispatch한다.
  - `worker/src/index.js:107-131`, `135-165`, `174-244`, `255-280`, `353-410`은 parse, transcribe, food, rank submit, evolve를 처리하며, 유료/제한된 제3자 서비스 호출 또는 D1 write를 수행한다.
  - client call은 JSON/content header만 보낸다. 예: `src/features/quicklog/parseEntryAI.ts:46-50`, `src/features/rank/rankClient.ts:34-38`, `src/features/food/parseFoodAI.ts:45-49`, `src/features/evolution/evolveClient.ts:45-50`.
  - `worker/README.md:36-38`은 endpoint에 auth가 없다고 명시하고 공개 출시 전 Cloudflare Access 또는 per-user token을 추가하라고 적고 있다.
- What is wrong: Worker URL을 얻은 누구나 AI parsing, transcription, 음식 사진 추정, 이미지 evolution, leaderboard submit/board route를 호출할 수 있다. 검사한 코드에는 업로드 audio/image에 대한 app-level request size limit도 없다.
- Why it matters: API quota/cost 소진, 서비스 저하, ranking 오염, CORS open으로 인한 브라우저 기반 남용 경로가 생긴다.
- Recommended fix: per-install 또는 per-user token, HMAC, backend-issued session credential을 요구한다. Cloudflare rate limit/WAF rule을 추가한다. 가능한 route에는 CORS allowlist를 적용한다. upload/body size limit, abuse logging을 추가하고, 공개 read route와 비용이 큰 write/generation route를 분리한다.
- Confidence: High

### F-002: 개인정보 고지와 native privacy 메타데이터가 구현된 외부 전송 데이터 흐름과 맞지 않는다

- Severity: High
- Category: Privacy / Compliance
- Evidence:
  - `docs/compliance/privacy-policy.md:54-59`와 `website/privacy.html:71-76`은 meal/avatar photo가 Google Gemini에서 처리된다고 말한다.
  - 검사한 food-photo 구현은 `/food` multipart photo를 Groq로 보낸다: `src/features/food/FoodCard.tsx:105-111`, `src/features/food/parseFoodAI.ts:27-40`, `worker/src/index.js:217-227`.
  - `docs/compliance/privacy-policy.md:66-75`는 optional leaderboard data를 handle, anonymous device ID, crew code로만 설명한다.
  - 실제 앱과 Worker는 ranking score field도 전송/저장한다: `src/features/rank/RankSection.tsx:65-72`, `src/features/rank/rankClient.ts:21-31`, `worker/src/index.js:263-270`.
  - `docs/launch/app-store-listing.md:70-74`는 Health/Fitness와 optional handle/user ID가 identity에 linked가 아니라고 안내한다.
  - `ios/OverDrive/PrivacyInfo.xcprivacy:45-56`은 `NSPrivacyCollectedDataTypeFitness`를 linked로 표시하고, `ios/OverDrive/PrivacyInfo.xcprivacy:93-104`는 `NSPrivacyCollectedDataTypeUserID`를 linked로 표시한다.
  - `website/support.html:46-49`는 voice logging이 저장 전에 확인된다고 말하지만, `src/features/quicklog/QuickLogBar.tsx:76-83`은 transcription 후 즉시 `runSubmit(heard)`를 호출한다.
- What is wrong: policy, website, App Store guidance, native privacy manifest가 code와 동일한 processor, data field, linked status, voice-save behavior를 설명하지 않는다.
- Why it matters: health, audio, photo, optional leaderboard data는 민감하므로 개인정보 고지 불일치는 App Review와 사용자 신뢰 리스크다.
- Recommended fix: 코드 기준의 단일 data inventory를 만든다. `docs/compliance/privacy-policy.md`, `website/privacy.html`, `website/support.html`, `docs/launch/app-store-listing.md`, `PrivacyInfo.xcprivacy`를 맞춘다. CP, week gain, grade, optional region/crew, Groq photo processing, voice auto-save behavior를 명시적으로 고지하거나 제품 동작을 고지에 맞게 바꾼다.
- Confidence: High

### F-003: HealthKit authorization이 검사한 코드에서 사용하지 않는 민감 데이터 타입을 요청한다

- Severity: High
- Category: Security / Health Data
- Evidence:
  - `src/features/health/health.ts:15-23`은 `READ_TYPES`에 `HKQuantityTypeIdentifierActiveEnergyBurned`와 `HKQuantityTypeIdentifierHeartRate`를 포함한다.
  - `src/features/health/health.ts:27-32`는 `WRITE_TYPES`에 `HKQuantityTypeIdentifierLeanBodyMass`를 포함한다.
  - `src/features/health/health.ts:46-50`은 authorization에서 모든 read/write type을 요청한다.
  - `src/features/health/health.ts:127-141`은 workouts, body mass, body fat, VO2 max, resting heart rate를 읽지만 active energy 또는 heart rate를 읽지 않는다.
  - `src/features/health/InBodyScreen.tsx:43-44`는 `writeBodyComposition`을 통해 weight와 body-fat fraction만 쓰며 lean body mass를 쓰지 않는다.
  - `app.json:67-68`은 energy와 heart rate를 읽고 strength workout을 쓴다고 설명한다.
- What is wrong: 앱이 검사한 user-facing code에서 사용하는 범위보다 넓은 HealthKit read/write access를 요청한다.
- Why it matters: HealthKit review는 minimum necessary permission을 기대한다. Health data over-request는 rejection risk를 높이고 privacy posture를 약화한다.
- Recommended fix: 실제 visible feature에서 사용하지 않는 HealthKit identifier는 authorization에서 제거한다. 또는 해당 feature를 구현하고 문서화한 뒤 요청한다. usage string과 privacy disclosure를 최종 permission set과 함께 유지한다.
- Confidence: High

## Medium-Priority Issues

### F-004: 여러 SQLite write repository가 실패를 삼켜 silent data loss 또는 optimistic UI 불일치를 만든다

- Severity: Medium
- Category: Data Integrity / UX
- Evidence:
  - `src/db/repos/foodRepo.ts:22-33`은 `addFoodItems`에서 모든 error를 catch하고 no-op한다.
  - `src/features/food/FoodCard.tsx:51-55`는 `addFoodItems`를 await한 뒤 input을 지우고 reload하며, 실패 신호를 받지 않는다.
  - `src/db/repos/disciplineRepo.ts:30-40`은 `setDisciplineToday`에서 모든 error를 catch하고 no-op한다.
  - `src/features/discipline/DisciplineCard.tsx:45-64`는 local state를 optimistic toggle하고 자체 `catch`에서만 rollback하지만, repository error가 전파되지 않는다.
  - `src/db/repos/dailyGoalRepo.ts:61-75`는 `addTarget`에서 모든 error를 catch하고, `src/db/repos/dailyGoalRepo.ts:98-117`은 `addProgress` 실패 시 `{ progress: 0, done: false }`를 반환한다.
- What is wrong: pre-migration dev window를 견디려는 repository method가 실제 production failure까지 모두 삼킨다.
- Why it matters: 사용자가 food log, discipline toggle, daily-goal change를 저장 실패 상태로 잃어도 명확한 에러를 보지 못한다. Optimistic UI가 durable write 없이 성공처럼 보일 수 있다.
- Recommended fix: catch 범위를 알려진 missing-table migration case로 좁히거나 명시적인 `{ ok, error }` result를 반환한다. 실제 write failure는 UI가 rollback하고 error를 보여주도록 전파한다. 실패 write 테스트를 추가한다.
- Confidence: High

### F-005: HealthKit workout export가 부정확한 workout metadata를 쓸 수 있다

- Severity: Medium
- Category: Health Data / Correctness
- Evidence:
  - `src/db/repos/sessionRepo.ts:16-20`은 session `date`, `day_type`, `started_at`을 저장한다.
  - `src/features/forge/useForge.ts:30-33`과 `47-50`은 open session을 resume하지만, `src/features/forge/sessionStore.ts:52-60`은 persisted `workout_session.started_at` 대신 `Date.now()`를 resumed `startedAt`으로 설정한다.
  - `src/features/forge/useForge.ts:61-62`는 `new Date(st.startedAt)`와 `new Date()`로 HealthKit workout을 쓴다.
  - `src/features/health/health.ts:56-63`은 session day type 또는 cardio modality와 무관하게 항상 `WorkoutActivityType.traditionalStrengthTraining`을 저장한다.
- What is wrong: resume된 session은 축소된 start time으로 export되고, cardio session도 traditional strength training으로 export될 수 있다.
- Why it matters: 앱이 부정확한 health record를 쓸 수 있으며, 이는 실제/정확한 data만 HealthKit에 쓰겠다는 프로젝트 자체 HealthKit compliance rule과 충돌한다.
- Recommended fix: resume 시 persisted `started_at`을 session state로 전달한다. HealthKit export 전에 completed session row를 읽는다. `day_type` 또는 logged cardio modality로 HealthKit activity type을 선택한다. 정확히 표현할 수 없는 session은 export를 건너뛰는 방안도 고려한다.
- Confidence: High

### F-006: Worker 저장소에 D1 `rank_entry` 스키마와 migration이 없다

- Severity: Medium
- Category: Deployment / API
- Evidence:
  - `worker/src/index.js:271-279`, `299-319`는 `rank_entry`라는 D1 table을 읽고 쓴다.
  - `worker/wrangler.toml:15-18`은 D1 database binding을 설정한다.
  - `find worker -maxdepth 3 -type f -not -path '*/node_modules/*' -print` 결과는 `worker/README.md`, `worker/package.json`, `worker/wrangler.toml`, `worker/src/index.js`뿐이었다.
  - `worker/README.md:10-16`의 deploy step은 D1 schema를 만들거나 migrate하지 않는다.
- What is wrong: Worker가 사용하는 D1 table schema가 version-controlled Worker file만으로 재현되지 않는다.
- Why it matters: 새 환경, CI deploy, disaster recovery restore에서 `/rank/*`가 runtime failure를 내는 Worker를 배포할 수 있다.
- Recommended fix: `rank_entry`용 versioned D1 migration SQL을 추가한다. `wrangler d1 migrations apply`를 문서화한다. `/rank/submit`, `/rank/board` idempotent smoke command를 추가하고 schema change를 Worker code change와 함께 유지한다.
- Confidence: High

### F-007: production dependency audit에 test stack이 포함되고 high/moderate advisory가 보고된다

- Severity: Medium
- Category: Dependency Security
- Evidence:
  - `package.json:35`는 `jest-expo`를 `dependencies`에 둔다. 다른 test package는 `package.json:49-56`의 `devDependencies`에 있다.
  - `npm audit --omit=dev`는 13개 vulnerability로 실패했다: high 1개(`form-data` CRLF injection), moderate 12개.
  - `npm ls form-data js-yaml uuid`는 `form-data@4.0.5`가 `jest-expo -> jest-environment-jsdom -> jsdom` 경로에 있고, `js-yaml@3.14.2`가 `jest-expo` 경로에 있으며, `uuid@7.0.3`이 `expo-splash-screen -> @expo/config-plugins -> xcode` 경로에 있음을 보여줬다.
- What is wrong: test tooling이 production dependency tree에 포함되어 있고 production audit이 현재 실패한다.
- Why it matters: 실제 runtime에서 취약 경로가 test-only라 하더라도 release dependency surface가 커지고 security gate를 막을 수 있다.
- Recommended fix: `jest-expo`를 `devDependencies`로 옮긴다. Expo 호환 upgrade 경로로 advisory를 해결한다. lockfile 변경 후 `npm audit --omit=dev`와 전체 테스트를 다시 실행한다.
- Confidence: High

### F-008: `expo-dev-client`와 dev menu pod가 production dependency/native tree에 남아 있다

- Severity: Medium
- Category: Deployment / Release Readiness
- Evidence:
  - `package.json:17`은 app dependencies에 `expo-dev-client`를 포함한다.
  - `rg -n "expo-dev-client|expo-dev-launcher|expo-dev-menu" ...`로 확인한 `ios/Podfile.lock`에는 `expo-dev-client`, `expo-dev-launcher`, `expo-dev-menu`, `expo-dev-menu-interface` entry가 있다.
  - `ios/Podfile.properties.json:3`은 `EX_DEV_CLIENT_NETWORK_INSPECTOR`를 `true`로 설정한다.
  - `docs/app-store-launch-checklist.md:49-53`은 final archive 전에 `expo-dev-client`를 제거하거나 의도적으로 정당화하라고 명시한다.
- What is wrong: launch doc이 final archive gate로 표시한 development client/native dev menu component가 dependency와 pod graph에 남아 있다.
- Why it matters: submitted archive에 dev tooling이 포함되면 binary surface가 커지고 App Review 또는 release runtime 리스크가 생긴다.
- Recommended fix: release target에서 `expo-dev-client`를 제거하고 native pods를 재생성한다. archived plist와 binary에 dev launcher/menu/network inspector entry가 없는지 확인한다. 유지해야 한다면 release-safe justification을 문서화한다.
- Confidence: High

## Low-Priority Issues

### F-009: Worker package에 lockfile이 없어 Worker audit과 재현 가능한 install을 검증할 수 없다

- Severity: Low
- Category: Operations / Reproducibility
- Evidence:
  - `worker/package.json:5-10`은 `wrangler`를 dev dependency로 정의한다.
  - `find worker -maxdepth 2 -name 'package-lock.json' -o -name 'npm-shrinkwrap.json' -o -name 'yarn.lock' -o -name 'pnpm-lock.yaml'`는 파일을 찾지 못했다.
  - `npm audit --prefix worker --omit=dev`는 `ENOLOCK`으로 실패했다.
- What is wrong: Worker dependency resolution이 독립적으로 고정되어 있지 않고 Worker package audit을 실행할 수 없다.
- Why it matters: machine과 date에 따라 deploy dependency가 drift할 수 있다.
- Recommended fix: controlled package-manager operation으로 Worker lockfile을 생성해 commit하거나, Worker를 root workspace에 포함해 shared lockfile로 관리한다.
- Confidence: High

### F-010: root README가 setup, verification, deployment onboarding에 너무 빈약하다

- Severity: Low
- Category: Maintainability / Documentation
- Evidence:
  - `README.md:1-3`은 프로젝트명과 한 문장 설명만 포함한다.
  - setup detail은 `worker/README.md`, `.env.example`, launch docs 등 다른 곳에 있지만 root entry point가 링크하지 않는다.
- What is wrong: 새 contributor 또는 release operator가 root README에서 install, test, environment, Worker, HealthKit, release command를 발견할 수 없다.
- Why it matters: 운영 지식이 흩어져 onboarding과 release risk가 커진다.
- Recommended fix: root quickstart를 추가한다. prerequisites, `npm run typecheck`, `npm run lint`, `npm test -- --runInBand`, Expo run command, `.env.example`, Worker deploy/migration link, release checklist link를 포함한다.
- Confidence: High

## Product Completeness Review

검사한 앱은 onboarding, program generation/editing, active workout logging, QuickLog text/voice, food logging, daily goals, discipline, arena/rankings, evolution images, settings, HealthKit sync, static support/privacy page를 포함하는 넓은 local fitness loop를 제공한다.

확인된 product gap:

- public launch는 아직 준비되지 않았다. launch docs는 trademark clearance, privacy labels, dev-client removal, production Worker verification, signed real-device dogfood, store assets를 필수 gate로 남겨두고 있다(`docs/app-store-launch-checklist.md:24-83`).
- voice support copy는 저장 전 confirmation이 있다고 말하지만(`website/support.html:46-49`), 검사한 app은 transcription 후 auto-save한다(`src/features/quicklog/QuickLogBar.tsx:76-83`).

검사한 증거에서 그 외 concrete product-completeness issue는 확인되지 않았다.

## Architecture Review

앱의 module boundary는 이해하기 쉽다. `src/db`는 local persistence, `src/features`는 domain feature, `src/stores`는 Zustand state, `src/app`은 route, `worker/`는 server-side AI/ranking proxy 역할을 맡는다. SQLite 접근은 대부분 parameterized query를 사용하고 feature repository가 SQL을 UI component에서 분리한다.

확인된 architecture risk는 F-004, F-006, F-009다. 가장 큰 architecture boundary concern은 Worker가 인증 또는 migration layer 없이 expensive AI proxy와 public leaderboard API 역할을 동시에 하고 있다는 점이다.

## Security Review

확인된 security/compliance issue는 F-001, F-002, F-003, F-007, F-008이다.

긍정적 증거:

- 검사한 source에서 client API key는 발견되지 않았다. `.env.example:1-7`은 `EXPO_PUBLIC_*`가 non-secret이고 LLM key는 Worker secret에만 있다고 설명한다.
- 검사한 local SQLite repository query는 dynamic value에 parameterized `?` binding을 사용한다.
- `app.json:13-15`는 `ITSAppUsesNonExemptEncryption`을 false로 설정하고, `app.json:46-71`은 audio, photos, HealthKit usage string을 제공한다.

검사한 source에서 hardcoded API secret value issue는 확인되지 않았다.

## Data and API Review

local SQLite schema는 `src/db/schema.ts`에 명시되어 있고 versioned이다. `migrateDbIfNeeded`는 open 시 foreign key를 켠다(`src/db/migrate.ts:18-20`). exercise seed는 idempotent다(`src/db/migrate.ts:50-52`, `src/db/seed.ts:57-68`).

확인된 data/API issue는 F-004, F-005, F-006이다.

Assumption: remote D1 schema가 이미 있을 수 있지만, repository file 또는 remote Cloudflare state로 검증하지 않았다.

## Frontend and UX Review

앱은 여러 중요 화면에 loading/error/empty state를 포함한다. 예: Active Workout loading/load-failed/empty/missing state(`src/features/workout/ActiveWorkoutCard.tsx:477-499`), ranking empty/offline state(`src/features/rank/RankSection.tsx:146-147`). 많은 control에 accessibility label/role이 있다.

확인된 UX issue:

- F-004는 failed write 후 input이 지워지거나 optimistic toggle이 유지될 수 있는 silent failure path를 만든다.
- F-002에는 voice confirmation에 관한 support-page mismatch가 포함된다.

이 리뷰는 repository-only review였고 simulator/browser UI를 실행하지 않았으므로 full visual/responsiveness verification은 수행하지 않았다.

## Testing Review

검증 결과:

- `npm run typecheck`: 통과.
- `npm run lint`: 통과.
- `npm test -- --runInBand`: 통과, 19 suites / 137 tests.

확인된 testing gap:

- `worker/package.json:5-7`에는 Worker route test script가 없고, 검사한 test inventory에서 Worker test file을 찾지 못했다.
- F-004 write-failure behavior는 검사한 증거에서 test coverage가 확인되지 않았다.
- F-006 D1 migration/deploy smoke는 repository evidence에서 확인되지 않았다.

추천 test:

- Worker request validation, auth rejection, JSON normalization, D1 rank behavior unit test.
- SQLite write failure를 simulate하고 visible error 또는 rollback을 assert하는 repository/UI test.
- session start time과 activity type selection에 대한 HealthKit export mapping test.

## Performance and Scalability Review

확인된 scalability risk:

- F-001: 공개 무인증 expensive endpoint는 abuse될 수 있다.
- Worker upload path는 provider call 전에 전체 file을 memory와 base64 string으로 읽는다(`worker/src/index.js:189-192`, `369-372`). 검사한 app-level size check는 없다.
- D1 leaderboard는 user score보다 큰 row count로 rank를 계산한다(`worker/src/index.js:311-315`). 작은 dogfood data에는 가능하지만 public scale 전 index와 load test가 필요하다.

테스트 또는 검사한 코드에서 concrete local-app performance issue는 확인되지 않았다.

## Deployment and Operations Review

확인된 deployment/ops issue는 F-001, F-006, F-008, F-009이다.

추가 증거:

- `eas.json:27-31`에는 App Store Connect ID와 absolute local key path(`/Users/daeseonyoo/.secrets/...`)가 있다. private key 자체는 commit되어 있지 않지만 path는 machine-specific이다.
- `docs/app-store-launch-checklist.md:55-58`은 production Worker endpoint 확인이 아직 필요하다고 말한다.

추천 operational addition:

- typecheck/lint/test/audit CI job.
- Worker migration/apply/smoke workflow.
- dev-client removal과 final privacy metadata를 검증하는 release archive checklist.

## Maintainability Review

확인된 maintainability issue는 F-006, F-009, F-010이다.

긍정적 증거:

- TypeScript strict mode가 켜져 있다(`tsconfig.json:3-4`).
- 핵심 알고리즘에는 colocated test가 있다.
- settings persistence는 `src/stores/settingsStore.ts:31-39`에서 명시적 success/failure API를 제공한다. 이 패턴은 다른 repository로 확장할 가치가 있다.

위 finding 외에 broad duplication 또는 unreadable module-boundary issue는 확인되지 않았다.

## Recommended Fix Plan

public production/App Review 전 must fix:

1. Worker security 수정: auth/token, rate limit, upload limit, abuse logging, ranking write protection.
2. privacy policy, website, App Store listing guidance, `PrivacyInfo.xcprivacy`를 실제 code data flow와 맞춘다.
3. HealthKit permission을 실제 구현된 visible feature로 줄인다.
4. `expo-dev-client`를 제거하거나 release gate로 명시하고 final archive를 검증한다.
5. Worker D1 migration과 production smoke test를 추가한다.
6. Apple Health에 쓰기 전에 HealthKit workout export metadata를 수정한다.

soon fix:

1. 실제 SQLite write failure를 삼키지 말고 UI에 error를 표시한다.
2. test-only package를 production dependency에서 제거하고 audit advisory를 해결한다.
3. Worker lockfile 또는 workspace 관리를 추가한다.
4. Worker route test와 write-failure UI test를 추가한다.

later improvement:

1. root README를 runnable quickstart로 확장한다.
2. audit, Worker deploy check, privacy-manifest consistency를 CI에 추가한다.
3. Worker error, quota, latency, abuse에 대한 public-launch observability를 추가한다.

## Assumptions and Not Verified

- Not verified: 배포된 Worker URL 동작, Cloudflare secrets, Cloudflare rate-limit setting, remote D1 schema.
- Not verified: App Store Connect privacy nutrition label 또는 제출된 native privacy manifest.
- Not verified: 실제 디바이스 HealthKit 동작 또는 런타임에서의 정확한 HealthKit unit semantics.
- Not verified: visual layout, screen reader accessibility behavior, device responsiveness.
- Not verified: `.env` 내용. local secret/config file은 의도적으로 읽지 않았다.
- Assumption: `claude_review/`가 존재할 수 있지만 제외했고 사용하지 않았다.
- Assumption: `npm audit` advisory는 runtime practice에서 일부 path가 development/test-only일 수 있어도 release gate 관점에서는 관련성이 있다.

## Commands Run

보고서 생성 전 실행한 read-only inspection 및 verification command:

| Command | Purpose | Result |
|---|---|---|
| `pwd` | 저장소 path 확인 | Passed |
| `git branch --show-current` | 브랜치 기록 | Passed |
| `git rev-parse HEAD` | HEAD commit 기록 | Passed |
| `git status --short -- . ':!claude_review/**'` | `claude_review/` 제외 작업 트리 상태 기록 | Passed |
| `find . -path './claude_review' -prune -o -maxdepth 2 -type d -print` | `claude_review/` pruning 후 상위 디렉터리 파악 | Passed |
| `rg --files -g '!claude_review/**'` | `claude_review/` 제외 file inventory | Passed |
| `nl -ba package.json` | root package script/dependency 검사 | Passed |
| `nl -ba app.json` | Expo app config와 permission 검사 | Passed |
| `nl -ba eas.json` | EAS submit/build config 검사 | Passed |
| `nl -ba README.md` | root docs 검사 | Passed |
| `nl -ba jest.config.js` | test config 검사 | Passed |
| `nl -ba eslint.config.js` | lint config 검사 | Passed |
| `nl -ba tsconfig.json` | TypeScript config 검사 | Passed |
| `nl -ba worker/package.json` | Worker package 검사 | Passed |
| `nl -ba worker/src/index.js` | Worker route 검사 | Passed |
| `nl -ba worker/wrangler.toml` | Worker deployment binding 검사 | Passed |
| `nl -ba worker/README.md` | Worker docs 검사 | Passed |
| `nl -ba src/features/quicklog/parseEntryAI.ts` | AI parse client 검사 | Passed |
| `nl -ba src/features/food/parseFoodAI.ts` | food AI client 검사 | Passed |
| `nl -ba src/features/rank/rankClient.ts` | rank client 검사 | Passed |
| `nl -ba src/features/evolution/evolveClient.ts` | evolution client 검사 | Passed |
| `nl -ba src/features/quicklog/config.ts` | public endpoint config 검사 | Passed |
| `nl -ba src/db/schema.ts` | SQLite schema 검사 | Passed |
| `nl -ba src/db/migrate.ts` | migration 검사 | Passed |
| `nl -ba src/db/seed.ts` | seed data 검사 | Passed |
| `nl -ba src/db/uuid.ts` | ID generation 검사 | Passed |
| `nl -ba src/db/repos/setLogRepo.ts` | set repo 검사 | Passed |
| `nl -ba src/db/repos/cardioRepo.ts` | cardio repo 검사 | Passed |
| `nl -ba src/db/repos/userRepo.ts` | user repo 검사 | Passed |
| `nl -ba src/db/repos/foodRepo.ts` | food repo 검사 | Passed |
| `nl -ba src/features/food/FoodCard.tsx` | food UI flow 검사 | Passed |
| `nl -ba src/features/quicklog/useQuickLog.ts` | QuickLog flow 검사 | Passed |
| `nl -ba src/features/quicklog/QuickLogBar.tsx` | voice/text QuickLog UI 검사 | Passed |
| `nl -ba src/features/quicklog/transcribe.ts` | transcription client 검사 | Passed |
| `nl -ba src/features/logging/SetLoggerSheet.tsx` | manual set logger 검사 | Passed |
| `nl -ba src/features/logging/CardioLoggerSheet.tsx` | cardio logger 검사 | Passed |
| `nl -ba src/features/logging/useLogSet.ts` | set hot path 검사 | Passed |
| `nl -ba src/features/logging/useLogCardio.ts` | cardio hot path 검사 | Passed |
| `nl -ba src/features/forge/useForge.ts` | session lifecycle 검사 | Passed |
| `nl -ba src/features/forge/sessionStore.ts` | session state 검사 | Passed |
| `nl -ba src/db/repos/sessionRepo.ts` | session repo 검사 | Passed |
| `nl -ba src/db/repos/combatPowerRepo.ts` | Combat Power persistence 검사 | Passed |
| `nl -ba src/db/repos/powerEventRepo.ts` | power event repo 검사 | Passed |
| `nl -ba src/features/health/health.ts` | HealthKit access 검사 | Passed |
| `nl -ba src/features/health/useHealth.ts` | HealthKit store flow 검사 | Passed |
| `nl -ba src/features/health/InBodyScreen.tsx` | body composition UI 검사 | Passed |
| `nl -ba src/features/health/types.ts` | health data type 검사 | Passed |
| `nl -ba docs/compliance/health-data.md` | health compliance docs 검사 | Passed |
| `nl -ba docs/compliance/privacy-policy.md` | privacy policy 검사 | Passed |
| `nl -ba src/features/rank/RankSection.tsx` | ranking UI flow 검사 | Passed |
| `nl -ba src/features/arena/ArenaCard.tsx` | arena UI 검사 | Passed |
| `nl -ba src/features/arena/useArena.ts` | arena state 검사 | Passed |
| `nl -ba src/features/arena/weeklyBoss.ts` | weekly boss logic 검사 | Passed |
| `nl -ba src/features/arena/rival.ts` | rival logic 검사 | Passed |
| `nl -ba src/stores/settingsStore.ts` | settings persistence 검사 | Passed |
| `nl -ba src/lib/settings.ts` | settings parsing 검사 | Passed |
| `nl -ba src/app/_layout.tsx` | root layout/bootstrap 검사 | Passed |
| `nl -ba src/features/boot/Boot.tsx` | boot hydration 검사 | Passed |
| `nl -ba src/app/(tabs)/settings.tsx` | settings route 검사 | Failed, shell path glob 미인용 |
| `nl -ba src/app/(tabs)/_layout.tsx` | tabs layout 검사 | Failed, shell path glob 미인용 |
| `nl -ba 'src/app/(tabs)/settings.tsx'` | settings route 검사 | Passed |
| `nl -ba 'src/app/(tabs)/_layout.tsx'` | tabs layout 검사 | Passed |
| `nl -ba 'src/app/(tabs)/index.tsx'` | Today route 검사 | Passed |
| `nl -ba 'src/app/(tabs)/power.tsx'` | Power route 검사 | Passed |
| `nl -ba 'src/app/(tabs)/history.tsx'` | History route 검사 | Passed |
| `nl -ba src/app/plan.tsx` | plan route 검사 | Passed |
| `nl -ba src/app/program.tsx` | program route 검사 | Passed |
| `nl -ba src/app/inbody.tsx` | InBody route 검사 | Passed |
| `nl -ba src/features/program/ProgramEditorScreen.tsx` | program editor 검사 | Passed |
| `nl -ba src/features/program/AutoPlanScreen.tsx` | auto plan flow 검사 | Passed |
| `nl -ba src/features/program/useProgram.ts` | program resolution hook 검사 | Passed |
| `nl -ba src/features/program/generate.ts` | plan generation 검사 | Passed |
| `nl -ba src/features/program/resolve.ts` | program resolver 검사 | Passed |
| `nl -ba src/features/program/defaultProgram.ts` | default program 검사 | Passed |
| `nl -ba src/features/program/types.ts` | program type 검사 | Passed |
| `nl -ba src/features/workout/ActiveWorkoutCard.tsx` | active workout UI 검사 | Passed |
| `rg --files ... | rg '\.test\.(ts|tsx)$'` | generated/dependency/review dir 제외 test inventory | Passed |
| `rg -n "TODO|FIXME|HACK|XXX|not implemented|Phase [0-9]|before launch|launch" ...` | known issue comment/docs 검색 | Passed, tool output truncated |
| `rg -n "EXPO_PUBLIC|API_KEY|SECRET|TOKEN|password|authorization|Bearer|endpoint|workers.dev|GROQ|GEMINI|D1|database_id" ...` | secret/config/security-sensitive string 검색 | Passed |
| `rg -n "catch ..."` | error-swallowing path 검색 | Passed |
| `rg -n "Alert\.alert|accessibilityLabel|accessibilityRole|KeyboardAvoiding|SafeArea|TextInput|Pressable" src ...` | UX/accessibility signal 검사 | Passed |
| `npm run typecheck` | TypeScript 검증 | Passed |
| `npm run lint` | lint 검증 | Passed |
| `npm test -- --runInBand` | Jest 검증 | Passed, 19 suites / 137 tests |
| `npm audit --omit=dev` | root production dependency audit | Failed, vulnerability 발견 |
| `npm audit --prefix worker --omit=dev` | Worker audit | Failed, Worker lockfile 없음 |
| `npm ls form-data js-yaml uuid` | audit dependency path 추적 | Passed |
| `npm ls --prefix worker wrangler` | Worker dependency resolution 검사 | Passed |
| `find worker -maxdepth 2 -name ...lock...` | Worker lockfile 존재 확인 | Passed, lockfile 없음 |
| `find . ... -name '.env*' -print` | `.env`를 읽지 않고 env example 존재 확인 | Passed |
| `nl -ba .gitignore` | ignore rule 검사 | Passed |
| `nl -ba .env.example` | env example 검사 | Passed |
| `nl -ba docs/app-store-launch-checklist.md` | launch checklist 검사 | Passed |
| `nl -ba docs/launch/app-store-listing.md` | App Store listing guidance 검사 | Passed |
| `nl -ba website/privacy.html` | public privacy page 검사 | Passed |
| `nl -ba website/support.html` | support page 검사 | Passed |
| `nl -ba website/index.html` | marketing page 검사 | Passed |
| `find ios ... -name 'PrivacyInfo.xcprivacy' -print` | iOS privacy manifest 위치 확인 | Passed |
| `nl -ba ios/OverDrive/PrivacyInfo.xcprivacy` | privacy manifest 검사 | Passed |
| `plutil -p ios/OverDrive/Info.plist` | iOS plist 검사 | Passed |
| `plutil -p ios/OverDrive/PrivacyInfo.xcprivacy` | privacy manifest parse | Passed |
| `find ios -maxdepth 2 -name 'Podfile*' -print` | iOS pod config 위치 확인 | Passed |
| `nl -ba ios/Podfile` | Podfile 검사 | Passed |
| `rg -n "expo-dev-client|expo-dev-launcher|expo-dev-menu|EXDev|DevLauncher|DevMenu" ...` | dev-client/native dev menu 존재 확인 | Passed |
| `nl -ba ios/Podfile.properties.json` | pod properties 검사 | Passed |
| `rg -n "rank_entry|CREATE TABLE|migrations|D1|wrangler d1" worker docs content src ...` | D1 schema/migration evidence 확인 | Passed |
| `find worker -maxdepth 3 -type f -not -path '*/node_modules/*' -print` | Worker versioned file set 확인 | Passed |
| `find . ... \( -name '*schema*' -o -name '*migration*' -o -name '*.sql' \) -print` | schema/migration/SQL file 검색 | Passed |
| `date '+%Y-%m-%d-%H%M %Y-%m-%d %H:%M:%S %Z'` | output timestamp 생성 | Passed |
| `ls codex_review/full` | output directory collision 확인 | Passed |
| `mkdir -p codex_review/full/2026-07-02-1817` | review output directory 생성 | Passed |
| `find codex_review/full/2026-07-02-1817 -maxdepth 1 -type f -print` | 두 report file 존재 검증 | Passed |
| `rg -n '^### F-[0-9]{3}|\| F-[0-9]{3} \|' codex_review/full/2026-07-02-1817/comprehensive-review.en.md` | English finding ID와 summary 검증 | Passed |
| `rg -n '^### F-[0-9]{3}|\| F-[0-9]{3} \|' codex_review/full/2026-07-02-1817/comprehensive-review.ko.md` | Korean finding ID와 summary 검증 | Passed |
| `rg -n 'Evidence:|src/|worker/|docs/|website/|ios/|package.json|README.md|npm audit|npm test|npm run' codex_review/full/2026-07-02-1817/comprehensive-review.en.md` | English report evidence reference 검증 | Passed |
| `rg -n 'Evidence:|src/|worker/|docs/|website/|ios/|package.json|README.md|npm audit|npm test|npm run' codex_review/full/2026-07-02-1817/comprehensive-review.ko.md` | Korean report evidence reference 검증 | Passed |
| `git status --short -- . ':!claude_review/**'` | `claude_review/` 제외 final repository status 확인 | Passed |
| `git status --short -- codex_review/full/2026-07-02-1817` | review-created path scope 확인 | Passed |

## Files Inspected

주요 검사 파일/디렉터리:

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

명시적으로 검사하지 않은 것: `claude_review/` 하위 모든 파일.
