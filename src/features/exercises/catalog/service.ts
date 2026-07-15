import type { SQLiteDatabase } from 'expo-sqlite';
import type { ExerciseRow } from '@/db/types';
import {
  activateCatalogSnapshot,
  expectedCatalogEtag,
  readActiveCatalog,
  readPreviousCatalog,
  rollbackToPreviousCatalog,
} from './cache';
import { loadGeneratedBundledCatalog } from './bundle';
import type { CatalogExerciseView } from './types';
import {
  FROZEN_CATALOG_IDS,
  type GeneratedBundledCatalogModule,
  validateGeneratedBundledCatalog,
} from './validation';

export type BundledCatalogLoader = () => GeneratedBundledCatalogModule;
export type CatalogViewSource = 'active' | 'previous' | 'bundled' | 'seed';

export interface CatalogViewsResult {
  source: CatalogViewSource;
  views: CatalogExerciseView[];
}

/**
 * Network-free read path. A bad active snapshot first promotes a verified previous snapshot, then
 * tries the byte-verified bundle; existing seed rows remain usable if every catalog layer fails.
 */
const localReadInFlight = new WeakMap<SQLiteDatabase, Promise<CatalogViewsResult>>();

export function readCatalogViews(
  db: SQLiteDatabase,
  loadBundle: BundledCatalogLoader = loadGeneratedBundledCatalog,
): Promise<CatalogViewsResult> {
  const running = localReadInFlight.get(db);
  if (running) return running;
  const read = readCatalogViewsOnce(db, loadBundle).finally(() => {
    if (localReadInFlight.get(db) === read) localReadInFlight.delete(db);
  });
  localReadInFlight.set(db, read);
  return read;
}

async function readCatalogViewsOnce(
  db: SQLiteDatabase,
  loadBundle: BundledCatalogLoader,
): Promise<CatalogViewsResult> {
  const active = await readActiveCatalog(db);
  if (active) return { source: 'active', views: active.views };

  const previous = await readPreviousCatalog(db);
  if (previous) {
    await rollbackToPreviousCatalog(db, previous.validated.snapshot.catalogVersion).catch(() => false);
    return { source: 'previous', views: previous.views };
  }

  try {
    const validated = await validateGeneratedBundledCatalog(loadBundle());
    await activateCatalogSnapshot(db, validated, {
      etag: expectedCatalogEtag(validated.snapshot.catalogVersion, validated.checksumHex),
      source: 'bundled',
      repairCorruptSameVersion: true,
    });
    const bundled = await readActiveCatalog(db);
    if (bundled) return { source: 'bundled', views: bundled.views };
  } catch {
    // The bundled module is generated in a separate build track. A broken/missing asset must not
    // strand exercise logging; seed rows are the final offline baseline.
  }

  const rows = await db.getAllAsync<ExerciseRow>('SELECT * FROM exercise');
  let safeRows: ExerciseRow[];
  try {
    const bridges = await db.getAllAsync<{ exercise_id: string }>(
      `SELECT exercise_id FROM catalog_exercise_bridge`,
    );
    const bridged = new Set(bridges.map((row) => row.exercise_id));
    const frozen = new Set(FROZEN_CATALOG_IDS);
    // Frozen seed ids are also bridge ids, but they remain the last known-safe offline baseline.
    // Only opaque canonical rows must disappear when every validated catalog layer is unavailable.
    safeRows = rows.filter((exercise) => frozen.has(exercise.id) || !bridged.has(exercise.id));
  } catch {
    const frozen = new Set(FROZEN_CATALOG_IDS);
    safeRows = rows.filter((exercise) => frozen.has(exercise.id) || exercise.id.startsWith('local_'));
  }
  return { source: 'seed', views: safeRows.map((exercise) => ({ exercise, catalog: null })) };
}
