# Reploom (OverDrive) — 세션 핸드오프 (2026-07-09)

다른 에이전트(Codex 등)가 이어받기 위한 브리핑. 이 문서 하나 + 아래 "붙여넣을 프롬프트"만 새 세션에 주면 된다.

## 한 줄 상태
게임화 운동 앱 Reploom(구 OverDrive)을 TestFlight로 반복 배포 중. **현재 빌드 12가 TestFlight VALID(설치 가능)**. main 브랜치 클린, 최신 커밋 `6c30d3b`.

## 지금까지 한 것 (빌드별)
- **b4** 첫 TestFlight 배포 (EAS 프로젝트/인증서/앱 레코드 세팅 완료).
- **b5** 로깅 UX 수리: 로컬-퍼스트 즉시 저장(§6, 네트워크 대기 제거), 키보드 수정, 무음 세션 시작, AI 엔드포인트 빌드 주입.
- **b7** 디자인 언어 MONOLITH 전면 적용(`ac0d450`) — 3안 경쟁·심사.
- **b8~9** 스킨 엔진 12벌(`ab1eaba`) + 확실한 기록 루프(`c723937`): 포즈 애니메이션(12 동작 패밀리, Skia), 파서 후보 좁히기, 컨펌-되돌리기 카드, 일별 타임라인.
- **b10** 다음-액션 코치 엔진(`0ca0e20`): 상황 인지 히어로(시작/휴식/방치/마무리), 원탭 제안 세트, 자동 휴식 카운트다운, 마이크 FAB, 탈텍스트 타일.
- **b11** 시뮬레이터 시각 감사 8건 수정(`c7c8852`): Skia 글리프 글로우(textShadow 박스 근절), 20pt 미만 시스템 숫자(Orbitron 슬래시-제로), 코치 2열, 빈 주간 축약, 이모지 제거.
- **b12** 코치 세션 복원 버그 수정(`ba80eed`): 진행 중 세션을 부팅 시 DB에서 재수화 → 앱 재실행/백그라운드 킬 후에도 코치 루프 유지.

## 아직 미검증 / 열린 것 (사용자 판정 대기)
1. **b12 실기기 판정**: 세트 기록 → 앱 완전 종료·재실행 → 코치가 "IN SESSION·다음 세트"로 이어지는지. (시뮬레이터로는 복원 확인됨: 스크린샷 `scratchpad/fix-probe.png`.)
2. **메인 스킨 미선정**: 12벌 중 사용자가 꽂히는 1~2벌 정하면 그 스킨 시그니처(타코미터/레티클/클로컷 등) 심화 + JUICE 연동.
3. **UX 백로그**(troubleshooting.md 참조): 음식 로그 수정/삭제 UI(write-only), i18n 신규 키 정식 카탈로그 등록(현재 defaultValue 폴백), health.ts write 에러 전파, DisciplineCard 단백질 중복.
4. **6/30 전략 결정 미해결**: "진전이 cosmetic 축에 몰림, 실사용/매일사용 미검증." 실제 운동에서 매일 쓰는지가 성공 기준.

## 반드시 지킬 규칙 (하드)
- **CLAUDE.md 프로젝트 규칙 + `~/.claude/PLAYBOOK.md` 작업 프로토콜** 준수. 특히 첫 응답에 `[유형·강도]` 분류 선언, 표준 이상은 착수 전 계약 5줄.
- **스펙 사수 항목**(`docs/overdrive-spec.md` §0·§9): §6 로깅은 어떤 연출/네트워크도 못 막는다(저장 우선). §5 오리지널 IP만(드래곤볼 등 프랜차이즈 이름/문구 금지, 감성만 재현). §7 그래픽은 히어로(Skia 한계까지). §9 반수치심(낮은 숫자·방치 조롱 금지).
- **TypeScript strict**, 새 의존성 금지 원칙, 스킨 토큰만 사용(하드코딩 hex 금지).
- **dual-write 로그 강제**(Stop 훅): 비-사소 커밋마다 `docs/troubleshooting.md` + `content/logs/OverDrive/<date>-<slug>.mdx` 동시 기록. **로그 커밋 제목엔 트리거 키워드(audit/decision/pivot) 금지** → `docs(log): record for <hash>` 중립 형식 (안 그러면 훅 재귀 오탐).

## 빌드·배포 파이프라인 (검증됨, 재사용 가능)
EAS 무료 큐가 자주 정체 → **altool 직접 업로드가 기본 경로**:
```
npx eas-cli build -p ios --profile production --non-interactive --no-wait --json   # BUILD_ID 획득
# FINISHED 후:
URL=$(npx eas-cli build:view <BUILD_ID> --json | jq -r .artifacts.applicationArchiveUrl)
curl -sL -o app.ipa "$URL"
xcrun altool --upload-app -f app.ipa -t ios --apiKey 84HQ6ZG4L2 --apiIssuer 6586aecd-c733-4fcc-ba9a-cf460061e243
```
- ASC 앱 ID `6786831176`, 번들 `ai.daeseon.reploom`, Team `Z2BGA7G287`.
- ASC API 키: `~/.secrets/asc/AuthKey_84HQ6ZG4L2.p8` (키 식별자는 `~/.secrets/api-keys.env`의 ASC_* 라인).
- 애플 처리(VALID)는 보통 몇 분~30분, 가끔 수 시간 지연(장애 아님). 내부 그룹 자동 배포 켜져 있음.

## UI 검증 방법 (이번 세션의 핵심 교훈)
**코드/테스트 통과 ≠ UI 검증.** 반드시 시뮬레이터에서 눈으로 본다. 그리고 **빈 첫 화면이 아니라 실사용 상태를 seed**해서 본다:
```
xcrun expo run:ios --configuration Release --device "iPhone 17 Pro"   # 또는 metro reload(JS-only 변경 시)
# DB: <sim-container>/Documents/SQLite/overdrive.db 에 workout_session + set_log seed → 앱 재실행 → 스크린샷
xcrun simctl io booted screenshot shot.png
```
세션성 상태(진행 중 운동)는 **재실행 후에도 복원되는지** 반드시 확인.

## 기술 스택
RN 0.85 + Expo 56(dev client), TypeScript strict, expo-sqlite(온디바이스, 백엔드 없음 — Phase 1), @shopify/react-native-skia 2.6.2, reanimated 4.3.1, Anton/Orbitron 폰트. 핵심 디렉터리: `src/ui/skins/`(스킨 엔진), `src/features/coach/`(다음-액션), `src/features/exercise-art/`(포즈), `src/features/quicklog/`(로깅), `src/app/(tabs)/`(화면). 테스트: `npm test`(jest), `npx tsc --noEmit`, `npm run lint`.
