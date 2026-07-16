# Reploom vNext 병렬 구현 설계

Status: **DESIGN CANDIDATE — 작업 시작 승인 아님**

## 1. 목적

여러 작업자가 동시에 움직이되 다음을 보장한다.

- 같은 파일을 두 작업자가 수정하지 않는다.
- 계약에 없는 숫자·schema·capability를 각 lane이 임의로 정하지 않는다.
- 로컬 logging, Social graph, competition, safety, release를 서로 다른 실패
  경계로 유지한다.
- 각 packet은 선행조건, 전용 경로, 금지 경로, 산출물, 검증, stop gate를
  가진다.
- 기능을 많이 만들었다는 이유로 release gate를 건너뛰지 않는다.

## 2. 병렬화 원칙

### 2.1 가능한 병렬 작업

의존하는 계약 commit이 같고 exclusive path가 겹치지 않으며 생성할 interface가
이미 고정된 작업만 동시에 한다.

### 2.2 단일 소유가 필요한 작업

- 정본과 우선순위 개정
- root/client/server module registration
- navigation migration
- SQLite logging hot-path mutation
- migration registry와 migration 번호
- generated API contract
- locale JSON
- store/privacy/release source

### 2.3 merge 전에 필요한 것

각 packet은 다음 handoff를 남긴다.

```text
Packet ID / base commit / head commit
Files changed
Contract decisions consumed
Commands and exact results
Function verification reached
Quality verification reached
Product/workflow verification reached
Known gaps / stop gates
Shared integration request
```

다른 agent의 요약만으로 merge하지 않고 integrator가 diff와 검증 명령을 다시
확인한다.

## 3. 전체 dependency graph

```text
W0a CONTRACT-01
  ├── W0b FOUNDATION-DECISION-01B
        └── W0c API-CONTRACT-02
              └── W0d OWNERSHIP-MANIFEST-03
  └── W0b LOCAL-ACHIEVEMENT-CONTRACT-01C
W0d ownership + approved local-achievement contract
        ├── readiness-approved W1a parallel fan-out
        │     ├── SERVER-FOUNDATION-10
        │     ├── LOCAL-SYNC-SEAM-11 + SETTINGS-PERSISTENCE-11B [same DB owner]
        │     ├── CLIENT-IA-12
        │     └── SAFETY-OPS-13
        ├── SERVER-FOUNDATION-10 → W1b SERVER-PERSISTENCE-BASE-14A
        ├── W2a TEXT-MODERATION-18 + REPORT-CONTEXT-19
        │       + TRAIN-GROWTH-23 [parallel]
        ├── W2b TEXT-MODERATION-18 + REPORT-CONTEXT-19 integrated → IDENTITY-20
        │       [domain/persistence ports; guarded public HTTP deferred]
        ├── W2c IDENTITY-20 ports + SAFETY-OPS-13 + SERVER-PERSISTENCE-BASE-14A
        │       → SAFETY-21 actual policy/action guard adapters
        ├── W2d IDENTITY-20 + SAFETY-21 joint integration/rebind
        │       → GRAPH-22 + SAFETY-CLIENT-25
        └── W2e GRAPH-22 + SAFETY-CLIENT-25 + CLIENT-IA-12
                → SOCIAL-CLIENT-24 + NOTIFICATION-27 backend [parallel]
                → NOTIFICATION-27 integration/client

W3a IDENTITY-20 + SAFETY-21 + SERVER-PERSISTENCE-BASE-14A + API-CONTRACT-02
      ├── SYNC-SERVER-30
      ├── LOCAL-SYNC-SEAM-11 + SETTINGS-PERSISTENCE-11B → SYNC-CLIENT-31
      └── approved metric semantics → METRIC-32
W3b SYNC-SERVER-30 + SYNC-CLIENT-31 + METRIC-32 + GRAPH-22
      → COMPETITION-33

W4 Core + Safety + capability API subcommits
      ├── MEDIA-40
      └── PARTNER-50 text/context-only core [MEDIA와 병렬 가능]
    MEDIA-40 + PARTNER-50 → optional media-card integration
W5 PARTNER-50 active Match → CHAT-60
각 capability는 API contract subcommit + Safety gate 뒤에서만 fan-out

모든 승인 capability + ANALYTICS-26 → W6 RELEASE-INTEGRATION-70
```

모든 backend domain edge에는 아래 직렬 gate를 암묵적으로 적용하지 않고 실제
subcommit으로 기록한다.

```text
DOMAIN → R-SERVER-MIG → SERVER-PERSISTENCE-ADAPTER-14B
       → SERVER-HTTP-ADAPTER-15B [public route only]
       → R-SERVER-BOOT → DOMAIN-INTEGRATION-17
```

Wave는 dependency 순서의 `EXACT` label이다. 일정, 인원, 기간이 아니다.

## 4. 공유 파일 소유권

| Registry | 단일 owner | 경로 | 다른 lane의 규칙 |
| --- | --- | --- | --- |
| `R-CONTRACT` | Contract integrator | `docs/social-v1-contract.md`, `docs/overdrive-spec.md`, `docs/reploom-vnext/README.md`, `docs/reploom-vnext/PRODUCT-EXPERIENCE.md`, `docs/reploom-vnext/DOMAIN-AND-DATA.md`, `docs/reploom-vnext/SAFETY-AND-RELEASE.md`, `docs/reploom-vnext/PARALLEL-BUILD.md` | 신규 `FOUNDATION-DECISION.md`와 achievement contract는 포함하지 않음; canonical 변경 요청만 제출 |
| `R-ROOT` | Root integrator | `package.json`, `package-lock.json`, `tsconfig.json`; 추가 root path는 Foundation decision에 명시 | 직접 수정 금지; ownership checker script는 제외 |
| `R-NAV` | Client navigation integrator | `src/app/(tabs)/_layout.tsx`, `src/app/_layout.tsx`, planned `src/app/(tabs)/train.tsx`, `social.tsx`, current `exercises.tsx`, `history.tsx` wrappers | route component만 제공 |
| `R-TODAY` | TODAY integrator | `src/app/(tabs)/index.tsx` | keep/move/remove request만 적용 |
| `R-ME` | ME migration integrator | `src/app/(tabs)/settings.tsx`, planned `src/app/(tabs)/me.tsx` | settings section PR 요청 |
| `R-LOCALE` | Localization integrator | `src/i18n/locales/*.json` | typed key request 목록 제출 |
| `R-LOCAL-DB` | Local sync integrator | `src/db/schema.ts`, `src/db/types.ts`, `src/db/migrate.ts`, packet에 열거한 logging repos | feature lane 직접 수정 금지 |
| `R-SETTINGS-PERSISTENCE` | Local DB integrator | `src/stores/settingsStore.ts`, `src/db/repos/userRepo.ts`, `src/features/program/ProgramEditorScreen.tsx`, `src/features/program/AutoPlanScreen.tsx`, planned `src/features/program/persistence/**` | program write 요청만 제출 |
| `R-SERVER-BOOT` | `SERVER-FOUNDATION-10` owner와 동일인 | `server/package*.json`, `server/tsconfig*.json`, `server/src/main.ts`, `server/src/app.module.ts`, root registration request | domain module export만 제공 |
| `R-SERVER-MIG` | Migration integrator | planned `server/src/migrations/**`, `server/test/migrations/**` | schema proposal 제출 |
| `R-SERVER-PERSIST` | Persistence integrator | planned `server/src/social/persistence/**`, `server/test/social/persistence/**` | frozen repository/transaction port만 사용 |
| `R-SERVER-HTTP` | HTTP integrator | planned `server/src/social/http/**`, `server/test/social/http/**` | domain command/query port만 연결 |
| `R-SERVER-MODERATION` | Core text moderation owner | planned `server/src/social/moderation/text/**`, `server/test/social/moderation/text/**` | provider/job/queue ports만; Profile/Crew aggregate와 media/chat는 별도 lane |
| `R-REPORT-CONTEXT` | Report-context owner | planned `server/src/social/report-context/**`, `server/test/social/report-context/**` | opaque issuer/validator/digest lifecycle만; report domain과 producer aggregate는 별도 lane |
| `R-NOTIFICATION` | Pull notification owner | planned `server/src/social/notifications/**`, `server/test/social/notifications/**`, `src/features/social/notifications/**` | generic inbox projection만; source domain과 OS push는 별도 |
| `R-API` | `API-CONTRACT-02` owner | planned `docs/contracts/social-v1.openapi.yaml`, `server/src/generated/social-v1/**`, `src/features/social/api/generated/**` | handwritten divergent DTO 금지 |
| `R-CLIENT-SAFETY` | canonical Safety/release lane | planned `src/features/social/safety/**`, `src/features/me/safety/**` | feature lane은 integration slot만 제공 |
| `R-ANALYTICS` | Analytics integrator | planned `server/src/social/analytics/**`, `server/test/social/analytics/**`, `src/features/social/analytics/**`, `docs/social-analytics/**` | raw feature data 직접 수집 금지 |
| `R-OWNERSHIP` | Ownership integrator | planned `docs/reploom-vnext/ownership-manifest.json`, `scripts/check-social-ownership.mjs` | manifest 밖 diff 병합 금지 |
| `R-RELEASE` | Release owner | `app.json`, `store.config.json`, listing/checklist, public policy/support, manifest-fixed planned `server/config/social-policy-registry.json`, production capability config path | capability lane 직접 수정 금지; runtime adapter source 직접 수정 금지 |

위 planned 경로는 W0c에서 manifest로 고정한다. 실제 저장소 구조가 달라져야
하면 feature branch가 임의로 바꾸지 않고 CONTRACT/OWNERSHIP amendment를 먼저
병합한다.

## 5. Wave 0 — 계약 정리

### `CONTRACT-01` 정본 계층·경쟁·삭제·sync 개정

**병렬성:** 단독. 다른 기능 구현의 선행조건.

**선행조건**

- 이 설계 후보에 대한 사용자 방향 승인
- 정본·기존 스펙·현재 코드 baseline 재확인

**전용 경로**

- `docs/social-v1-contract.md`
- `docs/overdrive-spec.md`
- `docs/reploom-vnext/README.md`
- `docs/reploom-vnext/PRODUCT-EXPERIENCE.md`
- `docs/reploom-vnext/DOMAIN-AND-DATA.md`
- `docs/reploom-vnext/SAFETY-AND-RELEASE.md`
- `docs/reploom-vnext/PARALLEL-BUILD.md`

`docs/reploom-achievement-contract.md`는
`LOCAL-ACHIEVEMENT-CONTRACT-01C`, 신규
`docs/reploom-vnext/FOUNDATION-DECISION.md`는
`FOUNDATION-DECISION-01B`의 exclusive path다. 두 packet과 `R-CONTRACT`는 같은
base에서 이 파일을 동시에 소유하지 않는다.

**승인된 1.1 입력**

- Social v1이 `overdrive-spec` §6.8을 제한하는 우선순위
- `socialCompetition`, `competitionEnabled`, selected competitive dataset 정확히 1개
- PolicyAcceptance, SafetyAction, Appeal support model과 rights-plane precedence
- advertised setup/effective transport 분리와 competition false/clear/dataset
  revoke/tombstone rights-first 전이
- Profile sole-private/Discoverability all-off rights classifier와 mixed/partial
  apply 금지

**남은 입력 결정·증거**

- dataset claim의 reclaim/account-switch/reinstall recovery와 sync/barrier/API bounds
- planned target metric 의미/timezone
- deletion status credential
- safety rights plane
- Crew block-role 행렬
- reportable-resource `report_context_receipt`와 report-create `report_receipt`의
  발급 surface, reporter/target binding, expiry/reuse, 위조 방지, client handoff;
  둘을 분리하고 public GET/list 없음
- Profile handle/display_name/bio normalization과 exact bounds
- Profile read는 self/accepted-friend/minimal opt-in discovery projection만 허용;
  global public profile/preview route 없음
- Profile handle/display_name/bio와 Crew name의 moderated fields, candidate revision,
  moderation enum/lifecycle, fail-closed publish, SafetyAction/Appeal/review queue ownership
- lifecycle/view/API-result event의 발생 시점·retry/dedupe 의미 분리
- pull-only in-app notification entity/kind/state/dedupe/retention/badge/open semantics;
  OS push/permission/provider는 v1 제외
- manual area/venue catalog source/version/API/governance
- NestJS 계획의 binding 여부와 dependency 승인 경계
- canonical Safety/release client-control ownership

**산출물**

- contract version bump
- 두 정본의 충돌 없는 precedence 문구
- REST/error/authz/idempotency amendment
- lifecycle event는 durable transition 뒤, surface view는 observed render 뒤,
  API result는 completed response 뒤라는 analytics semantics amendment
- Profile/Crew core text moderation enum과 pending/approved/rejected/hidden projection,
  edit/review→SafetyAction→Appeal transition amendment
- policy registry/currentness, action target-effect/notice, Appeal state/reversal amendment
- generic in-app notification REST/state/dedupe/block-suppression amendment와
  source event→recipient projection matrix
- catalog, 두 report receipt, sync/competition route amendment
- client/backend/safety/analytics lane ownership amendment
- numeric classification/TBD register
- 20개 원 요구사항 + 새 defect traceability

**금지 경로**

- product code, manifests/lockfiles, release/store/live config

**Function 검증**

- 문서 내 capability/API/entity 이름 참조 일치
- Social 비교 route가 전부 `socialCompetition`에 닫힘
- rights route가 kill과 독립임을 trace
- selected dataset exactly-one/dormant/switch와 policy/action/appeal authority trace
- single command ownership for CompetitionPreference와 typed `GET /me`
  `ordinary | rights_only` route-owner trace
- Profile/Discoverability controller-domain-repository classifier trace

**Quality 검증**

- `git diff --check`
- Markdown link/path 검사
- 금지어/구 정본 충돌 검색
- 독립 red-team review

**Stop gate**

- 정본 우선순위가 여전히 양쪽에서 다름
- `socialCore`만으로 comparison route가 열림
- policy/action/capability guard가 protective rights를 먼저 차단
- 미검증 retention/SLO를 binding exact로 묶음

### `LOCAL-ACHIEVEMENT-CONTRACT-01C` TRAIN/Growth 계산 계약

**병렬성:** `FOUNDATION-DECISION-01B`와 병렬 가능하다. feature code보다 먼저
승인한다.

**선행조건**

- approved `CONTRACT-01` base와 제품 IA 방향
- 현재 workout/history/program/CP/weekly-target source와 수정·삭제 경로 재확인

**전용 경로**

- planned `docs/reploom-achievement-contract.md`

**공유 요청 경로**

- `R-CONTRACT`에 `docs/overdrive-spec.md`의 개인 성취 정의 amendment 요청
- `R-TODAY`, `R-NAV`, `R-LOCALE`에는 구현 단계 integration request만 작성

**금지 경로**

- product source, Social server/API, manifests/lockfiles

**산출물**

- 운동/기록 종류별 PR metric catalog, version, tie, `not_ranked` 의미
- local consistency의 계획 분모·완료 분자·계획 0·추가 운동 의미
- edit/delete/import correction의 invalidate/recompute/backfill 규칙
- week anchor/timezone과 weekly self-PR target 입력·선정·완료 규칙
- TODAY 최근 성취 최대 1개 선택 우선순위와 정확한 Growth deep-link
- History/개인 CP 재사용 경계와 Social competition projection 분리

**검증**

- strength/cardio/meal 제외 경계와 metric별 golden fixtures
- edit/delete/timezone/DST/plan-zero/동점/not-ranked fixtures
- weekly target이 generated rival/CP/실제 사람 값에 의존하지 않음
- TODAY와 TRAIN이 같은 local projection/version을 읽고 저장 로직을 복제하지 않음

**Stop gate**

- 모든 운동에 하나의 임의 PR 공식을 적용
- body/외모/CP/`verifiedRatio`를 실제 사람 비교 입력으로 재사용
- 수정·삭제 backfill 또는 TODAY 선택 규칙이 `[TBD]`인데 `TRAIN-GROWTH-23` 시작
- weekly target이 `rival.ts`/`useArena.ts`에 계속 결합

### `FOUNDATION-DECISION-01B` 서버·도구 topology 결정

**병렬성:** 단독. API schema와 ownership manifest보다 먼저 승인한다.

**선행조건**

- approved `CONTRACT-01` commit
- 현재 root/client/server package·lockfile·tsconfig 재확인
- 새 dependency가 필요하면 사용자에게 package/version/목적/대안 승인 요청

**전용 경로**

- planned `docs/reploom-vnext/FOUNDATION-DECISION.md`

**금지 경로**

- product/server 구현, root/server manifest·lockfile, generated source

**산출물**

- NestJS package topology와 exact approved versions 또는 명시적 unresolved gate
- root/server package·lockfile·tsconfig 소유 경로
- auth transport boundary와 provider-neutral `AuthVerifier` port
- PostgreSQL access/migration executor 경로와 migration numbering policy
- OpenAPI source/generation/fixture 경로와 승인된 parser/generator
- production capability config와 release-owned policy registry config의 단일
  cross-platform 경로; runtime Safety adapter 경로와 owner 분리
- macOS/Windows clean-install 및 CI command matrix

**검증**

- 현재 lockfile/manifest와 official primary source를 양방향 대조
- 개인 경로·단일 agent/CLI 고정·platform-only command 0개
- fresh checkout에서 필요한 install/build 명령을 문서로 재현 가능하게 검토

**Stop gate**

- package/version/provider/tool/path가 `[TBD]`인데 scaffold를 시작
- 새 dependency를 승인 없이 manifest에 추가
- macOS 또는 Windows route가 없는 topology 승인

### `API-CONTRACT-02` transport-neutral API schema

**선행조건**

- approved `CONTRACT-01`, `FOUNDATION-DECISION-01B` commits
- route/error/authz/cursor/idempotency 결정 0개 미해결

**전용 경로**

- planned `docs/contracts/social-v1.openapi.yaml`
- planned `docs/contracts/fixtures/social-v1/**`

**금지 경로**

- `server/src/**`, `src/features/**`, root manifest/lockfile

**산출물**

- versioned route/request/response/error/cursor schemas
- unknown-field rejection와 forbidden-field fixtures
- auth principal은 schema body/header actor field가 아님을 명시
- capability별 contract sections
- Profile/Crew moderated-field candidate/approved projection과 moderation enum/error
  schema; pending/rejected content가 타인 response에 없음
- notification list/detail/read schema, generic copy/kind allowlist, source target/text
  forbidden fixtures; OS push endpoint 없음
- policy acceptance/currentness와 generalized SafetyAction notice schema;
  `actionReceipt` 기반 Appeal create/own-state, internal actor/evidence forbidden fixtures
- `GET /me` typed `ordinary | rights_only` response; route adapter owner는
  `HTTP-SAFETY-15B` 하나이며 Identity/Safety query fragment를 조합
- Profile sole-private와 Discoverability all-off/clear command classifier:
  authored/media/visibility expansion, true opt-in, attestation/new selection,
  mixed narrowing+expansion은 ordinary 또는 whole-request reject; partial apply
  forbidden fixtures를 controller/domain/repository layer별 고정
- dataset claim/list/revoke/preferences와 selected-only session/program/barrier schema;
  advertised setup vs effective transport guard, rights-first false/clear/revoke/
  tombstone, dormant upload/switch/rebaseline/no-winner cancellation fixtures
- reportable projection의 `reportContextReceipt`와 `POST /reports` 입력 schema;
  reporter/target/type/expiry binding을 public target ID 대신 server 검증
- `POST /reports` 출력 `reportReceipt`에는 internal status/evidence가 없고
  GET/list/history도 없음을 명시

**검증**

- 승인된 OpenAPI parser/validator로 parse
- canonical contract의 route/error/enum과 양방향 trace
- example에 secret/raw ID/location/workout content 없음

**Stop gate**

- validator 또는 generator를 위해 새 dependency를 무승인 추가
- schema가 미확정 provider/framework type을 노출
- client/server가 각자 다른 handwritten DTO를 만들게 둠

### `OWNERSHIP-MANIFEST-03` 기계적 allowed-glob 계약

**선행조건**

- `CONTRACT-01`, `FOUNDATION-DECISION-01B`, `API-CONTRACT-02`
- 모든 planned path와 registry owner 승인

**전용 경로**

- planned `docs/reploom-vnext/ownership-manifest.json`
- planned `scripts/check-social-ownership.mjs`

**금지 경로**

- manifest에 등록된 feature/client/server implementation 경로 전부

**산출물**

- packet별 exact allowed globs, shared-request globs, forbidden globs
- `concurrentExclusive` 경로는 동시에 한 packet만 허용하고,
  `sameOwnerSequential` 경로는 같은 registry owner가 직렬 phase에서만 재사용하는
  lifecycle-aware 소유 모델
- base/head diff를 검사하는 Node built-in-only cross-platform script
- macOS/Windows path separator fixture

**검증**

- 허용 fixture는 exit 0, concurrent overlap/unknown/shared-direct-edit와
  서로 다른 owner의 sequential 재사용 fixture는 non-zero
- 개인 경로, bash, `/bin/*`, external package 사용 0개

**Stop gate**

- description-only path 또는 wildcard overlap이 한 개라도 남음
- ownership checker가 Windows/macOS 중 한 platform에서만 동작

## 6. Wave 1 — 독립 기반

W0d까지 승인된 integration commit을 공통 base로 쓴다. 아래 readiness가 모두
green일 때만 각 packet을 연다. 이 문서 승인 자체는 phase authority가 아니다.

phase authority는 packet별로 별도 확인한다.

- `SERVER-FOUNDATION-10`, `LOCAL-SYNC-SEAM-11`,
  `SETTINGS-PERSISTENCE-11B`, sync/metric backend는 recorded Phase 1 acceptance와
  Phase 2 backend/sync entry가 필요하다.
- `CLIENT-IA-12`의 Social shell과 모든 Identity/Safety/Graph/Competition/Media/
  Partner/Chat code는 Phase 2 acceptance 뒤 recorded Phase 4 Social entry가
  필요하다.
- 위 순서를 바꾸려면 기존 docs 승인으로 추론하지 않고
  `docs/overdrive-spec.md`의 explicit roadmap amendment와 replacement acceptance
  order를 먼저 기록한다.
- `SAFETY-OPS-13` 같은 문서/운영 설계는 앞서 준비할 수 있지만 code/config/
  migration/release authority를 부여하지 않는다.

| Packet | 추가 readiness |
| --- | --- |
| Server | recorded Phase 1 acceptance + Phase 2 entry; NestJS dependency/version/topology 승인, auth transport 경계, platform CI route |
| Local sync | recorded Phase 1 acceptance + Phase 2 entry; exact-one selected/dormant/switch contract, dataset/program revision contract, DB owner, 동일 fixture/device class benchmark protocol과 logging latency `MAX` 회귀 threshold 승인 |
| Client IA | recorded Phase 4 Social entry; route migration map, flag-off layout, shell path manifest |
| Safety Ops | accountable safety/legal/privacy/operations owners 지정 |

### `SERVER-FOUNDATION-10` strict server scaffold와 auth port

**Owner:** `R-SERVER-BOOT`와 동일인.

**전용 경로**

- `server/package*.json`
- `server/tsconfig*.json`
- `server/src/main.ts`
- `server/src/app.module.ts`
- `server/src/platform/**`
- `server/src/auth/**`
- `server/test/platform/**`
- `server/test/auth/**`
- `server/test/bootstrap/**`

**공유 소유**

- `R-ROOT`, `R-SERVER-MIG`; 직접 수정하지 않고 integration request 제출

**선행조건**

- 정본의 NestJS scaffold dependency/version 별도 승인
- auth topology 선택 또는 transport-neutral port 범위 승인
- macOS/Windows clean-install route

**산출물**

- strict compiler boundary
- health/readiness와 requestId plumbing
- `AuthVerifier` port
- issuer/audience/expiry/subject negative fixtures
- ordinary identity header와 StoreKit/subscription token 거부 fixture
- empty/additive migration rehearsal harness

**금지**

- `worker/src/**`, subscription code 수정
- provider/issuer literal 하드코딩
- 아직 승인되지 않은 Social feature 구현

**검증**

- server typecheck/lint/unit/contract/migration/build scripts
- clean DB up/rollback/upgrade fixture
- Windows + macOS clean install

**Stop gate**

- 새 dependency 미승인
- auth actor를 body/header에서 유도
- root config를 여러 lane이 수정

### `SERVER-PERSISTENCE-BASE-14A` transaction/repository/outbox seam

**선행조건**

- `SERVER-FOUNDATION-10`, `API-CONTRACT-02`
- PostgreSQL/migration executor/ORM 또는 SQL 접근 방식 승인
- `R-SERVER-MIG` 번호와 rollback policy

**전용 경로**

- `server/src/social/persistence/base/**`
- `server/test/social/persistence/base/**`

**금지 경로**

- `server/src/social/http/**`, domain feature folders, server/root manifests

**산출물**

- transaction port와 repository conventions
- canonical pair/owner/optimistic-version helpers
- generic idempotency ledger port
- domain outbox atomic boundary
- migration/checksum/advisory-lock adapter request
- deletion/suppression-aware query base

**검증**

- commit/rollback/outbox atomicity
- concurrent idempotency/pair/owner fixtures
- clean/upgrade/rollback migration rehearsal
- PostgreSQL integration test와 forbidden log scan

**Stop gate**

- base contract가 domain write와 outbox/idempotency를 한 transaction으로 표현할 수 없음
- ORM 기본 동작을 검증 없이 checksum/lock으로 가정
- domain row에 `actor_key` 경로 추가

### `SERVER-PERSISTENCE-ADAPTER-14B` domain repository adapter

이 packet은 backend domain마다 반복하며 domain packet과 동시에 실행하지 않는다.

**선행조건**

- `SERVER-PERSISTENCE-BASE-14A`, `API-CONTRACT-02`
- 대상 domain packet의 frozen repository port와 schema request가 integration base에 병합됨
- `R-SERVER-MIG` owner의 migration/checksum subcommit과 clean DB 적용 evidence

**전용 경로**

- `server/src/social/persistence/adapters/<domain>/**`
- `server/test/social/persistence/adapters/<domain>/**`

**금지 경로**

- domain/http implementation, manifests, migration registry

**산출물**

- 대상 domain repository/query adapter
- idempotency/outbox/transaction binding
- approved migration의 schema/index/constraint에 대한 adapter binding

**검증**

- PostgreSQL transaction/rollback/race/constraint fixture
- suppression/deletion/block query precedence
- forbidden `actor_key`, raw location/content/log scan

**Stop gate**

- domain port를 adapter가 임의 변경
- domain mutation과 idempotency/outbox가 non-atomic
- migration subcommit 없이 adapter를 구현하거나 다음 packet이 소비

### `SERVER-HTTP-BASE-15A` 공통 transport 기반

**선행조건**

- `SERVER-FOUNDATION-10`, `API-CONTRACT-02`

**전용 경로**

- `server/src/social/http/base/**`
- `server/test/social/http/base/**`

**금지 경로**

- domain/persistence implementation, manifests, canonical OpenAPI

**산출물**

- verified principal injection, strict DTO seam, requestId, error envelope, cursor
- capability/rights-plane guard ordering
- generated DTO integration request

**검증**

- OpenAPI conformance와 unknown/forbidden field rejection
- actor body/header spoof, 404 masking, status/error mapping
- rights route가 capability kill 중 동작

**Stop gate**

- base transport가 domain invariant/owner를 재구현
- ordinary client header를 verified principal로 사용
- frozen API schema와 response drift

### `SERVER-HTTP-ADAPTER-15B` domain transport adapter

이 packet은 backend domain마다 `SERVER-PERSISTENCE-ADAPTER-14B`와 migration
subcommit 뒤 반복한다.

**선행조건**

- `SERVER-HTTP-BASE-15A`, `API-CONTRACT-02`
- 대상 domain command/query port, persistence adapter, migration subcommit
- reportable route면 `REPORT-CONTEXT-19` integration과 producer의 typed
  `ReportableTargetRef`

**전용 경로**

- `server/src/social/http/adapters/<domain>/**`
- `server/test/social/http/adapters/<domain>/**`

**금지 경로**

- domain/persistence implementation, manifests, canonical OpenAPI

**산출물**

- 대상 domain controller/guard/status/error mapping
- generated DTO binding과 API conformance fixture
- reportable route는 domain authorization 성공 뒤 `ReportContextIssuer`를 호출해
  `reportContextReceipt`를 붙이고 route/surface coverage matrix를 갱신
- `R-SERVER-BOOT` module registration request

**검증**

- OpenAPI conformance와 unknown/forbidden field rejection
- actor spoof, IDOR, 404 masking, capability/rights guard ordering
- reportable route는 authz 실패 issue 0건, 성공 response receipt 1건;
  Profile/Invite/Duel/Crew member/Match/message matrix coverage
- rights route가 capability kill 중 동작

**Stop gate**

- controller가 domain invariant/owner를 직접 재구현
- target opt-in/private/block 상태를 전용 오류로 누설
- reportable response가 receipt 없이 나가거나 issuer를 authz 전에 호출
- boot registration 전 client/test environment에 노출

### `LOCAL-SYNC-SEAM-11` 로컬 revision/outbox 기반

**전용/단일 소유 경로**

- `src/db/schema.ts`
- `src/db/types.ts`
- `src/db/migrate.ts`
- `src/db/repos/sessionRepo.ts`
- `src/db/repos/setLogRepo.ts`
- `src/db/repos/cardioRepo.ts`
- 신규 `src/db/repos/socialSync*.ts`
- `src/db/migrate.test.ts`
- `src/db/repos/sessionRepo.test.ts`
- `src/db/repos/setLogRepo*.test.ts`
- planned `src/db/repos/cardioRepo*.test.ts`
- planned `src/db/repos/socialSync*.test.ts`

**선행조건**

- selected competitive dataset 정확히 1개, dormant transport 금지, pending/active
  Duel switch 금지, post-switch rebaseline을 포함한 dataset state/revision/barrier contract 승인
- current DB mutation path와 migration version 재감사
- 동일 fixture/device class의 logging latency baseline, 반복 횟수, percentile,
  허용 `MAX` regression threshold 승인

**산출물**

- additive local tables
- session aggregate revision
- dataset-wide revision
- 작은 dirty reference UPSERT
- tombstone과 coalescing covered range
- app downgrade/forward behavior

**금지**

- snapshot/hash/network/auth를 logging transaction에 넣기
- `LOCAL_USER_ID`를 social ID로 변경
- install 시 자동 dataset claim
- Health/imported data outbox

**Function 검증**

- set/session/cardio create/edit/delete마다 revision/outbox atomic
- transaction rollback 시 둘 다 rollback
- coalesce가 dataset barrier gap을 만들지 않음
- 기존 local logging tests regression 없음

**Quality 검증**

- migration clean/upgrade/foreign-key tests
- 승인된 동일 조건 baseline 대비 `MAX` regression threshold 이내
- offline/app-kill durability

**Stop gate**

- 기록 저장이 network에 의존
- payload/hash 작업이 hot transaction에 들어감
- 기존 기록 row를 destructive migration
- benchmark protocol 또는 `MAX` latency threshold 미승인

### `SETTINGS-PERSISTENCE-11B` program durable command

**Owner:** `R-LOCAL-DB`와 `R-SETTINGS-PERSISTENCE`를 맡은 동일인. DB hot path와
동시에 병렬 수정하지 않고 `LOCAL-SYNC-SEAM-11` 뒤 같은 branch에서 수행한다.

**선행조건**

- `LOCAL-SYNC-SEAM-11`의 dataset/program revision port
- program snapshot/metric 의미 승인

**전용 경로**

- `src/stores/settingsStore.ts`
- `src/db/repos/userRepo.ts`
- `src/features/program/ProgramEditorScreen.tsx`
- `src/features/program/AutoPlanScreen.tsx`
- planned `src/features/program/persistence/**`
- planned `src/features/program/persistence/*.test.ts`

**금지 경로**

- session/set/cardio repos, tab layout, Social transport

**산출물**

- `customProgram` save + program revision + dataset revision/outbox의 한 durable
  transaction
- editor/auto-plan이 command receipt로 UI state를 확정
- program 외 settings 변경은 sync revision을 만들지 않음

**검증**

- program save/rollback/outbox atomicity
- editor/auto-plan failure UI
- account unclaimed/paused/do-not-resync 상태
- 기존 settings hydration/persistence regression

**Stop gate**

- in-memory apply가 DB 실패 뒤 성공처럼 남음
- program write와 sync revision이 서로 다른 durable boundary
- skin/locale 등 비program 설정이 workout sync를 발생

### `CLIENT-IA-12` 5탭 shell과 route component

**전용 경로**

- planned `src/features/train/shell/**`
- `src/features/social/shell/**`
- planned `src/features/me/shell/**`
- planned `src/features/navigation/*.test.tsx`

**단일 통합 경로**

- `R-NAV`, `R-ME`, `R-LOCALE`

**선행조건**

- IA와 flag-off behavior 승인
- 기존 route migration map 승인

**산출물**

- TODAY/TRAIN/+LOG/SOCIAL/ME shell
- TRAIN Plan/Explore/Growth navigation
- Social 친구/주변/크루 shell
- ME section shell
- capability/account/loading/empty/offline/error states
- shared components는 existing skin token만 사용
- `R-NAV`에 `train.tsx/social.tsx/me.tsx`와 fixed-center +LOG integration request
- `R-ME`에 592-line Settings 해체와 program entry 제거 request

**금지**

- Social fixture를 실제 사람/실서버처럼 표시
- 새로운 저장 로직 복제
- 직접 `_layout.tsx`, settings, locale 동시 수정

**검증**

- route render/snapshot/accessibility
- flag off/on navigation order
- offline local tab access
- supported skin/text-size visual QA

**Stop gate**

- 현재 1.0 review source를 함께 변경
- dead SOCIAL tab 또는 +LOG reorder
- hard-coded color/franchise graphic

### `SAFETY-OPS-13` 운영 계약과 rehearsal 설계

**전용 경로**

- planned `docs/social-safety/README.md`
- planned `docs/social-safety/MODERATION-RUNBOOK.md`
- planned `docs/social-safety/RETENTION-MATRIX.md`
- planned `docs/social-safety/BACKUP-DELETION-REHEARSAL.md`
- planned `docs/social-safety/NEARBY-THREAT-MODEL.md`
- planned `docs/social-safety/CREW-BLOCK-MATRIX.md`
- planned `docs/social-safety/POLICY-REGISTRY.md`
- planned `docs/social-safety/SAFETY-ACTION-APPEAL-MATRIX.md`

**선행조건**

- safety owner와 운영 담당자 지정
- 법률/개인정보 검토 경로 지정

**산출물**

- category→suppression/triage/escalation 행렬
- queue/on-call/overflow kill 절차
- evidence access/audit/appeal
- data별 finite retention proposal
- policy registry/version-bump behavior, SafetyAction target×kind effect/notice,
  Appeal reviewer/retention/SLO proposal
- frozen `PolicyRegistryPort`, `SafetyWriteGuard`, `SafetyRightsGuard`,
  `SafetyTargetEffectPort` contracts와 deny-by-default deterministic test fakes;
  release-owned current-version source schema. acceptance row/route는 Identity가
  소유하고 runtime policy/action adapter는 Safety가 소유
- backup restore+delete rehearsal
- sparse venue abuse test plan
- Crew block-role resolution proposal

**금지**

- 미지정 인력을 24/7처럼 약속
- 검증 없는 SLO를 public promise로 사용
- open case를 무기한 방치

**검증**

- named owner/on-call/escalation/overflow table에 빈 필드 0개
- 모든 데이터 class에 finite/TBD-blocking retention과 deletion path
- tabletop high-severity, queue overflow, backup restore+delete rehearsal
- sparse venue enumeration/correlation test 결과
- policy supersession tabletop, suspension rights-route rehearsal, Appeal reviewer
  separation/modified replacement/reversal no-restore rehearsal
- frozen guard/target-effect port conformance: kill/stale/restrict/suspend ordinary
  write 거부, rights-first transition 허용

**Stop gate**

- accountable owner 없음
- high severity 즉시 suppression/escalation 없음
- retention과 backup 삭제 경로 없음
- current policy source/roll-forward/rollback owner 또는 Appeal reviewer separation 없음

### `SHARED-INTEGRATION-16` registry request 적용

이 packet은 각 wave 끝에서 반복한다. 동시에 여러 shared file을 고치는 작업이
아니라, 지정된 registry owner가 자기 subcommit을 순서대로 만들고 한 integration
owner가 전체를 검증하는 직렬 gate다.

**선행조건**

- source packet의 diff/test/request handoff 승인
- `OWNERSHIP-MANIFEST-03` checker green
- root/package/generated change가 있으면 dependency/tool 승인

**전용 변경 경로**

- 없음. 이 packet은 파일을 직접 고치지 않는 merge/verification orchestrator다.
- `R-ROOT`, `R-NAV`, `R-TODAY`, `R-ME`, `R-LOCALE`, `R-SERVER-BOOT`,
  `R-SERVER-MIG`, `R-API`, `R-CLIENT-SAFETY`, `R-NOTIFICATION` owner가 자기
  exact 경로를 `sameOwnerSequential` subcommit으로 적용하고 이 packet은 승인된
  subcommit만 소비한다. Safety/notification subcommit은 source feature packet의
  opaque receipt/event request만 소비하고 domain authority를 재구현하지 않는다.

**금지 경로**

- domain/client feature implementation, subscription Worker, release/store sources

**산출물**

- fixed-center +LOG와 route migration
- TODAY keep/move/remove, ME Settings split, locale keys
- approved module/migration/generated-contract registration
- approved Safety action-slot와 notification-kind consumer registration
- wave integration commit과 conflict/decision log

**검증**

- ownership checker, strict type/lint/test/build의 해당 범위
- route order/flag-off/deep-link tests
- generated API diff와 canonical schema conformance
- migration registry/checksum rehearsal

**Stop gate**

- source packet이 shared file을 직접 수정
- generated code를 수동 편집하거나 schema와 drift
- current 1.0 release/store source가 함께 바뀜

### `DOMAIN-INTEGRATION-17` backend domain 소비 가능 gate

이 packet은 Identity, Safety, Graph, Sync, Competition, Media, Partner, Chat
backend마다 반복한다. Domain 구현 commit만으로 client나 다음 domain의 실행
환경이 되었다고 간주하지 않는다.

**선행조건**

- 대상 domain packet의 frozen command/query/repository ports와 handoff
- `SERVER-PERSISTENCE-BASE-14A`, `SERVER-HTTP-BASE-15A`
- `OWNERSHIP-MANIFEST-03` checker green

**전용 변경 경로**

- 없음. registry subcommit을 정해진 순서로 소비하고 검증만 수행한다.

**금지 경로**

- domain/client/shared source 직접 수정
- packet owner 대신 conflict를 임의로 해결

**산출물**

1. `R-SERVER-MIG` migration/checksum subcommit과 clean DB 적용 evidence
2. `SERVER-PERSISTENCE-ADAPTER-14B` subcommit
3. public route domain은 `SERVER-HTTP-ADAPTER-15B` subcommit; internal-only
   service는 API/HTTP `N/A` 근거와 직접 호출 port test
4. `R-SERVER-BOOT` module registration subcommit
5. 네 subcommit을 포함한 domain integration commit과 client-consumable test URL/fixture

**검증**

- public route는 `MIG → PERSIST → HTTP → BOOT`, internal-only service는
  `MIG → PERSIST → port test → BOOT` 순서와 각 registry owner 확인
- clean DB migration + repository integration + OpenAPI conformance + server boot
- 대상 domain negative authz/rights/capability tests
- Sync는 frozen client mock과 실제 server contract E2E까지 포함

**Stop gate**

- 해당 mode의 필수 단계 중 하나라도 빠진 domain을 client/다음 domain이 소비
- domain port/schema를 adapter owner가 무승인 변경
- boot만 성공하고 repository/HTTP negative test가 실행되지 않음

반복 template의 `<domain>`은 실제 manifest에서 허용되는 wildcard가 아니다.
W0d에서 다음 concrete instance row로 확장하며, 각 row는 자기 exact adapter
directory만 `concurrentExclusive`로 소유한다.

| Domain | Persistence instance | HTTP instance | Integration instance |
| --- | --- | --- | --- |
| Core text moderation | `PERSIST-MODERATION-14B` | `N/A-internal-port` | `INTEGRATE-MODERATION-17` |
| Report context | `PERSIST-REPORT-CONTEXT-14B` | `N/A-internal-port` | `INTEGRATE-REPORT-CONTEXT-17` |
| Identity | `PERSIST-IDENTITY-14B` | `HTTP-IDENTITY-15B` (`GET /me` 제외) | `INTEGRATE-IDENTITY-17` (Safety rebind 뒤 완료) |
| Safety | `PERSIST-SAFETY-14B` | `HTTP-SAFETY-15B` (`GET /me` 단독 composite owner) | `INTEGRATE-SAFETY-17` (Identity joint verification 포함) |
| Graph | `PERSIST-GRAPH-14B` | `HTTP-GRAPH-15B` | `INTEGRATE-GRAPH-17` |
| Notification | `PERSIST-NOTIFICATION-14B` | `HTTP-NOTIFICATION-15B` | `INTEGRATE-NOTIFICATION-17` |
| Sync | `PERSIST-SYNC-14B` | `HTTP-SYNC-15B` | `INTEGRATE-SYNC-17` |
| Competition | `PERSIST-COMPETITION-14B` | `HTTP-COMPETITION-15B` | `INTEGRATE-COMPETITION-17` |
| Media | `PERSIST-MEDIA-14B` | `HTTP-MEDIA-15B` | `INTEGRATE-MEDIA-17` |
| Partner/catalog | `PERSIST-PARTNER-14B` | `HTTP-PARTNER-15B` | `INTEGRATE-PARTNER-17` |
| Chat | `PERSIST-CHAT-14B` | `HTTP-CHAT-15B` | `INTEGRATE-CHAT-17` |

각 instance는 위 `14B`/`15B`/`17` template의 선행조건·금지·산출물·검증·Stop
gate를 그대로 상속한다. manifest 생성 시 `<domain>`을 남기면 W1 readiness는
실패다.

Identity는 예외적으로 `PERSIST-IDENTITY-14B`와 domain port 검증까지만 Safety보다
먼저 수행한다. `HTTP-IDENTITY-15B`는 `GET /me`를 소유하지 않으며 guarded public
Identity routes의 boot/integration은 `SAFETY-21`의 real policy/action adapters가
준비된 뒤다. `HTTP-SAFETY-15B` 한 곳이 Identity query fragment와 Safety query
fragment를 조합해 typed `ordinary | rights_only` `GET /me`를 bind한다. Safety
integration은 actual guard binding 뒤 Identity negative suite까지 재실행해야
`INTEGRATE-IDENTITY-17`과 `INTEGRATE-SAFETY-17`을 완료할 수 있다.

### `TEXT-MODERATION-18` Profile·Crew core text moderation

**전용 경로**

- `server/src/social/moderation/text/**`
- `server/test/social/moderation/text/**`

**선행조건**

- `CONTRACT-01`의 moderated fields, Profile/Crew enum, candidate revision,
  edit/review/reject/hide lifecycle와 rejection -> `SafetyAction` handoff 승인
- `SERVER-FOUNDATION-10`, `SERVER-PERSISTENCE-BASE-14A`, `SAFETY-OPS-13`
- provider-neutral queue/port와 finite content/job retention 승인

**산출물**

- provider-neutral `ModerationSubmitPort`/`ModerationDecisionPort`와 deterministic
  test fake; Identity/Graph aggregate가 candidate revision을 소유
- provider job/queue state, candidate revision correlation, out-of-order/duplicate
  decision suppression; Profile/Crew aggregate state는 소유하지 않음
- `ModerationQueueAdminPort`, `ModerationReviewPort`, `ModerationAuditPort`와
  least-privilege caller matrix; Safety만 queue/review/audit를 사용. Public Appeal
  aggregate/REST는 Safety domain이 소유
- timeout/provider unavailable 시 unresolved job 유지와 queue/outbox retry;
  Identity/Graph는 aggregate `pending`을 유지
- moderation job/revision frozen repository port와 `R-SERVER-PERSIST` request
- `R-SERVER-MIG`/`R-SERVER-BOOT` integration requests; public HTTP는 없음

**금지 경로**

- Identity/Profile, Graph/Crew, media/chat, HTTP, persistence adapter 직접 수정
- provider/model/binary를 단일 고정값으로 하드코딩
- pending/rejected text를 analytics/ordinary log/error에 기록

**검증**

- submit/decision/retry/timeout/out-of-order callback job-state golden fixtures
- job retry/duplicate callback exactly-one state effect
- Identity/Graph test fake가 승인된 aggregate decision payload만 수신
- queue admin/review/audit caller 권한과 IDOR fixtures
- raw handle/display/bio/Crew name forbidden log/analytics scan

**Stop gate**

- fixed Profile/Crew moderation enum/lifecycle 구현 readback 또는 field bounds/
  projection/provider queue 정책 미승인
- accountable queue/review/SafetyAction/Appeal/retention owner 없음
- provider failure에서 content가 approved/discoverable로 fail-open
- production adapter 없이 public Social rollout을 승인

### `REPORT-CONTEXT-19` block-after-report 증명 seam

**전용 경로**

- `server/src/social/report-context/**`
- `server/test/social/report-context/**`

**선행조건**

- `CONTRACT-01`/`API-CONTRACT-02`의 context-vs-creation receipt 계약
- `SERVER-FOUNDATION-10`, `SERVER-PERSISTENCE-BASE-14A`
- 발급 surface, token bounds, expiry, reuse/rate, deletion/retention 결정

**산출물**

- `ReportContextIssuer`와 `ReportContextValidator` provider-neutral ports
- reporter/target type/internal target/version/issued-at/expiry binding
- opaque public token + server-side digest lifecycle; raw token 비저장
- authenticated-and-authorized `ReportableTargetRef`만 발급하는 policy
- block은 read를 닫되 receipt의 report purpose는 유지하는 validator
- frozen repository port와 `R-SERVER-PERSIST`, `R-SERVER-MIG`, `R-SERVER-BOOT`
  integration requests; public HTTP는 없음

**금지 경로**

- Identity/Graph/Competition/Partner/Chat producer, HTTP adapter, Safety Report
  domain 직접 수정
- target ID, reporter ID, token을 ordinary log/analytics/URL에 기록
- `reportReceipt` 생성/조회/history 기능 구현

**검증**

- viewer/target/type/version swap, tamper, expiry, cross-account, delete fixtures
- authorized read 전 issue 0건, block 전 issue → block 후 validate/report 가능
- raw token DB/log/analytics scan 0건; digest collision/reuse/rate fixtures
- `reportReceipt`와 type/API/schema 수준 혼용 0건

**Stop gate**

- expiry/reuse/rate/deletion retention 미승인
- raw target/body ID를 receipt 대신 authority로 사용
- producer HTTP coverage matrix 없이 reportable surface를 integration
- token/digest가 log·URL·analytics에 노출

## 7. Wave 2 — Core와 권리

Wave 2는 한 덩어리 병렬 묶음이 아니다.

1. `W2a`: `TEXT-MODERATION-18`, `REPORT-CONTEXT-19`,
   `TRAIN-GROWTH-23`만 병렬.
2. Text moderation과 report context의 각 `DOMAIN-INTEGRATION-17` 뒤
   `W2b`에서 `IDENTITY-20` domain과 persistence port까지만 만든다.
3. Identity frozen ports 뒤 `W2c`에서 `SAFETY-21` actual policy/action guard와
   composite query를 만든다.
4. Identity/Safety joint integration에서 real guard를 bind하고 Identity negative
   suite를 재실행한 뒤 `W2d`에서 `GRAPH-22`와 `SAFETY-CLIENT-25`를 병렬 수행한다.
5. Graph의 `DOMAIN-INTEGRATION-17` 뒤 `W2e`에서 `SOCIAL-CLIENT-24`,
   `NOTIFICATION-27` backend, `ANALYTICS-26`의 준비된 부분을 병렬 수행하고,
   Notification domain integration 뒤 client/header를 직렬 적용한다.

각 subwave는 직전 integration commit을 base로 한다. 같은 `W2` 숫자라는 이유로
선행 interface가 없는 branch를 동시에 시작하지 않는다.

### `IDENTITY-20` account/profile/discoverability

**전용 경로**

- `server/src/social/identity/**`
- `server/test/social/identity/**`

**선행조건**

- `SERVER-FOUNDATION-10`, `SERVER-PERSISTENCE-BASE-14A`, `API-CONTRACT-02`
- Text moderation의 `DOMAIN-INTEGRATION-17`과 frozen
  `ModerationSubmitPort`/`ModerationDecisionPort`
- Report context의 `DOMAIN-INTEGRATION-17`과 `ReportContextIssuer`
- auth/deletion credential 결정
- `CONTRACT-01`/`API-CONTRACT-02`에서 승인된 Profile normalization과
  handle/display_name/bio exact bounds
- `SAFETY-OPS-13`의 frozen `PolicyRegistryPort`, `SafetyWriteGuard`,
  `SafetyTargetEffectPort`, `SafetyRightsGuard`와 deny-by-default test fakes
- migration owner가 schema 번호 배정

**산출물**

- bootstrap, explicit account create, own profile/discoverability, immutable
  PolicyAcceptance/currentness projection
- frozen `PolicyAcceptanceGuard` port; current-policy requirement와 protective
  write exemption을 domain caller가 동일하게 적용
- `SafetyWriteGuard` consumer를 Profile/discoverability ordinary write 앞에 적용하고
  `SafetyTargetEffectPort` consumer로 exact revision suppress/restore command를
  처리; Identity는 actual SafetyAction row를 쓰지 않음
- validated-result `RightsMutationClassifier`: Profile은 sole
  `visibility=private`, Discoverability는 every flag false + scope off +
  area/venue clear만 rights-first. authored/enable/mixed command는 ordinary guard를
  통과하거나 전부 거부하며 일부 narrowing field만 commit하지 않음
- `GET /me`용 Identity query fragment와 typed `ordinary | rights_only` fragment
  contract. public route binding은 `HTTP-SAFETY-15B`만 수행
- private default
- handle/display_name/bio candidate revision과 moderation-state transition;
  pending/rejected/hidden은 self 외 query에서 제거
- rejected/hidden moderation decision의 version-bound SafetyAction intent/outbox;
  SafetyAction/Appeal row는 직접 수정하지 않음
- verified principal→social_user_id resolver
- deletion status scope seam
- exact handle normalization bounds `[approved values only]`
- authorized Profile query의 typed `ReportableTargetRef`와
  `R-SERVER-HTTP` receipt-decoration request
- frozen repository port와 `R-SERVER-PERSIST` adapter request
- `R-SERVER-MIG` schema/migration request
- `R-SERVER-HTTP` route adapter request

이 packet 단계에서는 frozen fake로 domain/persistence contract를 검증하고 public
guarded route를 boot하지 않는다. `SAFETY-21`이 actual adapter를 만든 뒤 joint
Identity/Safety integration에서 real binding과 HTTP negative suite를 다시 실행한다.

**금지 경로**

- `server/src/social/http/**`, `server/src/social/persistence/**`
- subscription Worker/client/release sources

**검증**

- no auto-provision
- binding uniqueness/revocation
- Profile initial/edit moderation, out-of-order result, previous-approved projection fixture
- policy unique/current/superseded fixture; version bump 뒤 read/protective rights 유지,
  새 Profile write만 재동의; adult/dataset consent 대체 금지
- deny-by-default Safety fake에서 ordinary Profile/media-link write 거부,
  private/discoverability-off target effect와 rights fragment 유지
- restricted/suspended fake에서 sole-private/all-off 성공, authored+private와
  opt-out+opt-in/new-selection mixed payload whole-request 거부, controller/domain/
  repository classification 동일, partial apply 0건
- Profile self/friend/minimal-discovery authz 성공 뒤에만 report context 발급
- actor spoof/IDOR
- actor_key forbidden scan

**Stop gate**

- GET auto-provision 또는 deleted account 자동 재생성
- auth actor를 body/query/ordinary header에서 유도
- deletion status credential/lifetime 미확정
- Profile normalization 또는 handle/display_name/bio bound 미확정
- pending/rejected Profile text가 friend/search/discovery response에 포함
- outdated policy가 새 Profile write를 허용하거나 policy bump가 protective rights를 차단
- Safety fake 없이 ordinary Identity write가 boot되거나 `HTTP-IDENTITY-15B`가
  `GET /me`를 bind
- route 이름만 보고 Profile/Discoverability 전체를 rights-first 처리하거나 mixed
  payload의 narrowing field만 commit

### `SAFETY-21` block/report/delete/suppression

**전용 경로**

- `server/src/social/safety/**`
- `server/test/social/safety/**`

**선행조건**

- `SERVER-FOUNDATION-10`, `SERVER-PERSISTENCE-BASE-14A`, `API-CONTRACT-02`
- `IDENTITY-20`의 frozen resolver/account/deletion/query-fragment ports와
  `PERSIST-IDENTITY-14B` evidence; guarded public Identity HTTP는 아직 bind하지 않음
- Text moderation의 `DOMAIN-INTEGRATION-17` queue/review/audit interface
- Report context의 `DOMAIN-INTEGRATION-17`과 `ReportContextValidator`
- SAFETY-OPS-13 approved core decisions와 frozen policy/action/rights/target-effect
  port contracts

**산출물**

- rights routes independent of feature kill
- actual `SafetyWriteGuard`/`SafetyRightsGuard` adapters; ordinary action effect와
  protective-route precedence를 모든 domain이 같은 순서로 적용
- `server/src/social/safety/policy-registry/**`의 fail-closed
  `PolicyRegistryPort` runtime adapter; release-owned manifest-fixed config만 읽고
  missing/placeholder/invalid version을 거부. `R-SERVER-BOOT` binding request와
  `R-RELEASE` config/readback request를 함께 남김
- actual `SafetyTargetEffectPort` producer와 frozen consumer contract;
  이 wave에 이미 존재하는 Identity/Profile consumer만 bind. Graph/Crew와 Media
  consumer는 각 later domain owner가 구현하고 자기 `DOMAIN-INTEGRATION-17`의
  `R-SERVER-BOOT` subcommit에서 직렬 bind
- Identity fragment + Safety notice를 조합한 typed `ordinary | rights_only`
  `GET /me` query와 `HTTP-SAFETY-15B` 단독 route request
- SafetyAction/Appeal aggregate, opaque subject action receipt, generalized notice/status
- `hide_content | restrict_social_writes | suspend_social_access` effect matrix;
  active→expired/reversed, modified→old reverse+replacement action
- moderation decision intent를 exactly once 소비해 version-bound action 생성;
  aggregate-owner suppression/restore command와 atomic outbox
- block atomic effects/outbox
- notification suppression/query-guard port; pending direct intents cancelled and
  cached item open rechecks block
- bound `report_context_receipt`를 사용한 block-after report
- delete job/immediate suppression/status
- internal role/audit boundary
- Profile/Crew text moderation queue/review access, generalized rejection/action/appeal handoff
- opaque report receipt contract; internal `Report.status` 비노출
- `ReportContextValidator`를 사용한 receipt-bound report create; Block 뒤 report
  purpose는 유지하고 raw target/body ID는 authority로 사용하지 않음
- frozen repository port와 `R-SERVER-PERSIST` adapter request
- `R-SERVER-MIG`/`R-SERVER-HTTP` integration requests

**금지 경로**

- `server/src/social/http/**`, `server/src/social/persistence/**`
- client safety controls, public policy/store sources

**검증**

- all-surface block precedence
- context receipt viewer/target/type swap, tamper, expiry, cross-account, block→report
- action target/version/subject IDOR, one-active-Appeal race/replay, terminal reopen
  rejection, modified replacement, reversal no-relationship/content-restore
- suspend/capability/policy mismatch 중 block/report/appeal/private/opt-out/delete/status
- generic masking
- kill 중 rights routes
- retry/restore/delete rehearsal
- policy registry clean-start missing/placeholder fail-closed, current-version
  readback, roll-forward, rollback, config↔Terms key/version fixture
- actual guard binding 뒤 Identity ordinary-write denial/rights-only `/me` suite 재실행

**Stop gate**

- capability guard가 rights route를 막음
- SafetyAction을 account deletion status로 오용하거나 public Appeal을 moderation
  provider port에 직접 연결
- subject에게 reporter/status 노출
- `report_context_receipt`와 `report_receipt`를 같은 token/schema로 사용
- 삭제가 subscription/local data에 cascade
- release-owned policy config나 actual guard adapter 없이 Identity public route가 boot

### `GRAPH-22` friends/invites/private crews

**전용 경로**

- `server/src/social/core/friends/**`
- `server/src/social/core/invites/**`
- `server/src/social/core/crews/**`
- `server/test/social/core/friends/**`
- `server/test/social/core/invites/**`
- `server/test/social/core/crews/**`

**선행조건**

- `SERVER-PERSISTENCE-BASE-14A`, `API-CONTRACT-02`
- Identity의 `DOMAIN-INTEGRATION-17` interface
- Safety의 `DOMAIN-INTEGRATION-17` block/suppression guard interface
- Identity의 frozen `PolicyAcceptanceGuard`와 Safety의 `SafetyWriteGuard`
- Safety의 actual `SafetyTargetEffectPort` producer와 frozen Crew consumer contract
- Text moderation의 `DOMAIN-INTEGRATION-17`과 approved Crew-name lifecycle
- Report context의 `DOMAIN-INTEGRATION-17`과 `ReportContextIssuer`
- Crew block-role 행렬

**산출물**

- exact handle lookup projection
- friend/crew Invite lifecycle/token digest
- friend/Crew invite accepted/declined/revoked source-event intents with stable dedupe;
  generic notification payload only
- Friendship pair invariant
- private Crew/Membership role invariant
- Crew name candidate revision과 moderation state; pending/rejected/hidden name은
  초대 대상·멤버 projection에 노출하지 않음
- Crew rejection/hidden의 version-bound SafetyAction intent; Safety row 직접 수정 없음
- exact Crew-name revision suppress/restore command를 적용하는
  `SafetyTargetEffectPort` consumer와 `R-SERVER-BOOT` rebind request; 다른 target
  kind는 거부
- authorized Invite/Crew-member query의 typed `ReportableTargetRef`와
  `R-SERVER-HTTP` receipt-decoration request
- comparison route는 `socialCompetition=false`일 때 closed
- frozen repository ports와 `R-SERVER-PERSIST` adapter requests
- `R-SERVER-MIG`/`R-SERVER-HTTP` integration requests

**금지 경로**

- `server/src/social/http/**`, `server/src/social/persistence/**`
- competition metric/projection implementation

**검증**

- pair/token/role races
- outdated policy와 active write restriction에서 create/invite/role write 거부,
  decline/revoke/remove/leave/archive protective transition 유지
- Crew create/name edit moderation, timeout/reject/out-of-order result fixtures
- Crew rejection action notice→Appeal→aggregate restore-review, reversal no-auto-publish
- Graph integration 전에는 Crew target-effect consumer 미등록, integration 뒤 exact
  target/version만 suppress/restore-review하고 stale/other-kind command 거부
- Invite/Crew-member authz 성공 뒤 context receipt 발급, block/private 실패는 0건
- owner transfer/archive/delete
- IDOR + block/private masking
- external token URL/log 노출 없음
- event retry가 notification intent를 중복 생성하지 않음

**Stop gate**

- block만으로 Crew membership/owner/moderator 축출
- public directory/arbitrary join/global board 추가
- competition off에서 friend/crew comparison projection 노출
- pending/rejected Crew name 또는 unapproved fallback text 노출

### `TRAIN-GROWTH-23` 개인 성취 IA

**전용 경로**

- `src/features/train/growth/**`
- `src/features/train/plan/**`
- `src/features/train/explore/**`
- `src/features/arena/**` (generated rival 제거와 weekly target 이관 전용)

**선행조건**

- approved `LOCAL-ACHIEVEMENT-CONTRACT-01C`
- existing History/CP reuse map

**산출물**

- 주간/PR/꾸준함/개인 CP/History views
- TODAY deep-link target
- generated CP rival 제거 요청과 자기 PR weekly target
- neutral deterministic helper와 `weeklyTarget` picker/hook 분리; 기존 tests 이관
- `WarriorCard`는 metric 재승인 전 target IA에서 제외
- `R-NAV` route, `R-TODAY` keep/move/remove, `R-ME` program-entry removal,
  `R-SETTINGS-PERSISTENCE` stale rival setting 처리, `R-LOCALE` key requests

**금지**

- actual-person rank에 CP/verifiedRatio 사용
- duplicate workout save implementation
- generated Arena rival/winner-loser를 목표 IA에 유지
- weekly target이 `rival.ts`/`useArena.ts`에 계속 의존

**검증**

- edit/delete 후 local projection
- plan zero/not-ranked anti-shame copy
- deep links/accessibility/skin QA

**Stop gate**

- TRAIN 기본 진입이 Growth가 아니거나 개인 성취가 다시 TODAY에 중복
- current screen을 이동하지 않고 새 giant scroll을 append
- Plan/Explore/TODAY가 별도 workout save logic 구현
- generated rival 삭제가 weekly target picker/hook/test를 깨뜨림

### `SOCIAL-CLIENT-24` 친구·크루 core client

**전용 경로**

- `src/features/social/api/runtime/**`
- `src/features/social/onboarding/**`
- `src/features/social/friends/**`
- `src/features/social/crew/**`
- `src/features/social/cache/**`
- `src/features/me/social-profile/**`

**선행조건**

- CLIENT-IA-12 shell
- `API-CONTRACT-02`와 `R-API` generated DTO
- Identity/Safety/Graph 각각의 `DOMAIN-INTEGRATION-17` environment
- Identity policy-currentness와 SafetyAction generalized notice/action-slot contract

**산출물**

- explicit account create/private profile/preview completion
- candidate submit/self-pending/rejected-edit/approved external-preview states;
  Appeal CTA는 SafetyAction `actionReceipt` slot만 사용
- current PolicyAcceptance status와 outdated-policy write gate integration request
- invites/friends/private Crew; Crew create/name edit의 owner-only pending,
  reject-edit/delete/appeal, approved-before-invite client states
- authorized Profile/Invite/Crew-member response의 `reportContextReceipt`를
  `R-CLIENT-SAFETY` action slot에 opaque state로 넘기는 integration request;
  feature client는 receipt를 해석하거나 URL에 넣지 않음
- Safety owner의 block/report action-slot integration request
- fail-closed projection cache
- `NOTIFICATION-27`용 Social header entry slot integration request; notification
  source/domain logic은 구현하지 않음
- `R-ME`, `R-NAV`, `R-LOCALE` integration requests

**금지**

- handwritten DTO drift
- stale blocked/private cache 표시
- comparison/Duel UI without capability
- `src/features/social/safety/**`, `src/features/me/safety/**` 직접 수정

**검증**

- account absent→explicit create→candidate submit→self pending preview→approved
  friend/minimal-discovery preview→first relationship
- initial reject/edit/appeal과 approved-profile edit 중 이전 projection 정책
- Crew create/name edit→owner-only pending→reject edit/delete/appeal 또는 approve→
  invite; edit 재심사 중 approved-name projection fixture
- invite/friend/Crew loading/empty/error/offline/blocked/private states
- Profile/Invite/Crew-member item → context receipt 보존 → block → report → 별도
  `reportReceipt` E2E fixture
- stale block/private/deleting cache 재노출 0건
- route/accessibility/skin/API conformance

**Stop gate**

- GET 또는 화면 진입이 account auto-create
- approved handle/profile 전에 exact-handle search/invite를 활성화
- approved Crew name 전에 초대하거나 pending/rejected candidate를 멤버에게 표시
- feature packet이 Safety client controls를 재구현
- reportable item cache가 context receipt를 버리거나 source target ID로 재구성
- API schema/flag off 상태와 UI drift

`SOCIAL-CLIENT-24` 완료만으로 다음 base를 열지 않는다. `R-CLIENT-SAFETY`
owner가 Profile/Invite/Crew-member opaque receipt와 SafetyAction Appeal slot을
`sameOwnerSequential` subcommit으로 적용하고 block→report→별도 reportReceipt,
rejection→actionReceipt→Appeal E2E를 재실행한 뒤에만 core client integration이
완료된다.

### `SAFETY-CLIENT-25` privacy/safety client controls

**Owner:** 현 정본의 canonical Safety/release lane.

**전용 경로**

- `src/features/me/safety/**`
- `src/features/social/safety/**`

**통합**

- `R-ME`, `R-NAV`, `R-LOCALE`

**선행조건**

- `API-CONTRACT-02`, `IDENTITY-20`, `SAFETY-21`
- typed `GET /me ordinary | rights_only`, current policy/SafetyAction
  notice/actionReceipt/Appeal schema와 rights-plane guard order
- `POST /reports` creation-scoped receipt schema(`Report.status` 비노출,
  GET/list 없음, 동일 idempotency key replay는 같은 receipt)
- reportable projection의 `reportContextReceipt` schema와 block→report handoff;
  별도 receipt history/list는 없음
- deletion status credential/recent-auth contract
- media delete adapter contract 또는 capability-safe placeholder

**산출물**

- private/opt-out/scope clear
- policy currentness/reaccept, generalized active SafetyAction notice,
  actionReceipt-based Appeal create/own status
- block list/create/remove, context-receipt handoff, opaque report-create receipt
- Social delete/status
- upload flag가 off여도 기존 profile media delete/receipt
- capability/policy/action kill 중 competition false/clear, selected dataset
  revoke/purge, correction tombstone 상태와 no-winner cancellation copy
- 일반 edit draft와 분리된 Profile sole-private/Discoverability all-off client
  command; authored/media/other opt-in/selection field 동봉 금지
- local/subscription/Social deletion 차이 설명

**금지 경로**

- Social profile/business graph 구현, tab route, locale, public policy/store source
- internal report triage status/evidence projection
- receipt를 URL/analytics/ordinary log에 넣거나 cross-account 재사용

**검증**

- network/capability failure에서도 local settings 접근
- rights route kill independence
- policy bump/suspend/kill 중 protective rights 접근; other-subject action IDOR,
  concurrent Appeal, modified replacement, terminal no-reopen, reversal no-restore
- `rights_only` ME가 ordinary profile/settings를 재구성하지 않고 policy/action/
  protective links만 표시; media delete와 competition disable/revoke/tombstone 유지
- restricted/suspended fixture에서 sole-private/all-off 성공, mixed draft 생성 0건;
  crafted mixed API response는 whole-request failure와 unchanged readback
- reportable projection에서 context receipt 수신 → block 전 handoff 보존 → block
  성공 뒤 report submit → 별도 report receipt 표시
- context-vs-creation receipt field swap/missing/expired/cross-account generic error와
  동일 report idempotency-key replay에서 같은 `reportReceipt`
- receipt history/list 없음, URL/analytics/log/clipboard 자동복사 없음
- destructive action recent-auth/retry states

**Stop gate**

- capability kill이 rights control을 숨김
- offline/server error를 block/report/delete 성공으로 표시
- 두 receipt를 같은 state/label로 저장하거나 block 때 context receipt를 먼저 폐기
- media upload off와 함께 기존 media delete도 숨김
- competition kill/stale-policy/restrict/suspend와 함께 false/clear/revoke/
  tombstone을 숨김
- rights CTA가 일반 Profile/Discoverability draft를 재사용해 mixed payload를 전송
- internal action ID/operator/reporter/evidence/raw content를 notice/Appeal state에 노출
- policy/kill/suspension이 Appeal 또는 다른 protective rights control을 숨김

### `ANALYTICS-26` lifecycle/UX event와 dashboard contract

**Owner:** `R-ANALYTICS`.

**선행조건**

- `API-CONTRACT-02`와 정본 event vocabulary/formulas
- `CONTRACT-01`에서 승인된 lifecycle/view/API-result 발생 시점과 dedupe 규칙
- privacy/store approval 없이는 optional client UX events default off
- 각 domain의 durable transition/outbox interface

**전용 경로**

- `server/src/social/analytics/**`
- `server/test/social/analytics/**`
- `src/features/social/analytics/**`
- `docs/social-analytics/**`

**금지 경로**

- domain entity/repository, third-party SDK, root manifest/lockfile

**산출물**

- post-durable lifecycle event adapter와 replay dedupe
- successful observed render 뒤 surface-view envelope와 승인된 dedupe/default-off control
- completed HTTP response 뒤 API-result envelope; idempotent replay의 API result와
  lifecycle effect를 별도 집계
- denominator/window/capability cohort/schema+metric version dashboard contract
- privacy-control/reliability/workflow metric queries

**검증**

- retry/replay가 lifecycle event는 추가하지 않으며 실제 response/result 집계와 분리
- view는 successful observed render 전 발생 0건, 승인된 dedupe fixture 통과
- forbidden field/name fixture 0건
- numerator/denominator/window/cohort/version formula fixtures
- analytics failure가 domain write와 local log를 실패시키지 않음

**Stop gate**

- raw ID/location/profile/message/report/media/workout/CP/verifiedRatio 수집
- third-party analytics dependency 무승인
- denominator/cohort/version 없는 count를 제품 성공으로 사용
- view/API-result event를 durable transition에 묶거나 lifecycle retry를 중복 집계

### `NOTIFICATION-27` pull-only Social inbox

**단일-owner 실행 순서**

1. backend projection/materializer를 구현하고 `DOMAIN-INTEGRATION-17`을 통과한다.
2. 같은 owner가 generic inbox/detail/read client를 구현한다.
3. `R-NAV`/`R-LOCALE` owner가 Social header entry와 copy request를 직렬 적용한다.

Competition/Partner/Chat이 뒤에서 source-event contract를 병합하면 같은
`R-NOTIFICATION` owner가 `sameOwnerSequential` consumer subcommit을 추가한다.
source domain과 notification consumer는 같은 shared file을 동시에 수정하지 않는다.

**전용 경로**

- `server/src/social/notifications/**`
- `server/test/social/notifications/**`
- `src/features/social/notifications/**`

**선행조건**

- `API-CONTRACT-02` notification schema와 approved kind/state/retention/badge semantics
- Graph/Safety 각각의 `DOMAIN-INTEGRATION-17`
- source-event/outbox/dedupe contract; OS push는 v1 범위 밖

**산출물**

- generic notification materializer와 recipient/source-event/kind unique dedupe
- own list/detail/read REST domain; detail open마다 current source authz 재검사
- Invite/Crew source-event consumers; later Duel/Match/chat kind integration ports
- block/private/delete/capability suppression과 expiry purge
- generic pull inbox client; no source content/ID, no OS permission/registration
- frozen repository ports와 `R-SERVER-PERSIST`, `R-SERVER-MIG`, `R-SERVER-HTTP`,
  `R-NAV`, `R-LOCALE` requests

**금지 경로**

- Graph/Competition/Partner/Chat source domain 직접 수정
- OS push token/permission/provider, third-party notification dependency
- target ID/handle/profile/message/location/workout/score in payload/log/analytics

**검증**

- retry/replay/concurrent materialize → item exactly 1개
- unilateral Interest → 0개; blocked/private/deleted source → 0개 또는 suppressed
- 다른 recipient IDOR, stale cached item open → generic 404
- item list에는 generic allowlist만; source content/ID forbidden scan
- OS notification permission/push registration 호출 0회

**Stop gate**

- kind/state/dedupe/retention/open semantics 미승인
- source transition 전에 item 생성 또는 outbox와 non-atomic intent
- cached notification이 current source authz를 대신함
- OS push나 raw content 범위를 계약 없이 추가

## 8. Wave 3 — Sync와 Competition

아래 네 packet은 interface가 동결된 뒤 병렬 개발할 수 있지만
`COMPETITION-33` 통합은 모두 완료된 뒤다.

### `SYNC-SERVER-30`

**선행조건**

- `API-CONTRACT-02`, `SERVER-PERSISTENCE-BASE-14A`
- Identity/Safety 각각의 `DOMAIN-INTEGRATION-17` interface
- Identity `PolicyAcceptanceGuard`, Safety `SafetyWriteGuard`/`SafetyRightsGuard`
  actual binding과 advertised-vs-effective `socialCompetition` contract
- deletion/purge/suppression interface와 `R-SERVER-MIG` allocation
- selected competitive dataset exactly one, other claims dormant, pending/active
  Duel switch forbidden, rights-first disable/revoke/tombstone no-winner cancel,
  post-switch false/rebaseline, consent/reclaim contract

**전용 경로**

- `server/src/social/sync/**`
- `server/test/social/sync/**`

**산출물**

- sole command ownership for `WorkoutDatasetClaim` and `CompetitionPreference`:
  dataset claim/list/revoke plus enable/select/switch/disable enforcement;
  `PERSIST-SYNC-14B`/`HTTP-SYNC-15B` are their only adapters
- claim/enable/select/switch use advertised capability + current policy +
  `SafetyWriteGuard`; active session/program/barrier uses effective capability,
  selected dataset/generation, current policy, and `SafetyWriteGuard`
- rights-first disable/clear/revoke stops transport, cancels pending/active Duels
  without a winner, hides comparison/readiness; correction tombstone remains
  available and invalidates affected result/readiness
- session/program replacement and correction tombstone
- dataset barrier/status
- selected-dataset/generation equality guard; own dormant upload rejection;
  switch resets readiness and requires full rebaseline
- best projection provenance/invalidation
- read-only `CompetitionReadinessPort` exposing consent/selected dataset/generation/
  sync readiness; Competition cannot mutate preference or claim state
- frozen repository ports와 `R-SERVER-PERSIST` adapter requests
- `R-SERVER-MIG`/`R-SERVER-HTTP` integration requests

**금지 경로**

- identity/safety/persistence/http implementation, client/local DB paths

**검증**

- revision/hash matrix
- barrier gap/coalescing, concurrent selected constraint, dormant upload rejection
- pending/active Duel switch rejection, post-switch full rebaseline
- kill/stale-policy/restrict/suspend ordinary claim/enable/upload 거부와
  rights-first disable/revoke/tombstone 허용; pending/active no-winner cancel
- imported/forbidden field rejection
- delete/purge/stale replay

**Stop gate**

- verified principal이 아닌 body/query/ordinary header에서 owner를 유도
- barrier gap이 있는데 sync ready 반환
- imported/Health raw fact 저장
- dormant dataset fact 저장 또는 selected switch 뒤 old readiness 재사용
- `COMPETITION-33`이 preference/claim schema 또는 command route를 쓰게 허용

### `SYNC-CLIENT-31`

**선행조건**

- `LOCAL-SYNC-SEAM-11`, `SETTINGS-PERSISTENCE-11B`
- `API-CONTRACT-02`/generated DTO와 frozen OpenAPI mock/fixtures
- client auth/account switch/deletion/consent interface
- integration 완료된 `IDENTITY-20`, `SAFETY-21` client-facing contract

**전용 경로**

- `src/features/social/sync/**`

**산출물**

- explicit claim/revoke, selected-device disclosure/select/switch UI와
  kill/stale-policy/action 상태에서도 접근 가능한 false/clear opt-out UI
- background drain, retry/backoff, ack/barrier
- account switch/do-not-resync/dormant states; dormant dataset outbox는 competition
  transport로 drain하지 않음
- pending/active Duel 중 switch disabled; opt-out/revoke는 winner 없는 cancellation
  설명과 함께 유지; allowed switch 뒤 competition false와 full rebaseline progress
- user-visible sync readiness

**금지 경로**

- SQLite schema/hot repos/settings persistence, generated DTO, tab/locale

**검증**

- offline/app kill/restart
- auth expiry/account switch
- two-device selected/dormant exclusion, concurrent selection conflict,
  pending/active switch rejection, kill-state opt-out/revoke no-winner cancel,
  allowed switch/rebaseline
- retry same revision/key
- logging latency isolation
- frozen mock과 실제 `SYNC-SERVER-30` contract의 E2E는 `DOMAIN-INTEGRATION-17`에서 실행

**Stop gate**

- claim/account switch/delete 뒤 자동 resync
- background drain이 local save success를 기다리게 함
- retry 때 revision/key를 회전해 중복 effect 생성
- selected-device limitation을 숨기거나 dormant workout을 전송

### `METRIC-32`

**전용 경로**

- `server/src/social/competition/metric/**`
- `server/test/social/competition/metric/**`

**선행조건**

- planned count/day/timezone semantics 승인
- integer personal-improvement formula와 catalog version 승인

**산출물**

- versioned pure metric
- basis-point integer calculation
- tie/no-ranked fixtures
- correction invalidation inputs

**금지**

- float equality로 winner 판정
- body/CP/verifiedRatio
- client is_pr/winner 신뢰

**검증**

- integer/basis-point/tie/not-ranked golden fixtures
- timezone/DST/anchor fixtures if planned-day semantics selected
- JS/DB projection 결과 일치
- correction/tombstone provenance invalidation

**Stop gate**

- metric/timezone 의미 미승인
- float equality 또는 client aggregate로 winner 판정
- CP/verifiedRatio/body/absolute strength 입력

### `COMPETITION-33`

**단일-owner 실행 순서**

1. 한 owner가 metric port를 소비해 backend Duel/projection을 구현한다.
2. `DOMAIN-INTEGRATION-17`을 통과한다.
3. 같은 owner가 그 integration commit에서 comparison/Duel client를 구현한다.
4. `R-CLIENT-SAFETY` owner가 Duel receipt handoff request를 적용하고 block→report
   E2E를 다시 실행한다.
5. `R-NOTIFICATION` owner가 Duel invite/result kind consumer subcommit을 적용하고
   retry/dedupe/block/opt-out suppression E2E를 다시 실행한다.

독립 backend/client packet ID가 승인되기 전에는 이 parent packet 안에서
subagent 병렬 수정을 허용하지 않는다.

**전용 경로**

- `server/src/social/competition/duels/**`
- `server/src/social/competition/projections/**`
- `server/test/social/competition/duels/**`
- `server/test/social/competition/projections/**`
- `src/features/social/competition/**`

**선행조건**

- Social contract `1.1.0` five-key schema, runtime preference, 양쪽 exact-one
  selected dataset/generation readiness
- Sync의 `DOMAIN-INTEGRATION-17`, read-only `CompetitionReadinessPort`,
  SYNC-CLIENT-31 actual E2E + METRIC-32
- Graph/Safety 각각의 `DOMAIN-INTEGRATION-17`
- Report context의 `DOMAIN-INTEGRATION-17`과 `ReportContextIssuer`
- `NOTIFICATION-27` integration의 source-event/kind consumer port
- sync evasion/correction/no-contest rule
- `API-CONTRACT-02` competition schemas와 `R-SERVER-HTTP` adapter plan
- Identity `PolicyAcceptanceGuard`와 Safety `SafetyWriteGuard`

**산출물**

- read-only `CompetitionReadinessPort`를 소비하고 acceptance 시 양쪽 selected
  dataset/generation snapshot만 freeze; preference/claim mutation은 Sync에 위임
- friend/crew comparison
- Duel lifecycle/server result
- Duel invite/result notification source-event intents; no score/target content
- authorized Duel query의 typed `ReportableTargetRef`와
  `R-SERVER-HTTP` receipt-decoration request
- Duel client의 opaque `reportContextReceipt` → `R-CLIENT-SAFETY` action-slot
  integration request
- block/delete/correction transitions
- Graph는 participant/crew membership query port만 제공; core path 수정 없음
- frozen repository ports와 `R-SERVER-PERSIST` adapter requests
- `R-SERVER-MIG`/`R-SERVER-HTTP` integration requests

**금지 경로**

- `server/src/social/core/**`, HTTP/persistence/generated DTO, local sync paths
- `CompetitionPreference`/`WorkoutDatasetClaim` schema, repository, command route,
  client select/switch/disable state 직접 수정

**검증**

- both-side consent and exact-one selected dataset/generation readiness
- outdated policy/restrict/suspend create·accept 거부와 protective decline/cancel 유지
- pending/active selected switch rejection; rights-first opt-out/revoke no-winner
  cancellation; acceptance freeze와 post-switch rebaseline
- Duel participant authz 성공 뒤 context receipt 발급, block/private 실패는 0건
- Duel detail receipt 보존 → block → report → 별도 `reportReceipt` client E2E
- exact 7-day window/tie
- sync kill/evasion/correction
- Duel event retry/replay에서 notification intent exactly 1개
- capability/user opt-out fail closed

**Stop gate**

- server가 client score/winner 신뢰
- unready dataset으로 winner 생성
- dormant/old generation을 metric input으로 사용하거나 frozen selection 변경
- competition off인데 comparison route/data 열림
- Duel client가 Safety handoff 없이 target ID로 report를 재구성

## 9. Wave 4 — Profile media lane

### `MEDIA-40`

**직렬 이중-owner 실행 순서**

1. `R-API`가 media schema/fixture subcommit을 먼저 병합한다.
2. Media backend owner가 server 경로만 구현하고 `DOMAIN-INTEGRATION-17`을
   통과한다.
3. canonical Safety/release client owner가 그 integration commit에서 client
   provenance/control과 delete/Appeal handoff를 구현한다.
4. 같은 Safety/release owner가 `R-CLIENT-SAFETY`, `R-ME`, `R-LOCALE` request를
   직렬 적용하고 전체 test를 다시 실행한다.

두 owner는 같은 base에서 병렬 수정하지 않는다. Backend integration commit을
client phase의 유일한 base로 사용한다. 독립 packet ID와 exact glob을 추가로
승인하기 전에는 각 subphase의 owner가 아래 자기 경로만 소유한다.

**전용 경로**

- Media backend owner: `server/src/social/media/**`, `server/test/social/media/**`
- canonical Safety/release client owner:
  `src/features/social/media/**`, `src/features/social/media/**/*.test.tsx`

**단일 소유**

- storage config/migration, public policy/store source는 각 registry owner

**선행조건**

- media bounds/storage/moderation/provider 승인
- provenance/EXIF/delete/backup contract
- original-IP style review
- `API-CONTRACT-02` media subcommit, `IDENTITY-20`, `SAFETY-21`,
  `SERVER-PERSISTENCE-BASE-14A`
- Identity/Safety 각각의 `DOMAIN-INTEGRATION-17` environment
- Identity `PolicyAcceptanceGuard`와 Safety `SafetyWriteGuard`/action-intent/
  actual `SafetyTargetEffectPort` producer 및 frozen Media consumer contract

**산출물**

- upload intent/processing/moderation/rendition/delete domain
- rejected/hidden media revision의 version-bound SafetyAction intent; Safety row 직접 수정 없음
- exact media revision suppress/restore-review command를 적용하는
  `SafetyTargetEffectPort` consumer와 Media `DOMAIN-INTEGRATION-17`의
  `R-SERVER-BOOT` rebind request; 다른 target kind는 거부
- `user_photo`/`ai_stylized` client provenance와 states
- `SAFETY-CLIENT-25` media-delete integration request
- `R-SERVER-PERSIST`, `R-SERVER-MIG`, `R-SERVER-HTTP`, `R-ME`, `R-LOCALE`,
  `R-RELEASE` requests

**금지 경로**

- HTTP/persistence/generated DTO, ME safety, root/release source 직접 수정

**검증**

- `user_photo`/`ai_stylized` end-to-end label
- re-encode/metadata strip
- pending self-only
- hide/delete/rendition/cache traversal
- report/moderation/appeal
- outdated policy/restrict/suspend upload 거부, delete/report/appeal 유지;
  action notice→Appeal→restore-review no-auto-publish
- Media integration 전 consumer 미등록, integration 뒤 exact target/version만
  suppress/restore-review하고 stale/other-kind command 거부

**Stop gate**

- provenance 누락 한 surface라도 존재
- pending public exposure
- moderation/store/retention 불일치

## 10. Wave 4 — text-first Partner lane

`PARTNER-50`의 text/context-only core는 `MEDIA-40`과 같은 approved base에서
병렬 시작할 수 있다. media card를 추가하는 integration만 `MEDIA-40` 완료 뒤다.

### `PARTNER-50`

**단일-owner 실행 순서**

1. `R-API`가 catalog/discovery/Interest/Match schema subcommit을 병합한다.
2. `PARTNER-50` 한 owner가 catalog와 partner backend를 구현한다.
3. `DOMAIN-INTEGRATION-17` 뒤 같은 owner가 manual catalog와 text-first client를 구현한다.
4. Safety owner가 abuse/rights와 Match `reportContextReceipt` handoff request를
   직렬 적용하고 block→report를 포함한 전체 flow를 다시 실행한다.
5. `R-NOTIFICATION` owner가 Match-kind consumer subcommit을 직렬 적용하고
   retry/dedupe, unilateral Interest 0-item, block/private/opt-out suppression E2E를
   다시 실행한다.
6. media card가 승인된 경우에만 `MEDIA-40` integration commit에서 별도 직렬
   integration을 수행한다.

`PARTNER-50` 내부 backend/client를 별도 subagent가 동시에 수정하지 않는다.

**전용 경로**

- eligibility/discovery backend: `server/src/social/partner/discovery/**`
- Interest/Match backend: `server/src/social/partner/match/**`
- catalog backend: `server/src/social/catalog/**`
- backend tests: `server/test/social/partner/**`, `server/test/social/catalog/**`
- manual catalog client: `src/features/social/nearby/catalog/**`, `src/features/social/nearby/scope/**`
- candidate/match client: `src/features/social/nearby/flow/**`

**선행조건**

- 18+ policy/store review
- sparse/rate/ordering/catalog governance
- block/report ops capacity
- manual-only location contract
- `API-CONTRACT-02` partner/catalog subcommit, `IDENTITY-20`, `SAFETY-21`,
  `SERVER-PERSISTENCE-BASE-14A`; `MEDIA-40`은 media-card integration에만 필요
- Identity/Safety 각각의 `DOMAIN-INTEGRATION-17` environment
- Report context의 `DOMAIN-INTEGRATION-17`과 `ReportContextIssuer`
- `NOTIFICATION-27` integration의 Match-kind consumer port
- Identity `PolicyAcceptanceGuard`와 Safety `SafetyWriteGuard`

**산출물**

- server-curated versioned area/venue catalog, no counts/coordinates/presence
- manual selection validation/deprecation/cache
- 18+ eligibility, rotating non-appearance candidate projection
- private Interest→reciprocal Match transaction
- Match 생성 notification source-event intent; unilateral Interest는 intent 0개
- no-swipe/text-first client flow와 read-only Match after opt-out
- authorized Match query의 typed `ReportableTargetRef`와
  `R-SERVER-HTTP` receipt-decoration request
- Match client의 opaque `reportContextReceipt` → `R-CLIENT-SAFETY` action-slot
  integration request
- `R-SERVER-PERSIST`, `R-SERVER-MIG`, `R-SERVER-HTTP`, `R-ME`, `R-LOCALE`,
  `R-RELEASE` requests

**금지 경로**

- OS location permission/GPS/IP-derived area
- HTTP/persistence/generated DTO/Safety client/release source 직접 수정

**검증**

- OS permission request 0회 + denied/restricted fixture → manual selector
- latitude/longitude/history DTO rejection
- unilateral Interest non-disclosure
- outdated policy/restrict/suspend Interest create 거부, withdraw/unmatch/block/report 유지
- reciprocal Match transaction/outbox retry에서 recipient intent exactly 1개씩
- `R-NOTIFICATION` Match-kind consumer retry/dedupe와 unilateral Interest 0-item,
  block/private/opt-out suppression
- reciprocal race → one Match
- Match participant authz 성공 뒤 context receipt 발급, block 뒤 Match read/issue 0건
- Match detail receipt 보존 → block → report → 별도 `reportReceipt` client E2E
- opt-out/block suppression
- venue enumeration/cross-scope abuse

**Stop gate**

- GPS/IP location input
- sparse threshold/ops 미승인
- photo engagement/외모 score ordering
- Match client가 receipt를 버리거나 target ID를 report authority로 사용

## 11. Wave 5 — Chat

### `CHAT-60`

**단일-owner 실행 순서**

1. `R-API`가 text-chat schema/fixture subcommit을 병합한다.
2. `CHAT-60` 한 owner가 backend를 구현하고 `DOMAIN-INTEGRATION-17`을 통과한다.
3. 같은 owner가 client를 구현한다.
4. Safety owner가 moderation/evidence/rights와 message `reportContextReceipt`
   handoff request를 직렬 적용하고 block→report를 포함한 전체 test를 다시 실행한다.

`CHAT-60` 내부 backend/client를 별도 subagent가 동시에 수정하지 않는다.

**전용 경로**

- backend: `server/src/social/chat/**`, `server/test/social/chat/**`
- client: `src/features/social/chat/**`, `src/features/social/chat/**/*.test.tsx`

**선행조건**

- active Match authority
- finite retention
- text moderation/report evidence/appeal
- rate/abuse operations
- messaging/UGC store source approval
- `API-CONTRACT-02` chat subcommit, `PARTNER-50` active Match,
  `SAFETY-21`, `SERVER-PERSISTENCE-BASE-14A`
- Partner/Safety 각각의 `DOMAIN-INTEGRATION-17` environment
- Report context의 `DOMAIN-INTEGRATION-17`과 `ReportContextIssuer`
- `NOTIFICATION-27` integration의 chat-activity-kind consumer port
- Identity `PolicyAcceptanceGuard`와 Safety `SafetyWriteGuard`

**산출물**

- text-only messages
- approved generic chat-activity notification intent; message text/link/count 없음
- block/unmatch/delete behavior
- report receipt/evidence seam
- authorized message query의 typed `ReportableTargetRef`와
  `R-SERVER-HTTP` receipt-decoration request
- message client의 opaque `reportContextReceipt` → `R-CLIENT-SAFETY` action-slot
  integration request
- no attachments/links/location/read receipts
- `R-SERVER-PERSIST`, `R-SERVER-MIG`, `R-SERVER-HTTP`, `R-LOCALE`,
  `R-RELEASE` requests

**금지 경로**

- HTTP/persistence/generated DTO/Safety client/release source 직접 수정
- attachment/link/location/read-receipt transport

**검증**

- active Match participant authz/IDOR
- message participant authz 성공 뒤 context receipt 발급, block/unmatch 실패는 0건
- message receipt 보존 → block → report → 별도 `reportReceipt` client E2E
- text send replay/dedupe/offline/error
- outdated policy/restrict/suspend send 거부, delete/block/report/unmatch 유지
- chat retry/replay notification intent exactly 1개, block/unmatch 뒤 0개
- block/unmatch/delete/report/evidence/retention
- forbidden content analytics/log scan

**Stop gate**

- retention/moderation/on-call 없음
- Match/block guard 우회
- forbidden content in analytics/log
- message client가 receipt 없이 target/message ID로 report authority를 재구성

## 12. Wave 6 — Release integration

### `RELEASE-INTEGRATION-70`

**단일 owner 경로**

- `app.json`
- `store.config.json`
- `docs/launch/**`
- `docs/compliance/**`
- planned `docs/social-release/**`
- planned `server/config/social-policy-registry.json`
- production capability config path `[must be fixed in OWNERSHIP-MANIFEST-03]`

**선행조건**

- 포함할 capability packet의 Function + Quality evidence
- 실제 운영 owner와 retention/rehearsal evidence
- Product/workflow test 결과와 승인 target
- current 1.0 track에 대한 별도 release authority

**산출물**

- implementation↔policy↔store declaration trace
- policy registry key/version/config↔Terms/community-rules source trace와
  current-version roll-forward/rollback receipt; runtime adapter는 Safety-owned
  source를 직접 수정하지 않음
- cohort/kill/reversal plan
- platform별 build/test evidence
- 사용자 task evidence
- release go/no-go candidate

**금지**

- 이 packet만으로 deploy/TestFlight/store submit 실행
- 구현되지 않은 기능을 공시하거나 구현된 수집을 숨김
- tests green만으로 product success 선언

**검증**

- actual route/data collection ↔ policy/store/config trace에 누락 0개
- capability default false, missing/invalid fail closed
- policy registry missing/placeholder/invalid fail-closed, current key/version
  readback, roll-forward/rollback 뒤 client/server currentness 일치
- macOS/Windows clean install와 iOS/Android evidence index
- kill 중 rights plane와 TODAY/TRAIN/+LOG local save rehearsal

**Stop gate**

- live App Store/review state 미확인 또는 별도 authority 없음
- policy/store가 구현보다 앞서거나 뒤처짐
- policy registry config가 Terms/community-rules source와 drift하거나 rollback
  receipt 없음
- Function만 통과하고 Quality/Product evidence 없음

## 13. Branch·worktree 후보

각 packet은 승인된 공통 base commit에서 독립 worktree를 만든다. exact naming
후보:

```text
codex/reploom-contract-01
codex/reploom-server-foundation-10
codex/reploom-local-sync-seam-11
codex/reploom-client-ia-12
codex/reploom-safety-ops-13
...
```

규칙:

- 기존 worktree가 있으면 branch/status/base를 확인한다.
- 불일치·dirty 상태를 발견하면 삭제·reset하지 않고 중단 보고한다.
- 한 packet branch는 자기 exclusive path만 바꾼다.
- shared registry 변경은 integrator에게 요청 commit 또는 patch로 전달한다.
- merge 후 다음 wave는 새 integration commit을 공통 base로 다시 잡는다.

## 14. 병합 순서

1. `CONTRACT-01`
2. `FOUNDATION-DECISION-01B`와 `LOCAL-ACHIEVEMENT-CONTRACT-01C` 병렬
3. Foundation branch 뒤 `API-CONTRACT-02`
4. `OWNERSHIP-MANIFEST-03`과 ownership checker; achievement contract도
   integration base에 포함
5. W1 readiness 승인
6. `SERVER-FOUNDATION-10`, `LOCAL-SYNC-SEAM-11`, `CLIENT-IA-12`,
   `SAFETY-OPS-13` 병렬
7. `SETTINGS-PERSISTENCE-11B`; 동시에 server 쪽은
   `SERVER-PERSISTENCE-BASE-14A`와 `SERVER-HTTP-BASE-15A`
8. `SHARED-INTEGRATION-16`으로 W1 registry subcommit 검증
9. `W2a`: `TEXT-MODERATION-18` + `REPORT-CONTEXT-19` + `TRAIN-GROWTH-23`
10. Text moderation과 report context의 각 `DOMAIN-INTEGRATION-17`; 그 base에서
    `IDENTITY-20` domain + `PERSIST-IDENTITY-14B`까지만 수행; public guarded
    Identity HTTP/boot는 보류
11. Identity frozen ports를 base로 `SAFETY-21`을 구현하고, Safety persistence/
    HTTP에서 actual PolicyRegistry/Safety guards와 composite `GET /me`를 bind;
    Identity+Safety negative suite를 재실행해 두 `DOMAIN-INTEGRATION-17`을 joint 완료
12. joint Identity/Safety integration base에서 `GRAPH-22` +
    `SAFETY-CLIENT-25`
13. Graph `DOMAIN-INTEGRATION-17`; 그 base에서 `SOCIAL-CLIENT-24` +
    `NOTIFICATION-27` backend + 준비된 `ANALYTICS-26` 병렬; Social client 뒤
    `R-CLIENT-SAFETY` action-slot subcommit과 block/report/Appeal E2E를 직렬 적용
14. Notification `DOMAIN-INTEGRATION-17` → notification client/header integration
15. `SYNC-SERVER-30`, frozen mocks 기반 `SYNC-CLIENT-31`, `METRIC-32` 병렬
16. Sync `DOMAIN-INTEGRATION-17`과 actual server/client E2E
17. `COMPETITION-33` backend → `DOMAIN-INTEGRATION-17` → client →
    `R-CLIENT-SAFETY` receipt handoff → `R-NOTIFICATION` Duel-kind consumer integration
18. capability API subcommit 뒤 `MEDIA-40`과 text-only `PARTNER-50` 병렬;
    Media backend integration 뒤 Safety/release client owner를 직렬 적용하고,
    Partner backend/client/Safety handoff 뒤 `R-NOTIFICATION` Match-kind consumer를
    직렬 적용
19. 승인된 경우에만 Media + Partner media-card integration
20. active Match 뒤 `CHAT-60` backend → `DOMAIN-INTEGRATION-17` → client/notification-kind integration
21. `ANALYTICS-26` 전체 capability integration
22. `RELEASE-INTEGRATION-70`; policy registry key/version/config↔Terms readback과
    roll-forward/rollback evidence 포함

`+`로 묶인 독립 packet만 같은 base에서 병렬 가능하다. 각 번호가 끝날 때
shared registry owner가 integration commit과 전체 검증을 만든 뒤 다음 번호의
base가 된다.

## 15. 통합자가 매번 확인할 항목

### Contract drift

- entity/enum/API/error/flag 이름
- authz와 block precedence
- exact/min/max/TBD 숫자
- prohibited data and UI

### Shared path

- packet exclusive 목록 밖 diff 0개
- root/nav/locale/migration registry owner 1명
- generated/manual DTO drift 0개
- ownership manifest checker 통과

### Verification levels

- Function: 해당 packet command와 negative cases
- Quality: strict/lint/build/platform/visual/security 기준
- Product: 실제 task observation 여부

### Release containment

- current 1.0 source 변경 여부
- deploy/TestFlight/store state 변경 여부
- capability default false
- rights plane 유지
- local logging isolation

## 16. 공통 stop gate

아래가 하나라도 발생하면 병렬 속도와 관계없이 해당 branch를 병합하지 않는다.

- 정본보다 lane 결정을 우선함
- recorded Phase 1 acceptance/Phase 2 entry/Phase 4 entry 또는 approved roadmap
  amendment 없이 해당 code/config/migration packet을 시작함
- source를 읽지 않고 package/API/version을 발명함
- exclusive path 위반 또는 dirty worktree 파괴
- 새 dependency 무승인
- strict TypeScript 우회
- macOS 전용 path/script만 제공하고 Windows route 없음
- personal/dev-repo layout dependency
- hard-coded auth/AI/moderation vendor
- local logging network 결합
- actor_key/Social identity 결합
- raw GPS/Health/forbidden analytics
- block/report/delete/private/opt-out 우회
- CP/verifiedRatio/appearance actual-person rank
- store/policy/implementation drift

## 17. 첫 실행 묶음

사용자가 구현을 별도로 승인한다면 가장 먼저 동시에 던질 수 있는 작업은
다음이 아니다: feature code 세 개. 먼저 `CONTRACT-01`을 단독으로 끝내야 한다.

`FOUNDATION-DECISION-01B`, `LOCAL-ACHIEVEMENT-CONTRACT-01C`,
`API-CONTRACT-02`, `OWNERSHIP-MANIFEST-03`, 그리고 W1 readiness가 dependency
순서대로 모두 승인된 뒤에만 첫 실제 병렬 묶음을 연다.

그때도 phase authority를 packet별로 다시 읽는다. 현재 Phase 1 문서 상태에서는
아래 코드 묶음을 실행하지 않는다. Phase 1 acceptance 뒤 Phase 2 entry가 있으면
Server/Local Sync만 열 수 있고, Social shell/domain은 Phase 2 acceptance 뒤 Phase 4
entry가 있어야 한다. 대안은 승인된 roadmap amendment 하나뿐이다.

1. `SERVER-FOUNDATION-10`
2. `LOCAL-SYNC-SEAM-11`
3. `CLIENT-IA-12` — Phase 4 entry 뒤
4. `SAFETY-OPS-13` — 문서/운영 준비만 앞서 가능

`LOCAL-SYNC-SEAM-11`과 `SETTINGS-PERSISTENCE-11B`는 같은 DB owner가 순차 수행한다.
실제 concurrency slot이 부족하면 packet을 임의로 합치지 않고 readiness와
위험도에 따라 별도 scheduling 결정을 기록한다.
