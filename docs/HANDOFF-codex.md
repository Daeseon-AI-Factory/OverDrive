# Reploom (OverDrive) — 세션 핸드오프 (2026-07-15)

다른 에이전트가 결제 플랫폼 연동과 이후 App Store 재제출을 이어받기 위한 현재 상태다.
추측하지 말고 아래의 local/source/live 경계를 먼저 확인한다.

## 한 줄 상태

무료 Build 13 심사는 Reploom Pro를 준비하기 위해 철회했다. **코드 후보 `c98e021`의 Build 15는 Apple validation/upload를 통과해 `VALID` / `APP_STORE_ELIGIBLE`이고 내부 TestFlight에서 `IN_BETA_TESTING`이다. production exercise catalog와 Release simulator 실사용 seed QA도 검증됐다.** 그러나 필수 Apple IAP/entitlement Worker secret 5개가 없어 subscription Worker·Cron·production traffic은 여전히 Build 13 세대다. 구독은 `MISSING_METADATA`이며 Build 15/version/구독 연결과 App Review 재제출은 하지 않았다.

## 이번 범위와 명시적 비범위

- 포함: custom StoreKit 2 adapter와 subscription source seam, production read-only exercise catalog,
  catalog-backed search/body-region/Quick Log, manual meal save/edit/undo, 구매 전 18+ remote-AI consent
  guard, 월 1,000 credits / 60 meal-photo 계약, authenticated short Worker session, idempotent
  reservation/refund/attempt cap/deletion/cleanup source, simulator-only active/quota fixture,
  정책·스토어 문구, remote D1 migration, Pages preview, Build 15 archive/export/Apple
  validation/TestFlight upload.
- 제외: 별도 결제 백엔드 플랫폼 연동, Apple IAP key/Worker secrets, Cron deployment,
  subscription Worker upload/traffic promotion, 실제 purchase/renew/refund/restore, physical-device
  Sandbox, subscription metadata 마감, Build/version/구독 연결, App Review 재요청.
- Build 15 `VALID`, catalog production 배포, D1 스키마 적용은 독립적으로 검증된 배포 단계다. 월 구독이 실제로
  청구되거나 production entitlement가 동작한다는 뜻은 아니다.

## 현재 Git / 산출물

- 브랜치: `codex/usability-cockpit`
- 원격: `https://github.com/Daeseon-AI-Factory/OverDrive.git`
- 현재 앱 코드 후보: `c98e021` (`expo.ios.buildNumber=15`). 최종 문서·dual-write log 커밋과
  원격 push는 `git status --short --branch` 및 `git log`로 다시 확인한다.
- 이 staging 작업의 이전 원격 HEAD: `3e38ca5`; D1 migration 수정: `b0ead93`, `7f4560d`.
- 인계 시 체크아웃의 `git rev-parse HEAD`와 뒤따르는
  `docs(log): record for <hash> [no-log]`를 정본으로 사용한다.
- 이 문서를 읽은 뒤 `git status --short --branch`로 실제 marker/미커밋 상태를 재확인한다.
- App Store 원본: `docs/artifacts/app-store-v1/`의 5개 1320×2868 PNG
- 스토어 정본: `store.config.json`
- Build 15 IPA: `/tmp/Reploom-15-export-local-account/Reploom.ipa` (35,692,630 bytes)
- Build 15 IPA SHA-256: `69cd59077d4b93f80cc36b5ce5e9ae774d15c8f2b1113801cf3e7c6bdeda2936`
- Build 15 ASC resource/delivery ID: `7123db21-dbc0-4126-8f30-5a7105278602`
- Build 15 Release simulator QA: `docs/artifacts/release-qa-build-15/`의 README와 11개
  1320×2868 원본 PNG. simulator 증거이며 TestFlight/결제/App Review 증거가 아니다.
- Build 14 historical IPA: `/tmp/Reploom-14-export-local-account/Reploom.ipa`; SHA-256
  `6ba9ebbf6523adb12ccc44942c6cfebcb7b8745a9bc3ffd1a1942bb1e37fe49a`; ASC ID
  `ad2c1d7a-74f9-4516-94be-0c3a226e15d6`.

커밋 전 marker를 제거하고, 구현 커밋 뒤 `docs/troubleshooting.md` + 새 `content/logs/OverDrive/*.mdx`를 작성해 `docs(log): record for <hash> [no-log]`로 별도 커밋한다. 마지막 marker 처리는 예전 handoff 문구를 추측하지 말고 현재 훅 출력과 `git diff`를 따른다.

## App Store Connect live 상태

- App ID: `6786831176`; bundle: `ai.daeseon.reploom`
- Version 1.0 ID: `6d40b6b7-eb2c-413b-a907-90829331c594`
- Build 13 ID: `60e4f17c-e5a9-4cba-93f9-0554a50b543c`
- Build 14 ID: `ad2c1d7a-74f9-4516-94be-0c3a226e15d6`
- Build 15 ID: `7123db21-dbc0-4126-8f30-5a7105278602`
- Review Submission `72f01614-39bb-4b0e-95e7-a3810e5fbb97`: 무료 Build 13으로
  `WAITING_FOR_REVIEW`까지 갔다가 철회; 최종 state `COMPLETE`, item `REMOVED`, version 1.0
  `DEVELOPER_REJECTED`.
- Build 13: `VALID`, `APP_STORE_ELIGIBLE`, min iOS 16.4, non-exempt encryption false
- Build 14: archive/export·Apple validation·upload 성공. `VALID`, `APP_STORE_ELIGIBLE`, min iOS
  16.4, non-exempt encryption false. version 1.0 연결/submission은 없음.
- Build 15: archive/export·Apple validation·upload 성공. `VALID`, `APP_STORE_ELIGIBLE`, min iOS
  16.4, non-exempt encryption false. `/appStoreVersion` relationship은 `data:null`이다.
- `Internal` group `0b3e2175-6e44-4667-b777-0331dd34fae1`은
  `hasAccessToAllBuilds=true`이고 Build 15를 포함한다. Build 15는
  `internalBuildState=IN_BETA_TESTING`, `externalBuildState=READY_FOR_BETA_SUBMISSION`, beta App
  Review `data:null`이다. 외부 beta/App Review 제출 증거가 아니며 실제 기기 설치·결제 증거도 아니다.
- Version 1.0은 `DEVELOPER_REJECTED`, manual release, `usesIdfa=false`, copyright
  `2026 Daeseon Yoo`며 Build 13이 아직 연결돼 있다. 재제출 전 검증된 최신 후보와 첫
  subscription을 선택해야 하며, 현재 기준 최신 후보는 Build 15다.
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
- Subscription App Review screenshot relationship은 `data:null`이다. 기존
  `/tmp/Reploom-14-subscription-paywall.png`는 `Loading the App Store price…` /
  `Subscription unavailable`을 노출하므로 제출 증거로 사용하지 말아야 한다.
- USA $4.99와 동일한 132개 판매 storefront 가격 row는 earlier ASC readback 완료. 이는 앱/Worker
  결제 연동 또는 제출 완료의 증거가 아니다.
- live URL readback:
  - Marketing: `https://reploom.pages.dev/`
  - Support: `https://reploom.pages.dev/support`
  - Privacy Policy: `https://reploom.pages.dev/privacy`
  - Privacy Choices: `https://reploom.pages.dev/data`
- URL 네 개는 Build 13 제출 때 사용됐다. 현재는 철회 후 replacement submission이 없다.

## 아직 닫히지 않은 Apple private gate

아래 항목은 payment-platform integration과 재제출 시 ASC에서 다시 읽어야 한다. Build 15
업로드가 이 private gate를 완료했다는 증거는 아니다.

1. App Privacy 설문과 Publish
   - Data Not Linked to You: Fitness, Health, Photos or Videos, Audio Data, Other User Content
   - Data Linked to You: Purchase History, User ID, Product Interaction
   - 8개 모두 App Functionality, Tracking 없음
   - HealthKit on-device records 자체는 network collection에 포함하지 않는다.
   - catalog Worker application logging은 꺼져 있지만, App Privacy Publish 전 Cloudflare
     platform security metadata가 real-time request 처리보다 오래 읽을 수 있는 형태로
     보관되는지 확인한다. 그렇다면 IP 사용 목적에 맞는 관련 data type을 추가한다.
2. DSA trader/non-trader self-declaration
   - EU 27은 모두 `TRADER_STATUS_NOT_PROVIDED`; Europe 제외와 별개로 선언 필요
3. Regulated Medical Device = `No`
4. iPhone-only 출시를 위한 Mac/Vision availability toggle readback 및 필요 시 disable
5. Tax Category live selection/readback

## 공개 서비스 live 상태와 롤백

- 사용자가 Cloudflare Worker 코드와 `website/` 정적 파일 업로드를 명시적으로 승인했다.
- 아래 Worker ID는 **기존 Build 13 세대 production**이다. 이번 subscription Worker source는
  업로드·trigger deploy·traffic promotion하지 않았다. D1 schema만 후방 호환으로 선반영했다.
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
- 구독 Worker의 필수 secret `APPLE_IAP_ISSUER_ID`, `APPLE_IAP_KEY_ID`,
  `APPLE_IAP_PRIVATE_KEY`, `ENTITLEMENT_IDENTITY_SECRET`, `ENTITLEMENT_SESSION_SECRET`는 모두
  없다. 비밀값 없이 새 Worker를 production으로 올리지 말아야 한다.
- Wrangler의 만료된 OAuth 자격 증명이 내부 명령 출력에 노출됐고 repo/commit에는 들어가지 않았다. 새 OAuth 로그인으로 교체했으며 이전 Cloudflare authorization은 출시 후 폐기 대상으로 취급한다.

### Production exercise catalog

- Public URL: `https://overdrive-catalog.daeseon.workers.dev/catalog/v1`
- D1 ID: `4bf0e085-56d8-405e-a7a7-333d5eeff03f`
- Worker version: `e19c7975-be71-456b-95cf-400c43703b2f`
- published `1.0.0`: 64 exercise rows, compact payload 66,654 bytes, SHA-256
  `43491e64b66fbd16f87325d8e8ea9e5d2325d888b71c700b61b80da19566604a`.
- live readback: exact payload HTTP 200, conditional GET 304, unknown path 404, unsupported method
  405. Catalog refresh is a public read-only GET; it does not send workout, meal, HealthKit,
  subscription, photo/audio, or app-generated identity data. Failure is non-blocking and falls back
  to the bundled catalog.

### D1 subscription schema

- 적용 전 Time Travel bookmark:
  `00000011-00000000-000050a8-07231d0a0b549a265063a2cdd4e1fea6`
- 적용 후 bookmark:
  `00000014-00000008-000050a8-925bc54e7df97b075ebfeda87c193cd0`
- 적용 전 export: `/tmp/overdrive-rank-pre-b5c170a.sql`
- `npm run d1:migrate:remote`로 14 queries / 24 rows written. `ai_*` 11개 = table 5,
  index 4, trigger 2; pending migration 없음.
- 기존 `rank_rows` 4개 유지, `quick_check=ok`, `foreign_key_check` 빈 결과.
- 로컬에서 성공하는 trigger migration이 Wrangler 4.110 remote query path에서
  `incomplete input: SQLITE_ERROR [code: 7500]`로 두 번 atomic rollback됐다. `7f4560d`는
  canonical SQL을 file-ingestion 경로로 원자적 적용하고 같은 파일명을 `d1_migrations`에
  기록하는 Node standard-library runner를 추가했다.

- Pages project: `reploom`, production URL `https://reploom.pages.dev`
- production deployment: `1798ec5a-4134-4b02-b553-b00f6ea7e720`, branch `main`, source `b9ddda1`
- 신규 source preview: `https://14bd35fa.reploom.pages.dev`, branch alias
  `https://codex-usability-cockpit.reploom.pages.dev`
- 신규 preview deployment ID: `14bd35fa-5d7b-41ce-aedc-65fb8baa5cc9`, source `7f4560d`.
- preview `/`, `/privacy`, `/support`, `/terms`, `/data`는 HTTPS 200, `x-robots-tag: noindex`,
  redirect 후 배포 당시 source `7f4560d`의 HTML/CSS SHA-256과 일치했다.
- `/`, `/privacy`, `/support`, `/terms`, `/data`: production source `b9ddda1` 기준 HTTPS 200,
  redirect 없음, title/contact 기대값과 배포 source SHA-256 일치.
- iPhone 17 Pro Max Safari에서 preview home/privacy와 production privacy를 원본 screenshot으로 육안 확인했다. 넓은 화면 WebKit 확인용 iPad Safari open은 timeout이어서 desktop visual QA는 미완료다.
- 2026-07-15의 catalog/manual-meal 정책 문구는 현재 working source에만 있고 위 production/
  preview deployment에는 없다. 이 세션의 Browser/Chrome 연결도 제공되지 않아 변경본 시각
  QA는 미완료다. 결제 integration과 모바일/데스크톱 시각 검증 전에는 재배포하지 않는다.
- 신규 Pages는 Pro 기능이 실제로 제공되는 것처럼 읽히므로 Worker/entitlement가
  없는 상태에서 production으로 승격하지 않았다. 기존 production ID를 유지한다.

## Release UI·제품 워크플로 검증

- 최종 Build 15 Release simulator app readback: bundle `ai.daeseon.reploom`, version `1.0`,
  build `15`; production Quick Log와 catalog endpoint가 bundle에 포함됐다.
- Simulator: iPhone 17 Pro Max, iOS 26.5, 원본 screenshot 1320×2868.
- 현실적 SQLite seed: schema 8, 5 sessions / open 1 / 20 sets / 1 cardio / 3 foods.
  최종 실제 터치 flow 뒤에도 위 count를 보존했고 `integrity_check=ok`, foreign-key error 0이다.
- catalog table/count readback: exercise/cache-bridge/localization/alias/equipment/region
  64/64/256/256/76/97. active version `1.0.0`, 66,654 bytes, exact SHA-256 일치.
- actual-touch QA: 현실적 Today/open workout, set save, sportswear body map, chest-region → Chest
  recommendations → Barbell Bench Press, per-side/total-reps semantics, plank fail-closed guard,
  Korean alias search, new trap-bar Quick Log, manual meal save/edit/undo. QA write는 검증된 baseline
  restore로 제거했다.
- 최종 Build 15 자체에서 Today → Explore → chest touch → Chest recommendations → Barbell Bench
  Press를 재실행했고 Maestro exit 0과 원본 screenshot `11-build-15-smoke.png`를 남겼다.
- Build 14에서 Pro card와 simulator-only active/quota fixture를 시각 확인한 이력은 유지되지만,
  normal simctl launch의 `Loading the App Store price…` / `Subscription unavailable` 캡처는 실제
  localized price 또는 StoreKit ownership 증거가 아니다.
- physical iPhone TestFlight/Sandbox purchase·restore·renewal·refund와 구독 미가입/소진 상태의
  모든 로깅 회귀는 아직 제품 검증되지 않았다.

## 기계 검증

- `npm run typecheck`: 통과
- `npm run lint`: 통과
- `npm test -- --runInBand`: 64 suites / 458 tests 통과
- `npm run catalog:validate`: 39/39 통과
- `cd worker && npm test`: 86/86 통과
- `git diff --check`: 통과
- dependency 변경 없음; 변경 파일 비밀정보 검사 통과
- focused subscription test는 전체 458에 포함된다.
- AppTransaction `shared` 실패 시 `refresh()` 1회 fallback을 포함한 최종 Swift가 Release compile.
- Build 15 device archive/export 성공. IPA에서 bundle `ai.daeseon.reploom`, version 1.0, build 15,
  arm64, min iOS 16.4, HealthKit entitlement, encryption false, StoreKit product ID/Worker endpoint를
  확인했고 퇴역 route/dev-client/secret 문자열은 검출되지 않았다.
- Apple 원격 validation/upload 통과; Build 15 `VALID` / `APP_STORE_ELIGIBLE`, 내부
  `IN_BETA_TESTING` readback.
- Pages preview와 remote D1은 신규 source를 쓰지만 production Worker/Pages는 기존 세대를
  유지한다.

검증 수준을 혼동하지 않는다.

- **Function verification**: 위 명령·Apple validation/upload·ASC readback·catalog HTTP
  200/304/404/405·Build 15 touch flow가 실제 실행됐다.
- **Quality verification**: strict TypeScript/lint와 64 suites/458, catalog 39/39, Worker 86/86,
  archive 문자열/metadata scan, 원본 1320×2868 screenshot 육안 검사가 통과했다. 로컬
  distribution trust-chain 검사는 Apple validation으로 대체했으며, 그것만으로 결제 품질을
  주장하지 않는다.
- **Product/workflow verification**: simulator의 body-region/search/set/Quick Log/manual-meal
  흐름과 baseline 복원은 검증됐다. physical-device TestFlight, subscription purchase/renew/
  refund/restore, production entitlement/quota, App Review는 미검증이다.

## 다음 실행 순서

1. 현재 Build 15 release-state 문서와 각 substantive commit의 dual-write log를 커밋하고
   `codex/usability-cockpit`에 push한 뒤 local/remote HEAD 일치를 읽는다.
2. 별도 결제 플랫폼에서 entitlement API/credential ownership을 정한 뒤 Apple IAP key와 Worker
   secret 5개를 설치한다. identity secret은 첫 paid user 전에 외부 backup하고 이후 회전 금지.
3. immutable subscription normal/safe Worker를 0% upload하고 version override smoke 후 normal을
   명시적 ID로 승격한다. matching config의 Cron trigger를 별도 deploy/readback한다.
4. 물리 iPhone TestFlight/Sandbox에서 purchase → entitlement session → quota → 재설치 restore를
   확인하고 미가입/소진 상태의 local logging이 막히지 않는지 확인한다.
5. 실제 localized price와 활성 Subscribe/Restore/Terms/Privacy가 보이는 truthful review
   screenshot을 올리고 Tax Category·private gate·subscription `READY_TO_SUBMIT`을 readback한다.
6. version 1.0을 Build 15로 바꾸고 첫 subscription을 같이 선택한 새 review submission만
   만든다. 최종 submit 후 submission과 version 둘 다 `WAITING_FOR_REVIEW`를 읽었을 때만
   심사 요청 완료로 기록한다.

## 하드 규칙

- `CLAUDE.md`, `~/.claude/PLAYBOOK.md`, `docs/overdrive-spec.md` 준수
- TypeScript strict, 새 의존성 금지, 스킨 토큰만
- §5 오리지널 IP, §6 저장 우선·로깅 비차단, §7 그래픽 히어로, §9 반수치심
- UI 변경은 Release simulator + 실사용 DB seed + 원본 screenshot 육안 검증 없이는 출고 금지
- Build 15 TestFlight upload는 완료됐지만 실제 결제 플랫폼, Apple key, subscription Worker production promotion, production
  entitlement, 재심사, Europe/China mainland 포함, 허위 법적 선언은 아직 미완료다.
