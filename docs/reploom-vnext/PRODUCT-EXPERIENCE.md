# Reploom vNext 제품 경험 설계

Status: **DESIGN CANDIDATE**

규범 입력: `docs/social-v1-contract.md`

표기:

- `[baseline]`: 기준 저장소에서 확인된 현재 기능
- `[proposal]`: 승인 전 설계 후보
- `[TBD]`: 결정 전 구현·출시 금지

## 1. 경험 원칙

1. 사용자는 소셜 기능이 없어도 운동을 기록하고 자기 성장을 볼 수 있어야
   한다.
2. 첫 화면은 "지금 할 일", TRAIN은 "내 성장", SOCIAL은 "사람과의 관계"를
   답한다.
3. `+LOG`는 중앙의 유일한 기록 의미를 갖되, 다른 화면의 기록 CTA도 같은
   저장 명령을 재사용한다.
4. 실제 사람을 비교할 때는 꾸준함과 각자의 개인 향상만 사용한다.
5. 외모, 체형, 절대 근력, Combat Power, `verifiedRatio`는 실제 사람의 순위
   또는 매칭 점수가 아니다.
6. 차단·신고·비공개·탐색 해제·삭제는 숨겨진 설정이 아니라 언제든 도달
   가능한 사용자 권리다.
7. 실패는 해당 섹션에 머문다. SOCIAL 장애가 TODAY/TRAIN/+LOG의 로컬
   성공 상태를 바꾸지 않는다.

## 2. 전역 내비게이션

### 2.1 주 탭

| 순서 | 탭 | 한 문장 역할 | 주 행동 |
| ---: | --- | --- | --- |
| 1 | `TODAY` | 오늘의 다음 운동 결정을 돕는다. | 시작, 이어하기, 오늘 기록 |
| 2 | `TRAIN` | 훈련을 찾고 내 성장을 검토한다. | 계획, 탐색, 성장 상세 |
| 3 | `+LOG` | 운동과 식사를 기록한다. | 근력, 유산소, 식사 저장 |
| 4 | `SOCIAL` | 동의한 사람과 연결하고 비교한다. | 친구, 주변, 크루 |
| 5 | `ME` | 나의 신원·권리·앱 환경을 관리한다. | 프로필, 공개범위, 안전, 설정 |

### 2.2 표시 규칙

- 현재 1.0/review track은 기존 내비게이션을 유지한다.
- 다음 social-capable build에서만 새 5탭을 포함한다.
- `socialCore=false`이면 정본대로 SOCIAL 탭을 숨긴다. "사용 불가" dead tab은
  허용하지 않는다.
- capability refresh 때문에 탭이 사라질 때 현재 사용자가 SOCIAL에 있으면
  `TODAY`로 안전하게 이동시키고, 로컬 기록 상태는 보존한다.
- `+LOG`는 visible tab 수에 따라 flex 재배치하지 않고 navigation rail의 물리적
  중앙에 고정한다. 접근 불가능한 placeholder tab 대신 좌·우 destination
  slot과 center action을 분리한다.
- capability refresh 중 profile publish/crew invite/Interest 같은 feature-gated
  입력은 새 쓰기를 중단하고 명시적 취소 또는 안전한 local draft 보존 상태를
  보여 준다. report/block/delete/private/opt-out 같은 rights action은 중단하지
  않는다. 서버 success receipt 없이 자동 재시도하거나 성공으로 표시하지 않는다.

## 3. TODAY — 지금 무엇을 할까

### 3.1 책임

TODAY는 사용자가 앱을 열고 첫 행동을 고르는 cockpit이다. 성취 전체를
탐색하거나 실제 사람과 비교하는 화면이 아니다.

### 3.2 섹션 순서

| ID | 섹션 | 내용 | CTA | 데이터 |
| --- | --- | --- | --- | --- |
| `TD-01` | 진행 중 운동 | 활성 세션, 경과 상태, 마지막 기록 | `이어하기` | 로컬 SQLite |
| `TD-02` | 다음 행동 | 프로그램의 다음 세션 또는 빠른 시작 | `운동 시작` | 로컬 프로그램 |
| `TD-03` | 오늘 목표 | 오늘 목표와 완료 상태 | `기록하기` | 로컬 목표/기록 |
| `TD-04` | 이번 주 | 세션 수·계획 대비 꾸준함 요약 | `성장 보기` | 로컬 파생값 |
| `TD-05` | 최근 성취 | 최근 PR/연속성/개인 CP 변화 중 최대 1개 | `TRAIN에서 보기` | 로컬 파생값 |

`TD-05`의 "최대 1개"는 정보 구조상 상한인 `MAX`다. 어떤 성취를 우선할지
정렬 규칙은 `[TBD]`이며 외모·체형·타인 데이터는 후보가 될 수 없다.

### 3.3 현재 TODAY 해체 지도

새 섹션을 현재 scroll 아래에 덧붙이지 않는다.

| 현재 component/행동 | 목표 위치 | 조치 |
| --- | --- | --- |
| `CoachCard` | TODAY `TD-01/02` | 유지; read-only 요약 + start/resume |
| `ActiveWorkoutCard` | TODAY 상세 | 유지; 진행 중일 때만 펼침 |
| `todayActionOrder` logging surfaces | +LOG 명령을 쓰는 TODAY CTA | 저장 로직은 유지, surface 중복 축소 |
| CP hero `/power` | TODAY 요약 → TRAIN/Growth 상세 | TODAY에는 compact summary만 |
| `WarriorCard` | 목표 IA에서 제외 | body-fat/weight 기반 completion metric을 건강·반수치심 관점에서 재검토 전 노출 금지 |
| generated `ArenaCard` rival | 목표 IA에서 제거 | 실제 사람/가상 압박 혼동 제거 |
| weekly PR boss | TRAIN/Growth `Solo Challenge` | 자기 과거 PR target으로만 재구성 후보 |
| floating `MicDock` | 전역/`+LOG` 기록 CTA | 동일 local save path 유지 |

### 3.4 상태

- `ready`: 각 섹션은 독립 렌더링한다.
- `no-active-session`: 진행 중 카드 대신 다음 행동을 첫 카드로 올린다.
- `no-program`: "자유 운동"과 "프로그램 만들기"를 함께 제공한다.
- `no-history`: 성취 카드 대신 첫 기록의 의미를 설명한다.
- `section-error`: 해당 카드만 재시도한다. `+LOG`는 계속 접근 가능하다.
- `offline`: 상태 변화 없이 로컬 데이터로 동작한다.

### 3.5 수용 기준

- TODAY에서 시작한 기록과 +LOG에서 시작한 기록이 같은 로컬 repository
  명령을 호출한다.
- Social bootstrap 실패가 TODAY skeleton 또는 error를 만들지 않는다.
- `TRAIN에서 보기`는 해당 성취 상세에 deep link하고 단순 TRAIN 루트로
  사용자를 버리지 않는다.
- 개인 CP는 "내 지표"로만 표시하며 타인 비교 CTA를 붙이지 않는다.

## 4. TRAIN — 나는 어떻게 성장했나

### 4.1 하위 구조

TRAIN은 한 개의 거대한 스크롤 대신 세 개의 내부 구역을 갖는다.

| 구역 | 질문 | 포함 기능 |
| --- | --- | --- |
| `Plan` | 다음에 무엇을 훈련할까? | 현재 프로그램, 오늘 계획, 다음 세션, 프로그램 편집 |
| `Explore` | 어떤 운동을 할까? | 검색, 부위 탐색, 운동 상세, 기록 시작 |
| `Growth` | 나는 어떻게 변했나? | 주간 요약, PR, 꾸준함, 개인 CP, History, Solo Challenge |

TRAIN 탭의 안정적인 기본 진입은 `Growth`다. TODAY는 one-tap 시작/이어하기를
소유한다. TRAIN/Plan은 프로그램 탐색·편집·상세를 소유하고, session preview의
시작은 같은 start command로 handoff한다. 프로그램 편집의 canonical entry는
TRAIN 하나이며 ME에는 중복 entry를 두지 않는다. 내부 구역의 정확한
컨트롤 형태(segmented control, top tab 등)는 기존 skin primitive로 구현
가능한지 확인 후 정한다. 새 시각 토큰은 만들지 않는다.

### 4.2 Plan

| 화면 | 핵심 정보 | 주 행동 | 비고 |
| --- | --- | --- | --- |
| Plan home | 현재 프로그램, 주간 배치, 다음 세션 | 시작/편집 | `[baseline]` `/plan`, `/program` 재사용 후보 |
| Program editor | 훈련일과 운동 구성 | 저장 | Social과 무관한 로컬 기능 |
| Session preview | 예정 운동 목록 | 시작 | 계획 변경과 실행을 구분 |

상태:

- 프로그램 없음 → "자유 운동"과 "프로그램 만들기".
- 오늘 계획 없음 → 회복/자유 운동을 실패 상태처럼 표현하지 않는다.
- 프로그램 데이터 오류 → Explore와 Growth는 계속 사용 가능하다.

### 4.3 Explore

| 화면 | 핵심 정보 | 주 행동 | 비고 |
| --- | --- | --- | --- |
| Explore home | 검색, body-region map, 최근 운동 | 운동 선택 | `[baseline]` exercises route 재사용 후보 |
| Exercise detail | 설명, 내 최근 기록, 기록 타입 | 세트 기록 | 오리지널 IP 그래픽만 사용 |
| Exercise picker | strength/cardio 선택 | +LOG 흐름 진입 | 동일 저장 명령 재사용 |

그래픽 hero는 현재 skin token과 오리지널 자산만 사용한다. 제3자 캐릭터,
프랜차이즈 이름·실루엣·스타일을 차용하지 않는다.

### 4.4 Growth

| ID | 카드/화면 | 정의 | 실제 사람 비교 허용 |
| --- | --- | --- | --- |
| `GR-01` | 이번 주 | 로컬 세션·목표 진행 요약 | 아니오 |
| `GR-02` | 개인 기록(PR) | 같은 사용자의 과거 best 대비 향상 | 아니오 |
| `GR-03` | 꾸준함 | 자신의 계획 단위 대비 완료 단위 | SOCIAL에는 승인된 projection만 |
| `GR-04` | Combat Power | 기존 로컬 for-fun 개인 지표 | 아니오 |
| `GR-05` | 전체 기록 | 세션 timeline과 상세 | 아니오 |
| `GR-06` | Solo Challenge | 자기 과거 PR 기반 주간 target | 아니오 |

`[baseline]` 주간 요약/timeline은 `src/app/(tabs)/history.tsx`와
`src/features/history/**`, Combat Power 화면은 `src/app/power.tsx`에 존재한다.
PR 전용 화면, 꾸준함 전용 화면, 이 IA는 아직 구현되지 않았다.

#### 개인 기록(PR)

- 비교 대상은 오직 같은 사용자의 과거 기록이다.
- 운동별 metric 정의가 없는 경우 PR을 추정하지 않고 "기준 준비 중"으로
  표시한다.
- `is_pr` 배지는 원천 기록과 metric version을 추적할 수 있어야 한다.
- 타인의 절대 중량이나 몸 수치와 나란히 표시하지 않는다.

#### 꾸준함

- `완료 단위 / 계획 단위`를 함께 표시한다.
- 계획이 0이면 `not_ranked`이고 실패·0점으로 표현하지 않는다.
- 추가 운동을 벌점으로 만들지 않되 계획 외 운동으로 비율을 부풀리지 않는다.
- 계획을 뒤늦게 줄여 결과를 조작하는 문제는 Social competition에서 server
  freeze를 요구한다. 로컬 자기 보기와 Social metric은 권위가 다르다.

#### Combat Power

- `Combat Power`와 `verifiedRatio`는 본인의 재미·설명용 로컬 지표다.
- SOCIAL의 친구, Duel, Crew 순위 입력으로 전달하지 않는다.
- Health corroboration은 실존 인물 인증, 부정행위 판정, 신뢰 점수가 아니다.

#### Warrior completion

`[baseline]` `src/features/warrior/completion.ts`는 strength/discipline과 함께
body-fat·목표체중으로 `physique` 및 전체 completion %를 만든다. 목표 IA에서는
이 카드를 TODAY와 ME Social identity에서 모두 제외한다. 개인 건강·향상 중심
metric과 copy를 별도 승인하기 전 TRAIN에도 옮기지 않는다.

#### Solo Challenge

- 목표 IA에서는 매일 자동 성장하는 generated CP rival과 winner/loser 표현을
  제거한다. 기준 구현은 `src/features/arena/rival.ts`, `useArena.ts`,
  `ArenaCard.tsx`와 TODAY의 `ArenaCard` mount다.
- 유지할 수 있는 요소는 같은 사용자의 과거 PR에서 고른 weekly target뿐이다.
- 실제 사용자 profile, 실제 Social competition, absolute CP 상대와 같은
  component/model을 사용하지 않는다.
- target을 달성하지 못해도 패배·꼴찌·열등한 몸으로 표현하지 않는다.

현재 weekly target은 `weeklyBoss.ts`가 제거 대상 `rival.ts::hash01`을 import하고,
조회·달성 상태가 `useArena.ts`에 결합돼 있다. 구현 순서는 neutral deterministic
helper 추출 → `weeklyTarget` picker/hook/repository 분리 → tests 이관 → generated
rival mount/state 제거다. 분리 전에 `rival.ts/useArena.ts/ArenaCard.tsx`를 먼저
삭제하지 않는다.

#### Growth home과 상세

- Growth home은 최대 3개(`MAX`) summary만 보여 주고 PR, 꾸준함, CP, History,
  Solo Challenge는 각각 상세 route를 갖는다.
- 각 상세는 `loading / empty / ready / recomputing / error`를 독립 처리한다.
- 기록 수정·삭제 중에는 stale PR을 확정적으로 표시하지 않고 `recomputing`을
  보여 준다.

### 4.5 Growth 수용 기준

- History가 사라지지 않고 TRAIN/Growth에서 도달 가능하다.
- TODAY 성취 deep link는 정확한 Growth 상세를 연다.
- `verifiedRatio`, 체중, 체지방, 절대 중량이 실제 사람 comparison DTO에 없다.
- 계획 0 상태는 수치심을 유발하는 0점, 실패, 꼴찌로 표시하지 않는다.
- 기록 삭제·수정 후 로컬 성취 projection이 재계산된다.

## 5. +LOG — 하나의 기록 의미

### 5.1 진입 선택

| 선택 | 흐름 | 저장 권위 |
| --- | --- | --- |
| 빠른 근력 | 최근/추천 운동 → 세트 | 로컬 SQLite |
| 운동 찾아 기록 | 검색/부위 → 운동 → 세트 | 로컬 SQLite |
| 유산소 | 종목 → 시간/거리 등 지원 필드 | 로컬 SQLite |
| 식사 | 식사 타입 → 항목/메모 등 지원 필드 | 로컬 SQLite |

### 5.2 저장 규칙

1. 사용자가 저장을 누른다.
2. 로컬 domain/repository가 하나의 durable transaction을 완료한다.
3. 로컬 성공 UI와 JUICE는 그 결과에만 의존한다.
4. 파생 성취와 sync dirty reference는 로컬 성공 후 처리한다.
5. snapshot 생성, hash, auth, 네트워크는 기록 transaction 밖에서 수행한다.
6. Social sync 실패는 "기록 실패"가 아니라 별도 "동기화 대기"다.

### 5.3 실패·복구

- 이중 탭/재시도 → 세션·세트의 로컬 식별자로 중복 방지.
- 앱 종료 → 마지막 durable state로 복구.
- 네트워크 없음 → 기록 성공; sync는 대기.
- Social account 없음/삭제 중 → 로컬 기록 성공; 새 remote sync 없음.
- 서버 payload 거부 → 로컬 기록 보존; 사용자를 막지 않는 sync diagnostic.

### 5.4 수용 기준

- TODAY, TRAIN, +LOG의 기록 진입점이 저장 로직을 복제하지 않는다.
- 기록 transaction에서 HTTP/auth/capability bootstrap을 호출하지 않는다.
- 서버 401/403/5xx, flag kill, timeout 중에도 로컬 기록을 저장할 수 있다.

## 6. SOCIAL — 사람과 무엇을 할까

SOCIAL의 첫 수준은 정확히 `친구 / 주변 / 크루`다. 이 세 surface 밖에
`랭킹`, `피드`, `사진 평가` 탭을 v1에 추가하지 않는다.

### 6.1 Social shell

공통 상단:

- 계정/profile completion 상태
- 현재 surface selector
- generic in-app notification 진입점; modal/deep-link inbox일 뿐
  `친구/주변/크루`와 나란한 네 번째 surface가 아니다. v1은 pull-only이며 OS
  push/remote notification은 별도 계약 전 제외한다.
- 안전 메뉴: 차단/신고 도움말 및 ME 권리 화면 연결

공통 상태:

| 상태 | 표시 | 허용 행동 |
| --- | --- | --- |
| `socialCore` off | SOCIAL 탭 없음; in-flight route는 안전 redirect | ME의 권리/상태 확인 |
| `partnerDiscovery` off | SOCIAL·친구·크루는 유지; 주변은 eligibility/settings와 비활성 이유만 표시하고 후보는 0건 | ME에서 opt-in 조건 확인, 친구·크루 사용 |
| account absent | Social 계정 설명과 명시적 생성 | 계정 생성, 취소 |
| profile incomplete | private profile 완성 안내 | 프로필 편집 |
| loading | 기존 안전한 projection 유지 + section progress | 로컬 탭 이동 |
| empty | surface별 첫 행동 | 해당 opt-in/초대 |
| offline | 캐시임을 표시하고 위험한 쓰기 비활성 | 로컬 탭 이동, 재시도 |
| generic error | 대상 상태를 누설하지 않는 오류 | 재시도 |
| deleting | 공개 projection 없음 | 삭제 상태, 지원 |

캐시는 block/private/opt-out/deleting 상태보다 우선할 수 없다. 서버가 안전한
projection을 주지 못하면 stale 사람 카드를 숨긴다.

Notification inbox는 `notificationId/kind/createdAt/read-state`와 generic copy만
표시한다. handle, profile text, message, 위치, 원 수치, unilateral Interest는 넣지
않는다. item을 열 때 server가 현재 block/private/membership/capability를 다시
검사하고 안전한 destination만 반환한다. 이미 client에 보인 item은 회수했다고
주장하지 않지만 stale deep link는 generic unavailable로 닫는다.

offline에서 block/report/delete의 서버 효과를 완료했다고 표시하지 않는다.
현재 후보는 해당 쓰기를 비활성화하고 재연결 경로를 제공한다. local-only hide나
durable safety queue를 추가하려면 별도 계약이 필요하다.

### 6.2 친구

#### Friends home

```text
친구
├── 받은 초대
├── 보낸 초대
├── 친구 목록
└── 진행 중 Duel [socialCompetition only]
```

핵심 행동:

- 정확한 handle 검색 또는 안전한 invite token 교환
- 초대 수락/거절/취소
- 친구 해제
- 비교 보기 `[socialCompetition]`
- Duel 제안 `[socialCompetition]`
- 차단/신고

원칙:

- fuzzy/global people browse는 없다.
- 차단·비공개·미가입·검색 opt-out은 외부 사용자에게 같은 일반화된 결과다.
- 친구 관계는 Match가 아니고, Match도 자동 친구가 아니다.
- 친구 해제/차단 후 과거 comparison과 Duel projection은 숨긴다.

#### Friend comparison

표시 가능:

- 양쪽의 계획 단위와 완료 단위
- 각자의 개인 향상 횟수
- metric version과 window
- tie 포함 server result

표시 금지:

- 몸무게, 체지방, 신체 사이즈
- 절대 lifting weight/volume 순위
- Combat Power, `verifiedRatio`
- "더 좋은 몸", "진짜 운동인", 외모·성별 추정

#### Duel

1. competition opt-in 전에 선택된 경쟁 기기/dataset 하나만 기록에 포함되고 다른
   설치의 운동은 제외됨을 설명한다.
2. 친구 상세에서 제안한다.
3. 상대가 명시적으로 수락한다.
4. 서버가 양쪽 selected dataset/generation, window, metric 입력을 freeze한다.
5. 양쪽 sync readiness가 충족될 때만 active가 된다.
6. pending/active 동안 selected dataset switch를 비활성화한다. opt-out 또는
   selected claim revoke는 항상 가능하며 transport를 멈추고 winner 없이 Duel을
   취소한다.
7. 완료 시 원 수치와 tie 가능한 결과를 함께 보여 준다.
8. block·account deletion·metric invalidation은 winner 없이 안전 종료한다.

`socialCompetition`은 정본 1.1에 있지만 sync/timezone/grace/correction semantics가
승인되고 양쪽 rebaseline readiness가 확인되기 전 Duel CTA는 노출하지 않는다.

#### Competition 표시 상태

친구·Crew·Duel은 공통으로 `disabled / consent-required / sync-not-ready /
active / completed-tie / completed-result / cancelled` projection을 구분한다.
`not_ranked`는 꼴찌가 아니다. correction 또는 sync evasion을 위한
`no-contest/voided`는 계약 개정 전 UI에 발명하지 않고 rollout을 막는다.
ordinal leaderboard, 누적 승패 낙인, 공개 패배 history는 v1에 없다.

### 6.3 주변

주변은 현재 위치가 아니라 사용자가 직접 고른 `area_code` 또는 `venue_id`
기반의 18+ partner discovery다.

#### 진입 게이트 순서

1. `partnerDiscovery` effective 확인
2. current 18+ self-attestation 확인
3. 명시적, 철회 가능한 partner opt-in 확인
4. 수동 scope 선택 확인
5. sparse cohort 및 abuse gate 확인
6. block/moderation/private projection 적용

Social v1은 OS 위치 권한을 요청하지 않는다. 신규 Nearby 흐름의 permission
prompt 수는 정확히 0회(`EXACT`)다. 다른 기능/과거 build 때문에 OS 상태가
denied, restricted, unavailable, skipped여도 동일한 수동 area/venue selector를
제공한다. 어떤 상태에서도 정확한 GPS를 저장하거나 discovery query에 보내지
않는다.

#### 화면

| 화면 | 내용 | 주 행동 |
| --- | --- | --- |
| Eligibility | 18+의 한계, opt-in, 안전 설명 | 동의/나가기 |
| Manual scope | 승인 catalog의 area/venue | 선택/해제 |
| Candidate list | text/context 우선 최소 profile projection; photo는 선택적 보조 | 명시적 `관심` 또는 목록 이동 |
| Match receipt | 상호 관심 성립 | Match 보기 |
| Match detail | profile, unmatch/block/report | chat `[socialChat]` |

#### Interest → Match → Chat

- 한쪽 Interest는 상대에게 알림·카운트·거절 신호를 만들지 않는다.
- reciprocal active Interests를 같은 server transaction이 관찰할 때만 Match를
  하나 생성한다.
- Match가 생겨도 chat capability가 꺼져 있으면 chat CTA를 보여 주지 않는다.
- partner opt-out은 discovery와 unmatched Interest를 즉시 제거하고 새 chat
  read/write를 막는다. 기존 Match receipt/detail은 정본대로 read-only로 남아
  명시적 unmatch 또는 block 경로를 제공한다.
- Hot-or-Not, 외모 숫자, 공개 like count, photo engagement ranking은 없다.

#### Candidate ordering

허용 후보:

- 서버가 보장하는 동일 수동 scope
- 안전·moderation eligibility
- 반복 노출 완화용 비민감 순환

금지 입력:

- 사진 tap/dwell/like, 얼굴·체형 분석
- 거리, 좌표, live presence
- 수익·구독 등급, 절대 운동 수치
- raw profile text similarity를 이용한 민감 속성 추론

정확한 비민감 ordering과 sparse minimum은 `[TBD]`다.

Candidate UI는 한 장씩 넘기는 photo-first deck이나 left/right swipe를 사용하지
않는다. 사진은 hero가 아니며 이름/설명과 승인된 비외모 context 뒤의 보조
요소다. `관심`은 card 전체 swipe가 아니라 label이 있는 명시적 secondary
action이다. `건너뛰기`를 거절 score나 target signal로 저장하지 않는다.

### 6.4 크루

#### Crew home

```text
크루
├── 내 크루 목록
├── 받은 초대
└── 크루 만들기
```

Crew detail:

```text
요약
├── 이름 / 상태
├── 내 역할
├── 멤버 [block-filtered]
├── 꾸준함·개인 향상 비교 [socialCompetition]
└── 초대 / 역할 / 나가기 / 보관
```

원칙:

- v1 Crew는 private, invite-only다.
- create/name edit은 candidate revision을 제출하고 owner에게만 `pending` preview를
  보인다. 승인된 이름 전에는 초대·멤버 projection을 열지 않는다.
- name reject는 일반화된 사유와 edit/delete/appeal을 제공한다. 이미 승인된
  이름의 edit 재심사 중에는 승인된 이전 projection 정책만 사용하고 candidate
  text는 owner 밖에 보이지 않는다.
- public directory, arbitrary join, global crew rank는 없다.
- owner 1명 invariant를 지킨다.
- 계정 삭제를 owner transfer가 막지 않는다. 미해결 owner crew는 계약대로
  archive한다.
- crew moderator는 report moderation 권한을 얻지 않는다.
- 차단만으로 같은 Crew의 membership/owner/moderator role을 축출하지 않는 것은
  확정이다. 두 사용자의 projection/notification/interaction은 숨긴다. 역할상
  필요한 remove/transfer/archive 행위의 대행·최소 노출 행렬만 `[TBD]`이며,
  승인 전 public Crew rollout을 막는다.

## 7. ME — 나는 누구이고 무엇을 허용했나

### 7.1 route 구조

| 구역 | 항목 | 데이터 권위 |
| --- | --- | --- |
| ME home | 각 구역 상태와 진입점만 | mixed projection |
| Social identity | 내 Social 프로필, self·친구·최소 discovery 미리보기, media provenance | social service |
| Privacy & Safety | 공개범위, 탐색, 차단, 신고 도움/제출, Social 삭제/status | safety plane |
| Subscription | entitlement, quota, manage subscription | subscription Worker/native |
| Data connections | Health·remote AI·sync consent/status | local/native + scoped service |
| App | skin, theme, JUICE, sound, weight step | local/native |
| Legal/support | privacy, terms, support, data rights | release sources |

현재 Settings의 bodyweight/protein 같은 로컬 값은 public Social profile이 아니라
`Training inputs` 또는 `Body & nutrition`으로 명명한다. 프로그램 entry는 ME에서
제거하고 TRAIN/Plan으로 옮긴다. ME home은 상세 form을 모두 펼치지 않는다.

### 7.2 프로필

- 기본은 `private`다.
- edit와 self/friend/minimal-discovery preview를 분리한다. global public profile
  preview나 arbitrary profile browse는 없다.
- handle/display name/bio edit는 candidate moderation state를 표시한다. pending,
  rejected, hidden text는 self 외 preview에 나타나지 않고 rejected owner에게는
  일반화된 SafetyAction notice와 edit/delete/appeal만 제공한다. Appeal은 opaque
  `actionReceipt`를 사용하고 internal action ID나 provider 결과를 노출하지 않는다.
- discovery card는 전체 profile이 아니라 최소 projection이다.
- `user_photo`는 `업로드 사진`, `ai_stylized`는 `AI 스타일`로 모든 rendition에
  표시한다.
- 업로드 사진도 본인·나이·최근성·무편집을 인증하지 않는다.

### 7.3 권리 화면

사용자는 다음 행동에 설정 검색 없이 도달할 수 있어야 한다.

- profile visibility를 private로 변경
- friend/crew/partner discoverability 각각 해제
- manual area/venue clear
- block 생성/목록/해제
- current policy version 상태와 새 gated write 전 재동의
- generalized active SafetyAction notice, opaque action receipt, appeal 제출/상태
- report 제출; 생성 성공 응답의 opaque receipt/support ID를 표시한다. timeout 뒤
  동일 idempotency key 재생은 같은 receipt를 다시 표시할 수 있지만 별도
  history/조회 route나 internal 처리 status는 제공하지 않음
- media 삭제
- competition false/selected clear, dataset revoke/purge, workout correction 철회
- Social account 삭제 요청과 상태 조회

권리 CTA는 일반 edit form의 현재 draft를 함께 보내지 않는다. `비공개`는 sole
`visibility=private`, `탐색 모두 끄기`는 every flag false + scope off + area/venue
clear인 전용 command를 만든다. bio/name/media 변경이나 다른 opt-in/selection이
섞이면 보호 전이로 표시하지 않고 ordinary save로 재검증하거나 전체 요청을
거부한다.

정상 owner의 `GET /me`는 account/profile/settings를 함께 주지만, capability kill
또는 suspension의 `rights_only` mode는 policy currentness, generalized action
notice, 위 보호 경로의 상태/link만 준다. client는 mode를 typed union으로 분기하고
ordinary profile projection을 rights-only 응답에서 복원하지 않는다.

Social account 삭제, 로컬 데이터 삭제, subscription ledger 삭제, Apple 구독
취소는 서로 다른 작업임을 나란히 설명한다. 하나를 누르면 다른 것이 자동으로
처리된다고 말하지 않는다.

### 7.4 상태

- Social account 없음 → 로컬 앱·구독 설정은 정상 표시.
- Social network 오류 → 로컬 앱 설정은 정상 표시.
- deleting → 모든 타인용 profile projection과 opt-in을 숨기고 deletion status를
  최상단 표시.
- capability kill/suspension → `rights_only` ME와 block/report/appeal/private/
  opt-out/media-delete/competition-disable/dataset-revoke/delete/status를 유지.
- recent auth 필요 → 이유를 설명하고 configured auth flow로 보낸다.

## 8. 미디어 경험

### 8.1 provenance

| kind | 표시 | 사용자에게 의미하는 것 |
| --- | --- | --- |
| `user_photo` | `업로드 사진` | 사용자가 photo로 선언해 올림; 본인 인증 아님 |
| `ai_stylized` | `AI 스타일` | 제품이 생성/변환한 이미지; 모든 파생본에 표시 |

### 8.2 상태

- `uploading`: self-only preview, 취소 가능
- `pending`: self-only, moderation 대기
- `approved`: visibility와 surface opt-in에 따른 projection
- `rejected`: generalized SafetyAction notice와 opaque `actionReceipt`, Appeal
  CTA/status, 수정/삭제 경로. provider/internal reason/evidence는 비노출
- `hidden`: 다른 사용자에게 즉시 비노출
- `deleting`: 모든 rendition/cache 제거 진행 상태

### 8.3 UX 금지

- media kind badge를 crop 또는 accessibility label에서 누락
- AI 이미지를 실제 사진처럼 표시
- 실제 사진을 본인 인증 배지로 사용
- photo likes, attractiveness, engagement score 표시
- moderation provider/AI vendor를 제품의 유일한 고정 정체성으로 표현

## 9. 공통 오류와 로딩 언어

| 서버 코드군 | 사용자 표현 | 노출하지 않는 것 |
| --- | --- | --- |
| 401 | 다시 인증 필요 | issuer, subject, token 내용 |
| self-scoped 403 | 필요한 내 설정/동의를 설명 | 대상의 차단·자격 상태 |
| generic 404 | `이 항목을 사용할 수 없습니다` | block/private/opt-out/underage 구분 |
| 409 | 최신 상태 갱신 후 선택 재요청 | 내부 row/version |
| 429 | 재시도 가능 시점 안내 | abuse model |
| 503 | Social 일시 불가; 로컬 기록 정상 | backend topology |

오류 copy는 사용자를 비난하지 않는다. 운동을 건너뜀, 계획 없음, 0 planned
unit, opt-out은 실패나 수치심으로 표현하지 않는다.

## 10. 핵심 사용자 여정

### `F-01` 기록 → 개인 성취

`+LOG 저장 → local success → TRAIN/Growth 갱신 → TODAY 요약 후보`

성공 기준: offline에서도 끝까지 가능하고 Social 상태가 개입하지 않는다.

### `F-02` Social 계정과 private profile

`SOCIAL 또는 ME → 인증 → 명시적 account 생성 → private candidate profile 제출
→ self pending preview → approved → friend/minimal-discovery preview → 첫 관계 행동`

성공 기준: GET이 account를 자동 생성하지 않고, 기본 profile은 private이며,
edit 화면과 self/friend/discovery preview가 구분된다. rejected는 generic reason과
edit/delete/appeal로 복구하고, edit 재심사 중 이전 approved projection 처리도
승인 계약과 일치한다. approved handle 전 exact-handle 검색/초대는 열지 않는다.

### `F-03` 친구 연결

`SOCIAL/친구 → exact handle 또는 token → 초대 → 상대 수락 → 친구 목록`

성공 기준: target 상태 누설 없음, retry 중 초대 1개, block가 우선.

### `F-04` 친구 Duel

`경쟁 설명 → selected device/dataset 하나 선택 → 다른 기기 제외 확인 → 동의·
rebaseline readiness → 친구 상세 → Duel 제안 → 상대 수락 → dataset/generation
server freeze → 7일 → 결과/tie`

성공 기준: 양쪽 competition opt-in과 sync readiness 없으면 시작하지 않는다.
`tie / not_ranked / cancelled / no-contest·correction [계약 개정 필요]`를 패배로
바꾸지 않는다. pending/active 중 selected dataset switch는 거부하고, 그 밖의
switch는 competition을 false/readiness 재설정한 뒤 full rebaseline한다.
opt-out/selected revoke는 kill·stale policy·restriction·suspension 중에도
가능하고 pending/active Duel을 winner 없이 취소한다. sync-invalid에서는 복구
또는 안전 종료 경로를 보여 준다.

### `F-05` 크루

`크루 candidate 생성 → owner-only pending preview → 승인 또는 reject 후
edit/delete/appeal → 승인된 이름으로 초대 → 가입 → 멤버 projection → 이름 edit
재심사 → 역할/나가기`

성공 기준: private·invite-only, owner invariant, block-filtered이며 pending/rejected/
hidden Crew name이 초대 대상·멤버에게 0건 노출된다.

### `F-06` 주변 파트너

`18+ 설명 → opt-in → 수동 scope → 후보 → private Interest → reciprocal Match`

성공 기준: OS 위치 permission prompt 0회, unilateral Interest 비노출,
opt-out 뒤 기존 Match는 read-only로 남고 unmatch/block 가능.

### `F-07` 안전 조치

`인증된 사람/콘텐츠 projection과 함께 report_context_receipt 수신 → 차단 →
필요 시 그 context receipt로 신고 → 별도 report_receipt 확인 → ME에서 권리 확인`

성공 기준: 두 receipt가 UI/API에서 구분되고, block 후에도 신고 가능하며 대상은
신고자·내부 처리 상태를 알 수 없다. receipt history/list 화면은 없다.

### `F-07A` SafetyAction과 Appeal

`current policy 확인 → 새 write에서 outdated이면 재동의 → moderation reject/hidden
또는 restriction → generalized SafetyAction notice + actionReceipt → Appeal 제출 →
own generalized status → upheld/modified/reversed 결과`

성공 기준: policy 미동의·suspend·capability kill 중에도 block/report/delete/appeal/
private·opt-out/deletion-status 권리는 유지된다. 다른 subject action, operator,
reporter, evidence, raw content는 보이지 않으며 reversal이 관계·콘텐츠를 자동
복원하지 않는다.

### `F-08` Social 계정 삭제

`ME → 삭제 범위 설명 → recent auth → 요청 → 즉시 suppression → 상태 조회`

성공 기준: 로컬 기록/구독에 자동 cascade하지 않고 retry-safe다.

### `F-09` Profile media

`ME → kind 설명 → upload → self-only pending → approved 또는 rejected →
generalized action notice/actionReceipt → Appeal 또는 replace/delete →
rendition/cache 상태`

성공 기준: 모든 상태·파생본에서 provenance가 남고, flag off여도 기존 media
삭제·Appeal 경로는 유지되며, pending/rejected가 public에 노출되지 않고
provider/operator/evidence가 subject에게 새지 않는다.

### `F-10` Match chat

`active Match → chat 진입 → text 작성 → durable send receipt → 상대 확인 → unmatch/block/report/message delete`

성공 기준: `socialChat` off/offline/block/unmatch에서 send success를 가장하지
않고, attachment/link/location은 만들 수 없으며 report evidence 정책을 지킨다.

### `F-11` in-app notification

`durable Invite/Duel/Match/승인된 chat activity → outbox dedupe → generic inbox item
→ item 열기 → 현재 권한 재검사 → 안전한 destination 또는 unavailable`

성공 기준: duplicate item 0건, Interest 단독 알림 0건, block/private 뒤 stale
item으로 대상 정보 접근 0건, OS notification permission/push registration 0회.

## 11. 분석과 제품 검증

### 11.1 허용 event 연결

화면은 정본의 event vocabulary만 호출한다. 모든 lifecycle event는 durable
domain transition 이후 한 번만 발생한다. 화면 view event는 privacy/store
승인 전 default off다.

| 여정 | 핵심 event | 제품 관찰 |
| --- | --- | --- |
| Profile | `social_profile_completed` | account→profile/첫 관계 행동 완주 |
| Friend | invite created, friendship accepted | 단계·시간·중단점 |
| Duel | duel started/completed | sync gate 실패와 tie 포함 |
| Crew | created/joined/left | 역할 오류·owner 처리 |
| Nearby | discoverability changed, interest/match | opt-in 철회와 mutual flow |
| Safety | block/report/delete | 권리 성공률·latency |

event에 raw ID, handle, 위치 값, profile text, photo/message/report 내용, workout,
CP, `verifiedRatio`를 넣지 않는다.

### 11.2 Product/workflow test script

승인된 release candidate에서 동의한 시험 사용자로 다음을 관찰한다.

1. account를 명시적으로 만들고 private profile과 각 preview를 확인한다.
2. TODAY에서 운동 시작 후 +LOG 없이 저장하고 TRAIN에서 성취를 찾는다.
3. TRAIN Explore에서 기록하고 TODAY 요약으로 돌아간다.
4. 두 사용자가 친구 초대를 수락하고 차단/해제 후 복원되지 않음을 본다.
5. private Crew name의 pending/reject/edit/delete/appeal/approve를 거친 뒤 초대하고,
   role boundary와 owner deletion을 수행한다.
6. policy version을 바꾼 fixture에서 기존 read/권리는 유지되고 새 Profile/Invite/
   Crew/Interest/Duel write만 재동의를 요구하는지 확인한다.
7. moderation rejection/restriction의 own SafetyAction notice로 Appeal을 만들고,
   concurrent duplicate·modified replacement·reversal no-restore를 확인한다.
   restricted/suspended fixture에서 private-only와 discoverability all-off는
   성공하고, authored+private 또는 opt-out+다른 opt-in 혼합은 전부 거부되며
   partial state change가 없는지 확인한다.
8. 두 기기 dataset을 claim한 사용자가 정확히 하나를 선택하고, dormant 기기
   기록 제외와 pending/active Duel switch 거부, 이후 rebaseline을 이해하는지 본다.
   capability kill/stale policy/restrict/suspend 중 opt-out·selected revoke를 실행해
   transport 중단과 winner 없는 Duel 취소도 확인한다.
9. OS 상태가 denied/restricted인 fixture에서도 permission request 0회로 수동
   area/venue를 선택하고 Nearby opt-in을 완료한다.
10. 한쪽 Interest 비노출, reciprocal Match, opt-out 뒤 read-only Match를 확인한다.
11. media upload→pending→approve/reject→generalized action notice/Appeal→
    replace/delete와 provenance를 확인한다.
12. chat on에서 send/delete/report/block/unmatch를, chat off에서 비노출을 확인한다.
13. network down에서는 로컬 기록이 성공하고 safety write는 성공으로 가장하지
    않고 재시도 상태를 보인다. 별도로 network up + capability kill에서
    block/report/appeal/private/opt-out/media-delete/competition-disable/
    dataset-revoke/delete/deletion-status 권리 route가 계속 성공하는지 확인한다.
14. Invite/Duel/Match event retry가 generic inbox item 하나만 만들고 unilateral
    Interest는 0개인지, block 뒤 cached item open은 unavailable인지, OS permission/
    push registration은 0회인지 확인한다.

각 task의 step 수, 경과 시간, 오류, 포기 지점, capability cohort를 기록하되
민감 content와 위치 식별자는 수집하지 않는다. 목표 threshold는 `[TBD]`다.

## 12. 접근성·시각 품질

- 모든 action에 screen-reader label과 상태를 제공한다.
- 색만으로 media kind, selected state, winner/tie, error를 전달하지 않는다.
- dynamic text에서 주요 CTA가 잘리거나 겹치지 않는다.
- keyboard가 지원되는 platform에서 모든 action에 도달 가능해야 한다.
- 기존 skin token과 primitive만 사용한다.
- Social hero와 badges는 오리지널 Reploom IP다.
- `AI 스타일`, `업로드 사진` provenance는 이미지 로드 실패 시에도
  텍스트로 남는다.

## 13. 화면 소유권 후보

| 영역 | 전용 후보 경로 | 단일 통합 경로 |
| --- | --- | --- |
| TODAY | 기존 today feature | `R-TODAY`: `src/app/(tabs)/index.tsx` |
| TRAIN | planned `src/features/train/{shell,growth,plan,explore}/**` | `R-NAV`: train/history/exercises routes; program persistence 별도 owner |
| +LOG | 기존 log route, logging features | tab layout |
| SOCIAL | planned `src/features/social/{shell,onboarding,friends,crew,cache}/**` | `R-NAV` social route; safety controls는 Safety lane, inbox는 `R-NOTIFICATION` |
| ME | planned `src/features/me/{shell,social-profile,safety}/**` | `R-ME`: settings/me routes; locale 별도 owner |

실제 allowed glob은 구현 전 `OWNERSHIP-MANIFEST-03`에서 고정한다. 병렬 작업자가
각자 `_layout.tsx`, `settings.tsx`, locale을 수정하지 않는다.

## 14. 미확정 사항

아래 목록 중 TODAY 최근 성취 우선순위, PR 재계산, weekly self-PR target 의미는
`LOCAL-ACHIEVEMENT-CONTRACT-01C` 승인 전 구현하지 않는다.

- TRAIN 내부 control 형태
- TODAY 최근 성취 우선순위
- `WarriorCard` body/physique completion metric을 유지·재설계·제거할지
- PR metric별 정의와 수정/삭제 재계산 방식
- weekly self-PR target의 명칭
- OS push/remote notification, notification kind allowlist·retention·badge count 의미
- candidate ordering과 sparse cohort 수치
- competition selected dataset은 확정; 남은 sync payload/timezone/grace/correction semantics
- media/chat 운영과 보존
- 제품 metric 목표와 공개 cohort
