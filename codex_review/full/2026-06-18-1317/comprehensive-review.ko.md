# Codex Comprehensive Repository Review

## Review Metadata

- 리뷰 일시: 2026-06-18 13:17 EDT (America/Toronto)
- Git 브랜치: `main`
- HEAD 커밋: `d15d747f3893dc9715c43267ab89525fdab196e7`
- 리뷰 시작 시 working tree 상태: 이 리뷰 전부터 dirty 상태였습니다. 기존 수정/미추적 경로에는 `docs/troubleshooting.md`, `src/` 아래 여러 파일, `worker/src/index.js`, `src/features/theme/`가 포함되어 있었습니다.
- 생성된 출력 디렉터리: `codex_review/full/2026-06-18-1317/`
- 리뷰 유형: 사용자가 요청한 전체 저장소 검증 리뷰입니다. 자동 주간/월간 리뷰 주기 여부는 확인되지 않았습니다.
- 독립성: `claude_review/`는 읽거나, 검사하거나, 요약하거나, 비교하거나, 증거로 사용하지 않았습니다.

## Review Scope

`claude_review/`와 기존 `codex_review/` 산출물을 제외하고, 저장소 소스 코드, 설정, 문서, 테스트, git 메타데이터, 명령 실행 결과를 검사했습니다. Expo React Native 앱, 로컬 SQLite 스키마와 저장소, HealthKit 연동, AI 프록시 클라이언트, Cloudflare Worker, D1 리더보드 코드, i18n 파일, 문서, 테스트, 패키지/보안 메타데이터를 범위에 포함했습니다.

검사하지 않은 항목: `claude_review/`, `.env` 같은 로컬 비밀 파일, 실제 Cloudflare 계정 설정, 앱스토어 대시보드, 실제 기기 HealthKit 동작, 외부 프로덕션 로그, 생성된 네이티브 빌드 산출물. 의존성 설치는 하지 않았고 소스 파일도 수정하지 않았습니다.

## Executive Summary

이 프로젝트는 로컬 dogfooding 및 Phase 1 성격의 반복 개발에는 부분적으로 준비된 상태로 보입니다. `npm run typecheck`, `npm test -- --runInBand`, `npm run lint`, locale key parity 검사는 통과했습니다. 하지만 검사된 증거 기준으로 공개 프로덕션 출시는 준비되지 않았습니다.

가장 큰 차단 요소는 인증 없는 공개 Worker 엔드포인트, 구현된 오프디바이스 AI/리더보드 흐름과 맞지 않는 개인정보/컴플라이언스 문구, 과도한 HealthKit 권한 요청, 공개 브랜드/앱 식별자 준비 부족입니다. 현재 저장소 문서는 Worker를 dogfooding 전용으로 설명하므로 Critical은 보고하지 않았습니다. 동일 엔드포인트가 통제 없이 공개 출시된다면 CDX-001은 Critical로 상향해야 합니다.

## Project Overview

저장소는 `OverDrive`라는 Expo SDK 56 / React Native 앱입니다. 운동 기록, 음식/단백질 기록, 일일 목표, 체성분, HealthKit 기반 피트니스 입력, 게임화된 Combat Power 점수를 다룹니다. Expo Router, `expo-sqlite` 기반 SQLite, Zustand store, i18next locale 파일, Skia/Reanimated UI 효과, AI 파싱/전사/음식/진화 이미지 생성 및 D1 리더보드를 위한 Cloudflare Worker를 사용합니다.

주요 검사 대상:

- `src/app/` 아래 모바일 앱 라우트
- `src/features/` 아래 기능 모듈
- `src/db/` 아래 SQLite 스키마와 repository
- `src/lib/`, `src/stores/` 아래 설정/상태 helper
- `worker/` 아래 Cloudflare Worker
- `docs/` 아래 문서
- Jest 테스트와 package script

## Key Findings Summary

| ID | Severity | Category | Title | Confidence |
|---|---|---|---|---|
| CDX-001 | High | Security / Operations | 공개 Worker 엔드포인트에 저장소 코드상 인증, rate limit, abuse control이 없음 | High |
| CDX-002 | High | Compliance / Privacy | 개인정보 문서와 사용자 노출 AI 문구가 구현된 오프디바이스 흐름과 맞지 않음 | High |
| CDX-003 | High | Health / Store Compliance | HealthKit이 현재 코드에서 사용하지 않는 read 권한을 요청함 | High |
| CDX-004 | High | Release / Brand | launch-blocking 브랜드 조사와 placeholder 식별자에도 앱이 여전히 `OverDrive`로 설정됨 | High |
| CDX-005 | Medium | Security / Product Integrity | D1 리더보드 점수가 전적으로 클라이언트 주장 값이라 조작이 쉬움 | High |
| CDX-006 | Medium | Data / Deployment | Worker D1 스키마를 versioned migration으로 재현할 수 없음 | High |
| CDX-007 | Medium | Database / Migrations | SQLite migration versioning이 순차 migration 의미를 건너뜀 | High |
| CDX-008 | Medium | Frontend / Accessibility | 재사용 control과 일일 목표 action에 accessible role/label이 부족함 | High |
| CDX-009 | Medium | Dependency Security | 현재 lockfile에서 `npm audit` 취약점이 해결되지 않음 | High |
| CDX-010 | Low | Documentation | 최상위 README가 setup, architecture, 운영 흐름을 문서화하지 않음 | High |

## Critical Issues

검사된 증거에서 Critical 이슈는 확인되지 않았습니다.

## High-Priority Issues

### CDX-001 - 공개 Worker 엔드포인트에 저장소 코드상 인증, rate limit, abuse control이 없음

- Severity: High
- Category: Security / Operations
- Evidence:
  - `worker/src/index.js:13-17`에서 CORS를 `access-control-allow-origin: '*'`, `POST, OPTIONS`, `content-type`으로 설정합니다.
  - `worker/src/index.js:413-423`은 POST 요청을 `/transcribe`, `/food`, `/rank/submit`, `/rank/board`, `/evolve`, 또는 기본 parse 처리로 라우팅하지만 auth/token 검사가 없습니다.
  - `worker/README.md:36-39`는 endpoint에 auth가 없으며 공개 출시 전에 Cloudflare Access 또는 per-user token을 추가하라고 명시합니다.
- What is wrong: Worker URL을 아는 누구나 AI, 전사, 이미지, D1 리더보드 엔드포인트를 호출할 수 있습니다. 저장소 코드에는 인증, per-user token, rate limit, request-size limit, abuse throttle이 없습니다.
- Why it matters: 공개 출시 시 Groq/Gemini quota, D1 write, 사진/오디오 업로드 경로가 abuse에 노출됩니다. 비용, 가용성, 개인정보, 리더보드 무결성 문제가 생길 수 있습니다.
- Recommended fix: Worker 요청에 per-install 또는 per-user 인증을 요구하고, Cloudflare WAF/rate limiting과 request body size limit을 추가하며, 유용한 범위에서 origin을 제한하고 endpoint abuse를 모니터링하십시오. 인증 없는 모드는 로컬 dogfooding에만 유지하십시오.
- Confidence: High

### CDX-002 - 개인정보 문서와 사용자 노출 AI 문구가 구현된 오프디바이스 흐름과 맞지 않음

- Severity: High
- Category: Compliance / Privacy
- Evidence:
  - `docs/compliance/privacy-policy-draft.md:17-23`은 Phase 1이 전적으로 on-device로 동작하고 backend upload가 없다고 설명합니다.
  - `docs/compliance/privacy-policy-draft.md:57`은 Phase 1에서 아무것도 off-device로 보내지 않고 third-party AI 서비스와 공유하지 않는다고 말합니다.
  - `docs/compliance/privacy-policy-draft.md:64-66`은 모든 앱 데이터가 로컬에 저장되고 server-side copy가 없다고 말합니다.
  - `docs/compliance/privacy-policy-draft.md:84`는 `[Settings -> Delete my data]`를 약속합니다. 그러나 `src/app/(tabs)/settings.tsx:86-260`의 settings 화면에는 language, units, profile, program, health, theme, juice, sound, weight step 섹션만 있고 delete-data action은 없습니다. delete/clear data 검색에서도 항목 단위 삭제와 privacy doc만 확인되었습니다.
  - 구현된 off-device 흐름에는 QuickLog text/catalog Worker 전송(`src/features/quicklog/parseEntryAI.ts:46-50`, `src/features/quicklog/useQuickLog.ts:87-94`), voice/audio 업로드(`src/features/quicklog/transcribe.ts:10-17`, `src/features/quicklog/QuickLogBar.tsx:75-83`), food text/photo 업로드(`src/features/food/parseFoodAI.ts:28-40`, `src/features/food/parseFoodAI.ts:44-52`, `src/features/food/FoodCard.tsx:79-90`, `src/features/food/FoodCard.tsx:105-112`), evolution photo 업로드(`src/features/evolution/evolveClient.ts:43-60`), Gemini image processing(`worker/src/index.js:389-399`), D1 leaderboard submission(`src/features/rank/rankClient.ts:34-39`, `src/features/rank/RankSection.tsx:65-74`)이 포함됩니다.
  - `src/i18n/locales/en.json:400`은 evolution photo가 "your own server only"를 통과한다고 말하지만, `worker/src/index.js:389-399`는 해당 이미지를 Gemini로 전달합니다.
- What is wrong: 개인정보 처리방침 초안과 앱 내 개인정보 문구가 구현된 네트워크 동작과 일치하지 않습니다.
- Why it matters: health-adjacent log, 사진, 오디오, 음식, AI 처리를 다루는 앱에서 부정확한 개인정보 고지는 store review, 법적 리스크, 신뢰, 사용자 동의 문제를 만들 수 있습니다.
- Recommended fix: beta/public release 전에 privacy policy와 앱 내 문구를 업데이트하십시오. Cloudflare Worker, Groq, Gemini, D1 리더보드, 데이터 범주, 목적, 보관, 삭제/동의 철회 control, opt-in 상태를 공개하십시오. 약속한 delete-data 흐름을 구현하거나 해당 약속을 제거하십시오.
- Confidence: High

### CDX-003 - HealthKit이 현재 코드에서 사용하지 않는 read 권한을 요청함

- Severity: High
- Category: Health / Store Compliance
- Evidence:
  - `src/features/health/health.ts:15-23`은 workouts, active energy burned, heart rate, resting heart rate, VO2 max, body mass, body fat percentage read 권한을 요청합니다.
  - `src/features/health/health.ts:127-141`은 workouts, body mass, body fat percentage, VO2 max, resting heart rate만 읽으며 active energy burned와 일반 heart rate는 읽지 않습니다.
  - `src/features/health/useHealth.ts:28-39`는 workouts, VO2 max, body mass, body fat percentage, sync time만 저장합니다.
  - `src/lib/settings.ts:41-49`도 같은 health field만 저장하며 active-energy 또는 heart-rate field가 없습니다.
  - `docs/compliance/health-data.md:12-14`와 `docs/compliance/health-data.md:55-60`은 실제 사용자 기능과 연결된 최소 필요 데이터만 요청해야 한다고 명시합니다.
- What is wrong: 권한 요청에 현재 코드 경로에서 사용하지 않는 health data type이 포함되어 있습니다.
- Why it matters: 과도한 HealthKit permission prompt는 app review 거절과 사용자 신뢰 저하를 유발할 수 있습니다.
- Recommended fix: 실제 기능과 저장 경로가 생기기 전까지 `HKQuantityTypeIdentifierActiveEnergyBurned`와 `HKQuantityTypeIdentifierHeartRate`를 read permission에서 제거하십시오. 또는 해당 기능을 구현하고 사용자 노출 permission copy를 업데이트하십시오.
- Confidence: High

### CDX-004 - launch-blocking 브랜드 조사와 placeholder 식별자에도 앱이 여전히 `OverDrive`로 설정됨

- Severity: High
- Category: Release / Brand
- Evidence:
  - `app.json:3-8`은 app name, slug, scheme을 `OverDrive` / `overdrive`로 설정합니다.
  - `app.json:10-13`은 iOS `bundleIdentifier`를 `com.anonymous.overdrive`로 설정합니다.
  - `app.json:14-22`에는 Android 설정이 있지만 Android `package`가 없습니다.
  - `docs/compliance/brand-availability.md:11-17`은 같은 카테고리의 `Overdrive Fitness` 충돌 때문에 consumer fitness app에서 `OverDrive`가 "NO-GO"라고 말합니다.
  - `docs/compliance/brand-availability.md:100-108`은 `OverDrive`를 공개 store-facing brand로 사용하지 말라고 권고합니다.
- What is wrong: Release configuration이 여전히 분쟁 소지가 있는 이름과 placeholder 식별자를 사용합니다.
- Why it matters: Store submission과 공개 출시에서 brand, trademark, app-store similarity, package identity 문제가 발생할 가능성이 높습니다.
- Recommended fix: clearance가 끝난 공개 브랜드를 선택하고 `app.json`의 name, slug, scheme, icon, iOS bundle identifier, Android package를 업데이트하십시오. domain/social을 확보하고 제출 전 법적 clearance를 받으십시오.
- Confidence: High

## Medium-Priority Issues

### CDX-005 - D1 리더보드 점수가 전적으로 클라이언트 주장 값이라 조작이 쉬움

- Severity: Medium
- Category: Security / Product Integrity
- Evidence:
  - `worker/src/index.js:254-280`은 caller가 제공한 `deviceId`, `handle`, `cp`, `weekGain`, `gradeKey`, `crew`, `region`을 받아 숫자 범위만 clamp한 뒤 caller 제공 `deviceId`로 upsert합니다.
  - `src/features/rank/rankClient.ts:21-40`은 score field를 클라이언트에서 직접 보냅니다.
  - `src/features/rank/RankSection.tsx:63-74`는 현재 score와 weekly gain을 클라이언트에서 계산해 제출합니다.
  - `src/features/rank/RankSection.tsx:18-22`와 `src/i18n/locales/en.json:414`는 Phase 1 점수가 self-reported이고 verification은 later라고 명시합니다.
- What is wrong: 리더보드에는 server-owned identity, signature, replay protection, server-side score derivation이 없습니다.
- Why it matters: 실제 공개 경쟁 기능처럼 보여줄 경우 ranking을 매우 쉽게 조작할 수 있습니다.
- Recommended fix: Phase 1 ranking을 명확히 self-reported로 유지하거나, 공개 competitive use 전에 signed submission, server-owned identity, replay protection, server-verified sync/log data 기반 score sanity check를 추가하십시오.
- Confidence: High

### CDX-006 - Worker D1 스키마를 versioned migration으로 재현할 수 없음

- Severity: Medium
- Category: Data / Deployment
- Evidence:
  - `worker/src/index.js:272`, `worker/src/index.js:301`, `worker/src/index.js:308`, `worker/src/index.js:312`는 `rank_entry` table을 query합니다.
  - `worker/wrangler.toml:15-18`은 D1 database `overdrive-rank`를 bind합니다.
  - `find worker -maxdepth 3 -type f -not -path '*/node_modules/*' -print` 결과 Worker source file은 `worker/README.md`, `worker/package.json`, `worker/wrangler.toml`, `worker/src/index.js`뿐이었습니다.
  - `rg -n "CREATE TABLE|CREATE INDEX|ALTER TABLE|DROP TABLE" worker -g '!node_modules/**'`는 match를 반환하지 않았습니다.
- What is wrong: Worker 코드가 요구하는 table이 저장소의 versioned schema 또는 migration으로 생성되지 않습니다.
- Why it matters: 새 환경을 source만으로 신뢰성 있게 재현할 수 없고, D1 schema drift가 `/rank/*` endpoint를 깨뜨릴 수 있습니다.
- Recommended fix: `CREATE TABLE rank_entry (...)`, index, 문서화된 `wrangler d1 migrations apply` 절차를 포함한 Cloudflare D1 migration(`worker/migrations/*.sql` 등)을 추가하십시오. migration presence를 확인하는 CI 또는 local check도 추가하십시오.
- Confidence: High

### CDX-007 - SQLite migration versioning이 순차 migration 의미를 건너뜀

- Severity: Medium
- Category: Database / Migrations
- Evidence:
  - `src/db/migrate.ts:21-42`는 version `0`과 version `1`만 처리한 뒤, 그 밖의 version mismatch를 곧바로 `DATABASE_VERSION`으로 설정합니다.
  - `src/db/migrate.ts:44-49`는 `MIGRATION_003`, `MIGRATION_004`, `MIGRATION_005`를 매 boot마다 idempotent additive migration으로 실행합니다.
  - `src/db/schema.ts:148-200`은 현재 migration들이 `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`임을 보여줍니다.
  - `src/db/migrate.ts:14-16`은 future migration을 version block으로 추가하고 shipped migration을 수정하지 말라고 설명합니다.
- What is wrong: 현재 version bump 방식은 skipped version을 가리고, 현재 후속 migration이 idempotent table creation이기 때문에만 안전합니다. 미래의 non-additive transform은 실행되지 않았는데 적용된 것으로 표시될 수 있습니다.
- Why it matters: 실제 사용자 데이터가 있는 future release에서 data integrity risk가 됩니다.
- Recommended fix: direct jump를 제거하고 `while (version < DATABASE_VERSION)`와 명시적 case로 migration N 실행 후 성공 시 `user_version`을 올리는 순차 실행으로 바꾸십시오. boot self-healing은 idempotent safety operation에만 유지하십시오.
- Confidence: High

### CDX-008 - 재사용 control과 일일 목표 action에 accessible role/label이 부족함

- Severity: Medium
- Category: Frontend / Accessibility
- Evidence:
  - `src/features/logging/Stepper.tsx:80-82`와 `src/features/logging/Stepper.tsx:110-112`는 `accessibilityRole`, `accessibilityLabel`, state 없이 minus/plus `Pressable` control을 렌더링합니다.
  - Stepper는 onboarding/settings/InBody/daily-goal 숫자 입력에 사용되며, 예를 들어 `src/app/(tabs)/settings.tsx:117-136`에서 사용됩니다.
  - `src/features/dailyGoals/DailyGoalsCard.tsx:27-29`의 add action에는 role/label이 없습니다.
  - `src/features/dailyGoals/DailyGoalsCard.tsx:43-45`는 goal label long-press 제거를 사용하지만 hint만 있고 명시적 role/label은 없습니다.
  - `src/features/dailyGoals/DailyGoalsCard.tsx:59-72`의 done/increment/check action에도 role/label이 없습니다.
- What is wrong: Screen reader가 핵심 control 의도를 안정적으로 안내할 수 없고, destructive remove action이 long-press 뒤에 숨겨져 있습니다.
- Why it matters: 접근성이 저하되고 assistive technology 사용자에게 일상 workflow가 어렵거나 불가능해질 수 있습니다.
- Recommended fix: "Decrease bodyweight", "Increase bodyweight", "Add daily goal", "Complete goal {label}", "Reset goal {label}" 같은 명시적 role과 label을 추가하십시오. 삭제에는 명시적 accessible remove control 또는 accessible action을 제공하십시오.
- Confidence: High

### CDX-009 - 현재 lockfile에서 `npm audit` 취약점이 해결되지 않음

- Severity: Medium
- Category: Dependency Security
- Evidence:
  - `npm audit --audit-level=moderate`가 실패했고 37개 취약점(36 moderate, 1 high)을 보고했습니다.
  - audit output은 high severity `form-data` CRLF injection(`form-data` 4.0.0-4.0.5)을 식별했습니다.
  - `npm ls form-data js-yaml uuid --all`은 `form-data@4.0.5`가 `jest-expo -> jest-environment-jsdom -> jsdom`을 통해, `js-yaml@3.14.2`가 Jest/Istanbul을 통해, `uuid@7.0.3`이 Expo config plugin / `xcode` dependency를 통해 들어오는 것을 보여줬습니다.
- What is wrong: Lockfile에 취약한 transitive package가 포함되어 있습니다.
- Why it matters: 확인된 노출은 모바일 runtime path보다는 주로 dev/test/build tooling으로 보이지만, production hardening 전에 high/moderate advisory는 추적하고 업데이트해야 합니다.
- Recommended fix: Expo-compatible dependency version으로 업데이트하십시오. audit이 breaking change를 제안하므로 `npm audit fix --force`를 무작정 실행하지 말고, Expo tooling 때문에 임시로 pin되는 항목은 exception으로 문서화하십시오.
- Confidence: High

## Low-Priority Issues

### CDX-010 - 최상위 README가 setup, architecture, 운영 흐름을 문서화하지 않음

- Severity: Low
- Category: Documentation
- Evidence:
  - `README.md:1-2`에는 title과 `OverDrive`만 있습니다.
  - `package.json:58-67`에는 실행 가능한 script가 있고 `worker/README.md:8-27`은 Worker deploy 기본을 설명하지만, app, worker, env var, test, production caveat를 연결하는 최상위 onboarding 문서가 없습니다.
- What is wrong: 신규 개발자/운영자가 root README만으로 system을 bootstrap하거나 review할 수 없습니다.
- Why it matters: Onboarding 비용이 커지고 release-critical caveat를 놓치기 쉬워집니다.
- Recommended fix: README를 stack overview, setup, environment variables, app/worker run command, D1 migration process, HealthKit requirements, test gates, public-launch caveats로 확장하십시오.
- Confidence: High

## Product Completeness Review

핵심 제품 표면은 넓습니다. Workout logging, AI QuickLog, food logging, daily goals, HealthKit sync, body composition entry, Combat Power, evolution image generation, arena, rankings가 소스 코드에 존재합니다. Typecheck, lint, unit/component test, locale parity도 통과했습니다.

확인된 product-readiness issue는 CDX-002와 CDX-004입니다. 개인정보/컴플라이언스 설명과 공개 브랜드 identity가 구현된 제품과 맞지 않습니다. 또한 privacy draft가 약속하는 in-app delete-data path는 settings 화면이나 저장소 검색에서 확인되지 않았습니다.

Not verified: 실제 기기 flow, app-store review behavior, HealthKit prompt, 네트워크 불량 상태의 image/audio upload UX, end-to-end mobile navigation.

## Architecture Review

저장소는 app, feature, database, store, UI, Worker boundary가 비교적 명확합니다. SQLite repository는 대부분의 persistence logic을 `src/db/repos/` 아래에 둡니다. Worker가 external AI key를 server-side에 중앙화하는 것은 secret handling boundary로 적절합니다.

의미 있는 architecture risk는 CDX-006과 CDX-007입니다. 모바일 database migration pattern은 현재 idempotent additive migration에는 동작하지만 future non-additive change에는 취약합니다. Worker는 저장소 migration으로 재현할 수 없는 D1 table을 사용합니다.

검사된 증거에서 module naming이나 circular dependency behavior 관련 구체적 이슈는 발견되지 않았습니다.

## Security Review

review directory를 제외한 tracked source/docs에 대한 secret-oriented search에서 committed API key value는 발견되지 않았습니다. `.env`는 `.gitignore`에 의해 ignore되고, `.env.example`에는 placeholder인 `EXPO_PUBLIC_QUICKLOG_ENDPOINT`만 있습니다.

확인된 security issue는 CDX-001, CDX-005, CDX-009입니다. Worker endpoint가 공개/무인증이고, leaderboard가 client-submitted score를 신뢰하며, dependency audit이 미해결 advisory를 보고했습니다.

Not verified: Cloudflare account-level WAF/rate limits, secret value, production DNS exposure, external logging/redaction behavior.

## Data and API Review

앱은 local SQLite를 schema/repository module과 함께 사용합니다. 현재 Jest coverage에는 여러 pure logic 영역과 적어도 하나의 component test가 포함됩니다. Worker는 AI parsing, transcription, food, rank, evolution을 위한 JSON/multipart endpoint를 노출합니다.

확인된 data/API issue는 CDX-006과 CDX-007입니다. D1 schema가 versioned source에 없고, mobile migration version semantics가 future migration을 잘못 applied로 표시할 수 있습니다.

현재 local SQLite table definition 자체에서 구체적 이슈는 발견되지 않았습니다.

## Frontend and UX Review

Frontend에는 많은 loading/error/empty state string과 localized UI key가 있습니다. English, Korean, Spanish, Chinese locale key parity는 통과했습니다.

확인된 UX/accessibility issue는 CDX-008입니다. 일부 핵심 Pressable control, 특히 Stepper와 daily goals에 accessibility metadata가 부족합니다. CDX-002의 product-copy mismatch도 UX에 영향을 줍니다. 사용자는 AI photo가 "your own server only"에 머문다고 안내받지만 Worker 코드는 Gemini로 전달합니다.

Not verified: 실제 기기 layout, simulator/device screen-reader behavior, visual regression screenshot, 모든 viewport에서의 responsiveness.

## Testing Review

통과한 명령:

- `npm run typecheck`
- `npm test -- --runInBand` (18 test suites, 128 tests)
- `npm run lint`
- `en`, `ko`, `es`, `zh` locale key parity script

검사된 증거 기준 test gap:

- Worker endpoint의 auth, bad payload, AI provider failure, D1 ranking behavior test가 발견되지 않았습니다.
- 기존 사용자 SQLite upgrade를 검증하는 migration integration test가 발견되지 않았습니다.
- custom Pressable control accessibility test가 발견되지 않았습니다.
- 실제 기기 HealthKit test는 실행하지 않았습니다.
- Production build/export command는 요청된 review output directory 밖에 artifact를 만들 수 있어 실행하지 않았습니다.

## Performance and Scalability Review

앱은 local-first storage를 사용하므로 core logging의 server scalability 요구는 제한적입니다. QuickLog와 food/evolution upload 같은 mobile code 일부에는 client-side timeout이 있습니다.

주요 scalability risk는 CDX-001입니다. 공개 무인증 Worker endpoint는 user-level throttling 없이 비용과 abuse가 커질 수 있습니다. D1 leaderboard에도 anti-abuse control이 부족합니다(CDX-005).

Not verified: bundle size, startup performance, Skia/Reanimated runtime performance, large table에서의 D1 query performance, Cloudflare Worker quota.

## Deployment and Operations Review

앱에는 start, platform run, lint, typecheck, test를 위한 Expo script가 있습니다. Worker에는 model var와 D1 binding이 있는 Wrangler config가 있습니다. `.env.example`은 mobile Worker endpoint placeholder를 문서화합니다.

확인된 deployment/operations issue는 CDX-001, CDX-004, CDX-006, CDX-009, CDX-010입니다. 공개 출시 전 Worker access control, brand/package 정리, D1 migration, dependency remediation/exception tracking, root-level setup/release documentation이 필요합니다.

TypeScript 또는 lint configuration에서 구체적 이슈는 발견되지 않았습니다.

## Maintainability Review

코드베이스는 대체로 feature concern을 분리하고 app data에 typed module을 사용합니다. 가장 큰 maintainability concern은 stylistic 문제가 아니라 missing Worker migration, README 부재, migration sequencing 같은 운영성 문제입니다.

이 리뷰에서는 광범위한 refactor를 권장하지 않습니다. 먼저 migration, Worker behavior, accessibility 주변에 좁은 범위의 change와 test로 확인된 risk를 고치십시오.

## Recommended Fix Plan

공개 production 또는 broad beta 전 must-fix:

1. CDX-001: Worker authentication, rate limiting, request size limit, abuse monitoring을 추가하십시오.
2. CDX-002: Privacy policy와 앱 내 privacy copy를 AI, photo/audio, food, D1 flow에 맞게 다시 작성하십시오. 약속한 delete-data flow를 추가하거나 제거하십시오.
3. CDX-003: HealthKit permission을 현재 feature usage에 맞게 줄이거나 active-energy/heart-rate 실제 사용을 구현하십시오.
4. CDX-004: clearance된 공개 브랜드를 선택하고 app identifier/package metadata를 업데이트하십시오.
5. CDX-006: Versioned D1 migration을 추가하고 문서화/적용하십시오.
6. CDX-009: Expo-compatible version으로 dependency advisory를 해결하거나 명시적으로 추적하십시오.

다음으로 수정할 항목:

1. CDX-005: Leaderboard integrity를 강화하거나 self-reported임을 계속 명확히 표시하십시오.
2. CDX-007: Mobile migration을 sequential versioned execution으로 바꾸십시오.
3. CDX-008: Accessibility metadata와 accessible deletion control을 추가하십시오.
4. CDX-010: Production-useful root README를 작성하십시오.

## Assumptions and Not Verified

- Not verified: 로컬 `.env` 또는 ignored secret file 내용.
- Not verified: Cloudflare account-level WAF, rate limiting, Access, secret, log, live account의 D1 schema.
- Not verified: 실제 iOS/Android 기기 동작, HealthKit authorization prompt, App Store / Play Console submission behavior.
- Not verified: 저장소 문서 외의 live trademark/domain/app-store availability.
- Not verified: performance profiling, production build artifact, EAS build behavior.
- Assumption: report 생성 전부터 존재한 dirty working tree 변경은 사용자 또는 이전 작업의 변경이며 이 리뷰 작업의 변경이 아닙니다.
- Confirmed: `claude_review/`는 읽거나, 검사하거나, 요약하거나, 비교하거나, 사용하지 않았습니다.

## Commands Run

Metadata와 repository inventory:

- `date '+%Y-%m-%d-%H%M %Z %z'` - 로컬 리뷰 timestamp 확인; 통과.
- `git branch --show-current` - branch 확인; 통과.
- `git rev-parse HEAD` - HEAD commit 확인; 통과.
- `git status --short` - working tree 상태 확인; 통과.
- `rg --files -g '!claude_review/**' -g '!codex_review/**'` - review output 제외 repository file inventory; 통과.
- `base="codex_review/full/$(date '+%Y-%m-%d-%H%M')"; dir="$base"; i=2; while [ -e "$dir" ]; do dir=$(printf '%s-%02d' "$base" "$i"); i=$((i+1)); done; mkdir -p "$dir"; printf '%s\n' "$dir"` - unique output directory 생성; 통과.

Source와 documentation read:

- `sed -n` 및 `nl -ba` read를 주요 docs/config/source file에 실행했습니다. 포함 파일은 `README.md`, `package.json`, `app.json`, `tsconfig.json`, `jest.config.js`, `eslint.config.js`, `.gitignore`, `.env.example`, `docs/STATE.md`, `docs/overdrive-spec.md`, `docs/phase1-plan.md`, `docs/active-workout-blueprint.md`, `docs/troubleshooting.md`, `docs/compliance/health-data.md`, `docs/compliance/privacy-policy-draft.md`, `docs/compliance/brand-availability.md`, `src/db/schema.ts`, `src/db/migrate.ts`, `src/db/seed.ts`, `src/db/repos/` 아래 repository 파일, `src/app/` 아래 app route, `src/features/` 아래 feature file, `src/lib/`와 `src/stores/` 아래 state/settings file, UI primitives, i18n locale file, `worker/src/index.js`, `worker/wrangler.toml`, `worker/package.json`, `worker/README.md`입니다. 아래 별도 표기된 실패 외에는 통과했습니다.
- shell glob 문자를 quote하지 않아 처음 실패한 뒤 quote한 경로로 재실행해 통과: `nl -ba src/app/(tabs)/index.tsx`, `nl -ba src/app/(tabs)/power.tsx`, `nl -ba src/app/(tabs)/settings.tsx`, `nl -ba src/app/(tabs)/history.tsx`, `nl -ba src/app/(tabs)/_layout.tsx`.
- `nl -ba 'src/app/(tabs)/settings.tsx' | sed -n '1,220p'` 및 `nl -ba 'src/app/(tabs)/settings.tsx' | sed -n '220,360p'` - settings action과 delete-data UI 부재 확인; 통과.
- `nl -ba src/i18n/locales/en.json | sed -n '395,420p'` - AI/privacy 및 rank string 확인; 통과.

Search와 verification command:

- `claude_review/`와 `codex_review/`를 제외한 repository source/docs에 secret/auth/logging-oriented `rg` search를 실행했습니다. committed API key value는 발견되지 않았습니다.
- `git ls-files .env .env.example ios/.xcode.env ios/.xcode.env.local` - tracked env 관련 파일 확인; 통과.
- `git check-ignore -v .env ios/.xcode.env.local` - ignored secret/native env file 확인; 통과.
- `rg -n "rank_entry" -g '!claude_review/**' -g '!codex_review/**' .` - D1 table reference 검색; 통과.
- `find worker -maxdepth 3 -type f -not -path '*/node_modules/*' -print` - `node_modules` 제외 Worker source file listing; 통과.
- `rg -n "CREATE TABLE|CREATE INDEX|ALTER TABLE|DROP TABLE" worker -g '!node_modules/**'` - Worker DDL/migration 검색; match 없이 exit code 1.
- `rg -n "Delete my data|delete my data|clear data|reset data|delete.*data|clear.*database|drop table|DELETE FROM" src docs -g '!claude_review/**' -g '!codex_review/**'` - delete-data 기능 검색; 통과.
- `worker/node_modules` 제외 없이 broader `find worker ... -type f -print`를 한 번 실행했습니다. filename만 listing했고 finding evidence로 사용하지 않았습니다.

Quality/security command:

- `npm run typecheck` - TypeScript 검사; 통과.
- `npm test -- --runInBand` - Jest test; 통과, 18 suites 및 128 tests.
- `npm run lint` - Expo lint; 통과.
- `src/i18n/locales/en.json`, `ko.json`, `es.json`, `zh.json` locale key를 비교하는 Node locale parity script - missing 0, extra 0으로 통과.
- `npm audit --audit-level=moderate` - dependency audit; 37 vulnerabilities(36 moderate, 1 high)로 실패.
- `npm ls form-data js-yaml uuid --all` - vulnerable transitive dependency 추적; 통과.

Post-write verification command:

- `ls -l codex_review/full/2026-06-18-1317` - 두 report file 존재 확인; 통과.
- 두 report의 `### CDX-*` heading을 추출하는 Node script - English/Korean finding ID parity 확인; 통과.
- 각 `CDX-*` section에 `Evidence:`와 `Recommended fix:`가 있는지 확인하는 Node script - 각 report에 10개 finding이 있고 evidence/fix section 누락이 없음을 확인; 통과.
- `git status --short` - 최종 worktree 상태 확인; 통과. Review 작업이 새로 만든 경로는 `codex_review/full/2026-06-18-1317/`뿐이며, 다른 dirty path는 이 리뷰 전부터 존재했습니다.

의도적으로 실행하지 않은 command:

- 의존성 설치/업데이트 command는 실행하지 않았습니다.
- destructive command는 실행하지 않았습니다.
- production export/build command는 요청된 review output directory 밖에 artifact를 만들 수 있어 실행하지 않았습니다.

## Files Inspected

주요 검사 파일과 디렉터리:

- `README.md`
- `package.json`, audit/lock-dependent command를 통한 `package-lock.json`
- `app.json`, `tsconfig.json`, `jest.config.js`, `eslint.config.js`, `.gitignore`, `.env.example`
- `docs/STATE.md`, `docs/overdrive-spec.md`, `docs/phase1-plan.md`, `docs/active-workout-blueprint.md`, `docs/troubleshooting.md`
- `docs/compliance/health-data.md`, `docs/compliance/privacy-policy-draft.md`, `docs/compliance/brand-availability.md`
- `src/app/`
- `src/db/schema.ts`, `src/db/migrate.ts`, `src/db/seed.ts`, `src/db/repos/`
- `src/features/health/`, `src/features/quicklog/`, `src/features/food/`, `src/features/evolution/`, `src/features/rank/`, `src/features/dailyGoals/`, `src/features/logging/`, `src/features/program/`, `src/features/onboarding/`, `src/features/workout/`, `src/features/arena/`, `src/features/juice/`, `src/features/theme/`
- `src/lib/`, `src/stores/`, `src/ui/`, `src/i18n/`
- `worker/src/index.js`, `worker/wrangler.toml`, `worker/package.json`, `worker/README.md`
