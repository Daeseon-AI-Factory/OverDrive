import type { SQLiteDatabase } from 'expo-sqlite';
import { nowIso } from '../lib/date';
import type { ExerciseType } from './types';

interface SeedExercise {
  id: string; // slug = stable PK + Phase 2 LLM fuzzy-match target
  name: string;
  muscle_group: string;
  type: ExerciseType;
  default_sets: number;
  rep_low: number;
  rep_high: number;
  is_bodyweight: boolean;
}

// 20 starter exercises covering the §6.2 program: 상체A/하체A/상체B/하체B + core + 인터벌 2종.
export const EXERCISE_SEED: SeedExercise[] = [
  // Upper push/pull
  { id: 'barbell_bench_press', name: '바벨 벤치프레스', muscle_group: 'chest', type: 'strength', default_sets: 3, rep_low: 5, rep_high: 8, is_bodyweight: false },
  { id: 'incline_db_press', name: '인클라인 덤벨 프레스', muscle_group: 'chest', type: 'strength', default_sets: 3, rep_low: 8, rep_high: 12, is_bodyweight: false },
  { id: 'overhead_press', name: '오버헤드 프레스', muscle_group: 'shoulders', type: 'strength', default_sets: 3, rep_low: 5, rep_high: 8, is_bodyweight: false },
  { id: 'lateral_raise', name: '사이드 레터럴 레이즈', muscle_group: 'shoulders', type: 'strength', default_sets: 3, rep_low: 12, rep_high: 20, is_bodyweight: false },
  { id: 'pull_up', name: '풀업', muscle_group: 'back', type: 'strength', default_sets: 3, rep_low: 5, rep_high: 12, is_bodyweight: true },
  { id: 'barbell_row', name: '바벨 로우', muscle_group: 'back', type: 'strength', default_sets: 3, rep_low: 6, rep_high: 10, is_bodyweight: false },
  { id: 'lat_pulldown', name: '랫 풀다운', muscle_group: 'back', type: 'strength', default_sets: 3, rep_low: 8, rep_high: 12, is_bodyweight: false },
  { id: 'db_curl', name: '덤벨 컬', muscle_group: 'biceps', type: 'strength', default_sets: 3, rep_low: 8, rep_high: 12, is_bodyweight: false },
  { id: 'triceps_pushdown', name: '트라이셉 푸시다운', muscle_group: 'triceps', type: 'strength', default_sets: 3, rep_low: 10, rep_high: 15, is_bodyweight: false },
  // Lower
  { id: 'barbell_back_squat', name: '바벨 백스쿼트', muscle_group: 'quads', type: 'strength', default_sets: 3, rep_low: 5, rep_high: 8, is_bodyweight: false },
  { id: 'deadlift', name: '데드리프트', muscle_group: 'posterior_chain', type: 'strength', default_sets: 3, rep_low: 3, rep_high: 6, is_bodyweight: false },
  { id: 'romanian_deadlift', name: '루마니안 데드리프트', muscle_group: 'hamstrings', type: 'strength', default_sets: 3, rep_low: 8, rep_high: 12, is_bodyweight: false },
  { id: 'leg_press', name: '레그 프레스', muscle_group: 'quads', type: 'strength', default_sets: 3, rep_low: 10, rep_high: 15, is_bodyweight: false },
  { id: 'leg_curl', name: '레그 컬', muscle_group: 'hamstrings', type: 'strength', default_sets: 3, rep_low: 10, rep_high: 15, is_bodyweight: false },
  { id: 'bulgarian_split_squat', name: '불가리안 스플릿 스쿼트', muscle_group: 'quads', type: 'strength', default_sets: 3, rep_low: 8, rep_high: 12, is_bodyweight: false },
  { id: 'standing_calf_raise', name: '스탠딩 카프 레이즈', muscle_group: 'calves', type: 'strength', default_sets: 4, rep_low: 10, rep_high: 15, is_bodyweight: false },
  // Core
  { id: 'hanging_leg_raise', name: '행잉 레그 레이즈', muscle_group: 'core', type: 'strength', default_sets: 3, rep_low: 8, rep_high: 15, is_bodyweight: true },
  { id: 'plank', name: '플랭크', muscle_group: 'core', type: 'strength', default_sets: 3, rep_low: 30, rep_high: 60, is_bodyweight: true },
  // Conditioning / 인터벌
  { id: 'hiit_intervals', name: 'HIIT 인터벌', muscle_group: 'conditioning', type: 'cardio', default_sets: 1, rep_low: 0, rep_high: 0, is_bodyweight: true },
  { id: 'zone2_run', name: 'Zone 2 러닝', muscle_group: 'conditioning', type: 'cardio', default_sets: 1, rep_low: 0, rep_high: 0, is_bodyweight: true },
];

/** Idempotent: INSERT OR IGNORE so re-runs / new migrations don't duplicate or clobber edits. */
export async function seedExercises(db: SQLiteDatabase): Promise<void> {
  const created = nowIso();
  for (const e of EXERCISE_SEED) {
    await db.runAsync(
      `INSERT OR IGNORE INTO exercise
         (id, name, muscle_group, type, default_sets, rep_low, rep_high, is_bodyweight, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.id, e.name, e.muscle_group, e.type, e.default_sets, e.rep_low, e.rep_high, e.is_bodyweight ? 1 : 0, created],
    );
  }
}
