#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

import {
  parseLegacySeedContract,
  validateCatalog,
  validateCatalogTransition,
} from '../../../scripts/catalog/catalog-validation.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = resolve(SCRIPT_DIR, '../..');
const REPOSITORY_DIR = resolve(WORKER_DIR, '..');
const WRANGLER_ENTRY = resolve(WORKER_DIR, 'node_modules/wrangler/bin/wrangler.js');
const DEFAULT_CONFIG = resolve(SCRIPT_DIR, '../wrangler.template.toml');
const DEFAULT_CATALOG = resolve(REPOSITORY_DIR, 'assets/catalog/exercise-catalog-v1.json');
const DEFAULT_SCHEMA = resolve(REPOSITORY_DIR, 'docs/contracts/exercise-catalog-v1.schema.json');
const DEFAULT_COMPATIBILITY = resolve(REPOSITORY_DIR, 'docs/contracts/exercise-catalog-v1-compatibility.json');
const DEFAULT_SEED = resolve(REPOSITORY_DIR, 'src/db/seed.ts');
const DEFAULT_DATABASE = 'overdrive-catalog';
const LOCALES = ['en', 'ko', 'es', 'zh-Hans'];
const VERSION_PATTERN = /^1\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/u;
const CLI_OPTIONS = new Set([
  'catalog',
  'config',
  'database',
  'expected-current-checksum',
  'expected-current-version',
  'help',
  'local',
  'persist-to',
  'published-at-ms',
  'remote',
  'target-checksum',
  'target-version',
  'version',
]);

const PROJECTION_QUERIES = {
  exercises: `
    SELECT version, id, record_revision, status, effective_from_ms, effective_to_ms,
           replacement_id, display_order, exercise_type, is_bodyweight, movement_pattern,
           difficulty, default_sets, tracking_mode, counting_convention, target_unit,
           target_low, target_high, provenance_classification, review_status, review_method,
           reviewed_by_role, review_evidence, reviewed_at_ms, contains_third_party_copy
    FROM catalog_exercise
    WHERE version = ?
    ORDER BY display_order, id
  `,
  localizations: `
    SELECT localization.version, localization.exercise_id, localization.locale,
           localization.display_name, localization.normalized_display_name
    FROM catalog_localization AS localization
    JOIN catalog_exercise AS exercise
      ON exercise.version = localization.version AND exercise.id = localization.exercise_id
    WHERE localization.version = ?
    ORDER BY exercise.display_order,
             CASE localization.locale
               WHEN 'en' THEN 0 WHEN 'ko' THEN 1 WHEN 'es' THEN 2 ELSE 3
             END
  `,
  aliases: `
    SELECT alias.version, alias.exercise_id, alias.locale, alias.alias_order,
           alias.alias, alias.normalized_alias
    FROM catalog_alias AS alias
    JOIN catalog_exercise AS exercise
      ON exercise.version = alias.version AND exercise.id = alias.exercise_id
    WHERE alias.version = ?
    ORDER BY exercise.display_order,
             CASE alias.locale WHEN 'en' THEN 0 WHEN 'ko' THEN 1 WHEN 'es' THEN 2 ELSE 3 END,
             alias.alias_order
  `,
  equipment: `
    SELECT equipment.version, equipment.exercise_id, equipment.role,
           equipment.equipment_order, equipment.equipment_id
    FROM catalog_equipment AS equipment
    JOIN catalog_exercise AS exercise
      ON exercise.version = equipment.version AND exercise.id = equipment.exercise_id
    WHERE equipment.version = ?
    ORDER BY exercise.display_order,
             CASE equipment.role WHEN 'required' THEN 0 ELSE 1 END,
             equipment.equipment_order
  `,
  regions: `
    SELECT region.version, region.exercise_id, region.role,
           region.region_order, region.region_id
    FROM catalog_region AS region
    JOIN catalog_exercise AS exercise
      ON exercise.version = region.version AND exercise.id = region.exercise_id
    WHERE region.version = ?
    ORDER BY exercise.display_order,
             CASE region.role WHEN 'primary' THEN 0 ELSE 1 END,
             region.region_order
  `,
  sources: `
    SELECT source.version, source.exercise_id, source.source_order, source.source_type,
           source.label, source.url, source.license, source.accessed_at_ms
    FROM catalog_source AS source
    JOIN catalog_exercise AS exercise
      ON exercise.version = source.version AND exercise.id = source.exercise_id
    WHERE source.version = ?
    ORDER BY exercise.display_order, source.source_order
  `,
};

export class CatalogAdminError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogAdminError';
  }
}

function fail(message) {
  throw new CatalogAdminError(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function integer(value, label) {
  const parsed = typeof value === 'number' ? value : Number(value);
  check(Number.isSafeInteger(parsed) && parsed >= 0, `${label} must be a non-negative safe integer`);
  return parsed;
}

function version(value, label = 'version') {
  check(typeof value === 'string' && VERSION_PATTERN.test(value), `${label} must be a v1 SemVer`);
  return value;
}

function checksum(value, label = 'checksum') {
  const normalized = typeof value === 'string' && value.startsWith('sha256:')
    ? value.slice('sha256:'.length)
    : value;
  check(typeof normalized === 'string' && CHECKSUM_PATTERN.test(normalized), `${label} must be lowercase SHA-256`);
  return normalized;
}

function utcSecond(value, label) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value), `${label} must use UTC second precision`);
  const parsed = Date.parse(value);
  check(Number.isFinite(parsed) && new Date(parsed).toISOString() === `${value.slice(0, -1)}.000Z`, `${label} must be a real calendar instant`);
  return parsed;
}

export function normalizeSearchV1(value) {
  return value
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{Nd}]+/gu, '');
}

function targetFor(exercise) {
  return exercise.defaultPrescription.target;
}

export function buildExpectedProjection(snapshot) {
  const versionValue = version(snapshot.catalogVersion, 'catalogVersion');
  const projection = {
    exercises: [],
    localizations: [],
    aliases: [],
    equipment: [],
    regions: [],
    sources: [],
  };

  for (const exercise of snapshot.exercises) {
    const target = targetFor(exercise);
    projection.exercises.push({
      version: versionValue,
      id: exercise.id,
      record_revision: exercise.recordRevision,
      status: exercise.status,
      effective_from_ms: utcSecond(exercise.effectiveFrom, `${exercise.id}.effectiveFrom`),
      effective_to_ms: exercise.effectiveTo === null
        ? null
        : utcSecond(exercise.effectiveTo, `${exercise.id}.effectiveTo`),
      replacement_id: exercise.replacementId,
      display_order: exercise.displayOrder,
      exercise_type: exercise.exerciseType,
      is_bodyweight: exercise.isBodyweight ? 1 : 0,
      movement_pattern: exercise.movementPattern,
      difficulty: exercise.difficulty,
      default_sets: exercise.defaultPrescription.sets,
      tracking_mode: exercise.defaultPrescription.trackingMode,
      counting_convention: exercise.defaultPrescription.countingConvention,
      target_unit: target?.unit ?? null,
      target_low: target?.low ?? null,
      target_high: target?.high ?? null,
      provenance_classification: exercise.provenance.classification,
      review_status: exercise.provenance.reviewStatus,
      review_method: exercise.provenance.reviewMethod,
      reviewed_by_role: exercise.provenance.reviewedByRole,
      review_evidence: exercise.provenance.reviewEvidence,
      reviewed_at_ms: exercise.provenance.reviewedAt === null
        ? null
        : utcSecond(exercise.provenance.reviewedAt, `${exercise.id}.provenance.reviewedAt`),
      contains_third_party_copy: exercise.provenance.containsThirdPartyCopy ? 1 : 0,
    });

    for (const locale of LOCALES) {
      const localization = exercise.localizations[locale];
      projection.localizations.push({
        version: versionValue,
        exercise_id: exercise.id,
        locale,
        display_name: localization.displayName,
        normalized_display_name: normalizeSearchV1(localization.displayName),
      });
      localization.aliases.forEach((alias, aliasOrder) => {
        projection.aliases.push({
          version: versionValue,
          exercise_id: exercise.id,
          locale,
          alias_order: aliasOrder,
          alias,
          normalized_alias: normalizeSearchV1(alias),
        });
      });
    }

    for (const role of ['required', 'optional']) {
      exercise.equipment[role].forEach((equipmentId, equipmentOrder) => {
        projection.equipment.push({
          version: versionValue,
          exercise_id: exercise.id,
          role,
          equipment_order: equipmentOrder,
          equipment_id: equipmentId,
        });
      });
    }

    for (const role of ['primary', 'secondary']) {
      const values = role === 'primary'
        ? exercise.primaryBodyRegions
        : exercise.secondaryBodyRegions;
      values.forEach((regionId, regionOrder) => {
        projection.regions.push({
          version: versionValue,
          exercise_id: exercise.id,
          role,
          region_order: regionOrder,
          region_id: regionId,
        });
      });
    }

    exercise.provenance.sources.forEach((source, sourceOrder) => {
      projection.sources.push({
        version: versionValue,
        exercise_id: exercise.id,
        source_order: sourceOrder,
        source_type: source.sourceType,
        label: source.label,
        url: source.url,
        license: source.license,
        accessed_at_ms: source.accessedAt === null
          ? null
          : utcSecond(source.accessedAt, `${exercise.id}.sources[${sourceOrder}].accessedAt`),
      });
    });
  }
  return projection;
}

function validateSnapshotEnvelope(snapshot, raw) {
  check(snapshot !== null && typeof snapshot === 'object' && !Array.isArray(snapshot), 'catalog payload must be an object');
  check(snapshot.schemaVersion === '1.0.0', 'catalog schemaVersion must be 1.0.0');
  version(snapshot.catalogVersion, 'catalogVersion');
  utcSecond(snapshot.effectiveAt, 'catalog.effectiveAt');
  check(snapshot.defaultLocale === 'en', 'catalog defaultLocale must be en');
  check(isDeepStrictEqual(snapshot.supportedLocales, LOCALES), 'catalog supportedLocales/order mismatch');
  check(snapshot.searchNormalization === 'search-v1', 'catalog searchNormalization mismatch');
  check(Array.isArray(snapshot.exercises), 'catalog exercises must be an array');
  check(snapshot.exercises.length >= 32 && snapshot.exercises.length <= 512, 'catalog exercise count is out of bounds');
  check(raw.byteLength > 0 && raw.byteLength <= 524_288, 'catalog payload byte count is out of bounds');
  check(Buffer.from(JSON.stringify(snapshot), 'utf8').equals(raw), 'local catalog must be exact compact UTF-8 JSON');
  const ids = snapshot.exercises.map((exercise) => exercise.id);
  check(new Set(ids).size === ids.length, 'catalog IDs must be unique');
  snapshot.exercises.forEach((exercise, index) => {
    check(exercise.displayOrder === index + 1, `${exercise.id}.displayOrder must be contiguous`);
  });
}

function firstMismatch(actual, expected) {
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    if (!isDeepStrictEqual(actual[index], expected[index])) return index;
  }
  return -1;
}

export function compareReleaseReadback({ raw, release, projections, foreignKeyViolations = [] }) {
  const snapshot = JSON.parse(raw.toString('utf8'));
  validateSnapshotEnvelope(snapshot, raw);
  const expectedChecksum = createHash('sha256').update(raw).digest('hex');
  const expectedProjection = buildExpectedProjection(snapshot);
  const remoteHex = release.payload_hex;
  check(typeof remoteHex === 'string' && /^(?:[0-9A-F]{2})+$/u.test(remoteHex), 'release payload_hex must be uppercase complete bytes');
  const remoteBytes = Buffer.from(remoteHex, 'hex');

  check(remoteBytes.equals(raw), 'release payload BLOB differs from the local canonical artifact');
  check(release.version === snapshot.catalogVersion, 'release version differs from payload');
  check(release.schema_version === snapshot.schemaVersion, 'release schema version differs from payload');
  check(release.effective_at_ms === Date.parse(snapshot.effectiveAt), 'release effective timestamp differs from payload');
  check(release.checksum_hex === expectedChecksum, 'release checksum differs from exact payload SHA-256');
  check(release.item_count === snapshot.exercises.length, 'release item count differs from payload');
  check(release.payload_bytes === raw.byteLength, 'release payload_bytes differs from local bytes');
  check(release.payload_type === 'blob', 'release payload must be stored as a BLOB');
  check(release.stored_payload_bytes === raw.byteLength, 'stored BLOB length differs from local bytes');
  check(Number.isSafeInteger(release.draft_generation) && release.draft_generation >= 0, 'release draft_generation is invalid');
  check(foreignKeyViolations.length === 0, `foreign_key_check returned ${foreignKeyViolations.length} row(s)`);

  for (const table of Object.keys(expectedProjection)) {
    const actual = projections[table];
    const expected = expectedProjection[table];
    check(Array.isArray(actual), `${table} readback is missing`);
    if (!isDeepStrictEqual(actual, expected)) {
      const index = firstMismatch(actual, expected);
      fail(`${table} projection differs from payload at row ${index}`);
    }
  }

  return {
    snapshot,
    checksumHex: expectedChecksum,
    itemCount: snapshot.exercises.length,
    payloadBytes: raw.byteLength,
    draftGeneration: release.draft_generation,
  };
}

function releasePredicate(alias, metadata, state, publishedAtMs = null) {
  const prefix = alias ? `${alias}.` : '';
  const fields = [
    `${prefix}version = ${sqlString(metadata.version)}`,
    `${prefix}schema_version = ${sqlString(metadata.schemaVersion)}`,
    `${prefix}effective_at_ms = ${metadata.effectiveAtMs}`,
    `${prefix}checksum_hex = ${sqlString(metadata.checksumHex)}`,
    `${prefix}item_count = ${metadata.itemCount}`,
    `${prefix}payload_bytes = ${metadata.payloadBytes}`,
    `${prefix}draft_generation = ${metadata.draftGeneration}`,
    `${prefix}state = ${sqlString(state)}`,
  ];
  if (publishedAtMs !== null) fields.push(`${prefix}published_at_ms = ${publishedAtMs}`);
  return fields.join('\n      AND ');
}

function validatedPublishMetadata(input) {
  return {
    version: version(input.version),
    schemaVersion: input.schemaVersion === '1.0.0' ? input.schemaVersion : fail('schemaVersion must be 1.0.0'),
    effectiveAtMs: integer(input.effectiveAtMs, 'effectiveAtMs'),
    checksumHex: checksum(input.checksumHex),
    itemCount: integer(input.itemCount, 'itemCount'),
    payloadBytes: integer(input.payloadBytes, 'payloadBytes'),
    draftGeneration: integer(input.draftGeneration, 'draftGeneration'),
    publishedAtMs: integer(input.publishedAtMs, 'publishedAtMs'),
    expectedCurrentVersion: input.expectedCurrentVersion === null
      ? null
      : version(input.expectedCurrentVersion, 'expectedCurrentVersion'),
  };
}

export function buildPublishSql(input) {
  const metadata = validatedPublishMetadata(input);
  const target = sqlString(metadata.version);
  const beforePointer = metadata.expectedCurrentVersion === null
    ? `NOT EXISTS (SELECT 1 FROM catalog_channel WHERE channel = 'v1')`
    : `EXISTS (SELECT 1 FROM catalog_channel WHERE channel = 'v1' AND version = ${sqlString(metadata.expectedCurrentVersion)})`;
  const allowedPointer = metadata.expectedCurrentVersion === null
    ? `NOT EXISTS (SELECT 1 FROM catalog_channel WHERE channel = 'v1')\n       OR EXISTS (SELECT 1 FROM catalog_channel WHERE channel = 'v1' AND version = ${target})`
    : `EXISTS (SELECT 1 FROM catalog_channel WHERE channel = 'v1' AND version IN (${sqlString(metadata.expectedCurrentVersion)}, ${target}))`;

  return `-- Generated by worker/catalog/scripts/admin.mjs. D1 executes this file atomically.
-- Deliberately contains no explicit SQL transaction statements.
UPDATE catalog_release
SET state = 'published', published_at_ms = ${metadata.publishedAtMs}
WHERE ${releasePredicate('', metadata, 'draft')}
  AND ${beforePointer};

INSERT INTO catalog_channel (channel, version)
SELECT 'v1', ${target}
WHERE EXISTS (
  SELECT 1 FROM catalog_release AS release
  WHERE ${releasePredicate('release', metadata, 'published', metadata.publishedAtMs)}
)
  AND (${allowedPointer})
ON CONFLICT(channel) DO UPDATE SET version = excluded.version;

-- A zero-row UPDATE/INSERT is not success. This impossible channel fails the whole atomic file.
INSERT INTO catalog_channel (channel, version)
SELECT '__publish_guard_failed__', ${target}
WHERE NOT EXISTS (
  SELECT 1
  FROM catalog_channel AS channel
  JOIN catalog_release AS release ON release.version = channel.version
  WHERE channel.channel = 'v1'
    AND channel.version = ${target}
    AND ${releasePredicate('release', metadata, 'published', metadata.publishedAtMs)}
);
`;
}

export function buildRollbackSql(input) {
  const expectedCurrentVersion = version(input.expectedCurrentVersion, 'expectedCurrentVersion');
  const expectedCurrentChecksum = checksum(input.expectedCurrentChecksum, 'expectedCurrentChecksum');
  const targetVersion = version(input.targetVersion, 'targetVersion');
  const targetChecksum = checksum(input.targetChecksum, 'targetChecksum');
  check(expectedCurrentVersion !== targetVersion, 'rollback current and target versions must differ');

  return `-- Generated by worker/catalog/scripts/admin.mjs. Pointer rollback only; no withdrawal.
-- Deliberately contains no explicit SQL transaction statements.
UPDATE catalog_channel
SET version = ${sqlString(targetVersion)}
WHERE channel = 'v1'
  AND version = ${sqlString(expectedCurrentVersion)}
  AND EXISTS (
    SELECT 1 FROM catalog_release
    WHERE version = ${sqlString(expectedCurrentVersion)}
      AND checksum_hex = ${sqlString(expectedCurrentChecksum)}
      AND state = 'published'
  )
  AND EXISTS (
    SELECT 1 FROM catalog_release
    WHERE version = ${sqlString(targetVersion)}
      AND checksum_hex = ${sqlString(targetChecksum)}
      AND state = 'published'
  );

INSERT INTO catalog_channel (channel, version)
SELECT '__rollback_guard_failed__', ${sqlString(targetVersion)}
WHERE NOT EXISTS (
  SELECT 1
  FROM catalog_channel AS channel
  JOIN catalog_release AS target ON target.version = channel.version
  WHERE channel.channel = 'v1'
    AND channel.version = ${sqlString(targetVersion)}
    AND target.state = 'published'
    AND target.checksum_hex = ${sqlString(targetChecksum)}
    AND EXISTS (
      SELECT 1 FROM catalog_release AS previous
      WHERE previous.version = ${sqlString(expectedCurrentVersion)}
        AND previous.state = 'published'
        AND previous.checksum_hex = ${sqlString(expectedCurrentChecksum)}
    )
);
`;
}

export function parseWranglerJson(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    fail(`Wrangler did not return JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  check(Array.isArray(parsed) && parsed.every((entry) => entry?.success === true), 'Wrangler query failed');
  return parsed;
}

function wranglerArgs(options) {
  const args = [WRANGLER_ENTRY, 'd1', 'execute', options.database, `--${options.mode}`, '--config', options.config, '--yes', '--json'];
  if (options.mode === 'local' && options.persistTo) args.push('--persist-to', options.persistTo);
  return args;
}

function runWrangler(options, inputFlag, inputValue) {
  const result = spawnSync(process.execPath, [...wranglerArgs(options), inputFlag, inputValue], {
    cwd: WORKER_DIR,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`Wrangler exited ${result.status}: ${(result.stderr || result.stdout).trim()}`);
  }
  return parseWranglerJson(result.stdout);
}

function queryRows(options, sql) {
  const response = runWrangler(options, '--command', sql);
  check(response.length === 1 && Array.isArray(response[0].results), 'Wrangler returned an unexpected result shape');
  return response[0].results;
}

function executeSqlFile(options, sql) {
  const directory = mkdtempSync(join(tmpdir(), 'overdrive-catalog-admin-'));
  const path = join(directory, 'operation.sql');
  try {
    writeFileSync(path, sql, { encoding: 'utf8', flag: 'wx' });
    return runWrangler(options, '--file', path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function releaseQuery(versionValue) {
  return `
    SELECT version, schema_version, effective_at_ms, checksum_hex, item_count,
           payload_bytes, state, created_at_ms, published_at_ms, draft_generation,
           typeof(payload_json) AS payload_type,
           length(payload_json) AS stored_payload_bytes,
           hex(payload_json) AS payload_hex
    FROM catalog_release
    WHERE version = ${sqlString(versionValue)}
  `;
}

function readRelease(options, versionValue) {
  const rows = queryRows(options, releaseQuery(versionValue));
  check(rows.length === 1, `expected one release row for ${versionValue}, got ${rows.length}`);
  return rows[0];
}

function readProjection(options, versionValue) {
  return Object.fromEntries(
    Object.entries(PROJECTION_QUERIES).map(([name, query]) => [
      name,
      queryRows(options, query.replace('?', sqlString(versionValue))),
    ]),
  );
}

function readChannel(options) {
  return queryRows(options, `
    SELECT channel.version, release.schema_version, release.checksum_hex,
           release.item_count, release.payload_bytes, release.state,
           release.published_at_ms, hex(release.payload_json) AS payload_hex
    FROM catalog_channel AS channel
    JOIN catalog_release AS release ON release.version = channel.version
    WHERE channel.channel = 'v1'
  `);
}

function checkedChannelSnapshot(row) {
  check(row.state === 'published', 'active channel does not target a published release');
  const bytes = Buffer.from(row.payload_hex, 'hex');
  check(bytes.byteLength === row.payload_bytes, 'active channel BLOB length mismatch');
  check(createHash('sha256').update(bytes).digest('hex') === row.checksum_hex, 'active channel checksum mismatch');
  const snapshot = JSON.parse(bytes.toString('utf8'));
  check(snapshot.catalogVersion === row.version, 'active channel payload version mismatch');
  return snapshot;
}

function catalogSiblingPath(catalogPath, suffix) {
  check(catalogPath.endsWith('.json'), 'canonical catalog path must end in .json');
  return `${catalogPath.slice(0, -'.json'.length)}${suffix}`;
}

function validateCanonicalArtifact(catalogPath, snapshot, raw) {
  const schema = JSON.parse(readFileSync(DEFAULT_SCHEMA, 'utf8'));
  const compatibility = JSON.parse(readFileSync(DEFAULT_COMPATIBILITY, 'utf8'));
  const referenceContext = JSON.parse(
    readFileSync(catalogSiblingPath(catalogPath, '.reference-context.json'), 'utf8'),
  );
  const seedContract = parseLegacySeedContract(readFileSync(DEFAULT_SEED, 'utf8'));
  const sidecar = readFileSync(catalogSiblingPath(catalogPath, '.sha256'), 'utf8');
  return validateCatalog({
    snapshot,
    schema,
    compatibility,
    referenceContext,
    seedContract,
    raw,
    sidecar,
  });
}

function validateInitialPublication(snapshot) {
  const effectiveAtMs = Date.parse(snapshot.effectiveAt);
  for (const exercise of snapshot.exercises) {
    check(exercise.recordRevision === 1, `${exercise.id}: initial recordRevision must be 1`);
    check(exercise.status === 'active', `${exercise.id}: initial IDs must enter as active`);
    check(exercise.effectiveTo === null, `${exercise.id}: initial active ID must not be ended`);
    check(exercise.replacementId === null, `${exercise.id}: initial active ID must not redirect`);
    check(
      Date.parse(exercise.effectiveFrom) <= effectiveAtMs,
      `${exercise.id}: initial effectiveFrom must not be later than the release`,
    );
  }
}

export function verifyCatalogTarget(options) {
  const raw = readFileSync(options.catalog);
  const localSnapshot = JSON.parse(raw.toString('utf8'));
  const canonical = validateCanonicalArtifact(options.catalog, localSnapshot, raw);
  const versionValue = options.version ?? localSnapshot.catalogVersion;
  check(versionValue === localSnapshot.catalogVersion, '--version differs from local catalogVersion');

  const firstRelease = readRelease(options, versionValue);
  const projections = readProjection(options, versionValue);
  const foreignKeyViolations = queryRows(options, 'PRAGMA foreign_key_check');
  const finalRelease = readRelease(options, versionValue);
  assert.deepStrictEqual(finalRelease, firstRelease, 'release changed during readback');
  const comparison = compareReleaseReadback({ raw, release: finalRelease, projections, foreignKeyViolations });
  check(canonical.checksum === `sha256:${comparison.checksumHex}`, 'canonical validator checksum mismatch');

  const channelRows = readChannel(options);
  check(channelRows.length <= 1, 'v1 channel has multiple rows');
  const previousSnapshot = channelRows.length === 0 ? null : checkedChannelSnapshot(channelRows[0]);
  if (previousSnapshot === null) {
    validateInitialPublication(localSnapshot);
  } else if (previousSnapshot.catalogVersion !== localSnapshot.catalogVersion) {
    validateCatalogTransition(previousSnapshot, localSnapshot);
  }

  return {
    ...comparison,
    release: finalRelease,
    currentChannelVersion: channelRows[0]?.version ?? null,
  };
}

function verifiedReleaseChecksum(options, versionValue, expectedChecksum) {
  const release = readRelease(options, versionValue);
  check(release.state === 'published', `${versionValue} is not published`);
  check(release.checksum_hex === expectedChecksum, `${versionValue} checksum does not match the required value`);
  const bytes = Buffer.from(release.payload_hex, 'hex');
  check(bytes.byteLength === release.payload_bytes, `${versionValue} BLOB length mismatch`);
  check(createHash('sha256').update(bytes).digest('hex') === expectedChecksum, `${versionValue} BLOB checksum mismatch`);
  return release;
}

function parseArguments(argv) {
  const args = [...argv];
  const explicitSubcommand = args[0] && !args[0].startsWith('--') ? args.shift() : null;
  const subcommand = explicitSubcommand ?? 'verify';
  check(['verify', 'publish', 'rollback'].includes(subcommand), `unknown subcommand ${subcommand}`);
  const values = {};
  const booleans = new Set(['remote', 'local', 'help']);
  while (args.length > 0) {
    const token = args.shift();
    check(token.startsWith('--'), `unexpected argument ${token}`);
    const separator = token.indexOf('=');
    const key = token.slice(2, separator === -1 ? undefined : separator);
    check(CLI_OPTIONS.has(key), `unknown option --${key}`);
    check(values[key] === undefined, `option --${key} was provided more than once`);
    if (booleans.has(key)) {
      check(separator === -1, `--${key} does not accept a value`);
      values[key] = true;
      continue;
    }
    const value = separator === -1 ? args.shift() : token.slice(separator + 1);
    check(value !== undefined && !value.startsWith('--'), `--${key} requires a value`);
    values[key] = value;
  }
  return { subcommand, explicitSubcommand, values };
}

function usage() {
  return `Usage:
  node catalog/scripts/admin.mjs [verify] (--local|--remote) [options]
  node catalog/scripts/admin.mjs publish (--local|--remote) [options]
  node catalog/scripts/admin.mjs rollback (--local|--remote) --expected-current-version V --expected-current-checksum SHA --target-version V --target-checksum SHA [options]

Options:
  --database NAME          D1 database name (default: overdrive-catalog)
  --config PATH            reviewed Wrangler config (local default: catalog/wrangler.template.toml)
  --catalog PATH           canonical compact JSON artifact
  --version V              target catalog version (defaults to artifact catalogVersion)
  --persist-to PATH        Wrangler local persistence directory
  --published-at-ms N      fixed publication timestamp for reproducible retry
  --expected-current-version V
                           optional publish CAS; required for rollback
  --expected-current-checksum SHA
                           rollback current release checksum
  --target-version V       rollback destination version
  --target-checksum SHA     rollback destination checksum
`;
}

function commandOptions(parsed) {
  const { values } = parsed;
  check(Boolean(values.local) !== Boolean(values.remote), 'choose exactly one of --local or --remote');
  const config = resolve(values.config ?? DEFAULT_CONFIG);
  if (values.remote) {
    check(values.config !== undefined, '--remote requires an explicitly reviewed --config');
  }
  return {
    database: values.database ?? DEFAULT_DATABASE,
    config,
    catalog: resolve(values.catalog ?? DEFAULT_CATALOG),
    version: values.version,
    mode: values.remote ? 'remote' : 'local',
    persistTo: values['persist-to'] ? resolve(values['persist-to']) : undefined,
  };
}

export function main(argv = process.argv.slice(2)) {
  const parsed = parseArguments(argv);
  if (parsed.values.help) {
    process.stdout.write(usage());
    return;
  }
  const options = commandOptions(parsed);
  if (parsed.subcommand === 'verify') {
    const result = verifyCatalogTarget(options);
    process.stdout.write(`${JSON.stringify({
      status: 'verified',
      mode: options.mode,
      version: result.snapshot.catalogVersion,
      checksum: `sha256:${result.checksumHex}`,
      draftGeneration: result.draftGeneration,
      releaseState: result.release.state,
      currentChannelVersion: result.currentChannelVersion,
    })}\n`);
    return;
  }

  check(parsed.explicitSubcommand === parsed.subcommand, 'mutations require an explicit publish or rollback subcommand');
  if (parsed.subcommand === 'publish') {
    const result = verifyCatalogTarget(options);
    check(['draft', 'published'].includes(result.release.state), 'withdrawn releases cannot be published');
    if (parsed.values['expected-current-version'] !== undefined) {
      check(result.currentChannelVersion === parsed.values['expected-current-version'], 'current channel differs from --expected-current-version');
    }
    const publishedAtMs = result.release.state === 'published'
      ? result.release.published_at_ms
      : integer(parsed.values['published-at-ms'] ?? Date.now(), 'publishedAtMs');
    if (parsed.values['published-at-ms'] !== undefined && result.release.state === 'published') {
      check(publishedAtMs === integer(parsed.values['published-at-ms'], 'publishedAtMs'), 'published timestamp differs from retry value');
    }
    process.stderr.write(`[catalog-admin] fixed published_at_ms=${publishedAtMs}\n`);
    const sql = buildPublishSql({
      version: result.snapshot.catalogVersion,
      schemaVersion: result.snapshot.schemaVersion,
      effectiveAtMs: Date.parse(result.snapshot.effectiveAt),
      checksumHex: result.checksumHex,
      itemCount: result.itemCount,
      payloadBytes: result.payloadBytes,
      draftGeneration: result.draftGeneration,
      publishedAtMs,
      expectedCurrentVersion: result.currentChannelVersion === result.snapshot.catalogVersion
        ? null
        : result.currentChannelVersion,
    });
    executeSqlFile(options, sql);
    const post = verifyCatalogTarget(options);
    check(post.release.state === 'published' && post.currentChannelVersion === post.snapshot.catalogVersion, 'post-publish readback failed');
    process.stdout.write(`${JSON.stringify({
      status: 'published',
      mode: options.mode,
      version: post.snapshot.catalogVersion,
      checksum: `sha256:${post.checksumHex}`,
      publishedAtMs,
    })}\n`);
    return;
  }

  const expectedCurrentVersion = version(parsed.values['expected-current-version'], 'expectedCurrentVersion');
  const expectedCurrentChecksum = checksum(parsed.values['expected-current-checksum'], 'expectedCurrentChecksum');
  const targetVersion = version(parsed.values['target-version'], 'targetVersion');
  const targetChecksum = checksum(parsed.values['target-checksum'], 'targetChecksum');
  const channelRows = readChannel(options);
  check(channelRows.length === 1, 'rollback requires one active v1 channel');
  check([expectedCurrentVersion, targetVersion].includes(channelRows[0].version), 'active channel is neither expected current nor target version');
  verifiedReleaseChecksum(options, expectedCurrentVersion, expectedCurrentChecksum);
  verifiedReleaseChecksum(options, targetVersion, targetChecksum);
  const sql = buildRollbackSql({
    expectedCurrentVersion,
    expectedCurrentChecksum,
    targetVersion,
    targetChecksum,
  });
  executeSqlFile(options, sql);
  const postChannel = readChannel(options);
  check(postChannel.length === 1 && postChannel[0].version === targetVersion, 'post-rollback pointer readback failed');
  process.stdout.write(`${JSON.stringify({
    status: 'rolled-back',
    mode: options.mode,
    from: expectedCurrentVersion,
    to: targetVersion,
    withdrawal: false,
  })}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
