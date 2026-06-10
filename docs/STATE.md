# OVERDRIVE — 현재 상태 (handoff / 새 컨텍스트용 단일 진실)

> 컨텍스트 압축·새 세션 시 **여기부터 읽으면 이어받는다.** 정본 스펙은 [`docs/overdrive-spec.md`](overdrive-spec.md), Phase 1 플랜 [`docs/phase1-plan.md`](phase1-plan.md). 버그/함정은 [`docs/troubleshooting.md`](troubleshooting.md), 내러티브는 `content/logs/OverDrive/`. **갱신: 2026-06-10.**

## ▶ 새 세션 첫 행동 (여기부터)
1. 이 파일 + `docs/overdrive-spec.md`(정본) + `docs/troubleshooting.md`(함정) 훑기.
2. **앱 빌드/실행은 내가 직접 한다** (메모리 keep-app-launched): 폰 = `npx expo run:ios --device 00008140-00186DE43CFA801C --configuration Release` (반드시 **레포 루트에서**; 빌드로그에 `Build Succeeded`+`Installing`+`Complete`까지 확인 — launch 성공≠새 빌드). 폰 잠겨 있으면 devicectl direct-install 후 사용자에게 잠금해제 요청. 시뮬 = `--port 8082`(8081은 다른 앱).
3. **다음 후보:** 비주얼 라운드 2(CharacterAura/Forge 챔버 SkSL, 버스트 오프스크린) · 리마인더(expo-notifications, 네이티브 배치) · Evolution 퀄 튜닝 · 빌더 dogfood 피드백 최우선.
4. 비-사소 변경마다 dual-write 로깅. **로그 커밋 제목은 중립 문구만**("docs(log): add entry for <hash>") — decision/audit/migration 등 트리거 단어 금지(훅 재귀 3회 전과).

> 모델/세션 메모: 컨텍스트 꽉 차면 새 세션 + 이 STATE.md 핸드오프 (1M 유료 켜지 말 것).

## 한 줄
Phase 1 로컬 MVP **완성 단계 + Phase 2~4 기능 일부 선행** — 아이폰 실기기(Release, 단독실행)에서 풀 루프 작동: 한줄/음성 AI 로깅 → 전투력 → JUICE 폭발 → ARENA(라이벌/보스) → 실제 리더보드(D1) → AI 식단 → EVOLUTION(사진 진화). 검증: tsc/lint/jest(85)/export green.

## 인프라 (Cloudflare — 전부 라이브)
- **Worker** `https://overdrive-quicklog.daeseon.workers.dev` (`worker/`, wrangler 로그인 캐시됨, 배포는 서브셸로 `( cd worker && npx wrangler deploy )` — **cwd 잔류 금지**).
- 라우트: `/parse`(Groq llama 운동 파싱, 미등록 운동 자동생성) · `/transcribe`(Groq whisper, UI 로케일 언어 강제) · `/food`(텍스트=Groq, 사진=llama-4-scout 비전) · `/rank/submit`·`/rank/board`(D1 `overdrive-rank`, id a789812b-…) · `/evolve`(**Gemini 이미지 — GEMINI_API_KEY 시크릿 필요, 빌더가 주입**).
- 시크릿: GROQ_API_KEY(주입됨), GEMINI_API_KEY(/evolve용 — 미주입이면 그 라우트만 에러).
- 앱 연결: `.env`의 `EXPO_PUBLIC_QUICKLOG_ENDPOINT`(비밀 아님, gitignore). 무인증 엔드포인트 — 공개 출시 전 hardening(Phase 4).

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
  - 버스트 셰이더 업그레이드(0c9b4bc): 3중 충격파·40 입자꼬리·fbm 텐드릴·2단 화이트핫 블룸·`fade²` 펀치 엔벨로프. 적대적 SkSL 리뷰로 성능(56→40·single sqrt)·느낌(대비 복원) 튜닝.
- 로깅 핫패스: `useLogSet`(PR감지) / `useLogCardio`
- 오늘 탭(`src/app/(tabs)/index.tsx`): **바디맵 캐릭터**(부위 터치→운동) + **주간 글로우**(이번주 한 부위 빛남) + SetLogger v2(반복1탭/스텝퍼) + 카디오 로거(시간/거리)
- THE FORGE (`src/features/forge`) — 세션 진입/완료 의식 + T4 + streak
- 오디오 (`src/features/juice/audio`) — 절차적 합성 SFX 7종(`scripts/gen-sfx.mjs`, 수학→WAV, 샘플/키 0), 단일 합류점 `playSfx` + 카디오 whoosh 힌트 + 포지 입장 챔버 드론, `soundOn` 게이트. **VO 콜아웃은 Phase 2(TTS 서버키).**
- i18n (`src/i18n`) — en 기본, en/ko/es/zh, 등급/부위/운동명까지. 단위 kg/lb·km/mi(`src/lib/units.ts`)
- 기록 탭 — 이번주 부위별 정리 + 유산소
- 규율 — 단백질/수면 원탭(`src/features/discipline`) → 전투력 규율 컴포넌트
- 데일리 목표 (`src/features/dailyGoals`, 4fae73e) — 반복 템플릿+날짜별 진행(daily_target/_log, 스키마 v4), 단위-무관(reps/sets/sec/min/m/km), 자유입력+빠른칩(버피·파머스워크 등), 완료 시 **전투력 보너스 배수**(희석 없음, ≥1)+JUICE. CP 통합=trustMultiplier와 동형.
- 폰트: Anton(콜아웃)/Orbitron(숫자)
- **QuickLog** (`src/features/quicklog`, 40cdc00·108bc43·866e295) — Today 대청소: 거대 CP + **단일 입력**(타이핑/🎤음성) + 최근칩 한탭. AI 우선(워커 Groq, 7s 타임아웃) → 오프라인 규칙파서 폴백. 미등록 운동 자동생성(ensureExercise). 바디맵은 "수동" 토글 뒤로.
- **음성** (f630201·866e295) — 🎤 → expo-audio 녹음 → /transcribe(Groq whisper, **UI 로케일 언어 강제**) → 같은 파서. 업로드는 expo-file-system uploadAsync(**RN FormData {uri} 금지 — New Arch에서 터짐**).
- **ARENA** (`src/features/arena`, 6e5726a) — 라이벌(설정 JSON config, 결정론 성장 ~1.4%/day, 순수함수) + 주간 결전(상승폭 비교 §10) + 주간 보스(최다훈련 리프트 +2.5kg/+1rep, PR로 처치). 추월 시 T4. 8 테스트.
- **식단** (`src/features/food`, 0ebc924·67c4427) — FoodCard: 텍스트/📷사진 → /food → kcal·단백질 기록(food_log, 스키마 v5). 단백질 목표 도달 → 규율 자동 → CP+JUICE.
- **편함** (0ebc924) — 휴식타이머 자동시작(`src/features/rest`, 절대시각, 딩+햅틱) · History 길게눌러 세트 삭제+CP 재계산.
- **랭킹** (`src/features/rank`, 60be727) — Power 탭. opt-in(핸들 필수, 그 전 전송 0). 주간 상승폭 보드(메인)+절대 CP+크루(자유 코드). D1 라이브 검증.
- **EVOLUTION** (`src/features/evolution`, 67c4427) — 내 사진 → /evolve(Gemini 이미지) → 등급별 진화(오르기만, §9). 원본/결과 로컬만. expo-image-picker(보관함만).

## 남은 것 (우선순위)
1. **빌더 dogfood 피드백 최우선** — 매일 쓰면서 거슬린 것부터.
2. 비주얼 라운드 2: CharacterAura SkSL + Forge 챔버 SkSL + 버스트 오프스크린 다운스케일. 랭킹/아레나 시각효과(포디움 글로우 등).
3. 리마인더(expo-notifications — 네이티브 배치), 온보딩(키/체중/단백질 목표 설정 UI — proteinTargetG가 현재 null이라 식단 목표바 비활성!).
4. streak 마일스톤 T4, OVERDRIVE MODE(세션 게이지).
5. (Phase 2 이월) VO 콜아웃, 헬스 자동연동, 랭킹 hardening(검증 티어).

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
- expo-audio가 RECORD_AUDIO 자동추가 → app.json 플러그인 옵션으로 차단 완료(8a4d18f).
- v4 마이그(daily_target/_log)는 풀 부팅에서만 → 데일리 목표 보려면 `npx expo run:ios` 풀 리빌드.
- expo-doctor가 SDK56 패치 드리프트 경고(expo 56.0.8 vs .9 등 8개) — 업스트림 패치, 빌드 무해. deps 멋대로 안 올림(멀티앱 빌드 중).

## 작업 규칙 (사수)
Phase 순서 · TS strict · 키 클라이언트 금지 · 오리지널 IP · JUICE 로깅 비차단 · 전투력="재미용 자체 산식" 라벨 · **비-사소 변경마다 dual-write**(troubleshooting.md + content/logs).
