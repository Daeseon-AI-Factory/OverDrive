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
const COUNTING_CONVENTIONS = ['total', 'per_side', 'not_applicable'];
const TARGET_UNITS = ['reps', 'seconds', 'minutes', 'meters', 'kilometers', 'rounds'];
const STRENGTH_SOURCE_URLS = [
  'https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823/',
  'https://pmc.ncbi.nlm.nih.gov/articles/PMC11209834/',
];
const CARDIO_SOURCE_URLS = [
  'https://odphp.health.gov/paguidelines/second-edition/pdf/Physical_Activity_Guidelines_2nd_edition.pdf',
];
const PER_SIDE_IDS = new Set([
  'db_curl',
  'bulgarian_split_squat',
  'hammer_curl',
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
const NON_FROZEN_FORBIDDEN_IDENTITY_TOKENS = [
  'arnold',
  'pallof',
  'russian',
  'farmer',
  'stepmill',
  'openstax',
  'wger',
  'pecdeck',
  'hacksquat',
  'ezbar',
  'smithmachine',
  'romanian',
  'rumano',
  '루마니안',
  '罗马尼亚',
  'crossfit',
  'tabata',
];
const FROZEN_ONLY_CAPABILITY_EQUIPMENT = new Set([
  'rear_foot_support',
  'upper_back_support',
  'external_resistance',
]);

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
  const parsed = Date.parse(value);
  check(Number.isFinite(parsed), path, 'must be a valid timestamp');
  check(
    new Date(parsed).toISOString() === `${value.slice(0, -1)}.000Z`,
    path,
    'must represent a real calendar instant without date normalization',
  );
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

export function parseLegacySeedContract(seedSource) {
  check(typeof seedSource === 'string', 'src/db/seed.ts', 'must be source text');
  return [...seedSource.matchAll(
    /\{\s*id:\s*'([^']+)'[\s\S]*?type:\s*'(strength|cardio)'[\s\S]*?is_bodyweight:\s*(true|false)\s*\}/g,
  )].map((match) => ({
    id: match[1],
    exerciseType: match[2],
    isBodyweight: match[3] === 'true',
  }));
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
    countingConventions: mapWithIds(
      COUNTING_CONVENTIONS,
      (exercise, value) => exercise.defaultPrescription.countingConvention === value,
    ),
  };
}

function validatePrescription(prescription, exercise, path) {
  exactKeys(prescription, ['sets', 'trackingMode', 'countingConvention', 'target'], path);
  check(Number.isInteger(prescription.sets) && prescription.sets >= 1 && prescription.sets <= 20, `${path}.sets`, 'must be an integer from 1 to 20');
  enumValue(prescription.trackingMode, TRACKING_MODES, `${path}.trackingMode`);
  enumValue(prescription.countingConvention, COUNTING_CONVENTIONS, `${path}.countingConvention`);
  if (exercise.exerciseType === 'cardio') {
    check(
      prescription.countingConvention === 'not_applicable',
      `${path}.countingConvention`,
      'cardio prescriptions must use not_applicable',
    );
  } else {
    check(
      (exercise.id === 'plank' && prescription.trackingMode === 'duration') ||
        (exercise.id !== 'plank' && prescription.trackingMode === 'reps'),
      `${path}.trackingMode`,
      'new strength rows must use the current rep-loggable workflow; only frozen plank may use duration',
    );
    check(
      prescription.countingConvention !== 'not_applicable',
      `${path}.countingConvention`,
      'strength prescriptions must declare total or per_side',
    );
  }
  check(
    (prescription.countingConvention === 'per_side') === PER_SIDE_IDS.has(exercise.id),
    `${path}.countingConvention`,
    PER_SIDE_IDS.has(exercise.id)
      ? 'this row must use per_side so the set is complete only after both sides reach the target'
      : 'this row is not in the canonical per-side set',
  );
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

function validateProvenance(provenance, path) {
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
  check(provenance.reviewStatus === 'unreviewed', `${path}.reviewStatus`, 'must remain unreviewed until exercise-specific review exists');
  check(provenance.reviewMethod === 'none', `${path}.reviewMethod`, 'unreviewed rows must use none');
  check(provenance.reviewedByRole === null, `${path}.reviewedByRole`, 'unreviewed rows must not name a reviewer');
  check(provenance.reviewEvidence === null, `${path}.reviewEvidence`, 'unreviewed rows must not claim review evidence');
  check(provenance.reviewedAt === null, `${path}.reviewedAt`, 'unreviewed rows must not claim a review timestamp');
  check(provenance.containsThirdPartyCopy === false, `${path}.containsThirdPartyCopy`, 'must be false');
  check(Array.isArray(provenance.sources) && provenance.sources.length === 0, `${path}.sources`, 'unreviewed rows must have no row citations');
}

function validateReferenceContext(referenceContext) {
  exactKeys(
    referenceContext,
    [
      'contextId',
      'purpose',
      'exerciseSpecificReview',
      'humanReviewed',
      'uses',
      'limitations',
      'sources',
    ],
    'referenceContext',
  );
  check(
    referenceContext.contextId === 'catalog-v1-program-safety-context-2026-07-14',
    'referenceContext.contextId',
    'must use the frozen context identity',
  );
  check(
    referenceContext.purpose === 'program_and_safety_context_only',
    'referenceContext.purpose',
    'must not represent row-level evidence',
  );
  check(referenceContext.exerciseSpecificReview === false, 'referenceContext.exerciseSpecificReview', 'must be false');
  check(referenceContext.humanReviewed === false, 'referenceContext.humanReviewed', 'must be false');
  uniqueArray(referenceContext.uses, 'referenceContext.uses');
  uniqueArray(referenceContext.limitations, 'referenceContext.limitations');
  check(referenceContext.uses.length >= 1, 'referenceContext.uses', 'must explain its limited use');
  check(referenceContext.limitations.length >= 1, 'referenceContext.limitations', 'must state limitations');
  for (const [index, value] of referenceContext.uses.entries()) {
    nonEmptyString(value, `referenceContext.uses[${index}]`, 240);
  }
  for (const [index, value] of referenceContext.limitations.entries()) {
    nonEmptyString(value, `referenceContext.limitations[${index}]`, 240);
  }
  exactKeys(referenceContext.sources, ['strength', 'cardio'], 'referenceContext.sources');
  const expectedByType = {
    strength: { urls: STRENGTH_SOURCE_URLS, sourceType: 'peer_reviewed' },
    cardio: { urls: CARDIO_SOURCE_URLS, sourceType: 'official_guideline' },
  };
  for (const [type, expected] of Object.entries(expectedByType)) {
    const sources = referenceContext.sources[type];
    check(Array.isArray(sources), `referenceContext.sources.${type}`, 'must be an array');
    check(
      JSON.stringify(sources.map((source) => source.url)) === JSON.stringify(expected.urls),
      `referenceContext.sources.${type}`,
      'must contain only the frozen general-context references',
    );
    for (const [sourceIndex, source] of sources.entries()) {
      const path = `referenceContext.sources.${type}[${sourceIndex}]`;
      exactKeys(source, ['sourceType', 'label', 'url', 'license', 'accessedAt'], path);
      check(source.sourceType === expected.sourceType, `${path}.sourceType`, `must be ${expected.sourceType}`);
      nonEmptyString(source.label, `${path}.label`, 200);
      check(expected.urls.includes(source.url), `${path}.url`, 'must be an approved general-context URL');
      check(source.license === null, `${path}.license`, 'reference context is not a licensed import');
      timestamp(source.accessedAt, `${path}.accessedAt`);
    }
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

function validateExercise(exercise, index, schema, searchTermsByLocale) {
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
  if (index >= 32) {
    for (const role of ['required', 'optional']) {
      for (const equipmentId of exercise.equipment[role]) {
        check(
          !FROZEN_ONLY_CAPABILITY_EQUIPMENT.has(equipmentId),
          `${path}.equipment.${role}`,
          `${equipmentId} is a frozen-umbrella capability; new rows require exact implementation equipment`,
        );
      }
    }
  }
  if (exercise.exerciseType === 'strength' && exercise.isBodyweight === false) {
    check(
      exercise.equipment.required.length >= 1,
      `${path}.equipment.required`,
      'non-bodyweight strength rows must require concrete equipment or a capability setup',
    );
  }
  enumValue(exercise.movementPattern, schema.$defs.movementPattern.enum, `${path}.movementPattern`);
  enumValue(exercise.difficulty, DIFFICULTIES, `${path}.difficulty`);

  for (const role of ['primaryBodyRegions', 'secondaryBodyRegions']) {
    uniqueArray(exercise[role], `${path}.${role}`);
    const maximum = role === 'secondaryBodyRegions' ? 3 : 10;
    check(exercise[role].length <= maximum, `${path}.${role}`, `must have at most ${maximum} regions`);
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
  validateProvenance(exercise.provenance, `${path}.provenance`);
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

function validateCanonicalEditorialDecisions(snapshot) {
  const byId = new Map(snapshot.exercises.map((exercise) => [exercise.id, exercise]));
  const frozenIds = new Set(snapshot.exercises.slice(0, 32).map((exercise) => exercise.id));
  const requireRow = (id) => {
    const exercise = byId.get(id);
    check(exercise, `catalog.exercise.${id}`, 'required canonical row is missing');
    return exercise;
  };
  const exactEquipment = (id, required, optional = []) => {
    const exercise = requireRow(id);
    const boundary = frozenIds.has(id) ? 'frozen umbrella boundary' : 'exact implementation';
    check(
      JSON.stringify(exercise.equipment.required) === JSON.stringify(required),
      `catalog.exercise.${id}.equipment.required`,
      `must be ${required.join(', ') || 'empty'} for this ${boundary}`,
    );
    check(
      JSON.stringify(exercise.equipment.optional) === JSON.stringify(optional),
      `catalog.exercise.${id}.equipment.optional`,
      `must contain only supplemental equipment for this ${boundary}: ${optional.join(', ') || 'empty'}`,
    );
  };

  check(requireRow('leg_press').movementPattern === 'squat', 'catalog.exercise.leg_press.movementPattern', 'must be squat');
  check(requireRow('dips').movementPattern === 'vertical_push', 'catalog.exercise.dips.movementPattern', 'must be vertical_push');

  exactEquipment('barbell_bench_press', ['barbell', 'bench'], ['rack']);
  exactEquipment('barbell_back_squat', ['barbell', 'rack']);
  exactEquipment('leg_curl', ['leg_curl_station']);
  exactEquipment('bulgarian_split_squat', ['rear_foot_support', 'external_resistance']);
  exactEquipment('standing_calf_raise', ['external_resistance']);
  exactEquipment('hip_thrust', ['upper_back_support', 'external_resistance']);
  exactEquipment('zone2_run', []);
  exactEquipment('hiit_intervals', []);
  exactEquipment('incline_walk', []);
  exactEquipment('kettlebell_goblet_squat', ['kettlebell']);
  exactEquipment('machine_chest_fly', ['chest_fly_machine']);
  exactEquipment('machine_rear_delt_fly', ['dual_fly_machine']);
  exactEquipment('rotating_dumbbell_press', ['dumbbell']);
  exactEquipment('angled_bar_curl', ['angled_curl_bar']);
  exactEquipment('sled_squat_machine', ['sled_squat_machine']);
  exactEquipment('step_platform_step_up', ['step_platform'], ['dumbbell']);
  exactEquipment('hex_bar_deadlift', ['hex_bar']);
  exactEquipment('dumbbell_suitcase_march', ['dumbbell']);
  exactEquipment('dumbbell_single_leg_hip_hinge', ['dumbbell']);

  const expectedEnglishDisplayNames = {
    db_curl: 'Dumbbell Curl',
    leg_curl: 'Leg Curl',
    bulgarian_split_squat: 'Bulgarian Split Squat',
    standing_calf_raise: 'Standing Calf Raise',
    hammer_curl: 'Hammer Curl',
    hip_thrust: 'Hip Thrust',
    zone2_run: 'Zone 2 Run',
    hiit_intervals: 'HIIT Intervals',
    machine_chest_fly: 'Machine Chest Fly',
    rotating_dumbbell_press: 'Standing Rotating Dumbbell Press',
    machine_rear_delt_fly: 'Machine Rear Delt Fly',
    kettlebell_goblet_squat: 'Kettlebell Goblet Squat',
    sled_squat_machine: 'Sled Squat Machine',
    step_platform_step_up: 'Step-Platform Step-Up',
    hex_bar_deadlift: 'Hex-Bar Deadlift',
    seated_calf_raise: 'Machine Seated Calf Raise',
    side_plank_hip_lift: 'Side-Plank Hip Lift',
    cable_anti_rotation_press: 'Cable Anti-Rotation Press',
    seated_trunk_rotation: 'Seated Plate Trunk Rotation',
    dumbbell_suitcase_march: 'Dumbbell Suitcase March',
    dumbbell_single_leg_hip_hinge: 'Dumbbell Single-Leg Hip Hinge',
  };
  for (const [id, expectedName] of Object.entries(expectedEnglishDisplayNames)) {
    const boundary = frozenIds.has(id) ? 'preserve the frozen umbrella identity' : 'name the exact implementation';
    check(
      requireRow(id).localizations.en.displayName === expectedName,
      `catalog.exercise.${id}.localizations.en.displayName`,
      `must ${boundary} as ${expectedName}`,
    );
  }

  const hiit = requireRow('hiit_intervals');
  check(hiit.exerciseType === 'cardio', 'catalog.exercise.hiit_intervals.exerciseType', 'must be cardio');
  check(hiit.isBodyweight === true, 'catalog.exercise.hiit_intervals.isBodyweight', 'must preserve the frozen seed compatibility flag without narrowing the identity');
  check(hiit.movementPattern === 'interval_mixed', 'catalog.exercise.hiit_intervals.movementPattern', 'must be interval_mixed');
  check(hiit.defaultPrescription.trackingMode === 'duration', 'catalog.exercise.hiit_intervals.defaultPrescription.trackingMode', 'must match the current cardio logger');

  check(requireRow('bulgarian_split_squat').isBodyweight === false, 'catalog.exercise.bulgarian_split_squat.isBodyweight', 'frozen bridge must preserve loaded-log semantics');
  check(requireRow('standing_calf_raise').isBodyweight === false, 'catalog.exercise.standing_calf_raise.isBodyweight', 'frozen bridge must preserve loaded-log semantics');
  check(requireRow('hip_thrust').isBodyweight === false, 'catalog.exercise.hip_thrust.isBodyweight', 'loaded setup capability must remain consistent with the non-bodyweight flag');

  check(
    requireRow('assisted_pull_up').localizations.en.aliases.includes('Band-Assisted Overhand Pull-Up'),
    'catalog.exercise.assisted_pull_up.localizations.en.aliases',
    'must preserve the pull-up grip instead of merging an assisted chin-up',
  );
  check(
    !requireRow('assisted_pull_up').localizations.en.aliases.includes('Assisted Chin-Up'),
    'catalog.exercise.assisted_pull_up.localizations.en.aliases',
    'must not merge a chin-up into the pull-up identity',
  );
  check(
    requireRow('hex_bar_deadlift').localizations.en.aliases.includes('Trap-Bar Deadlift'),
    'catalog.exercise.hex_bar_deadlift.localizations.en.aliases',
    'must retain the familiar Trap-Bar search alias on the neutral canonical identity',
  );

  check(
    requireRow('hanging_leg_raise').localizations.es.aliases.includes('Elevación colgada de piernas'),
    'catalog.exercise.hanging_leg_raise.localizations.es.aliases',
    'must retain the corrected Spanish alias',
  );
  check(
    requireRow('dips').localizations['zh-Hans'].aliases.includes('双杠撑体'),
    'catalog.exercise.dips.localizations.zh-Hans.aliases',
    'must retain the corrected Chinese alias',
  );
  check(
    requireRow('seated_calf_raise').localizations.en.aliases.includes('Seated Calf Raise'),
    'catalog.exercise.seated_calf_raise.localizations.en.aliases',
    'must retain the natural English alias',
  );

  const rowsWithNoSecondaryClaim = [
    'barbell_back_squat',
    'romanian_deadlift',
    'leg_press',
    'leg_curl',
    'bulgarian_split_squat',
    'hanging_leg_raise',
    'plank',
    'face_pull',
    'front_squat',
    'kettlebell_goblet_squat',
    'sled_squat_machine',
    'walking_lunge',
    'step_platform_step_up',
    'hex_bar_deadlift',
    'kettlebell_swing',
    'dead_bug',
    'side_plank_hip_lift',
    'cable_anti_rotation_press',
    'dumbbell_single_leg_hip_hinge',
  ];
  for (const id of rowsWithNoSecondaryClaim) {
    check(
      requireRow(id).secondaryBodyRegions.length === 0,
      `catalog.exercise.${id}.secondaryBodyRegions`,
      'incidental stabilization must not be labeled as a direct secondary target',
    );
  }

  for (const legacyId of ['arnold_press', 'pec_deck_fly', 'rear_delt_fly', 'ez_bar_curl', 'goblet_squat', 'hack_squat', 'step_up', 'trap_bar_deadlift', 'side_plank', 'pallof_press', 'russian_twist', 'farmer_carry', 'single_leg_romanian_deadlift']) {
    check(!byId.has(legacyId), `catalog.exercise.${legacyId}`, 'non-frozen identity must use its neutral exact-implementation replacement');
  }
  for (const exercise of snapshot.exercises.slice(32)) {
    const identityFields = [
      [`catalog.exercise.${exercise.id}.id`, exercise.id],
      ...exercise.equipment.required.map((value, index) => [`catalog.exercise.${exercise.id}.equipment.required[${index}]`, value]),
      ...exercise.equipment.optional.map((value, index) => [`catalog.exercise.${exercise.id}.equipment.optional[${index}]`, value]),
      ...LOCALES.flatMap((locale) => [
        [`catalog.exercise.${exercise.id}.localizations.${locale}.displayName`, exercise.localizations[locale].displayName],
        ...exercise.localizations[locale].aliases.map((value, index) => [
          `catalog.exercise.${exercise.id}.localizations.${locale}.aliases[${index}]`,
          value,
        ]),
      ]),
    ];
    for (const [path, value] of identityFields) {
      const normalized = normalizeSearchV1(value);
      for (const token of NON_FROZEN_FORBIDDEN_IDENTITY_TOKENS) {
        check(
          !normalized.includes(normalizeSearchV1(token)),
          path,
          `must not contain non-neutral or protected identity token ${token}`,
        );
      }
    }
  }
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
  referenceContext,
  seedContract,
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

  validateReferenceContext(referenceContext);

  const searchTermsByLocale = Object.fromEntries(LOCALES.map((locale) => [locale, new Map()]));
  const ids = [];
  const displayOrders = [];
  for (const [index, exercise] of snapshot.exercises.entries()) {
    validateExercise(exercise, index, schema, searchTermsByLocale);
    ids.push(exercise.id);
    displayOrders.push(exercise.displayOrder);
  }
  check(new Set(ids).size === ids.length, 'catalog.exercises.id', 'IDs must be unique');
  check(new Set(displayOrders).size === displayOrders.length, 'catalog.exercises.displayOrder', 'displayOrder must be unique');

  const legacyIds = compatibility.canonicalIds;
  check(legacyIds.length === 32 && new Set(legacyIds).size === 32, 'compatibility.canonicalIds', 'must contain 32 unique IDs');
  check(JSON.stringify(ids.slice(0, 32)) === JSON.stringify(legacyIds), 'catalog.exercises[0..31]', 'must preserve exact legacy ID order');
  check(JSON.stringify(displayOrders.slice(0, 32)) === JSON.stringify(Array.from({ length: 32 }, (_, index) => index + 1)), 'catalog.exercises[0..31].displayOrder', 'must preserve displayOrder 1..32');
  check(Array.isArray(seedContract) && seedContract.length === 32, 'src/db/seed.ts', 'must expose 32 seed identity/type/bodyweight records');
  check(JSON.stringify(seedContract.map(({ id }) => id)) === JSON.stringify(legacyIds), 'src/db/seed.ts', 'must match compatibility registry exactly');
  for (const [index, seed] of seedContract.entries()) {
    const exercise = snapshot.exercises[index];
    check(
      exercise.exerciseType === seed.exerciseType,
      `catalog.exercise.${exercise.id}.exerciseType`,
      `frozen bridge must preserve seed value ${seed.exerciseType}`,
    );
    check(
      exercise.isBodyweight === seed.isBodyweight,
      `catalog.exercise.${exercise.id}.isBodyweight`,
      `frozen bridge must preserve seed value ${seed.isBodyweight}`,
    );
  }

  const exerciseById = new Map(snapshot.exercises.map((exercise) => [exercise.id, exercise]));
  for (const exercise of snapshot.exercises) {
    if (exercise.replacementId !== null) {
      const replacement = exerciseById.get(exercise.replacementId);
      check(replacement && replacement.status !== 'retired', `exercise.${exercise.id}.replacementId`, 'must reference a non-retired row');
      check(replacement.id !== exercise.id, `exercise.${exercise.id}.replacementId`, 'must not self-reference');
    }
  }

  validateConformanceVectors(snapshot);
  validateCanonicalEditorialDecisions(snapshot);
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

export function validateCatalogTransition(previousSnapshot, nextSnapshot) {
  check(isObject(previousSnapshot), 'previousCatalog', 'must be an object');
  check(Array.isArray(previousSnapshot.exercises), 'previousCatalog.exercises', 'must be an array');
  check(isObject(nextSnapshot), 'nextCatalog', 'must be an object');
  check(Array.isArray(nextSnapshot.exercises), 'nextCatalog.exercises', 'must be an array');

  const previousById = new Map(
    previousSnapshot.exercises.map((exercise) => [exercise.id, exercise]),
  );
  for (const exercise of nextSnapshot.exercises) {
    const previous = previousById.get(exercise.id);
    if (!previous) continue;
    check(
      exercise.defaultPrescription?.countingConvention ===
        previous.defaultPrescription?.countingConvention,
      `catalog.exercise.${exercise.id}.defaultPrescription.countingConvention`,
      'published countingConvention is immutable because historic set logs do not store catalog revision; publish a new ID and replacement instead',
    );
  }
}
