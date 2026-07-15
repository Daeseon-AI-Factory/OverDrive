// Phase 1 local schema (spec §5 subset). Inline template string (zero metro/babel config for
// .sql imports). PG-forward conventions: ISO-UTC TEXT timestamps, client_uuid sync keys,
// CHECK(...IN...) enums, JSON-in-TEXT, 0/1 booleans, exercise.id = slug (Phase 2 fuzzy-match key).
//
// Deferred to later phases: FitnessTest (Phase 5), League/Friendship/AuraCard (Phase 3-4).
// Program is a code constant (defaultProgram.ts), not a table. Streak is computed, not stored.

export const DATABASE_VERSION = 8;

export const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS user (
  id           TEXT PRIMARY KEY NOT NULL,
  handle       TEXT,
  display_name TEXT,
  locale       TEXT NOT NULL DEFAULT 'en',
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

CREATE TABLE IF NOT EXISTS discipline (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  protein    INTEGER NOT NULL DEFAULT 0,
  rest       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS daily_target (
  id          TEXT PRIMARY KEY NOT NULL,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'reps',
  target      REAL NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_target_log (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  target_id  TEXT NOT NULL REFERENCES daily_target(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  progress   REAL NOT NULL DEFAULT 0,
  done       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(target_id, date)
);
CREATE INDEX IF NOT EXISTS idx_dailygoal_user_date ON daily_target_log(user_id, date);

CREATE TABLE IF NOT EXISTS food_log (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  name       TEXT NOT NULL,
  kcal       REAL NOT NULL DEFAULT 0,
  protein_g  REAL NOT NULL DEFAULT 0,
  source     TEXT NOT NULL DEFAULT 'text' CHECK (source IN ('text','voice','photo')),
  logged_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_food_user_date ON food_log(user_id, date);

CREATE TABLE IF NOT EXISTS body_composition_log (
  id                TEXT PRIMARY KEY NOT NULL,
  client_uuid       TEXT NOT NULL UNIQUE,
  user_id           TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  weight_kg         REAL NOT NULL CHECK (weight_kg > 0),
  body_fat_fraction REAL NOT NULL CHECK (body_fat_fraction >= 0 AND body_fat_fraction <= 1),
  measured_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bodycomp_user_measured ON body_composition_log(user_id, measured_at);
`;

// v2 → v3: add the discipline table to already-migrated databases (idempotent).
export const MIGRATION_003 = `
CREATE TABLE IF NOT EXISTS discipline (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  protein    INTEGER NOT NULL DEFAULT 0,
  rest       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, date)
);
`;

// v3 → v4: daily training goals (recurring target template + per-day progress). Idempotent.
export const MIGRATION_004 = `
CREATE TABLE IF NOT EXISTS daily_target (
  id          TEXT PRIMARY KEY NOT NULL,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'reps',
  target      REAL NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_target_log (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  target_id  TEXT NOT NULL REFERENCES daily_target(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  progress   REAL NOT NULL DEFAULT 0,
  done       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(target_id, date)
);
CREATE INDEX IF NOT EXISTS idx_dailygoal_user_date ON daily_target_log(user_id, date);
`;

// v4 → v5: AI food logging (photo/text/voice → kcal + protein). Idempotent.
export const MIGRATION_005 = `
CREATE TABLE IF NOT EXISTS food_log (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  name       TEXT NOT NULL,
  kcal       REAL NOT NULL DEFAULT 0,
  protein_g  REAL NOT NULL DEFAULT 0,
  source     TEXT NOT NULL DEFAULT 'text' CHECK (source IN ('text','voice','photo')),
  logged_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_food_user_date ON food_log(user_id, date);
`;

// v5 → v6: durable manual body-composition history. Each save keeps weight + body-fat together.
export const MIGRATION_006 = `
CREATE TABLE IF NOT EXISTS body_composition_log (
  id                TEXT PRIMARY KEY NOT NULL,
  client_uuid       TEXT NOT NULL UNIQUE,
  user_id           TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  weight_kg         REAL NOT NULL CHECK (weight_kg > 0),
  body_fat_fraction REAL NOT NULL CHECK (body_fat_fraction >= 0 AND body_fat_fraction <= 1),
  measured_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bodycomp_user_measured ON body_composition_log(user_id, measured_at);
`;

// v6 → v7: manual/offline meal entry + durable meal batch ids. SQLite cannot widen a CHECK
// constraint in place, so rebuild the table atomically and preserve every existing row. Historic
// rows used logged_at as their implicit batch boundary; carry that forward as a deterministic id.
// migrate.ts only executes this script when the live table does not already expose both v7 traits.
export const MIGRATION_007 = `
DROP TABLE IF EXISTS food_log_v7;
CREATE TABLE food_log_v7 (
  id         TEXT PRIMARY KEY NOT NULL,
  batch_id   TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,
  name       TEXT NOT NULL,
  kcal       REAL NOT NULL DEFAULT 0,
  protein_g  REAL NOT NULL DEFAULT 0,
  source     TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','text','voice','photo')),
  logged_at  TEXT NOT NULL
);
INSERT INTO food_log_v7 (id, batch_id, user_id, date, name, kcal, protein_g, source, logged_at)
SELECT id, user_id || ':' || logged_at, user_id, date, name, kcal, protein_g, source, logged_at
FROM food_log;
DROP TABLE food_log;
ALTER TABLE food_log_v7 RENAME TO food_log;
CREATE INDEX IF NOT EXISTS idx_food_user_date ON food_log(user_id, date);
CREATE INDEX IF NOT EXISTS idx_food_user_batch ON food_log(user_id, batch_id);
`;

// v7 → v8: immutable catalog snapshots + active/previous pointers + stable local bridge ids.
// The existing exercise table remains the logging FK target and is never replaced by this cache.
export const MIGRATION_008 = `
CREATE TABLE IF NOT EXISTS catalog_snapshot_cache (
  catalog_version TEXT PRIMARY KEY NOT NULL,
  schema_version  TEXT NOT NULL CHECK (schema_version = '1.0.0'),
  effective_at    TEXT NOT NULL,
  etag            TEXT NOT NULL,
  checksum_hex    TEXT NOT NULL CHECK (
    length(checksum_hex) = 64 AND
    checksum_hex = lower(checksum_hex) AND
    checksum_hex NOT GLOB '*[^0-9a-f]*'
  ),
  payload_bytes   INTEGER NOT NULL CHECK (payload_bytes BETWEEN 1 AND 524288),
  payload_blob    BLOB NOT NULL CHECK (
    typeof(payload_blob) = 'blob' AND length(payload_blob) = payload_bytes
  ),
  source          TEXT NOT NULL CHECK (source IN ('remote','bundled')),
  validated_at    TEXT NOT NULL,
  CHECK (
    catalog_version GLOB '1.[0-9]*.[0-9]*' AND
    catalog_version NOT GLOB '*[^0-9.]*'
  )
);

CREATE TABLE IF NOT EXISTS catalog_cache_channel (
  slot            TEXT PRIMARY KEY NOT NULL CHECK (slot IN ('active','previous')),
  catalog_version TEXT NOT NULL REFERENCES catalog_snapshot_cache(catalog_version) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS catalog_exercise_bridge (
  catalog_id  TEXT PRIMARY KEY NOT NULL,
  exercise_id TEXT NOT NULL UNIQUE REFERENCES exercise(id) ON DELETE RESTRICT,
  is_frozen   INTEGER NOT NULL CHECK (is_frozen IN (0,1)),
  created_at  TEXT NOT NULL,
  UNIQUE (catalog_id, exercise_id),
  CHECK (
    (is_frozen = 1 AND exercise_id = catalog_id) OR
    (is_frozen = 0 AND exercise_id LIKE 'catalog_%')
  )
);

CREATE TABLE IF NOT EXISTS catalog_exercise_cache (
  catalog_version    TEXT NOT NULL REFERENCES catalog_snapshot_cache(catalog_version) ON DELETE CASCADE,
  catalog_id         TEXT NOT NULL,
  bridge_exercise_id TEXT NOT NULL REFERENCES exercise(id) ON DELETE RESTRICT,
  record_revision    INTEGER NOT NULL CHECK (record_revision >= 1),
  status             TEXT NOT NULL CHECK (status IN ('active','deprecated','retired')),
  effective_from     TEXT NOT NULL,
  effective_to       TEXT,
  replacement_id     TEXT,
  display_order      INTEGER NOT NULL CHECK (display_order >= 1),
  exercise_type      TEXT NOT NULL CHECK (exercise_type IN ('strength','cardio')),
  is_bodyweight      INTEGER NOT NULL CHECK (is_bodyweight IN (0,1)),
  movement_pattern   TEXT NOT NULL,
  difficulty         TEXT NOT NULL CHECK (difficulty IN ('beginner','intermediate','advanced')),
  default_sets       INTEGER NOT NULL CHECK (default_sets BETWEEN 1 AND 20),
  tracking_mode      TEXT NOT NULL CHECK (tracking_mode IN ('reps','duration','distance','duration_distance','intervals')),
  counting_convention TEXT NOT NULL CHECK (counting_convention IN ('total','per_side','not_applicable')),
  target_unit        TEXT,
  target_low         REAL,
  target_high        REAL,
  provenance_json    TEXT NOT NULL,
  PRIMARY KEY (catalog_version, catalog_id),
  FOREIGN KEY (catalog_id, bridge_exercise_id)
    REFERENCES catalog_exercise_bridge(catalog_id, exercise_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS catalog_exercise_localization (
  catalog_version TEXT NOT NULL,
  catalog_id      TEXT NOT NULL,
  locale          TEXT NOT NULL CHECK (locale IN ('en','ko','es','zh-Hans')),
  display_name    TEXT NOT NULL,
  PRIMARY KEY (catalog_version, catalog_id, locale),
  FOREIGN KEY (catalog_version, catalog_id)
    REFERENCES catalog_exercise_cache(catalog_version, catalog_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog_exercise_alias (
  catalog_version TEXT NOT NULL,
  catalog_id      TEXT NOT NULL,
  locale          TEXT NOT NULL CHECK (locale IN ('en','ko','es','zh-Hans')),
  alias_order     INTEGER NOT NULL CHECK (alias_order >= 0),
  alias           TEXT NOT NULL,
  PRIMARY KEY (catalog_version, catalog_id, locale, alias_order),
  FOREIGN KEY (catalog_version, catalog_id, locale)
    REFERENCES catalog_exercise_localization(catalog_version, catalog_id, locale) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog_exercise_equipment (
  catalog_version TEXT NOT NULL,
  catalog_id      TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('required','optional')),
  item_order      INTEGER NOT NULL CHECK (item_order >= 0),
  equipment_id    TEXT NOT NULL,
  PRIMARY KEY (catalog_version, catalog_id, role, item_order),
  FOREIGN KEY (catalog_version, catalog_id)
    REFERENCES catalog_exercise_cache(catalog_version, catalog_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog_exercise_region (
  catalog_version TEXT NOT NULL,
  catalog_id      TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('primary','secondary')),
  item_order      INTEGER NOT NULL CHECK (item_order >= 0),
  region_id       TEXT NOT NULL,
  PRIMARY KEY (catalog_version, catalog_id, role, item_order),
  FOREIGN KEY (catalog_version, catalog_id)
    REFERENCES catalog_exercise_cache(catalog_version, catalog_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_catalog_cache_order
  ON catalog_exercise_cache(catalog_version, status, display_order, catalog_id);
CREATE INDEX IF NOT EXISTS idx_catalog_cache_bridge
  ON catalog_exercise_cache(bridge_exercise_id);
CREATE INDEX IF NOT EXISTS idx_catalog_alias_lookup
  ON catalog_exercise_alias(catalog_version, locale, alias);
CREATE INDEX IF NOT EXISTS idx_catalog_equipment_lookup
  ON catalog_exercise_equipment(catalog_version, equipment_id);
CREATE INDEX IF NOT EXISTS idx_catalog_region_lookup
  ON catalog_exercise_region(catalog_version, region_id, role);
`;
