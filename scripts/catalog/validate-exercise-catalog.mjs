#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SOURCE_CHECK_EVIDENCE } from './catalog-source.mjs';
import { buildCoverageMatrix, validateCatalog } from './catalog-validation.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const path = (relative) => `${ROOT}${relative}`;

function exportedString(source, exportName) {
  const prefix = `export const ${exportName} = `;
  const line = source.split('\n').find((candidate) => candidate.startsWith(prefix));
  if (!line?.endsWith(' as const;')) throw new Error(`${exportName}: generated export missing`);
  return JSON.parse(line.slice(prefix.length, -' as const;'.length));
}

async function main() {
  const [raw, sidecar, generatedTs, evidenceText, coverageText, schema, compatibility, seedSource] =
    await Promise.all([
      readFile(path('assets/catalog/exercise-catalog-v1.json')),
      readFile(path('assets/catalog/exercise-catalog-v1.sha256'), 'utf8'),
      readFile(path('assets/catalog/exercise-catalog-v1.generated.ts'), 'utf8'),
      readFile(path('assets/catalog/exercise-catalog-v1.evidence.json'), 'utf8'),
      readFile(path('assets/catalog/exercise-catalog-v1.coverage.json'), 'utf8'),
      readFile(path('docs/contracts/exercise-catalog-v1.schema.json'), 'utf8').then(JSON.parse),
      readFile(path('docs/contracts/exercise-catalog-v1-compatibility.json'), 'utf8').then(JSON.parse),
      readFile(path('src/db/seed.ts'), 'utf8'),
    ]);
  const snapshot = JSON.parse(raw.toString('utf8'));
  const evidence = JSON.parse(evidenceText);
  const coverage = JSON.parse(coverageText);
  const seedIds = [...seedSource.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);

  if (JSON.stringify(evidence) !== JSON.stringify(SOURCE_CHECK_EVIDENCE)) {
    throw new Error('exercise-catalog-v1.evidence.json: stale or edited outside the publisher');
  }
  const result = validateCatalog({
    snapshot,
    schema,
    compatibility,
    evidence,
    seedIds,
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
  for (const forbidden of ['StepMill', 'OpenStax', 'wger', 'human_reviewed']) {
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
      humanReviewed: false,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
