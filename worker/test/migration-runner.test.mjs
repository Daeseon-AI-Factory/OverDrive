import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildImportSql } from '../scripts/apply-d1-migration.mjs';

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('builds an atomic D1 import that records the canonical migration', async () => {
  const migrationName = '0001_ai_subscription_quota.sql';
  const migrationSql = await readFile(path.join(workerRoot, 'migrations', migrationName), 'utf8');
  const importSql = buildImportSql(migrationName, migrationSql);

  assert.match(importSql, /^CREATE TABLE IF NOT EXISTS "d1_migrations"/);
  assert.ok(importSql.includes(migrationSql.trim()));
  assert.match(importSql, /CREATE TRIGGER IF NOT EXISTS ai_quota_reserve_after_insert/);
  assert.match(
    importSql,
    /INSERT OR IGNORE INTO "d1_migrations" \(name\) VALUES \('0001_ai_subscription_quota\.sql'\);\n$/,
  );
});

test('rejects migration paths and malformed names', () => {
  assert.throws(() => buildImportSql('../escape.sql', 'SELECT 1;'), /Invalid migration name/);
  assert.throws(() => buildImportSql('manual.sql', 'SELECT 1;'), /Invalid migration name/);
});
