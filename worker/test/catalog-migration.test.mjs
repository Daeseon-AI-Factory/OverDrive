import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const migration = await readFile(new URL('../catalog/migrations/0001_catalog.sql', import.meta.url), 'utf8');
const config = await readFile(new URL('../catalog/wrangler.template.toml', import.meta.url), 'utf8');

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
