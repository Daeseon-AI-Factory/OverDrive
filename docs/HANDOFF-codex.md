# Reploom (OverDrive) — 세션 핸드오프 (2026-07-13)

다른 에이전트가 결제 플랫폼 연동과 이후 App Store 재제출을 이어받기 위한 현재 상태다.
추측하지 말고 아래의 local/source/live 경계를 먼저 확인한다.

## 한 줄 상태

무료 Build 13은 Apple에서 `VALID` / `APP_STORE_ELIGIBLE`이지만, 심사 큐 진입 뒤 Reploom Pro를 준비하기 위해 철회됐다. Review submission은 `COMPLETE`, item은 `REMOVED`, version 1.0은 `DEVELOPER_REJECTED`로 읽혔다. **Build 14는 StoreKit/구독/AI·사진 쿼터를 꽂을 수 있게 만든 로컬 integration candidate일 뿐이며 TestFlight 업로드·version 연결·재심사를 하지 않았다.** 현행 production Worker와 Pages는 아래에 기록한 Build 13 세대 배포 그대로이고 이번 subscription source는 미배포다.

## 이번 범위와 명시적 비범위

- 포함: custom StoreKit 2 adapter, subscription provider/paywall/restore/manage seam, 구매 전
  18+ remote-AI consent guard, 월 1,000 credits / 60 meal-photo 계약, authenticated short Worker
  session, idempotent reservation/refund/attempt cap/deletion/cleanup source, simulator-only active/quota
  fixture, 정책·스토어 문구.
- 제외: 별도 결제 백엔드 플랫폼 연동, Apple IAP key/Worker secrets, remote D1 migration, Cron
  deployment, Worker traffic promotion, 실제 purchase/renew/refund/restore, physical-device Sandbox,
  TestFlight upload, subscription metadata 마감, App Review 재요청.
- 따라서 이 handoff의 “통과”는 결제 연동 기반의 local/source 검증을 뜻한다. 월 구독이 실제로
  청구되거나 production entitlement가 동작한다는 뜻이 아니다.

## 현재 Git / 산출물

- 브랜치: `codex/usability-cockpit`
- 원격: `https://github.com/Daeseon-AI-Factory/OverDrive.git`
- 이번 작업 시작 base/원격 HEAD: `afb6ac5a424bb3527d125393d78ac0167402ebf3`.
- Build 14 결제 기반 구현 커밋은 이 handoff와 같은 변경 단위다. 인계 시 체크아웃의
  `git rev-parse HEAD`와 뒤따르는 `docs(log): record for <hash> [no-log]`를 정본으로 사용한다.
- 의도된 유일한 미커밋 변경: `docs/troubleshooting.md`의 다음 marker 한 줄
  `<!-- skipped: af57b8c docs: session handoff briefing for next agent [no-log] -->`
- App Store 원본: `docs/artifacts/app-store-v1/`의 5개 1320×2868 PNG
- 스토어 정본: `store.config.json`
- IPA: `/tmp/Reploom-13-export-local-account/Reploom.ipa`
- IPA SHA-256: `72e97bcc23796f2cf637214b9d8c68bc908501d0ea3bf29e1edc0a65e7c3a24c`
- Build 14 local Release simulator app:
  `/tmp/ReploomStoreKitQABuild14/Build/Products/Release-iphonesimulator/Reploom.app`
- 육안 검증 캡처: `/tmp/Reploom-14-normal.png`,
  `/tmp/Reploom-14-subscription-paywall.png`, `/tmp/Reploom-14-subscription-active-card.png`,
  `/tmp/Reploom-14-quota-current.png` (임시 산출물; production/TestFlight 증거 아님).

커밋 전 marker를 제거하고, 구현 커밋 뒤 `docs/troubleshooting.md` + 새 `content/logs/OverDrive/*.mdx`를 작성해 `docs(log): record for <hash> [no-log]`로 별도 커밋한 다음 marker를 다시 unstaged로 복원한다.

## App Store Connect live 상태

- App ID: `6786831176`; bundle: `ai.daeseon.reploom`
- Version 1.0 ID: `6d40b6b7-eb2c-413b-a907-90829331c594`
- Build 13 ID: `60e4f17c-e5a9-4cba-93f9-0554a50b543c`
- Review Submission `72f01614-39bb-4b0e-95e7-a3810e5fbb97`: 무료 Build 13으로
  `WAITING_FOR_REVIEW`까지 갔다가 철회; 최종 state `COMPLETE`, item `REMOVED`, version 1.0
  `DEVELOPER_REJECTED`.
- Build 13: `VALID`, `APP_STORE_ELIGIBLE`, min iOS 16.4, non-exempt encryption false
- Build 14: local simulator build만 존재. Apple upload/build ID/version 연결/submission 없음.
- Version: Build 13을 이전 후보로 연결했던 기록, manual release, `usesIdfa=false`, copyright
  `2026 Daeseon Yoo`; 재제출에는 Build 14 이상과 첫 subscription을 다시 선택해야 한다.
- Category: `HEALTH_AND_FITNESS`; content rights: `USES_THIRD_PARTY_CONTENT`
- Age rating: global 4+, Health/Wellness yes, Age Assurance yes, Contests no, 나머지 공개 항목 none/no
- Review contact·notes·demo-account-not-required 입력 및 readback 완료
- Screenshots: en-US `APP_IPHONE_67` 5장 모두 `COMPLETE`, 순서 Today → Explore → Chest recommendations → History → Power
- 가격: USA base, manual 1 + automatic 174 모두 customer price/proceeds 0
- 지역: 전체 175 = 판매 132 + 제외 43, preorder 0, 신규 storefront 자동 포함 false
- 제외: EU 27 + 기타 유럽 15 + China mainland; Hong Kong/Macau/Taiwan 포함
- Korea e-Commerce Act: 사용자 제공 readback `Active`, last updated 2026-06-16
- Subscription group `22233430`; monthly product `6790532250` /
  `ai.daeseon.reploom.pro.monthly.v1`; Family Sharing off; no introductory offer; current product
  state `MISSING_METADATA`.
- USA $4.99와 동일한 132개 판매 storefront 가격 row는 earlier ASC readback 완료. 이는 앱/Worker
  결제 연동 또는 제출 완료의 증거가 아니다.
- live URL readback:
  - Marketing: `https://reploom.pages.dev/`
  - Support: `https://reploom.pages.dev/support`
  - Privacy Policy: `https://reploom.pages.dev/privacy`
  - Privacy Choices: `https://reploom.pages.dev/data`
- URL 네 개는 Build 13 제출 때 사용됐다. 현재는 철회 후 replacement submission이 없다.

## 아직 닫히지 않은 Apple private gate

아래 항목은 payment-platform integration과 재제출 시 ASC에서 다시 읽어야 한다. 이번 로컬
기반 공사에서 변경하거나 완료 처리하지 않았다.

1. App Privacy 설문과 Publish
   - 보수적 대상: Fitness, Health, Photos or Videos, Audio Data, Other User Content
   - 모두 App Functionality, Data Not Linked to You, Tracking 없음
   - HealthKit on-device records 자체는 network collection에 포함하지 않는다.
2. DSA trader/non-trader self-declaration
   - EU 27은 모두 `TRADER_STATUS_NOT_PROVIDED`; Europe 제외와 별개로 선언 필요
3. Regulated Medical Device = `No`
4. iPhone-only 출시를 위한 Mac/Vision availability toggle readback 및 필요 시 disable
5. Tax Category live selection/readback

## 공개 서비스 live 상태와 롤백

- 사용자가 Cloudflare Worker 코드와 `website/` 정적 파일 업로드를 명시적으로 승인했다.
- 아래 ID는 **기존 Build 13 세대 production**이다. 이번 subscription Worker/website diff는
  업로드·migration·trigger deploy·traffic promotion하지 않았다.
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
- 기존 live Worker는 당시 tests 14/14와 normal/safe dry-run을 통과했다. Groq text parse는
  live 성공했지만 audio/photo 성공 경로와 account-level Groq spend cap은 미검증이다.
- 기존 `GEMINI_API_KEY` secret 이름은 계정에 남아 있으나 현재 normal/safe 소스에는 사용 경로가 없다.
- Wrangler의 만료된 OAuth 자격 증명이 내부 명령 출력에 노출됐고 repo/commit에는 들어가지 않았다. 새 OAuth 로그인으로 교체했으며 이전 Cloudflare authorization은 출시 후 폐기 대상으로 취급한다.

- Pages project: `reploom`, production URL `https://reploom.pages.dev`
- production deployment: `1798ec5a-4134-4b02-b553-b00f6ea7e720`, branch `main`, source `b9ddda1`
- preview deployment: `21bfe398-a8f2-4461-90c0-24fd1eeec7f7`, branch `release-v1`
- `/`, `/privacy`, `/support`, `/terms`, `/data`: production HTTPS 200, redirect 없음, title/contact 기대값과 로컬 파일 SHA-256 일치
- iPhone 17 Pro Max Safari에서 preview home/privacy와 production privacy를 원본 screenshot으로 육안 확인했다. 넓은 화면 WebKit 확인용 iPad Safari open은 timeout이어서 desktop visual QA는 미완료다.
- 첫 production deployment라 이전 production rollback ID는 없다. preview는 rollback 대상이 아니며, 다음 정상 production 배포 뒤부터 직전 production ID를 롤백 대상으로 기록한다.

## 새 Release UI 검증

- Build 14 Native Release arm64 simulator incremental build `BUILD SUCCEEDED`, app path
  `/tmp/ReploomStoreKitQABuild14/Build/Products/Release-iphonesimulator/Reploom.app`.
- final app readback: bundle `ai.daeseon.reploom`, version `1.0`, build `14`, 5,433,653-byte
  `main.jsbundle`; `ReploomStoreKitModule.swift`는 Release dependency/Swift file list에 포함.
- Simulator: iPhone 17 Pro Max, iOS 26.5, screenshot 944×2048
- Seed: 5 sessions / open 1 / 20 sets / 1 cardio / 3 foods / locale en
- SQLite: schema 6, integrity `ok`; install 전후 위 seed count 동일.
- 육안 확인: 현실적 Today/open workout, free Pro card, purchase disclosure, remote-AI 18+ consent
  copy, simulator-only active usage `412/1000` + `18/60`, exhausted quota `1000/1000` + `60/60`.
- normal simctl launch에서는 StoreKit Test price가 주입되지 않아 `Loading the App Store price…` /
  `Subscription unavailable`가 표시됐다. 실제 localized $4.99 product loading 증거로 쓰지 않는다.
- manual/local logging은 화면에 유지됐지만 구독 미가입/소진 상태에서 새 기록을 끝까지 저장한
  product workflow는 이번 캡처에서 재실행하지 않았다.

## 기계 검증

- `npm run typecheck`: 통과
- `npm run lint`: 통과
- `npm test -- --runInBand`: 50 suites / 351 tests 통과
- `cd worker && npm test`: 42 tests 통과
- `git diff --check`: 통과
- dependency 변경 없음; 변경 파일 비밀정보 검사 통과
- focused subscription test: provider/worker-client/native-plugin 44/44 통과; full 351에 포함.
- AppTransaction `shared` 실패 시 `refresh()` 1회 fallback을 포함한 최종 Swift가 Release compile.
- live Worker/Pages/ASC에는 이번 변경을 쓰지 않았다.

## 다음 실행 순서

1. 이번 local/source 변경을 implementation commit → dual-write log commit 순으로 만들고
   `codex/usability-cockpit`에 push한다.
2. 별도 결제 플랫폼에서 entitlement API/credential ownership을 정한 뒤 Apple IAP key와 Worker
   secret을 설치한다. identity secret은 첫 paid user 전에 외부 backup하고 이후 회전 금지.
3. remote D1 migration → immutable normal/safe upload at 0% → version smoke → real-device
   Sandbox purchase/session/quota/restore를 확인한다. 그 전에는 production traffic을 바꾸지 않는다.
4. normal version을 명시적 ID로 승격한 뒤 matching config의 Cron trigger를 별도로 deploy/readback한다.
5. StoreKit Test localized price/cancel/pending, Ask to Buy, signed-out/offline, Billing Grace policy,
   App Privacy Product Interaction, Groq spend cap과 unit economics를 닫는다.
6. Build 14+ archive/IPA를 scan·upload하고 subscription metadata/ASC private gate를 완료한 뒤에만
   새 review item을 추가한다. 최종 state `WAITING_FOR_REVIEW`를 readback한다.

## 하드 규칙

- `CLAUDE.md`, `~/.claude/PLAYBOOK.md`, `docs/overdrive-spec.md` 준수
- TypeScript strict, 새 의존성 금지, 스킨 토큰만
- §5 오리지널 IP, §6 저장 우선·로깅 비차단, §7 그래픽 히어로, §9 반수치심
- UI 변경은 Release simulator + 실사용 DB seed + 원본 screenshot 육안 검증 없이는 출고 금지
- 결제 연동 기반 source는 이번 범위다. 실제 결제 플랫폼, Apple key, Cloudflare 배포/migration,
  production entitlement, TestFlight, 재심사, Europe/China mainland 포함, 허위 법적 선언은 범위 밖이다.
