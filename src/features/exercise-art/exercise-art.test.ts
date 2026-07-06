// Visual-by-math verification of the exercise pose-art library (no Skia needed):
//   1. every seeded exercise id classifies into a valid movement family (explicit map, no fallback)
//   2. every family has both keyframe poses, all coordinates inside the 0..1 canvas
//   3. pose a/b are structurally identical (same prop count → Skia paths interpolatable)
//      and actually MOVE (the loop is a visible rep, not a frozen frame)

import { EXERCISE_SEED } from '@/db/seed';
import { EXERCISE_FAMILY, exerciseFamily, FAMILIES, type Family } from './families';
import { JOINT_KEYS, lerpPose, POSES, type Pose } from './poses';

const inUnit = (n: number) => n >= 0 && n <= 1;

function everyCoord(pose: Pose): { x: number; y: number }[] {
  return [...JOINT_KEYS.map((k) => pose[k]), ...pose.props.flatMap((seg) => [seg[0], seg[1]])];
}

describe('exerciseFamily (families.ts)', () => {
  it('classifies EVERY seeded exercise id via the explicit map (no fallback needed)', () => {
    for (const e of EXERCISE_SEED) {
      expect(EXERCISE_FAMILY[e.id]).toBeDefined();
      expect(FAMILIES).toContain(EXERCISE_FAMILY[e.id]);
    }
  });

  it('maps representative movements to the intended family', () => {
    const expected: Record<string, Family> = {
      barbell_bench_press: 'pressHorizontal',
      dips: 'pressHorizontal',
      overhead_press: 'pressVertical',
      barbell_back_squat: 'squat',
      deadlift: 'hinge',
      hip_thrust: 'hinge',
      barbell_row: 'rowHorizontal',
      pull_up: 'pullVertical',
      lat_pulldown: 'pullVertical',
      db_curl: 'curl',
      triceps_pushdown: 'extensionTriceps',
      lateral_raise: 'raiseLateral',
      cable_fly: 'fly',
      plank: 'core',
    };
    for (const [id, family] of Object.entries(expected)) {
      expect(exerciseFamily(id)).toBe(family);
    }
  });

  it('maps every cardio-typed seed to the cardio family', () => {
    for (const e of EXERCISE_SEED.filter((s) => s.type === 'cardio')) {
      expect(exerciseFamily(e.id)).toBe('cardio');
    }
  });

  it('falls back sensibly for unseeded ids', () => {
    // keyword heuristic
    expect(exerciseFamily('weighted_ring_dip')).toBe('pressHorizontal');
    expect(exerciseFamily('seated_cable_row')).toBe('rowHorizontal');
    expect(exerciseFamily('goblet_squat')).toBe('squat');
    expect(exerciseFamily('kettlebell_swing')).toBe('hinge');
    expect(exerciseFamily('ab_wheel_rollout')).toBe('core');
    expect(exerciseFamily('assault_bike')).toBe('cardio');
    // total unknown → still a valid family (renderer can always draw something)
    expect(FAMILIES).toContain(exerciseFamily('mystery_movement_9000'));
  });
});

describe('POSES (poses.ts)', () => {
  it('defines a start and end pose for every family', () => {
    for (const family of FAMILIES) {
      const fp = POSES[family];
      expect(fp).toBeDefined();
      expect(fp.a).toBeDefined();
      expect(fp.b).toBeDefined();
      expect(['side', 'front']).toContain(fp.view);
    }
  });

  it('keeps every joint and prop endpoint within the 0..1 canvas', () => {
    for (const family of FAMILIES) {
      const { a, b } = POSES[family];
      for (const pose of [a, b]) {
        for (const pt of everyCoord(pose)) {
          expect(inUnit(pt.x)).toBe(true);
          expect(inUnit(pt.y)).toBe(true);
        }
      }
    }
  });

  it('pose a/b are structurally identical (equal prop counts → interpolatable Skia paths)', () => {
    for (const family of FAMILIES) {
      const { a, b } = POSES[family];
      expect(a.props.length).toBe(b.props.length);
    }
  });

  it('every family visibly moves between the keyframes (a rep, not a frozen frame)', () => {
    for (const family of FAMILIES) {
      const { a, b } = POSES[family];
      const maxDelta = Math.max(
        ...JOINT_KEYS.map((k) => Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y)),
      );
      expect(maxDelta).toBeGreaterThan(0.02);
    }
  });

  it('lerpPose stays in bounds and hits both endpoints exactly', () => {
    for (const family of FAMILIES) {
      const { a, b } = POSES[family];
      for (const k of JOINT_KEYS) {
        expect(lerpPose(a, b, 0)[k]).toEqual(a[k]);
        expect(lerpPose(a, b, 1)[k]).toEqual(b[k]);
      }
      for (const pt of everyCoord(lerpPose(a, b, 0.5))) {
        expect(inUnit(pt.x)).toBe(true);
        expect(inUnit(pt.y)).toBe(true);
      }
    }
  });
});
