PRAGMA foreign_keys = ON;

CREATE TABLE catalog_release (
  version TEXT PRIMARY KEY,
  schema_version TEXT NOT NULL,
  effective_at_ms INTEGER NOT NULL CHECK (effective_at_ms > 0),
  checksum_hex TEXT NOT NULL UNIQUE
    CHECK (length(checksum_hex) = 64 AND checksum_hex NOT GLOB '*[^0-9a-f]*'),
  item_count INTEGER NOT NULL CHECK (item_count BETWEEN 32 AND 512),
  payload_bytes INTEGER NOT NULL CHECK (payload_bytes BETWEEN 1 AND 524288),
  payload_json BLOB NOT NULL
    CHECK (typeof(payload_json) = 'blob' AND length(payload_json) = payload_bytes),
  state TEXT NOT NULL CHECK (state IN ('draft', 'published', 'withdrawn')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms > 0),
  published_at_ms INTEGER,
  CHECK (
    (state = 'draft' AND published_at_ms IS NULL) OR
    (state IN ('published', 'withdrawn') AND published_at_ms > 0)
  )
);

CREATE TABLE catalog_channel (
  channel TEXT PRIMARY KEY CHECK (channel = 'v1'),
  version TEXT NOT NULL REFERENCES catalog_release(version)
);

CREATE TABLE catalog_exercise (
  version TEXT NOT NULL REFERENCES catalog_release(version),
  id TEXT NOT NULL,
  record_revision INTEGER NOT NULL CHECK (record_revision >= 1),
  status TEXT NOT NULL CHECK (status IN ('active', 'deprecated', 'retired')),
  effective_from_ms INTEGER NOT NULL,
  effective_to_ms INTEGER,
  replacement_id TEXT,
  display_order INTEGER NOT NULL CHECK (display_order >= 1),
  exercise_type TEXT NOT NULL CHECK (exercise_type IN ('strength', 'cardio')),
  is_bodyweight INTEGER NOT NULL CHECK (is_bodyweight IN (0, 1)),
  movement_pattern TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  default_sets INTEGER NOT NULL CHECK (default_sets BETWEEN 1 AND 20),
  tracking_mode TEXT NOT NULL,
  target_unit TEXT,
  target_low REAL,
  target_high REAL,
  provenance_classification TEXT NOT NULL
    CHECK (provenance_classification IN ('original_editorial', 'public_facts', 'licensed')),
  review_status TEXT NOT NULL CHECK (review_status IN ('source_checked', 'human_reviewed')),
  review_method TEXT NOT NULL CHECK (review_method IN ('source_comparison', 'human_editorial_review')),
  reviewed_by_role TEXT NOT NULL,
  review_evidence TEXT NOT NULL,
  reviewed_at_ms INTEGER NOT NULL,
  contains_third_party_copy INTEGER NOT NULL CHECK (contains_third_party_copy = 0),
  CHECK (effective_to_ms IS NULL OR effective_to_ms > effective_from_ms),
  CHECK (target_low IS NULL OR target_low >= 0),
  CHECK (target_high IS NULL OR target_high >= target_low),
  CHECK (
    (review_status = 'source_checked' AND review_method = 'source_comparison') OR
    (review_status = 'human_reviewed' AND review_method = 'human_editorial_review')
  ),
  CHECK (provenance_classification <> 'licensed' OR review_status = 'human_reviewed'),
  PRIMARY KEY (version, id),
  UNIQUE (version, display_order)
);

CREATE TABLE catalog_localization (
  version TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'ko', 'es', 'zh-Hans')),
  display_name TEXT NOT NULL,
  normalized_display_name TEXT NOT NULL,
  PRIMARY KEY (version, exercise_id, locale),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id)
);

CREATE TABLE catalog_alias (
  version TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'ko', 'es', 'zh-Hans')),
  alias_order INTEGER NOT NULL CHECK (alias_order >= 0),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  PRIMARY KEY (version, exercise_id, locale, alias_order),
  UNIQUE (version, exercise_id, locale, normalized_alias),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id)
);

CREATE TABLE catalog_equipment (
  version TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('required', 'optional')),
  equipment_order INTEGER NOT NULL CHECK (equipment_order >= 0),
  equipment_id TEXT NOT NULL,
  PRIMARY KEY (version, exercise_id, role, equipment_order),
  UNIQUE (version, exercise_id, role, equipment_id),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id)
);

CREATE TABLE catalog_region (
  version TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
  region_order INTEGER NOT NULL CHECK (region_order >= 0),
  region_id TEXT NOT NULL CHECK (
    region_id IN ('chest', 'shoulders', 'back', 'biceps', 'triceps', 'core',
                  'glutes', 'quads', 'hamstrings', 'calves')
  ),
  PRIMARY KEY (version, exercise_id, role, region_order),
  UNIQUE (version, exercise_id, role, region_id),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id)
);

CREATE TABLE catalog_source (
  version TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  source_order INTEGER NOT NULL CHECK (source_order >= 0),
  source_type TEXT NOT NULL CHECK (
    source_type IN ('internal_editorial', 'official_guideline', 'peer_reviewed',
                    'public_domain', 'licensed_dataset')
  ),
  label TEXT NOT NULL,
  url TEXT,
  license TEXT,
  accessed_at_ms INTEGER,
  PRIMARY KEY (version, exercise_id, source_order),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id)
);

CREATE INDEX catalog_search_name
  ON catalog_localization(version, locale, normalized_display_name);
CREATE INDEX catalog_search_alias
  ON catalog_alias(version, locale, normalized_alias);
CREATE INDEX catalog_browse
  ON catalog_exercise(version, status, display_order);

-- A release always enters as a draft. Publication is one transaction: validate, set published
-- with published_at_ms, then insert/update catalog_channel('v1').
CREATE TRIGGER catalog_release_insert_draft_only
BEFORE INSERT ON catalog_release
WHEN NEW.state <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'catalog_release_must_start_draft');
END;

CREATE TRIGGER catalog_release_state_transition
BEFORE UPDATE OF state ON catalog_release
WHEN
  (OLD.state = 'draft' AND NEW.state NOT IN ('draft', 'published')) OR
  (OLD.state = 'published' AND NEW.state NOT IN ('published', 'withdrawn')) OR
  (OLD.state = 'withdrawn' AND NEW.state <> 'withdrawn')
BEGIN
  SELECT RAISE(ABORT, 'invalid_catalog_release_state_transition');
END;

CREATE TRIGGER catalog_release_published_payload_immutable
BEFORE UPDATE ON catalog_release
WHEN OLD.state IN ('published', 'withdrawn') AND (
  NEW.version IS NOT OLD.version OR
  NEW.schema_version IS NOT OLD.schema_version OR
  NEW.effective_at_ms IS NOT OLD.effective_at_ms OR
  NEW.checksum_hex IS NOT OLD.checksum_hex OR
  NEW.item_count IS NOT OLD.item_count OR
  NEW.payload_bytes IS NOT OLD.payload_bytes OR
  NEW.payload_json IS NOT OLD.payload_json OR
  NEW.created_at_ms IS NOT OLD.created_at_ms OR
  NEW.published_at_ms IS NOT OLD.published_at_ms
)
BEGIN
  SELECT RAISE(ABORT, 'published_catalog_release_is_immutable');
END;

CREATE TRIGGER catalog_release_published_delete_forbidden
BEFORE DELETE ON catalog_release
WHEN OLD.state <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'published_catalog_release_cannot_be_deleted');
END;

CREATE TRIGGER catalog_release_withdraw_after_pointer_move
BEFORE UPDATE OF state ON catalog_release
WHEN OLD.state = 'published' AND NEW.state = 'withdrawn'
  AND EXISTS (SELECT 1 FROM catalog_channel WHERE version = OLD.version)
BEGIN
  SELECT RAISE(ABORT, 'move_catalog_channel_before_withdrawal');
END;

CREATE TRIGGER catalog_channel_insert_published_only
BEFORE INSERT ON catalog_channel
WHEN NOT EXISTS (
  SELECT 1 FROM catalog_release WHERE version = NEW.version AND state = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'catalog_channel_requires_published_release');
END;

CREATE TRIGGER catalog_channel_update_published_only
BEFORE UPDATE OF version ON catalog_channel
WHEN NOT EXISTS (
  SELECT 1 FROM catalog_release WHERE version = NEW.version AND state = 'published'
)
BEGIN
  SELECT RAISE(ABORT, 'catalog_channel_requires_published_release');
END;

-- Normalized rows may change only while their release is a draft. The immutable payload BLOB is
-- the serving source of truth; these guards keep its inspectable projection from drifting later.
CREATE TRIGGER catalog_exercise_lock_insert BEFORE INSERT ON catalog_exercise
WHEN (SELECT state FROM catalog_release WHERE version = NEW.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
CREATE TRIGGER catalog_exercise_lock_update BEFORE UPDATE ON catalog_exercise
WHEN (SELECT state FROM catalog_release WHERE version = OLD.version) <> 'draft'
  OR (SELECT state FROM catalog_release WHERE version = NEW.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
CREATE TRIGGER catalog_exercise_lock_delete BEFORE DELETE ON catalog_exercise
WHEN (SELECT state FROM catalog_release WHERE version = OLD.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;

CREATE TRIGGER catalog_localization_lock_insert BEFORE INSERT ON catalog_localization
WHEN (SELECT state FROM catalog_release WHERE version = NEW.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
CREATE TRIGGER catalog_localization_lock_update BEFORE UPDATE ON catalog_localization
WHEN (SELECT state FROM catalog_release WHERE version = OLD.version) <> 'draft'
  OR (SELECT state FROM catalog_release WHERE version = NEW.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
CREATE TRIGGER catalog_localization_lock_delete BEFORE DELETE ON catalog_localization
WHEN (SELECT state FROM catalog_release WHERE version = OLD.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;

CREATE TRIGGER catalog_alias_lock_insert BEFORE INSERT ON catalog_alias
WHEN (SELECT state FROM catalog_release WHERE version = NEW.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
CREATE TRIGGER catalog_alias_lock_update BEFORE UPDATE ON catalog_alias
WHEN (SELECT state FROM catalog_release WHERE version = OLD.version) <> 'draft'
  OR (SELECT state FROM catalog_release WHERE version = NEW.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
CREATE TRIGGER catalog_alias_lock_delete BEFORE DELETE ON catalog_alias
WHEN (SELECT state FROM catalog_release WHERE version = OLD.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;

CREATE TRIGGER catalog_equipment_lock_insert BEFORE INSERT ON catalog_equipment
WHEN (SELECT state FROM catalog_release WHERE version = NEW.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
CREATE TRIGGER catalog_equipment_lock_update BEFORE UPDATE ON catalog_equipment
WHEN (SELECT state FROM catalog_release WHERE version = OLD.version) <> 'draft'
  OR (SELECT state FROM catalog_release WHERE version = NEW.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
CREATE TRIGGER catalog_equipment_lock_delete BEFORE DELETE ON catalog_equipment
WHEN (SELECT state FROM catalog_release WHERE version = OLD.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;

CREATE TRIGGER catalog_region_lock_insert BEFORE INSERT ON catalog_region
WHEN (SELECT state FROM catalog_release WHERE version = NEW.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
CREATE TRIGGER catalog_region_lock_update BEFORE UPDATE ON catalog_region
WHEN (SELECT state FROM catalog_release WHERE version = OLD.version) <> 'draft'
  OR (SELECT state FROM catalog_release WHERE version = NEW.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
CREATE TRIGGER catalog_region_lock_delete BEFORE DELETE ON catalog_region
WHEN (SELECT state FROM catalog_release WHERE version = OLD.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;

CREATE TRIGGER catalog_source_lock_insert BEFORE INSERT ON catalog_source
WHEN (SELECT state FROM catalog_release WHERE version = NEW.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
CREATE TRIGGER catalog_source_lock_update BEFORE UPDATE ON catalog_source
WHEN (SELECT state FROM catalog_release WHERE version = OLD.version) <> 'draft'
  OR (SELECT state FROM catalog_release WHERE version = NEW.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
CREATE TRIGGER catalog_source_lock_delete BEFORE DELETE ON catalog_source
WHEN (SELECT state FROM catalog_release WHERE version = OLD.version) <> 'draft'
BEGIN SELECT RAISE(ABORT, 'catalog_release_rows_are_immutable'); END;
