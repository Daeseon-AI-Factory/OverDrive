# OVERDRIVE — 현재 상태 (handoff / 새 컨텍스트용 단일 진실)

> 컨텍스트 압축·새 세션 시 **여기부터 읽으면 이어받는다.** 정본 스펙은 [`docs/overdrive-spec.md`](overdrive-spec.md), Phase 1 플랜 [`docs/phase1-plan.md`](phase1-plan.md). 버그/함정은 [`docs/troubleshooting.md`](troubleshooting.md), 내러티브는 `content/logs/OverDrive/`. **갱신: 2026-06-03.**

## 한 줄
Phase 1(로컬 MVP) **거의 완성** — 굴러가는 앱이 iPhone 17 시뮬에서 돌고, 핵심 루프(바디맵→로깅→전투력→JUICE 폭발→FORGE 완료)가 작동. 검증: tsc/lint/jest(49)/expo-doctor(21)/expo export 전부 green.

## 로드맵 (스펙 §8)
- **Phase 0** (PWA 훅 데모) — 건너뜀(바로 Phase 1). 선택.
- **Phase 1 — 로컬 MVP — ▶ 진행 중(거의 완료).** ↓아래.
- **Phase 2** — 백엔드(NestJS+PG) + 계정 + 헬스연동 + 동기화 + **음성 로깅** + **음식 사진AI** — 미착수.
- **Phase 3** — 오라카드 + 공유 + 3D 레이어 — 미착수.
- **Phase 4** — 소셜 + 경쟁(리그/결투) — 미착수.
- **Phase 5** — 체력마커/테스트데이 + 체성분 — 미착수.
- **Phase 6** — 폴리시 + 출시 + 수익화 — 미착수 (브랜드 리서치는 prep 완료).

## Phase 1 — 완료 ✅
- 스캐폴드: Expo SDK 56 / RN 0.85 / New Arch / TS strict / jest+RTL
- DB: 로컬 SQLite (`src/db`) — 스키마/마이그(v3)/시드(32운동)/repos. **마이그는 풀 부팅에서만 + 추가 테이블은 매부팅 CREATE IF NOT EXISTS 자가치유.**
- 전투력 v1 (`src/features/combat-power`) — 산식·등급·anti-shame·breadth-gate, 11 테스트
- JUICE (`src/features/juice`) — 판정(classifyEvent) + Reanimated 키네틱(펀치+크로마틱+셰이크) + **SkSL GPU 파티클 폭발**(energyPop/overdriveBurst, SkiaBurst)
- 로깅 핫패스: `useLogSet`(PR감지) / `useLogCardio`
- 오늘 탭(`src/app/(tabs)/index.tsx`): **바디맵 캐릭터**(부위 터치→운동) + **주간 글로우**(이번주 한 부위 빛남) + SetLogger v2(반복1탭/스텝퍼) + 카디오 로거(시간/거리)
- THE FORGE (`src/features/forge`) — 세션 진입/완료 의식 + T4 + streak
- i18n (`src/i18n`) — en 기본, en/ko/es/zh, 등급/부위/운동명까지. 단위 kg/lb·km/mi(`src/lib/units.ts`)
- 기록 탭 — 이번주 부위별 정리 + 유산소
- 규율 — 단백질/수면 원탭(`src/features/discipline`) → 전투력 규율 컴포넌트
- 폰트: Anton(콜아웃)/Orbitron(숫자)

## Phase 1 — 남은 것 (우선순위)
1. **오디오** — 펀치 SFX·베이스·콜아웃 VO·앰비언트 (JUICE의 빠진 한 축, "약빨" 가장 큰 한 방). 오리지널만.
2. SkSL 셰이더 퀄 이터레이션(파티클↑·블룸·왜곡), CharacterAura/Forge 챔버 SkSL 고도화.
3. 사용성 갭: 세트 편집/삭제, 휴식 타이머, 온보딩(키/체중/단백질 목표).
4. streak 마일스톤 별도 T4, OVERDRIVE MODE(세션 게이지).
5. **최종 Accept = 빌더 dogfooding "매일 쓸 수준"** (진행 중).

## 박제된 핵심 결정 (content/logs)
- **브랜드: "OverDrive" 공개 앱명 NO-GO** (Overdrive Fitness 선점 등). 코드네임/인앱 콜아웃은 유지, 공개명 별도 채택 + 변호사 clearance. (private 로그)
- **음식 = 사진 AI(Phase 2, 키 서버사이드), 수면/체중 = 헬스 자동연동.** 수동 음식일기 금지. 운동=히어로. (private 로그)
- 기본 언어 = 영어. SDK 56 락. 백엔드 = NestJS(Phase 2).

## 앱 실행 (시뮬레이터)
```bash
cd /Users/daeseonyoo/Documents/GitHub/ai-product/OverDrive
npx expo run:ios            # 빌드(캐시)+설치+실행+Metro. 가장 확실.
# 이미 떠있고 JS만 갱신: 시뮬 클릭 후 Cmd+R (마이그 추가했으면 반드시 풀 재시작)
```
- 번들ID `com.anonymous.overdrive`. DB: 시뮬 컨테이너 `Documents/SQLite/overdrive.db`.
- **마이그레이션 추가 후엔 핫리로드로 안 됨 → 풀 재시작(run:ios 또는 앱 terminate+launch) 필수.**

## 검증 명령 (커밋 전 게이트)
```bash
npx tsc --noEmit          # 타입
npx jest                  # 핵심 로직(49 테스트)
npx expo lint             # React Compiler 룰까지
npx expo export --platform ios   # 번들(런타임 import 검증)
npx expo-doctor           # 네이티브 peer/버전 (Expo 기능엔 필수)
```

## 함정 (troubleshooting.md 상세)
- DB 마이그는 풀 부팅에서만. 추가 테이블은 버전 무관 CREATE IF NOT EXISTS 자가치유.
- i18next 보간은 단일괄호 설정(`{x}`)됨.
- React Compiler 룰: ref-in-render/setState-in-effect 막음 → 정당하면 사유 달고 disable.
- `[no-log]` 커밋 제목에 트리거 키워드(migration/refactor/auth…) 넣지 말 것(훅 재귀).
- expo-audio가 RECORD_AUDIO 자동추가 → 출시 전 제거(우린 재생만).

## 작업 규칙 (사수)
Phase 순서 · TS strict · 키 클라이언트 금지 · 오리지널 IP · JUICE 로깅 비차단 · 전투력="재미용 자체 산식" 라벨 · **비-사소 변경마다 dual-write**(troubleshooting.md + content/logs).
