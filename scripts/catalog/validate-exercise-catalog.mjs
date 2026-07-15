#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { REFERENCE_CONTEXT } from './catalog-source.mjs';
import {
  buildCoverageMatrix,
  parseLegacySeedContract,
  validateCatalog,
} from './catalog-validation.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const path = (relative) => `${ROOT}${relative}`;

function exportedString(source, exportName) {
  const prefix = `export const ${exportName} = `;
  const line = source.split('\n').find((candidate) => candidate.startsWith(prefix));
  if (!line?.endsWith(' as const;')) throw new Error(`${exportName}: generated export missing`);
  return JSON.parse(line.slice(prefix.length, -' as const;'.length));
}

async function main() {
  const [raw, sidecar, generatedTs, referenceContextText, coverageText, schema, compatibility, seedSource] =
    await Promise.all([
      readFile(path('assets/catalog/exercise-catalog-v1.json')),
      readFile(path('assets/catalog/exercise-catalog-v1.sha256'), 'utf8'),
      readFile(path('assets/catalog/exercise-catalog-v1.generated.ts'), 'utf8'),
      readFile(path('assets/catalog/exercise-catalog-v1.reference-context.json'), 'utf8'),
      readFile(path('assets/catalog/exercise-catalog-v1.coverage.json'), 'utf8'),
      readFile(path('docs/contracts/exercise-catalog-v1.schema.json'), 'utf8').then(JSON.parse),
      readFile(path('docs/contracts/exercise-catalog-v1-compatibility.json'), 'utf8').then(JSON.parse),
      readFile(path('src/db/seed.ts'), 'utf8'),
    ]);
  const snapshot = JSON.parse(raw.toString('utf8'));
  const referenceContext = JSON.parse(referenceContextText);
  const coverage = JSON.parse(coverageText);
  const seedContract = parseLegacySeedContract(seedSource);

  if (snapshot.catalogVersion === '1.0.0' && snapshot.exercises.length !== 64) {
    throw new Error('exercise-catalog-v1.json: initial curated v1.0.0 artifact must contain exactly 64 exercises');
  }
  if (
    snapshot.catalogVersion === '1.0.0' &&
    !snapshot.exercises.every((exercise) => exercise.recordRevision === 1)
  ) {
    throw new Error('exercise-catalog-v1.json: unpublished initial v1.0.0 rows must start at recordRevision 1');
  }
  if (
    snapshot.catalogVersion === '1.0.0' &&
    !snapshot.exercises.every(
      (exercise) =>
        exercise.status === 'active' &&
        exercise.effectiveTo === null &&
        exercise.replacementId === null,
    )
  ) {
    throw new Error('exercise-catalog-v1.json: unpublished initial v1.0.0 rows must all be active');
  }

  if (JSON.stringify(referenceContext) !== JSON.stringify(REFERENCE_CONTEXT)) {
    throw new Error('exercise-catalog-v1.reference-context.json: stale or edited outside the publisher');
  }
  const result = validateCatalog({
    snapshot,
    schema,
    compatibility,
    referenceContext,
    seedContract,
    raw,
    sidecar,
  });
  if (JSON.stringify(coverage) !== JSON.stringify(buildCoverageMatrix(snapshot, schema))) {
    throw new Error('exercise-catalog-v1.coverage.json: does not match the canonical snapshot');
  }

  const bundledRaw = exportedString(generatedTs, 'BUNDLED_CATALOG_RAW');
  const bundledChecksum = exportedString(generatedTs, 'BUNDLED_CATALOG_CHECKSUM');
  if (!Buffer.from(bundledRaw, 'utf8').equals(raw)) {
    throw new Error('BUNDLED_CATALOG_RAW: runtime UTF-8 bytes differ from canonical JSON');
  }
  if (bundledChecksum !== result.checksum) {
    throw new Error('BUNDLED_CATALOG_CHECKSUM: differs from canonical checksum');
  }

  const snapshotText = raw.toString('utf8');
  for (const forbidden of ['StepMill', 'OpenStax', 'wger', 'human_reviewed', 'source_checked']) {
    if (snapshotText.includes(forbidden)) {
      throw new Error(`canonical snapshot contains forbidden or unsupported claim: ${forbidden}`);
    }
  }

  console.log(
    JSON.stringify({
      status: 'ok',
      catalogVersion: snapshot.catalogVersion,
      exercises: snapshot.exercises.length,
      payloadBytes: result.payloadBytes,
      checksum: result.checksum,
      strength: coverage.exerciseTypes.strength.count,
      cardio: coverage.exerciseTypes.cardio.count,
      bodyRegionsCovered: Object.values(coverage.primaryBodyRegions).filter(({ count }) => count > 0).length,
      equipmentCovered: Object.values(coverage.equipment).filter(({ count }) => count > 0).length,
      movementPatternsCovered: Object.values(coverage.movementPatterns).filter(({ count }) => count > 0).length,
      exerciseSpecificReview: false,
      humanReviewed: false,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
