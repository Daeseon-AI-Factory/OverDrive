# Reploom (OverDrive) — 세션 핸드오프 (2026-07-13)

다른 에이전트가 App Store 제출 작업을 그대로 이어받기 위한 현재 상태다. 추측하지 말고 아래 ID와 live readback을 다시 확인한 뒤 진행한다.

## 한 줄 상태

브랜치 `codex/usability-cockpit`의 출시 후보는 GitHub에 push돼 있다. **Build 13은 App Store Connect에서 `VALID` / `APP_STORE_ELIGIBLE`이고 version 1.0에 연결돼 있으며, Worker와 정책 사이트도 production에 배포됐다.** Privacy/Support/Privacy Choices/Marketing URL 네 개는 저장·readback됐지만 private 설문이 남아 Review Submission item 추가가 여전히 `409 STATE_ERROR.ENTITY_STATE_INVALID`로 차단됐고 아직 심사 제출되지 않았다.

## 현재 Git / 산출물

- 브랜치: `codex/usability-cockpit`
- 원격: `https://github.com/Daeseon-AI-Factory/OverDrive.git`
- 출시 자산 커밋: `ca82eb4 docs(release): prepare App Store submission assets`
- dual-write 로그: `fafe712 docs(log): record for ca82eb4 [no-log]`
- 핸드오프 갱신: `29fe123 docs(handoff): refresh App Store submission state`
- dual-write 로그: `b9ddda1 docs(log): record for 29fe123 [no-log]`
- 이 운영 상태 기록 전 원격 HEAD: `b9ddda16ebe3fbef67ed969b0cd9b0897b85671d`; 이후에는 체크아웃의 `git rev-parse HEAD`를 정본으로 사용한다.
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
- live URL readback:
  - Marketing: `https://reploom.pages.dev/`
  - Support: `https://reploom.pages.dev/support`
  - Privacy Policy: `https://reploom.pages.dev/privacy`
  - Privacy Choices: `https://reploom.pages.dev/data`
- URL 네 개 입력 뒤에도 Review item POST는 `409 STATE_ERROR.ENTITY_STATE_INVALID`; item 0과 submitted date null 유지

## 아직 닫히지 않은 Apple private gate

공개 App Store Connect API v4.4에는 아래 쓰기 필드가 없다. 사용자는 Chrome에서 ASC 로그인을 완료했다. Chrome은 실행 중이고 ChatGPT Chrome Extension과 native host도 설치·활성·정상으로 진단됐지만, browser control 채널은 `Browser is not available: extension`으로 연결되지 않았다. 새 Chrome 창을 여는 복구 동작은 사용자 명시 허가가 필요하다.

1. App Privacy 설문과 Publish
   - 보수적 대상: Fitness, Health, Photos or Videos, Audio Data, Other User Content
   - 모두 App Functionality, Data Not Linked to You, Tracking 없음
   - HealthKit on-device records 자체는 network collection에 포함하지 않는다.
2. DSA trader/non-trader self-declaration
   - EU 27은 모두 `TRADER_STATUS_NOT_PROVIDED`; Europe 제외와 별개로 선언 필요
3. Regulated Medical Device = `No`
4. iPhone-only 출시를 위한 Mac/Vision availability toggle readback 및 필요 시 disable
5. Tax Category live selection/readback

현재 로그인된 Chrome web session을 browser control에 연결하거나 실제 계정 비밀번호 + 2FA 세션이 필요하다. app-specific password는 `apple-utils login`에 실패했고 대체물이 아니다.

## 공개 서비스 live 상태와 롤백

- 사용자가 Cloudflare Worker 코드와 `website/` 정적 파일 업로드를 명시적으로 승인했다.
- Worker URL: `https://overdrive-quicklog.daeseon.workers.dev`
- normal version: `dee65f64-88ee-491f-962f-f9b686bfd561`, 100%
- safe-degraded rollback version: `33abed25-1f2e-497f-8580-72b29e267840`
- current deployment: `9c686a48-0b0f-4c52-b7cc-a3fac00c9c8f`
- 금지 롤백: pre-v1 `1aef7442-2f7c-4af3-859b-649205f2f906`; ID 없는 `wrangler rollback`도 금지
- 명시 롤백:
  `cd worker && npx wrangler versions deploy 33abed25-1f2e-497f-8580-72b29e267840@100% --name overdrive-quicklog --message "Activate safe-degraded rollback" --yes`
- 정상 복구:
  `cd worker && npx wrangler versions deploy dee65f64-88ee-491f-962f-f9b686bfd561@100% --name overdrive-quicklog --message "Promote Reploom v1" --yes`
- normal 0% override smoke: `/parse` 200 structured set, markerless `/parse` 403, `/rank/delete` invalid input 400, retired routes 410
- live smoke: 위와 같은 200/403/400/410; `/rank/submit`, `/rank/board`, `/evolve`, `/body-avatar` 모두 normal과 safe에서 410
- remote settings: `logpush=false`, `observability=null`(미활성), `tail_consumers=null`; rate limiter 30 cost tokens / 60s
- Worker tests 14/14와 normal/safe dry-run 통과. Groq text parse는 live 성공했지만 audio/photo 성공 경로와 account-level Groq spend cap은 미검증
- 기존 `GEMINI_API_KEY` secret 이름은 계정에 남아 있으나 현재 normal/safe 소스에는 사용 경로가 없다.
- Wrangler의 만료된 OAuth 자격 증명이 내부 명령 출력에 노출됐고 repo/commit에는 들어가지 않았다. 새 OAuth 로그인으로 교체했으며 이전 Cloudflare authorization은 출시 후 폐기 대상으로 취급한다.

- Pages project: `reploom`, production URL `https://reploom.pages.dev`
- production deployment: `1798ec5a-4134-4b02-b553-b00f6ea7e720`, branch `main`, source `b9ddda1`
- preview deployment: `21bfe398-a8f2-4461-90c0-24fd1eeec7f7`, branch `release-v1`
- `/`, `/privacy`, `/support`, `/terms`, `/data`: production HTTPS 200, redirect 없음, title/contact 기대값과 로컬 파일 SHA-256 일치
- iPhone 17 Pro Max Safari에서 preview home/privacy와 production privacy를 원본 screenshot으로 육안 확인했다. 넓은 화면 WebKit 확인용 iPad Safari open은 timeout이어서 desktop visual QA는 미완료다.
- 첫 production deployment라 이전 production rollback ID는 없다. preview는 rollback 대상이 아니며, 다음 정상 production 배포 뒤부터 직전 production ID를 롤백 대상으로 기록한다.

## 새 Release UI 검증

- Native Release arm64 simulator build 성공, app path `/tmp/ReploomSimBuild/Build/Products/Release-iphonesimulator/Reploom.app`
- Simulator: iPhone 17 Pro Max, iOS 26.5, 1320×2868
- Seed: 5 sessions / open 1 / 20 sets / 1 cardio / 3 foods / locale en
- SQLite: foreign-key error 0, integrity `ok`
- 육안 확인: Today, Log, sportswear front body map, Chest recommendation sheet, History, Power, Settings Remote AI `OFF`
- Maestro 실제 동작: chest tap → recommendation sheet; `bench` 입력 → Barbell Bench Press + last set context
- App Store 5장 원본 육안 검수 및 Apple `COMPLETE` readback 완료
- 공개 HTML은 local 링크/fragment 검사와 production HTTPS 200/바이트 일치 통과. iPhone Safari 모바일 렌더는 육안 확인했고 desktop 렌더는 미검증

## 기계 검증

- `npm run typecheck`: 통과
- `npm run lint`: 통과
- `npm test -- --runInBand`: 45 suites / 294 tests 통과
- `npm --prefix worker test`: 14 tests 통과
- `npx eas metadata:lint`: 통과, screenshots 경로 포함
- `git diff --check`: 통과
- dependency 변경 없음; 변경 파일 비밀정보 검사 통과
- Worker live: normal version 100% readback, Groq parse 200, client marker 403, legacy delete validation 400, retired route 410
- Pages live: 5개 extensionless 경로 200, 로컬 파일과 byte hash 일치, iPhone Safari production Privacy 렌더 확인
- ASC live: URL 네 개 readback 성공; Review item 0, POST 409, `WAITING_FOR_REVIEW` 미도달

## 다음 실행 순서

1. 사용자 허가를 받아 로그인된 프로필의 새 Chrome 창을 열고 extension 연결을 한 번 재시도
2. ASC web UI에서 App Privacy publish, DSA, Medical Device No, Mac/Vision, Tax Category 처리·readback
3. 정책 페이지 desktop 시각 QA; 모바일과 HTTPS/바이트 검사는 완료
4. 기존 Review Submission draft에 version 1.0 item 추가
5. 모든 blocker가 닫힌 뒤에만 `submitted=true`; state가 `WAITING_FOR_REVIEW`인지 readback
6. audio/photo AI 성공 경로와 Groq account spend cap은 출시 전 별도 확인
7. 외부 상태 변경을 체크리스트에 기록하고 commit + dual-write + push

## 하드 규칙

- `CLAUDE.md`, `~/.claude/PLAYBOOK.md`, `docs/overdrive-spec.md` 준수
- TypeScript strict, 새 의존성 금지, 스킨 토큰만
- §5 오리지널 IP, §6 저장 우선·로깅 비차단, §7 그래픽 히어로, §9 반수치심
- UI 변경은 Release simulator + 실사용 DB seed + 원본 screenshot 육안 검증 없이는 출고 금지
- Europe/China mainland 포함, 결제, 사용자 데이터 삭제, 허위 법적 선언은 현재 범위 밖
