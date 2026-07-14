import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCatalogSnapshot, SOURCE_CHECK_EVIDENCE } from './catalog-source.mjs';
import { checksumForRaw, validateCatalog } from './catalog-validation.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const [schema, compatibility, seedSource] = await Promise.all([
  readFile(`${ROOT}docs/contracts/exercise-catalog-v1.schema.json`, 'utf8').then(JSON.parse),
  readFile(`${ROOT}docs/contracts/exercise-catalog-v1-compatibility.json`, 'utf8').then(JSON.parse),
  readFile(`${ROOT}src/db/seed.ts`, 'utf8'),
]);
const seedIds = [...seedSource.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);

const inputFor = (snapshot, withBytes = false) => {
  const input = {
    snapshot,
    schema,
    compatibility,
    evidence: SOURCE_CHECK_EVIDENCE,
    seedIds,
  };
  if (withBytes) {
    input.raw = Buffer.from(JSON.stringify(snapshot), 'utf8');
    input.sidecar = `${checksumForRaw(input.raw)}\n`;
  }
  return input;
};

test('canonical source satisfies the frozen catalog invariants', () => {
  const snapshot = buildCatalogSnapshot();
  const result = validateCatalog(inputFor(snapshot, true));
  assert.equal(snapshot.exercises.length, 64);
  assert.equal(result.payloadBytes, Buffer.byteLength(JSON.stringify(snapshot), 'utf8'));
});

test('validator alarms when a frozen legacy ID is renamed', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  snapshot.exercises[0].id = 'renamed_bench_press';
  assert.throws(() => validateCatalog(inputFor(snapshot)), /preserve exact legacy ID order/);
});

test('validator alarms when source-check metadata claims human review', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  snapshot.exercises[0].provenance.reviewStatus = 'human_reviewed';
  snapshot.exercises[0].provenance.reviewMethod = 'human_editorial_review';
  assert.throws(() => validateCatalog(inputFor(snapshot)), /must not claim human_reviewed/);
});

test('validator alarms on region overlap', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  snapshot.exercises[0].secondaryBodyRegions.push('chest');
  assert.throws(() => validateCatalog(inputFor(snapshot)), /must be disjoint/);
});

test('validator alarms when a locale is missing', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  delete snapshot.exercises[0].localizations.es;
  assert.throws(() => validateCatalog(inputFor(snapshot)), /keys\/order must be en, ko, es, zh-Hans/);
});

test('validator alarms when a cardio row cites resistance sources', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  const cardio = snapshot.exercises.find((exercise) => exercise.exerciseType === 'cardio');
  cardio.provenance.sources = structuredClone(SOURCE_CHECK_EVIDENCE.sources.strength);
  assert.throws(() => validateCatalog(inputFor(snapshot)), /cardio source-check references/);
});

test('validator alarms when equipment coverage silently disappears', () => {
  const snapshot = structuredClone(buildCatalogSnapshot());
  const swimming = snapshot.exercises.find((exercise) => exercise.id === 'swimming');
  swimming.equipment.required = ['other'];
  assert.throws(() => validateCatalog(inputFor(snapshot)), /coverage\.equipment\.pool/);
});

test('validator alarms when raw bytes and sidecar are stale', () => {
  const snapshot = buildCatalogSnapshot();
  const input = inputFor(snapshot, true);
  input.sidecar = `sha256:${'0'.repeat(64)}\n`;
  assert.throws(() => validateCatalog(input), /must be one checksum line/);
});
