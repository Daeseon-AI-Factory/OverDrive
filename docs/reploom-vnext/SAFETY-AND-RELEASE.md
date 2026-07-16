# Reploom vNext 안전·개인정보·출시 설계

Status: **DESIGN CANDIDATE — 법률/운영/출시 승인 아님**

## 1. 안전 모델

Social v1의 안전은 copy나 사후 moderation만이 아니라 다음 네 층의
invariant다.

1. **최소 수집:** 정확한 위치, 이동 경로, 집 위치, 불필요한 workout/health
   데이터를 만들거나 보내지 않는다.
2. **노출 제어:** private/default-off, block precedence, moderation suppression,
   sparse cohort를 모든 projection에 적용한다.
3. **사용자 권리:** 비공개, opt-out, block, report, media delete, account delete를
   capability kill 중에도 제공한다.
4. **운영 대응:** triage, 즉시 suppression, escalation, evidence access, appeal,
   finite retention을 실제 담당자와 rehearsal로 검증한다.

운영 인력, 법률 충분성, retention 수치, 실제 queue 처리량은 현재
`[unverified]`다. 이 문서는 그 수치를 만들어 승인하지 않는다.

## 2. 현재 1.0과 다음 Social release

| 구분 | 현재 1.0/review track | 다음 social-capable release |
| --- | --- | --- |
| Online Social account | 없음으로 공시된 상태 | 명시적 account 생성 |
| Navigation | 현재 behavior 유지 | `TODAY/TRAIN/+LOG/SOCIAL/ME` |
| Profile/UGC surface | 없음으로 공시된 상태 | self·accepted-friend·minimal opt-in discovery만; global public profile 없음 |
| Nearby | 없음 | 18+ + explicit opt-in + manual scope |
| Notification | 없음 | generic in-app pull only; OS push 없음 |
| Chat | `messagingAndChat: false` | 별도 retention/ops/store gate 뒤 |
| Feature flags | false 또는 capability absent | cohort별 independent enable |
| Store/review action | 변경 금지 | 별도 release 승인 필요 |

저장소 handoff의 review 상태는 특정 시점 기록이다. live App Store Connect
상태는 이 설계에서 확인하지 않았으므로 `[unverified]`다. 다음 marketing
version도 `[TBD]`다.

## 3. Safety rights plane

### 3.1 권리 경로

아래 경로는 사용자가 자신의 안전·데이터를 통제하는 경로다.

| 권리 | public route/화면 | capability가 false일 때 |
| --- | --- | --- |
| Profile private | `PATCH /me/profile` / ME | 허용 |
| Discoverability off/clear | `PUT /me/discoverability` / ME | 허용 |
| Block create/list/delete | `/blocks` / 사람 메뉴·ME | 허용 |
| Report create | `POST /reports` / 사람·content 메뉴 | 허용 |
| Policy currentness/accept | `GET /me`, `PUT /me/policy-acceptances/{key}` / ME | 허용; old policy는 새 gated write만 차단 |
| SafetyAction notice/Appeal | `GET /me`, `POST /appeals`, `GET /appeals/{id}` / ME | 허용; suspension/kill보다 rights guard 우선 |
| Media delete | `DELETE /me/media/{id}` / ME | 업로드 off여도 기존 media 삭제 허용 |
| Competition opt-out/dataset revoke | `PUT /me/competition-preferences`, `DELETE /me/workout-datasets/{id}` / ME | false/clear/revoke는 kill·stale policy·restriction·suspension 중에도 허용; pending/active Duel은 winner 없이 취소 |
| Workout correction tombstone | selected dataset correction route / ME | ordinary upload가 닫혀도 철회/삭제는 허용; readiness와 영향받은 Duel을 무효화 |
| Account delete | `DELETE /account` / ME | 허용 |
| Deletion status | `GET /account/deletion` / ME | 허용 |

`socialCore=false`가 새 관계·profile publish를 막을 수는 있지만 이미 생긴
데이터의 block/report/appeal/private/opt-out/delete/deletion-status를 막아서는 안 된다. 서버 outage 자체로
즉시 처리할 수 없을 때 server receipt 없이 성공을 표시하지 않고 local workout은
계속 허용한다. 현재는 online 재시도 경로를 제공한다. durable offline safety
queue나 local-only hide는 별도 계약 `[TBD]`다.

Profile/Discoverability public route 전체가 rights-first인 것은 아니다. Profile은
sole `visibility=private`, Discoverability는 every flag false + scope off +
area/venue clear인 validated command만 protective다. authored/media field,
visibility expansion, attestation/new scope/selection, true opt-in, 또는 mixed
narrowing+expansion payload는 ordinary로 guard하거나 전부 reject하며 partial
apply하지 않는다.

v1은 report receipt GET/list/history route를 추가하지 않는다. `POST /reports`
생성 성공 응답에서 opaque receipt/support ID를 제공한다. 동일 idempotency
key/fingerprint 재생은 MIN 24시간 같은 receipt를 반환하며 별도 조회/history가
아니다. internal `Report.status`, triage, action, evidence를 노출하지 않는다.

### 3.2 generic masking

다른 사용자에 대한 다음 상태는 모두 generic 404 projection으로 합친다.

- 존재하지 않음
- target이 block했거나 caller가 block함
- private/opt-out
- moderation hidden
- underage/eligibility failure
- deleting/deleted
- capability disabled

self-owned setting failure만 구체적 403으로 설명한다. target의 안전 상태를
error code, timing, count, cursor, cache에서 추론하게 하지 않는다.

## 4. 위치·Nearby 위협 모델

### 4.1 수집 계약

v1이 저장할 수 있는 location-like 값은 사용자가 catalog에서 직접 고른 현재
`area_code` 또는 `venue_id` 하나다.

저장/전송 금지:

- latitude, longitude, altitude, accuracy, radius
- geohash, coordinate-derived distance
- background/live presence
- route, visit history, previous selections
- address/free-text place, home/work inference
- IP-derived area
- exact venue arrival/leave time

selection을 교체하거나 clear할 때 application history row를 남기지 않는다.
필요한 security audit는 location value가 아니라 change operation/outcome만
기록한다.

### 4.2 permission denial

Social v1이 OS location permission을 요청하는 횟수는 0회(`EXACT`)다. 다른
기능이나 과거 상태와 공존하더라도:

- denied/restricted/skipped 상태에서 수동 selector를 즉시 제공한다.
- Nearby eligibility를 permission 허용으로 우회하지 않는다.
- OS 상태가 이미 허용이어도 Social API에 coordinate를 보내지 않는다.
- permission failure가 local log를 막지 않는다.

### 4.3 희소 장소 추론 공격

수동 venue도 다음 공격을 허용할 수 있다.

1. 공격자가 venue를 하나씩 바꾸며 후보 변화를 본다.
2. area와 venue query를 교차해 소수 사용자를 좁힌다.
3. 시간별 반복 조회로 live presence를 추정한다.
4. 여러 계정이 threshold 주변을 probing한다.

따라서 `partnerDiscovery=true` 전에 다음을 승인·검증한다.

- 공개하지 않는 `sparse cohort minimum` `[TBD]`
- venue/area selection 변경 및 query rate `[TBD]`
- 반복 candidate ordering/rotation policy
- cohort threshold 근처의 결과 안정화/일반화
- venue enumeration과 cross-scope correlation abuse test
- multi-account/rate-limit 운영 대응

threshold 수치가 없거나 실제 방어 test가 실패하면 `partnerDiscovery=false`를
유지한다.

## 5. 18+ Partner discovery

### 5.1 자격

모든 단계에서 server가 다시 확인한다.

```text
current adult self-attestation
AND partner opt-in
AND current manual scope
AND profile/discovery eligibility
AND no block/moderation suppression
AND partnerDiscovery capability
```

18+는 `MIN` self-attested age이며 신원·법적 나이 인증이 아니다. policy/store
review가 승인되기 전 공개하지 않는다.

### 5.2 철회

partner opt-out, attestation invalidation, scope clear, profile private처럼 partner
eligibility가 철회되면:

- candidate projection 즉시 제거
- outgoing Interests withdraw/suppress
- unmatched reciprocal state는 withdraw/suppress
- 기존 Match receipt/detail은 read-only 유지; 새 chat read/write 중단
- notification/outbox에서 target 제거
- stale cache invalidation

opt-in 철회가 profile/account 삭제를 요구하지 않도록 독립 control로 둔다.

Block은 같은 전이가 아니다. Block이면 §7.1과 정본 block-first 규칙이 우선해
Match를 close/cancel하고 Match detail을 포함한 상대 read를 즉시 숨기며 chat
authorization을 폐기한다. moderation/safety action은 승인된 action matrix에 따라
projection을 suppress하거나 관계를 close한다. Block 또는 대상 suppression을
partner opt-out의 read-only Match 예외로 완화하지 않는다.

### 5.3 외모 기반 피해 금지

- attractiveness/hotness/체형/얼굴 score 없음
- photo engagement ordering 없음
- public like/rejection count 없음
- unilateral Interest notification 없음
- absolute strength/body/CP/verifiedRatio matching 없음
- Match 전 chat 없음

실제 candidate ordering은 비민감 입력만 사용하며 bias/safety review 전
`partnerDiscovery=false`다.

## 6. Profile media

### 6.1 provenance invariant

| kind | 제품 표기 | 주장하지 않는 것 |
| --- | --- | --- |
| `user_photo` | `업로드 사진` | identity, age, recency, unedited |
| `ai_stylized` | `AI 스타일` | actual appearance, official verification |

kind는 upload row, source link, rendition, cache, API, accessibility, share까지
전파한다. crop/thumbnail/image failure가 badge를 제거하지 않는다.

### 6.2 pipeline gate

`profileMedia=true` 전에 다음이 모두 있어야 한다.

- bounded type/dimension/byte limits `[TBD]`
- server-side re-encode와 EXIF/location 제거 fixture
- pending=self-only
- pre-publication moderation과 rejection/appeal flow
- original-IP style policy
- provider-neutral processing port
- rendition/cache delete traversal
- safety evidence와 backup의 finite retention
- permission copy, privacy/terms/store disclosure
- abuse/rate/cost controls

하나라도 없으면 text profile만 사용한다.

### 6.3 moderation failure

- scanner/provider timeout → pending 유지; publish하지 않음
- ambiguous result → human queue 또는 hidden
- rejected → 일반화된 사유와 삭제/appeal 경로
- later report/safety action → 즉시 hidden + cache purge request
- processing log → raw photo, URL, checksum을 ordinary log에 남기지 않음

## 6.4 Profile·Crew core text moderation

Profile `handle/display_name/bio`와 Crew `name`은 media/chat과 별도의 core text
lane이다. 처음 입력과 edit candidate는 `pending`이며 self 외 projection에
노출하지 않는다. approved revision과 새 candidate를 분리하고, Safety `hidden`은
이전 approved 값까지 즉시 suppress한다.

- provider/queue timeout → pending 유지, fail-open 금지
- rejected → 타인에게 content/reason 비노출, owner에게 일반화된 사유와
  edit/delete/appeal만 제공
- duplicate/out-of-order result → 최신 revision을 되돌리지 않음
- raw handle/display/bio/Crew name → ordinary log/analytics/error 금지
- provider/model → config/port로 교체 가능, 단일 vendor 하드코딩 금지
- queue·appeal·retention·overflow kill owner → 공개 core 전 필수

정본 `1.1.0`은 Profile/Crew revision enum과 lifecycle을 모두
`pending | approved | rejected | hidden`으로 고정했다. 남은 gate는 Profile/Crew
필드 bounds와 normalization, provider/queue/review owner, rejection-action 운영,
retention/overflow evidence다. 이 readback과 production moderation adapter가
승인되기 전 friend search, Profile friend/discovery projection, Crew invite/name
projection은 rollout하지 않는다.

## 6.5 Pull-only in-app notification

v1은 Social 내 generic inbox만 사용하고 OS push token/permission/provider는 쓰지
않는다. item payload에는 target ID, handle, profile/message/report text, 위치,
workout/score가 없으며 unilateral Interest는 notification을 만들지 않는다.

- durable source transition + atomic outbox 뒤에만 item 생성
- `(recipient, source event, kind)` unique dedupe
- list는 recipient self-only, open은 current block/private/membership/capability 재검사
- Block/delete/suppression은 pending outbox와 server item을 suppress
- client에 이미 보인 item은 회수했다고 주장하지 않으며 stale open은 generic 404
- notification retention/kind/badge/overflow owner 미승인 시 socialCore rollout 차단

OS push는 별도 privacy/store/permission/transport 계약 없이는 추가하지 않는다.

## 7. Block·Report·Moderation

### 7.1 Block transaction

Block 생성은 한 domain transaction/atomic outbox boundary에서 최소한 다음을
보장한다.

- directional Block row upsert
- profile/discovery/search projection suppression
- pending direct Invite, active Interest, Friendship, Duel, Match transition/cancel
- chat stop
- unsent direct notification 대상 제거
- cache invalidation event
- user에게 최소 receipt

외부 media/cache purge가 비동기여도 authoritative read는 즉시 숨긴다. unblock는
과거 관계를 복원하지 않는다.

### 7.2 Report

- 인증된 reportable projection read에서 발급된 `report_context_receipt`로 block
  뒤에도 신고 가능; `POST /reports` 결과인 `report_receipt`와 혼동 금지
- context receipt는 reporter/target type/internal target/expiry/version에 binding,
  public token은 opaque이고 server 저장은 digest만
- bounded target_type/category와 optional details bounds `[TBD]`
- subject에게 reporter identity, status, evidence를 노출하지 않음
- public report-create response는 별도 opaque `report_receipt`만
- crew moderator는 safety console 권한 없음
- internal read/action은 별도 role, audit, least privilege

context receipt swap/위조/만료/cross-account 재사용은 generic하게 거부한다.
정확한 expiry/reuse/client handoff가 승인되기 전 block→report release gate는
닫혀 있다. receipt list/history API는 만들지 않는다.

open report를 단순히 "close까지" 보존하면 무기한이 될 수 있다. 다음이
필요하다.

- open-case review cadence `[TBD]`
- extension authority와 reason code
- max retention 또는 법적 hold의 별도 승인
- close 후 finite evidence schedule
- appeal/reopen 시 새 expiry 계산

### 7.3 PolicyAcceptance·SafetyAction·Appeal

Release owner는 manifest-fixed current policy config와 Terms/community-rules
key/version readback을 소유하고, Safety runtime은 fail-closed
`PolicyRegistryPort` adapter를 소유하며, Identity는 immutable acceptance를
소유한다. missing/placeholder/invalid config는 ordinary write를 열지 않는다.
policy bump는 기존 read와 protective rights를 유지하며 새
Profile/Crew/media/chat·Invite/Interest·competition write만 재동의로 닫는다. adult
attestation, partner opt-in, dataset consent는 policy acceptance를 대체하지 않는다.

| action kind | 적용 | appeal/reversal |
| --- | --- | --- |
| `hide_content` | exact revision suppress + cache/search/invite/discovery invalidation | reversal은 aggregate owner restore review command; 자동 republish 없음 |
| `restrict_social_writes` | 새 authored text/media upload, relationship, competition enable/fact transport 차단 | future write만 다시 허용; media delete·competition opt-out/revoke/tombstone 유지; 관계 복원 없음 |
| `suspend_social_access` | ordinary session revoke, ordinary Social read/write suppress | rights-scoped auth path 유지; reversal 뒤 새 ordinary session 필요 |

prepublication Profile/Crew/media rejection도 version-bound appealable SafetyAction을
만든다. moderation result 적용, projection suppression, SafetyAction, outbox/notice는
하나의 transaction 또는 atomic outbox boundary여야 한다. subject는 opaque
`actionReceipt`와 일반화된 reason/expiry/appeal 상태만 보고 operator, provider,
reporter, evidence, raw content는 보지 못한다.

Appeal active state는 `submitted | acknowledged | under_review`, terminal은
`upheld | modified | reversed`다. same action/version에는 active Appeal 최대 1개다.
`modified`는 old action reverse + replacement action create이며 history mutation이
아니다. terminal reopen은 없고 replacement action이 별도 appealable일 때만 새
Appeal이 가능하다. statement/decision bounds, reviewer separation, retention,
response SLO는 `[TBD]`이며 public rollout을 막는다.

### 7.4 고위험 escalation

imminent threat, suspected underage use, exploitation 등 고위험 category에는
평균 triage 숫자만 두지 않는다. 다음 운영 계약이 필요하다.

- 즉시 public suppression 조건
- on-call 또는 명시적 영업시간/한계
- escalation recipient와 backup owner
- law-enforcement/emergency request policy `[legal review]`
- evidence 접근 승인·audit
- 오판 appeal과 복구
- queue overflow 시 capability/cohort kill

담당자와 rehearsal evidence가 없으면 해당 public capability를 열지 않는다.

### 7.5 Crew의 block/role 충돌

차단만으로 같은 Crew membership, owner, moderator role을 축출하지 않으며,
서로의 projection/notification/interaction을 숨기는 것은 확정이다. 다음 관리
행위 행렬만 `[TBD]`다.

| 관계 | 필요한 결정 |
| --- | --- |
| owner blocks member | owner가 removal/role action을 할 수 있는가, 누가 대행하는가 |
| member blocks owner | archive/ownership notice를 어떻게 최소 노출하는가 |
| moderator blocks member | role action과 block projection을 분리하는가 |
| blocked users share crew | 서로를 숨기면서 member count/competition을 어떻게 처리하는가 |
| safety action removes owner | 자동 archive/transfer authority |

행렬 승인과 IDOR/block tests 전 Crew public rollout을 막는다.

## 8. 삭제·보존

### 8.1 Social account delete

valid + recent-auth delete command는 즉시:

1. account를 `deleting`으로 전환
2. Social session revoke
3. profile/discoverability/media 공개 suppression
4. chat stop
5. graph cleanup job enqueue
6. deletion status receipt 반환

retry는 같은 job/receipt를 반환한다. local workout, subscription quota,
Apple subscription, legacy ledger를 자동 삭제하지 않는다.

### 8.2 데이터별 정책 승인표

수치는 각 행마다 별도로 승인한다. 아키텍처 승인과 함께 묶지 않는다.

| 데이터 | active 목적 | delete transition | finite 기간 | 법률/운영 검증 |
| --- | --- | --- | --- | --- |
| Profile/graph | Social 기능 | 즉시 suppress, async erase | `TBD` | `TBD` |
| Media/rendition/cache | profile 표현 | 즉시 hide, purge | `TBD` | `TBD` |
| Message | active Match | participant view 제거 | `TBD` | `TBD` |
| Report/evidence | safety | access 제한/case policy | `TBD` | `TBD` |
| Block abuse record | suppression/abuse | 최소 tombstone 후보 | `TBD` | `TBD` |
| Auth/deletion credential | status/re-registration | scoped tombstone | `TBD` | `TBD` |
| Workout sync facts | competition | dataset purge/invalidate | `TBD` | `TBD` |
| Dormant dataset claim metadata | selected-device/reclaim conflict | no workout fact transport; revoke/purge | `TBD` | minimization + reinstall recovery |
| Metric/result | participant history | suppress/void policy | `TBD` | `TBD` |
| PolicyAcceptance | policy evidence/currentness | immutable minimized evidence | `TBD` | policy registry + deletion review |
| SafetyAction/Appeal | restriction, notice, review/audit | subject suppression 유지; case-scoped transition | `TBD` | reviewer separation + appeal rights |
| Idempotency receipt | retry safety | command schema 자체를 최소화하되 complete original status/body replay | MIN 24h 계약과 삭제 조정 | `TBD` |
| Backup | disaster recovery | expiry-driven purge | `TBD` | restore+delete rehearsal |
| Ordinary logs | reliability | sensitive value 없음 | `TBD` | scan |
| In-app notification | generic delivery | block/delete suppress, expiry purge | `TBD` | dedupe + stale-open rehearsal |

무기한 retention과 active safety evidence의 무조건 즉시 삭제를 모두 금지한다.
법적 hold가 필요하면 일반 retention의 예외로 권한, 범위, 만료, audit를 둔다.

### 8.3 deletion 검증

- authoritative read 즉시 suppression
- repeated command 같은 job
- job retry/partial failure recovery
- backup restore 후 삭제/suppression 재적용
- deleted account GET이 auto-provision하지 않음
- deletion status credential expiry/recovery
- Social 삭제가 local workout/subscription에 영향 없음
- purge 후 stale sync snapshot이 재생되지 않음

## 9. Capability와 kill switch

### 9.1 정본 `1.1.0`

five capabilities:

```text
socialCore
socialCompetition
partnerDiscovery
profileMedia
socialChat
```

advertised `socialCompetition`은 Duel뿐 아니라 friend/crew comparison과 active
workout transport를 함께 닫는다. account-level `competitionEnabled`는 default
false이며, 실제 competition은 selected dataset/current policy/SafetyAction/sync/
metric readiness까지 충족해야 effective다. claim/enable setup은 advertised key를
사용하고, false/clear/revoke/purge/tombstone은 rights-first 보호 전이다.

### 9.2 fail-closed

client effective value:

```text
buildSupport
AND parsedKnownSchema
AND unexpiredValidatedServerCapability
AND dependencyCapabilities
```

missing, unknown schema, parse error, expired cache, offline first launch,
server error는 false다. cached true는 expiry 뒤 사용할 수 없다. 서버도 각
route에서 독립 enforcement한다.

### 9.3 kill 순서

1. affected capability false
2. server writes fail closed
3. cached projections hide/invalidate
4. pending notification/outbox를 suppress하고 stale item open의 current authz 재검사
5. safety rights plane availability 확인
6. TODAY/TRAIN/+LOG local save 확인
7. incident scope와 user copy 확인
8. root cause와 data cleanup 결정

kill은 migration drop나 safety evidence 삭제를 의미하지 않는다.

## 10. 분석·지표 안전

### 10.1 수집 경계

정본 event allowlist와 envelope만 사용한다. client UX event는 privacy/store
승인 전 default off. domain lifecycle metric은 durable state에서 중복 없이
계산한다.

금지:

- auth subject/issuer, actor_key, raw social user/pair ID
- handle/bio/search/token/media URL
- area/venue/IP location
- message/report/photo content
- health/workout/body/food/CP/verifiedRatio

### 10.2 metric 해석

| Metric | 사용 | 단독 판정 금지 |
| --- | --- | --- |
| profile activation | onboarding friction | profile quality/안전 |
| friend acceptance | invite flow | spam 여부 |
| crew join | crew flow | community health |
| mutual-interest | discovery funnel | 외모 선호/사람 가치 |
| match-to-chat | chat availability | relationship success |
| block/report rate | guardrail/investigation | 높음=실패 또는 낮음=안전 |
| privacy-control completion | 권리 신뢰성 | 법률 충분성 |
| API reliability | 시스템 상태 | product usefulness |

dashboard는 denominator, window, capability cohort, schema/metric version을
함께 표시한다. 목표 threshold는 baseline과 승인 전 `[TBD]`다.

## 11. Store·정책·지원 dual sources

다음 capability를 열기 전 **구현 사실과 동일한 시점**에 관련 source를 한
release owner가 맞춘다.

| Capability | 확인할 source |
| --- | --- |
| account/profile | privacy, terms, data deletion, account policy, store linked-ID/UGC declarations |
| media | photo permission, UGC/moderation, AI style provenance, retention |
| nearby | 18+ policy, manual location disclosure, age rating/privacy questionnaire |
| chat | messaging/UGC, retention, report/block, moderation/support |
| workout sync/competition | workout data consent, privacy/store data declaration |

관련 저장소 후보:

- `docs/compliance/privacy-policy.md`
- terms/data/support source `[exact paths to inventory]`
- `docs/launch/app-store-listing.md`
- `store.config.json`
- `app.json`

현재 공시가 account/chat/remote photo가 없다고 말하는 동안 해당 capability를
외부 build에서 true로 만들지 않는다. 문서만 먼저 과장해 미래 기능을 이미
수집하는 것처럼 쓰지도 않는다.

## 12. Release gates

### Gate 0 — 계약

- Social contract `1.1.0` precedence와 five-key schema readback
- `socialCompetition=false` default, competition consent, selected dataset 정확히 1개 readback
- deletion status credential 결정
- sync/metric/timezone/correction 결정
- Crew block-role 행렬 결정
- `report_context_receipt`와 `report_receipt` 분리, 발급/binding/expiry/reuse 결정,
  report GET/list/history 없음 확인
- Profile/Crew fixed moderation enum/lifecycle 구현 readback; Profile/Crew bounds,
  provider queue/review/rejection-action/retention owner 결정
- fixed release-config/Safety-runtime policy registry ownership 구현 readback,
  key/version config와 roll-forward/rollback, SafetyAction effect/notice,
  Appeal reviewer/operations 결정
- in-app notification kind/state/dedupe/retention/open semantics 결정; OS push 제외
- manual area/venue catalog source/version/deprecation/governance 결정

### Gate 1 — Foundation

- strict TypeScript server scaffold approved
- auth positive/negative contract
- clean DB + migration rollback rehearsal
- local logging isolation test
- safety rights plane skeleton

### Gate 2 — Social core limited cohort

- private-default profile
- Profile/Crew text pending/rejected/hidden self-only와 production moderation queue
- friends/private crews IDOR/state tests
- notification dedupe, Interest 0건, block/private stale-open 404
- block/report/delete/deletion-status end-to-end
- policy supersession, SafetyAction notice/effect, Appeal one-active/modified/reversal E2E
- moderation owner/escalation staffed
- policy/store sources match actual build
- local logging under Social kill

### Gate 3 — Competition

- `socialCompetition` false-by-default
- explicit dataset/competition consent + selected dataset 정확히 1개
- own-but-dormant upload 거부, pending/active Duel switch 거부,
  post-switch competition false + full rebaseline
- kill/stale policy/restrict/suspend ordinary upload·enable 거부와 rights-first
  false/clear/revoke/tombstone 허용, pending/active Duel no-winner cancel
- minimum payload/privacy approval
- revision/hash/barrier/correction fixtures
- server metric integer/tie conformance
- provenance/bias review
- sync evasion/no-contest policy

### Gate 4 — Media

- provenance end-to-end
- EXIF/re-encode fixture
- moderation and cache deletion
- backup/retention
- store disclosure

### Gate 5 — Partner

- 18+ language/policy review
- manual-only location
- sparse/enumeration/correlation abuse tests
- opt-out/block/match transition
- on-call/escalation capacity

### Gate 6 — Chat

- finite retention
- text moderation/evidence/report
- block/unmatch/delete behavior
- rate/abuse limits
- messaging/UGC store declarations

Gate 번호는 순서 식별자인 `EXACT` 값이며 기간이 아니다. 각 capability는
자기 gate를 통과하기 전 false다.

## 13. 즉시 중단 조건

다음 중 하나가 발견되면 해당 lane/rollout을 중단하고 capability를 false로
유지한다.

- flag가 missing/invalid인데 true로 해석
- raw Health/GPS/route/home 또는 금지 analytics/log field 수집
- network/auth/hash가 local logging transaction을 지연·실패
- body/header actor spoof 또는 IDOR 성공
- block/private/deleting user가 cache/search/notification에 재노출
- delete 후 status가 끊기거나 account가 자동 재생성
- rights route가 `socialCore` kill과 함께 죽음
- policy bump/suspend가 block/report/appeal/private/opt-out/delete/status를 막음
- capability/policy/action kill이 media delete, competition opt-out/dataset revoke,
  correction tombstone을 막음
- action reversal이 관계·content를 자동 복원하거나 다른 subject action이 노출
- moderation staffing/escalation 미확정
- finite retention/backup deletion rehearsal 부재
- actual implementation과 policy/store metadata 불일치
- Social identity와 `actor_key` join/path 존재
- real-person comparison에 CP/verifiedRatio/absolute body/strength 사용

## 14. 검증 수준

### Function verification

- command/endpoint/state machine 실행
- IDOR, block precedence, capability dependencies
- location denial → manual selector
- delete/status/retry/restore
- local log during outage/kill
- media provenance pipeline
- sync revision/barrier/correction
- selected dataset exactly-one/dormant/switch/rebaseline과 kill-state
  opt-out/revoke/tombstone no-winner cancellation
- policy currentness, SafetyAction atomic suppression, Appeal race/IDOR/reversal
- Profile private-only/Discoverability all-off classifier와 mixed-payload
  controller/domain/repository denial, partial apply 0건

### Quality verification

- strict type/lint/unit/integration/contract/migration/build
- forbidden field scans
- macOS + Windows clean install
- iOS + Android behavior
- skin/text-size/screen-reader/keyboard visual QA
- rate/abuse/security tests
- queue, retention, backup restore/delete rehearsal

### Product/workflow verification

- 동의한 실제 test users가 friend/crew/nearby/match/chat/rights/delete를 완주
- two-device selected dataset/dormant exclusion/switch rebaseline과 kill-state
  opt-out/revoke no-winner cancellation을 이해
- policy 재동의와 SafetyAction notice→Appeal→terminal outcome을 완주
- step, time, error, abandonment 기록
- capability cohort와 denominator 포함
- 목표 threshold는 별도 승인

테스트 green은 Function 일부만 증명한다. 운영, 시각 품질, 실제 사용자 과업
완주는 각각 별도 증거가 필요하다.

## 15. 미확정·승인 주체

| ID | 항목 | 필요한 주체 | 막히는 capability |
| --- | --- | --- | --- |
| `SAFE-01` | recent-auth/deletion credential | Identity + Privacy | all public social |
| `SAFE-02` | finite retention/SLO | Legal/Privacy + Ops | all public social |
| `SAFE-03` | moderation staffing/escalation | Safety owner | all UGC/social |
| `SAFE-04` | sparse/rate limits | Safety + Product | partnerDiscovery |
| `SAFE-05` | venue catalog governance | Product + Safety | partnerDiscovery |
| `SAFE-06` | media provider/limits/moderation | Media + Safety | profileMedia |
| `SAFE-07` | chat retention/moderation | Safety + Ops | socialChat |
| `SAFE-08` | Profile normalization/exact bounds, fixed Profile/Crew enum 구현 readback, provider queue/review, rejection-action/retention | Safety + Identity + Crew + Ops | socialCore |
| `SAFE-09` | report context 발급 surface/bounds/expiry/reuse/rate/client handoff | Safety + Privacy + API + Client | all reportable surfaces |
| `SAFE-10` | Crew block-role matrix | Safety + Product | Crew |
| `SAFE-11` | sync data consent/retention | Privacy + Data | socialCompetition |
| `SAFE-12` | store questionnaire/version/cohort | Release owner | external release |
| `SAFE-13` | notification kind/state/dedupe/retention/badge/open semantics | Product + Safety + Backend + Client | socialCore delivery |
| `SAFE-14` | fixed policy registry runtime/config ownership readback, key/version currentness, SafetyAction target-effect/notice, Appeal bounds/reviewer/retention/SLO | Safety + Identity + Release + Product + Ops | public authored writes·safety rights |
