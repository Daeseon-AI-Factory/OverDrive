import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCatalogSnapshot, REFERENCE_CONTEXT } from './catalog-source.mjs';
import { checksumForRaw, validateCatalog } from './catalog-validation.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const [schema, compatibility, seedSource] = await Promise.all([
  readFile(`${ROOT}docs/contracts/exercise-catalog-v1.schema.json`, 'utf8').then(JSON.parse),
  readFile(`${ROOT}docs/contracts/exercise-catalog-v1-compatibility.json`, 'utf8').then(JSON.parse),
  readFile(`${ROOT}src/db/seed.ts`, 'utf8'),
]);
const seedIds = [...seedSource.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);

const inputFor = (snapshot, withBytes = false, referenceContext = REFERENCE_CONTEXT) => {
  const input = {
    snapshot,
    schema,
    compatibility,
    referenceContext,
    seedIds,
  };
  if (withBytes) {
    input.raw = Buffer.from(JSON.stringify(snapshot), 'utf8');
    input.sidecar = `${checksumForRaw(input.raw)}\n`;
  }
  return input;
};

const row = (snapshot, id) => snapshot.exercises.find((exercise) => exercise.id === id);

test('canonical source satisfies the amended catalog invariants', () => {
  const snapshot = buildCatalogSnapshot();
  const result = validateCatalog(inputFor(snapshot, true));
  assert.equal(snapshot.exercises.length, 64);
  assert.equal(result.payloadBytes, Buffer.byteLength(JSON.stringify(snapshot), 'utf8'));
  assert.equal(snapshot.exercises.every((exercise) => exercise.provenance.reviewStatus === 'unreviewed'), true);
  assert.equal(snapshot.exercises.every((exercise) => exercise.provenance.sources.length === 0), true);
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

test('validator alarms when an exact machine implementation regresses to a generic display', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  row(snapshot, 'standing_calf_raise').localizations.en = {
    displayName: 'Standing Calf Raise',
    aliases: ['Calf Raise Machine'],
  };
  assert.throws(() => validateCatalog(inputFor(snapshot)), /must name the exact implementation/);
});

test('validator alarms when HIIT modality and equipment become ambiguous', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  const hiit = row(snapshot, 'hiit_intervals');
  hiit.equipment.required = [];
  hiit.equipment.optional = ['treadmill', 'bicycle'];
  assert.throws(() => validateCatalog(inputFor(snapshot)), /this exact implementation/);
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
  assert.throws(() => validateCatalog(inputFor(snapshot)), /unilateral row must use per_side/);
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

test('validator alarms when a neutral non-frozen name regresses to an eponym', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  row(snapshot, 'rotating_dumbbell_press').localizations.en.displayName = 'Arnold Press';
  assert.throws(() => validateCatalog(inputFor(snapshot)), /must name the exact implementation/);
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
