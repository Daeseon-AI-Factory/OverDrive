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
const [schema, compatibility, seedSource, contractText] = await Promise.all([
  readFile(`${ROOT}docs/contracts/exercise-catalog-v1.schema.json`, 'utf8').then(JSON.parse),
  readFile(`${ROOT}docs/contracts/exercise-catalog-v1-compatibility.json`, 'utf8').then(JSON.parse),
  readFile(`${ROOT}src/db/seed.ts`, 'utf8'),
  readFile(`${ROOT}docs/exercise-catalog-v1.md`, 'utf8'),
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

test('current curated release is exactly 64 unpublished revision-1 rows', () => {
  const snapshot = buildCatalogSnapshot();
  const result = validateCatalog(inputFor(snapshot, true));
  assert.equal(snapshot.exercises.length, 64);
  assert.equal(snapshot.exercises.every((exercise) => exercise.recordRevision === 1), true);
  assert.equal(result.payloadBytes, Buffer.byteLength(JSON.stringify(snapshot), 'utf8'));
  assert.equal(snapshot.exercises.every((exercise) => exercise.provenance.reviewStatus === 'unreviewed'), true);
  assert.equal(snapshot.exercises.every((exercise) => exercise.provenance.sources.length === 0), true);
  assert.equal(row(snapshot, 'db_curl').defaultPrescription.countingConvention, 'per_side');
  assert.equal(row(snapshot, 'hammer_curl').defaultPrescription.countingConvention, 'per_side');
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

test('validator applies per-side targets to generic dumbbell curl identities', () => {
  for (const id of ['db_curl', 'hammer_curl']) {
    const snapshot = structuredClone(buildCatalogSnapshot());
    row(snapshot, id).defaultPrescription.countingConvention = 'total';
    assert.throws(() => validateCatalog(inputFor(snapshot)), /set is complete only after both sides/);
  }
});

test('published counting convention changes require a new replacement ID', () => {
  const previous = buildCatalogSnapshot();
  const next = structuredClone(previous);
  row(next, 'db_curl').defaultPrescription.countingConvention = 'total';
  assert.throws(
    () => validateCatalogTransition(previous, next),
    /published countingConvention is immutable.*new ID and replacement/,
  );
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
