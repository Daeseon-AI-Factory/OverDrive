# Reploom vNext 제품·시스템 설계

Status: **APPROVED DECISION SET — `TBD` gate 해소 전 구현 금지**

작성 기준일: `2026-07-16`

기준 브랜치: `origin/codex/social-v1-contract`

## 1. 이 문서 묶음의 권한

이 디렉터리는 `docs/social-v1-contract.md`를 실제 구현 가능한 화면,
데이터, 안전, 작업 패킷으로 분해한 구현 설계다. `docs/social-v1-contract.md`
`1.1.0`에 들어간 결정은 정본이고, 나머지 `TBD`와 packet 경로는 구현 전
검증·승인을 요구한다. 아래 규칙을 따른다.

- `docs/social-v1-contract.md`가 Social v1의 현재 정본이다.
- 이 문서가 정본과 다르면 정본이 우선하며, 차이는 "정본 개정 필요"로
  기록한다.
- `docs/overdrive-spec.md`의 장기 아이디어와 Social v1 정본이 충돌하면
  구현자가 임의로 섞지 않는다.
- 별도 Phase 0 초안에서 selected-dataset과
  Safety support model을 채택했지만, `duels`-only flag와 미승인 수치·dependency는
  채택하지 않았다. 임시 worktree 문서 자체는 정본이 아니다.
- 이 묶음은 기능 코드, 의존성, 배포, TestFlight, 결제, App Store 상태를
  바꿀 권한을 부여하지 않는다.
- `TBD`는 누락이 아니라 해당 기능의 출시를 막는 명시적 게이트다.

## 2. 문서 지도

| 문서 | 답하는 질문 | 구현자가 얻는 산출물 |
| --- | --- | --- |
| `PRODUCT-EXPERIENCE.md` | 사용자가 어디서 무엇을 하는가? | 5탭 IA, 화면, 상태, 흐름, UX 수용 기준 |
| `DOMAIN-AND-DATA.md` | 어떤 신원과 상태가 진실인가? | 경계, 엔티티, REST, 동기화, 멱등성, 오류 |
| `SAFETY-AND-RELEASE.md` | 어떤 위험을 어떻게 막고 여는가? | 권리, 위치, 보존, 운영, 플래그, 출시 게이트 |
| `PARALLEL-BUILD.md` | 여러 작업자가 충돌 없이 어떻게 만드는가? | 파동, 패킷, 전용 경로, 병합·중단 조건 |

## 3. 제품 한 문장

Reploom vNext는 **혼자 기록하고 성장하는 로컬 우선 운동 앱** 위에,
사용자가 명시적으로 참여할 때만 친구·주변·크루 관계를 추가한다.

그 문장은 다음 경계를 만든다.

| 질문 | 소유 탭 | 답 |
| --- | --- | --- |
| 지금 무엇을 할까? | `TODAY` | 다음 행동, 진행 중 운동, 오늘 목표 |
| 나는 어떻게 성장했나? | `TRAIN` | 프로그램, 탐색, 기록, PR, 꾸준함, 개인 CP |
| 지금 무엇을 기록할까? | `+LOG` | 근력·유산소·식사 입력의 단일 저장 진입점 |
| 다른 사람과 무엇을 할까? | `SOCIAL` | 친구, 주변, 크루, 합의된 비교·대결 |
| 나는 누구이고 무엇을 허용했나? | `ME` | 프로필, 공개범위, 안전, 구독, 앱 설정 |

개인 성취의 상세 원장은 `TRAIN`이 소유한다. `TODAY`는 그중 오늘 행동에
필요한 요약만 보여 준다. 실제 사람과의 비교 및 Duel은 `SOCIAL`이 소유한다.

## 4. 전체 정보 구조

```text
TODAY
├── 다음 행동 / 진행 중 운동
├── 오늘 목표
├── 이번 주 요약
└── 최근 개인 성취 → TRAIN/Growth

TRAIN
├── Plan: 프로그램, 오늘 계획, 다음 세션
├── Explore: 검색, 부위 탐색, 운동 상세
└── Growth: 주간 기록, PR, 꾸준함, 개인 CP, 전체 History, Solo Challenge

+LOG
├── 빠른 근력
├── 운동 찾아 기록
├── 유산소
└── 식사

SOCIAL
├── 친구: 초대, 친구, 비교, Duel
├── 주변: 18+ opt-in, 수동 지역/장소, Interest, Match
└── 크루: 초대형 비공개 크루, 멤버, 비교

ME
├── 내 프로필 / self·친구·최소 discovery 미리보기
├── 공개범위 / 탐색 동의
├── 차단 목록 / 신고 제출·도움 / 소셜 계정 삭제
├── 구독
└── 앱 설정 / 접근성 / 법적 문서
```

## 5. 소스 권위와 확인된 충돌

### 5.1 권위 순서

1. 저장소와 사용자 지시의 안전·헌법 규칙
2. `docs/social-v1-contract.md`의 Social v1 규범
3. 승인된 후속 계약 개정
4. 이 디렉터리의 승인된 설계
5. 기존 장기 스펙과 과거 제안 문서

### 5.2 구현 전에 해결할 충돌

| ID | 충돌 | 현재 판정 | 필요한 조치 |
| --- | --- | --- | --- |
| `C-01` | `docs/overdrive-spec.md` §6.8의 public/global league·all-stat 비교와 Social v1의 public/global board 금지 | **해소:** Social v1 구현 예외와 후속 범위를 장기 스펙에 명시했다. | 후속 공개 경쟁은 새 contract version 필요 |
| `C-02` | 기존 정본은 `socialCore`가 Duel과 친구·크루 비교까지 열지만 이 셋은 workout sync에 의존 | **해소:** `socialCompetition` + account opt-in + selected dataset으로 분리했다. | sync/metric `TBD`가 남아 capability는 false |
| `C-03` | 정본은 deleting 시 Social session을 revoke하지만 AuthBinding의 deleting/deleted 단계 수명과 상태조회 scope를 고정하지 않음 | 완료 뒤 조회와 재등록 방지에 과소·과잉 보존 위험이 있다. | deleting 동안 status-only binding, 완료 뒤 유한 receipt/tombstone 중 하나를 승인 |
| `C-04` | 서버가 개인 향상을 재계산해야 하지만 서버가 받을 최소 운동 사실·보존 기간이 없음 | 현 상태로 Duel 결과 구현 불가 | 최소 sync payload, 동의, 보존, 충돌 정책 승인 |
| `C-05` | Crew의 차단 우선권과 owner/moderator의 관리 의무가 충돌할 수 있음 | 관리자 행위가 상대 노출을 우회할 수 있다. | 차단된 관리자/멤버 행위·알림·appeal 행렬 승인 |
| `C-06` | 수동 `venue_id`만 써도 희소 장소 반복 조회로 사람을 추론할 수 있음 | GPS 금지만으로 충분하지 않다. | sparse-cohort, rate, enumeration 방어 수치 승인 |
| `C-07` | 저장소는 현재 Phase 1이고 Social은 Phase 4인데 설계 문서가 구현 준비처럼 읽힐 수 있음 | 문서 개정은 phase 진입 승인이 아니다. | Phase 1 acceptance → Phase 2 backend/sync entry → Phase 4 Social entry, 또는 별도 roadmap amendment 전 해당 코드 packet 시작 금지 |

## 6. 확정 결정과 남은 gate

아래 결정은 `2026-07-16` 사용자 승인과 Social contract `1.1.0`에 맞춰 고정했다.
`TBD`가 붙은 운영·데이터·수치 gate는 별도이며 이 승인만으로 구현하지 않는다.

| ID | 결정 후보 | 이유 | 상태 |
| --- | --- | --- | --- |
| `D-01` | 개인 성취 상세는 `TRAIN/Growth`가 소유 | 기록 탐색과 자기 성장을 한 맥락에 둔다. | 승인 |
| `D-02` | `TODAY`는 개인 성취 요약만 소유 | 첫 화면이 거대한 대시보드가 되는 것을 막는다. | 승인 |
| `D-03` | 실제 사람 비교·Duel·Crew 비교는 `SOCIAL`이 소유 | 개인 원장과 관계 행위를 분리한다. | 승인 |
| `D-04` | 자동 성장하는 generated CP rival은 목표 IA에서 제거하고, 자기 과거 PR 기반 weekly target만 `TRAIN/Solo Challenge`에 둔다. | 가상 압박·winner/loser와 실제 소셜 신뢰를 섞지 않는다. | 승인; local metric은 별도 gate |
| `D-05` | `+LOG`·TODAY·TRAIN의 모든 기록 버튼은 같은 로컬 저장 명령을 호출 | 중복 저장 로직과 네트워크 결합을 막는다. | 승인 |
| `D-06` | `socialCompetition`을 다섯 번째 capability로 분리하고 `competitionEnabled`를 사용자별 default false로 둔다. | Duel만이 아니라 친구·크루 비교도 같은 sync/metric gate가 필요하다. | contract 1.1 승인 |
| `D-07` | 안전 권리 API는 기능 kill 중에도 유지 | 차단·신고·삭제·appeal·상태 조회를 플래그로 죽이지 않는다. | contract 1.1 승인 |
| `D-08` | 동기화가 확정되기 전 Social core는 관계 그래프만, 순위·승자는 없음 | 클라이언트 수치를 서버 사실처럼 취급하지 않는다. | 승인 |
| `D-09` | v1은 report receipt 조회·목록 API를 만들지 않고 `POST /reports` 생성 응답에서 opaque receipt를 제공한다. 동일 idempotency key 재생은 MIN 24시간 같은 receipt를 반환한다. | timeout 복구는 보장하면서 internal triage status와 별도 safety history surface를 만들지 않는다. | contract 1.1 승인 |
| `D-10` | reportable read의 `report_context_receipt`와 report 생성 뒤 `report_receipt`를 분리한다. 전자는 block 뒤 target 증명, 후자는 접수 확인이다. | block-first read 차단과 사후 신고를 동시에 만족시키고 receipt 권한 혼동을 막는다. | contract 1.1 승인; token 수치는 TBD |
| `D-11` | Profile core text와 Crew name은 candidate revision을 moderation하고 pending/rejected/hidden을 self 외 projection에서 막는다. | 정본의 user-authored-content fail-closed invariant를 실제 owner/queue로 연결한다. | contract 1.1 승인; 운영은 TBD |
| `D-12` | v1 notification은 SOCIAL 내부 generic pull inbox로 제한하고 OS push는 제외한다. | dedupe·block 취소·recipient discovery를 만족하면서 push token/permission 범위를 늘리지 않는다. | contract 1.1 승인; kind/retention은 TBD |
| `D-13` | 경쟁-enabled account는 active selected competitive dataset 정확히 1개를 사용한다. | multi-device heuristic merge로 중복·오판 승자를 만들지 않는다. | contract 1.1 승인; 다른 dataset은 competition transport dormant |
| `D-14` | `PolicyAcceptance`, `SafetyAction`, `Appeal`을 core 11개와 구분된 safety support entities로 둔다. | 삭제 status를 moderation에 오용하지 않고 권리·appeal을 kill과 분리한다. | contract 1.1 승인; 보존/SLO는 TBD |
| `D-15` | competition enable/select/active transport는 ordinary guard를 적용하고, false/clear/dataset revoke/correction은 rights-first로 둔다. | kill·stale policy·restriction·suspension이 사용자 opt-out/철회를 막지 않게 한다. | contract 1.1 승인; opt-out/revoke는 pending/active Duel을 winner 없이 취소 |
| `D-16` | Profile은 sole private, Discoverability는 all-off/clear command만 rights-first다. authored/enable/mixed payload는 ordinary 또는 전부 거부한다. | 보호 권리 route로 소개문·노출 확대를 우회하거나, 반대로 opt-out을 막는 양쪽 오류를 방지한다. | contract 1.1 승인; partial apply 금지 |

## 7. 시스템 경계

```text
┌──────────────────────────────── Client ────────────────────────────────┐
│ TODAY / TRAIN / +LOG: local-first                                      │
│ SOCIAL / ME social controls: authenticated network path                │
│ SQLite: workout source + local outbox + cached projections             │
└───────────────┬──────────────────────────────┬─────────────────────────┘
                │ local transaction            │ authenticated REST
                ▼                              ▼
       local derived achievements       vendor-neutral auth gateway
                                                │ verified claims only
                                                ▼
                                     strict TypeScript social service
                                     ├── identity/profile/graph
                                     ├── sync + metric [blocked/TBD]
                                     ├── safety rights plane
                                     └── transactional outbox
                                                │
                           ┌────────────────────┼────────────────────┐
                           ▼                    ▼                    ▼
                      PostgreSQL          media [TBD]        moderation [TBD]

Subscription/AI Worker (`actor_key`) ── completely separate ── Social identity
```

### 7.1 데이터 진실의 소유자

| 데이터 | 권위 |
| --- | --- |
| 로컬 운동·식사 원장 | 클라이언트 SQLite |
| 로컬 개인 성취·CP | 현재 로컬 계산 경로 |
| 인증 주체 | 구성된 auth gateway가 검증한 issuer/subject |
| SocialAccount·관계·권리 상태 | social service/PostgreSQL |
| Duel·crew comparison 결과 | 승인된 sync 이후 server metric engine |
| 구독·AI quota | 기존 subscription Worker의 `actor_key` 도메인 |
| 공개 capability | build support ∩ 검증된 server capability |

## 8. 사용자 기록에서 소셜 비교까지

```text
+LOG 또는 기존 기록 CTA
  → SQLite 한 트랜잭션으로 저장
  → 로컬 성취 재계산
  → TRAIN/Growth에 즉시 반영
  → [사용자 동의 + sync gate] 최소 사실을 outbox에 추가
  → 서버 중복제거/검증/metric snapshot
  → SOCIAL의 친구·크루·Duel 비교에만 사용
```

네트워크, auth, capability, moderation 장애는 첫 세 단계의 성공 여부를
바꾸지 않는다. 서버 반영 실패는 별도 sync 상태로 표시하고 로컬 기록을
롤백하지 않는다.

## 9. 단계적 출시 후보

| Wave | 열 수 있는 것 | 반드시 false인 것 | 입구 조건 |
| ---: | --- | --- | --- |
| `0` | 문서·계약만 | 모든 Social capability | 충돌과 TBD 승인 |
| `1` | 내부 scaffold, auth, account, safety rights | 공개 Social UI | clean DB·auth·삭제 rehearsal |
| `2` | 제한 cohort Friends + private Crew + generic pull inbox | Duel, Partner, Media, Chat, OS push | graph authz·block·report·delete·notification dedupe 통과 |
| `3` | Duel/비교 제한 cohort | Partner, Media, Chat | Social 1.1 schema readback, 사용자 opt-in, exact-one selected dataset, dormant/switch/rebaseline, sync·metric evidence |
| `4` | Profile media 제한 cohort | Partner, Chat | provenance·EXIF·moderation·삭제 통과 |
| `5` | Partner discovery 제한 cohort | Chat | 18+·sparse·venue abuse·ops gate 통과 |
| `6` | Text chat 제한 cohort | 없음(개별 kill 가능) | retention·moderation·report evidence 통과 |

Wave 숫자는 구현 순서를 식별하는 `EXACT` 레이블이지 일정이나 기간이 아니다.

## 10. 기능 플래그 계약

정본 `1.1.0`의 capability는 다음 다섯 개다.

```ts
interface SocialCapabilitiesV1_1 {
  socialCore: boolean;
  socialCompetition: boolean;
  partnerDiscovery: boolean;
  profileMedia: boolean;
  socialChat: boolean;
}
```

advertised `socialCompetition`은 Duel, 친구 비교, 크루 비교, competition용
active workout transport를 함께 닫는다. account-level effective 조건은
`advertisedSocialCompetition && competitionEnabled && exactlyOneSelectedDataset && currentPolicy && safetyWriteEligible && workoutSyncReady && metricVersionSupported`다.
사용자별 `competitionEnabled`는 default false다. setup claim/enable은 advertised
key를 사용하고, 차단·신고·Appeal·private/opt-out·media delete·competition
false/clear·dataset revoke/purge/correction·계정 삭제/상태 조회는 capability보다
앞선 safety rights plane으로 취급한다.

단, route 이름만으로 rights lane에 들어가지 않는다. Profile은 sole
`visibility=private`, Discoverability는 every flag false + scope off + area/venue
clear인 validated result만 protective다. authored/media/enable/new-selection/mixed
payload는 ordinary guard를 통과하거나 전체 거부하며 partial apply하지 않는다.

대안 비교:

| 대안 | 장점 | 실패모드 | 1.1 결정 |
| --- | --- | --- | --- |
| 정본의 4개 flag 유지 + route별 `metric dependency available` | 계약 변경이 작음 | client가 competition availability를 안정적으로 알기 어렵고 core와 비교 cohort를 독립 kill하기 어려움 | 기각 |
| `duels`만 추가 | Duel만 빠르게 닫음 | friend/crew comparison이 같은 sync gate 밖에 남음 | 기각 |
| `socialCompetition` + user opt-in | Duel·friend·crew comparison·sync를 한 실패 경계로 닫음 | 5번째 key와 contract-version-aware parsing 필요 | **채택** |

### 10.1 숫자 분류

| 숫자 | 분류 | 의미 |
| --- | --- | --- |
| 5 primary tabs | `EXACT` | `TODAY / TRAIN / +LOG / SOCIAL / ME` 순서 |
| 3 SOCIAL surfaces | `EXACT` | `친구 / 주변 / 크루` |
| 18+ | `MIN` | partner discovery self-attested minimum; 나이 인증 아님 |
| 7 days | `EXACT` | 정본의 Duel/metric window |
| consecutive 24-hour bucket | `EXACT` | 정본의 consistency bucket; 의미 결함은 별도 결정 |
| 10,000 basis points | `EXACT` | full consistency scale |
| idempotency record 24 hours | `MIN` | 정본의 complete status/body replay 하한; command response 자체를 최소화 |
| TODAY recent achievement 1개 | `MAX` | 이 설계의 과밀 방지 후보 |
| TRAIN Growth summary 3개 | `MAX` | 상세 route로 분리하는 과밀 방지 후보 |
| Social OS location prompt 0회 | `EXACT` | v1은 permission을 요청하지 않고 수동 selector만 사용 |
| Social OS notification prompt/push registration 0회 | `EXACT` | v1 notification은 authenticated in-app pull only |
| current capabilities 5개 | `EXACT` | 정본 `1.1.0` interface의 키 수 |
| selected competitive dataset 1개 | `EXACT` | competition-enabled account 기준 |

문서의 절 번호, packet ID, Wave 번호는 식별자이지 제품 수치가 아니다. 그 밖의
retention, rate, SLO, cohort, size, queue, metric target은 승인 전 `TBD`다.

## 11. 요구사항 추적

| # | 필수 범위 | 정본 | 상세 설계 |
| ---: | --- | --- | --- |
| 1 | `TODAY / TRAIN / +LOG / SOCIAL / ME` | Social §2.2 | Product §2–7 |
| 2 | SOCIAL `친구 / 주변 / 크루` | Social §2.3 | Product §6 |
| 3 | `social_user_id`와 `auth_subject` | Social §3.1 | Domain §3 |
| 4 | subscription `actor_key` 완전 분리 | Social §3.2 | Domain §2–3 |
| 5 | 11개 핵심 entity | Social §4.2 | Domain §5–6 |
| 6 | 실제 업로드 사진과 AI style 구분 | Social §4.3·5.1 | Product §8, Safety §6 |
| 7 | 외모 점수 금지, Interest→Match→Chat | Social §5.1·7.2 | Product §6·10 |
| 8 | partner discovery 18+ opt-in | Social §6.1 | Product §6, Safety §5 |
| 9 | 수동 `area_code`/`venue_id`만 | Social §6.2 | Product §6, Domain §9, Safety §4 |
| 10 | GPS/live route/home 미저장 | Social §6.2 | Safety §4 |
| 11 | 권한 거부 상태에서도 수동 selector | Social §6.2 | Product §6·11, Safety §4 |
| 12 | block/report/delete/private/opt-out 권리 | Social §7.3 | Product §7·10, Safety §3·8 |
| 13 | 꾸준함·개인 향상 중심 비교 | Social §5.2 | Product §4·6, Domain §8 |
| 14 | `verifiedRatio` 실제 사람 순위 제외 | Social §5.2 | Product §4·6, Domain §7–8 |
| 15 | REST/error/authz/idempotency | Social §8 | Domain §9–12 |
| 16 | 5개 정본 capability와 dependency | Social §9 | README §10, Domain §13, Safety §9 |
| 17 | 현재 1.0과 다음 기능 분리 | Social §2.1·14 | Safety §2·12 |
| 18 | backend/client/safety 파일 소유권 | Social §10 | Parallel §3–14 |
| 19 | analytics event와 제품 metric | Social §11 | Product §11, Safety §10, Parallel `ANALYTICS-26` |
| 20 | Function/Quality/Product-workflow 검증 | Social §12 | Product §11–12, Domain §16, Safety §14, Parallel packet gates |

## 12. 승인 단위

다음은 한 번에 묶어 승인하지 않는다.

1. **제품 IA 승인:** `TRAIN/Growth`, TODAY 요약, SOCIAL 비교의 경계.
2. **계약 1.1 완료 receipt:** `socialCompetition`, selected dataset, safety support,
   report receipts, pull notification의 정본 반영을 검증한다.
3. **남은 데이터 승인:** workout sync 최소 payload·보존·reclaim/switch/rebaseline.
4. **안전 운영 승인:** moderation staffing, escalation, 유한 retention.
5. **출시 수치 승인:** rate limit, sparse cohort, SLO, 제품 목표.
6. **구현 승인:** Wave별 코드 변경과 새 의존성 제안.
7. **출시 승인:** 배포, TestFlight, store metadata/review 조치.

아키텍처를 승인했다는 이유로 미검증 숫자나 공개 운영 약속까지 승인된 것으로
해석하지 않는다.

## 13. 남은 결정

| ID | 결정자 | 질문 | 막히는 범위 |
| --- | --- | --- | --- |
| `U-01` | Product + Data + Privacy | 서버가 개인 향상을 재계산할 최소 운동 사실은 무엇인가? | Duel, comparison |
| `U-03` | Identity + Privacy | 삭제 후 상태 조회 receipt의 수명·재인증 방식은? | account deletion |
| `U-04` | Safety + Legal/Ops | report/chat/media/backup/auth tombstone의 유한 보존은? | 모든 public social |
| `U-05` | Safety + Product | sparse cohort, venue query, rate limit의 승인 수치는? | Nearby |
| `U-06` | Safety + Crew | 차단된 owner/moderator와 멤버의 관리 행위는? | Crew |
| `U-07` | Release owner | 다음 marketing version과 store disclosure는? | external release |
| `U-08` | Product + Health/Safety | body-fat/weight 기반 `WarriorCard` completion을 유지·재설계·제거할 것인가? 결정 전 목표 IA에서 제외 | personal growth polish |
| `U-09` | Product + Safety + Backend | area/venue catalog source, version, deprecation, 운영 owner는? | manual Nearby setup |
| `U-10` | Product + Training Data | 운동별 PR, local consistency, edit/delete 재계산, weekly target, TODAY 성취 우선순위를 어떻게 versioning할 것인가? | `LOCAL-ACHIEVEMENT-CONTRACT-01C`, TRAIN/Growth |
| `U-11` | Contract + Product + Safety | Profile handle/display_name/bio normalization과 exact bounds는 무엇인가? | API contract, Identity/Profile |
| `U-12` | Mobile Performance + Local DB | 동일 fixture/device class의 logging latency baseline·반복·percentile·허용 `MAX` 회귀값은 무엇인가? | `LOCAL-SYNC-SEAM-11` |
| `U-13` | Analytics + Privacy + Contract | surface view의 observed-render/dedupe와 API-result의 per-response/retry 의미를 어떻게 고정할 것인가? | contract amendment, `ANALYTICS-26` |
| `U-14` | Safety + Privacy + API + Client | `report_context_receipt`의 발급 surface, bounds, expiry, reuse/rate, block→report client 보존 범위는? | reportable surfaces, block→report |
| `U-15` | Safety + Identity + Crew + Ops | Profile/Crew edit projection, text provider/queue/review/retention/overflow와 rejection-action 운영은? | `TEXT-MODERATION-18`, public core Social |
| `U-16` | Product + Safety + Backend + Client | in-app notification kind/state/dedupe/retention/badge/open destination 의미는? | `NOTIFICATION-27`, socialCore delivery |
| `U-17` | Safety + Identity + Product + Ops | release-owned policy registry config source/readback, SafetyAction target-effect/subject notice, Appeal bounds/reviewer/retention/SLO를 어떻게 운영하는가? | public authored writes, safety rights |

## 14. 비목표

- 현재 App Store 심사 중인 1.0 변경
- 공개·글로벌 leaderboard
- 실제 사람의 Combat Power 또는 `verifiedRatio` 순위
- 외모/체형/사진 반응 기반 점수
- exact GPS, live location, route, home inference
- 결제, 배포, TestFlight, store 제출
- 승인되지 않은 framework·dependency 선택
- 한 공급자·모델·CLI에 고정된 auth, AI, moderation 설계
