import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  buildExpectedProjection,
  buildPublishSql,
  buildRollbackSql,
  compareReleaseReadback,
  main,
} from '../catalog/scripts/admin.mjs';
import { validateCatalogTransition } from '../../scripts/catalog/catalog-validation.mjs';

const raw = await readFile(new URL('../../assets/catalog/exercise-catalog-v1.json', import.meta.url));
const adminSource = await readFile(new URL('../catalog/scripts/admin.mjs', import.meta.url), 'utf8');
const snapshot = JSON.parse(raw.toString('utf8'));
const checksum = createHash('sha256').update(raw).digest('hex');

function exactRelease(overrides = {}) {
  return {
    version: snapshot.catalogVersion,
    schema_version: snapshot.schemaVersion,
    effective_at_ms: Date.parse(snapshot.effectiveAt),
    checksum_hex: checksum,
    item_count: snapshot.exercises.length,
    payload_bytes: raw.byteLength,
    state: 'draft',
    created_at_ms: Date.parse(snapshot.effectiveAt),
    published_at_ms: null,
    draft_generation: 17,
    payload_type: 'blob',
    stored_payload_bytes: raw.byteLength,
    payload_hex: raw.toString('hex').toUpperCase(),
    ...overrides,
  };
}

function sqlDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE catalog_release (
      version TEXT PRIMARY KEY,
      schema_version TEXT NOT NULL,
      effective_at_ms INTEGER NOT NULL,
      checksum_hex TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      payload_bytes INTEGER NOT NULL,
      draft_generation INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('draft', 'published', 'withdrawn')),
      published_at_ms INTEGER
    );
    CREATE TABLE catalog_channel (
      channel TEXT PRIMARY KEY CHECK (channel = 'v1'),
      version TEXT NOT NULL REFERENCES catalog_release(version)
    );
  `);
  return database;
}

function insertRelease(database, values) {
  database.prepare(`
    INSERT INTO catalog_release (
      version, schema_version, effective_at_ms, checksum_hex, item_count,
      payload_bytes, draft_generation, state, published_at_ms
    ) VALUES (?, '1.0.0', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    values.version,
    values.effectiveAtMs,
    values.checksumHex,
    values.itemCount,
    values.payloadBytes,
    values.draftGeneration,
    values.state,
    values.publishedAtMs,
  );
}

function executeAtomically(database, sql) {
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(sql);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function publishInput(overrides = {}) {
  return {
    version: '1.0.1',
    schemaVersion: '1.0.0',
    effectiveAtMs: 1783987201000,
    checksumHex: 'b'.repeat(64),
    itemCount: 64,
    payloadBytes: 1024,
    draftGeneration: 7,
    publishedAtMs: 1783987202000,
    expectedCurrentVersion: null,
    ...overrides,
  };
}

test('exact readback compares the BLOB, metadata, all six projections, and foreign keys', () => {
  const projections = buildExpectedProjection(snapshot);
  const result = compareReleaseReadback({
    raw,
    release: exactRelease(),
    projections,
    foreignKeyViolations: [],
  });

  assert.equal(result.checksumHex, checksum);
  assert.equal(result.payloadBytes, raw.byteLength);
  assert.equal(result.itemCount, snapshot.exercises.length);
  assert.equal(result.draftGeneration, 17);

  const drifted = structuredClone(projections);
  drifted.aliases[0].alias = 'projection drift';
  assert.throws(
    () => compareReleaseReadback({ raw, release: exactRelease(), projections: drifted }),
    /aliases projection differs from payload at row 0/u,
  );
  assert.throws(
    () => compareReleaseReadback({
      raw,
      release: exactRelease({ payload_hex: `${raw.toString('hex').slice(0, -2)}00`.toUpperCase() }),
      projections,
    }),
    /release payload BLOB differs from the local canonical artifact/u,
  );
  assert.throws(
    () => compareReleaseReadback({
      raw,
      release: exactRelease(),
      projections,
      foreignKeyViolations: [{ table: 'catalog_alias', rowid: 1 }],
    }),
    /foreign_key_check returned 1 row/u,
  );
});

test('admin imports the canonical transition validator that catches lifecycle and display-order drift', () => {
  assert.match(
    adminSource,
    /from '\.\.\/\.\.\/\.\.\/scripts\/catalog\/catalog-validation\.mjs'/u,
  );
  assert.doesNotMatch(adminSource, /(?:export\s+)?function validateCatalogTransition/u);

  const lifecycleSkip = structuredClone(snapshot);
  lifecycleSkip.catalogVersion = '1.0.1';
  lifecycleSkip.effectiveAt = '2026-07-15T00:00:00Z';
  lifecycleSkip.exercises[0].status = 'retired';
  lifecycleSkip.exercises[0].effectiveTo = '2026-07-15T00:00:00Z';
  lifecycleSkip.exercises[0].recordRevision += 1;
  assert.throws(
    () => validateCatalogTransition(snapshot, lifecycleSkip),
    /invalid lifecycle transition active -> retired/u,
  );

  const displayOrderDrift = structuredClone(snapshot);
  displayOrderDrift.catalogVersion = '1.0.1';
  displayOrderDrift.effectiveAt = '2026-07-15T00:00:00Z';
  [displayOrderDrift.exercises[0].displayOrder, displayOrderDrift.exercises[1].displayOrder] =
    [displayOrderDrift.exercises[1].displayOrder, displayOrderDrift.exercises[0].displayOrder];
  assert.throws(
    () => validateCatalogTransition(snapshot, displayOrderDrift),
    /semantic change must increment exactly one revision/u,
  );
});

test('CLI fails closed on misspelled or duplicate operation options before D1 access', () => {
  assert.throws(() => main(['verify', '--locla']), /unknown option --locla/u);
  assert.throws(
    () => main(['verify', '--local', '--local']),
    /option --local was provided more than once/u,
  );
});

test('guarded publication uses fixed metadata and rolls back a stale generation', () => {
  const database = sqlDatabase();
  try {
    const input = publishInput();
    insertRelease(database, {
      ...input,
      state: 'draft',
      publishedAtMs: null,
    });
    const sql = buildPublishSql(input);
    assert.doesNotMatch(sql, /^\s*(?:BEGIN|COMMIT)\b/imu);
    assert.doesNotMatch(sql, /\n\+\s+OR\b/u);
    assert.match(sql, /draft_generation = 7/u);
    assert.match(sql, /published_at_ms = 1783987202000/u);

    executeAtomically(database, sql);
    assert.deepEqual(
      { ...database.prepare(`SELECT state, published_at_ms FROM catalog_release`).get() },
      { state: 'published', published_at_ms: 1783987202000 },
    );
    assert.equal(database.prepare(`SELECT version FROM catalog_channel WHERE channel = 'v1'`).get().version, '1.0.1');

    // The same fixed timestamp makes an explicit retry idempotent.
    executeAtomically(database, sql);
    assert.equal(database.prepare(`SELECT count(*) AS count FROM catalog_channel`).get().count, 1);
  } finally {
    database.close();
  }

  const staleDatabase = sqlDatabase();
  try {
    const input = publishInput();
    insertRelease(staleDatabase, {
      ...input,
      draftGeneration: input.draftGeneration + 1,
      state: 'draft',
      publishedAtMs: null,
    });
    assert.throws(
      () => executeAtomically(staleDatabase, buildPublishSql(input)),
      /constraint failed/iu,
    );
    assert.deepEqual(
      { ...staleDatabase.prepare(`SELECT state, published_at_ms FROM catalog_release`).get() },
      { state: 'draft', published_at_ms: null },
    );
    assert.equal(staleDatabase.prepare(`SELECT count(*) AS count FROM catalog_channel`).get().count, 0);
  } finally {
    staleDatabase.close();
  }
});

test('guarded rollback changes only the pointer and rejects checksum races', () => {
  const database = sqlDatabase();
  try {
    const oldRelease = {
      version: '1.0.0',
      effectiveAtMs: 1783987200000,
      checksumHex: 'a'.repeat(64),
      itemCount: 64,
      payloadBytes: 1000,
      draftGeneration: 7,
      state: 'published',
      publishedAtMs: 1783987200100,
    };
    const currentRelease = {
      version: '1.0.1',
      effectiveAtMs: 1783987201000,
      checksumHex: 'b'.repeat(64),
      itemCount: 64,
      payloadBytes: 1024,
      draftGeneration: 11,
      state: 'published',
      publishedAtMs: 1783987202000,
    };
    insertRelease(database, oldRelease);
    insertRelease(database, currentRelease);
    database.exec(`INSERT INTO catalog_channel (channel, version) VALUES ('v1', '1.0.1')`);

    const rollbackSql = buildRollbackSql({
      expectedCurrentVersion: currentRelease.version,
      expectedCurrentChecksum: currentRelease.checksumHex,
      targetVersion: oldRelease.version,
      targetChecksum: oldRelease.checksumHex,
    });
    executeAtomically(database, rollbackSql);
    assert.equal(database.prepare(`SELECT version FROM catalog_channel WHERE channel = 'v1'`).get().version, '1.0.0');
    assert.deepEqual(
      database.prepare(`SELECT version, state, published_at_ms FROM catalog_release ORDER BY version`).all().map((row) => ({ ...row })),
      [
        { version: '1.0.0', state: 'published', published_at_ms: 1783987200100 },
        { version: '1.0.1', state: 'published', published_at_ms: 1783987202000 },
      ],
    );

    database.exec(`UPDATE catalog_channel SET version = '1.0.1' WHERE channel = 'v1'`);
    assert.throws(
      () => executeAtomically(database, buildRollbackSql({
        expectedCurrentVersion: currentRelease.version,
        expectedCurrentChecksum: currentRelease.checksumHex,
        targetVersion: oldRelease.version,
        targetChecksum: 'c'.repeat(64),
      })),
      /constraint failed/iu,
    );
    assert.equal(database.prepare(`SELECT version FROM catalog_channel WHERE channel = 'v1'`).get().version, '1.0.1');
  } finally {
    database.close();
  }
});
