# Reploom vNext 도메인·데이터·API 설계

Status: **DESIGN CANDIDATE — schema/implementation authority 없음**

## 1. 설계 목표와 한계

이 문서는 Social v1 정본의 도메인 경계를 실제 구현 패킷으로 분해한다.
아직 `server/`는 존재하지 않는다. 현재 정본의 계획 경계는 strict-TypeScript
NestJS/PostgreSQL이지만, 이를 만드는 package 추가·버전·ORM·auth provider는
승인되지 않았다. 정본을 바꾸지 않는 한 framework를 다른 것으로 교체하지 않는다.

### 목표

- social identity와 subscription `actor_key`를 구조적으로 분리
- 로컬 기록을 네트워크와 분리한 채 필요한 Social projection만 동기화
- 모든 actor를 검증된 auth principal에서 유도
- block, privacy, moderation, capability를 query/transaction invariant로 적용
- retry, 중복 요청, 경쟁 상태에서 한 번의 domain effect 보장
- strict TypeScript, 새 의존성 없는 문서 단계 유지

### 비목표

- 기존 subscription Worker에 Social route 추가
- 특정 auth/AI/moderation 공급자 하드코딩
- HealthKit/Health Connect raw record 업로드
- 로컬 workout ledger를 서버 authoritative 원장으로 교체
- client `is_pr`, score, winner, rank를 서버 결과로 신뢰
- NestJS package/version·ORM·migration/auth library 선결정

## 2. 경계 컨텍스트

| Context | 소유 데이터 | Principal | 장애 영향 |
| --- | --- | --- | --- |
| Local Training | workout, set, cardio, food, plan, personal CP | local app user | Social 없이 계속 동작 |
| Social Identity | SocialAccount, AuthBinding, Profile | verified auth principal | local logging 영향 없음 |
| Social Graph | Friendship, Invite, Crew, Membership, Interest, Match | `social_user_id` | 해당 Social surface만 실패 |
| Competition | dataset claim, sync fact, metric snapshot, Duel | `social_user_id` + explicit dataset consent | default off; core graph 영향 없음 |
| Safety Rights | Block, Report, deletion, suppression, appeal ops | `social_user_id` / internal safety role | capability kill 중에도 유지 |
| Subscription/AI | entitlement, quota, request ledger | `actor_key` | Social 신원과 join 없음 |

### 2.1 절대 경계

- Social DB/table/cache/token/log/analytics에는 `actor_key` column 또는 lookup이
  없다.
- `social_user_id`/`auth_subject`는 `actor_key`, purchase, device, local user ID,
  email text에서 파생하지 않는다.
- subscription entitlement Bearer token은 Social auth가 아니다.
- Social token은 subscription Worker auth가 아니다.
- Social account 삭제와 구독 ledger 삭제는 별도 command다.
- Social service는 `worker/src/index.js`에 넣지 않는다.

## 3. 인증과 신원

### 3.1 타입 경계 후보

```ts
type VerifiedAuthPrincipal = Readonly<{
  issuer: string;
  subject: string;
  audience: readonly string[];
  authenticatedAt?: string;
}>;

interface AuthVerifier {
  verify(input: unknown): Promise<VerifiedAuthPrincipal>;
}
```

이것은 공급자 고정을 피하기 위한 port 모양이며 실제 library signature가
아니다. 구현 전에 선택한 auth source의 공식 API로 재검증해야 한다.

### 3.2 gateway/domain 규칙

1. 구성된 issuer, audience, signature, expiry, subject를 검증한다.
2. provider literal과 secret은 environment config에 둔다.
3. domain handler는 검증된 principal만 받는다.
4. body, query, ordinary client header가 actor의 `social_user_id` 또는
   `auth_subject`를 지정할 수 없다.
5. repository query의 owner predicate는 resolved `social_user_id`에서 생성한다.
6. target ID와 actor ID를 분리해 self/participant/role guard를 적용한다.
7. internal safety principal은 public social role과 별도다.

외부 token을 service가 직접 검증할지 gateway가 서명한 internal assertion을
전달할지는 `[TBD]`다. 어떤 선택도 ordinary unsigned identity header를 믿지
않는다.

### 3.3 SocialAccount와 AuthBinding

정본 필드와 lifecycle을 그대로 따른다.

```text
SocialAccount
  social_user_id UUID opaque immutable
  status active | deleting | deleted
  created_at / updated_at / deleted_at

AuthBinding
  auth_binding_id UUID
  social_user_id FK
  auth_issuer
  auth_subject
  created_at / revoked_at
  UNIQUE active(auth_issuer, auth_subject)
```

account provisioning은 `POST /social/v1/account`의 명시적 command다. bootstrap,
profile GET, 삭제 상태 GET은 account를 자동 생성하지 않는다.

### 3.4 삭제 후 상태 조회 결함과 후보

정본은 `deleting` 진입 시 Social session revoke와 같은 verified auth를 통한
`GET /account/deletion`을 요구하지만, AuthBinding의 deleting/deleted 단계
수명과 scope는 고정하지 않는다. 구현 전에 다음 중 하나를 승인해야 한다.

- 후보 A: deleting 동안 binding을 status-only scope로 유지하고 완료 뒤 유한
  tombstone으로 전환한다.
- 후보 B: delete command가 content 없는 opaque deletion receipt를 발급하고,
  receipt + 재인증으로 상태를 조회한다.
- 후보 C: configured auth provider account를 유지하고 Social binding만
  deletion-status scope로 전환한다.

어느 후보든 수명, 재등록 차단, 분실 복구, support 접근, backup 삭제를 함께
정해야 한다. 무기한 subject 보존이나 GET auto-provision은 금지한다.

## 4. 로컬 데이터셋 연결

### 4.1 명시적 claim

`LOCAL_USER_ID = 'local'`는 로컬 SQLite의 안정 식별자로 유지한다. 이것을
`social_user_id`로 바꾸거나 서버에 보내지 않는다.

`local_dataset_id`는 설치 시 자동 생성하지 않는다. `[proposal]` 사용자가
ME 또는 competition 진입에서 **내 기록 연결**을 명시적으로 승인할 때 생성한다.

```text
unclaimed
  └─ explicit consent(version) → claiming
       ├─ server accepted → active
       ├─ remote owner conflict → conflict
       └─ cancel/error → unclaimed

active
  ├─ sign-out/account switch → paused
  ├─ revoke connection → purging
  └─ social account delete → do_not_resync

purging
  └─ remote receipt completed → unclaimed + local marker policy
```

- account switch는 자동 rebind하지 않는다.
- reinstall 후 local marker가 사라지는 한계가 있으므로 server-side claim
  conflict와 explicit reclaim flow가 필요하다.
- Social 삭제 뒤 남은 로컬 운동은 보존하되 새 account로 자동 업로드하지
  않는다.
- 여러 기기는 여러 claimed dataset일 수 있지만 Social v1 competition은 계정의
  active selected competitive dataset 정확히 1개만 사용한다. 나머지는 competition
  transport에서 dormant이며 content/time 유사도로 자동 병합하지 않는다.
- pending/active Duel 동안 selected dataset 변경은 금지한다. 변경하려면 기존
  checkpoint와 새 dataset full rebaseline 뒤까지 `competitionEnabled=false`다.

### 4.2 local additive schema 후보

기존 workout schema를 교체하지 않고 additive table만 제안한다.

| Table | 핵심 필드 | invariant |
| --- | --- | --- |
| `social_sync_dataset` | local_dataset_id, claim_state, consent_version, next_dataset_revision, last_acked_barrier | 로컬 1 dataset row; ID는 claim 시 random |
| `workout_sync_state` | session_id, aggregate_revision, last_acked_revision, dirty | session당 1 row |
| `social_sync_outbox` | kind, aggregate_id, aggregate_revision, dataset_revision_from/to, operation, created_at | aggregate별 coalesce하되 covered range 보존 |
| `workout_sync_tombstone` | session_id, aggregate_revision, dataset_revision, created_at | stale snapshot 부활 금지 |
| `program_sync_state` | program revision, dataset revision, last ack | frozen plan input 추적 |

정확한 SQLite DDL과 migration number는 구현 승인 뒤 기존
`schema.ts`/`migrate.ts` 패턴을 확인해 정한다.

### 4.3 hot-path invariant

현재 workout mutation의 durable boundary와 같은 SQLite transaction에서
허용하는 추가 작업은 다음뿐이다.

1. aggregate revision 증가
2. dataset-wide monotonic revision 증가
3. 작은 dirty reference/outbox UPSERT
4. 삭제 시 tombstone reference 기록

다음은 transaction 밖 background drain에서 한다.

- 전체 session snapshot 조립
- canonicalization와 hash
- auth/token refresh
- network request
- response parsing과 retry backoff
- server metric 계산

이 분리는 snapshot/hash 비용도 로깅 성공 path에서 제거한다.

### 4.4 program persistence seam

`[baseline]` custom program은 `src/stores/settingsStore.ts::persistSettings`가
`src/db/repos/userRepo.ts::updateSettings`를 호출해 `user.settings` JSON 전체로
저장한다. session/set/cardio repository만 수정해서는 program sync revision을
완전하게 기록할 수 없다.

구현 후보는 program 전용 durable command를 한 owner가 제공하는 것이다.

```text
saveProgram(program)
  one SQLite transaction:
    update user.settings.customProgram
    increment program revision
    increment dataset revision when claim active
    upsert program dirty reference with covered dataset revision
```

ProgramEditor/AutoPlan은 in-memory `apply + persistSettings` 조합 대신 이 command의
성공 receipt를 기준으로 UI state를 갱신한다. 다른 skin/locale/subscription 설정
변경은 program revision을 올리지 않는다. snapshot/hash/network는 이 transaction
밖에서 처리한다.

## 5. Social 핵심 엔티티

필드·state machine은 `docs/social-v1-contract.md` §4가 정본이다. 여기서는
집계와 소유 관계를 구현 관점에서 묶는다.

| Aggregate | Root/children | transaction invariant |
| --- | --- | --- |
| Identity | SocialAccount, AuthBinding, Profile, Discoverability, PolicyAcceptance | active binding unique; profile default private; current policy guards new writes |
| Friendship | Friendship, friend Invite | unordered pair unique; pending은 Invite에만 |
| Duel | Duel, frozen snapshots/result | friend + competition consent + sync ready + no block |
| Crew | Crew, Membership, crew Invite | owner exactly one; private invite-only |
| Partner | Interest, Match | reciprocal transaction creates Match exactly once |
| Safety | Block, Report, SafetyAction, Appeal, suppression/audit | Block precedence; reporter/internal operator 비노출; protective rights always reachable |
| Media | ProfileMedia/renditions | `user_photo`/`ai_stylized` provenance 전파 |
| Chat | ChatThread, ChatMessage | active Match + capability + block first |

### 5.1 canonical pair

양방 사용자 관계는 다음 논리 키를 쓴다.

```text
user_low_id  = min(uuidA, uuidB) under one documented UUID ordering
user_high_id = max(uuidA, uuidB)
CHECK user_low_id <> user_high_id
UNIQUE (user_low_id, user_high_id)
```

UUID ordering 방식은 DB와 TypeScript가 동일해야 한다. 애플리케이션 비교와
DB constraint를 모두 테스트한다.

### 5.2 Block precedence

어느 방향의 Block이든 제품 효과는 대칭이다. repository projection의 첫
guard로 적용한다.

```text
Block
  → profile/search/nearby 숨김
  → pending invite 취소/비노출
  → active Friendship cancel + projection 제거
  → Duel cancel 또는 no-result
  → crew member projection/notification 필터
  → Interest 철회 + Match blocked
  → chat read/write 중단
  → block 전에 발급된 bound `report_context_receipt` 기반 Report는 허용
```

unblock는 어떤 관계도 복원하지 않는다. Crew 관리 역할과 block의 충돌은
Safety 문서의 미확정 gate다.

### 5.3 Profile media

`kind`는 정확히 `user_photo | ai_stylized`다. storage ref, checksum, source
media, rendition은 외부 projection에서 최소화한다. EXIF/location 제거,
moderation, deletion/backup 정책이 승인될 때까지 `profileMedia=false`다.

### 5.4 Profile·Crew core text moderation

사용자 작성 core text는 Profile의 `handle/display_name/bio`와 Crew의 `name`이다.
Profile과 Crew revision enum은 정본 `1.1.0`의
`pending | approved | rejected | hidden`을 동일하게 사용한다.

첫 입력은 candidate revision으로 저장되고 `pending` 동안 self 외 projection에
포함되지 않는다. edit 시 새 candidate와 이전 approved projection을 분리한다.
이전 approved 값을 계속 보일지 즉시 숨길지는 field/safety action별 승인 계약을
따르며 client가 임의 선택하지 않는다. rejected candidate는 publish하지 않고
owner에게 일반화된 사유와 edit/delete/appeal 경로만 제공한다. `hidden`은 Safety
override이며 캐시·검색·초대·discovery보다 우선한다.

`ModerationSubmitPort`/`ModerationDecisionPort`는 provider-neutral이다. domain
outbox와 job state가
candidate revision을 binding하고, duplicate/out-of-order result는 최신 승인
revision을 되돌리지 못한다. provider timeout/unavailable은 `pending` 유지로
fail closed한다. raw text는 ordinary log/analytics/error에 넣지 않는다.

moderation service는 provider job/queue/decision correlation만 소유한다. Profile
candidate/approved projection과 `moderation_state`는 Identity가, Crew name candidate/
approved projection과 state는 Graph가 소유한다. Safety는 queue admin/review/audit
ports만 사용하며 세 lane이 서로의 aggregate row를 직접 수정하지 않는다.

여기서 moderation service의 review port는 `ModerationReviewPort`다. Public
`Appeal` aggregate나 REST를 소유하지 않는다. Identity/Graph가 rejection/hidden
decision을 적용할 때 version-bound decision event를 atomic outbox에 기록하고,
Safety가 이를 한 번 소비해 appealable `SafetyAction`과 subject notice를 만든다.
Public `POST /appeals`는 Safety domain의 Appeal use case를 호출하고, Safety만
`ModerationReviewPort`를 통해 provider/job 재검토를 요청한다.

moderated fields, edit projection, queue/review/SafetyAction/Appeal/retention/provider
운영이 승인되기 전 Profile friend/discovery와 Crew invite projection은 열지 않는다.

### 5.5 In-app SocialNotification support entity

`SocialNotification`은 필수 11개 관계 entity를 대체하지 않는 delivery projection이다.
논리 필드는 `notification_id`, `recipient_social_user_id`, bounded `kind`, internal
source event/resource reference, `state`, `dedupe_key`, `created_at`, `first_seen_at`,
`expires_at`, `version`이다. state는 정본 `1.1.0`의
`unread | read | suppressed | expired`이며 retention과 kind allowlist는 `[TBD]`다.

v1 transport는 authenticated in-app pull only다. OS push token, notification
permission, remote-push provider는 저장·요청하지 않는다. public projection은
opaque notification ID, kind, generic copy key, created/read state만 포함하고 source
user/resource ID, handle, text, 위치, workout, score를 포함하지 않는다. open/detail
query가 현재 authz를 재검사해 safe destination 또는 generic unavailable을 반환한다.

domain transition과 같은 transaction의 outbox event를 unique
`(recipient, source_event, kind)` dedupe key로 materialize한다. unilateral Interest는
notification을 만들지 않는다. Block/private/delete/capability kill은 pending outbox와
server projection을 suppress한다. 이미 client cache에 전달된 item은 회수했다고
주장하지 않으며 open 시 block-first guard가 권한을 다시 막는다.

### 5.6 PolicyAcceptance·SafetyAction·Appeal support model

이 세 aggregate는 정본 §4.3–4.4의 supporting records다.

- Identity는 immutable `PolicyAcceptance` row와 public accept/currentness
  projection을 소유한다. Safety/release는 versioned policy registry를 소유하고
  Identity에는 provider-neutral `PolicyRegistryPort`만 제공한다.
- Safety runtime은 `server/src/social/safety/policy-registry/**`의
  `PolicyRegistryPort` adapter를 소유한다. Adapter는 ownership manifest가 고정한
  release-owned versioned config만 읽고, source가 없거나 placeholder/invalid면
  fail closed한다. 개인 문서·환경 경로를 runtime source로 사용하지 않는다.
- current policy가 바뀌면 기존 read와 block/report/delete/appeal/private/opt-out/
  deletion-status는 유지하고, 새 authored text·relationship·competition write만
  `social_policy_acceptance_required`로 닫는다. adult attestation, partner opt-in,
  dataset consent와 policy acceptance는 서로 대체하지 않는다.
- Safety는 `SafetyAction`/`Appeal` aggregate, public opaque action receipt, internal
  decision/audit를 소유한다. aggregate owner는 Safety command/outbox를 통해서만
  content suppression/restore를 적용하고 Safety row를 직접 수정하지 않는다.
- prepublication reject 또는 hidden decision은 appealable version-bound
  `hide_content` SafetyAction을 만든다. reversal은 명시적 aggregate-owner restore
  command를 만들 뿐 content/relationship을 자동 복원하지 않는다.
- Appeal active states는 `submitted | acknowledged | under_review`, terminal은
  `upheld | modified | reversed`다. `modified`는 old action reverse + replacement
  action create를 한 transaction/outbox boundary로 수행한다.
- verified auth → owner rights-scope resolution → protective route → ordinary
  capability/policy/action/resource guard 순서를 지켜 suspend/kill이 권리를 먼저
  가로막지 못한다.

## 6. 서버 persistence seam 후보

framework/ORM과 무관한 논리 table 그룹이다.

### Identity/graph

```text
social_account
auth_binding
profile
profile_text_revision
friendship
invite
duel
crew
crew_name_revision
membership
discoverability
discovery_area_catalog / discovery_venue_catalog / catalog_version [partner gate]
interest
match
block
report
report_context_receipt
profile_media [gated]
chat_thread / chat_message [gated]
social_notification [socialCore, pull-only]
```

### Sync/competition

```text
workout_dataset
workout_sync_session
workout_sync_strength_fact
program_snapshot
sync_watermark
exercise_best_projection
social_metric_snapshot
competition_preference
```

### Reliability/safety support

```text
idempotency_record
domain_outbox
deletion_job
deletion_status_credential [exact form TBD]
safety_suppression
moderation_audit
text_moderation_job
policy_acceptance
safety_action
appeal
```

DB schema와 migration file은 한 migration owner만 수정한다. PostgreSQL version,
ORM, migration executor, checksum mechanism은 `[TBD]`다.

## 7. Workout sync protocol 후보

### 7.1 목적 제한

sync는 Social competition 계산에 필요한 최소 사실만 보낸다. remote backup,
전체 운동 history, 코칭, 광고, appearance/fitness score에 재사용하지 않는다.

현재 공개 privacy source와 충돌하지 않도록 v1 후보는 다음을 고정한다.

- `source=imported` 또는 Health platform에서 온 raw workout fact는 업로드 금지.
- food, body composition, profile text, note, RIR은 업로드 금지.
- client CP, `verifiedRatio`, `is_pr`, rank, winner는 업로드 금지.

이 payload 자체가 민감한 운동 데이터이므로 public rollout 전 privacy/store
공시와 명시적 consent가 필요하다.

### 7.2 최소 session snapshot 후보

```ts
type WorkoutSessionSnapshotV1 = Readonly<{
  sessionClientUuid: string;
  sessionRevision: number;
  datasetRevision: number;
  startedAt: string;       // UTC RFC 3339 after validation
  completedAt: string;
  sessionSource: "manual"; // imported raw facts excluded in v1
  catalogVersion: string;
  hasSupportedCardio: boolean;
  strengthFacts: readonly Readonly<{
    setClientUuid: string;
    canonicalExerciseId: string;
    weightGrams: number;   // bounded integer, not IEEE kg comparison
    reps: number;          // bounded integer
    loggedAt: string;
  }>[];
}>;
```

이 타입은 설계 후보이며 구현용 bounds는 `[TBD]`다. `weightGrams`와 `reps`는
정수로 검증한다. weighted/bodyweight 운동 구분은 `weight=0` 추측이 아니라
versioned canonical catalog flag가 결정한다.

Cardio personal-improvement 산식이 승인되지 않으면
`hasSupportedCardio`는 consistency occurrence만 알리고 score fact를 보내지
않는다.

### 7.3 aggregate revision

Session PUT은 다음 규칙을 갖는다.

| server state | incoming | 결과 |
| --- | --- | --- |
| 없음 | revision N | child facts 전체 저장 + receipt |
| revision N/hash H | N/H | 동일 receipt replay |
| revision N/hash H | N/H2 | `409 social_sync_hash_conflict` |
| revision N | lower | `409 social_sync_revision_conflict` |
| revision N | higher | session + child facts 전체 replace |
| tombstone revision N | snapshot <= N | conflict; 부활 금지 |
| any | higher tombstone | suppress + projection invalidation |

Session replace, best projection update/invalidation, domain outbox, receipt는
하나의 DB transaction/atomic boundary다.

### 7.4 dataset-wide barrier

per-session revision만으로 서버는 "다른 수정이 아직 로컬에 남았는지" 알 수
없다. 따라서 dataset-wide monotonic mutation revision을 별도로 둔다.

```text
local mutation commits revision 41
  → outbox covers dataset revision 41
local mutation commits revision 42
  → same aggregate coalesce: outbox covers 41..42
all dirty aggregates through 42 acked
  → PUT sync-barrier { datasetRevision: 42 }
server accepts barrier only if no uncovered revision <= 42
```

barrier는 클라이언트가 선언한 completeness이지 부정행위 방지 증명이 아니다.
server metric ingest는 preference의 selected competitive dataset과 generation만
받고 own-but-dormant dataset upload도 거부한다. cross-dataset merge는 없으며
freshness, clock, missing client 문제는 provenance policy로 별도 다룬다.

### 7.5 correction과 result

완료 후 local edit/delete가 과거 Duel 결과를 바꾸는 규칙은 `[TBD]`다.

- 결과를 영구 immutable로 두면 삭제된 잘못된 기록이 승리로 남을 수 있다.
- 항상 재계산하면 과거 결과가 흔들린다.
- `[proposal]` 제한된 dispute window 안의 correction은 Duel을
  `voided/no_result`로 바꾸고, 이후는 immutable + safety review로 둔다.

window 수치와 appeal은 승인 전 고정하지 않는다. 이 결정 전 실제 Duel을
열지 않는다.

### 7.6 best projection provenance

`exercise_best_projection`은 값뿐 아니라 source dataset/session/set UUID와
revision, metric/catalog version을 가진다. source correction/tombstone 시
projection을 `unready`로 바꾸고 재계산한다.

초기 sync가 유한 history만 받는다면 UI는 `all-time PR`이라 부르지 않고
`서버가 확인한 기간의 개인 향상`처럼 범위를 정직하게 표시한다. 정확한 초기
window와 retention은 `[TBD]`다.

## 8. Competition metric

### 8.1 capability 경계

`socialCore`는 account/private profile/friends/private crews까지만 연다.
다음은 정본 `1.1.0`의 `socialCompetition` capability와 account-level
`competitionEnabled=false` 기본값을 모두 요구한다.

Sync aggregate가 `WorkoutDatasetClaim`과 `CompetitionPreference` command를
단독 소유하고 read-only `CompetitionReadinessPort`를 제공한다. Competition
aggregate는 이 port를 읽고 Duel acceptance 시 dataset/generation snapshot만
freeze하며 preference/claim row나 route를 수정하지 않는다.

- Duel create/accept/result
- friend comparison
- crew comparison
- workout dataset claim/sync for competition

계정은 여러 dataset claim을 가질 수 있지만 competition에 사용하는 selected
dataset은 정확히 1개다. sync/metric/retention `TBD`와 Phase gate가 남아 있으므로
capability는 구현·공개하지 않는다.

### 8.2 `consistency_improvement_v1`

정본의 비교 tuple은 다음이다.

```text
(consistency_rate_bps, completed_planned_units, distinct_personal_improvements)
```

동률은 tie다. CP, verifiedRatio, body, absolute strength를 사용하지 않는다.

### 8.3 의미 결함

정본은 planned unit **개수**만 freeze하고 consecutive 24-hour bucket 완료를
센다. 이것은 특정 계획 요일 준수와 동일하지 않다. 구현 전 둘 중 하나를
선택한다.

| 후보 | 의미 | 추가 계약 |
| --- | --- | --- |
| A | `주간 목표 횟수 달성률` | acceptance anchor, 7×24h window, count만 freeze |
| B | `계획일 준수율` | timezone, DST, planned bucket bitmap, plan-change cutoff |

현재 formula에 정직한 후보는 A다. B를 선택하려면 산식을 개정한다. 사용자
timezone source와 변경 semantics가 없으므로 구현자가 임의로 정하지 않는다.

### 8.4 sync 회피

Duel 종료 후 sync 미완료를 무조건 `no winner`로 처리하면 불리한 사용자가
sync를 끄는 회피가 가능하다. 잘못된 winner보다 no-result가 안전하지만,
제품 규칙으로는 다음 결정이 필요하다.

- completion watermark deadline
- selected dataset/generation freshness와 rebaseline rule
- no-contest vs forfeit vs cancel
- offline/계정삭제/safety action 구분
- correction/appeal

selected dataset 정확히 1개와 dormant upload 거부는 확정이다. 나머지는 `[TBD]`;
따라서 real-person competition은 gate closed다.

## 9. Public REST

Base path는 정본대로 `/social/v1`이다. 정본 §8의 모든 route를 유지한다.
아래는 추가가 필요한 catalog/sync/competition 후보다.

### 9.1 manual scope catalog routes

| Method/path | 목적 | authority/privacy |
| --- | --- | --- |
| `GET /discover/scopes/areas` | server-curated coarse area page | verified self; no candidate/count data |
| `GET /discover/scopes/venues?areaCode={areaCode}` | selected area의 approved venue page | verified self; no presence/count data |

응답은 opaque `areaCode`/`venueId`, localized display key/text, catalog version,
deprecated 여부, opaque cursor만 포함한다. 사용자 수, 현재 활동, 거리, 좌표,
이전 선택을 포함하지 않는다. `PUT /me/discoverability`는 현재 catalog version의
ID를 server-side revalidate하고, deprecated selection은 clear/replace 경로를
돌려준다. catalog source, 운영 owner, version/deprecation policy는 계약 개정과
Safety approval이 필요하다.

### 9.2 dataset routes

| Method/path | 목적 | authority/idempotency |
| --- | --- | --- |
| `POST /me/workout-datasets` | consented dataset claim | verified self; advertised `socialCompetition`; current PolicyAcceptance; `SafetyWriteGuard`; `Idempotency-Key` |
| `GET /me/workout-datasets` | own claim/status 목록 | self only |
| `DELETE /me/workout-datasets/{datasetId}` | 연결 철회와 remote purge 시작 | rights-first owner transition; kill/policy/action과 독립; selected revoke는 competition false + pending/active Duel no-winner cancel; local rows 유지 |
| `PUT /me/workout-datasets/{datasetId}/sessions/{sessionClientUuid}` | revisioned full replacement | effective `socialCompetition`; current policy; `SafetyWriteGuard`; selected dataset/generation; dormant upload 거부; revision/hash authoritative |
| `PUT /me/workout-datasets/{datasetId}/sessions/{sessionClientUuid}/tombstone` | revisioned correction/delete | rights-first owner correction; stale snapshot 차단; readiness/result policy invalidation; affected pending/active Duel no-winner cancel |
| `PUT /me/workout-datasets/{datasetId}/program` | versioned minimal plan snapshot | effective `socialCompetition`; current policy; `SafetyWriteGuard`; selected dataset/generation; revisioned replace |
| `PUT /me/workout-datasets/{datasetId}/sync-barrier` | declared completeness watermark | effective `socialCompetition`; current policy; `SafetyWriteGuard`; selected dataset/generation; monotonic |
| `GET /me/workout-datasets/{datasetId}/sync-status` | ack/watermark/readiness | owner only |

`DELETE` body에 revision을 넣는 상호운용 모호성을 피하려고 tombstone은
revision-bearing `PUT`을 제안한다.

### 9.3 preference

| Method/path | 목적 | 규칙 |
| --- | --- | --- |
| `PUT /me/competition-preferences` | competition opt-in + selected dataset 전체 교체 | enable/select/switch는 advertised capability + current policy + `SafetyWriteGuard`; false/clear는 rights-first; false/clear는 transport stop + pending/active Duel no-winner cancel; switch는 Duel 중 금지; switch 뒤 false/rebaseline; 자연 멱등 |

이 route와 `socialCompetition` capability는 정본 `1.1.0`에 포함됐다. 정확한
request bounds와 sync readiness schema는 `API-CONTRACT-02` 전까지 gate closed다.

### 9.4 route 공통

- UTF-8 strict JSON; unknown field reject.
- server ID/time authoritative.
- opaque cursor; count 추론 금지.
- non-secret `requestId` 제공.
- actor는 body/path가 아니라 verified principal에서 유도.
- target의 block/private/eligibility는 generic 404로 mask.
- rights-first mutation은 route 이름이 아니라 validated resulting command로
  분류한다. Profile은 sole `visibility=private`, Discoverability는 모든 boolean
  false + scope off + area/venue clear일 때만 protective다. authored field,
  visibility expansion, attestation/new selection/true opt-in, mixed narrowing+
  expansion은 ordinary이거나 reject하며 일부 narrowing field만 적용하지 않는다.
- latitude/longitude/radius/history 같은 exact-location field, body/health,
  `actor_key`는 strict DTO에서 reject. `areaCode`/`venueId`는 정의된 catalog와
  discoverability route에서만 허용한다.

### 9.5 report context receipt와 report creation receipt

두 receipt는 목적과 수명이 다르며 같은 필드나 entity로 합치지 않는다.
아래 snake_case는 논리/DB 명칭이고 REST JSON 필드는 각각
`reportContextReceipt`, `reportReceipt`다.

| 종류 | 발급 시점 | 권위 | public 사용 |
| --- | --- | --- | --- |
| `report_context_receipt` | 인증·인가를 통과한 Profile/Invite/Duel/Crew member/Match/message projection read | reporter, target type/internal target, 발급 시점·만료·version을 server-side binding | block 뒤 `POST /reports`의 target 증명; target ID를 body로 신뢰하지 않음 |
| `report_receipt` | `POST /reports` durable create 뒤 | 생성된 Report/support correlation | 생성 응답과 동일 idempotency-key replay에서만 반환; GET/list/history 없음 |

`report_context_receipt` public 값은 opaque random token이고 server는 digest만
저장한다. 다른 viewer/target type/target/version으로 바꾸기, 만료·위조·cross-account
재사용은 generic rejection이다. Block은 이 receipt의 신고 목적을 무효화하지
않지만 resource read authority는 즉시 제거한다. ordinary log, analytics, URL,
notification에는 두 receipt를 모두 넣지 않는다.

정확한 발급 surface, token bounds, expiry, reuse/rate policy, client의 block→report
handoff 보존 범위는 `[TBD]`이며 Safety + Privacy + API 승인이 필요하다. v1은
reportable-resource history나 receipt list route를 만들지 않는다. 이 계약과
위조/교환/만료 fixture 전에는 reportable surface rollout을 열지 않는다.

`ReportContextIssuer`/`ReportContextValidator` seam은 Identity보다 먼저 통합한다.
각 reportable domain query는 authorization 성공 뒤 typed `ReportableTargetRef`만
transport adapter에 넘기고, 공통 HTTP adapter가 issuer를 호출해 camelCase
`reportContextReceipt`를 붙인다. Profile/Invite/Duel/Crew member/Match/message
coverage matrix에 없는 route는 reportable rollout을 통과하지 못한다.

### 9.6 in-app notification routes

| Method/path | 목적 | authority/privacy |
| --- | --- | --- |
| `GET /me/notifications` | own generic notification page | self; opaque cursor; current suppression filter |
| `GET /me/notifications/{notificationId}` | current safe destination resolve | recipient only; block/private/capability recheck; generic 404 |
| `PATCH /me/notifications/{notificationId}` | own `read` state 전이 | recipient; `If-Match`; retry-safe |

list/detail은 source target ID/text를 반환하지 않는다. detail의 destination은
allowlisted route enum과 opaque local navigation input만 포함하고 server가 현재
resource authorization을 통과시킨 경우에만 반환한다. exact kind/state/retention/
badge-count semantics는 계약 승인 전 `[TBD]`; OS push endpoint는 v1에 없다.

### 9.7 policy and safety-rights routes

| Method/path | 목적 | authority/privacy |
| --- | --- | --- |
| `PUT /me/policy-acceptances/{policyKey}` | exact current version acceptance | self; immutable version row; naturally idempotent |
| `GET /me` composite projection | normal은 Identity account/profile/settings + policy/action, kill/suspend는 typed `rights_only` policy/action/protective links | self; `HTTP-SAFETY-15B` 단독 owner; opaque `actionReceipt`; internal actor/reporter/evidence/content 없음 |
| `POST /appeals` | action receipt에 대한 Appeal 생성 | subject; `Idempotency-Key`; one-active constraint |
| `GET /appeals/{appealId}` | own generalized Appeal state | appellant; terminal/internal details 최소화 |

`POST /appeals`는 public `ModerationReviewPort` 호출이 아니다. Safety Appeal use
case가 action/version을 검증하고 내부 review port/outbox를 호출한다. policy/action/
appeal route는 `socialCore` 또는 active suspension보다 먼저 rights-plane guard로
분기한다. Exact statement/decision bounds와 retention/SLO는 `[TBD]`다.

## 10. 인증·인가 행렬 보강

정본 §8.5의 actor/guard를 다음처럼 상세화한다.

| Action | actor | guards |
| --- | --- | --- |
| Profile authored/visibility expansion | self | `socialCore`, current policy, `SafetyWriteGuard`, content/version authority |
| Profile sole-private | self | rights-first; sole `visibility=private`; no authored/media/mixed field |
| Discoverability enable/new scope | self | `socialCore`, current policy, `SafetyWriteGuard`, attestation/catalog authority |
| Discoverability all-off/clear | self | rights-first; every flag false, scope off, area/venue clear; no mixed expansion |
| Claim dataset | self | active account, advertised capability, current policy, `SafetyWriteGuard`, explicit consent version |
| Read dataset/sync status | owner | resolved owner, generic masking, rights choices에 필요한 projection |
| Revoke dataset/purge | owner | rights-first; selected revoke는 competition false + Duel no-winner cancel; local rows 유지 |
| Put session/program/barrier | owner | effective capability, current policy, `SafetyWriteGuard`, selected dataset/generation, revision/hash, source policy, bounds |
| Put correction tombstone | owner | rights-first correction; stale replay 차단, readiness/result invalidation, affected Duel no-winner cancel |
| Enable/select/switch competition | self | advertised capability, policy acceptance, `SafetyWriteGuard`, dataset readiness; active Duel 중 switch 금지 |
| Disable/clear competition | self | capability/policy/action kill 독립; transport stop, pending/active Duel no-winner cancel, readiness reset |
| Read comparison | participant/member | `socialCompetition`, both visibility/consent/readiness, block first |
| Start Duel | friend | both competition enabled, sync ready, no block, metric supported |
| List/read own notification | recipient | `socialCore`, suppression/block/private/delete first; source authz on open |
| Mark notification read | recipient | current version, recipient ownership; target state 비노출 |
| Accept current policy | self | Identity-owned immutable acceptance; Safety/release policy registry current version |
| New authored/relationship/competition write | authorized actor | current PolicyAcceptance; protective transition exempt |
| Read own SafetyAction notice | subject | opaque action receipt only; operator/reporter/evidence 비노출 |
| Create/read Appeal | subject/appellant | own action receipt/version; one active appeal; capability/action kill 독립 |

negative tests는 다음 actor 조작을 시도한다.

- 다른 datasetId/session UUID
- body의 socialUserId/authSubject/ownerId
- subscription entitlement token
- revoked/deleting/deleted binding
- crew moderator의 safety report triage
- block된 target의 comparison/cache
- 다른 recipient의 notificationId와 stale blocked notification destination
- own-but-dormant dataset upload와 concurrent selected-dataset 교체
- pending/active Duel 중 selected switch와 switch 뒤 stale readiness 재사용
- kill/stale policy/restrict/suspend에서 ordinary upload/enable 거부와
  disable/revoke/tombstone 보호 전이 허용
- policy version mismatch를 adult/dataset consent로 우회
- `visibility=private`와 authored/media field 혼합, opt-out과 다른 opt-in/new
  selection 혼합, controller/domain/repository classifier 불일치와 partial apply
- 다른 subject의 actionReceipt, concurrent Appeal create, terminal Appeal reopen

## 11. 멱등성과 동시성

### 11.1 Generic POST ledger

scope:

```text
pre-account: (issuer, subject, method, canonicalPath, idempotencyKey)
post-account: (social_user_id, method, canonicalPath, idempotencyKey)
```

fingerprint는 raw JSON bytes가 아니다. 검증된 typed field를 schema order의
versioned tuple로 canonicalize한 뒤 hash한다. token, `actor_key`, unknown field,
content-free-text를 fingerprint log에 남기지 않는다.

동일 key/fingerprint는 정본대로 complete original status/body를 재생한다.
각 command의 정상 응답 schema 자체를 ID/status/receipt 중심으로 최소화해
불필요한 profile/message content가 ledger에 들어가지 않게 한다. 다른
fingerprint는 `social_idempotency_conflict`, 진행 중이면
`social_request_in_progress`다. ledger는 domain write/outbox와 atomic해야 한다.

complete response는 MIN 24시간 보존한다. 개인정보 삭제와 충돌하지 않게
command별 response minimization, encryption/access, 삭제 후 replay scope를
승인해야 한다. 삭제 시 idempotency row 처리 방식은 `[TBD]`다.

### 11.2 PUT/DELETE/PATCH

- `PUT`: 현재 의도 상태 전체 교체 또는 revisioned aggregate replace.
- `DELETE`: 반복 성공; 관계를 복원하지 않음.
- `PATCH`: `If-Match`/version 필수; stale은 409.
- pair/owner/Match uniqueness는 ledger expiry 뒤에도 DB constraint로 유지.
- reciprocal Interests는 같은 transaction에서 Match 하나만 생성.

### 11.3 notification/event

retry/replay는 notification과 lifecycle analytics를 추가 발생시키지 않는다.
domain outbox row는 business transaction과 같이 commit하고 dispatcher가
별도로 in-app `SocialNotification` projection을 materialize한다. notification
dedupe와 lifecycle event dedupe는 별도 ledger/key를 쓰되 하나의 source event에서
추적 가능해야 한다. client fetch retry는 새 item을 만들지 않는다. Interest 단독,
blocked/private/deleted target, suppressed kind는 item 0개다.

## 12. 오류 코드 보강

정본 §8.4가 이미 고정한 code와 sync/API packet이 아직 승인해야 할 후보를
구분한다.

| 상태 | HTTP | code | 의미 |
| --- | ---: | --- | --- |
| canonical 1.1 | 409 | `social_local_dataset_conflict` | 다른 claim/reclaim resolution 필요 |
| API-CONTRACT-02 후보 | 409 | `social_sync_revision_conflict` | stale 또는 잘못된 revision |
| API-CONTRACT-02 후보 | 409 | `social_sync_hash_conflict` | 같은 revision의 다른 payload |
| canonical 1.1 | 409 | `social_competition_not_ready` | selected dataset/rebaseline/barrier 또는 metric readiness 미충족 |
| API-CONTRACT-02 후보 | 409 | `social_catalog_version_unsupported` | 수동 scope catalog refresh 필요 |
| canonical 1.1 | 403 | `social_competition_disabled` | caller 자신의 capability/opt-in 설명만; target 상태에는 사용 금지 |

error details에는 dataset raw ID가 support에 꼭 필요한 경우를 제외하고 넣지
않으며, workout facts/hash, 위치, auth subject를 넣지 않는다.
다른 사용자의 competition consent/readiness/eligibility 실패는 정본대로
`404 social_resource_not_found`로만 mask한다.

## 13. Capability 계약

정본 `1.1.0`:

```ts
interface SocialCapabilities {
  socialCore: boolean;
  socialCompetition: boolean;
  partnerDiscovery: boolean;
  profileMedia: boolean;
  socialChat: boolean;
}
```

의존성:

```text
socialCompetition advertised → socialCore + approved sync/metric/safety infrastructure
socialCompetition effective  → advertised + user opt-in + selected dataset + current policy/action readiness
profileMedia      → socialCore + media safety gates
partnerDiscovery  → socialCore + 18+ + opt-in + manual scope + safety gates
socialChat        → socialCore + partnerDiscovery + active Match + ops gates
```

모든 server route는 capability를 독립 검사한다. build support와 validated
server response의 교집합만 effective다. missing/invalid/expired/offline은 false.

Safety rights는 별도 규칙이다.

```text
ALWAYS AVAILABLE FOR AUTHENTICATED OWNER
  block/unblock/list
  report create (creation-scoped opaque receipt response)
  own SafetyAction notice + appeal create/status
  discoverability off/private
  media delete
  competition disable + dataset revoke/purge + correction tombstone
  account delete/deletion status
```

이 rights plane은 current PolicyAcceptance, `socialCore`, `socialCompetition`,
active `restrict_social_writes`, active `suspend_social_access`보다 먼저 분기한다.

v1은 report receipt GET/list/history API를 추가하지 않는다. `POST /reports`
생성 응답의 receipt는 접수 식별과 support correlation을 위한 최소 값이다.
동일 idempotency key/fingerprint 재생은 MIN 24시간 같은 receipt를 반환하며,
이것은 별도 조회/history가 아니다. 내부 `Report.status`, triage/action/evidence를
절대 노출하지 않는다.

## 14. Migration·rollback

### 14.1 원칙

- local SQLite와 PostgreSQL 모두 additive-first.
- schema drop로 rollback하지 않고 capability를 false로 둔다.
- migration file과 registry는 한 owner.
- clean database와 upgrade fixture를 모두 rehearsal한다.
- SQLite app downgrade에서 새 row를 무시/보존하는 forward compatibility를
  정의한다.
- destructive data cleanup은 승인된 deletion/retention plan을 요구한다.

### 14.2 checksum portability

SQL checksum ledger를 선택한다면 Windows CRLF와 macOS LF가 다른 hash를
만들지 않도록 다음 중 하나를 고정한다.

- committed SQL을 `.gitattributes`로 LF 고정
- checksum input을 문서화된 방식으로 canonicalize

이 동작은 ORM 기본 기능이라고 가정하지 않는다. migration executor 설계와
library 선택은 별도 승인이다.

### 14.3 package/versions

Node/PostgreSQL 버전, NestJS package/version, ORM, auth/JWT, validation package와
버전은 모두 `[TBD]`다. 현재 lockfile에 없는 package를 설계 문서만으로
설치하지 않는다. NestJS 계획 자체를 바꾸려면 정본 개정이 필요하다.

## 15. 로그·분석·운영 데이터

### 15.1 request log allowlist

허용:

- requestId
- route template, method
- status class, stable error code
- bounded latency bucket
- capability cohort
- non-identifying operation enum

금지:

- auth token/subject/issuer, `actor_key`, raw social_user_id
- handle/profile text, invite token
- dataset/session/set IDs와 payload hash
- workout fact, body/health/food
- area/venue, IP-derived location
- message/report/media content/reference

로깅 실패는 domain write를 실패시키지 않는다. 안전 audit처럼 반드시 durable한
기록은 일반 application log가 아니라 domain transaction/outbox로 모델링한다.

## 16. Contract test inventory

### Function

- auth issuer/audience/expiry/subject negative cases
- body/header actor spoof, horizontal/vertical IDOR
- Profile sole-private/Discoverability all-off rights classifier와 authored/
  enable/mixed payload controller-domain-repository negative matrix; partial apply 0건
- account create/delete/status 및 no auto-provision
- 모든 entity state machine과 illegal transition
- block precedence 전 surface
- reciprocal Interest race → Match 정확히 하나
- generic POST replay/conflict/concurrent duplicate
- session revision/hash/tombstone matrix
- dataset barrier gap/coalesce/retry, selected dataset 정확히 1개 constraint
- own-but-dormant upload 거부, concurrent selection, pending/active Duel switch 거부,
  post-switch full rebaseline
- kill/stale-policy/restrict/suspend ordinary transport 거부, rights-first
  disable/revoke/tombstone 허용, pending/active Duel no-winner cancellation
- current policy version/supersession과 protective-rights exemption
- SafetyAction transition/atomic suppression, subject/operator/reporter IDOR,
  one-active-Appeal race/replay, modified replacement, reversal no-restore
- network/auth/capability failure 중 local workout save
- imported/health source DTO rejection
- correction 후 best projection invalidation
- migration clean/upgrade/rollback rehearsal

### Quality

- TypeScript strict, lint, unit, integration, contract, migration, build
- forbidden identifier/content static scan
- Windows + macOS clean install/CI
- integer metric/tie fixtures across JS/DB implementation
- cache에서 block/private/deleting 재노출 0건
- request log fixture에서 forbidden field 0건

### Product/workflow

- explicit dataset claim과 revoke 이해/완주
- account switch에서 자동 재연결 없음
- two-device selected-device 설명, dormant-device 기록 제외, pending/active Duel
  switch 거부, kill-state opt-out/revoke, no-winner cancellation과 rebaseline 이해
- offline local log 후 background sync 상태 이해
- sync not ready에서 Duel이 시작되지 않고 복구 경로 제시
- correction/delete가 약속한 competition 결과 정책과 일치

아직 `server/`와 sync 구현이 없으므로 이 목록은 미래 gate이며 통과 사실이
아니다.

## 17. 구현 차단 입력·증거

| ID | 필요한 결정 또는 증거 | 차단 범위 |
| --- | --- | --- |
| `DATA-01` | auth topology/provider/claims | account/public Social |
| `DATA-02` | deletion status credential와 유한 retention | deletion/public Social |
| `DATA-03` | `socialCompetition` contract-version parsing, server config, user opt-in implementation evidence | 모든 비교/Duel |
| `DATA-04` | selected dataset 1개 규칙은 확정; reclaim/account-switch/reinstall recovery | sync |
| `DATA-05` | minimum payload bounds·consent·retention | sync/competition |
| `DATA-06` | planned count vs planned-day metric | comparison |
| `DATA-07` | barrier freshness/no-contest/forfeit | Duel |
| `DATA-08` | correction/dispute/result immutability | Duel history |
| `DATA-09` | NestJS/PostgreSQL version, ORM/SQL access, migration executor | server scaffold |
| `DATA-10` | report creation receipt와 internal safety audit schema | safety rights |
| `DATA-11` | report context 발급 surface/token bounds/expiry/reuse/rate/deletion retention | reportable reads, block→report |
| `DATA-12` | Profile normalization/exact bounds와 Profile/Crew moderated fields, edit projection, queue/review/SafetyAction/Appeal/retention | Identity·public core Social |
| `DATA-13` | in-app notification kind/state/dedupe/retention/badge/open-destination semantics | socialCore delivery |
| `DATA-14` | fixed Safety runtime/release-config ownership의 구현 readback, policy key/version config, SafetyAction target-effect matrix/notice, Appeal bounds/reviewer/retention/SLO와 E2E evidence | public authored writes·safety rights |
