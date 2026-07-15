import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCatalogSnapshot, REFERENCE_CONTEXT } from './catalog-source.mjs';
import {
  checksumForRaw,
  parseLegacySeedContract,
  validateCatalog,
  validateCatalogTransition,
} from './catalog-validation.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const sqlite = await import('node:sqlite').catch(() => null);
const [schema, compatibility, seedSource, contractText, rawCatalog, d1DraftSql] = await Promise.all([
  readFile(`${ROOT}docs/contracts/exercise-catalog-v1.schema.json`, 'utf8').then(JSON.parse),
  readFile(`${ROOT}docs/contracts/exercise-catalog-v1-compatibility.json`, 'utf8').then(JSON.parse),
  readFile(`${ROOT}src/db/seed.ts`, 'utf8'),
  readFile(`${ROOT}docs/exercise-catalog-v1.md`, 'utf8'),
  readFile(`${ROOT}assets/catalog/exercise-catalog-v1.json`),
  readFile(`${ROOT}assets/catalog/exercise-catalog-v1.d1.sql`, 'utf8'),
]);
const seedContract = parseLegacySeedContract(seedSource);

const inputFor = (snapshot, withBytes = false, referenceContext = REFERENCE_CONTEXT) => {
  const input = {
    snapshot,
    schema,
    compatibility,
    referenceContext,
    seedContract,
  };
  if (withBytes) {
    input.raw = Buffer.from(JSON.stringify(snapshot), 'utf8');
    input.sidecar = `${checksumForRaw(input.raw)}\n`;
  }
  return input;
};

const row = (snapshot, id) => snapshot.exercises.find((exercise) => exercise.id === id);
const asNextRelease = (previous, version = '1.0.1', effectiveAt = '2026-07-15T00:00:00Z') => {
  const next = structuredClone(previous);
  next.catalogVersion = version;
  next.effectiveAt = effectiveAt;
  return next;
};

const D1_FIXTURE_SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE catalog_release (
  version TEXT PRIMARY KEY,
  schema_version TEXT,
  effective_at_ms INTEGER,
  checksum_hex TEXT,
  item_count INTEGER,
  payload_bytes INTEGER,
  payload_json BLOB,
  state TEXT,
  created_at_ms INTEGER,
  published_at_ms INTEGER
);
CREATE TABLE catalog_exercise (
  version TEXT,
  id TEXT,
  record_revision INTEGER,
  status TEXT,
  effective_from_ms INTEGER,
  effective_to_ms INTEGER,
  replacement_id TEXT,
  display_order INTEGER,
  exercise_type TEXT,
  is_bodyweight INTEGER,
  movement_pattern TEXT,
  difficulty TEXT,
  default_sets INTEGER,
  tracking_mode TEXT,
  counting_convention TEXT,
  target_unit TEXT,
  target_low REAL,
  target_high REAL,
  provenance_classification TEXT,
  review_status TEXT,
  review_method TEXT,
  reviewed_by_role TEXT,
  review_evidence TEXT,
  reviewed_at_ms INTEGER,
  contains_third_party_copy INTEGER,
  PRIMARY KEY (version, id),
  FOREIGN KEY (version) REFERENCES catalog_release(version) ON DELETE CASCADE
);
CREATE TABLE catalog_localization (
  version TEXT, exercise_id TEXT, locale TEXT, display_name TEXT, normalized_display_name TEXT,
  PRIMARY KEY (version, exercise_id, locale),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id) ON DELETE CASCADE
);
CREATE TABLE catalog_alias (
  version TEXT, exercise_id TEXT, locale TEXT, alias_order INTEGER, alias TEXT, normalized_alias TEXT,
  PRIMARY KEY (version, exercise_id, locale, alias_order),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id) ON DELETE CASCADE
);
CREATE TABLE catalog_equipment (
  version TEXT, exercise_id TEXT, role TEXT, equipment_order INTEGER, equipment_id TEXT,
  PRIMARY KEY (version, exercise_id, role, equipment_order),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id) ON DELETE CASCADE
);
CREATE TABLE catalog_region (
  version TEXT, exercise_id TEXT, role TEXT, region_order INTEGER, region_id TEXT,
  PRIMARY KEY (version, exercise_id, role, region_order),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id) ON DELETE CASCADE
);
CREATE TABLE catalog_source (
  version TEXT, exercise_id TEXT, source_order INTEGER, source_type TEXT, label TEXT, url TEXT,
  license TEXT, accessed_at_ms INTEGER,
  PRIMARY KEY (version, exercise_id, source_order),
  FOREIGN KEY (version, exercise_id) REFERENCES catalog_exercise(version, id) ON DELETE CASCADE
);
`;

function openD1Fixture() {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(D1_FIXTURE_SCHEMA);
  return db;
}

test('current curated release is exactly 64 unpublished revision-1 rows', () => {
  const snapshot = buildCatalogSnapshot();
  const result = validateCatalog(inputFor(snapshot, true));
  assert.equal(snapshot.exercises.length, 64);
  assert.equal(snapshot.exercises.every((exercise) => exercise.recordRevision === 1), true);
  assert.equal(result.payloadBytes, Buffer.byteLength(JSON.stringify(snapshot), 'utf8'));
  assert.equal(snapshot.exercises.every((exercise) => exercise.provenance.reviewStatus === 'unreviewed'), true);
  assert.equal(snapshot.exercises.every((exercise) => exercise.provenance.sources.length === 0), true);
  assert.equal(snapshot.exercises.every((exercise) => exercise.status === 'active'), true);
  assert.equal(snapshot.exercises.every((exercise) => exercise.effectiveTo === null), true);
  assert.equal(snapshot.exercises.every((exercise) => exercise.replacementId === null), true);
  assert.equal(row(snapshot, 'db_curl').defaultPrescription.countingConvention, 'total');
  assert.equal(row(snapshot, 'hammer_curl').defaultPrescription.countingConvention, 'total');
  assert.equal(row(snapshot, 'seated_trunk_rotation').defaultPrescription.countingConvention, 'per_side');
});

test('generic v1 validator accepts a valid 65-row snapshot', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  const extra = structuredClone(row(snapshot, 'cable_crunch'));
  extra.id = 'fixture_sixty_fifth_exercise';
  extra.displayOrder = 65;
  extra.localizations = {
    en: { displayName: 'Fixture Sixty-Fifth Exercise', aliases: ['Fixture Movement 65'] },
    ko: { displayName: '검증용 육십오 번 운동', aliases: ['검증용 65 동작'] },
    es: { displayName: 'Ejercicio de prueba sesenta y cinco', aliases: ['Movimiento de prueba 65'] },
    'zh-Hans': { displayName: '验证用第六十五项运动', aliases: ['验证用65动作'] },
  };
  snapshot.exercises.push(extra);

  assert.doesNotThrow(() => validateCatalog(inputFor(snapshot)));
});

test('schema and contract freeze exact timestamp and cache fallback semantics', () => {
  assert.deepEqual(schema.$defs.timestamp, {
    type: 'string',
    format: 'date-time',
    pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$',
  });
  assert.match(
    contractText,
    /newest valid active cache, retained previous valid cache[\s\S]*bundled snapshot[\s\S]*seeded `exercise` rows/,
  );
  assert.match(contractText, /An `unreviewed` row has exactly zero row-level source records/);
  assert.match(contractText, /published semantic row revisions, not draft commits/);
  assert.match(contractText, /resistance bands, assistance amounts,[\s\S]*cannot be entered honestly as[\s\S]*kg\/lb/);
  assert.match(contractText, /legacy bridge-compatibility value[\s\S]*not[\s\S]*reliable factual bodyweight/);
});

test('validator alarms when a frozen legacy ID is renamed', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  snapshot.exercises[0].id = 'renamed_bench_press';
  assert.throws(() => validateCatalog(inputFor(snapshot)), /preserve exact legacy ID order/);
});

test('validator alarms when an unreviewed row claims source checking', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  snapshot.exercises[0].provenance.reviewStatus = 'source_checked';
  snapshot.exercises[0].provenance.reviewMethod = 'source_comparison';
  snapshot.exercises[0].provenance.reviewedByRole = 'catalog-agent';
  snapshot.exercises[0].provenance.reviewEvidence = 'self-authored-evidence';
  snapshot.exercises[0].provenance.reviewedAt = '2026-07-14T00:00:00Z';
  assert.throws(() => validateCatalog(inputFor(snapshot)), /must remain unreviewed/);
});

test('validator alarms when an unreviewed row borrows general references as citations', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  snapshot.exercises[0].provenance.sources = structuredClone(REFERENCE_CONTEXT.sources.strength);
  assert.throws(() => validateCatalog(inputFor(snapshot)), /must have no row citations/);
});

test('validator alarms when reference context claims exercise-specific review', () => {
  const referenceContext = structuredClone(REFERENCE_CONTEXT);
  referenceContext.exerciseSpecificReview = true;
  assert.throws(
    () => validateCatalog(inputFor(buildCatalogSnapshot(), false, referenceContext)),
    /exerciseSpecificReview: must be false/,
  );
});

test('validator alarms on region overlap', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  snapshot.exercises[0].secondaryBodyRegions.push('chest');
  assert.throws(() => validateCatalog(inputFor(snapshot)), /must be disjoint/);
});

test('validator alarms on more than three secondary targets', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  row(snapshot, 'barbell_bench_press').secondaryBodyRegions.push('core', 'back');
  assert.throws(() => validateCatalog(inputFor(snapshot)), /must have at most 3 regions/);
});

test('validator alarms when incidental stabilization is restored as a secondary target', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  row(snapshot, 'barbell_back_squat').secondaryBodyRegions.push('core');
  assert.throws(() => validateCatalog(inputFor(snapshot)), /incidental stabilization/);
});

test('validator alarms when a locale is missing', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  delete snapshot.exercises[0].localizations.es;
  assert.throws(() => validateCatalog(inputFor(snapshot)), /keys\/order must be en, ko, es, zh-Hans/);
});

test('validator alarms when optional equipment is used as a substitute implementation', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  row(snapshot, 'zone2_run').equipment.optional.push('treadmill');
  assert.throws(() => validateCatalog(inputFor(snapshot)), /must contain only supplemental equipment/);
});

test('validator rejects optional mass on new bodyweight rows until added load is persistable', () => {
  for (const [id, equipmentId] of [
    ['walking_lunge', 'dumbbell'],
    ['step_platform_step_up', 'kettlebell'],
    ['glute_bridge', 'weight_plate'],
  ]) {
    const snapshot = structuredClone(buildCatalogSnapshot());
    row(snapshot, id).equipment.optional.push(equipmentId);
    assert.throws(
      () => validateCatalog(inputFor(snapshot)),
      /v1 kg-only bodyweight logger cannot persist honestly/,
    );
  }
});

test('validator alarms when a frozen generic identity is narrowed to a machine display', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  row(snapshot, 'standing_calf_raise').localizations.en = {
    displayName: 'Machine Standing Calf Raise',
    aliases: ['Standing Calf Raise'],
  };
  assert.throws(() => validateCatalog(inputFor(snapshot)), /preserve the frozen umbrella identity as Standing Calf Raise/);
});

test('validator alarms when HIIT modality and equipment become ambiguous', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  const hiit = row(snapshot, 'hiit_intervals');
  hiit.equipment.required = [];
  hiit.equipment.optional = ['treadmill', 'bicycle'];
  assert.throws(() => validateCatalog(inputFor(snapshot)), /frozen umbrella boundary/);
});

test('validator enforces frozen bridge flags and capability boundaries', () => {
  for (const [id, value] of [
    ['bulgarian_split_squat', true],
    ['standing_calf_raise', true],
    ['cycling', false],
    ['rowing', false],
  ]) {
    const snapshot = structuredClone(buildCatalogSnapshot());
    row(snapshot, id).isBodyweight = value;
    assert.throws(() => validateCatalog(inputFor(snapshot)), /frozen bridge must preserve seed value/);
  }

  const bulgarian = structuredClone(buildCatalogSnapshot());
  row(bulgarian, 'bulgarian_split_squat').equipment.required = ['rear_foot_support'];
  assert.throws(() => validateCatalog(inputFor(bulgarian)), /external_resistance/);

  const hipThrust = structuredClone(buildCatalogSnapshot());
  row(hipThrust, 'hip_thrust').equipment.required = ['upper_back_support'];
  assert.throws(() => validateCatalog(inputFor(hipThrust)), /external_resistance/);

  const nonFrozen = structuredClone(buildCatalogSnapshot());
  row(nonFrozen, 'push_up').equipment.required = ['external_resistance'];
  assert.throws(() => validateCatalog(inputFor(nonFrozen)), /frozen-umbrella capability/);
});

test('validator alarms on corrected movement regressions', () => {
  const legPress = structuredClone(buildCatalogSnapshot());
  row(legPress, 'leg_press').movementPattern = 'knee_extension';
  assert.throws(() => validateCatalog(inputFor(legPress)), /leg_press\.movementPattern: must be squat/);

  const dips = structuredClone(buildCatalogSnapshot());
  row(dips, 'dips').movementPattern = 'horizontal_push';
  assert.throws(() => validateCatalog(inputFor(dips)), /dips\.movementPattern: must be vertical_push/);
});

test('validator alarms when a unilateral target loses per-side counting', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  row(snapshot, 'single_arm_db_row').defaultPrescription.countingConvention = 'total';
  assert.throws(() => validateCatalog(inputFor(snapshot)), /must use per_side/);
});

test('validator applies bilateral set completeness to seated trunk rotation', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  row(snapshot, 'seated_trunk_rotation').defaultPrescription.countingConvention = 'total';
  assert.throws(() => validateCatalog(inputFor(snapshot)), /set is complete only after both sides/);
});

test('validator preserves total counting on frozen generic curl identities', () => {
  for (const id of ['db_curl', 'hammer_curl']) {
    const snapshot = structuredClone(buildCatalogSnapshot());
    row(snapshot, id).defaultPrescription.countingConvention = 'per_side';
    assert.throws(() => validateCatalog(inputFor(snapshot)), /not in the canonical per-side set/);
  }
});

test('published counting convention changes require a new ID and replacement', () => {
  const previous = buildCatalogSnapshot();
  const next = asNextRelease(previous);
  row(next, 'db_curl').defaultPrescription.countingConvention = 'per_side';
  row(next, 'db_curl').recordRevision = 2;
  assert.throws(
    () => validateCatalogTransition(previous, next),
    /published log identity is immutable.*new ID and replacement/,
  );
});

test('transition freezes every historic log-identity field even with a revision bump', () => {
  const mutations = [
    ['exerciseType', (exercise) => { exercise.exerciseType = 'cardio'; }],
    ['isBodyweight', (exercise) => { exercise.isBodyweight = true; }],
    ['trackingMode', (exercise) => { exercise.defaultPrescription.trackingMode = 'duration'; }],
    ['countingConvention', (exercise) => { exercise.defaultPrescription.countingConvention = 'per_side'; }],
    ['target.unit', (exercise) => { exercise.defaultPrescription.target.unit = 'seconds'; }],
  ];
  for (const [field, mutate] of mutations) {
    const previous = buildCatalogSnapshot();
    const next = asNextRelease(previous);
    const exercise = row(next, 'db_curl');
    mutate(exercise);
    exercise.recordRevision = 2;
    assert.throws(
      () => validateCatalogTransition(previous, next),
      new RegExp(`${field.replace('.', '\\.')}.*published log identity is immutable`),
    );
  }
});

test('transition requires exact revision movement for changed and unchanged rows', () => {
  const previous = buildCatalogSnapshot();

  const stale = asNextRelease(previous);
  row(stale, 'db_curl').localizations.en.displayName = 'Dumbbell Arm Curl';
  assert.throws(() => validateCatalogTransition(previous, stale), /semantic change must increment exactly one/);

  const jump = asNextRelease(previous);
  row(jump, 'db_curl').localizations.en.displayName = 'Dumbbell Arm Curl';
  row(jump, 'db_curl').recordRevision = 3;
  assert.throws(() => validateCatalogTransition(previous, jump), /jumps and stale revisions are forbidden/);

  const exact = asNextRelease(previous);
  row(exact, 'db_curl').localizations.en.displayName = 'Dumbbell Arm Curl';
  row(exact, 'db_curl').recordRevision = 2;
  assert.doesNotThrow(() => validateCatalogTransition(previous, exact));

  const unchangedBump = asNextRelease(previous);
  row(unchangedBump, 'db_curl').recordRevision = 2;
  assert.throws(() => validateCatalogTransition(previous, unchangedBump), /unchanged row must keep the same revision/);
});

test('transition enforces immutable effectiveFrom, strict SemVer, and monotonic release time', () => {
  const previous = buildCatalogSnapshot();

  const movedStart = asNextRelease(previous);
  row(movedStart, 'db_curl').effectiveFrom = '2026-07-15T00:00:00Z';
  row(movedStart, 'db_curl').recordRevision = 2;
  assert.throws(() => validateCatalogTransition(previous, movedStart), /effectiveFrom: is immutable/);

  assert.throws(
    () => validateCatalogTransition(previous, asNextRelease(previous, '1.0.0')),
    /catalogVersion: must be strictly newer/,
  );
  assert.throws(
    () => validateCatalogTransition(previous, asNextRelease(previous, '1.00.1')),
    /canonical v1 SemVer/,
  );
  assert.throws(
    () => validateCatalogTransition(previous, asNextRelease(previous, '1.0.1', previous.effectiveAt)),
    /effectiveAt: must be later/,
  );
});

test('transition permits only active to deprecated to retired and never removes an ID', () => {
  const active = buildCatalogSnapshot();
  const deprecated = asNextRelease(active);
  row(deprecated, 'db_curl').status = 'deprecated';
  row(deprecated, 'db_curl').recordRevision = 2;
  assert.doesNotThrow(() => validateCatalogTransition(active, deprecated));

  const skipped = asNextRelease(active);
  row(skipped, 'db_curl').status = 'retired';
  row(skipped, 'db_curl').effectiveTo = skipped.effectiveAt;
  row(skipped, 'db_curl').recordRevision = 2;
  assert.throws(() => validateCatalogTransition(active, skipped), /active -> retired/);

  const retired = asNextRelease(deprecated, '1.0.2', '2026-07-16T00:00:00Z');
  row(retired, 'db_curl').status = 'retired';
  row(retired, 'db_curl').effectiveTo = retired.effectiveAt;
  row(retired, 'db_curl').recordRevision = 3;
  assert.doesNotThrow(() => validateCatalogTransition(deprecated, retired));

  const reactivated = asNextRelease(retired, '1.0.3', '2026-07-17T00:00:00Z');
  row(reactivated, 'db_curl').status = 'active';
  row(reactivated, 'db_curl').effectiveTo = null;
  row(reactivated, 'db_curl').recordRevision = 4;
  assert.throws(() => validateCatalogTransition(retired, reactivated), /retired -> active/);

  const removed = asNextRelease(active);
  removed.exercises = removed.exercises.filter((exercise) => exercise.id !== 'db_curl');
  assert.throws(() => validateCatalogTransition(active, removed), /published IDs must never be removed/);
});

test('transition admits only revision-1 new IDs inside the release window', () => {
  const previous = buildCatalogSnapshot();
  const valid = asNextRelease(previous);
  const added = structuredClone(row(valid, 'cable_crunch'));
  added.id = 'fixture_new_release_exercise';
  added.displayOrder = 65;
  added.effectiveFrom = valid.effectiveAt;
  valid.exercises.push(added);
  assert.doesNotThrow(() => validateCatalogTransition(previous, valid));

  const revisionJump = structuredClone(valid);
  row(revisionJump, added.id).recordRevision = 2;
  assert.throws(() => validateCatalogTransition(previous, revisionJump), /new IDs must start at revision 1/);

  const backdated = structuredClone(valid);
  row(backdated, added.id).effectiveFrom = previous.effectiveAt;
  assert.throws(() => validateCatalogTransition(previous, backdated), /after the prior release/);

  const future = structuredClone(valid);
  row(future, added.id).effectiveFrom = '2026-07-16T00:00:00Z';
  assert.throws(() => validateCatalogTransition(previous, future), /no later than this release/);
});

test('validator alarms on a new strength duration or distance row unsupported by the logger', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  const march = row(snapshot, 'dumbbell_suitcase_march');
  march.defaultPrescription = {
    sets: 3,
    trackingMode: 'distance',
    countingConvention: 'total',
    target: { unit: 'meters', low: 20, high: 40 },
  };
  assert.throws(() => validateCatalog(inputFor(snapshot)), /current rep-loggable workflow/);
});

test('validator alarms when corrected aliases regress', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  row(snapshot, 'dips').localizations['zh-Hans'].aliases = ['双杠下压'];
  assert.throws(() => validateCatalog(inputFor(snapshot)), /corrected Chinese alias/);
});

test('validator scans non-frozen aliases for eponyms and protected marks', () => {
  for (const token of ['Arnold', 'CrossFit', 'Tabata']) {
    const snapshot = structuredClone(buildCatalogSnapshot());
    row(snapshot, 'elliptical').localizations.en.aliases = [`${token} Conditioning`];
    assert.throws(
      () => validateCatalog(inputFor(snapshot)),
      new RegExp(`protected identity token ${token.toLowerCase()}`, 'i'),
    );
  }
});

test('validator permits exactly one trap-bar token without inventing review provenance', () => {
  const snapshot = buildCatalogSnapshot();
  const hexBar = row(snapshot, 'hex_bar_deadlift');
  assert.deepEqual(hexBar.localizations.en.aliases, ['Trap-Bar Deadlift']);
  assert.equal(hexBar.provenance.reviewStatus, 'unreviewed');
  assert.equal(hexBar.provenance.reviewMethod, 'none');
  assert.equal(hexBar.provenance.reviewEvidence, null);
  assert.equal(hexBar.provenance.sources.length, 0);

  const extraToken = structuredClone(snapshot);
  row(extraToken, 'deadlift').localizations.en.aliases = ['Trap Bar Pull'];
  assert.throws(() => validateCatalog(inputFor(extraToken)), /trap-bar tokens are forbidden outside/);

  const localizedToken = structuredClone(snapshot);
  row(localizedToken, 'hex_bar_deadlift').localizations.es.aliases = ['Peso muerto trap bar'];
  assert.throws(() => validateCatalog(inputFor(localizedToken)), /trap-bar tokens are forbidden outside/);
});

test('validator keeps pull-up grip and rear-delt equipment identities distinct', () => {
  const chinUp = structuredClone(buildCatalogSnapshot());
  row(chinUp, 'assisted_pull_up').localizations.en.aliases = ['Assisted Chin-Up'];
  assert.throws(() => validateCatalog(inputFor(chinUp)), /must preserve the pull-up grip/);

  const rearDelt = structuredClone(buildCatalogSnapshot());
  row(rearDelt, 'machine_rear_delt_fly').equipment.required = ['chest_fly_machine'];
  assert.throws(() => validateCatalog(inputFor(rearDelt)), /dual_fly_machine/);
});

test('validator rejects date-only, timezone-free, and calendar-normalized timestamps', () => {
  for (const invalid of ['2026-07-14', '2026-07-14T00:00:00', '2026-02-30T00:00:00Z']) {
    const snapshot = structuredClone(buildCatalogSnapshot());
    snapshot.effectiveAt = invalid;
    assert.throws(() => validateCatalog(inputFor(snapshot)), /timestamp|UTC second precision|calendar instant/);
  }
});

test('generic validator accepts valid deprecated and retired rows with active replacements', () => {
  const deprecated = structuredClone(buildCatalogSnapshot());
  deprecated.catalogVersion = '1.0.1';
  deprecated.effectiveAt = '2026-07-15T00:00:00Z';
  row(deprecated, 'db_curl').status = 'deprecated';
  row(deprecated, 'db_curl').replacementId = 'angled_bar_curl';
  row(deprecated, 'db_curl').recordRevision = 2;
  assert.doesNotThrow(() => validateCatalog(inputFor(deprecated)));

  const retired = structuredClone(deprecated);
  retired.catalogVersion = '1.0.2';
  retired.effectiveAt = '2026-07-16T00:00:00Z';
  row(retired, 'db_curl').status = 'retired';
  row(retired, 'db_curl').effectiveTo = retired.effectiveAt;
  row(retired, 'db_curl').recordRevision = 3;
  assert.doesNotThrow(() => validateCatalog(inputFor(retired)));
});

test('generic validator rejects invalid lifecycle shape and inactive replacement targets', () => {
  const activeRedirect = structuredClone(buildCatalogSnapshot());
  row(activeRedirect, 'db_curl').replacementId = 'angled_bar_curl';
  assert.throws(() => validateCatalog(inputFor(activeRedirect)), /active rows must not redirect/);

  const retiredWithoutEnd = structuredClone(buildCatalogSnapshot());
  row(retiredWithoutEnd, 'db_curl').status = 'retired';
  row(retiredWithoutEnd, 'db_curl').replacementId = 'angled_bar_curl';
  assert.throws(() => validateCatalog(inputFor(retiredWithoutEnd)), /retired rows must have an end time/);

  const futureStart = structuredClone(buildCatalogSnapshot());
  row(futureStart, 'db_curl').effectiveFrom = '2026-07-15T00:00:00Z';
  assert.throws(() => validateCatalog(inputFor(futureStart)), /must not be later than the containing release/);

  const inactiveTarget = structuredClone(buildCatalogSnapshot());
  inactiveTarget.catalogVersion = '1.0.1';
  inactiveTarget.effectiveAt = '2026-07-15T00:00:00Z';
  row(inactiveTarget, 'db_curl').status = 'deprecated';
  row(inactiveTarget, 'db_curl').replacementId = 'angled_bar_curl';
  row(inactiveTarget, 'angled_bar_curl').status = 'deprecated';
  assert.throws(() => validateCatalog(inputFor(inactiveTarget)), /must reference an active row/);
});

test('validator alarms when equipment coverage silently disappears', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  row(snapshot, 'swimming').equipment.required = ['other'];
  assert.throws(() => validateCatalog(inputFor(snapshot)), /coverage\.equipment\.pool/);
});

test('validator alarms when raw bytes and sidecar are stale', () => {
  const snapshot = buildCatalogSnapshot();
  const input = inputFor(snapshot, true);
  input.sidecar = `sha256:${'0'.repeat(64)}\n`;
  assert.throws(() => validateCatalog(input), /must be one checksum line/);
});

test('generated D1 draft import has no nested transaction and bounds every statement and BLOB chunk', () => {
  assert.doesNotMatch(d1DraftSql, /^\s*(?:BEGIN|COMMIT|ROLLBACK)\b/im);
  assert.match(d1DraftSql, new RegExp(`zeroblob\\(${rawCatalog.byteLength}\\)`));
  const statements = d1DraftSql.split(';').map((value) => value.trim()).filter(Boolean);
  assert.equal(Math.max(...statements.map((statement) => Buffer.byteLength(statement, 'utf8'))) < 80_000, true);
  const blobChunks = [...d1DraftSql.matchAll(/X'([0-9a-f]+)'/g)].map((match) => match[1]);
  assert.equal(blobChunks.length >= 2, true);
  assert.equal(blobChunks.every((hex) => hex.length % 2 === 0 && hex.length / 2 <= 24 * 1024), true);
  assert.equal(blobChunks.reduce((total, hex) => total + hex.length / 2, 0), rawCatalog.byteLength);
});

test(
  'generated D1 draft import reconstructs exact BLOB bytes and is idempotent while draft',
  { skip: sqlite === null },
  () => {
    const db = openD1Fixture();
    try {
      db.exec(d1DraftSql);
      const release = db.prepare(
        'SELECT checksum_hex, payload_bytes, payload_json, state FROM catalog_release WHERE version = ?',
      ).get('1.0.0');
      assert.equal(release.checksum_hex, checksumForRaw(rawCatalog).slice('sha256:'.length));
      assert.equal(release.payload_bytes, rawCatalog.byteLength);
      assert.equal(release.state, 'draft');
      assert.deepEqual(Buffer.from(release.payload_json), rawCatalog);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM catalog_exercise').get().count, 64);

      db.exec(d1DraftSql);
      const reapplied = db.prepare(
        'SELECT payload_json FROM catalog_release WHERE version = ?',
      ).get('1.0.0');
      assert.deepEqual(Buffer.from(reapplied.payload_json), rawCatalog);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM catalog_exercise').get().count, 64);
      assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    } finally {
      db.close();
    }
  },
);

test(
  'generated D1 draft import fails closed without deleting children after publication or withdrawal',
  { skip: sqlite === null },
  () => {
    for (const terminalState of ['published', 'withdrawn']) {
      const db = openD1Fixture();
      try {
        db.exec(d1DraftSql);
        const before = db.prepare('SELECT COUNT(*) AS count FROM catalog_exercise').get().count;
        db.prepare('UPDATE catalog_release SET state = ? WHERE version = ?').run(terminalState, '1.0.0');
        assert.throws(() => db.exec(d1DraftSql), /UNIQUE constraint failed/);
        assert.equal(
          db.prepare('SELECT state FROM catalog_release WHERE version = ?').get('1.0.0').state,
          terminalState,
        );
        assert.equal(db.prepare('SELECT COUNT(*) AS count FROM catalog_exercise').get().count, before);
        assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
      } finally {
        db.close();
      }
    }
  },
);
