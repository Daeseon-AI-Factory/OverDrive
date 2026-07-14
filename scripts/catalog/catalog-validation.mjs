import { createHash } from 'node:crypto';

const TOP_KEYS = [
  'schemaVersion',
  'catalogVersion',
  'effectiveAt',
  'defaultLocale',
  'supportedLocales',
  'searchNormalization',
  'exercises',
];
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
];
const LOCALES = ['en', 'ko', 'es', 'zh-Hans'];
const BODY_REGIONS = [
  'chest',
  'shoulders',
  'back',
  'biceps',
  'triceps',
  'core',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
];
const EXERCISE_TYPES = ['strength', 'cardio'];
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const TRACKING_MODES = ['reps', 'duration', 'distance', 'duration_distance', 'intervals'];
const TARGET_UNITS = ['reps', 'seconds', 'minutes', 'meters', 'kilometers', 'rounds'];
const STRENGTH_SOURCE_URLS = [
  'https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/',
  'https://pmc.ncbi.nlm.nih.gov/articles/PMC11209834/',
];
const CARDIO_SOURCE_URLS = [
  'https://odphp.health.gov/paguidelines/second-edition/pdf/Physical_Activity_Guidelines_2nd_edition.pdf',
];

export class CatalogValidationError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = 'CatalogValidationError';
  }
}

const fail = (path, message) => {
  throw new CatalogValidationError(path, message);
};
const check = (condition, path, message) => {
  if (!condition) fail(path, message);
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const codePointLength = (value) => [...value].length;

function exactKeys(value, expected, path) {
  check(isObject(value), path, 'must be an object');
  const actual = Object.keys(value);
  check(
    actual.length === expected.length && actual.every((key, index) => key === expected[index]),
    path,
    `keys/order must be ${expected.join(', ')}, got ${actual.join(', ')}`,
  );
}

function uniqueArray(values, path) {
  check(Array.isArray(values), path, 'must be an array');
  check(new Set(values).size === values.length, path, 'must not contain duplicates');
}

function enumValue(value, allowed, path) {
  check(allowed.includes(value), path, `must be one of ${allowed.join(', ')}`);
}

function nonEmptyString(value, path, maxLength) {
  check(typeof value === 'string', path, 'must be a string');
  check(value === value.trim(), path, 'must not have leading/trailing whitespace');
  check(codePointLength(value) >= 1, path, 'must not be empty');
  check(codePointLength(value) <= maxLength, path, `must be at most ${maxLength} code points`);
}

function timestamp(value, path, nullable = false) {
  if (nullable && value === null) return;
  check(typeof value === 'string', path, 'must be an RFC 3339 timestamp string');
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value), path, 'must use UTC second precision');
  check(Number.isFinite(Date.parse(value)), path, 'must be a valid timestamp');
}

export function normalizeSearchV1(value) {
  return value
    .trim()
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{Nd}]+/gu, '');
}

export function levenshteinCodePoints(left, right, maxDistance = Number.POSITIVE_INFINITY) {
  const a = [...left];
  const b = [...right];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      rowMinimum = Math.min(rowMinimum, current[j]);
    }
    if (rowMinimum > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[b.length];
}

export function typoMatchV1(query, term) {
  const normalizedQuery = normalizeSearchV1(query);
  const normalizedTerm = normalizeSearchV1(term);
  const length = [...normalizedQuery].length;
  const threshold = length < 4 ? -1 : length < 7 ? 1 : 2;
  if (threshold < 0) return false;
  return levenshteinCodePoints(normalizedQuery, normalizedTerm, threshold) <= threshold;
}

export function checksumForRaw(raw) {
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}

export function buildCoverageMatrix(snapshot, schema) {
  const equipmentIds = schema.$defs.equipmentId.enum;
  const movementPatterns = schema.$defs.movementPattern.enum;
  const idsFor = (predicate) => snapshot.exercises.filter(predicate).map((exercise) => exercise.id);
  const mapWithIds = (values, predicate) =>
    Object.fromEntries(
      values.map((value) => {
        const ids = idsFor((exercise) => predicate(exercise, value));
        return [value, { count: ids.length, ids }];
      }),
    );

  return {
    catalogVersion: snapshot.catalogVersion,
    totalExercises: snapshot.exercises.length,
    legacyExercises: 32,
    exerciseTypes: mapWithIds(EXERCISE_TYPES, (exercise, value) => exercise.exerciseType === value),
    bodyweight: {
      count: idsFor((exercise) => exercise.isBodyweight).length,
      ids: idsFor((exercise) => exercise.isBodyweight),
    },
    primaryBodyRegions: mapWithIds(BODY_REGIONS, (exercise, value) =>
      exercise.primaryBodyRegions.includes(value),
    ),
    equipment: mapWithIds(equipmentIds, (exercise, value) =>
      [...exercise.equipment.required, ...exercise.equipment.optional].includes(value),
    ),
    movementPatterns: mapWithIds(
      movementPatterns,
      (exercise, value) => exercise.movementPattern === value,
    ),
  };
}

function validatePrescription(prescription, exercise, path) {
  exactKeys(prescription, ['sets', 'trackingMode', 'target'], path);
  check(Number.isInteger(prescription.sets) && prescription.sets >= 1 && prescription.sets <= 20, `${path}.sets`, 'must be an integer from 1 to 20');
  enumValue(prescription.trackingMode, TRACKING_MODES, `${path}.trackingMode`);
  if (prescription.target === null) {
    check(!['reps', 'intervals'].includes(prescription.trackingMode), `${path}.target`, 'reps/intervals require a target');
    check(exercise.exerciseType === 'cardio', `${path}.target`, 'open-ended null target is cardio-only');
    return;
  }
  exactKeys(prescription.target, ['unit', 'low', 'high'], `${path}.target`);
  enumValue(prescription.target.unit, TARGET_UNITS, `${path}.target.unit`);
  for (const key of ['low', 'high']) {
    const value = prescription.target[key];
    check(typeof value === 'number' && Number.isFinite(value) && value >= 0, `${path}.target.${key}`, 'must be finite and non-negative');
  }
  check(prescription.target.low <= prescription.target.high, `${path}.target`, 'low must not exceed high');
  const compatibleUnits = {
    reps: ['reps'],
    duration: ['seconds', 'minutes'],
    distance: ['meters', 'kilometers'],
    duration_distance: ['seconds', 'minutes', 'meters', 'kilometers'],
    intervals: ['rounds'],
  };
  enumValue(prescription.target.unit, compatibleUnits[prescription.trackingMode], `${path}.target.unit`);
}

function validateProvenance(provenance, evidence, exerciseType, path) {
  exactKeys(
    provenance,
    [
      'classification',
      'reviewStatus',
      'reviewMethod',
      'reviewedByRole',
      'reviewEvidence',
      'reviewedAt',
      'containsThirdPartyCopy',
      'sources',
    ],
    path,
  );
  check(provenance.classification === 'original_editorial', `${path}.classification`, 'bundled v1 metadata must be original_editorial');
  check(provenance.reviewStatus === 'source_checked', `${path}.reviewStatus`, 'must not claim human_reviewed');
  check(provenance.reviewMethod === 'source_comparison', `${path}.reviewMethod`, 'must use source_comparison');
  check(provenance.reviewedByRole === evidence.reviewedByRole, `${path}.reviewedByRole`, 'must match evidence role');
  check(provenance.reviewEvidence === evidence.evidenceId, `${path}.reviewEvidence`, 'must reference the source-check evidence artifact');
  check(provenance.reviewedAt === evidence.reviewedAt, `${path}.reviewedAt`, 'must match evidence timestamp');
  check(provenance.containsThirdPartyCopy === false, `${path}.containsThirdPartyCopy`, 'must be false');
  check(evidence.humanReviewed === false, 'evidence.humanReviewed', 'must stay false without human evidence');
  const expectedSources = evidence.sources[exerciseType];
  const expectedUrls = exerciseType === 'strength' ? STRENGTH_SOURCE_URLS : CARDIO_SOURCE_URLS;
  uniqueArray(provenance.sources.map((source) => source.url), `${path}.sources.urls`);
  check(
    JSON.stringify(provenance.sources) === JSON.stringify(expectedSources),
    `${path}.sources`,
    `must exactly match the ${exerciseType} source-check references`,
  );
  for (const [sourceIndex, source] of provenance.sources.entries()) {
    const sourcePath = `${path}.sources[${sourceIndex}]`;
    exactKeys(source, ['sourceType', 'label', 'url', 'license', 'accessedAt'], sourcePath);
    check(
      source.sourceType === (exerciseType === 'strength' ? 'peer_reviewed' : 'official_guideline'),
      `${sourcePath}.sourceType`,
      `must use the ${exerciseType} source type`,
    );
    nonEmptyString(source.label, `${sourcePath}.label`, 200);
    enumValue(source.url, expectedUrls, `${sourcePath}.url`);
    check(source.license === null, `${sourcePath}.license`, 'citation is not a licensed import');
    timestamp(source.accessedAt, `${sourcePath}.accessedAt`);
  }
}

function validateLocalization(localization, path) {
  exactKeys(localization, ['displayName', 'aliases'], path);
  nonEmptyString(localization.displayName, `${path}.displayName`, 60);
  uniqueArray(localization.aliases, `${path}.aliases`);
  check(localization.aliases.length >= 1 && localization.aliases.length <= 12, `${path}.aliases`, 'must contain 1 to 12 aliases');
  const normalized = new Set([normalizeSearchV1(localization.displayName)]);
  check(!normalized.has(''), `${path}.displayName`, 'must normalize non-empty');
  for (const [aliasIndex, alias] of localization.aliases.entries()) {
    nonEmptyString(alias, `${path}.aliases[${aliasIndex}]`, 60);
    const key = normalizeSearchV1(alias);
    check(key !== '', `${path}.aliases[${aliasIndex}]`, 'must normalize non-empty');
    check(!normalized.has(key), `${path}.aliases[${aliasIndex}]`, 'must be distinct after search-v1 normalization');
    normalized.add(key);
  }
  return normalized;
}

function validateExercise(exercise, index, schema, evidence, searchTermsByLocale) {
  const path = `exercises[${index}]`;
  exactKeys(exercise, EXERCISE_KEYS, path);
  check(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(exercise.id), `${path}.id`, 'must be lowercase snake-case');
  check(codePointLength(exercise.id) <= 64, `${path}.id`, 'must be at most 64 characters');
  check(Number.isInteger(exercise.recordRevision) && exercise.recordRevision >= 1, `${path}.recordRevision`, 'must be a positive integer');
  enumValue(exercise.status, ['active', 'deprecated', 'retired'], `${path}.status`);
  timestamp(exercise.effectiveFrom, `${path}.effectiveFrom`);
  timestamp(exercise.effectiveTo, `${path}.effectiveTo`, true);
  check(exercise.status === 'active', `${path}.status`, 'initial bundled snapshot contains active rows only');
  check(exercise.effectiveTo === null && exercise.replacementId === null, path, 'active initial rows must have null effectiveTo/replacementId');
  check(exercise.displayOrder === index + 1, `${path}.displayOrder`, 'must be contiguous canonical order');

  exactKeys(exercise.localizations, LOCALES, `${path}.localizations`);
  for (const locale of LOCALES) {
    const normalizedTerms = validateLocalization(exercise.localizations[locale], `${path}.localizations.${locale}`);
    for (const term of normalizedTerms) {
      const prior = searchTermsByLocale[locale].get(term);
      check(!prior || prior === exercise.id, `${path}.localizations.${locale}`, `normalized term collides with ${prior}`);
      searchTermsByLocale[locale].set(term, exercise.id);
    }
  }

  enumValue(exercise.exerciseType, EXERCISE_TYPES, `${path}.exerciseType`);
  check(typeof exercise.isBodyweight === 'boolean', `${path}.isBodyweight`, 'must be boolean');
  exactKeys(exercise.equipment, ['required', 'optional'], `${path}.equipment`);
  const equipmentEnums = schema.$defs.equipmentId.enum;
  for (const role of ['required', 'optional']) {
    uniqueArray(exercise.equipment[role], `${path}.equipment.${role}`);
    check(exercise.equipment[role].length <= 8, `${path}.equipment.${role}`, 'must have at most 8 items');
    for (const [equipmentIndex, equipmentId] of exercise.equipment[role].entries()) {
      enumValue(equipmentId, equipmentEnums, `${path}.equipment.${role}[${equipmentIndex}]`);
    }
  }
  const equipmentOverlap = exercise.equipment.required.filter((id) => exercise.equipment.optional.includes(id));
  check(equipmentOverlap.length === 0, `${path}.equipment`, `required/optional overlap: ${equipmentOverlap.join(', ')}`);
  enumValue(exercise.movementPattern, schema.$defs.movementPattern.enum, `${path}.movementPattern`);
  enumValue(exercise.difficulty, DIFFICULTIES, `${path}.difficulty`);

  for (const role of ['primaryBodyRegions', 'secondaryBodyRegions']) {
    uniqueArray(exercise[role], `${path}.${role}`);
    check(exercise[role].length <= 10, `${path}.${role}`, 'must have at most 10 regions');
    for (const [regionIndex, region] of exercise[role].entries()) {
      enumValue(region, BODY_REGIONS, `${path}.${role}[${regionIndex}]`);
    }
  }
  check(
    exercise.primaryBodyRegions.every((region) => !exercise.secondaryBodyRegions.includes(region)),
    path,
    'primary and secondary regions must be disjoint',
  );
  if (exercise.exerciseType === 'strength') {
    check(exercise.primaryBodyRegions.length >= 1, `${path}.primaryBodyRegions`, 'strength requires a primary region');
  }
  validatePrescription(exercise.defaultPrescription, exercise, `${path}.defaultPrescription`);
  validateProvenance(exercise.provenance, evidence, exercise.exerciseType, `${path}.provenance`);
}

function typoResults(snapshot, query, locale) {
  return snapshot.exercises
    .filter((exercise) => {
      const terms = [
        exercise.localizations[locale].displayName,
        ...exercise.localizations[locale].aliases,
        exercise.id,
        ...exercise.id.split('_'),
        ...exercise.primaryBodyRegions,
        ...exercise.secondaryBodyRegions,
      ];
      return terms.some((term) => typoMatchV1(query, term));
    })
    .map((exercise) => exercise.id);
}

function validateConformanceVectors(snapshot) {
  const normalizationVectors = [
    [' Bench-Press ', 'benchpress'],
    ['ＢＥＮＣＨ　１００', 'bench100'],
    ['벤치 프레스', '벤치프레스'],
    ['Zone 2', 'zone2'],
  ];
  for (const [input, expected] of normalizationVectors) {
    check(normalizeSearchV1(input) === expected, 'search-v1', `${JSON.stringify(input)} must normalize to ${expected}`);
  }
  const typoVectors = [
    ['benc', 'bench', true],
    ['benhc', 'bench', false],
    ['benchprzs', 'benchpress', true],
    ['rnu', 'run', false],
  ];
  for (const [query, term, expected] of typoVectors) {
    check(typoMatchV1(query, term) === expected, 'typo-v1', `${query}/${term} must be ${expected}`);
  }
  check(
    typoResults(snapshot, 'benchprzs', 'en').includes('barbell_bench_press'),
    'typo-v1.snapshot.benchprzs',
    'must resolve through the canonical Bench Press alias',
  );
  check(
    typoResults(snapshot, 'benc', 'en').includes('barbell_bench_press'),
    'typo-v1.snapshot.benc',
    'must resolve through the canonical bench ID token',
  );
  check(typoResults(snapshot, 'benhc', 'en').length === 0, 'typo-v1.snapshot.benhc', 'must reject distance 2 for a five-code-point query');
  check(typoResults(snapshot, 'rnu', 'en').length === 0, 'typo-v1.snapshot.rnu', 'must reject typo matching for short queries');
}

function validateCoverage(snapshot, schema) {
  const coverage = buildCoverageMatrix(snapshot, schema);
  for (const region of BODY_REGIONS) {
    check(coverage.primaryBodyRegions[region].count >= 2, `coverage.primaryBodyRegions.${region}`, 'requires at least two primary-region exercises');
  }
  for (const equipmentId of schema.$defs.equipmentId.enum.filter((id) => id !== 'other')) {
    check(coverage.equipment[equipmentId].count >= 1, `coverage.equipment.${equipmentId}`, 'must have at least one accurate row');
  }
  for (const pattern of schema.$defs.movementPattern.enum.filter((id) => id !== 'other')) {
    check(coverage.movementPatterns[pattern].count >= 1, `coverage.movementPatterns.${pattern}`, 'must have at least one accurate row');
  }
  const requiredCardioPatterns = [
    'locomotion_run',
    'locomotion_walk',
    'locomotion_swim',
    'step',
    'cycle',
    'row_erg',
    'jump',
    'interval_mixed',
  ];
  const cardioPatterns = new Set(
    snapshot.exercises
      .filter((exercise) => exercise.exerciseType === 'cardio')
      .map((exercise) => exercise.movementPattern),
  );
  for (const pattern of requiredCardioPatterns) {
    check(cardioPatterns.has(pattern), `coverage.cardio.${pattern}`, 'missing cardio movement coverage');
  }
  return coverage;
}

export function validateCatalog({
  snapshot,
  schema,
  compatibility,
  evidence,
  seedIds,
  raw,
  sidecar,
}) {
  exactKeys(snapshot, TOP_KEYS, 'catalog');
  check(snapshot.schemaVersion === '1.0.0', 'catalog.schemaVersion', 'must be 1.0.0');
  check(/^1\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(snapshot.catalogVersion), 'catalog.catalogVersion', 'must be v1 SemVer');
  timestamp(snapshot.effectiveAt, 'catalog.effectiveAt');
  check(snapshot.defaultLocale === 'en', 'catalog.defaultLocale', 'must be en');
  check(JSON.stringify(snapshot.supportedLocales) === JSON.stringify(LOCALES), 'catalog.supportedLocales', 'must be frozen locale order');
  check(snapshot.searchNormalization === 'search-v1', 'catalog.searchNormalization', 'must be search-v1');
  check(Array.isArray(snapshot.exercises), 'catalog.exercises', 'must be an array');
  check(snapshot.exercises.length >= 32 && snapshot.exercises.length <= 512, 'catalog.exercises', 'must contain 32 to 512 rows');
  check(snapshot.exercises.length <= 64, 'catalog.exercises', 'v1 bundled snapshot must fit the deterministic AI projection bound');

  check(evidence.reviewStatus === 'source_checked', 'evidence.reviewStatus', 'must be source_checked');
  check(evidence.reviewMethod === 'source_comparison', 'evidence.reviewMethod', 'must be source_comparison');
  check(evidence.humanReviewed === false, 'evidence.humanReviewed', 'must not claim human review');
  check(
    JSON.stringify(evidence.sources.strength.map((source) => source.url)) ===
      JSON.stringify(STRENGTH_SOURCE_URLS),
    'evidence.sources.strength',
    'must use only the frozen ACSM/AHA strength references',
  );
  check(
    JSON.stringify(evidence.sources.cardio.map((source) => source.url)) ===
      JSON.stringify(CARDIO_SOURCE_URLS),
    'evidence.sources.cardio',
    'must use only the frozen HHS cardio reference',
  );

  const searchTermsByLocale = Object.fromEntries(LOCALES.map((locale) => [locale, new Map()]));
  const ids = [];
  const displayOrders = [];
  for (const [index, exercise] of snapshot.exercises.entries()) {
    validateExercise(exercise, index, schema, evidence, searchTermsByLocale);
    ids.push(exercise.id);
    displayOrders.push(exercise.displayOrder);
  }
  check(new Set(ids).size === ids.length, 'catalog.exercises.id', 'IDs must be unique');
  check(new Set(displayOrders).size === displayOrders.length, 'catalog.exercises.displayOrder', 'displayOrder must be unique');

  const legacyIds = compatibility.canonicalIds;
  check(legacyIds.length === 32 && new Set(legacyIds).size === 32, 'compatibility.canonicalIds', 'must contain 32 unique IDs');
  check(JSON.stringify(ids.slice(0, 32)) === JSON.stringify(legacyIds), 'catalog.exercises[0..31]', 'must preserve exact legacy ID order');
  check(JSON.stringify(displayOrders.slice(0, 32)) === JSON.stringify(Array.from({ length: 32 }, (_, index) => index + 1)), 'catalog.exercises[0..31].displayOrder', 'must preserve displayOrder 1..32');
  check(JSON.stringify(seedIds) === JSON.stringify(legacyIds), 'src/db/seed.ts', 'must match compatibility registry exactly');

  const exerciseById = new Map(snapshot.exercises.map((exercise) => [exercise.id, exercise]));
  for (const exercise of snapshot.exercises) {
    if (exercise.replacementId !== null) {
      const replacement = exerciseById.get(exercise.replacementId);
      check(replacement && replacement.status !== 'retired', `exercise.${exercise.id}.replacementId`, 'must reference a non-retired row');
      check(replacement.id !== exercise.id, `exercise.${exercise.id}.replacementId`, 'must not self-reference');
    }
  }

  validateConformanceVectors(snapshot);
  const coverage = validateCoverage(snapshot, schema);
  const canonicalRaw = Buffer.from(JSON.stringify(snapshot), 'utf8');
  check(canonicalRaw.byteLength <= 524_288, 'catalog.payloadBytes', 'must be at most 512 KiB');
  const checksum = checksumForRaw(canonicalRaw);

  if (raw !== undefined) {
    check(Buffer.isBuffer(raw), 'catalog.raw', 'must be a Buffer');
    check(raw.equals(canonicalRaw), 'catalog.raw', 'must be exact compact JSON with no BOM/newline/whitespace');
  }
  if (sidecar !== undefined) {
    check(sidecar === `${checksum}\n`, 'catalog.sidecar', 'must be one checksum line with one trailing newline');
  }
  return { checksum, payloadBytes: canonicalRaw.byteLength, coverage };
}
