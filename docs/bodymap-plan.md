All facts verified. Key confirmations: no `react-native-svg` (Skia 2.6.2 + Reanimated 4.3.1 + gesture-handler 2.31.1 present), `colors` token names exact (cyan/magenta/violet/energyLo/energyHi/flash), `GRADES` 7-tier ladder with `min` bands, `useLogSet` hot path contract (`addSet → recompute → juice.fire → appendPowerEvent`, `loggedVia` optional), `getLastSetForExercise` exists. Now synthesizing the single plan.

---

# OVERDRIVE — 오늘(Today) 탭 재설계: 바디맵 캐릭터 + SetLogger v2 구현 플랜

> Phase 1, 온디바이스. 비-사수 사수: JUICE 비차단(§6.4), "재미용 자체 산식" 라벨(§6.3), 오리지널 IP(§9), 그래픽 히어로(§2/§6.4). 로깅 핫패스(`useLogSet`) 계약 불변.

---

## 1. 확정 접근

**렌더링: 절대 위치 `Pressable` RN View 휴머노이드 + 뒤에 Skia 오라. `react-native-svg`는 추가하지 않는다.**

근거 (이 레포 검증 완료):
- `package.json`에 `react-native-svg` **없음**. Skia `2.6.2`, Reanimated `4.3.1`, gesture-handler `2.31.1` 이미 설치 + Fabric/New Arch 강제 동작 중. svg 추가 = 새 Fabric 네이티브 모듈 + dev client 재빌드인데, **코어스 6부위(직사각형)** 에는 무가치.
- **히트테스트는 `Pressable`이 RN에서 가장 안정적.** svg path `onPress`/Skia 수동 point-in-shape보다 무조건 신뢰성↑. 빌더가 "너무 세부적으로 나누지 마라"라고 못 박음 → 코어스 = 직사각형 블록 = `Pressable`과 1:1.
- **Skia는 잘하는 것에만** — 피규어 뒤 CP 오라 글로우(§6.4 히어로 그래픽). 탭 가능한 골격은 View, 오라는 Skia. 둘 다 챙김.

**추가 의존성: 없음.** (모든 기능을 설치된 스택으로 커버.)

**티어 색은 `colors` 토큰에서만** (cyan/magenta/violet/energyLo/energyHi/flash 확인됨). 바디맵 글로우와 JUICE가 한 시스템처럼 읽히게.

---

## 2. 부위 분류 + 운동 매핑

TAXONOMY를 그대로 TS 상수로. **DB `muscle_group`/seed는 건드리지 않는다** — region은 UI 레이어. region 우선순위가 1개 운동 = 1개 부위(picker가 깔끔)가 되도록 PRIMARY mover로 해소(데드/RDL → legs, 풀업/로우/랫풀 → back).

```ts
// src/features/character/regions.ts
import { colors } from '@/ui/theme/tokens';

export type BodyRegionId = 'chest' | 'shoulders' | 'back' | 'arms' | 'core' | 'legs';
export type RegionSide = 'front' | 'back' | 'both';
export type BodyView = 'front' | 'back';

export interface RegionDef {
  labelKo: string;
  side: RegionSide;
  exerciseIds: string[];   // taxonomy의 명시 매핑 (PRIMARY mover로 해소됨)
  color: string;           // colors 토큰
}

export const REGIONS: Record<BodyRegionId, RegionDef> = {
  chest:     { labelKo: '가슴', side: 'front', color: colors.magenta,
    exerciseIds: ['barbell_bench_press', 'incline_db_press', 'cable_fly', 'dips'] },
  shoulders: { labelKo: '어깨', side: 'both',  color: colors.cyan,
    exerciseIds: ['overhead_press', 'lateral_raise', 'face_pull'] },
  back:      { labelKo: '등',   side: 'back',  color: colors.magenta,
    exerciseIds: ['pull_up', 'barbell_row', 'lat_pulldown'] },
  arms:      { labelKo: '팔',   side: 'both',  color: colors.violet,
    exerciseIds: ['db_curl', 'triceps_pushdown', 'hammer_curl'] },
  core:      { labelKo: '코어', side: 'front', color: colors.energyLo,
    exerciseIds: ['hanging_leg_raise', 'plank', 'cable_crunch'] },
  legs:      { labelKo: '하체', side: 'both',  color: colors.cyan,
    exerciseIds: ['barbell_back_squat', 'leg_press', 'bulgarian_split_squat',
      'deadlift', 'romanian_deadlift', 'leg_curl', 'standing_calf_raise', 'hip_thrust'] },
};

// 유산소는 몸 부위가 없다 → 피규어 밖 별도 칩. region으로 위장하지 않는다.
export const CARDIO_EXERCISE_IDS = ['hiit_intervals', 'zone2_run'] as const;

// 어느 view에 어느 region이 보이는가. side: 'both'는 양쪽 다 노출.
export const VIEW_REGIONS: Record<BodyView, BodyRegionId[]> = {
  front: ['chest', 'shoulders', 'arms', 'core', 'legs'],
  back:  ['back', 'shoulders', 'arms', 'legs'],
};
```

**picker 쿼리:** region 탭 → `WHERE id IN (REGIONS[region].exerciseIds)` (현재 `index.tsx`의 `id IN (...)` 패턴과 동일 shape). muscle_group 조인 불필요 — exerciseIds가 직접 명시되어 데드리프트 중복/오분류 리스크 제거.

**seed에 추가할 신규 운동 6종** (`src/db/seed.ts`, `INSERT OR IGNORE`라 안전):

| id | name (ko) | muscle_group | type | rep_low/high | bw |
|---|---|---|---|---|---|
| `cable_fly` | 케이블 플라이 | chest | strength | 10/15 | F |
| `dips` | 딥스 | chest | strength | 6/12 | T |
| `face_pull` | 페이스 풀 | shoulders | strength | 12/20 | F |
| `hammer_curl` | 해머 컬 | arms→biceps | strength | 8/12 | F |
| `hip_thrust` | 힙 쓰러스트 | posterior_chain | strength | 8/15 | F |
| `cable_crunch` | 케이블 크런치 | core | strength | 10/15 | F |

(`muscle_group`은 기존 slug 재사용 — region은 UI에서 exerciseIds로 매핑하므로 seed의 muscle_group과 충돌 없음.)

---

## 3. BodyMap 캐릭터 컴포넌트

### 3.1 구조 (레이어, 아래 → 위)

```
<View aspectRatio:0.46 (stage, 알려진 W×H)>
  1. <CharacterAura>   Skia <Canvas>, zIndex 0, pointerEvents="none"  // CP 오라, 뒤
  2. 장식 View (머리/몸통/엉덩이 윤곽)  zIndex 1, pointerEvents="none"
  3. <BodyRegion> × N  Pressable, zIndex 2                            // 투명 히트타깃, 위
</View>
[stage 아래] 유산소/컨디셔닝 칩 + "재미용 자체 산식" 라벨
[stage 위/옆] [ 앞 | 뒤 ] 세그먼트 토글
```

피규어 = **네온 휴머노이드 (RN View 라운디드 렉트/캡슐)**. 각 탭 단위는 `%` 절대 위치 `Pressable`. **stage 종횡비 고정**(`aspectRatio: 0.46`)이라 히트렉트와 오라 캔버스가 같은 박스에 정렬.

### 3.2 region % 레이아웃

**FRONT view** (x=50% 대칭):
| region | left% | top% | w% | h% | shape | note |
|---|---|---|---|---|---|---|
| 머리 (장식, 비탭) | 41 | 2 | 18 | 11 | circle | non-interactive |
| shoulders | 22 | 14 | 56 | 9 | wide bar | 양 델트 |
| chest | 30 | 21 | 40 | 14 | rounded rect | |
| arms (L) | 14 | 20 | 12 | 30 | capsule, rot −8° | bi+tri |
| arms (R) | 74 | 20 | 12 | 30 | capsule, rot +8° | 미러, 양쪽 다 `arms` 호출 |
| core | 32 | 35 | 36 | 16 | rounded rect | |
| 엉덩이 (장식) | 30 | 51 | 40 | 7 | rounded rect | 비탭 |
| legs (L) | 31 | 57 | 17 | 38 | capsule | |
| legs (R) | 52 | 57 | 17 | 38 | capsule | 양쪽 다 `legs` 호출 |

**BACK view** (토글): 같은 골격, 중앙 큰 몸통 블록이 `back` region이 되고 chest/core 사라짐. shoulders(후면 델트)·arms·legs 유지.
| region | left% | top% | w% | h% |
|---|---|---|---|---|
| shoulders (후면) | 22 | 14 | 56 | 9 |
| back | 28 | 21 | 44 | 32 |
| arms (L/R) | 14/74 | 20 | 12 | 30 |
| legs (L/R) | 31/52 | 57 | 17 | 38 |

paired region(arms/legs)의 좌/우 절반은 둘 다 같은 `onRegionPress`. **코어스 by design** — 빌더 요구.

### 3.3 front/back 도달 = 토글 (단순)

stage 위 두 칸 세그먼트 `[ 앞 | 뒤 ]`, default `front`. 토글 = `VIEW_REGIONS[view]` 스왑 + 같은 `<BodyMap>` 재렌더. 백 전용 서브존/3D 회전 없음. 상태 1개: `view: BodyView`. (옵션: 토글 시 Reanimated 크로스페이드 `withTiming` opacity 1→0→1 ≤180ms, 스킵세이프.)

### 3.4 프레스 피드백 (탭 어포던스, T1-weight)

- idle: 얇은 `colors.line` 보더 + faint 채움(`surfaceAlt` 저투명) + 라벨.
- pressed/active: 보더+`shadowColor`를 `REGIONS[region].color`로 전환. Reanimated shared value로 scale 1→1.06 + shadowRadius 8→20 펄스 (≤200ms, `Easing.out(Easing.cubic)` — JuiceOverlay와 동일 easing).
- **바디 탭은 절대 큰 JUICE를 안 쏜다.** ≤0.2s, 화면 플래시 X. 진짜 JUICE(T1–T4)는 세트 기록 시 `useLogSet`에서만. (벌은 뽕맛 보존, §6.4.)
- **반수치심:** 어떤 부위도 "약함/빨강 처벌"로 안 보여줌 — 전부 긍정 글로우(§6.9 #9).

### 3.5 CP 파워업 비주얼 (Skia 오라 — 히어로 그래픽)

피규어 **뒤** `<Canvas>` 레이어. 기존 스토어에서 구동 (신규 상태 X):
- `useCombatPowerStore((s) => s.score)`, `s.gradeKey`.
- `gradeForScore(score)` + GRADES band로 등급 내 진척도 계산.

오라 매핑 (순수 함수 `auraFromCp.ts`, 단위테스트):
1. **강도** — 현재 등급 band `[grade.min, nextGrade.min)`에 score 정규화 → `t01∈[0,1]` → 오라 opacity/blur radius/펄스 속도. 등급 내 grind가 오라를 visibly 충전.
2. **색** — 등급별 ramp (cool→hot): 일반인=textDim, 루키=cyan, 파이터=cyan→violet, 워리어=violet, 비스트=magenta, 괴수=energyHi, 초월자=flash/white-hot. RadialGradient stop이 현재↔다음 등급색을 `t01`로 보간.
3. **실루엣 업그레이드** — 고등급일수록 네온 윤곽 두꺼워짐/2중 스트로크. 비스트+ 느린 ambient 스파크. 초월자 = white-hot 더블스톱 코어. **ambient resting glow지 JUICE 버스트 아님.**

Skia v1 (2.6.2 export 확인): `Canvas`/`Group`/`Circle`/`RadialGradient`/`BlurMask`/`vec`. `BlurMask` 안 1–2 `Circle`(바디 중심+헤일로) + CP 구동 `RadialGradient`. 느린 클럭으로 radius ±4% (~2.5s 루프) breathe. SkSL 커스텀 셰이더(에너지 터뷸런스)는 후속 — gradient+blur로 시작. **`pointerEvents="none"` + 뒤 레이어**라 히트테스트 절대 안 건드림. 캔버스는 `onLayout`으로 픽셀 크기 받음(View는 %, 둘 다 같은 stage 박스 anchor).

### 3.6 컴포넌트 구조 + props

```
src/features/character/
  regions.ts          // REGIONS, VIEW_REGIONS, 레이아웃 % 상수 (모듈 스코프 = React Compiler 메모 안정)
  MyCharacter.tsx     // 오라 + 피규어 + view 토글 + 유산소 칩
  BodyMap.tsx         // 한 view의 Pressable 골격
  BodyRegion.tsx      // 한 Pressable 블록 (glow-on-press)
  CharacterAura.tsx   // Skia Canvas 오라 (CP 구동, 비인터랙션)
  auraFromCp.ts       // pure: (score) -> { color, intensity01, blur }
  auraFromCp.test.ts  // 단위테스트 (§10)
```

```ts
interface MyCharacterProps {
  onRegionPress: (region: BodyRegionId) => void;
  onCardioPress: () => void;                 // 유산소 칩
  activeRegion?: BodyRegionId | null;        // 선택 부위 점등 유지
  initialView?: BodyView;                    // 'front'
}
interface BodyRegionProps {
  region: BodyRegionId;
  rect: { left: number; top: number; width: number; height: number }; // % of stage
  rotateDeg?: number; color: string; active: boolean; onPress: () => void;
}
interface CharacterAuraProps { score: number; gradeKey: string; }
```

**React Compiler(reactCompiler:true) 주의:** rect/style 객체는 모듈 스코프 상수로 hoist (인라인 금지 → 메모 깨짐). press 피드백은 color/opacity/transform만 (relayout 금지 — 형제 히트렉트 흔들림 방지). Skia 래퍼 오라 오작동 시 `collapsable={false}`.

---

## 4. SetLogger v2 — 바디 주도 저마찰 로깅

### 4.1 흐름 + 탭 수 (헤드라인 지표)

"지난 세트 반복" 경로:
1. 바디 부위 탭 (예: 팔) → region 운동 리스트 시트
2. 운동 탭 (예: 덤벨 컬) → 로거 시트 (`getLastSetForExercise` 프리필)
3. **"지난 세트 반복 ⚡"** 탭 → 동일 무게×횟수×RIR 기록, JUICE 발동, 시트 유지

= **콜드 3탭 / 웜 1탭** (시트 열린 채 반복 = set 2부터 1탭). 조정 경로: 같은 첫 2탭 + ±스텝퍼 몇 탭 + 기록 → 4–5탭, **숫자 키보드 사실상 불필요.**

### 4.2 화면 아키텍처 (단일 화면, navigation push X — 빠름 + 로컬 상태)

CP 헤더 + 프로그램 데이 카드 유지(현 `index.tsx` 105–114). non-rest 분기 교체:
- **View A — MyCharacter (기본).** 바디맵 + 유산소 칩. 프로그램 관련 부위는 cyan 글로우, 비프로그램은 dim. 부위 탭 → `activeRegion` set → View B.
- **View B — 운동 리스트 (바텀시트 ~55%).** region 라벨 타이틀. `REGIONS[region].exerciseIds` 리스트. 각 row ≥56px, "지난: Xkg×Y" 서브타이틀(`getLastSetForExercise` 프리페치, 없으면 "첫 세트"). 프로그램 운동 상단 핀+cyan dot. 탭 → View C.
- **View C — SetLoggerSheet (코어, ~70%).** 프리필. 기록해도 시트 유지 + 세트 카운터("이번 세션 3세트 ✓"). swipe-down/닫기 → View B.

상태: `activeRegion`, `activeExercise`, 로거 내부 numeric state (string 아닌 number — 스텝퍼가 숫자 연산). **신규 store 불필요.**

### 4.3 SetLoggerSheet — 컴포넌트 분해

```ts
interface SetLoggerSheetProps {
  exercise: ExerciseRow;
  sessionId: string | null;
  ensureSession: () => Promise<string>;   // 기존 lazy 세션 생성 재사용
  onClose: () => void;
}
```

마운트/운동변경 시 `getLastSetForExercise` → `weight/reps/rir` seed. 없으면 `weight=0`(바벨이면 20 옵션), `reps=rep_low`, `rir=null`. `lastSet` 별도 추적(반복 정확성).

레이아웃 위→아래 (thumb-reachable, 큰 컨트롤 아래):
1. **헤더** — 운동명 + "지난: Xkg×Y (RIR Z)" / "첫 세트" + 세트 카운터 배지.
2. **무게 스텝퍼** (`is_bodyweight===1`이면 통째로 숨김) — `[ − ] 60.0 kg [ + ]`. 중앙 값 long-press → 인라인 numeric TextInput(드문 escape hatch). step = `weightStep` 설정(default 2.5).
3. **횟수 스텝퍼** — `[ − ] 8 회 [ + ]`. step 1. long-press-to-type.
4. **RIR 칩** — `[0][1][2][3][4+]` + none. `Pill` 재사용. null 유효(로깅 차단 X). 4+ → rir=4.
5. **주 액션 2개, full-width 스택:**
   - **"지난 세트 반복 ⚡"** (NeonButton cyan) — `lastSet==null`이면 disabled.
   - **"기록 ⚡"** (NeonButton energyHi) — 현재 스텝퍼 값.

### 4.4 Stepper 컴포넌트 (가속 ±, 키보드 불필요의 핵심)

```ts
interface StepperProps {
  value: number; step: number; min?: number; max?: number;
  precision?: number; unit?: string; onChange: (v: number) => void;
}
```
- −/+ 탭: `onChange(clamp(value ∓ step))`. 틱당 라이트 햅틱(`Haptics.selectionAsync()` — JUICE 티어 럼블과 다른 채널). **가속 시 N틱마다만** 햅틱(채널 경쟁/소음 방지).
- **long-press 가속:** press-in에 반복 타이머. ramp 350→250→150→80ms (~5틱마다), ~10틱 후 step ×2 (무게 2.5→5kg → 60→100kg 도달 ~1.5s 홀드, 16탭 X). release 정지. **이게 키보드를 불필요하게 만든다.**
- 큰 타깃: −/+ ≥52×52 네온 원형, 값 ≥88 wide mono(`monoFamily`). 값 변경 시 작은 scale-pop(`withSpring`, <100ms, 비차단).

### 4.5 로깅 액션 (두 버튼 → 한 핸들러 → 기존 핫패스)

```ts
async function commit(w: number, r: number, rirVal: number | null) {
  if (r <= 0) return;
  const sid = await ensureSession();
  const finalW = exercise.is_bodyweight ? 0 : w;
  await logSet({                                 // 기존 useLogSet 핫패스 — 여기서 JUICE 발동
    sessionId: sid, exerciseId: exercise.id,
    weight: finalW, reps: r, rir: rirVal,
    hitTargetReps: r >= exercise.rep_low,
    loggedVia: 'quick',                          // DB enum 이미 지원 (LoggedVia)
  });
  setSessionSetCount((n) => n + 1);
  setLastSet({ weight: finalW, reps: r, rir: rirVal }); // 다음 반복이 방금 값 반영
}
```
반복 = `commit(lastSet.*)`, 기록 = `commit(weight,reps,rir)`. **`useLogSet` 계약 불변** — addSet→recompute→juice.fire→appendPowerEvent 그대로. PR 감지/JUICE 타이밍 영향 없음.

### 4.6 신규 설정 `weightStep`
`src/lib/settings.ts`(`UserSettings`+`DEFAULT_SETTINGS`), `src/stores/settingsStore.ts`(`currentSettings()`), `src/app/(tabs)/settings.tsx`(피커 1.25/2.5/5)에 `weightStep: number` (default 2.5) 추가. 횟수 step은 1 고정.

### 4.7 엣지 케이스
- bodyweight(`is_bodyweight=1`: pull_up/dips/hanging_leg_raise/plank/cardio): 무게 스텝퍼 숨김, weight=0. 반복/기록은 reps+RIR로 동작.
- plank/cardio = reps as 초: v1은 step 1 + 가속이 커버. (per-exercise step 5는 fast-follow.)
- last set 없음 → 반복 disabled, 기록은 `rep_low` default.
- RIR 항상 옵션 → 절대 차단 X. `null`은 `classifyEvent`에서 not-solid 취급 → 반수치심 T1 팝은 여전히 발동.

---

## 5. 파일 변경

**신규:**
- `src/features/character/regions.ts` — REGIONS / VIEW_REGIONS / CARDIO_EXERCISE_IDS / % 레이아웃 상수
- `src/features/character/MyCharacter.tsx`
- `src/features/character/BodyMap.tsx`
- `src/features/character/BodyRegion.tsx`
- `src/features/character/CharacterAura.tsx`
- `src/features/character/auraFromCp.ts` + `auraFromCp.test.ts`
- `src/features/logging/SetLoggerSheet.tsx`
- `src/features/logging/Stepper.tsx`
- `src/features/logging/RirChips.tsx` (또는 SetLoggerSheet 내 인라인)
- `src/features/logging/ExerciseRegionSheet.tsx` (View B 바텀시트)

**수정:**
- `src/db/seed.ts` — 신규 운동 6종 추가 (`EXERCISE_SEED`)
- `src/app/(tabs)/index.tsx` — **non-rest 분기 재작성**: 헤더+데이 카드 유지, Pill row + `Field` TextInput 블록(132–138, 157–205) 삭제 → `<MyCharacter>` → 시트. `openPicker(region)`가 `id IN (exerciseIds)` 쿼리 + View B.
- `src/lib/settings.ts`, `src/stores/settingsStore.ts`, `src/app/(tabs)/settings.tsx` — `weightStep` 추가
- `src/features/logging/useLogSet.ts` — **불변** (`loggedVia:'quick'` 통과만 확인)

---

## 6. 빌드 순서 (의존성 순 + 빌더 불만 매핑)

| 스텝 | 작업 | 해결하는 빌더 불만 |
|---|---|---|
| **0** | `seed.ts`에 신규 6종 추가 + `regions.ts` (REGIONS/VIEW_REGIONS/레이아웃 상수) | (토대 — 부위별 운동 데이터 계약) |
| **1** | `BodyRegion.tsx` → `BodyMap.tsx` (front만, 더미 onPress) — % 레이아웃 dev client 튜닝 | **부위별**: "몸 띄우고 부위 터치"의 골격 |
| **2** | `auraFromCp.ts`+테스트 → `CharacterAura.tsx` (gradient+blur) → `MyCharacter.tsx`(오라+토글+유산소 칩) | **디자인 구림**: CP 파워업 오라 = 히어로 그래픽(§6.4) |
| **3** | `Stepper.tsx` (탭+가속+long-press-to-type) → `RirChips.tsx` | **수동입력 경멸**: 키보드 제거의 핵심 |
| **4** | `ExerciseRegionSheet.tsx` (View B) + `SetLoggerSheet.tsx` (View C, 프리필+반복버튼, `useLogSet` 그대로) | **수동입력 경멸 + 부위별**: 3탭 콜드/1탭 웜 |
| **5** | `index.tsx` non-rest 분기 교체 (Pill+Field 삭제 → MyCharacter→시트 배선) | **셋 다**: 핫패스 진입점 통합 |
| **6** | `weightStep` 설정 3파일 배선 | **수동입력 경멸**: 스텝 크기 튜닝 |
| **7** | dev client 검증: "기록마다 폭발" 유지(§6.4 Accept), 부위별 흐름, % 레이아웃 휴머노이드 가독성 튜닝 | 그래픽 히어로 — "그럭저럭"은 실패 |

각 스텝 독립 검증 (back view, 가속 ramp는 후속 튜닝 패스).

---

## 7. 리스크 & 빌더 확인 필요

**빌더가 봐야 할 결정:**
1. **코어스 정도** — arms = bi+tri 한 리스트, legs = 하체 전체(8운동, 종아리/햄 포함) 한 리스트. 좌/우 절반 구분 안 함(둘 다 같은 리스트). 빌더 요구("너무 세부적으로 X")대로지만 — 하체 8개는 길다. 추후 "하체뒤/종아리" 분리 원하면 `regions.ts`만 확장(DB 불변).
2. **캐릭터 스타일** — Phase 1 = 제네릭 네온 휴머노이드(View). 정체성은 몸이 아니라 **오라 색/강도/등급**. 실사진/세그멘테이션 오라 카드는 Phase 3 (같은 `auraFromCp` + SkSL 셰이더 재사용 예정). 빌더 OK? 아니면 더 멋진 실루엣 아트를 Phase 1에 넣을지.
3. **front/back 처리** — 단일 `[앞|뒤]` 토글 (3D 회전 X). 등 운동 도달 = back view 토글. 단순/빠름 우선. OK?
4. **유산소 위치** — 몸 부위 없음 → 피규어 밖 별도 칩. region으로 위장 안 함. OK?

**기술 리스크:**
- **Skia 오라가 ScrollView jank** 가능 → v1은 gradient+blur 단일 Group, 느린 ~2.5s 펄스, 파티클 전 dev client 프로파일. §6.4 "JUICE는 마찰 X" 사수.
- **% 레이아웃이 눈대중** → 첫 패스는 떠다니는 블록처럼 보일 수 있음. dev client 튜닝 패스 예산 필요(그래픽 히어로 — "그럭저럭"은 실패).
- **핫패스 진입점 교체** — weight/reps 입력 + `useLogSet` 계약 유지 필수. UI 스왑 후 "기록마다 폭발" Accept 재검증.
- **가속 ramp 튜닝** — 나쁜 ramp = 오버슈트 짜증. 단일 탭 미세조정 + long-press-to-type escape hatch로 완화.
- **React Compiler(on)** — region config/style 모듈 스코프 hoist 필수(인라인 = 메모 깨짐 + 탭 churn).
- **Skia Canvas 픽셀 크기(onLayout) vs View %** — 오라 중심 정렬 어긋남 가능. 둘 다 같은 stage 박스 anchor.
