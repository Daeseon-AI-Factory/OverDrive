import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const migration = await readFile(new URL('../catalog/migrations/0001_catalog.sql', import.meta.url), 'utf8');
const config = await readFile(new URL('../catalog/wrangler.template.toml', import.meta.url), 'utf8');
const LOCALES = ['en', 'ko', 'es', 'zh-Hans'];

const EXERCISE_COLUMNS = [
  'version',
  'id',
  'record_revision',
  'status',
  'effective_from_ms',
  'effective_to_ms',
  'replacement_id',
  'display_order',
  'exercise_type',
  'is_bodyweight',
  'movement_pattern',
  'difficulty',
  'default_sets',
  'tracking_mode',
  'counting_convention',
  'target_unit',
  'target_low',
  'target_high',
  'provenance_classification',
  'review_status',
  'review_method',
  'reviewed_by_role',
  'review_evidence',
  'reviewed_at_ms',
  'contains_third_party_copy',
];

function testDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(migration);
  database.exec(`
    INSERT INTO catalog_release (
      version, schema_version, effective_at_ms, checksum_hex, item_count,
      payload_bytes, payload_json, state, created_at_ms, published_at_ms
    ) VALUES (
      '1.0.0', '1.0.0', 1783987200000, '${'a'.repeat(64)}', 32,
      1, X'7b', 'draft', 1783987200000, NULL
    );
  `);
  return database;
}

function insertExercise(database, overrides = {}) {
  const row = {
    version: '1.0.0',
    id: 'test_exercise',
    record_revision: 1,
    status: 'active',
    effective_from_ms: 1783987200000,
    effective_to_ms: null,
    replacement_id: null,
    display_order: 1,
    exercise_type: 'strength',
    is_bodyweight: 0,
    movement_pattern: 'squat',
    difficulty: 'beginner',
    default_sets: 3,
    tracking_mode: 'reps',
    counting_convention: 'total',
    target_unit: 'reps',
    target_low: 8,
    target_high: 12,
    provenance_classification: 'original_editorial',
    review_status: 'unreviewed',
    review_method: 'none',
    reviewed_by_role: null,
    review_evidence: null,
    reviewed_at_ms: null,
    contains_third_party_copy: 0,
    ...overrides,
  };
  const placeholders = EXERCISE_COLUMNS.map(() => '?').join(', ');
  return database
    .prepare(`INSERT INTO catalog_exercise (${EXERCISE_COLUMNS.join(', ')}) VALUES (${placeholders})`)
    .run(...EXERCISE_COLUMNS.map((column) => row[column]));
}

function insertSource(database, exerciseId, overrides = {}) {
  const source = {
    source_order: 0,
    source_type: 'peer_reviewed',
    label: 'Exercise-specific test review',
    url: 'https://example.test/exercise-review',
    license: null,
    accessed_at_ms: 1783987200000,
    ...overrides,
  };
  return database.prepare(`
    INSERT INTO catalog_source (
      version, exercise_id, source_order, source_type, label, url, license, accessed_at_ms
    ) VALUES ('1.0.0', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    exerciseId,
    source.source_order,
    source.source_type,
    source.label,
    source.url,
    source.license,
    source.accessed_at_ms,
  );
}

function insertProjectionChildren(database, version, exerciseId) {
  const exercise = database.prepare(`
    SELECT exercise_type, is_bodyweight FROM catalog_exercise
    WHERE version = ? AND id = ?
  `).get(version, exerciseId);
  for (const locale of LOCALES) {
    database.prepare(`
      INSERT OR IGNORE INTO catalog_localization (
        version, exercise_id, locale, display_name, normalized_display_name
      ) VALUES (?, ?, ?, ?, ?)
    `).run(version, exerciseId, locale, `${exerciseId} ${locale}`, `${exerciseId}${locale}`);
    database.prepare(`
      INSERT OR IGNORE INTO catalog_alias (
        version, exercise_id, locale, alias_order, alias, normalized_alias
      ) VALUES (?, ?, ?, 0, ?, ?)
    `).run(version, exerciseId, locale, `alias ${exerciseId} ${locale}`, `alias${exerciseId}${locale}`);
  }
  if (exercise.exercise_type === 'strength') {
    database.prepare(`
      INSERT OR IGNORE INTO catalog_region (
        version, exercise_id, role, region_order, region_id
      ) VALUES (?, ?, 'primary', 0, 'chest')
    `).run(version, exerciseId);
    if (exercise.is_bodyweight === 0) {
      database.prepare(`
        INSERT OR IGNORE INTO catalog_equipment (
          version, exercise_id, role, equipment_order, equipment_id
        ) VALUES (?, ?, 'required', 0, 'external_resistance')
      `).run(version, exerciseId);
    }
  }
}

function completeProjection(database, version = '1.0.0') {
  const release = database.prepare(`SELECT item_count FROM catalog_release WHERE version = ?`).get(version);
  const existing = database.prepare(`
    SELECT id, display_order FROM catalog_exercise WHERE version = ? ORDER BY display_order
  `).all(version);
  for (const row of existing) insertProjectionChildren(database, version, row.id);
  const usedOrders = new Set(existing.map((row) => row.display_order));
  for (let order = 1; order <= release.item_count; order += 1) {
    if (usedOrders.has(order)) continue;
    const id = `filler_${order}`;
    insertExercise(database, { version, id, display_order: order });
    insertProjectionChildren(database, version, id);
  }
}

function publishAndPoint(database, version) {
  const release = database.prepare(`
    SELECT effective_at_ms FROM catalog_release WHERE version = ?
  `).get(version);
  database.prepare(`
    UPDATE catalog_release
    SET state = 'published', published_at_ms = ?
    WHERE version = ?
  `).run(release.effective_at_ms, version);
  database.prepare(`
    INSERT INTO catalog_channel (channel, version) VALUES ('v1', ?)
    ON CONFLICT(channel) DO UPDATE SET version = excluded.version
  `).run(version);
}

function cloneDraft(database, fromVersion, toVersion, effectiveAtMs, checksumCharacter) {
  database.prepare(`
    INSERT INTO catalog_release (
      version, schema_version, effective_at_ms, checksum_hex, item_count,
      payload_bytes, payload_json, state, created_at_ms, published_at_ms
    )
    SELECT ?, schema_version, ?, ?, item_count,
           payload_bytes, payload_json, 'draft', ?, NULL
    FROM catalog_release WHERE version = ?
  `).run(toVersion, effectiveAtMs, checksumCharacter.repeat(64), effectiveAtMs, fromVersion);

  database.prepare(`
    INSERT INTO catalog_exercise (${EXERCISE_COLUMNS.join(', ')})
    SELECT ?, ${EXERCISE_COLUMNS.slice(1).join(', ')}
    FROM catalog_exercise WHERE version = ?
  `).run(toVersion, fromVersion);
  for (const [table, columns] of [
    ['catalog_localization', 'exercise_id, locale, display_name, normalized_display_name'],
    ['catalog_alias', 'exercise_id, locale, alias_order, alias, normalized_alias'],
    ['catalog_equipment', 'exercise_id, role, equipment_order, equipment_id'],
    ['catalog_region', 'exercise_id, role, region_order, region_id'],
    ['catalog_source', 'exercise_id, source_order, source_type, label, url, license, accessed_at_ms'],
  ]) {
    database.prepare(`
      INSERT INTO ${table} (version, ${columns})
      SELECT ?, ${columns} FROM ${table} WHERE version = ?
    `).run(toVersion, fromVersion);
  }
}

function futureDatabase(initialExerciseOverrides = {}) {
  const database = testDatabase();
  insertExercise(database, initialExerciseOverrides);
  completeProjection(database);
  publishAndPoint(database, '1.0.0');
  cloneDraft(database, '1.0.0', '1.0.1', 1783987201000, 'b');
  return database;
}

function deleteProjectionExercise(database, version, exerciseId) {
  for (const table of [
    'catalog_source',
    'catalog_alias',
    'catalog_localization',
    'catalog_equipment',
    'catalog_region',
  ]) {
    database.prepare(`DELETE FROM ${table} WHERE version = ? AND exercise_id = ?`)
      .run(version, exerciseId);
  }
  database.prepare(`DELETE FROM catalog_exercise WHERE version = ? AND id = ?`)
    .run(version, exerciseId);
}

function publishDraft(database, version, publishedAtMs) {
  database.prepare(`
    UPDATE catalog_release SET state = 'published', published_at_ms = ? WHERE version = ?
  `).run(publishedAtMs, version);
}

test('catalog migration stores exact payload bytes as a bounded BLOB behind a channel pointer', () => {
  assert.match(migration, /CREATE TABLE catalog_release/u);
  assert.match(migration, /payload_json BLOB NOT NULL/u);
  assert.match(migration, /typeof\(payload_json\) = 'blob'/u);
  assert.match(migration, /length\(payload_json\) = payload_bytes/u);
  assert.match(migration, /payload_bytes BETWEEN 1 AND 524288/u);
  assert.match(migration, /item_count BETWEEN 32 AND 512/u);
  assert.match(migration, /CREATE TABLE catalog_channel/u);
  assert.match(migration, /channel TEXT PRIMARY KEY CHECK \(channel = 'v1'\)/u);
});

test('catalog migration stores counting convention and exact provenance tuples', () => {
  assert.match(
    migration,
    /counting_convention TEXT NOT NULL\s+CHECK \(counting_convention IN \('total', 'per_side', 'not_applicable'\)\)/u,
  );
  assert.match(migration, /review_status IN \('unreviewed', 'source_checked', 'human_reviewed'\)/u);
  assert.match(migration, /review_method IN \('none', 'source_comparison', 'human_editorial_review'\)/u);
  assert.match(migration, /reviewed_by_role TEXT,/u);
  assert.match(migration, /review_evidence TEXT,/u);
  assert.match(migration, /reviewed_at_ms INTEGER,/u);
  assert.match(migration, /review_status = 'unreviewed'[\s\S]*provenance_classification = 'original_editorial'/u);
  assert.match(migration, /catalog_source_unreviewed_insert_forbidden/u);
  assert.match(migration, /catalog_exercise_unreviewed_with_sources_forbidden/u);
  assert.match(migration, /catalog_release_publish_requires_complete_provenance/u);
});

test('SQLite accepts only the canonical unreviewed tuple and forbids row sources', () => {
  const database = testDatabase();
  try {
    assert.equal(database.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    insertExercise(database);
    assert.deepEqual(
      { ...database.prepare(`
        SELECT review_status, review_method,
               reviewed_by_role IS NULL AS role_is_null,
               review_evidence IS NULL AS evidence_is_null,
               reviewed_at_ms IS NULL AS reviewed_at_is_null,
               counting_convention
        FROM catalog_exercise WHERE id = 'test_exercise'
      `).get() },
      {
        review_status: 'unreviewed',
        review_method: 'none',
        role_is_null: 1,
        evidence_is_null: 1,
        reviewed_at_is_null: 1,
        counting_convention: 'total',
      },
    );
    assert.throws(
      () => insertSource(database, 'test_exercise'),
      /unreviewed_catalog_exercise_cannot_have_sources/u,
    );
    assert.throws(
      () => insertExercise(database, {
        id: 'public_unreviewed',
        display_order: 2,
        provenance_classification: 'public_facts',
      }),
      /constraint failed/iu,
    );
    assert.throws(
      () => insertExercise(database, {
        id: 'fake_reviewer',
        display_order: 3,
        reviewed_by_role: 'catalog-agent',
      }),
      /constraint failed/iu,
    );
    assert.throws(
      () => insertExercise(database, {
        id: 'bad_counting',
        display_order: 4,
        counting_convention: 'left_then_right',
      }),
      /constraint failed/iu,
    );
  } finally {
    database.close();
  }
});

test('SQLite preserves reviewed/licensed tuples and requires their sources before publish', () => {
  const database = testDatabase();
  try {
    assert.throws(
      () => insertExercise(database, {
        id: 'incomplete_source_check',
        review_status: 'source_checked',
        review_method: 'source_comparison',
      }),
      /constraint failed/iu,
    );
    insertExercise(database, {
      id: 'source_checked',
      review_status: 'source_checked',
      review_method: 'source_comparison',
      reviewed_by_role: 'catalog-source-reviewer',
      review_evidence: 'exercise-review-1',
      reviewed_at_ms: 1783987200000,
    });
    completeProjection(database);
    assert.throws(
      () => database.exec(`
        UPDATE catalog_release
        SET state = 'published', published_at_ms = 1783987200000
        WHERE version = '1.0.0';
      `),
      /catalog_release_has_incomplete_provenance/u,
    );
    insertSource(database, 'source_checked');
    database.exec(`
      UPDATE catalog_release
      SET state = 'published', published_at_ms = 1783987200000
      WHERE version = '1.0.0';
    `);
    assert.equal(
      database.prepare(`SELECT state FROM catalog_release WHERE version = '1.0.0'`).get().state,
      'published',
    );
  } finally {
    database.close();
  }

  const licensedDatabase = testDatabase();
  try {
    assert.throws(
      () => insertExercise(licensedDatabase, {
        id: 'licensed_source_check',
        provenance_classification: 'licensed',
        review_status: 'source_checked',
        review_method: 'source_comparison',
        reviewed_by_role: 'catalog-source-reviewer',
        review_evidence: 'exercise-review-1',
        reviewed_at_ms: 1783987200000,
      }),
      /constraint failed/iu,
    );
    insertExercise(licensedDatabase, {
      id: 'licensed_row',
      provenance_classification: 'licensed',
      review_status: 'human_reviewed',
      review_method: 'human_editorial_review',
      reviewed_by_role: 'catalog-human-editor',
      review_evidence: 'human-approval-1',
      reviewed_at_ms: 1783987200000,
    });
    completeProjection(licensedDatabase);
    insertSource(licensedDatabase, 'licensed_row', { source_type: 'licensed_dataset' });
    assert.throws(
      () => licensedDatabase.exec(`
        UPDATE catalog_release
        SET state = 'published', published_at_ms = 1783987200000
        WHERE version = '1.0.0';
      `),
      /catalog_release_has_incomplete_provenance/u,
    );
    licensedDatabase.exec(`
      UPDATE catalog_source SET license = 'commercial-test-license'
      WHERE version = '1.0.0' AND exercise_id = 'licensed_row';
      UPDATE catalog_release
      SET state = 'published', published_at_ms = 1783987200000
      WHERE version = '1.0.0';
    `);
    assert.equal(
      licensedDatabase.prepare(`SELECT state FROM catalog_release WHERE version = '1.0.0'`).get().state,
      'published',
    );
  } finally {
    licensedDatabase.close();
  }
});

test('SQLite rejects incomplete management projections before publication', () => {
  const emptyDatabase = testDatabase();
  try {
    assert.throws(
      () => emptyDatabase.exec(`
        UPDATE catalog_release
        SET state = 'published', published_at_ms = 1783987200000
        WHERE version = '1.0.0';
      `),
      /catalog_release_has_incomplete_projection/u,
    );
  } finally {
    emptyDatabase.close();
  }

  const database = testDatabase();
  try {
    insertExercise(database);
    completeProjection(database);
    database.exec(`
      DELETE FROM catalog_alias
      WHERE version = '1.0.0' AND exercise_id = 'test_exercise' AND locale = 'en';
    `);
    assert.throws(
      () => database.exec(`
        UPDATE catalog_release
        SET state = 'published', published_at_ms = 1783987200000
        WHERE version = '1.0.0';
      `),
      /catalog_release_has_incomplete_projection/u,
    );
  } finally {
    database.close();
  }
});

test('SQLite publishes only a complete projection and freezes historic log identity', () => {
  const database = testDatabase();
  try {
    insertExercise(database);
    completeProjection(database);
    database.exec(`
      UPDATE catalog_release
      SET state = 'published', published_at_ms = 1783987200000
      WHERE version = '1.0.0';
      INSERT INTO catalog_channel (channel, version) VALUES ('v1', '1.0.0');

      INSERT INTO catalog_release (
        version, schema_version, effective_at_ms, checksum_hex, item_count,
        payload_bytes, payload_json, state, created_at_ms, published_at_ms
      ) VALUES (
        '1.0.1', '1.0.0', 1783987201000, '${'b'.repeat(64)}', 32,
        1, X'7b', 'draft', 1783987201000, NULL
      );
      INSERT INTO catalog_exercise
      SELECT '1.0.1', id, record_revision + 1, status, effective_from_ms, effective_to_ms,
             replacement_id, display_order, exercise_type, is_bodyweight, movement_pattern,
             difficulty, default_sets, tracking_mode, counting_convention, target_unit,
             target_low, target_high, provenance_classification, review_status, review_method,
             reviewed_by_role, review_evidence, reviewed_at_ms, contains_third_party_copy
      FROM catalog_exercise WHERE version = '1.0.0';
      INSERT INTO catalog_localization
      SELECT '1.0.1', exercise_id, locale, display_name, normalized_display_name
      FROM catalog_localization WHERE version = '1.0.0';
      INSERT INTO catalog_alias
      SELECT '1.0.1', exercise_id, locale, alias_order, alias, normalized_alias
      FROM catalog_alias WHERE version = '1.0.0';
      INSERT INTO catalog_equipment
      SELECT '1.0.1', exercise_id, role, equipment_order, equipment_id
      FROM catalog_equipment WHERE version = '1.0.0';
      INSERT INTO catalog_region
      SELECT '1.0.1', exercise_id, role, region_order, region_id
      FROM catalog_region WHERE version = '1.0.0';
      UPDATE catalog_exercise SET counting_convention = 'per_side'
      WHERE version = '1.0.1' AND id = 'test_exercise';
    `);
    assert.throws(
      () => database.exec(`
        UPDATE catalog_release
        SET state = 'published', published_at_ms = 1783987201000
        WHERE version = '1.0.1';
      `),
      /catalog_exercise_log_identity_requires_replacement_id/u,
    );
  } finally {
    database.close();
  }
});

test('SQLite prevents changing a sourced reviewed row to unreviewed', () => {
  const database = testDatabase();
  try {
    insertExercise(database, {
      id: 'source_checked',
      review_status: 'source_checked',
      review_method: 'source_comparison',
      reviewed_by_role: 'catalog-source-reviewer',
      review_evidence: 'exercise-review-1',
      reviewed_at_ms: 1783987200000,
    });
    insertSource(database, 'source_checked');
    assert.throws(
      () => database.exec(`
        UPDATE catalog_exercise
        SET review_status = 'unreviewed',
            review_method = 'none',
            reviewed_by_role = NULL,
            review_evidence = NULL,
            reviewed_at_ms = NULL
        WHERE version = '1.0.0' AND id = 'source_checked';
      `),
      /remove_catalog_sources_before_marking_unreviewed/u,
    );
  } finally {
    database.close();
  }
});

test('catalog migration protects immutable releases and pointer rollback', () => {
  assert.match(migration, /catalog_release_insert_draft_only/u);
  assert.match(migration, /catalog_release_published_payload_immutable/u);
  assert.match(migration, /catalog_release_published_delete_forbidden/u);
  assert.match(migration, /catalog_release_withdraw_after_pointer_move/u);
  assert.match(migration, /catalog_channel_(?:insert|update)_published_only/u);
  for (const table of ['exercise', 'localization', 'alias', 'equipment', 'region', 'source']) {
    assert.match(migration, new RegExp(`catalog_${table}_lock_insert`, 'u'));
    assert.match(migration, new RegExp(`catalog_${table}_lock_update`, 'u'));
    assert.match(migration, new RegExp(`catalog_${table}_lock_delete`, 'u'));
  }
});

test('draft generation advances for release metadata and every normalized table mutation', () => {
  const database = testDatabase();
  try {
    const generation = () => database.prepare(`
      SELECT draft_generation FROM catalog_release WHERE version = '1.0.0'
    `).get().draft_generation;
    const advancesOnce = (operation) => {
      const before = generation();
      operation();
      assert.equal(generation(), before + 1);
    };

    advancesOnce(() => insertExercise(database, {
      id: 'reviewed_exercise',
      review_status: 'source_checked',
      review_method: 'source_comparison',
      reviewed_by_role: 'catalog-source-reviewer',
      review_evidence: 'generation-test',
      reviewed_at_ms: 1783987200000,
    }));
    advancesOnce(() => database.exec(`
      INSERT INTO catalog_localization (
        version, exercise_id, locale, display_name, normalized_display_name
      ) VALUES ('1.0.0', 'reviewed_exercise', 'en', 'Reviewed exercise', 'reviewedexercise');
    `));
    advancesOnce(() => database.exec(`
      INSERT INTO catalog_alias (
        version, exercise_id, locale, alias_order, alias, normalized_alias
      ) VALUES ('1.0.0', 'reviewed_exercise', 'en', 0, 'Reviewed alias', 'reviewedalias');
    `));
    advancesOnce(() => database.exec(`
      INSERT INTO catalog_equipment (
        version, exercise_id, role, equipment_order, equipment_id
      ) VALUES ('1.0.0', 'reviewed_exercise', 'required', 0, 'external_resistance');
    `));
    advancesOnce(() => database.exec(`
      INSERT INTO catalog_region (
        version, exercise_id, role, region_order, region_id
      ) VALUES ('1.0.0', 'reviewed_exercise', 'primary', 0, 'chest');
    `));
    advancesOnce(() => insertSource(database, 'reviewed_exercise'));
    advancesOnce(() => database.exec(`
      UPDATE catalog_release SET checksum_hex = '${'b'.repeat(64)}' WHERE version = '1.0.0';
    `));

    for (const statement of [
      `UPDATE catalog_exercise SET difficulty = 'intermediate' WHERE version = '1.0.0' AND id = 'reviewed_exercise'`,
      `UPDATE catalog_localization SET display_name = 'Reviewed movement' WHERE version = '1.0.0' AND exercise_id = 'reviewed_exercise'`,
      `UPDATE catalog_alias SET alias = 'Reviewed movement alias' WHERE version = '1.0.0' AND exercise_id = 'reviewed_exercise'`,
      `UPDATE catalog_equipment SET equipment_id = 'dumbbell' WHERE version = '1.0.0' AND exercise_id = 'reviewed_exercise'`,
      `UPDATE catalog_region SET region_id = 'shoulders' WHERE version = '1.0.0' AND exercise_id = 'reviewed_exercise'`,
      `UPDATE catalog_source SET label = 'Updated review' WHERE version = '1.0.0' AND exercise_id = 'reviewed_exercise'`,
      `DELETE FROM catalog_source WHERE version = '1.0.0' AND exercise_id = 'reviewed_exercise'`,
      `DELETE FROM catalog_alias WHERE version = '1.0.0' AND exercise_id = 'reviewed_exercise'`,
      `DELETE FROM catalog_localization WHERE version = '1.0.0' AND exercise_id = 'reviewed_exercise'`,
      `DELETE FROM catalog_equipment WHERE version = '1.0.0' AND exercise_id = 'reviewed_exercise'`,
      `DELETE FROM catalog_region WHERE version = '1.0.0' AND exercise_id = 'reviewed_exercise'`,
      `DELETE FROM catalog_exercise WHERE version = '1.0.0' AND id = 'reviewed_exercise'`,
    ]) {
      advancesOnce(() => database.exec(statement));
    }

    const current = generation();
    assert.throws(
      () => database.prepare(`UPDATE catalog_release SET draft_generation = ? WHERE version = '1.0.0'`)
        .run(current - 1),
      /catalog_release_draft_generation_must_advance_once/u,
    );
    assert.throws(
      () => database.prepare(`UPDATE catalog_release SET draft_generation = ? WHERE version = '1.0.0'`)
        .run(current + 2),
      /catalog_release_draft_generation_must_advance_once/u,
    );
    database.prepare(`UPDATE catalog_release SET draft_generation = ? WHERE version = '1.0.0'`)
      .run(current + 1);
    assert.equal(generation(), current + 1);
  } finally {
    database.close();
  }
});

test('draft publication cannot smuggle metadata, payload, or generation changes', () => {
  const database = testDatabase();
  try {
    insertExercise(database);
    completeProjection(database);
    const before = database.prepare(`SELECT * FROM catalog_release WHERE version = '1.0.0'`).get();

    for (const assignment of [
      `checksum_hex = '${'b'.repeat(64)}'`,
      `payload_json = X'7d'`,
      `item_count = 33`,
      `effective_at_ms = 1783987200001`,
      `schema_version = '1.0.1'`,
      `created_at_ms = 1783987200001`,
      `draft_generation = ${before.draft_generation + 1}`,
    ]) {
      assert.throws(
        () => database.exec(`
          UPDATE catalog_release
          SET state = 'published', published_at_ms = 1783987200000, ${assignment}
          WHERE version = '1.0.0';
        `),
        /catalog_release_publish_cannot_change_metadata/u,
        assignment,
      );
      const after = database.prepare(`SELECT * FROM catalog_release WHERE version = '1.0.0'`).get();
      assert.deepEqual({ ...after }, { ...before }, assignment);
    }
  } finally {
    database.close();
  }
});

test('channel pointer cannot be deleted after first publication', () => {
  const database = testDatabase();
  try {
    insertExercise(database);
    completeProjection(database);
    publishAndPoint(database, '1.0.0');
    assert.throws(
      () => database.exec(`DELETE FROM catalog_channel WHERE channel = 'v1'`),
      /catalog_channel_cannot_be_deleted/u,
    );
    assert.equal(
      database.prepare(`SELECT version FROM catalog_channel WHERE channel = 'v1'`).get().version,
      '1.0.0',
    );
  } finally {
    database.close();
  }
});

test('lineage rejects missing IDs, revision jumps, lifecycle skips, and invalid new-ID windows', async (t) => {
  await t.test('published IDs cannot disappear', () => {
    const database = futureDatabase();
    try {
      deleteProjectionExercise(database, '1.0.1', 'test_exercise');
      insertExercise(database, {
        version: '1.0.1',
        id: 'new_identity',
        display_order: 1,
        effective_from_ms: 1783987200500,
      });
      completeProjection(database, '1.0.1');
      assert.throws(
        () => publishDraft(database, '1.0.1', 1783987201000),
        /catalog_release_has_invalid_lineage/u,
      );
    } finally {
      database.close();
    }
  });

  await t.test('existing revision cannot jump', () => {
    const database = futureDatabase();
    try {
      database.exec(`
        UPDATE catalog_exercise SET difficulty = 'intermediate', record_revision = 3
        WHERE version = '1.0.1' AND id = 'test_exercise';
      `);
      assert.throws(
        () => publishDraft(database, '1.0.1', 1783987201000),
        /catalog_release_has_invalid_lineage/u,
      );
    } finally {
      database.close();
    }
  });

  await t.test('active cannot skip directly to retired', () => {
    const database = futureDatabase();
    try {
      database.exec(`
        UPDATE catalog_exercise
        SET status = 'retired', record_revision = 2, effective_to_ms = 1783987200500
        WHERE version = '1.0.1' AND id = 'test_exercise';
      `);
      assert.throws(
        () => publishDraft(database, '1.0.1', 1783987201000),
        /catalog_release_has_invalid_lineage/u,
      );
    } finally {
      database.close();
    }
  });

  await t.test('new IDs must fall strictly after the current release and no later than the draft', () => {
    const database = futureDatabase();
    try {
      database.exec(`UPDATE catalog_release SET item_count = 33 WHERE version = '1.0.1'`);
      insertExercise(database, {
        version: '1.0.1',
        id: 'late_addition',
        display_order: 33,
        effective_from_ms: 1783987200000,
      });
      insertProjectionChildren(database, '1.0.1', 'late_addition');
      assert.throws(
        () => publishDraft(database, '1.0.1', 1783987201000),
        /catalog_release_has_invalid_lineage/u,
      );
    } finally {
      database.close();
    }
  });

  await t.test('new IDs must enter as active', () => {
    const database = futureDatabase();
    try {
      database.exec(`UPDATE catalog_release SET item_count = 33 WHERE version = '1.0.1'`);
      insertExercise(database, {
        version: '1.0.1',
        id: 'pre_deprecated_addition',
        status: 'deprecated',
        display_order: 33,
        effective_from_ms: 1783987200500,
      });
      insertProjectionChildren(database, '1.0.1', 'pre_deprecated_addition');
      assert.throws(
        () => publishDraft(database, '1.0.1', 1783987201000),
        /catalog_release_has_invalid_lineage/u,
      );
    } finally {
      database.close();
    }
  });
});

test('lineage allows only active to deprecated to retired and then blocks resurrection', () => {
  const database = futureDatabase();
  try {
    database.exec(`
      UPDATE catalog_exercise SET status = 'deprecated', record_revision = 2
      WHERE version = '1.0.1' AND id = 'test_exercise';
    `);
    publishAndPoint(database, '1.0.1');

    cloneDraft(database, '1.0.1', '1.0.2', 1783987202000, 'c');
    database.exec(`
      UPDATE catalog_exercise
      SET status = 'retired', record_revision = 3, effective_to_ms = NULL
      WHERE version = '1.0.2' AND id = 'test_exercise';
    `);
    assert.throws(
      () => publishDraft(database, '1.0.2', 1783987202000),
      /catalog_release_has_invalid_lineage/u,
    );
    database.exec(`
      UPDATE catalog_exercise SET effective_to_ms = 1783987201500
      WHERE version = '1.0.2' AND id = 'test_exercise';
    `);
    publishAndPoint(database, '1.0.2');

    cloneDraft(database, '1.0.2', '1.0.3', 1783987203000, 'd');
    database.exec(`
      UPDATE catalog_exercise
      SET status = 'active', record_revision = 4, effective_to_ms = NULL
      WHERE version = '1.0.3' AND id = 'test_exercise';
    `);
    assert.throws(
      () => publishDraft(database, '1.0.3', 1783987203000),
      /catalog_release_has_invalid_lineage/u,
    );
  } finally {
    database.close();
  }
});

test('initial effective dates and replacement targets fail closed before publication', async (t) => {
  await t.test('initial identity cannot become effective after its release', () => {
    const database = testDatabase();
    try {
      insertExercise(database, { effective_from_ms: 1783987200001 });
      completeProjection(database);
      assert.throws(
        () => publishDraft(database, '1.0.0', 1783987200000),
        /catalog_release_has_invalid_lineage/u,
      );
    } finally {
      database.close();
    }
  });

  await t.test('replacement must target an active identity', () => {
    const database = futureDatabase();
    try {
      database.exec(`
        UPDATE catalog_exercise
        SET status = 'deprecated', replacement_id = 'filler_2', record_revision = 2
        WHERE version = '1.0.1' AND id = 'test_exercise';
        UPDATE catalog_exercise
        SET status = 'deprecated', record_revision = 2
        WHERE version = '1.0.1' AND id = 'filler_2';
      `);
      assert.throws(
        () => publishDraft(database, '1.0.1', 1783987201000),
        /catalog_release_has_incomplete_projection/u,
      );
    } finally {
      database.close();
    }
  });
});

test('Wrangler template is a non-deployable dedicated service with only CATALOG_DB', () => {
  assert.match(config, /name = "overdrive-catalog"/u);
  assert.match(config, /main = "src\/index\.js"/u);
  assert.match(config, /binding = "CATALOG_DB"/u);
  assert.match(config, /database_name = "overdrive-catalog"/u);
  assert.match(config, /database_id = "00000000-0000-0000-0000-000000000000"/u);
  assert.match(config, /workers_dev = false/u);
  assert.match(config, /\[observability\]\s+enabled = false/u);
  assert.doesNotMatch(config, /(?:overdrive-quicklog|overdrive-rank|GROQ|APPLE|ENTITLEMENT|AI_RATE_LIMITER)/u);
  assert.doesNotMatch(config, /\[(?:vars|triggers)\]|routes?/u);
});
