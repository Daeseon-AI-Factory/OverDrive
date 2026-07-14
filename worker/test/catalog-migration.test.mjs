import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../catalog/migrations/0001_catalog.sql', import.meta.url), 'utf8');
const config = await readFile(new URL('../catalog/wrangler.template.toml', import.meta.url), 'utf8');

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
