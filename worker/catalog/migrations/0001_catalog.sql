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
  draft_generation INTEGER NOT NULL DEFAULT 0 CHECK (draft_generation >= 0),
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
  tracking_mode TEXT NOT NULL
    CHECK (tracking_mode IN ('reps', 'duration', 'distance', 'duration_distance', 'intervals')),
  counting_convention TEXT NOT NULL
    CHECK (counting_convention IN ('total', 'per_side', 'not_applicable')),
  target_unit TEXT CHECK (
    target_unit IS NULL OR
    target_unit IN ('reps', 'seconds', 'minutes', 'meters', 'kilometers', 'rounds')
  ),
  target_low REAL,
  target_high REAL,
  provenance_classification TEXT NOT NULL
    CHECK (provenance_classification IN ('original_editorial', 'public_facts', 'licensed')),
  review_status TEXT NOT NULL
    CHECK (review_status IN ('unreviewed', 'source_checked', 'human_reviewed')),
  review_method TEXT NOT NULL
    CHECK (review_method IN ('none', 'source_comparison', 'human_editorial_review')),
  reviewed_by_role TEXT,
  review_evidence TEXT,
  reviewed_at_ms INTEGER,
  contains_third_party_copy INTEGER NOT NULL CHECK (contains_third_party_copy = 0),
  CHECK (effective_to_ms IS NULL OR effective_to_ms > effective_from_ms),
  CHECK (target_low IS NULL OR target_low >= 0),
  CHECK (target_high IS NULL OR target_high >= target_low),
  CHECK (
    (target_unit IS NULL AND target_low IS NULL AND target_high IS NULL) OR
    (target_unit IS NOT NULL AND target_low IS NOT NULL AND target_high IS NOT NULL)
  ),
  CHECK (
    (exercise_type = 'cardio' AND counting_convention = 'not_applicable') OR
    (exercise_type = 'strength' AND counting_convention IN ('total', 'per_side'))
  ),
  CHECK (
    exercise_type = 'cardio' OR
    tracking_mode = 'reps' OR
    (id = 'plank' AND tracking_mode = 'duration')
  ),
  CHECK (
    (tracking_mode = 'reps' AND target_unit = 'reps' AND target_low IS NOT NULL AND target_high IS NOT NULL) OR
    (tracking_mode = 'intervals' AND target_unit = 'rounds' AND target_low IS NOT NULL AND target_high IS NOT NULL) OR
    (tracking_mode = 'duration' AND (target_unit IS NULL OR target_unit IN ('seconds', 'minutes'))) OR
    (tracking_mode = 'distance' AND (target_unit IS NULL OR target_unit IN ('meters', 'kilometers'))) OR
    (tracking_mode = 'duration_distance' AND (
      target_unit IS NULL OR target_unit IN ('seconds', 'minutes', 'meters', 'kilometers')
    ))
  ),
  CHECK (
    (
      review_status = 'unreviewed' AND
      provenance_classification = 'original_editorial' AND
      review_method = 'none' AND
      reviewed_by_role IS NULL AND
      review_evidence IS NULL AND
      reviewed_at_ms IS NULL
    ) OR
    (
      review_status = 'source_checked' AND
      review_method = 'source_comparison' AND
      reviewed_by_role IS NOT NULL AND
      length(reviewed_by_role) > 0 AND
      review_evidence IS NOT NULL AND
      length(review_evidence) > 0 AND
      reviewed_at_ms IS NOT NULL AND
      reviewed_at_ms > 0
    ) OR
    (
      review_status = 'human_reviewed' AND
      review_method = 'human_editorial_review' AND
      reviewed_by_role IS NOT NULL AND
      length(reviewed_by_role) > 0 AND
      review_evidence IS NOT NULL AND
      length(review_evidence) > 0 AND
      reviewed_at_ms IS NOT NULL AND
      reviewed_at_ms > 0
    )
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

-- Unreviewed rows have no exercise-specific citation. General program/safety references live
-- outside these normalized row tables and cannot be used to manufacture source_checked status.
CREATE TRIGGER catalog_source_unreviewed_insert_forbidden
BEFORE INSERT ON catalog_source
WHEN EXISTS (
  SELECT 1
  FROM catalog_exercise
  WHERE version = NEW.version
    AND id = NEW.exercise_id
    AND review_status = 'unreviewed'
)
BEGIN
  SELECT RAISE(ABORT, 'unreviewed_catalog_exercise_cannot_have_sources');
END;

CREATE TRIGGER catalog_source_unreviewed_retarget_forbidden
BEFORE UPDATE OF version, exercise_id ON catalog_source
WHEN EXISTS (
  SELECT 1
  FROM catalog_exercise
  WHERE version = NEW.version
    AND id = NEW.exercise_id
    AND review_status = 'unreviewed'
)
BEGIN
  SELECT RAISE(ABORT, 'unreviewed_catalog_exercise_cannot_have_sources');
END;

CREATE TRIGGER catalog_exercise_unreviewed_with_sources_forbidden
BEFORE UPDATE OF review_status, review_method, reviewed_by_role, review_evidence, reviewed_at_ms
ON catalog_exercise
WHEN NEW.review_status = 'unreviewed'
  AND EXISTS (
    SELECT 1
    FROM catalog_source
    WHERE version = OLD.version AND exercise_id = OLD.id
  )
BEGIN
  SELECT RAISE(ABORT, 'remove_catalog_sources_before_marking_unreviewed');
END;

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

-- Publication may change only state and published_at_ms. Folding a metadata/payload mutation into
-- the same UPDATE would otherwise bypass both the draft generation counter and the published-row
-- immutability trigger because the statement crosses their OLD/NEW state predicates.
CREATE TRIGGER catalog_release_publish_metadata_unchanged
BEFORE UPDATE OF state ON catalog_release
WHEN OLD.state = 'draft' AND NEW.state = 'published'
  AND (
    NEW.version IS NOT OLD.version OR
    NEW.schema_version IS NOT OLD.schema_version OR
    NEW.effective_at_ms IS NOT OLD.effective_at_ms OR
    NEW.checksum_hex IS NOT OLD.checksum_hex OR
    NEW.item_count IS NOT OLD.item_count OR
    NEW.payload_bytes IS NOT OLD.payload_bytes OR
    NEW.payload_json IS NOT OLD.payload_json OR
    NEW.created_at_ms IS NOT OLD.created_at_ms OR
    NEW.draft_generation IS NOT OLD.draft_generation
  )
BEGIN
  SELECT RAISE(ABORT, 'catalog_release_publish_cannot_change_metadata');
END;

-- The publisher verifies the exact draft through a separate readback connection. Every mutable
-- release field and normalized row advances this counter so the final publication UPDATE can use
-- it as a compare-and-swap token and fail closed if anything changed after verification.
CREATE TRIGGER catalog_release_draft_generation_step
BEFORE UPDATE OF draft_generation ON catalog_release
WHEN OLD.state = 'draft' AND NEW.state = 'draft'
  AND NEW.draft_generation <> OLD.draft_generation + 1
BEGIN
  SELECT RAISE(ABORT, 'catalog_release_draft_generation_must_advance_once');
END;

CREATE TRIGGER catalog_release_draft_generation_update
AFTER UPDATE OF version, schema_version, effective_at_ms, checksum_hex, item_count,
                payload_bytes, payload_json, created_at_ms
ON catalog_release
WHEN OLD.state = 'draft' AND NEW.state = 'draft'
BEGIN
  UPDATE catalog_release
  SET draft_generation = draft_generation + 1
  WHERE version = NEW.version AND state = 'draft';
END;

CREATE TRIGGER catalog_release_publish_requires_complete_provenance
BEFORE UPDATE OF state ON catalog_release
WHEN OLD.state = 'draft' AND NEW.state = 'published'
  AND EXISTS (
    SELECT 1
    FROM catalog_exercise AS exercise
    WHERE exercise.version = OLD.version
      AND (
        (
          exercise.review_status = 'unreviewed'
          AND EXISTS (
            SELECT 1 FROM catalog_source AS source
            WHERE source.version = exercise.version AND source.exercise_id = exercise.id
          )
        ) OR
        (
          exercise.review_status IN ('source_checked', 'human_reviewed')
          AND NOT EXISTS (
            SELECT 1 FROM catalog_source AS source
            WHERE source.version = exercise.version AND source.exercise_id = exercise.id
          )
        ) OR
        (
          exercise.provenance_classification = 'licensed'
          AND NOT EXISTS (
            SELECT 1 FROM catalog_source AS source
            WHERE source.version = exercise.version
              AND source.exercise_id = exercise.id
              AND length(trim(source.license)) > 0
          )
        )
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'catalog_release_has_incomplete_provenance');
END;

-- Publishing never trusts release metadata alone. The exact response BLOB remains the serving
-- source of truth, but its normalized management projection must be complete and internally
-- searchable before the release can become channel-eligible.
CREATE TRIGGER catalog_release_publish_requires_complete_projection
BEFORE UPDATE OF state ON catalog_release
WHEN OLD.state = 'draft' AND NEW.state = 'published'
  AND (
    (SELECT count(*) FROM catalog_exercise WHERE version = OLD.version) <> OLD.item_count
    OR EXISTS (
      SELECT 1
      FROM catalog_exercise AS exercise
      WHERE exercise.version = OLD.version
        AND (
          (SELECT count(*) FROM catalog_localization AS localization
           WHERE localization.version = exercise.version
             AND localization.exercise_id = exercise.id) <> 4
          OR (exercise.exercise_type = 'strength' AND NOT EXISTS (
            SELECT 1 FROM catalog_region AS region
            WHERE region.version = exercise.version
              AND region.exercise_id = exercise.id
              AND region.role = 'primary'
          ))
          OR (exercise.exercise_type = 'strength' AND exercise.is_bodyweight = 0 AND NOT EXISTS (
            SELECT 1 FROM catalog_equipment AS equipment
            WHERE equipment.version = exercise.version
              AND equipment.exercise_id = exercise.id
              AND equipment.role = 'required'
          ))
          OR (exercise.status = 'active' AND (
            exercise.effective_to_ms IS NOT NULL OR exercise.replacement_id IS NOT NULL
          ))
          OR (exercise.status = 'deprecated' AND exercise.effective_to_ms IS NOT NULL)
          OR (exercise.replacement_id IS NOT NULL AND (
            exercise.replacement_id = exercise.id OR NOT EXISTS (
              SELECT 1 FROM catalog_exercise AS replacement
              WHERE replacement.version = exercise.version
                AND replacement.id = exercise.replacement_id
                AND replacement.status = 'active'
            )
          ))
        )
    )
    OR EXISTS (
      SELECT 1
      FROM catalog_localization AS localization
      WHERE localization.version = OLD.version
        AND NOT EXISTS (
          SELECT 1 FROM catalog_alias AS alias
          WHERE alias.version = localization.version
            AND alias.exercise_id = localization.exercise_id
            AND alias.locale = localization.locale
        )
    )
    OR EXISTS (
      SELECT 1
      FROM catalog_alias AS first
      JOIN catalog_alias AS second
        ON second.version = first.version
       AND second.locale = first.locale
       AND second.normalized_alias = first.normalized_alias
       AND second.exercise_id <> first.exercise_id
      WHERE first.version = OLD.version
    )
    OR EXISTS (
      SELECT 1
      FROM catalog_localization AS first
      JOIN catalog_localization AS second
        ON second.version = first.version
       AND second.locale = first.locale
       AND second.normalized_display_name = first.normalized_display_name
       AND second.exercise_id <> first.exercise_id
      WHERE first.version = OLD.version
    )
    OR EXISTS (
      SELECT 1
      FROM catalog_alias AS alias
      JOIN catalog_localization AS localization
        ON localization.version = alias.version
       AND localization.locale = alias.locale
       AND localization.normalized_display_name = alias.normalized_alias
       AND localization.exercise_id <> alias.exercise_id
      WHERE alias.version = OLD.version
    )
    OR EXISTS (
      SELECT 1
      FROM catalog_equipment AS required
      JOIN catalog_equipment AS optional
        ON optional.version = required.version
       AND optional.exercise_id = required.exercise_id
       AND optional.equipment_id = required.equipment_id
       AND optional.role = 'optional'
      WHERE required.version = OLD.version AND required.role = 'required'
    )
    OR EXISTS (
      SELECT 1
      FROM catalog_region AS primary_region
      JOIN catalog_region AS secondary_region
        ON secondary_region.version = primary_region.version
       AND secondary_region.exercise_id = primary_region.exercise_id
       AND secondary_region.region_id = primary_region.region_id
       AND secondary_region.role = 'secondary'
      WHERE primary_region.version = OLD.version AND primary_region.role = 'primary'
    )
    OR EXISTS (
      SELECT 1
      FROM catalog_exercise AS exercise
      WHERE exercise.version = OLD.version
        AND (exercise.display_order < 1 OR exercise.display_order > OLD.item_count)
    )
    OR EXISTS (
      SELECT 1 FROM (
        SELECT version, exercise_id, locale, count(*) AS child_count,
               min(alias_order) AS first_order, max(alias_order) AS last_order
        FROM catalog_alias WHERE version = OLD.version
        GROUP BY version, exercise_id, locale
      ) WHERE first_order <> 0 OR last_order <> child_count - 1
    )
    OR EXISTS (
      SELECT 1 FROM (
        SELECT version, exercise_id, role, count(*) AS child_count,
               min(equipment_order) AS first_order, max(equipment_order) AS last_order
        FROM catalog_equipment WHERE version = OLD.version
        GROUP BY version, exercise_id, role
      ) WHERE first_order <> 0 OR last_order <> child_count - 1
    )
    OR EXISTS (
      SELECT 1 FROM (
        SELECT version, exercise_id, role, count(*) AS child_count,
               min(region_order) AS first_order, max(region_order) AS last_order
        FROM catalog_region WHERE version = OLD.version
        GROUP BY version, exercise_id, role
      ) WHERE first_order <> 0 OR last_order <> child_count - 1
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'catalog_release_has_incomplete_projection');
END;

-- A full snapshot is a lineage, not a bag of unrelated rows. Compare a draft with the currently
-- active channel while the pointer still names the previous release. Exact semantic revision
-- equality is additionally checked by the publisher against the immutable payloads.
CREATE TRIGGER catalog_release_publish_requires_valid_lineage
BEFORE UPDATE OF state ON catalog_release
WHEN OLD.state = 'draft' AND NEW.state = 'published'
  AND (
    -- The first published snapshot starts every identity at revision one and cannot claim an
    -- identity became effective after its own release instant.
    (
      NOT EXISTS (SELECT 1 FROM catalog_channel WHERE channel = 'v1')
      AND EXISTS (
        SELECT 1 FROM catalog_exercise AS candidate
        WHERE candidate.version = OLD.version
          AND (
            candidate.record_revision <> 1
            OR candidate.effective_from_ms > OLD.effective_at_ms
          )
      )
    )
    OR
    -- Historic IDs remain resolvable in every later complete snapshot.
    EXISTS (
      SELECT 1
      FROM catalog_channel AS channel
      JOIN catalog_exercise AS prior ON prior.version = channel.version
      WHERE channel.channel = 'v1'
        AND NOT EXISTS (
          SELECT 1 FROM catalog_exercise AS candidate
          WHERE candidate.version = OLD.version AND candidate.id = prior.id
        )
    )
    OR
    -- New IDs start at one. Existing IDs may retain their revision or advance exactly once.
    EXISTS (
      SELECT 1
      FROM catalog_exercise AS candidate
      JOIN catalog_channel AS channel ON channel.channel = 'v1'
      JOIN catalog_release AS current_release ON current_release.version = channel.version
      LEFT JOIN catalog_exercise AS prior
        ON prior.version = channel.version AND prior.id = candidate.id
      WHERE candidate.version = OLD.version
        AND (
          (
            prior.id IS NULL
            AND (
              candidate.record_revision <> 1
              OR candidate.status <> 'active'
              OR candidate.effective_from_ms <= current_release.effective_at_ms
              OR candidate.effective_from_ms > OLD.effective_at_ms
            )
          )
          OR (
            prior.id IS NOT NULL
            AND candidate.record_revision <> prior.record_revision
            AND candidate.record_revision <> prior.record_revision + 1
          )
          OR (
            prior.id IS NOT NULL
            AND candidate.effective_from_ms IS NOT prior.effective_from_ms
          )
          OR (
            prior.id IS NOT NULL
            AND (
              CASE candidate.status
                WHEN 'active' THEN 0 WHEN 'deprecated' THEN 1 ELSE 2
              END
                < CASE prior.status
                  WHEN 'active' THEN 0 WHEN 'deprecated' THEN 1 ELSE 2
                END
              OR CASE candidate.status
                   WHEN 'active' THEN 0 WHEN 'deprecated' THEN 1 ELSE 2
                 END
                   > CASE prior.status
                       WHEN 'active' THEN 0 WHEN 'deprecated' THEN 1 ELSE 2
                     END + 1
            )
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM catalog_exercise AS candidate
      WHERE candidate.version = OLD.version
        AND candidate.status = 'retired'
        AND (
          candidate.effective_to_ms IS NULL
          OR candidate.effective_to_ms > OLD.effective_at_ms
        )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'catalog_release_has_invalid_lineage');
END;

-- These fields determine how an existing set/cardio row is interpreted. A correction that changes
-- one of them needs a replacement ID; a record-revision bump cannot reinterpret historic logs.
CREATE TRIGGER catalog_release_publish_preserves_log_identity
BEFORE UPDATE OF state ON catalog_release
WHEN OLD.state = 'draft' AND NEW.state = 'published'
  AND EXISTS (
    SELECT 1
    FROM catalog_exercise AS candidate
    JOIN catalog_exercise AS prior ON prior.id = candidate.id AND prior.version <> candidate.version
    JOIN catalog_release AS prior_release ON prior_release.version = prior.version
    WHERE candidate.version = OLD.version
      AND prior_release.state IN ('published', 'withdrawn')
      AND (
        candidate.exercise_type IS NOT prior.exercise_type OR
        candidate.is_bodyweight IS NOT prior.is_bodyweight OR
        candidate.tracking_mode IS NOT prior.tracking_mode OR
        candidate.counting_convention IS NOT prior.counting_convention OR
        candidate.target_unit IS NOT prior.target_unit
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'catalog_exercise_log_identity_requires_replacement_id');
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
  NEW.published_at_ms IS NOT OLD.published_at_ms OR
  NEW.draft_generation IS NOT OLD.draft_generation
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

CREATE TRIGGER catalog_channel_delete_forbidden
BEFORE DELETE ON catalog_channel
BEGIN
  SELECT RAISE(ABORT, 'catalog_channel_cannot_be_deleted');
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

-- Draft mutation counters. Inserts/deletes touch one release; updates may move a draft row between
-- releases, so both old and new parents advance (or one row advances once when the version matches).
CREATE TRIGGER catalog_exercise_generation_insert AFTER INSERT ON catalog_exercise
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version = NEW.version AND state = 'draft'; END;
CREATE TRIGGER catalog_exercise_generation_update AFTER UPDATE ON catalog_exercise
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version IN (OLD.version, NEW.version) AND state = 'draft'; END;
CREATE TRIGGER catalog_exercise_generation_delete AFTER DELETE ON catalog_exercise
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version = OLD.version AND state = 'draft'; END;

CREATE TRIGGER catalog_localization_generation_insert AFTER INSERT ON catalog_localization
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version = NEW.version AND state = 'draft'; END;
CREATE TRIGGER catalog_localization_generation_update AFTER UPDATE ON catalog_localization
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version IN (OLD.version, NEW.version) AND state = 'draft'; END;
CREATE TRIGGER catalog_localization_generation_delete AFTER DELETE ON catalog_localization
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version = OLD.version AND state = 'draft'; END;

CREATE TRIGGER catalog_alias_generation_insert AFTER INSERT ON catalog_alias
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version = NEW.version AND state = 'draft'; END;
CREATE TRIGGER catalog_alias_generation_update AFTER UPDATE ON catalog_alias
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version IN (OLD.version, NEW.version) AND state = 'draft'; END;
CREATE TRIGGER catalog_alias_generation_delete AFTER DELETE ON catalog_alias
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version = OLD.version AND state = 'draft'; END;

CREATE TRIGGER catalog_equipment_generation_insert AFTER INSERT ON catalog_equipment
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version = NEW.version AND state = 'draft'; END;
CREATE TRIGGER catalog_equipment_generation_update AFTER UPDATE ON catalog_equipment
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version IN (OLD.version, NEW.version) AND state = 'draft'; END;
CREATE TRIGGER catalog_equipment_generation_delete AFTER DELETE ON catalog_equipment
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version = OLD.version AND state = 'draft'; END;

CREATE TRIGGER catalog_region_generation_insert AFTER INSERT ON catalog_region
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version = NEW.version AND state = 'draft'; END;
CREATE TRIGGER catalog_region_generation_update AFTER UPDATE ON catalog_region
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version IN (OLD.version, NEW.version) AND state = 'draft'; END;
CREATE TRIGGER catalog_region_generation_delete AFTER DELETE ON catalog_region
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version = OLD.version AND state = 'draft'; END;

CREATE TRIGGER catalog_source_generation_insert AFTER INSERT ON catalog_source
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version = NEW.version AND state = 'draft'; END;
CREATE TRIGGER catalog_source_generation_update AFTER UPDATE ON catalog_source
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version IN (OLD.version, NEW.version) AND state = 'draft'; END;
CREATE TRIGGER catalog_source_generation_delete AFTER DELETE ON catalog_source
BEGIN UPDATE catalog_release SET draft_generation = draft_generation + 1
  WHERE version = OLD.version AND state = 'draft'; END;
