// Row types — shapes returned by expo-sqlite (snake_case columns, SQLite scalar types).
// Booleans are 0/1 INTEGER; timestamps are ISO-8601 UTC TEXT; enums are CHECK-constrained TEXT.
// These mirror the future Postgres schema for a mechanical Phase 2 migration.

export const LOCAL_USER_ID = 'local'; // Phase 1 is single-user on-device

export type DayType = 'upper' | 'lower' | 'cardio' | 'rest';
export type SessionSource = 'manual' | 'voice' | 'imported';
export type ExerciseType = 'strength' | 'cardio';
export type LoggedVia = 'manual' | 'voice' | 'imported' | 'quick';
export type CardioSource = 'manual' | 'imported';
export type PowerEventReason = 'set' | 'pr' | 'session' | 'streak' | 'levelup';

export interface UserRow {
  id: string;
  handle: string | null;
  display_name: string | null;
  locale: string;
  settings: string; // JSON text
  created_at: string;
  updated_at: string;
}

export interface ExerciseRow {
  id: string; // slug
  name: string;
  muscle_group: string;
  type: ExerciseType;
  default_sets: number;
  rep_low: number;
  rep_high: number;
  is_bodyweight: number; // 0/1
  created_at: string;
}

export interface WorkoutSessionRow {
  id: string;
  client_uuid: string;
  user_id: string;
  date: string; // yyyy-mm-dd local
  day_type: DayType;
  source: SessionSource;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface SetLogRow {
  id: string;
  client_uuid: string;
  session_id: string;
  exercise_id: string;
  weight: number;
  reps: number;
  rir: number | null;
  order_index: number;
  is_pr: number; // 0/1
  score: number; // e1RM/perf score at log time
  logged_via: LoggedVia;
  logged_at: string;
}

export interface CardioLogRow {
  id: string;
  client_uuid: string;
  session_id: string;
  modality: string;
  duration_sec: number;
  rounds: number | null;
  rpe: number | null;
  distance_m: number | null;
  source: CardioSource;
  logged_at: string;
}

export interface CombatPowerRow {
  id: string;
  user_id: string;
  date: string;
  score: number;
  grade_key: string;
  breakdown: string; // JSON text
  verified_ratio: number;
  created_at: string;
}

export interface PowerEventRow {
  id: string;
  client_uuid: string;
  user_id: string;
  session_id: string | null;
  tier: number; // 1..4
  delta: number;
  reason: PowerEventReason;
  created_at: string;
}
