# Reploom (OverDrive) — 세션 핸드오프 (2026-07-13)

다른 에이전트가 App Store 제출 작업을 그대로 이어받기 위한 현재 상태다. 추측하지 말고 아래 ID와 live readback을 다시 확인한 뒤 진행한다.

## 한 줄 상태

브랜치 `codex/usability-cockpit`은 GitHub에 `fafe712`까지 push됐다. **Build 13은 App Store Connect에서 `VALID` / `APP_STORE_ELIGIBLE`이고 version 1.0에 연결돼 있다.** Review Submission 초안은 만들었지만 private 설문과 공개 정책 URL이 없어 version item 추가가 `409 STATE_ERROR.ENTITY_STATE_INVALID`로 차단됐으며 아직 심사 제출되지 않았다.

## 현재 Git / 산출물

- 브랜치: `codex/usability-cockpit`
- 원격: `https://github.com/Daeseon-AI-Factory/OverDrive.git`
- 출시 자산 커밋: `ca82eb4 docs(release): prepare App Store submission assets`
- dual-write 로그: `fafe712 docs(log): record for ca82eb4 [no-log]`
- 의도된 유일한 미커밋 변경: `docs/troubleshooting.md`의 다음 marker 한 줄
  `<!-- skipped: af57b8c docs: session handoff briefing for next agent [no-log] -->`
- App Store 원본: `docs/artifacts/app-store-v1/`의 5개 1320×2868 PNG
- 스토어 정본: `store.config.json`
- IPA: `/tmp/Reploom-13-export-local-account/Reploom.ipa`
- IPA SHA-256: `72e97bcc23796f2cf637214b9d8c68bc908501d0ea3bf29e1edc0a65e7c3a24c`

커밋 전 marker를 제거하고, 구현 커밋 뒤 `docs/troubleshooting.md` + 새 `content/logs/OverDrive/*.mdx`를 작성해 `docs(log): record for <hash> [no-log]`로 별도 커밋한 다음 marker를 다시 unstaged로 복원한다.

## App Store Connect live 상태

- App ID: `6786831176`; bundle: `ai.daeseon.reploom`
- Version 1.0 ID: `6d40b6b7-eb2c-413b-a907-90829331c594`
- Build 13 ID: `60e4f17c-e5a9-4cba-93f9-0554a50b543c`
- Review Submission draft: `72f01614-39bb-4b0e-95e7-a3810e5fbb97`, state `READY_FOR_REVIEW`, item 0, submitted date null
- Build 13: `VALID`, `APP_STORE_ELIGIBLE`, min iOS 16.4, non-exempt encryption false
- Version: Build 13 연결, manual release, `usesIdfa=false`, copyright `2026 Daeseon Yoo`
- Category: `HEALTH_AND_FITNESS`; content rights: `USES_THIRD_PARTY_CONTENT`
- Age rating: global 4+, Health/Wellness yes, Age Assurance yes, Contests no, 나머지 공개 항목 none/no
- Review contact·notes·demo-account-not-required 입력 및 readback 완료
- Screenshots: en-US `APP_IPHONE_67` 5장 모두 `COMPLETE`, 순서 Today → Explore → Chest recommendations → History → Power
- 가격: USA base, manual 1 + automatic 174 모두 customer price/proceeds 0
- 지역: 전체 175 = 판매 132 + 제외 43, preorder 0, 신규 storefront 자동 포함 false
- 제외: EU 27 + 기타 유럽 15 + China mainland; Hong Kong/Macau/Taiwan 포함
- Korea e-Commerce Act: 사용자 제공 readback `Active`, last updated 2026-06-16

## 아직 닫히지 않은 Apple private gate

공개 App Store Connect API v4.4에는 아래 쓰기 필드가 없다. API key JWT와 저장된 cookie 모두 확인했으며 cookie는 만료 상태다. Chrome/in-app Browser/Computer Use 연결도 현재 런타임에서 제공되지 않았다.

1. App Privacy 설문과 Publish
   - 보수적 대상: Fitness, Health, Photos or Videos, Audio Data, Other User Content
   - 모두 App Functionality, Data Not Linked to You, Tracking 없음
   - HealthKit on-device records 자체는 network collection에 포함하지 않는다.
2. DSA trader/non-trader self-declaration
   - EU 27은 모두 `TRADER_STATUS_NOT_PROVIDED`; Europe 제외와 별개로 선언 필요
3. Regulated Medical Device = `No`
4. iPhone-only 출시를 위한 Mac/Vision availability toggle readback 및 필요 시 disable
5. Tax Category live selection/readback

새 Apple ID web/cookie session 또는 실제 계정 비밀번호 + 2FA 세션이 필요하다. app-specific password는 `apple-utils login`에 실패했고 대체물이 아니다.

## 공개 서비스 상태와 Cloudflare gate

- `reploom.pages.dev` / `reploom.app`: 현재 DNS 없음; Pages project도 없음
- ASC의 Support/Privacy/Privacy Choices/Marketing URL: null 유지 중
- live Worker version: `1aef7442-2f7c-4af3-859b-649205f2f906` 100%; 구형 Gemini/Groq/rank/evolve 코드라 출시 후보가 아님
- 후보 Worker: source tests 14/14, normal/safe dry-run 통과, Build 13 client marker 있음
- 배포 전 상태: `/tmp/reploom-worker-pre-20260713T0544Z.json`
- 정책 문구는 후보 Worker observability disabled가 **배포·검증 후에만 운영 사실**이라고 조건부로 기록함

Cloudflare Worker/Pages upload는 승인 심사기가 “리포 코드와 정적 파일을 확인되지 않은 외부 대상에 업로드”로 막았다. 우회하거나 재시도하지 말고 사용자가 다음 범위를 명시적으로 승인한 뒤 실행한다:

`Cloudflare에 이 리포의 Worker 코드와 website 정적 파일 업로드를 승인한다`

승인 후 immutable Worker upload → safe version 0% smoke → normal version 승격, rollback ID 기록, Pages project를 정확히 `reploom`으로 생성해 `https://reploom.pages.dev`를 확보한다. `/`, `/privacy`, `/support`, `/terms`, `/data`의 HTTPS 200과 모바일/데스크톱 렌더를 확인한 뒤에만 ASC URL을 입력한다.

## 새 Release UI 검증

- Native Release arm64 simulator build 성공, app path `/tmp/ReploomSimBuild/Build/Products/Release-iphonesimulator/Reploom.app`
- Simulator: iPhone 17 Pro Max, iOS 26.5, 1320×2868
- Seed: 5 sessions / open 1 / 20 sets / 1 cardio / 3 foods / locale en
- SQLite: foreign-key error 0, integrity `ok`
- 육안 확인: Today, Log, sportswear front body map, Chest recommendation sheet, History, Power, Settings Remote AI `OFF`
- Maestro 실제 동작: chest tap → recommendation sheet; `bench` 입력 → Barbell Bench Press + last set context
- App Store 5장 원본 육안 검수 및 Apple `COMPLETE` readback 완료
- 공개 HTML은 local HTTP 200과 상대 링크/fragment 검사는 통과했지만 Browser 런타임 부재로 mobile/desktop 시각 렌더 미검증

## 기계 검증

- `npm run typecheck`: 통과
- `npm run lint`: 통과
- `npm test -- --runInBand`: 45 suites / 294 tests 통과
- `npm --prefix worker test`: 14 tests 통과
- `npx eas metadata:lint`: 통과, screenshots 경로 포함
- `git diff --check`: 통과
- dependency 변경 없음; 변경 파일 비밀정보 검사 통과

## 다음 실행 순서

1. Cloudflare 범위 승인 확보 후 Worker safe/normal immutable 배포와 Pages 공개, live rollback/readback 기록
2. 정책 페이지 mobile/desktop 시각 QA, exact URL HTTPS 200 확인
3. fresh ASC web session으로 App Privacy publish, DSA, Medical Device No, Mac/Vision, Tax Category 처리·readback
4. `store.config.json`의 4개 URL을 ASC에 push하고 다시 읽기
5. 기존 Review Submission draft에 version 1.0 item 추가
6. 모든 blocker가 닫힌 뒤에만 `submitted=true`; state가 `WAITING_FOR_REVIEW`인지 readback
7. 외부 상태 변경을 체크리스트에 기록하고 commit + dual-write + push

## 하드 규칙

- `CLAUDE.md`, `~/.claude/PLAYBOOK.md`, `docs/overdrive-spec.md` 준수
- TypeScript strict, 새 의존성 금지, 스킨 토큰만
- §5 오리지널 IP, §6 저장 우선·로깅 비차단, §7 그래픽 히어로, §9 반수치심
- UI 변경은 Release simulator + 실사용 DB seed + 원본 screenshot 육안 검증 없이는 출고 금지
- Europe/China mainland 포함, 결제, 사용자 데이터 삭제, 허위 법적 선언은 현재 범위 밖
