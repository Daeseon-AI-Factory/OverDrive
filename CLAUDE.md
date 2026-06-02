# OVERDRIVE

실제 운동 데이터(헬스킷/헬스커넥트 + 근력 로깅 + 체성분 + 체력 테스트)를 게임화된 **전투력(Combat Power)** 점수로 환산하고, **기록할 때마다 GPU 한계까지 폭발하는 뽕맛 피드백 + 오라 카드**로 운동을 중독적이게 만드는 앱.

- **1차 유저:** 빌더 본인(dogfooding). 성공 기준 = "내가 매일 쓰고 운동에 도움 + 기록할 때마다 개꼴림."
- **현재 단계:** Phase 1 — 로컬 MVP (백엔드 없이 온디바이스).
- **전체 빌드 스펙:** [`docs/overdrive-spec.md`](docs/overdrive-spec.md)가 정본(canonical). 2026-06-01에 대화로 합의된 OVERDRIVE 빌드 스펙을 박제. 코드보다 이 문서가 우선.

---

## Project log (required, dual-write)

> 이 섹션은 `.claude/hooks/stop-check.sh` Stop 훅이 참조한다. **비-사소(non-trivial) 변경마다 두 파일에 동시 기록(dual-write).** 세션은 사라진다 — 검증된 기록만 남는다. 신뢰가 아니라 **강제(hook)** 로.

### 두 파일 (둘 다 쓴다)

1. **`docs/troubleshooting.md`** — 문제 인덱스, 간결. 한 엔트리 = `Symptom · Cause · Fix · Commit · (optional Pattern)`. 실제 버그/이슈와 그 픽스 전용. 최신 항목을 아래에 추가.
2. **`content/logs/OverDrive/<YYYY-MM-DD>-<short-slug>.mdx`** — 날짜 인덱스 내러티브. 아래 frontmatter 필수.

> 판단: 사소한 버그/픽스는 둘 다. 결정/회고/전략 같은 "버그 아님"은 내러티브(`content/logs`)가 주 거처고, troubleshooting.md엔 억지 Symptom을 **날조하지 않는다**(규칙 1·2). 단 훅을 통과하려면 커밋 해시가 두 파일 중 **하나엔 반드시** 존재해야 한다.

### .mdx frontmatter 템플릿

```mdx
---
title: "<제목>"
date: "2026-06-01"          # 항상 따옴표 친 문자열. 커밋이면 git log -1 --format=%cI 기준, 전망형 결정이면 세션 시작일.
project: "OverDrive"
kind: "update"               # troubleshoot | tech-retro | ux-retro | business | monetization | update | decision
visibility: "public"         # public | unlisted | private
language: "ko"               # ko | en
summary: "<한 줄 요약>"
tags: ["phase-1", "..."]
---

<본문 — 내러티브. 구체적 사실 우선, 결론 설교 금지.>
```

### Visibility 기본값

- `business` · `monetization` → **`private`**
- 그 외 전부 → **`public`** (민감하면 명시적으로 `unlisted`/`private`)

### 7대 안티-할루시네이션 규칙 (타협 없음)

1. **Symptom은 문자 그대로.** 실제 에러/출력을 펜스 코드블록에 붙여넣는다. 의역 금지.
2. **Cause는 검증된 것만.** 실제 코드/커맨드 출력에서 관찰한 것만. 미검증이면 `Hypothesis: … / Verified by: …` 포맷.
3. **Fix는 실제 파일명을 적는다.** `git diff`가 진실의 원천.
4. **커밋 해시는 커밋 후에.** `git rev-parse HEAD`로 사후 취득. 예측 해시 금지.
5. **날짜는 git에서.** 커밋: `git log -1 --format=%cI`. 전망형 결정: 세션 시작일.
6. **Pattern은 드물게.** 진짜 반복되는 교훈만. 일반론은 빼는 것만 못하다.
7. **지표 날조 금지.** "약 60초 — 실제로 60초를 봤다면." 정밀도는 타임스탬프가 있을 때만.

### 무엇을 로깅하나

- **로깅한다:** 빌드/배포 에러, 숨은 결합(hidden coupling), 의존성 마이그레이션, 아키텍처/인프라 결정, 판단으로 내린 디자인 선택, 전략/가격 메모.
- **안 한다:** 단순 리네임, lint 픽스, 오타, 동작 변화 없는 dep bump, 포매팅 커밋.

### 태그 & 오버라이드

- 진짜 사소한 커밋: 커밋 제목에 **`[no-log]`** 또는 `[skip-log]`. 트리거가 안 걸리면 훅이 `<!-- skipped: HASH SUBJECT -->`를 troubleshooting.md에 자동 기록하고 통과시킨다.
- **Positive trigger**(LOC>200 · 민감 경로 · 키워드)는 `[no-log]`를 **무시하고** 강제 블록한다. 진짜 오탐이면 troubleshooting.md에 사유와 함께:
  `<!-- override-trigger: HASH SUBJECT — 진짜 사유 -->` (무언 오버라이드 금지).

### Decision 엔트리 티어 (`kind: decision`)

- **T1 (substantial, ~20–30분):** Context & constraints · Goals (ranked) · Options considered (≥3, 'do nothing' 포함) · Trade-off accepted · Pre-mortem (6개월 뒤 실패 시나리오 3개) · Decision criteria to flip · Success measure · Reversal plan.
- **T2 (notable, ~5–10분):** Context · Options considered (≥2) · Chosen + Why · Trade-off · Reversibility · Verified by.

### 워크플로 (순서 고정)

1. 의미 있는 단위로 커밋한다.
2. `git rev-parse HEAD`로 해시 취득.
3. 해당 해시를 인용해 dual-write 엔트리 작성(위 7규칙 준수).
4. 로그 파일을 커밋한다 (보통 `[no-log]`, 또는 다음 작업 단위에 함께).

---

## OVERDRIVE — 사수 항목 (non-negotiables)

> 빌드 스펙 §0·§9. 매 세션 강제.

1. **Phase 순서대로 빌드.** 한 번에 다 X. 각 Phase 독립 실행/검증 + Acceptance Criteria 충족.
2. **TypeScript strict.** 프론트 = RN + Expo (dev client). 백엔드 = NestJS + PostgreSQL (단 **Phase 1은 백엔드 없이 온디바이스**).
3. **시크릿/키 절대 클라이언트 X.** STT/LLM 등 외부 키는 서버사이드. (AWS Secrets Manager)
4. **헬스 데이터 컴플라이언스:** 개인정보처리방침 필수 · 광고/마케팅/데이터마이닝/판매 금지(제3자 포함) · HealthKit 데이터 **iCloud 저장 금지** · 거짓 데이터 쓰기 금지 · 수집 타입 명시 · Android Health Connect는 읽고/쓰는 타입 전부 공개 선언 + 맥락 권한.
5. **오리지널 IP만.** 드래곤볼/사이어인/Limit Break/Final Fantasy 등 이름·디자인·에셋·콜아웃·사운드 금지. 오라/폭발/콜아웃("OVERDRIVE!", "REDLINE!", "MAX POWER!") 전부 자체 제작.
6. **JUICE는 절대 마찰이 되면 안 된다.** T1–T2는 ≤0.4~0.6s·비동기·스킵 가능, 로깅을 1ms도 안 막음. 큰 연출(T3 OVERDRIVE / T4 슈퍼노바)은 PR·완료에만 아껴 쓴다. **로깅 속도 > 화려함.**
7. **그래픽은 히어로다 — Skia/SkSL 한계까지.** SkSL 커스텀 셰이더 직접 작성 + ShaderToy GLSL 포팅. "그럭저럭"은 실패. (3D R3F/WebGPU 레이어는 Phase 3.) 단 위 6번 철칙 사수.
8. **전투력 = 재미용 자체 산식 (과학적 지표 아님)** — UI에 라벨 필수.
9. **반수치심:** 하이프는 "전투력이 올랐다/나타났다"를 축하하지 낮은 숫자 조롱 X. 컨디션 나빠도 나타나면 (작은) T1 팝은 준다. 체지방/외형은 건강·향상 프레임.
10. **경쟁은 향상/꾸준함 기준**(초보·여성도 이김) + 검증 데이터 가중(trust-tiering, 치트 방지) + opt-out.
11. **브랜드 가용성:** "OverDrive"는 흔한 단어 + 기존 브랜드 존재. 출시 전 상표·앱스토어 이름·도메인·핸들 검증 필수.
12. **큰 아키텍처 변경 전 사용자 확인.** 모호/결정 필요 시 질문.

## 코드 컨벤션 (§10)

TypeScript strict + ESLint/Prettier · 백엔드 레이어 분리(controller/service/repository) + DTO 검증 + 도메인 인가 가드 · 외부 API(STT/LLM/헬스)는 try/catch+타임아웃+폴백 · 핵심 로직(전투력 계산, JUICE 티어 판정, 리그 랭킹, 로깅 파싱) 단위 테스트 · 헬스/카메라/Skia는 Expo dev client 필요 · 마이그레이션 기반 스키마 + Exercise 시드.
