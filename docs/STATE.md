# OVERDRIVE — 2026-06 historical snapshot (superseded)

> **Do not use this file as current release truth.** It is retained as a historical development
> snapshot and still describes retired leaderboard, Gemini EVOLUTION, broad HealthKit access, and
> old build/test counts. Current handoff: [`HANDOFF-codex.md`](HANDOFF-codex.md). Current release
> gates and exact v1 scope: [`app-store-launch-checklist.md`](app-store-launch-checklist.md) and
> [`launch/app-store-listing.md`](launch/app-store-listing.md). V1 removes public ranking and remote
> photo-avatar/evolution UI, defaults remote AI consent off, minimizes HealthKit, and keeps only
> Groq parsing/transcription/meal routes plus legacy rank deletion.

> 아래 내용의 마지막 정확한 시점은 2026-06-18이다. 정본 제품 원칙은
> [`docs/overdrive-spec.md`](overdrive-spec.md), 버그/함정은
> [`docs/troubleshooting.md`](troubleshooting.md), 내러티브는 `content/logs/OverDrive/`에 있다.

## ▶ 새 세션 첫 행동 (여기부터)
1. 이 파일 + `docs/overdrive-spec.md`(정본) + `docs/troubleshooting.md`(함정) + 아래 **§열린·미검증** 훑기.
2. **빌드/실행 — 폰(Release, 단독실행)이 dogfood 기준.** 이번 세션 검증된 경로:
   ```bash
   cd ios && xcodebuild -workspace OverDrive.xcworkspace -scheme OverDrive \
     -configuration Release -destination "id=00008140-00186DE43CFA801C" \
     -allowProvisioningUpdates build      # expo run:ios는 -allowProvisioningUpdates 안 넘겨 프로비저닝 실패 → 직접 xcodebuild
   # 산출물: ~/Library/Developer/Xcode/DerivedData/OverDrive-*/Build/Products/Release-iphoneos/OverDrive.app
   xcrun devicectl device install app --device 00008140-00186DE43CFA801C <위 .app>
	   xcrun devicectl device process launch --device 00008140-00186DE43CFA801C ai.daeseon.reploom
   ```
   - **새 바이너리를 확실히 띄우려면 launch 전에 기존 프로세스 SIGKILL.** `launch`는 떠 있던 옛 인스턴스를 그냥 포그라운드로 올려서 "새로 깔았는데 그대로"가 됨(이번 세션 실제 발생). pid: `devicectl device info processes` → grep `OverDrive.app/OverDrive`.
   - 시뮬 = `--port 8082`(8081은 다른 앱). 폰 잠겨 있으면 install 후 사용자에게 잠금해제 요청.
3. 비-사소 변경마다 dual-write 로깅. **로그 커밋 제목은 중립 문구만** — `decision/audit/migration/pivot/auth` 등 트리거 단어 금지(훅이 [no-log] 무시하고 강제 블록 — 전과 4회). 오탐이면 troubleshooting.md에 `<!-- override-trigger: HASH ... — 사유 -->`.

> 모델/세션 메모: 컨텍스트 꽉 차면 새 세션 + 이 STATE.md 핸드오프 (1M 유료 켜지 말 것).

## 한 줄
Phase 1 로컬 MVP **완성 + Phase 2~5 기능 다수 선행** — 아이폰 실기기(Release)에서 풀 루프: 한줄/음성 AI 로깅 → 전투력 → JUICE 폭발 → ARENA → 실제 리더보드(D1) → AI 식단 → EVOLUTION → **HealthKit 양방향 + InBody + 1탭 자동플랜 + 온보딩 + 파워판타지 테마 4종.** 공개 출시 후보 브랜드는 **Reploom**으로 전환됨(`ai.daeseon.reploom`, 아이콘/스플래시/권한문구 반영). 게이트: tsc0 / lint0 / **jest 18 suites·127 통과**.

## ★ 최근 세션 방향 전환 (2026-06-17) — 코덱스 필독
빌더 피드백 **"지금 가치가 있냐"** → 인프라(헬스 등) 그만 쌓고 **핵심 가치 2축**으로 선회:
- **(A) 게으른 1탭 자동플랜** — 목표/일수/장비만 고르면 주간 프로그램 생성. ✅ 폰 반영.
- **(B) 뽕맛 크랭크 + 정체성 테마** — JUICE 강도/셰이더/햅틱 상향 + "내가 ○○이 된 느낌" 테마(오라전사/모굴/프로/스토익). ✅ 코드/게이트 green, **테마 폰 렌더 검증은 미완**(§열린).
- 교훈(메모리): 배관 깔기 전에 **가치 적합성부터** 확인. 빌더는 "묻지말고 가" 지향이나, 큰 방향·IP 리스크는 확인.

## 인프라 (Cloudflare — 라이브)
- **Worker** `https://overdrive-quicklog.daeseon.workers.dev` (`worker/src/index.js`, wrangler 로그인 캐시됨). 릴리스는 `worker/README.md`의 immutable version upload → 0% version override smoke → 명시적 ID 100% 승격 절차만 사용한다. 즉시 `wrangler deploy`와 ID 없는 rollback은 금지. 프로덕션 승격은 빌더의 명시적 승인 필요(자동승인 차단). **현재 라이브: 2026-06-20, Version ID 1aef7442-2f7c-4af3-859b-649205f2f906 (v1 이전 구현이므로 롤백 대상으로 사용 금지).**
- 라우트: `/parse`(Groq llama, 미등록 운동 자동생성) · `/transcribe`(Groq whisper, UI 로케일 강제) · `/food`(텍스트=Groq, 사진=llama-4-scout) · `/rank/submit`·`/rank/board`(D1 `overdrive-rank`) · `/evolve`(**Gemini 이미지 — GEMINI_API_KEY 필요, 빌더가 유료 billing까지 충전**).
- 시크릿: GROQ_API_KEY·GEMINI_API_KEY 둘 다 주입됨. **키는 `~/.secrets/api-keys.env`에서 파이프, 절대 출력/깃 금지.**
- ✅ **테마별 EVOLUTION persona 배포 완료(2026-06-20, ver 1aef7442).** 전체 루프 연결 검증: 워커 라이브(GET→라우트 405) + 폰 번들에 `themeId` 전송 코드 존재 + 워커가 themeId→THEME_PERSONA 매핑. 남은 건 빌더가 폰에서 테마 골라 EVOLUTION 실행 → 실제 캐릭터 확인(Gemini 호출, 내가 못 함).
- 앱 연결: `.env`의 `EXPO_PUBLIC_QUICKLOG_ENDPOINT`(gitignore). Release는 `ios/.xcode.env.local`에 export로 인라인(빌드 단계가 .env 안 읽음).

## 로드맵 (스펙 §8)
- **Phase 0** PWA 훅 데모 — 건너뜀.
- **Phase 1 로컬 MVP — ▶ 완료, dogfood 중.**
- **Phase 2** 백엔드(NestJS+PG)+계정+동기화 — 미착수. (헬스연동·음성·음식AI는 선행 완료.)
- **Phase 3** 오라카드+공유+3D — 미착수.
- **Phase 4** 소셜+경쟁(리그/결투) — 미착수. (ARENA 라이벌/보스·랭킹 선행.)
- **Phase 5** 체력마커/테스트데이+체성분 — InBody·HealthKit 체성분 선행.
- **Phase 6** 폴리시+출시+수익화 — **출시는 브랜드 리네임에 BLOCKED**(아래).

## Phase 1 — 완료 ✅ (`src/features/*`)
- 스캐폴드: Expo SDK 56 / RN 0.85 / New Arch / TS strict / jest+RTL.
- DB: 로컬 SQLite(`src/db`) — 스키마/마이그/시드(32운동)/repos. 마이그는 풀 부팅에서만 + 추가 테이블 매부팅 `CREATE IF NOT EXISTS` 자가치유.
- **combat-power** — 산식·등급·anti-shame·breadth-gate + `verifiedRatio`(HealthKit 워크아웃/세션 비율, **트러스트 보너스만 §9**). 다수 테스트.
- **juice** — classifyEvent(T1–T4) + Reanimated 키네틱 + **SkSL GPU 폭발**(energyPop/overdriveBurst, SkiaBurst). 2026-06-17 크랭크업(강도/스파크수/햅틱 멀티펄스/플래시 ↑, T1·T2는 ≤0.6s 비차단 사수 §6).
- **theme** (신규, 0933f13) — 파워판타지 4종(`src/features/theme/themes.ts`): aura/mogul/pro/forged. 테마=`{callouts, overdriveLabel, tierColor(T1–4), accent}` 스왑. `settings.aestheticPref:ThemeId`(레거시 'battle'/'glow'→aura 폴백). 소비처 단일=`JuiceOverlay`. 설정에 선택 UI. EVOLUTION은 themeId→워커 persona. themes.test.ts(금칙어 검사 포함).
- **logging / quicklog** — QuickLog: 거대 CP + 단일 입력(타이핑/🎤) + 최근칩. AI 우선(Groq, 타임아웃) → 오프라인 규칙파서 폴백. 음성=expo-audio→/transcribe(uploadAsync, **RN FormData {uri} 금지**).
- **program** (신규) — `defaultProgram` + `generate.ts`(순수, 12테스트) goal/days/equipment→주간프로그램. `AutoPlanScreen`(/plan) 3칩→생성→적용. `/program` 편집.
- **onboarding** (신규) — 첫 실행 키/체중/단백질목표 + 자동플랜. `onboardedAt` 게이트.
- **health** (신규, iOS) — `@kingstinct/react-native-healthkit@14`(+nitro). **읽기**: 워크아웃/체중/체지방/VO2/안정시심박→Settings 표시+verifiedRatio. **쓰기**: 완료 워크아웃→HKWorkout, 체중/체지방/제지방→`InBodyScreen`(/inbody). **게임 수치는 절대 헬스에 안 씀 §4.** Android Health Connect 미구현(이 Mac에 Android SDK 없음).
- **arena** — 라이벌(결정론 성장, 순수) + 주간결전 + 주간보스. 추월 시 T4. 테스트.
- **food** — 텍스트/📷→/food→kcal·단백질(food_log). 목표도달→규율 자동→CP+JUICE.
- **rank** — Power 탭. opt-in(핸들 필수). 주간 상승폭/절대CP/크루. D1 라이브.
- **evolution** — 내 사진→/evolve(Gemini)→등급별 히어로 진화(오르기만 §9, 슬림화 금지). themeId 전송(워커 배포 후 테마별 캐릭터). 다운스케일 1024, 60s 타임아웃.
- **forge / rest / discipline / dailyGoals / character(바디맵·오라)** — 세션 의식+streak / 휴식타이머 자동 / 단백질·수면 원탭 / 데일리목표 보너스 / 바디맵 부위터치+주간글로우.
- 오디오: 절차적 SFX 7종(`scripts/gen-sfx.mjs`→WAV), `playSfx` 단일합류, `soundOn` 게이트. **볼륨이 WAV에 baked-in → API로 못 키움.**
- i18n(en기본/en·ko·es·zh, 등급·부위·운동명·테마까지) · 단위 kg·lb/km·mi · 폰트 Anton/Orbitron.

## ★ 열린·미검증 (코덱스 주의 — 추측 금지, 직접 확인)
1. **테마 폰 렌더 미확인** — 코드/게이트/번들(Hermes, `grep -a`로 'CEO MODE' 확인됨) 다 정상이나 **빌더가 화면에서 테마 섹션/색 전환을 아직 확인 못 함**. 마지막 조치=강제 재설치+콜드런치. 빌더 피드백 대기.
2. ✅ **워커 EVOLUTION persona 배포됨**(2026-06-20, ver 1aef7442). 남은 미검증=빌더가 폰에서 테마 골라 EVOLUTION 돌려 실제 테마별 캐릭터 이미지 확인(Gemini 호출).
3. **사운드 약함** — WAV baked-in. 더 키우려면 `scripts/gen-sfx.mjs`로 에셋 재생성(빌더가 못 들으면 보류).
4. **출시 BLOCKED** — "OverDrive" 공개 앱명은 NO-GO라서 repo의 공개명/번들ID/아이콘은 후보명 **Reploom**으로 바꿨다. 그래도 App Store 제출 전 Reploom 상표 clearance, privacy labels/manifest, dev-client 제거 여부, 워커 배포, 실기기 dogfood, TestFlight 검증이 남아 있다. (체크리스트: `docs/app-store-launch-checklist.md`, 브랜드 리서치: `docs/compliance/brand-availability.md`.)
5. Android Health Connect 미구현(SDK 부재). 오프라인 배너·DB 통합테스트 미완.

## 남은 것 (우선순위)
1. **빌더 dogfood 피드백 최우선** — 위 §열린 1번(테마 체감) 확인부터.
2. 워커 배포 → EVOLUTION 테마 캐릭터 검증.
3. 비주얼 라운드 2: CharacterAura/Forge 챔버 SkSL, 버스트 오프스크린 다운스케일, 랭킹/아레나 시각효과. **테마별 오라 팔레트**(현재 auraFromCp는 등급 램프 고정 — 테마 연동 여지).
4. 리마인더(expo-notifications, 네이티브 배치). OVERDRIVE MODE(세션 게이지)·streak 마일스톤 T4.
5. (Phase 2 이월) VO 콜아웃, 랭킹 hardening(검증 티어), 백엔드/계정/동기화.

## 박제된 핵심 결정 (content/logs)
- **가치 선회(2026-06-17)** — 배관 중단, 뽕맛+게으른플랜+정체성 테마로. (`2026-06-17-value-focus-t1.mdx` 등)
- **파워판타지 테마 = 오리지널 only(§5).** 드래곤볼·실존연예인 이름/디자인/콜아웃/초상 전부 불가 → 같은 감성을 자체 IP로(aura/mogul/pro/forged). (`2026-06-17-power-fantasy-themes.mdx`)
- **브랜드 "OverDrive" 공개명 NO-GO** — 인앱 콜아웃 유지, 공개명 별도+clearance.
- **음식=사진AI(서버키), 수면/체중=헬스 자동연동.** 수동 음식일기 금지. 운동=히어로.
- 기본 언어=영어 · SDK 56 락 · 백엔드=NestJS(Phase 2).

## 검증 명령 (커밋 전 게이트)
```bash
npx tsc --noEmit                 # 타입
npx jest                         # 18 suites·127 (핵심 로직: 전투력/JUICE/테마/플랜)
npx expo lint                    # React Compiler 룰까지
npx expo export --platform ios   # 번들(런타임 import 검증)
```

## 함정 (troubleshooting.md 상세)
- **Release `main.jsbundle`은 Hermes 바이트코드** → 내용 확인은 `grep -a`(일반 grep은 못 읽음 — 이번 세션 오진 유발). react-native-xcode.sh가 매 Release 빌드마다 `export:embed` 재실행하므로 stale 번들 걱정은 없음.
- **폰: install 후 launch는 옛 인스턴스를 포그라운드로 올림** → 새 바이너리 로드하려면 launch 전 SIGKILL 또는 빌더가 강제종료 후 재실행.
- DB 마이그는 풀 부팅에서만. 추가 테이블은 버전무관 CREATE IF NOT EXISTS 자가치유.
- i18next 보간 단일괄호(`{x}`). React Compiler 룰: ref-in-render/setState-in-effect 금지(정당하면 사유+disable).
- `[no-log]` 제목에 트리거 키워드 금지. image-manipulator는 56.0.14 핀(56.0.18=symbol mismatch dyld crash).
- expo-doctor SDK56 패치 드리프트 경고는 무해 — deps 멋대로 안 올림(멀티앱 빌드 중).

## 작업 규칙 (사수)
Phase 순서 · TS strict · 키 클라이언트 금지(서버/프록시) · 오리지널 IP only · JUICE 로깅 비차단(T1–2 ≤0.6s) · 전투력="재미용 자체 산식" 라벨 · 헬스 컴플라이언스(개인정보방침·iCloud금지·게임수치 쓰기금지·읽기/쓰기 타입 공개) · 큰 아키텍처·IP 변경 전 확인 · **비-사소 변경마다 dual-write**(troubleshooting.md + content/logs).
