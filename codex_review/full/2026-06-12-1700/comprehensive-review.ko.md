# Codex Comprehensive Repository Review

## Review Metadata

- 리뷰 일시: 2026-06-12 17:00 America/Toronto
- Git 브랜치: `main`
- HEAD 커밋: `d5654bd27f25501dee42b85e941e1332efb5624c`
- 시작 시 작업 트리 상태: `M docs/troubleshooting.md`가 리뷰 전부터 이미 수정되어 있었다.
- 최종 상태 근거: `docs/troubleshooting.md`는 리뷰 전 수정 상태 그대로 남아 있었고, 리뷰 작업이 만든 파일은 `codex_review/full/2026-06-12-1700/comprehensive-review.en.md`와 `codex_review/full/2026-06-12-1700/comprehensive-review.ko.md`뿐이다.
- 생성된 출력 디렉터리: `codex_review/full/2026-06-12-1700/`
- 리뷰 유형: 사용자 요청에 따른 전체 저장소 검증 리뷰. 전체 리뷰는 맞지만, 정기 주간/월간 리뷰 일정 여부는 확인되지 않았다.
- 리뷰 모드: 리뷰 전용. 소스 코드, 설정, 의존성, lockfile, 리뷰 산출물이 아닌 파일은 의도적으로 수정하지 않았다.
- 명시적 제외: `claude_review/` 아래 파일은 읽거나, 검사하거나, 요약하거나, 비교하거나, 근거로 사용하지 않았다.

## Review Scope

저장소 소스, 설정, 문서, 테스트, git 메타데이터, 로컬 앱 코드, SQLite 스키마/레포지토리, Expo 라우트, 주요 React Native 기능, Cloudflare Worker 코드, i18n 카탈로그, 환경 변수 예시, 컴플라이언스 문서, 실행한 명령 결과를 검사했다.

검사하지 않았거나 확인하지 못한 범위: `claude_review/` 아래 파일, 실제 Cloudflare 배포 상태, 실제 D1 스키마, App Store / Play Console 상태, 실기기 런타임 동작, 스크린샷, 저장소 설정 외 생성된 네이티브 프로젝트 세부 내용, npm registry 취약점 데이터, `.env` 값.

## Executive Summary

이 프로젝트는 로컬 SQLite 영속성, 통과하는 순수 로직 테스트, AI 파싱/전사/식단 추정/이미지 진화/랭킹용 Cloudflare Worker를 갖춘 dogfooding 단계의 Expo/React Native 피트니스 앱이다. 확인한 로컬 게이트는 모두 통과했다: TypeScript, Expo lint, Jest, Worker 문법 검사.

검사한 근거만 기준으로 보면, 프로젝트는 **프로덕션 준비 상태가 아니다**. 주요 차단 요소는 프로덕션 hardening과 컴플라이언스다. Worker가 인증/rate limit 없이 공개 호출 가능하고, 현재 개인정보처리방침 초안은 앱이 온디바이스 전용 Phase 1이라고 설명하지만 실제 코드에는 텍스트/오디오/사진/랭킹 데이터를 Worker로 업로드하는 경로가 여러 개 있다. 또한 저장소의 자체 브랜드 리서치가 `OverDrive` 공개명 사용을 no-go로 표시했는데도 앱 설정은 여전히 그 이름을 사용한다. 데이터 무결성, 배포 재현성, 접근성, 초기 설정 문서, 테스트 범위에도 의미 있는 공백이 있다.

## Project Overview

앱은 OverDrive라는 이름의 게임화된 운동 기록 앱으로 보인다. 주요 스택은 Expo SDK 56, React Native 0.85, React 19, Expo Router, TypeScript strict mode, Zustand 상태, Expo SQLite, i18next, Skia/Reanimated 시각 효과, Expo audio/haptics/image picker/file system, Jest다.

주요 구성 요소:

- `src/app/` 아래 모바일 앱 라우트.
- `src/db/` 아래 로컬 SQLite 스키마와 레포지토리.
- `src/features/` 아래 운동, Combat Power, JUICE 효과, QuickLog, Arena, Food, Evolution, Ranking, Daily Goals, Discipline 기능.
- AI 프록시와 D1 랭킹용 `worker/` Cloudflare Worker.
- `docs/` 아래 컴플라이언스 및 제품 계획 문서.
- `src/**/*.test.ts` 위치의 colocated 단위 테스트.

## Key Findings Summary

| ID | Severity | Category | Title | Confidence |
|---|---|---|---|---|
| OD-FR-001 | High | Security / Operations | Public Worker routes lack auth, rate limiting, and request-size controls | High |
| OD-FR-002 | High | Compliance / Privacy | Privacy policy draft contradicts current off-device AI and ranking flows | High |
| OD-FR-003 | High | Product / Legal / Deployment | App config still uses the uncleared `OverDrive` public identity | High |
| OD-FR-004 | Medium | Data Integrity / Error Handling | Several repository writes swallow database errors and let UI proceed as if persistence succeeded | High |
| OD-FR-005 | Medium | Frontend UX / Concrete Bug | QuickLog typed submit can remain permanently busy after an exception | High |
| OD-FR-006 | Medium | Product Completeness / UX | Protein target workflow is wired but has no onboarding/settings control, leaving food progress disabled by default | High |
| OD-FR-007 | Medium | Deployment / Database | D1 `rank_entry` schema is not versioned in the Worker deployment assets | High |
| OD-FR-008 | Low | Accessibility / Frontend UX | Icon and custom Pressable controls generally lack accessibility roles, labels, and state | High |
| OD-FR-009 | Low | Documentation / Maintainability | Top-level README does not document setup, test, environment, or run workflows | High |
| OD-FR-010 | Medium | Testing | Tests cover pure logic but not Worker routes, DB migrations/repositories, or primary UI flows | High |

## Critical Issues

검사한 근거에서 Critical 이슈는 확인되지 않았다. 빌드 관련 로컬 게이트, lint, Worker 문법 검사, 기존 단위 테스트는 통과했다. 다만 아래 High 이슈들은 공개 프로덕션 출시 전 release blocker로 다뤄야 한다.

## High-Priority Issues

### OD-FR-001: Public Worker routes lack auth, rate limiting, and request-size controls

- Severity: High
- Category: Security / Operations
- Evidence:
  - `worker/src/index.js:13-17`에서 CORS를 `access-control-allow-origin: '*'`로 설정한다.
  - `worker/src/index.js:387-396`은 POST 요청을 `/transcribe`, `/food`, `/rank/submit`, `/rank/board`, `/evolve`, 또는 기본 `/parse`로 분기하지만 Authorization 헤더, 토큰, 세션, app attestation, shared secret 검사를 하지 않는다.
  - `worker/src/index.js:107-131`, `135-166`, `174-245`, `255-280`, `336-383`은 공개 요청에서 바로 quota/비용이 걸린 AI 서비스나 D1 랭킹 경로를 호출한다.
  - `worker/src/index.js:189`와 `349`는 food/evolution 이미지 업로드 본문을 `arrayBuffer()`로 읽지만, 검사한 코드에는 애플리케이션 레벨 크기 제한이 없다.
  - `worker/README.md:35-39`는 엔드포인트에 인증이 없고 공개 출시 전 Cloudflare Access 또는 사용자별 토큰을 추가하라고 명시한다.
  - `docs/STATE.md:20`도 엔드포인트가 무인증이며 공개 출시 전 hardening이 필요하다고 설명한다.
- What is wrong: Worker URL을 발견한 누구나 AI 파싱, 전사, 식단 비전, 이미지 진화, 랭킹 쓰기를 호출할 수 있다. 랭킹도 클라이언트가 보낸 점수와 device ID를 신원 증명 없이 받는다.
- Why it matters: quota/비용 남용, D1 스팸/리더보드 무결성 훼손, 사진/오디오 처리 경계 약화 위험이 있다. 저장소가 이 한계를 명시하고 있으므로 개인 dogfooding 범위에서만 수용 가능한 상태다.
- Recommended fix: 공개 사용 전 Worker 앞에 실제 access layer를 둔다. 계획된 backend/gateway의 사용자 인증, JWT 또는 HMAC request signing, Cloudflare rate limiting/WAF, 필요한 경우 origin allowlist, `arrayBuffer()` 전 body size 및 MIME 검증, 랭킹 제출 anti-abuse 검증을 추가한다. 공개 무인증 모드는 명시적 개발 환경에서만 허용한다.
- Confidence: High

### OD-FR-002: Privacy policy draft contradicts current off-device AI and ranking flows

- Severity: High
- Category: Compliance / Privacy
- Evidence:
  - `docs/compliance/privacy-policy-draft.md:19`는 현재 버전이 완전히 온디바이스로 동작하고 backend server가 없으며 운영자 서버로 health data를 업로드/전송/저장하지 않는다고 말한다.
  - `docs/compliance/privacy-policy-draft.md:57`은 Phase 1이 third-party AI service로 아무것도 보내지 않는다고 말한다.
  - 현재 코드는 Worker로 데이터를 보낸다:
    - `src/features/quicklog/parseEntryAI.ts:46-50`은 운동 텍스트와 운동 카탈로그를 `/parse`로 POST한다.
    - `src/features/quicklog/transcribe.ts:9-15`는 녹음 오디오를 `/transcribe`로 업로드한다.
    - `src/features/food/parseFoodAI.ts:28-35`는 식사 사진을 `/food`로 업로드하고, `src/features/food/parseFoodAI.ts:40-47`은 식사 텍스트를 `/food`로 보낸다.
    - `src/features/evolution/evolveClient.ts:41-47`은 사용자 사진을 `/evolve`로 업로드한다.
    - `src/features/rank/rankClient.ts:34-40`은 랭킹 제출을 보내고, `src/features/rank/rankClient.ts:48-56`은 랭킹 보드를 가져온다.
- What is wrong: 개인정보처리방침 초안이 더 이상 구현된 데이터 흐름과 맞지 않는다. 온디바이스 전용 앱이라고 설명하지만 앱에는 여러 off-device AI 및 리더보드 workflow가 있다.
- Why it matters: 이 정책을 그대로 공개하면 오해의 소지가 있으며, 특히 오디오, 식사 사진, 사용자 사진, handle, fitness-derived score가 민감하거나 개인정보일 수 있어 app-store privacy review에 부적합할 가능성이 높다.
- Recommended fix: 공개 출시 전 개인정보처리방침과 앱 내 동의 문구를 현재 구현과 맞게 업데이트한다. 각 off-device flow, Worker 운영자, third-party processor(Groq/Gemini/Cloudflare 등), 데이터 타입, 보관 기간, 목적, 선택 여부, 삭제/철회 경로, 사진/오디오 저장 여부를 공개한다. 대상 관할권과 스토어 정책상 필요하면 AI/photo/rank 기능을 명시적 동의 뒤에 둔다.
- Confidence: High

### OD-FR-003: App config still uses the uncleared `OverDrive` public identity

- Severity: High
- Category: Product / Legal / Deployment
- Evidence:
  - `app.json:3-5`는 Expo `name`을 `OverDrive`, `slug`를 `overdrive`, version을 `1.0.0`으로 설정한다.
  - `app.json:12`는 iOS `bundleIdentifier`를 `com.anonymous.overdrive`로 설정한다.
  - `docs/compliance/brand-availability.md:11-17`은 같은 카테고리의 `Overdrive Fitness`, 인접한 OverDrive mark, 선점된 주요 asset 때문에 `OverDrive`가 consumer fitness app 이름으로 no-go라고 결론낸다.
  - `docs/compliance/brand-availability.md:102-108`은 `OverDrive`를 public store-facing brand로 쓰지 말라고 권고한다.
  - `docs/STATE.md:61-64`도 `OverDrive`가 공개 앱명으로 적합하지 않다고 기록한다.
- What is wrong: 앱의 public-facing Expo name, slug, iOS bundle identifier가 저장소 자체 컴플라이언스 리서치에서 launch-blocking으로 표시한 브랜드를 계속 사용한다.
- Why it matters: app-store rejection, trademark dispute, 사용자 혼동, 배포 후 강제 rebrand 위험이 있다.
- Recommended fix: cleared public product name을 선택하고 법률 검토를 거친 뒤 domain/handle을 확보한다. 이후 `app.json`, bundle ID, 필요한 app icon/splash asset, README/docs, privacy policy, store metadata를 갱신한다. `OverDrive`는 법률 검토가 허용하는 경우에만 internal codename 또는 비공개 in-app flavor로 유지한다.
- Confidence: High

## Medium-Priority Issues

### OD-FR-004: Several repository writes swallow database errors and let UI proceed as if persistence succeeded

- Severity: Medium
- Category: Data Integrity / Error Handling
- Evidence:
  - `src/db/repos/dailyGoalRepo.ts:61-75`의 `addTarget()`은 모든 에러를 catch하고 조용히 no-op한다.
  - `src/db/repos/dailyGoalRepo.ts:98-117`의 `addProgress()`는 모든 에러를 catch하고 `{ progress: 0, done: false, justCompleted: false }`를 반환한다.
  - `src/db/repos/disciplineRepo.ts:30-40`의 `setDisciplineToday()`는 모든 에러를 catch하고 조용히 no-op한다.
  - `src/db/repos/foodRepo.ts:22-33`의 `addFoodItems()`는 모든 에러를 catch하고 조용히 no-op한다.
  - 호출자는 이후 optimistic UI 또는 후속 recomputation을 계속 수행한다: `src/features/dailyGoals/useDailyGoals.ts:48-60`, `src/features/discipline/DisciplineCard.tsx:47-54`, `src/features/food/FoodCard.tsx:51-54`.
- What is wrong: 코드는 dev hot-reload pre-migration window를 견디려는 목적이지만, catch-all 때문에 constraint failure, DB 손상, future migration bug 같은 실제 오류도 숨겨진다.
- Why it matters: 사용자는 toggle, goal, food entry가 저장된 것처럼 볼 수 있지만 실제 persistence는 실패했을 수 있다. Combat Power도 stale data 기준으로 재계산될 수 있다.
- Recommended fix: 이 dev fallback이 여전히 필요하다면 알려진 missing-table case만 catch하고, 그 외 오류는 rethrow하거나 명시적 failure를 반환한다. UI 호출자는 optimistic state를 rollback하고 localized error를 보여줘야 한다. write failure와 pre-migration fallback 동작을 테스트로 추가한다.
- Confidence: High

### OD-FR-005: QuickLog typed submit can remain permanently busy after an exception

- Severity: Medium
- Category: Frontend UX / Concrete Bug
- Evidence:
  - `src/features/quicklog/QuickLogBar.tsx:43-48`은 `busy`를 `true`로 설정하고 `runSubmit(text)`를 await한 뒤 `busy`를 `false`로 설정하지만 `try/finally`가 없다.
  - `src/features/quicklog/useQuickLog.ts:127-143`의 offline fallback은 persistence error를 catch하지 않고 `logSet()`을 호출한다.
  - `src/features/logging/useLogSet.ts:40-51`은 `addSet()`과 `recomputeAndStore()`를 await하며, 둘 다 DB 오류에서 throw할 수 있다.
- What is wrong: typed submit path 시작 후 `submitText()`가 throw하면 `setBusy(false)`가 실행되지 않는다.
- Why it matters: QuickLog 버튼이 `src/features/quicklog/QuickLogBar.tsx:138-139` 조건으로 계속 disabled 상태가 되어, component remount 전까지 핵심 기록 workflow가 막힌다.
- Recommended fix: `await runSubmit(text)`를 `try/catch/finally`로 감싸고, `finally`에서 항상 `busy`를 해제한다. 예상치 못한 logging error에 대해 localized hint를 설정한다.
- Confidence: High

### OD-FR-006: Protein target workflow is wired but has no onboarding/settings control, leaving food progress disabled by default

- Severity: Medium
- Category: Product Completeness / UX
- Evidence:
  - `src/lib/settings.ts:31-45`는 `proteinTargetG` 기본값을 `null`로 둔다.
  - `src/features/food/FoodCard.tsx:28`, `57`, `113-139`는 `proteinTargetG`가 설정되어 있을 때만 protein target progress bar와 discipline 자동 완료를 보여준다.
  - `src/app/(tabs)/settings.tsx:42-92`는 language, units, JUICE intensity, sound, weight-step 설정만 제공하고 protein target, height, start weight, target weight control은 없다.
  - `docs/STATE.md:57`은 height/weight/protein target onboarding이 아직 남아 있고 `proteinTargetG`가 현재 null이라 food target bar가 비활성이라고 명시한다.
- What is wrong: 사용자는 food를 기록할 수 있지만 target-based protein progress와 auto-discipline loop가 기본적으로 비활성이고, 검사한 앱 내 UI에서는 이를 켤 방법이 없다.
- Why it matters: 앱의 daily health loop 중 하나가 약해지고, AI food logging이 성공해도 FoodCard의 행동 가능성이 낮아진다.
- Recommended fix: protein target 및 관련 body metric을 위한 onboarding 또는 Settings section을 추가한다. `updateSettings()`로 저장하고 합리적 범위를 검증하며, target이 없을 때 `FoodCard`에 empty/disabled copy를 표시한다.
- Confidence: High

### OD-FR-007: D1 `rank_entry` schema is not versioned in the Worker deployment assets

- Severity: Medium
- Category: Deployment / Database
- Evidence:
  - `worker/src/index.js:271-279`는 `rank_entry`에 쓴다.
  - `worker/src/index.js:299-316`은 `rank_entry`에서 읽고 순위를 계산한다.
  - `git ls-files worker` 결과는 `worker/README.md`, `worker/package.json`, `worker/src/index.js`, `worker/wrangler.toml`뿐이었다.
  - `rg -n "rank_entry|CREATE TABLE|d1|wrangler d1|migrations" ...`는 Worker의 `rank_entry` 사용과 문서/log의 언급은 찾았지만, tracked Worker 파일 아래 versioned `CREATE TABLE rank_entry` migration은 찾지 못했다.
- What is wrong: Worker는 D1 table에 의존하지만, 그 table이 tracked migration/schema file로 정의되어 있지 않다.
- Why it matters: 새 환경을 저장소만으로 재현할 수 없다. 원격 D1 table이 수동으로 정확히 생성되지 않으면 배포는 성공해도 rank route가 런타임에 실패할 수 있다.
- Recommended fix: `rank_entry`용 Cloudflare D1 migration을 추가하고, `wrangler d1 migrations apply`를 문서화하며, rank route 활성화 전 required table/column을 확인하는 deploy check 또는 테스트를 추가한다.
- Confidence: High

### OD-FR-010: Tests cover pure logic but not Worker routes, DB migrations/repositories, or primary UI flows

- Severity: Medium
- Category: Testing
- Evidence:
  - 테스트 파일 검색 결과 11개가 발견되었다: `detectPr`, `units`, `auraFromCp`, `parseFoodAI`, `aggregate`, `computeCombatPower`, `arena`, `parseEntryAI`, `parseEntry`, `classifyEvent`, `selectSfx`.
  - `npm test -- --runInBand`는 발견된 colocated unit test에서 11개 suite, 85개 test를 통과했다.
  - 검사한 테스트 목록에서 Worker route test, SQLite migration/repository integration test, React Native component/flow test는 발견되지 않았다.
  - `jest.config.js:7`은 `src/**/*.{ts,tsx}`에서 coverage를 수집하도록 되어 있지만, test command는 coverage threshold를 강제하지 않았다.
- What is wrong: 이번 리뷰에서 가장 위험도가 높은 workflow가 직접 테스트되지 않는다: public Worker behavior, D1 rank contract, migration/repository persistence, QuickLog UI failure handling, settings/food workflow.
- Why it matters: 단위 테스트가 통과해도 실제 logging, persistence, AI proxy, ranking, consent workflow 회귀를 막지 못한다.
- Recommended fix: Miniflare 스타일 런타임 또는 작은 handler abstraction으로 Worker request test를 추가하고, SQLite 동작에 대한 repository/migration test, QuickLog/FoodCard/RankSection/Settings와 위 error path에 대한 React Native Testing Library 테스트를 추가한다. 초기 integration test가 생긴 뒤 coverage threshold를 추가한다.
- Confidence: High

## Low-Priority Issues

### OD-FR-008: Icon and custom Pressable controls generally lack accessibility roles, labels, and state

- Severity: Low
- Category: Accessibility / Frontend UX
- Evidence:
  - 공용 `NeonButton`과 `Pill`은 `src/ui/primitives.tsx:40-50`, `src/ui/primitives.tsx:66-71`에서 `Pressable`을 렌더링하지만 `accessibilityRole`, `accessibilityLabel`, `accessibilityState`가 없다.
  - icon/symbol-only control 예시는 `src/features/quicklog/QuickLogBar.tsx:113-119`의 mic button, `src/features/food/FoodCard.tsx:142-143`의 food photo button, `src/features/logging/Stepper.tsx:80-110`의 plus/minus control, `src/features/dailyGoals/DailyGoalsCard.tsx:67-72`의 daily-goal check control이다.
- What is wrong: screen reader와 보조 기술이 불명확한 symbol을 읽거나 button state를 놓칠 수 있다.
- Why it matters: 기록은 앱의 핵심 workflow다. 접근성이 부족한 control은 VoiceOver/TalkBack 사용자에게 앱 사용을 어렵거나 불가능하게 만든다.
- Recommended fix: 공용 primitive에 role/state/label 지원을 추가하고, icon-only control에는 명시적 label을 제공한다. toggle에는 적절히 `accessibilityState={{ selected: active, disabled }}`를 사용한다. 주요 control에 대해 최소 하나 이상의 accessibility-oriented component test 또는 snapshot을 추가한다.
- Confidence: High

### OD-FR-009: Top-level README does not document setup, test, environment, or run workflows

- Severity: Low
- Category: Documentation / Maintainability
- Evidence:
  - `README.md:1-2`에는 프로젝트 제목과 반복된 이름만 있다.
  - `package.json:55-64`는 중요한 script(`start`, `ios`, `android`, `web`, `lint`, `typecheck`, `test`)를 정의하지만 README에는 설명이 없다.
  - `.env.example:1-7`과 `worker/README.md:1-39`에는 유용한 setup detail이 있지만, root README는 새 contributor에게 app + Worker 전체 설정 흐름을 안내하지 않는다.
- What is wrong: 저장소에는 유용한 문서가 있지만 entry-point README가 install, configure, run, test, deploy 방법을 설명하지 않는다.
- Why it matters: onboarding과 운영 재현성이 약해지고, contributor가 no-secret `EXPO_PUBLIC_*` 구분이나 Worker setup을 놓칠 수 있다.
- Recommended fix: root README에 prerequisites, install commands, environment setup, app run commands, test/lint/typecheck commands, Worker deploy notes, 알려진 dogfooding limitation, canonical spec/compliance docs 링크를 추가한다.
- Confidence: High

## Product Completeness Review

확인된 이슈: OD-FR-006, OD-FR-009. 앱에는 핵심 로컬 운동 기록, Combat Power, JUICE 피드백, food AI, ranking, evolution flow가 있다. 저장소 상태 문서는 이후 phase가 아직 시작되지 않았다고 기록한다: `docs/STATE.md:25-29`는 backend/account/health sync, aura sharing/3D, social/competition, body composition/fitness marker, launch monetization/policy가 미착수라고 적는다.

Payment/billing 구현에 대해서는 검사한 근거에서 구체적 이슈를 찾지 못했다. payment/billing 코드가 발견되지 않았기 때문이다. 이는 production scope에 monetization이 포함될 때만 결함이다.

## Architecture Review

앱은 `src/features`의 feature slicing, `src/db`의 local persistence, `src/ui`의 shared UI, `src/app`의 route 구조가 비교적 명확하다. SQLite 초기화는 `src/app/_layout.tsx:16`에서 `SQLiteProvider`와 `migrateDbIfNeeded`로 중앙화되어 있다.

확인된 architecture/boundary risk: OD-FR-004, OD-FR-007, OD-FR-010. History 같은 화면에서 read query를 직접 수행하는 경우를 제외하면, 검사한 근거에서 feature module 순환이나 app route가 의도한 repository pattern 밖에서 low-level DB table을 직접 변경하는 구체적 이슈는 발견하지 못했다.

## Security Review

확인된 이슈: OD-FR-001, OD-FR-002, OD-FR-003.

긍정적 근거: API key literal은 앱 설정에 커밋되어 있지 않다. `.env.example:1-7`은 `EXPO_PUBLIC_*`가 non-secret이고 Gemini/Groq key는 Worker secret에 있어야 한다고 설명한다. `.gitignore:33-35`는 `.env`를 ignore하고, `.gitignore:46-48`은 local secret store를 ignore한다. `worker/wrangler.toml:11-13`은 API key에 `wrangler secret put`을 쓰도록 문서화한다.

검사한 근거에서 API key literal value가 source file에 커밋된 구체적 이슈는 발견하지 못했다. `.env` 값은 검사하지 않았다.

## Data and API Review

확인된 이슈: OD-FR-004, OD-FR-007. 로컬 스키마는 검사한 repository write에서 parameterized SQL을 사용하고, `src/db/migrate.ts:19`에서 connection마다 foreign key를 켠다. 현재 migration은 additive/idempotent 구조다(`src/db/schema.ts:148-200`, `src/db/migrate.ts:47-52`).

API 우려는 Worker에 집중되어 있다: 공개 무인증 AI/ranking route, 클라이언트 제출 ranking score, versioned D1 schema 부재, 검사한 코드상 application-level upload size check 부재.

## Frontend and UX Review

확인된 이슈: OD-FR-005, OD-FR-006, OD-FR-008. 앱에는 여러 visible empty state가 있다. 예: `src/app/(tabs)/power.tsx:58-61`, `src/app/(tabs)/history.tsx:141-145`, `src/features/dailyGoals/DailyGoalsCard.tsx:31-34`.

전체 시각적 반응성 또는 실기기 UX 검증은 수행하지 않았다. 스크린샷과 모바일 런타임 동작은 이 리뷰에서 확인되지 않았다.

## Testing Review

확인된 이슈: OD-FR-010.

통과한 명령:

- `npm run typecheck`
- `npm run lint`
- `npm test -- --runInBand` with 11 suites and 85 tests passing
- `node --check worker/src/index.js`

추천 테스트 추가 항목은 OD-FR-010에 정리했다.

## Performance and Scalability Review

확인된 scalability/security 이슈: OD-FR-001. Worker는 임의 클라이언트가 호출할 수 있고 비용이 큰 AI 작업을 forward한다. 업로드 이미지의 경우 검사한 코드는 파일을 메모리/base64로 변환한다(`worker/src/index.js:189-192`, `349-352`). 프로덕션 전 크기와 타입 제한이 필요하다.

로컬 Combat Power 계산 성능에 대해서는 검사한 근거에서 구체적 이슈를 발견하지 못했다. 7일/90일 범위 query와 pure calculation을 사용한다.

## Deployment and Operations Review

확인된 이슈: OD-FR-001, OD-FR-003, OD-FR-007, OD-FR-009.

추가 운영 메모:

- 메인 앱에는 lockfile이 있다(`package-lock.json`은 저장소 파일 목록에서 확인됨).
- `git ls-files worker` 기준 Worker tracked file에는 `worker/package-lock.json`이 없다. 따라서 Worker tool dependency resolution은 앱보다 재현성이 약하다. 이는 별도 production defect로 분리하지 않은 낮은 수준의 운영 개선점이다.
- `expo export`는 실행하지 않았다. 생성 output을 쓰거나 갱신할 수 있어, 리뷰 파일 외 수정 금지 지시와 충돌할 수 있기 때문이다.

## Maintainability Review

확인된 이슈: OD-FR-004, OD-FR-009, OD-FR-010. 코드베이스는 대체로 feature 단위로 구성되어 있고 dogfooding limitation 및 future phase에 대한 주석도 명확하다. 주요 maintainability gap은 조직 구조보다 운영 가정을 실행 가능한 형태로 만드는 데 있다: versioned Worker/D1 setup, root documentation, persistence/Worker contract 테스트.

## Recommended Fix Plan

프로덕션 전 must-fix:

1. OD-FR-002 수정: 현재 off-device AI/rank 동작과 일치하도록 privacy policy, consent, processor disclosure를 업데이트한다.
2. OD-FR-001 수정: Worker에 auth, rate limit, request-size/type validation, rank anti-abuse control을 추가한다.
3. OD-FR-003 수정: cleared public brand와 app identity를 선택하고 적용한다.
4. OD-FR-007 수정: `rank_entry`용 D1 migration/schema와 deployment check를 추가한다.
5. OD-FR-004와 OD-FR-005 수정: silent write failure를 없애고 QuickLog가 exception 후 회복하도록 만든다.

이후 개선:

6. OD-FR-006 수정: protein target과 관련 body metric에 대한 onboarding/settings를 추가한다.
7. OD-FR-010 수정: Worker, DB/repository, UI flow 테스트를 추가한다.
8. OD-FR-008 수정: shared/icon-only control에 accessibility role/label/state를 추가한다.
9. OD-FR-009 수정: root README를 확장한다.

## Assumptions and Not Verified

- Not verified: 실제 Cloudflare Worker 배포, Cloudflare secret 설정, D1 remote table schema, deployed route behavior.
- Not verified: simulator 또는 real device에서의 앱 동작. 스크린샷이나 수동 UI interaction은 수행하지 않았다.
- Not verified: npm audit 또는 live dependency vulnerability 상태. registry/network audit은 실행하지 않았다.
- Not verified: App Store, Play Store, USPTO, KIPRIS, repository 내부 compliance docs 밖의 법률 clearance.
- Not verified: `.env` 값. `.env.example`과 환경 변수 참조만 검사했다.
- Assumption: 리뷰 전부터 존재한 `M docs/troubleshooting.md` working-tree modification은 이전 작업/사용자 작업이다. 이 리뷰에서는 수정하지 않았다.
- Confirmed process statement: `claude_review/`는 파일 scan에서 의도적으로 제외했고 근거로 사용하지 않았다.

## Commands Run

| Command | Purpose | Result |
|---|---|---|
| `date +%Y-%m-%d-%H%M` | 리뷰 디렉터리 timestamp 생성. | Passed: `2026-06-12-1700` |
| `git branch --show-current` | 브랜치 확인. | Passed: `main` |
| `git rev-parse HEAD` | HEAD 커밋 확인. | Passed: `d5654bd27f25501dee42b85e941e1332efb5624c` |
| `git status --short` | 시작 시 작업 트리 상태 확인. | Passed: pre-existing `M docs/troubleshooting.md` 표시 |
| `rg --files -g '!claude_review/**'` | `claude_review/` 제외하고 저장소 파일 나열. | Passed |
| `ls codex_review/full` | 기존 리뷰 출력 디렉터리 확인. | Failed: 디렉터리가 아직 없었음 |
| `find . -maxdepth 2 -type d -name claude_review -prune -o -maxdepth 2 -type d -print` | `claude_review/`를 prune하면서 상위 디렉터리 구조 확인. | Passed |
| `mkdir -p codex_review/full/2026-06-12-1700` | versioned review output directory 생성. | Passed |
| `nl -ba package.json` | 앱 package config/scripts/deps 검사. | Passed |
| `nl -ba worker/package.json` | Worker package config 검사. | Passed |
| `nl -ba README.md` | root README 검사. | Passed |
| `nl -ba app.json` | Expo app config와 permission 검사. | Passed |
| `nl -ba tsconfig.json` | TypeScript config 검사. | Passed |
| `nl -ba jest.config.js` | Jest config 검사. | Passed |
| `nl -ba eslint.config.js` | ESLint config 검사. | Passed |
| `nl -ba worker/wrangler.toml` | Worker deployment config 검사. | Passed |
| `nl -ba docs/overdrive-spec.md` | canonical product/architecture spec 검사. | Passed |
| `nl -ba docs/STATE.md` | 현재 프로젝트 상태 문서 검사. | Passed |
| `nl -ba docs/phase1-plan.md` | Phase 1 plan 검사. | Passed |
| `nl -ba worker/README.md` | Worker setup/security note 검사. | Passed |
| `nl -ba docs/compliance/health-data.md` | health compliance 문서 검사. | Passed |
| `nl -ba docs/compliance/privacy-policy-draft.md` | privacy policy draft 검사. | Passed |
| `nl -ba docs/compliance/brand-availability.md` | brand availability research 검사. | Passed |
| `nl -ba src/db/schema.ts` | SQLite schema와 migration 검사. | Passed |
| `nl -ba src/db/migrate.ts` | migration runner 검사. | Passed |
| `nl -ba src/db/seed.ts` | exercise seed data 검사. | Passed |
| `nl -ba src/db/types.ts` | DB row type 검사. | Passed |
| `nl -ba src/db/uuid.ts` | UUID 생성 검사. | Passed |
| `nl -ba src/app/_layout.tsx` | app root/provider bootstrapping 검사. | Passed |
| `nl -ba src/features/boot/Boot.tsx` | boot hydration 검사. | Passed |
| `nl -ba src/db/repos/setLogRepo.ts` | set logging repository 검사. | Passed |
| `nl -ba src/db/repos/sessionRepo.ts` | session repository 검사. | Passed |
| `nl -ba src/db/repos/combatPowerRepo.ts` | Combat Power repository/recompute 검사. | Passed |
| `nl -ba src/db/repos/cardioRepo.ts` | cardio repository 검사. | Passed |
| `nl -ba src/db/repos/userRepo.ts` | user/settings repository 검사. | Passed |
| `nl -ba src/db/repos/foodRepo.ts` | food repository 검사. | Passed |
| `nl -ba src/db/repos/dailyGoalRepo.ts` | daily-goal repository 검사. | Passed |
| `nl -ba src/db/repos/disciplineRepo.ts` | discipline repository 검사. | Passed |
| `nl -ba src/db/repos/powerEventRepo.ts` | power-event repository 검사. | Passed |
| `nl -ba src/features/logging/useLogSet.ts` | set logging hook 검사. | Passed |
| `nl -ba src/features/logging/useLogCardio.ts` | cardio logging hook 검사. | Passed |
| `nl -ba src/features/dailyGoals/useDailyGoals.ts` | daily-goal state hook 검사. | Passed |
| `nl -ba src/features/discipline/DisciplineCard.tsx` | discipline UI 검사. | Passed |
| `nl -ba src/features/food/FoodCard.tsx` | food UI workflow 검사. | Passed |
| `nl -ba src/features/food/parseFoodAI.ts` | food AI client 검사. | Passed |
| `nl -ba src/features/quicklog/useQuickLog.ts` | QuickLog workflow hook 검사. | Passed |
| `nl -ba src/features/quicklog/parseEntryAI.ts` | QuickLog AI client 검사. | Passed |
| `nl -ba src/features/quicklog/transcribe.ts` | transcription upload client 검사. | Passed |
| `nl -ba src/features/quicklog/config.ts` | QuickLog endpoint config 검사. | Passed |
| `nl -ba src/features/quicklog/QuickLogBar.tsx` | QuickLog UI 검사. | Passed |
| `nl -ba src/features/quicklog/parseEntry.ts` | offline parser 검사. | Passed |
| `nl -ba src/features/logging/SetLoggerSheet.tsx` | manual strength logger 검사. | Passed |
| `nl -ba src/features/logging/CardioLoggerSheet.tsx` | cardio logger 검사. | Passed |
| `nl -ba src/app/(tabs)/index.tsx` | route group path를 quote하지 않고 Today route 검사 시도. | Failed: zsh glob parse error |
| `nl -ba src/app/(tabs)/power.tsx` | route group path를 quote하지 않고 Power route 검사 시도. | Failed: zsh glob parse error |
| `nl -ba src/app/(tabs)/history.tsx` | route group path를 quote하지 않고 History route 검사 시도. | Failed: zsh glob parse error |
| `nl -ba src/app/(tabs)/settings.tsx` | route group path를 quote하지 않고 Settings route 검사 시도. | Failed: zsh glob parse error |
| `nl -ba src/app/(tabs)/_layout.tsx` | route group path를 quote하지 않고 Tabs layout 검사 시도. | Failed: zsh glob parse error |
| `nl -ba 'src/app/(tabs)/index.tsx'` | Today route 검사. | Passed |
| `nl -ba 'src/app/(tabs)/power.tsx'` | Power route 검사. | Passed |
| `nl -ba 'src/app/(tabs)/history.tsx'` | History route 검사. | Passed |
| `nl -ba 'src/app/(tabs)/settings.tsx'` | Settings route 검사. | Passed |
| `nl -ba 'src/app/(tabs)/_layout.tsx'` | Tabs layout 검사. | Passed |
| `nl -ba worker/src/index.js` | Worker route 검사. | Passed |
| `nl -ba src/features/rank/rankClient.ts` | rank client 검사. | Passed |
| `nl -ba src/features/rank/RankSection.tsx` | rank UI 검사. | Passed |
| `nl -ba src/features/evolution/evolveClient.ts` | evolution upload client 검사. | Passed |
| `nl -ba src/features/evolution/EvolutionCard.tsx` | evolution UI 검사. | Passed |
| `nl -ba src/lib/settings.ts` | settings model/defaults 검사. | Passed |
| `nl -ba src/stores/settingsStore.ts` | settings store 검사. | Passed |
| `nl -ba src/stores/combatPowerStore.ts` | Combat Power store 검사. | Passed |
| `nl -ba src/features/combat-power/computeCombatPower.ts` | CP calculation 검사. | Passed |
| `nl -ba src/features/combat-power/aggregate.ts` | CP aggregate helper 검사. | Passed |
| `nl -ba src/features/combat-power/constants.ts` | CP constants 검사. | Passed |
| `nl -ba src/features/arena/useArena.ts` | arena state hook 검사. | Passed |
| `nl -ba src/features/forge/useForge.ts` | session lifecycle 검사. | Passed |
| `rg -n "TODO|FIXME|HACK|XXX|not implemented|Phase 2|hardening|auth|rate|secret|API_KEY|EXPO_PUBLIC|password|token|Authorization|cors|CORS" -g '!claude_review/**' -g '!node_modules/**' -g '!ios/Pods/**' -g '!dist/**'` | risk/TODO-like marker 검색. | Passed |
| `rg --files -g '!claude_review/**' -g '!node_modules/**' -g '!ios/Pods/**' -g '!dist/**' \| rg '\.(test\|spec)\.(ts\|tsx\|js)$'` | test file 나열. | Passed |
| `rg -n "catch \{|catch \([^)]*\) \{|catch\s*=>|catch \(.*\)" src worker/src -g '!claude_review/**'` | catch/error handling 위치 검색. | Passed |
| `rg -n "fetch\(|uploadAsync\(|formData\(|req\.json\(|new Response|Response\(" src worker/src -g '!claude_review/**'` | network/API upload path 검색. | Passed |
| `rg -n "alert|Alert|accessibility|accessibilityLabel|role|aria|disabled|busy|loading|empty|error|fail" src/app src/features src/ui -g '!claude_review/**'` | UX/accessibility/error state 검색. | Passed |
| `nl -ba src/ui/primitives.tsx` | shared UI primitive 검사. | Passed |
| `nl -ba src/features/dailyGoals/DailyGoalsCard.tsx` | daily-goal UI 검사. | Passed |
| `nl -ba src/features/dailyGoals/DailyGoalEditorSheet.tsx` | daily-goal editor 검사. | Passed |
| `nl -ba src/features/logging/Stepper.tsx` | stepper control 검사. | Passed |
| `nl -ba src/features/character/MyCharacter.tsx` | character/body-map UI wrapper 검사. | Passed |
| `nl -ba src/features/logging/ExerciseRegionSheet.tsx` | region exercise picker 검사. | Passed |
| `nl -ba src/features/character/BodyMap.tsx` | body-map renderer 검사. | Passed |
| `nl -ba src/features/character/BodyRegion.tsx` | tappable body region 검사. | Passed |
| `rg -n "[가-힣]" src -g '!claude_review/**'` | source 내 Korean/hardcoded localized text 검색. | Passed |
| `rg -n "[🔥⚡🎤📷🍗🏃✓●−+]" src -g '!claude_review/**'` | source 내 icon/symbol usage 검색. | Passed |
| `node -e "const fs=require('fs');const p='src/i18n/locales';const walk=(o,prefix='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)?walk(v,prefix+k+'.'):[prefix+k]);const files=['en','ko','es','zh'];const maps=Object.fromEntries(files.map(f=>[f,new Set(walk(JSON.parse(fs.readFileSync(p+'/'+f+'.json','utf8'))))]));for(const f of files.slice(1)){const miss=[...maps.en].filter(k=>!maps[f].has(k));const extra=[...maps[f]].filter(k=>!maps.en.has(k));console.log(f,'missing',miss.length,miss.slice(0,20).join(','),'extra',extra.length,extra.slice(0,20).join(','));}"` | i18n locale key coverage 비교. | Passed: ko/es/zh missing/extra 0 |
| `nl -ba src/i18n/index.ts` | i18n setup 검사. | Passed |
| `npm run typecheck` | TypeScript no-emit check 실행. | Passed |
| `npm run lint` | Expo lint 실행. | Passed |
| `npm test -- --runInBand` | Jest suite serial 실행. | Passed: 11 suites, 85 tests |
| `node --check worker/src/index.js` | Worker JavaScript syntax 검사. | Passed |
| `rg --files -g '!claude_review/**' -g '.env*' -g '!node_modules/**' -g '!ios/Pods/**' -g '!dist/**'` | private `.env`를 읽지 않고 env file 존재 확인. | Passed |
| `nl -ba .gitignore` | env/secret/generated file ignore rule 검사. | Passed |
| `rg -n "env|ENV|EXPO_PUBLIC|GROQ|GEMINI|D1|database|wrangler|secret" README.md docs worker src app.json package.json -g '!claude_review/**'` | env/deployment reference 검색. | Passed |
| `find . -maxdepth 3 -name '*env*' -o -name '.env.example' -o -name 'eas.json' -o -name 'Dockerfile' -o -name 'metro.config.js'` | env/deployment config file 검색. | Passed |
| `nl -ba .env.example` | env example 검사. | Passed |
| `rg --files worker -g '!node_modules/**' -g '!claude_review/**'` | node_modules 제외 Worker file 나열. | Passed |
| `find worker -maxdepth 3 -type f -name '*.sql' -o -name '*migration*' -o -name '*schema*'` | Worker SQL/migration/schema file 검색. | Passed; broad predicate 때문에 node_modules config-schema match가 하나 나타남 |
| `rg -n "rank_entry|CREATE TABLE|d1|wrangler d1|migrations" -g '!claude_review/**' -g '!node_modules/**' -g '!ios/Pods/**' -g '!dist/**'` | D1/rank schema 근거 검색. | Passed |
| `rg -n "proteinTargetG|heightCm|startWeightKg|targetWeightKg" src docs -g '!claude_review/**'` | body/protein settings workflow 검색. | Passed |
| `rg -n "react-native-health|health-connect|HealthKit|expo-notifications|subscription|billing|RevenueCat|Stripe|IAP|in-app purchase|payment|upload|download|camera" package.json src app.json docs/STATE.md docs/overdrive-spec.md docs/compliance -g '!claude_review/**'` | health/payment/upload/compliance coverage 검색. | Passed |
| `git ls-files worker` | tracked Worker file 확인. | Passed |
| `ls -l codex_review/full/2026-06-12-1700` | output directory에 두 report file이 존재하는지 확인. | Passed |
| `find codex_review/full/2026-06-12-1700 -maxdepth 1 -type f -print` | versioned output directory에 report file만 있는지 확인. | Passed |
| `rg -n "^\| OD-FR-|^### OD-FR-|^- Evidence:" codex_review/full/2026-06-12-1700/comprehensive-review.en.md codex_review/full/2026-06-12-1700/comprehensive-review.ko.md` | 두 report 모두 finding과 Evidence section을 포함하는지 확인. | Passed |
| `node -e "const fs=require('fs');const files=['codex_review/full/2026-06-12-1700/comprehensive-review.en.md','codex_review/full/2026-06-12-1700/comprehensive-review.ko.md'];const rows=f=>fs.readFileSync(f,'utf8').split('\n').filter(l=>l.startsWith('| OD-FR-')).map(l=>l.split('|').slice(1,5).map(s=>s.trim()).join(' | '));const [a,b]=files.map(rows);console.log(JSON.stringify({en:a,ko:b,same:JSON.stringify(a)===JSON.stringify(b)},null,2));if(JSON.stringify(a)!==JSON.stringify(b)) process.exit(1);"` | Korean/English report가 동일한 finding ID, severity, category, title, confidence를 갖는지 확인. | Passed: `same: true` |
| `git status --short` | 최종 repository status 확인. | Passed: pre-existing `M docs/troubleshooting.md`와 untracked `codex_review/` |
| `find codex_review -type f -print` | `codex_review/` 아래 파일이 두 review file뿐인지 확인. | Passed |
| `git status --short -- codex_review/full/2026-06-12-1700 docs/troubleshooting.md` | review-created path와 pre-existing modified doc 상태 확인. | Passed: `M docs/troubleshooting.md`, `?? codex_review/full/2026-06-12-1700/` |
| `node -e "const fs=require('fs');const files=['codex_review/full/2026-06-12-1700/comprehensive-review.en.md','codex_review/full/2026-06-12-1700/comprehensive-review.ko.md'];const rows=f=>fs.readFileSync(f,'utf8').split('\n').filter(l=>l.startsWith('| OD-FR-')).slice(0,10).map(l=>l.split('|').slice(1,5).map(s=>s.trim()).join(' | '));const [a,b]=files.map(rows);console.log(JSON.stringify({countEn:a.length,countKo:b.length,same:JSON.stringify(a)===JSON.stringify(b)},null,2));if(JSON.stringify(a)!==JSON.stringify(b)) process.exit(1);"` | 두 report가 같은 10개 finding summary row를 여전히 포함하는지 확인한 final lightweight check. | Passed: `countEn: 10`, `countKo: 10`, `same: true` |

## Files Inspected

검사한 주요 파일과 디렉터리:

- `README.md`
- `package.json`, `package-lock.json` 파일 존재, `tsconfig.json`, `jest.config.js`, `eslint.config.js`, `app.json`, `.gitignore`, `.env.example`
- `docs/overdrive-spec.md`, `docs/STATE.md`, `docs/phase1-plan.md`, `docs/troubleshooting.md` 검색 결과, `docs/compliance/*`
- `src/app/_layout.tsx`, `src/app/(tabs)/*`
- `src/db/schema.ts`, `src/db/migrate.ts`, `src/db/seed.ts`, `src/db/types.ts`, `src/db/repos/*`
- `src/features/quicklog/*`, `src/features/logging/*`, `src/features/combat-power/*`, `src/features/juice/*`, `src/features/arena/*`, `src/features/forge/*`, `src/features/food/*`, `src/features/evolution/*`, `src/features/rank/*`, `src/features/dailyGoals/*`, `src/features/discipline/*`, `src/features/character/*`, `src/features/rest/*`
- `src/stores/*`, `src/lib/*`, `src/ui/*`, `src/i18n/*`
- `worker/src/index.js`, `worker/package.json`, `worker/wrangler.toml`, `worker/README.md`
- `src/**/*.test.ts`에서 발견된 테스트 파일들
