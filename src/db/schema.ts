// Phase 1 local schema (spec §5 subset). Inline template string (zero metro/babel config for
// .sql imports). PG-forward conventions: ISO-UTC TEXT timestamps, client_uuid sync keys,
// CHECK(...IN...) enums, JSON-in-TEXT, 0/1 booleans, exercise.id = slug (Phase 2 fuzzy-match key).
//
// Deferred to later phases: BodyComp/FitnessTest (Phase 5), League/Friendship/AuraCard (Phase 3-4).
// Program is a code constant (defaultProgram.ts), not a table. Streak is computed, not stored.

export const DATABASE_VERSION = 1;

export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS user (
  id           TEXT PRIMARY KEY NOT NULL,
  handle       TEXT,
  display_name TEXT,
  locale       TEXT NOT NULL DEFAULT 'ko',
  settings     TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercise (
  id            TEXT PRIMARY KEY NOT NULL,
  name          TEXT NOT NULL,
  muscle_group  TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('strength','cardio')),
  default_sets  INTEGER NOT NULL DEFAULT 3,
  rep_low       INTEGER NOT NULL DEFAULT 8,
  rep_high      INTEGER NOT NULL DEFAULT 12,
  is_bodyweight INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_session (
  id           TEXT PRIMARY KEY NOT NULL,
  client_uuid  TEXT NOT NULL UNIQUE,
  user_id      TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  day_type     TEXT NOT NULL CHECK (day_type IN ('upper','lower','cardio','rest')),
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','voice','imported')),
  started_at   TEXT NOT NULL,
  completed_at TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_user_date ON workout_session(user_id, date);

CREATE TABLE IF NOT EXISTS set_log (
  id          TEXT PRIMARY KEY NOT NULL,
  client_uuid TEXT NOT NULL UNIQUE,
  session_id  TEXT NOT NULL REFERENCES workout_session(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercise(id),
  weight      REAL NOT NULL DEFAULT 0,
  reps        INTEGER NOT NULL DEFAULT 0,
  rir         INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  is_pr       INTEGER NOT NULL DEFAULT 0,
  score       REAL NOT NULL DEFAULT 0,
  logged_via  TEXT NOT NULL DEFAULT 'manual' CHECK (logged_via IN ('manual','voice','imported','quick')),
  logged_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_setlog_session ON set_log(session_id);
CREATE INDEX IF NOT EXISTS idx_setlog_exercise ON set_log(exercise_id, logged_at);

CREATE TABLE IF NOT EXISTS cardio_log (
  id           TEXT PRIMARY KEY NOT NULL,
  client_uuid  TEXT NOT NULL UNIQUE,
  session_id   TEXT NOT NULL REFERENCES workout_session(id) ON DELETE CASCADE,
  modality     TEXT NOT NULL,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  rounds       INTEGER,
  rpe          INTEGER,
  distance_m   REAL,
  source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','imported')),
  logged_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cardio_session ON cardio_log(session_id);

CREATE TABLE IF NOT EXISTS combat_power (
  id             TEXT PRIMARY KEY NOT NULL,
  user_id        TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  score          INTEGER NOT NULL,
  grade_key      TEXT NOT NULL,
  breakdown      TEXT NOT NULL DEFAULT '{}',
  verified_ratio REAL NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS power_event (
  id          TEXT PRIMARY KEY NOT NULL,
  client_uuid TEXT NOT NULL UNIQUE,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  session_id  TEXT REFERENCES workout_session(id) ON DELETE SET NULL,
  tier        INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 4),
  delta       INTEGER NOT NULL DEFAULT 0,
  reason      TEXT NOT NULL CHECK (reason IN ('set','pr','session','streak','levelup')),
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_powerevent_user ON power_event(user_id, created_at);
`;
