import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { ExerciseRow } from '@/db/types';
import { withForeignKeyTransaction } from '@/db/foreignKeyTransaction';
import { nowIso } from '@/lib/date';
import type {
  CatalogExercise,
  CatalogExerciseView,
  CatalogSnapshot,
  ValidatedCatalogSnapshot,
} from './types';
import { FROZEN_CATALOG_IDS, validateCatalogBytes } from './validation';

export type CatalogSnapshotSource = 'remote' | 'bundled';

interface SnapshotRow {
  catalog_version: string;
  schema_version: string;
  effective_at: string;
  etag: string;
  checksum_hex: string;
  payload_bytes: number;
  payload_blob: Uint8Array | ArrayBuffer;
  source: CatalogSnapshotSource;
  validated_at: string;
}

interface ChannelRow {
  slot: 'active' | 'previous';
  catalog_version: string;
}

interface BridgeRow {
  catalog_id: string;
  exercise_id: string;
  is_frozen: number;
}

interface CacheMappingRow {
  catalog_id: string;
  bridge_exercise_id: string;
  record_revision: number;
  status: string;
  effective_from: string;
  effective_to: string | null;
  replacement_id: string | null;
  display_order: number;
  exercise_type: string;
  is_bodyweight: number;
  movement_pattern: string;
  difficulty: string;
  default_sets: number;
  tracking_mode: string;
  counting_convention: string;
  target_unit: string | null;
  target_low: number | null;
  target_high: number | null;
  provenance_json: string;
}

interface LocalizationRow { catalog_id: string; locale: string; display_name: string }
interface AliasRow { catalog_id: string; locale: string; alias_order: number; alias: string }
interface EquipmentRow { catalog_id: string; role: 'required' | 'optional'; item_order: number; equipment_id: string }
interface RegionRow { catalog_id: string; role: 'primary' | 'secondary'; item_order: number; region_id: string }

type CatalogSqlValue = string | number | null;

interface CatalogInsertRows {
  exercises: CatalogSqlValue[][];
  bridges: CatalogSqlValue[][];
  cache: CatalogSqlValue[][];
  localizations: CatalogSqlValue[][];
  aliases: CatalogSqlValue[][];
  equipment: CatalogSqlValue[][];
  regions: CatalogSqlValue[][];
}

const SQLITE_SAFE_BIND_LIMIT = 900;

export interface ActiveCatalog {
  validated: ValidatedCatalogSnapshot;
  etag: string;
  source: CatalogSnapshotSource;
  views: CatalogExerciseView[];
}

export interface ActivateCatalogOptions {
  etag: string;
  source: CatalogSnapshotSource;
  now?: () => string;
  opaqueId?: () => string;
  /** Only a verified bundle may replace a physically/structurally corrupt same-version row. */
  repairCorruptSameVersion?: boolean;
}

export function expectedCatalogEtag(catalogVersion: string, checksumHex: string): string {
  return `"catalog-v1-${catalogVersion}-${checksumHex.slice(0, 16)}"`;
}

/** Pure collision guard used by activation and regression tests. */
export function chooseOpaqueBridgeId(
  occupiedExerciseIds: ReadonlySet<string>,
  nextUuid: () => string = () => Crypto.randomUUID(),
): string {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = `catalog_${nextUuid().replace(/-/g, '').toLowerCase()}`;
    if (/^catalog_[a-f0-9]{32}$/.test(candidate) && !occupiedExerciseIds.has(candidate)) return candidate;
  }
  throw new Error('could not allocate a collision-free opaque catalog bridge id');
}

/** Channel pointers are the authority: pruning can never include active or previous. */
export function prunableCatalogVersions(
  allVersions: readonly string[],
  channels: readonly Pick<ChannelRow, 'catalog_version'>[],
): string[] {
  const retained = new Set(channels.map((channel) => channel.catalog_version));
  return allVersions.filter((version) => !retained.has(version));
}

/** Fail-closed rules for promoting a newer catalog over durable historical logging semantics. */
export function assertCatalogTransition(active: CatalogSnapshot, next: CatalogSnapshot): void {
  if (compareCatalogVersions(next.catalogVersion, active.catalogVersion) <= 0) {
    throw new Error(`catalog ${next.catalogVersion} is not newer than active ${active.catalogVersion}`);
  }
  const nextById = new Map(next.exercises.map((exercise) => [exercise.id, exercise]));
  for (const previous of active.exercises) {
    const candidate = nextById.get(previous.id);
    if (!candidate) throw new Error(`catalog transition removed stable id ${previous.id}`);
    if (candidate.recordRevision < previous.recordRevision) {
      throw new Error(`catalog transition decreased recordRevision for ${previous.id}`);
    }
    if (
      semanticFingerprint(candidate) !== semanticFingerprint(previous) &&
      candidate.recordRevision <= previous.recordRevision
    ) {
      throw new Error(`catalog transition changed ${previous.id} without recordRevision increment`);
    }
    if (historicalInterpretationFingerprint(candidate) !== historicalInterpretationFingerprint(previous)) {
      throw new Error(`catalog transition changed historical interpretation for stable id ${previous.id}`);
    }
  }
}

export async function getActiveCatalogEtag(db: SQLiteDatabase): Promise<string | null> {
  const active = await readActiveCatalog(db);
  return active?.etag ?? null;
}

export async function readActiveCatalog(db: SQLiteDatabase): Promise<ActiveCatalog | null> {
  return readCatalogSlot(db, 'active');
}

export async function readPreviousCatalog(db: SQLiteDatabase): Promise<ActiveCatalog | null> {
  return readCatalogSlot(db, 'previous');
}

async function readCatalogSlot(
  db: SQLiteDatabase,
  slot: 'active' | 'previous',
): Promise<ActiveCatalog | null> {
  const row = await db.getFirstAsync<SnapshotRow>(
    `SELECT snapshot.*
       FROM catalog_cache_channel channel
       JOIN catalog_snapshot_cache snapshot USING (catalog_version)
      WHERE channel.slot = ?`,
    [slot],
  );
  if (!row) return null;

  try {
    const bytes = sqliteBlobToBytes(row.payload_blob);
    if (bytes.byteLength !== row.payload_bytes) return null;
    const validated = await validateCatalogBytes(bytes, `sha256:${row.checksum_hex}`);
    if (
      validated.snapshot.catalogVersion !== row.catalog_version ||
      validated.snapshot.schemaVersion !== row.schema_version ||
      validated.snapshot.effectiveAt !== row.effective_at ||
      row.etag !== expectedCatalogEtag(row.catalog_version, row.checksum_hex)
    ) {
      return null;
    }
    const views = await materializeCatalogViews(db, validated.snapshot);
    return views ? { validated, etag: row.etag, source: row.source, views } : null;
  } catch {
    // A corrupt active row is ignored, never deleted. Bundle/seed fallback remains available and
    // the previous pointer stays intact for diagnosis or an explicit rollback.
    return null;
  }
}

/** Atomically promotes only the exact previous version that was already byte/shape verified. */
export async function rollbackToPreviousCatalog(
  db: SQLiteDatabase,
  verifiedPreviousVersion: string,
): Promise<boolean> {
  let swapped = false;
  await withForeignKeyTransaction(db, async (tx) => {
    const channels = await tx.getAllAsync<ChannelRow>(
      `SELECT slot, catalog_version FROM catalog_cache_channel`,
    );
    const active = channels.find((channel) => channel.slot === 'active')?.catalog_version ?? null;
    const previous = channels.find((channel) => channel.slot === 'previous')?.catalog_version ?? null;
    if (previous !== verifiedPreviousVersion) return;
    await tx.runAsync(
      `INSERT INTO catalog_cache_channel (slot, catalog_version) VALUES ('active', ?)
       ON CONFLICT(slot) DO UPDATE SET catalog_version = excluded.catalog_version`,
      [verifiedPreviousVersion],
    );
    if (active && active !== verifiedPreviousVersion) {
      await tx.runAsync(
        `UPDATE catalog_cache_channel SET catalog_version = ? WHERE slot = 'previous'`,
        [active],
      );
    } else {
      await tx.runAsync(`DELETE FROM catalog_cache_channel WHERE slot = 'previous'`);
    }
    swapped = true;
  });
  return swapped;
}

export async function activateCatalogSnapshot(
  db: SQLiteDatabase,
  validated: ValidatedCatalogSnapshot,
  options: ActivateCatalogOptions,
): Promise<void> {
  const { snapshot, rawBytes, checksumHex } = validated;
  if (options.etag !== expectedCatalogEtag(snapshot.catalogVersion, checksumHex)) {
    throw new Error('catalog ETag does not match version/checksum');
  }
  const createdAt = (options.now ?? nowIso)();
  const opaqueId = options.opaqueId ?? (() => Crypto.randomUUID());

  await withForeignKeyTransaction(db, async (tx) => {
    const activeChannel = await tx.getFirstAsync<{ catalog_version: string }>(
      `SELECT catalog_version FROM catalog_cache_channel WHERE slot = 'active'`,
    );
    if (activeChannel && activeChannel.catalog_version !== snapshot.catalogVersion) {
      const activeSnapshot = await tx.getFirstAsync<SnapshotRow>(
        `SELECT * FROM catalog_snapshot_cache WHERE catalog_version = ?`,
        [activeChannel.catalog_version],
      );
      const activeValidated = activeSnapshot
        ? await loadStoredValidatedSnapshot(tx, activeSnapshot)
        : null;
      if (!activeValidated) throw new Error('active catalog is corrupt; explicit rollback or repair is required');
      assertCatalogTransition(activeValidated.snapshot, snapshot);
    }
    const existingSnapshot = await tx.getFirstAsync<SnapshotRow>(
      `SELECT * FROM catalog_snapshot_cache WHERE catalog_version = ?`,
      [snapshot.catalogVersion],
    );
    let needsRows = true;
    if (existingSnapshot) {
      const existingValid = await validateStoredSnapshot(tx, existingSnapshot);
      if (existingValid) {
        if (
          existingSnapshot.schema_version !== snapshot.schemaVersion ||
          existingSnapshot.effective_at !== snapshot.effectiveAt ||
          existingSnapshot.etag !== options.etag ||
          existingSnapshot.checksum_hex !== checksumHex ||
          existingSnapshot.payload_bytes !== rawBytes.byteLength ||
          !sameBytes(sqliteBlobToBytes(existingSnapshot.payload_blob), rawBytes)
        ) throw new Error(`catalog version ${snapshot.catalogVersion} is immutable`);
        needsRows = false;
      } else if (options.repairCorruptSameVersion && options.source === 'bundled') {
        await tx.runAsync(`DELETE FROM catalog_cache_channel WHERE catalog_version = ?`, [snapshot.catalogVersion]);
        await tx.runAsync(`DELETE FROM catalog_snapshot_cache WHERE catalog_version = ?`, [snapshot.catalogVersion]);
      } else {
        throw new Error(`catalog version ${snapshot.catalogVersion} has a corrupt cache`);
      }
    }
    if (!existingSnapshot || needsRows) {
      await tx.runAsync(
        `INSERT INTO catalog_snapshot_cache
          (catalog_version, schema_version, effective_at, etag, checksum_hex,
           payload_bytes, payload_blob, source, validated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          snapshot.catalogVersion,
          snapshot.schemaVersion,
          snapshot.effectiveAt,
          options.etag,
          checksumHex,
          rawBytes.byteLength,
          rawBytes,
          options.source,
          createdAt,
        ],
      );
    }

    if (needsRows) {
      const occupiedRows = await tx.getAllAsync<{ id: string }>('SELECT id FROM exercise');
      const occupied = new Set(occupiedRows.map((row) => row.id));
      const existingBridges = await tx.getAllAsync<BridgeRow>(
        `SELECT catalog_id, exercise_id, is_frozen FROM catalog_exercise_bridge`,
      );
      const bridgeByCatalog = new Map(existingBridges.map((bridge) => [bridge.catalog_id, bridge]));
      const inserts = emptyCatalogInsertRows();
      for (let index = 0; index < snapshot.exercises.length; index += 1) {
        const catalogExercise = snapshot.exercises[index];
        const expectedFrozen = FROZEN_CATALOG_IDS[index];
        const isFrozen = index < FROZEN_CATALOG_IDS.length;
        if (isFrozen && (catalogExercise.id !== expectedFrozen || catalogExercise.displayOrder !== index + 1)) {
          throw new Error(`frozen catalog bridge invariant failed at index ${index}`);
        }

        let bridge = bridgeByCatalog.get(catalogExercise.id);
        if (bridge) {
          if (
            (isFrozen && (bridge.exercise_id !== catalogExercise.id || bridge.is_frozen !== 1)) ||
            (!isFrozen && (bridge.is_frozen !== 0 || !bridge.exercise_id.startsWith('catalog_')))
          ) {
            throw new Error(`catalog bridge collision for ${catalogExercise.id}`);
          }
        } else {
          const bridgeExerciseId = isFrozen
            ? catalogExercise.id
            : chooseOpaqueBridgeId(occupied, opaqueId);
          const exerciseRow = catalogToExerciseRow(catalogExercise, bridgeExerciseId, createdAt);
          if (!occupied.has(bridgeExerciseId)) {
            inserts.exercises.push([
              exerciseRow.id,
              exerciseRow.name,
              exerciseRow.muscle_group,
              exerciseRow.type,
              exerciseRow.default_sets,
              exerciseRow.rep_low,
              exerciseRow.rep_high,
              exerciseRow.is_bodyweight,
              exerciseRow.created_at,
            ]);
          } else if (!isFrozen) {
            throw new Error(`opaque bridge id collision for ${catalogExercise.id}`);
          }
          occupied.add(bridgeExerciseId);
          inserts.bridges.push([catalogExercise.id, bridgeExerciseId, isFrozen ? 1 : 0, createdAt]);
          bridge = { catalog_id: catalogExercise.id, exercise_id: bridgeExerciseId, is_frozen: isFrozen ? 1 : 0 };
          bridgeByCatalog.set(catalogExercise.id, bridge);
        }
        collectNormalizedExercise(inserts, snapshot.catalogVersion, catalogExercise, bridge.exercise_id);
      }
      await insertCatalogRows(tx, inserts);
    }

    if (!(await materializeCatalogViews(tx, snapshot))) {
      throw new Error(`catalog version ${snapshot.catalogVersion} failed normalized-cache integrity`);
    }

    const active = await tx.getFirstAsync<{ catalog_version: string }>(
      `SELECT catalog_version FROM catalog_cache_channel WHERE slot = 'active'`,
    );
    if (active && active.catalog_version !== snapshot.catalogVersion) {
      await tx.runAsync(
        `INSERT INTO catalog_cache_channel (slot, catalog_version) VALUES ('previous', ?)
         ON CONFLICT(slot) DO UPDATE SET catalog_version = excluded.catalog_version`,
        [active.catalog_version],
      );
    }
    await tx.runAsync(
      `INSERT INTO catalog_cache_channel (slot, catalog_version) VALUES ('active', ?)
       ON CONFLICT(slot) DO UPDATE SET catalog_version = excluded.catalog_version`,
      [snapshot.catalogVersion],
    );
    await pruneUnreferencedSnapshots(tx);
  });
}

function emptyCatalogInsertRows(): CatalogInsertRows {
  return {
    exercises: [],
    bridges: [],
    cache: [],
    localizations: [],
    aliases: [],
    equipment: [],
    regions: [],
  };
}

function collectNormalizedExercise(
  rows: CatalogInsertRows,
  catalogVersion: string,
  exercise: CatalogExercise,
  bridgeExerciseId: string,
): void {
  rows.cache.push(catalogExerciseCacheValues(catalogVersion, exercise, bridgeExerciseId));

  for (const [locale, localization] of Object.entries(exercise.localizations)) {
    rows.localizations.push([catalogVersion, exercise.id, locale, localization.displayName]);
    for (let index = 0; index < localization.aliases.length; index += 1) {
      rows.aliases.push([catalogVersion, exercise.id, locale, index, localization.aliases[index]]);
    }
  }
  for (const role of ['required', 'optional'] as const) {
    for (let index = 0; index < exercise.equipment[role].length; index += 1) {
      rows.equipment.push([catalogVersion, exercise.id, role, index, exercise.equipment[role][index]]);
    }
  }
  for (const role of ['primary', 'secondary'] as const) {
    const regions = role === 'primary' ? exercise.primaryBodyRegions : exercise.secondaryBodyRegions;
    for (let index = 0; index < regions.length; index += 1) {
      rows.regions.push([catalogVersion, exercise.id, role, index, regions[index]]);
    }
  }
}

async function insertCatalogRows(db: SQLiteDatabase, rows: CatalogInsertRows): Promise<void> {
  // Parent rows are inserted before their children so foreign-key enforcement stays enabled for
  // the entire activation transaction. Each table is reduced to one or a few bounded statements.
  await insertRowsInChunks(
    db,
    `INSERT INTO exercise
      (id, name, muscle_group, type, default_sets, rep_low, rep_high, is_bodyweight, created_at)`,
    9,
    rows.exercises,
  );
  await insertRowsInChunks(
    db,
    `INSERT INTO catalog_exercise_bridge (catalog_id, exercise_id, is_frozen, created_at)`,
    4,
    rows.bridges,
  );
  await insertRowsInChunks(
    db,
    `INSERT INTO catalog_exercise_cache
      (catalog_version, catalog_id, bridge_exercise_id, record_revision, status,
       effective_from, effective_to, replacement_id, display_order, exercise_type,
       is_bodyweight, movement_pattern, difficulty, default_sets, tracking_mode,
       counting_convention, target_unit, target_low, target_high, provenance_json)`,
    20,
    rows.cache,
  );
  await insertRowsInChunks(
    db,
    `INSERT INTO catalog_exercise_localization
      (catalog_version, catalog_id, locale, display_name)`,
    4,
    rows.localizations,
  );
  await insertRowsInChunks(
    db,
    `INSERT INTO catalog_exercise_alias
      (catalog_version, catalog_id, locale, alias_order, alias)`,
    5,
    rows.aliases,
  );
  await insertRowsInChunks(
    db,
    `INSERT INTO catalog_exercise_equipment
      (catalog_version, catalog_id, role, item_order, equipment_id)`,
    5,
    rows.equipment,
  );
  await insertRowsInChunks(
    db,
    `INSERT INTO catalog_exercise_region
      (catalog_version, catalog_id, role, item_order, region_id)`,
    5,
    rows.regions,
  );
}

/** Execute multi-row INSERTs without relying on platform-specific SQLite variable limits. */
export async function insertRowsInChunks(
  db: SQLiteDatabase,
  insertSql: string,
  columnCount: number,
  rows: readonly (readonly CatalogSqlValue[])[],
): Promise<void> {
  if (!Number.isInteger(columnCount) || columnCount < 1 || columnCount > SQLITE_SAFE_BIND_LIMIT) {
    throw new Error('catalog insert column count exceeds the safe SQLite bind limit');
  }
  if (rows.some((row) => row.length !== columnCount)) {
    throw new Error('catalog insert row width does not match its column count');
  }
  const rowsPerStatement = Math.floor(SQLITE_SAFE_BIND_LIMIT / columnCount);
  const rowPlaceholders = `(${Array.from({ length: columnCount }, () => '?').join(', ')})`;
  for (let offset = 0; offset < rows.length; offset += rowsPerStatement) {
    const chunk = rows.slice(offset, offset + rowsPerStatement);
    const placeholders = Array.from({ length: chunk.length }, () => rowPlaceholders).join(', ');
    const values = chunk.flatMap((row) => [...row]);
    await db.runAsync(`${insertSql} VALUES ${placeholders}`, values);
  }
}

export function catalogExerciseCacheValues(
  catalogVersion: string,
  exercise: CatalogExercise,
  bridgeExerciseId: string,
): (string | number | null)[] {
  const target = exercise.defaultPrescription.target;
  return [
    catalogVersion,
    exercise.id,
    bridgeExerciseId,
    exercise.recordRevision,
    exercise.status,
    exercise.effectiveFrom,
    exercise.effectiveTo,
    exercise.replacementId,
    exercise.displayOrder,
    exercise.exerciseType,
    exercise.isBodyweight ? 1 : 0,
    exercise.movementPattern,
    exercise.difficulty,
    exercise.defaultPrescription.sets,
    exercise.defaultPrescription.trackingMode,
    exercise.defaultPrescription.countingConvention,
    target?.unit ?? null,
    target?.low ?? null,
    target?.high ?? null,
    JSON.stringify(exercise.provenance),
  ];
}

async function materializeCatalogViews(
  db: SQLiteDatabase,
  snapshot: CatalogSnapshot,
): Promise<CatalogExerciseView[] | null> {
  const mappings = await db.getAllAsync<CacheMappingRow>(
    `SELECT *
       FROM catalog_exercise_cache
      WHERE catalog_version = ?`,
    [snapshot.catalogVersion],
  );
  if (mappings.length !== snapshot.exercises.length) return null;
  const mappingByCatalog = new Map(mappings.map((row) => [row.catalog_id, row]));
  const [localizations, aliases, equipment, regions] = await Promise.all([
    db.getAllAsync<LocalizationRow>(
      `SELECT catalog_id, locale, display_name FROM catalog_exercise_localization WHERE catalog_version = ?`,
      [snapshot.catalogVersion],
    ),
    db.getAllAsync<AliasRow>(
      `SELECT catalog_id, locale, alias_order, alias FROM catalog_exercise_alias WHERE catalog_version = ?`,
      [snapshot.catalogVersion],
    ),
    db.getAllAsync<EquipmentRow>(
      `SELECT catalog_id, role, item_order, equipment_id FROM catalog_exercise_equipment WHERE catalog_version = ?`,
      [snapshot.catalogVersion],
    ),
    db.getAllAsync<RegionRow>(
      `SELECT catalog_id, role, item_order, region_id FROM catalog_exercise_region WHERE catalog_version = ?`,
      [snapshot.catalogVersion],
    ),
  ]);
  if (!normalizedRowsMatch(snapshot, mappingByCatalog, localizations, aliases, equipment, regions)) return null;
  const bridgeRows = await db.getAllAsync<BridgeRow>(
    `SELECT catalog_id, exercise_id, is_frozen FROM catalog_exercise_bridge`,
  );
  const bridgeByCatalog = new Map(bridgeRows.map((row) => [row.catalog_id, row]));
  for (const [catalogId, mapping] of mappingByCatalog) {
    const bridge = bridgeByCatalog.get(catalogId);
    if (!bridge || bridge.exercise_id !== mapping.bridge_exercise_id) return null;
    const frozen = FROZEN_CATALOG_IDS.includes(catalogId);
    if (
      (frozen && (bridge.is_frozen !== 1 || bridge.exercise_id !== catalogId)) ||
      (!frozen && (bridge.is_frozen !== 0 || !bridge.exercise_id.startsWith('catalog_')))
    ) return null;
  }
  const exerciseRows = await db.getAllAsync<ExerciseRow>('SELECT * FROM exercise');
  const exerciseById = new Map(exerciseRows.map((row) => [row.id, row]));
  const views: CatalogExerciseView[] = [];
  for (const catalog of snapshot.exercises) {
    const exerciseId = mappingByCatalog.get(catalog.id)?.bridge_exercise_id;
    const exercise = exerciseId ? exerciseById.get(exerciseId) : null;
    if (!exercise) return null;
    if (catalog.status !== 'retired') views.push({ exercise, catalog });
  }

  const bridgedIds = new Set(bridgeRows.map((row) => row.exercise_id));
  for (const exercise of exerciseRows) {
    if (!bridgedIds.has(exercise.id)) views.push({ exercise, catalog: null });
  }
  return views;
}

function normalizedRowsMatch(
  snapshot: CatalogSnapshot,
  mappings: ReadonlyMap<string, CacheMappingRow>,
  localizations: readonly LocalizationRow[],
  aliases: readonly AliasRow[],
  equipment: readonly EquipmentRow[],
  regions: readonly RegionRow[],
): boolean {
  const localizationKey = (id: string, locale: string) => `${id}\u0000${locale}`;
  const localizationMap = new Map(localizations.map((row) => [localizationKey(row.catalog_id, row.locale), row.display_name]));
  const aliasesByKey = orderedChildren(aliases, (row) => localizationKey(row.catalog_id, row.locale), (row) => row.alias_order, (row) => row.alias);
  const equipmentByKey = orderedChildren(equipment, (row) => `${row.catalog_id}\u0000${row.role}`, (row) => row.item_order, (row) => row.equipment_id);
  const regionsByKey = orderedChildren(regions, (row) => `${row.catalog_id}\u0000${row.role}`, (row) => row.item_order, (row) => row.region_id);
  if (!aliasesByKey || !equipmentByKey || !regionsByKey) return false;

  let expectedLocalizations = 0;
  let expectedAliases = 0;
  let expectedEquipment = 0;
  let expectedRegions = 0;
  for (const exercise of snapshot.exercises) {
    const row = mappings.get(exercise.id);
    const target = exercise.defaultPrescription.target;
    if (!row ||
      row.record_revision !== exercise.recordRevision ||
      row.status !== exercise.status ||
      row.effective_from !== exercise.effectiveFrom ||
      row.effective_to !== exercise.effectiveTo ||
      row.replacement_id !== exercise.replacementId ||
      row.display_order !== exercise.displayOrder ||
      row.exercise_type !== exercise.exerciseType ||
      row.is_bodyweight !== (exercise.isBodyweight ? 1 : 0) ||
      row.movement_pattern !== exercise.movementPattern ||
      row.difficulty !== exercise.difficulty ||
      row.default_sets !== exercise.defaultPrescription.sets ||
      row.tracking_mode !== exercise.defaultPrescription.trackingMode ||
      row.counting_convention !== exercise.defaultPrescription.countingConvention ||
      row.target_unit !== (target?.unit ?? null) ||
      row.target_low !== (target?.low ?? null) ||
      row.target_high !== (target?.high ?? null) ||
      row.provenance_json !== JSON.stringify(exercise.provenance)
    ) return false;

    for (const [locale, localization] of Object.entries(exercise.localizations)) {
      expectedLocalizations += 1;
      expectedAliases += localization.aliases.length;
      const key = localizationKey(exercise.id, locale);
      if (localizationMap.get(key) !== localization.displayName) return false;
      if (!sameOrderedValues(aliasesByKey.get(key) ?? [], localization.aliases)) return false;
    }
    for (const role of ['required', 'optional'] as const) {
      expectedEquipment += exercise.equipment[role].length;
      if (!sameOrderedValues(equipmentByKey.get(`${exercise.id}\u0000${role}`) ?? [], exercise.equipment[role])) return false;
    }
    for (const role of ['primary', 'secondary'] as const) {
      const values = role === 'primary' ? exercise.primaryBodyRegions : exercise.secondaryBodyRegions;
      expectedRegions += values.length;
      if (!sameOrderedValues(regionsByKey.get(`${exercise.id}\u0000${role}`) ?? [], values)) return false;
    }
  }
  return (
    localizations.length === expectedLocalizations &&
    aliases.length === expectedAliases &&
    equipment.length === expectedEquipment &&
    regions.length === expectedRegions
  );
}

function orderedChildren<T>(
  rows: readonly T[],
  keyFor: (row: T) => string,
  orderFor: (row: T) => number,
  valueFor: (row: T) => string,
): Map<string, string[]> | null {
  const grouped = new Map<string, { order: number; value: string }[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const values = grouped.get(key) ?? [];
    values.push({ order: orderFor(row), value: valueFor(row) });
    grouped.set(key, values);
  }
  const result = new Map<string, string[]>();
  for (const [key, values] of grouped) {
    values.sort((a, b) => a.order - b.order);
    if (values.some(({ order }, index) => order !== index)) return null;
    result.set(key, values.map(({ value }) => value));
  }
  return result;
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function pruneUnreferencedSnapshots(db: SQLiteDatabase): Promise<void> {
  const [snapshots, channels] = await Promise.all([
    db.getAllAsync<{ catalog_version: string }>('SELECT catalog_version FROM catalog_snapshot_cache'),
    db.getAllAsync<ChannelRow>('SELECT slot, catalog_version FROM catalog_cache_channel'),
  ]);
  const versions = prunableCatalogVersions(
    snapshots.map((row) => row.catalog_version),
    channels,
  );
  for (const version of versions) {
    await db.runAsync(`DELETE FROM catalog_snapshot_cache WHERE catalog_version = ?`, [version]);
  }
}

async function validateStoredSnapshot(db: SQLiteDatabase, row: SnapshotRow): Promise<boolean> {
  return (await loadStoredValidatedSnapshot(db, row)) != null;
}

async function loadStoredValidatedSnapshot(
  db: SQLiteDatabase,
  row: SnapshotRow,
): Promise<ValidatedCatalogSnapshot | null> {
  try {
    const bytes = sqliteBlobToBytes(row.payload_blob);
    if (bytes.byteLength !== row.payload_bytes) return null;
    const validated = await validateCatalogBytes(bytes, `sha256:${row.checksum_hex}`);
    if (
      validated.snapshot.catalogVersion !== row.catalog_version ||
      validated.snapshot.schemaVersion !== row.schema_version ||
      validated.snapshot.effectiveAt !== row.effective_at ||
      row.etag !== expectedCatalogEtag(row.catalog_version, row.checksum_hex)
    ) return null;
    return (await materializeCatalogViews(db, validated.snapshot)) != null ? validated : null;
  } catch {
    return null;
  }
}

function compareCatalogVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const delta = leftParts[index] - rightParts[index];
    if (delta !== 0) return delta;
  }
  return 0;
}

function semanticFingerprint(exercise: CatalogExercise): string {
  const { recordRevision: _recordRevision, ...semantic } = exercise;
  return JSON.stringify(semantic);
}

function historicalInterpretationFingerprint(exercise: CatalogExercise): string {
  return JSON.stringify({
    exerciseType: exercise.exerciseType,
    isBodyweight: exercise.isBodyweight,
    trackingMode: exercise.defaultPrescription.trackingMode,
    countingConvention: exercise.defaultPrescription.countingConvention,
    targetUnit: exercise.defaultPrescription.target?.unit ?? null,
  });
}

function catalogToExerciseRow(exercise: CatalogExercise, id: string, createdAt: string): ExerciseRow {
  const target = exercise.defaultPrescription.target;
  const repTarget = target?.unit === 'reps' || target?.unit === 'rounds' ? target : null;
  return {
    id,
    name: exercise.localizations.en.displayName,
    muscle_group: exercise.primaryBodyRegions[0] ?? (exercise.exerciseType === 'cardio' ? 'conditioning' : 'other'),
    type: exercise.exerciseType,
    default_sets: exercise.defaultPrescription.sets,
    rep_low: repTarget?.low ?? 0,
    rep_high: repTarget?.high ?? 0,
    is_bodyweight: exercise.isBodyweight ? 1 : 0,
    created_at: createdAt,
  };
}

function sqliteBlobToBytes(blob: Uint8Array | ArrayBuffer): Uint8Array {
  if (blob instanceof Uint8Array) return new Uint8Array(blob);
  if (blob instanceof ArrayBuffer) return new Uint8Array(blob);
  throw new Error('catalog payload is not a SQLite BLOB');
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}
