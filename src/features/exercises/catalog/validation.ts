import * as Crypto from 'expo-crypto';
import { EXERCISE_SEED } from '@/db/seed';
import { normalizeCatalogSearch } from './normalization';
import {
  CATALOG_BODY_REGIONS,
  CATALOG_EQUIPMENT,
  CATALOG_LOCALES,
  CATALOG_MOVEMENT_PATTERNS,
  CATALOG_SCHEMA_VERSION,
  CATALOG_SEARCH_NORMALIZATION,
  type CatalogSnapshot,
  type ValidatedCatalogSnapshot,
} from './types';

export const MAX_CATALOG_BYTES = 524_288;
export const MAX_CATALOG_EXERCISES = 512;
export const FROZEN_CATALOG_IDS = EXERCISE_SEED.map((exercise) => exercise.id) as readonly string[];
const PER_SIDE_IDS = new Set([
  'bulgarian_split_squat',
  'single_arm_db_row',
  'walking_lunge',
  'step_platform_step_up',
  'dead_bug',
  'side_plank_hip_lift',
  'cable_anti_rotation_press',
  'seated_trunk_rotation',
  'dumbbell_suitcase_march',
  'dumbbell_single_leg_hip_hinge',
]);

const EXERCISE_KEYS = [
  'id',
  'recordRevision',
  'status',
  'effectiveFrom',
  'effectiveTo',
  'replacementId',
  'displayOrder',
  'localizations',
  'exerciseType',
  'isBodyweight',
  'equipment',
  'movementPattern',
  'difficulty',
  'primaryBodyRegions',
  'secondaryBodyRegions',
  'defaultPrescription',
  'provenance',
] as const;

export class CatalogValidationError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'CatalogValidationError';
  }
}

export interface GeneratedBundledCatalogModule {
  BUNDLED_CATALOG_RAW: string;
  BUNDLED_CATALOG_CHECKSUM: string;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // expo-crypto's native digest bridge requires a TypedArray. Passing its backing ArrayBuffer
  // happens to work in Node/Web mocks but fails on iOS with NotTypedArrayException.
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function validateGeneratedBundledCatalog(
  generated: GeneratedBundledCatalogModule,
): Promise<ValidatedCatalogSnapshot> {
  // This is deliberately raw-string → UTF-8. JSON.parse/stringify is never used as the byte source.
  const bytes = new TextEncoder().encode(generated.BUNDLED_CATALOG_RAW);
  return validateCatalogBytes(bytes, generated.BUNDLED_CATALOG_CHECKSUM);
}

export async function validateCatalogBytes(
  rawBytes: Uint8Array,
  expectedChecksum: string,
): Promise<ValidatedCatalogSnapshot> {
  if (rawBytes.byteLength < 1 || rawBytes.byteLength > MAX_CATALOG_BYTES) {
    throw new CatalogValidationError('$bytes', `must be between 1 and ${MAX_CATALOG_BYTES} bytes`);
  }
  if (rawBytes[0] === 0xef && rawBytes[1] === 0xbb && rawBytes[2] === 0xbf) {
    throw new CatalogValidationError('$bytes', 'UTF-8 BOM is not allowed');
  }
  const checksum = expectedChecksum.trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(checksum)) {
    throw new CatalogValidationError('$checksum', 'expected sha256:<64 lowercase hex>');
  }
  const checksumHex = await sha256Hex(rawBytes);
  if (checksum !== `sha256:${checksumHex}`) {
    throw new CatalogValidationError('$checksum', 'raw response bytes do not match');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(rawBytes);
  } catch {
    throw new CatalogValidationError('$bytes', 'must be valid UTF-8');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CatalogValidationError('$', 'must be valid JSON');
  }
  const snapshot = validateCatalogSnapshot(parsed);
  return { snapshot, rawBytes: new Uint8Array(rawBytes), checksumHex };
}

export function validateCatalogSnapshot(value: unknown): CatalogSnapshot {
  const root = record(value, '$');
  exactKeys(root, [
    'schemaVersion',
    'catalogVersion',
    'effectiveAt',
    'defaultLocale',
    'supportedLocales',
    'searchNormalization',
    'exercises',
  ], '$');
  equal(root.schemaVersion, CATALOG_SCHEMA_VERSION, '$.schemaVersion');
  stringMatching(root.catalogVersion, /^1\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/, '$.catalogVersion');
  timestamp(root.effectiveAt, '$.effectiveAt');
  equal(root.defaultLocale, 'en', '$.defaultLocale');
  const locales = array(root.supportedLocales, '$.supportedLocales');
  if (locales.length !== CATALOG_LOCALES.length || locales.some((locale, index) => locale !== CATALOG_LOCALES[index])) {
    fail('$.supportedLocales', 'must equal [en, ko, es, zh-Hans] in order');
  }
  equal(root.searchNormalization, CATALOG_SEARCH_NORMALIZATION, '$.searchNormalization');
  const exercises = array(root.exercises, '$.exercises');
  if (exercises.length < FROZEN_CATALOG_IDS.length || exercises.length > MAX_CATALOG_EXERCISES) {
    fail('$.exercises', `must contain ${FROZEN_CATALOG_IDS.length}..${MAX_CATALOG_EXERCISES} rows`);
  }

  const ids = new Set<string>();
  const displayOrders = new Set<number>();
  const normalizedTerms = new Map<string, string>();
  let previousOrder = 0;
  let previousId = '';
  exercises.forEach((exercise, index) => {
    const path = `$.exercises[${index}]`;
    const row = validateExercise(exercise, path);
    if (ids.has(row.id)) fail(`${path}.id`, 'duplicate stable id');
    if (displayOrders.has(row.displayOrder)) fail(`${path}.displayOrder`, 'duplicate display order');
    if (row.displayOrder < previousOrder || (row.displayOrder === previousOrder && row.id <= previousId)) {
      fail(path, 'rows must be sorted by displayOrder then id');
    }
    previousOrder = row.displayOrder;
    previousId = row.id;
    ids.add(row.id);
    displayOrders.add(row.displayOrder);
    if (index < FROZEN_CATALOG_IDS.length) {
      const frozenId = FROZEN_CATALOG_IDS[index];
      if (row.id !== frozenId) {
        fail(`${path}.id`, `frozen row ${index + 1} must remain ${frozenId}`);
      }
      if (row.displayOrder !== index + 1) {
        fail(`${path}.displayOrder`, `frozen row ${frozenId} must remain ${index + 1}`);
      }
    }
    for (const locale of CATALOG_LOCALES) {
      const localization = row.localizations[locale];
      const terms = [
        { value: localization.displayName, path: `${path}.localizations.${locale}.displayName` },
        ...localization.aliases.map((value, aliasIndex) => ({
          value,
          path: `${path}.localizations.${locale}.aliases[${aliasIndex}]`,
        })),
      ];
      for (const term of terms) {
        const key = `${locale}:${normalizeCatalogSearch(term.value)}`;
        const collision = normalizedTerms.get(key);
        if (collision && collision !== row.id) fail(term.path, `collides with ${collision}`);
        normalizedTerms.set(key, row.id);
      }
    }
  });
  const byId = new Map((exercises as unknown as CatalogSnapshot['exercises']).map((row) => [row.id, row]));
  for (const row of byId.values()) {
    if (row.replacementId != null) {
      if (row.replacementId === row.id) fail(`$.exercises.${row.id}.replacementId`, 'cannot reference itself');
      const replacement = byId.get(row.replacementId);
      if (!replacement || replacement.status === 'retired') {
        fail(`$.exercises.${row.id}.replacementId`, 'must reference a non-retired row');
      }
      const visited = new Set([row.id]);
      let next: CatalogSnapshot['exercises'][number] | undefined = replacement;
      while (next?.replacementId != null) {
        if (visited.has(next.id)) fail(`$.exercises.${row.id}.replacementId`, 'replacement cycle');
        visited.add(next.id);
        next = byId.get(next.replacementId);
      }
    }
  }
  return root as unknown as CatalogSnapshot;
}

function validateExercise(value: unknown, path: string): CatalogSnapshot['exercises'][number] {
  const row = record(value, path);
  exactKeys(row, EXERCISE_KEYS, path);
  const id = stringMatching(row.id, /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, `${path}.id`, 64);
  integer(row.recordRevision, `${path}.recordRevision`, 1);
  oneOf(row.status, ['active', 'deprecated', 'retired'], `${path}.status`);
  const from = timestamp(row.effectiveFrom, `${path}.effectiveFrom`);
  const to = nullableTimestamp(row.effectiveTo, `${path}.effectiveTo`);
  if (to != null && to <= from) fail(`${path}.effectiveTo`, 'must be after effectiveFrom');
  if (row.replacementId != null) stringMatching(row.replacementId, /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, `${path}.replacementId`, 64);
  integer(row.displayOrder, `${path}.displayOrder`, 1);
  validateLocalizations(row.localizations, `${path}.localizations`);
  const exerciseType = oneOf(row.exerciseType, ['strength', 'cardio'], `${path}.exerciseType`);
  if (typeof row.isBodyweight !== 'boolean') fail(`${path}.isBodyweight`, 'must be boolean');
  validateEquipment(row.equipment, `${path}.equipment`);
  oneOf(row.movementPattern, CATALOG_MOVEMENT_PATTERNS, `${path}.movementPattern`);
  oneOf(row.difficulty, ['beginner', 'intermediate', 'advanced'], `${path}.difficulty`);
  const primary = enumArray(row.primaryBodyRegions, CATALOG_BODY_REGIONS, `${path}.primaryBodyRegions`, 10);
  const secondary = enumArray(row.secondaryBodyRegions, CATALOG_BODY_REGIONS, `${path}.secondaryBodyRegions`, 3);
  if (exerciseType === 'strength' && primary.length === 0) fail(`${path}.primaryBodyRegions`, 'strength requires a primary region');
  if (primary.some((region) => secondary.includes(region))) fail(`${path}.secondaryBodyRegions`, 'must be disjoint from primary regions');
  validatePrescription(row.defaultPrescription, id, exerciseType, `${path}.defaultPrescription`);
  validateProvenance(row.provenance, `${path}.provenance`);
  return { ...row, id } as unknown as CatalogSnapshot['exercises'][number];
}

function validateLocalizations(value: unknown, path: string): void {
  const localizations = record(value, path);
  exactKeys(localizations, CATALOG_LOCALES, path);
  for (const locale of CATALOG_LOCALES) {
    const item = record(localizations[locale], `${path}.${locale}`);
    exactKeys(item, ['displayName', 'aliases'], `${path}.${locale}`);
    localizedText(item.displayName, `${path}.${locale}.displayName`);
    const aliases = array(item.aliases, `${path}.${locale}.aliases`);
    if (aliases.length < 1 || aliases.length > 12) fail(`${path}.${locale}.aliases`, 'must contain 1..12 aliases');
    const normalized = new Set<string>();
    for (let index = 0; index < aliases.length; index += 1) {
      const alias = localizedText(aliases[index], `${path}.${locale}.aliases[${index}]`);
      const key = normalizeCatalogSearch(alias);
      if (!key) fail(`${path}.${locale}.aliases[${index}]`, 'normalizes empty');
      if (normalized.has(key)) fail(`${path}.${locale}.aliases[${index}]`, 'duplicate after search-v1 normalization');
      normalized.add(key);
    }
    const displayKey = normalizeCatalogSearch(item.displayName as string);
    if (!displayKey) fail(`${path}.${locale}.displayName`, 'normalizes empty');
    if (normalized.has(displayKey)) fail(`${path}.${locale}.aliases`, 'alias duplicates displayName after normalization');
  }
}

function validateEquipment(value: unknown, path: string): void {
  const equipment = record(value, path);
  exactKeys(equipment, ['required', 'optional'], path);
  const required = enumArray(equipment.required, CATALOG_EQUIPMENT, `${path}.required`, 8);
  const optional = enumArray(equipment.optional, CATALOG_EQUIPMENT, `${path}.optional`, 8);
  if (required.some((item) => optional.includes(item))) fail(`${path}.optional`, 'must be disjoint from required');
}

function validatePrescription(
  value: unknown,
  exerciseId: string,
  exerciseType: 'strength' | 'cardio',
  path: string,
): void {
  const prescription = record(value, path);
  exactKeys(prescription, ['sets', 'trackingMode', 'countingConvention', 'target'], path);
  integer(prescription.sets, `${path}.sets`, 1, 20);
  const mode = oneOf(
    prescription.trackingMode,
    ['reps', 'duration', 'distance', 'duration_distance', 'intervals'],
    `${path}.trackingMode`,
  );
  const counting = oneOf(
    prescription.countingConvention,
    ['total', 'per_side', 'not_applicable'],
    `${path}.countingConvention`,
  );
  if (exerciseType === 'cardio') {
    if (counting !== 'not_applicable') fail(`${path}.countingConvention`, 'cardio must use not_applicable');
  } else {
    if ((exerciseId === 'plank' && mode !== 'duration') || (exerciseId !== 'plank' && mode !== 'reps')) {
      fail(`${path}.trackingMode`, 'v1 strength supports reps except frozen plank duration');
    }
    if (counting === 'not_applicable') fail(`${path}.countingConvention`, 'strength must use total or per_side');
  }
  if ((counting === 'per_side') !== PER_SIDE_IDS.has(exerciseId)) {
    fail(`${path}.countingConvention`, 'does not match the canonical per-side set');
  }
  if (prescription.target == null) {
    if (mode === 'reps' || mode === 'intervals') fail(`${path}.target`, `${mode} requires a target`);
    if (exerciseType !== 'cardio') fail(`${path}.target`, 'null target is cardio-only');
    return;
  }
  const target = record(prescription.target, `${path}.target`);
  exactKeys(target, ['unit', 'low', 'high'], `${path}.target`);
  const unit = oneOf(target.unit, ['reps', 'seconds', 'minutes', 'meters', 'kilometers', 'rounds'], `${path}.target.unit`);
  const low = finiteNumber(target.low, `${path}.target.low`, 0);
  const high = finiteNumber(target.high, `${path}.target.high`, 0);
  if (low > high) fail(`${path}.target`, 'low must be <= high');
  const compatible: Record<string, readonly string[]> = {
    reps: ['reps'],
    duration: ['seconds', 'minutes'],
    distance: ['meters', 'kilometers'],
    duration_distance: ['seconds', 'minutes', 'meters', 'kilometers'],
    intervals: ['rounds'],
  };
  if (!compatible[mode].includes(unit)) fail(`${path}.target.unit`, `incompatible with ${mode}`);
}

function validateProvenance(value: unknown, path: string): void {
  const provenance = record(value, path);
  exactKeys(provenance, [
    'classification',
    'reviewStatus',
    'reviewMethod',
    'reviewedByRole',
    'reviewEvidence',
    'reviewedAt',
    'containsThirdPartyCopy',
    'sources',
  ], path);
  const classification = oneOf(provenance.classification, ['original_editorial', 'public_facts', 'licensed'], `${path}.classification`);
  const status = oneOf(provenance.reviewStatus, ['unreviewed', 'source_checked', 'human_reviewed'], `${path}.reviewStatus`);
  const method = oneOf(provenance.reviewMethod, ['none', 'source_comparison', 'human_editorial_review'], `${path}.reviewMethod`);
  equal(provenance.containsThirdPartyCopy, false, `${path}.containsThirdPartyCopy`);
  const sources = array(provenance.sources, `${path}.sources`);
  if (sources.length > 8) fail(`${path}.sources`, 'must contain at most 8 sources');
  if (status === 'unreviewed') {
    if (classification !== 'original_editorial') fail(`${path}.classification`, 'unreviewed rows must be original_editorial');
    if (method !== 'none') fail(`${path}.reviewMethod`, 'unreviewed rows must use none');
    equal(provenance.reviewedByRole, null, `${path}.reviewedByRole`);
    equal(provenance.reviewEvidence, null, `${path}.reviewEvidence`);
    equal(provenance.reviewedAt, null, `${path}.reviewedAt`);
    if (sources.length !== 0) fail(`${path}.sources`, 'unreviewed rows must have no row sources');
  } else {
    const expectedMethod = status === 'source_checked' ? 'source_comparison' : 'human_editorial_review';
    if (method !== expectedMethod) fail(`${path}.reviewMethod`, 'does not match reviewStatus');
    boundedString(provenance.reviewedByRole, `${path}.reviewedByRole`, 1, 80);
    boundedString(provenance.reviewEvidence, `${path}.reviewEvidence`, 1, 200);
    timestamp(provenance.reviewedAt, `${path}.reviewedAt`);
    if (sources.length < 1) fail(`${path}.sources`, 'reviewed rows require at least one source');
  }
  let licensedSource = false;
  sources.forEach((source, index) => {
    const sourcePath = `${path}.sources[${index}]`;
    const row = record(source, sourcePath);
    exactKeys(row, ['sourceType', 'label', 'url', 'license', 'accessedAt'], sourcePath);
    oneOf(row.sourceType, ['internal_editorial', 'official_guideline', 'peer_reviewed', 'public_domain', 'licensed_dataset'], `${sourcePath}.sourceType`);
    boundedString(row.label, `${sourcePath}.label`, 1, 200);
    if (row.url != null) {
      const url = boundedString(row.url, `${sourcePath}.url`, 1, 500);
      try { new URL(url); } catch { fail(`${sourcePath}.url`, 'must be an absolute URI'); }
    }
    if (row.license != null) {
      boundedString(row.license, `${sourcePath}.license`, 1, 100);
      licensedSource = true;
    }
    nullableTimestamp(row.accessedAt, `${sourcePath}.accessedAt`);
  });
  if (classification === 'licensed' && (status !== 'human_reviewed' || !licensedSource)) {
    fail(path, 'licensed rows require human review and an explicit source license');
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'must be an object');
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) if (!expectedSet.has(key)) fail(`${path}.${key}`, 'additional property');
  for (const key of expected) if (!(key in value)) fail(`${path}.${key}`, 'required');
}

function boundedString(value: unknown, path: string, min: number, max: number): string {
  if (typeof value !== 'string') fail(path, 'must be a string');
  const length = [...value].length;
  if (length < min || length > max) fail(path, `length must be ${min}..${max}`);
  return value;
}

function localizedText(value: unknown, path: string): string {
  return boundedString(value, path, 1, 60);
}

function stringMatching(value: unknown, pattern: RegExp, path: string, max: number = Number.POSITIVE_INFINITY): string {
  const text = boundedString(value, path, 1, max);
  if (!pattern.test(text)) fail(path, 'invalid format');
  return text;
}

function integer(value: unknown, path: string, min: number, max: number = Number.POSITIVE_INFINITY): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) fail(path, `must be an integer ${min}..${max}`);
  return value as number;
}

function finiteNumber(value: unknown, path: string, min: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) fail(path, `must be a finite number >= ${min}`);
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) fail(path, `must be one of ${allowed.join(', ')}`);
  return value as T;
}

function enumArray<T extends string>(value: unknown, allowed: readonly T[], path: string, max: number): T[] {
  const values = array(value, path);
  if (values.length > max) fail(path, `must contain at most ${max} values`);
  const out = values.map((item, index) => oneOf(item, allowed, `${path}[${index}]`));
  if (new Set(out).size !== out.length) fail(path, 'must be unique');
  return out;
}

function timestamp(value: unknown, path: string): number {
  if (typeof value !== 'string') fail(path, 'must be an RFC 3339 date-time');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/.exec(value);
  if (!match) fail(path, 'must be an RFC 3339 UTC second (YYYY-MM-DDTHH:mm:ssZ)');
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (
    month < 1 || month > 12 || day < 1 || day > days[month - 1] ||
    hour > 23 || minute > 59 || second > 59
  ) fail(path, 'must be a calendar-valid RFC 3339 date-time');
  if (Number.isNaN(Date.parse(value))) fail(path, 'must be an RFC 3339 date-time');
  return Date.parse(value);
}

function nullableTimestamp(value: unknown, path: string): number | null {
  return value == null ? null : timestamp(value, path);
}

function equal(value: unknown, expected: unknown, path: string): void {
  if (value !== expected) fail(path, `must equal ${String(expected)}`);
}

function fail(path: string, message: string): never {
  throw new CatalogValidationError(path, message);
}
