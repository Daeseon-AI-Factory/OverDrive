import type { ExerciseRow, ExerciseType } from '@/db/types';
import {
  boundedLevenshtein,
  normalizeCatalogSearch,
  typoDistanceLimit,
} from './catalog/normalization';
import type { CatalogExercise, CatalogLocale } from './catalog/types';

export interface RecentExerciseSet {
  exerciseId: string;
  weight: number;
  reps: number;
  rir: number | null;
}

export interface ExerciseDiscoveryItem {
  exercise: ExerciseRow;
  localizedName: string;
  /** Localized body-region/type words supplied by the UI (for example, "가슴" or "유산소"). */
  searchAliases: readonly string[];
  /** Canonical metadata is null only for local/ad-hoc or seed-fallback rows. */
  catalog: CatalogExercise | null;
  catalogLocale: CatalogLocale;
  recentSet: RecentExerciseSet | null;
  /** Position in the recent-exercise query (0 = most recent). */
  recentRank: number | null;
}

export interface ExerciseDiscoveryOptions {
  query: string;
  /** Initial curated list. It limits the empty state, but not an active search. */
  explicitIds?: readonly string[];
  /** Hard boundary for both browsing and search. */
  type?: ExerciseType;
  /** Today's program order. It ranks before recent use without limiting search scope. */
  programExerciseIds?: readonly string[];
}

/**
 * Search normalization shared by every exercise picker. NFKC folds full-width input; the retained
 * ranges cover the app's four current catalogs (Latin, Hangul, and CJK) without a dependency.
 */
export const normalizeExerciseSearch = normalizeCatalogSearch;

export function buildExerciseDiscoveryItems(
  exercises: readonly ExerciseRow[],
  localizedNameFor: (exercise: ExerciseRow) => string,
  recentSets: readonly RecentExerciseSet[],
  searchAliasesFor: (exercise: ExerciseRow) => readonly string[] = () => [],
  catalogFor: (exercise: ExerciseRow) => CatalogExercise | null = () => null,
  catalogLocale: CatalogLocale = 'en',
): ExerciseDiscoveryItem[] {
  const recentById = new Map<string, { set: RecentExerciseSet; rank: number }>();
  recentSets.forEach((set, rank) => {
    // The repo query already returns one row per exercise, but first-wins keeps this helper safe for
    // callers that hand it raw history rows.
    if (!recentById.has(set.exerciseId)) recentById.set(set.exerciseId, { set, rank });
  });

  return exercises.map((exercise) => {
    const recent = recentById.get(exercise.id);
    return {
      exercise,
      localizedName: localizedNameFor(exercise),
      searchAliases: searchAliasesFor(exercise),
      catalog: catalogFor(exercise),
      catalogLocale,
      recentSet: recent?.set ?? null,
      recentRank: recent?.rank ?? null,
    };
  });
}

function compareRecent(a: ExerciseDiscoveryItem, b: ExerciseDiscoveryItem): number {
  const ar = a.recentRank ?? Number.POSITIVE_INFINITY;
  const br = b.recentRank ?? Number.POSITIVE_INFINITY;
  return ar - br;
}

function compareCodePoints(left: string, right: string): number {
  const a = [...left].map((value) => value.codePointAt(0)!);
  const b = [...right].map((value) => value.codePointAt(0)!);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function compareName(a: ExerciseDiscoveryItem, b: ExerciseDiscoveryItem): number {
  return (
    compareCodePoints(normalizeExerciseSearch(a.localizedName), normalizeExerciseSearch(b.localizedName)) ||
    compareCodePoints(a.exercise.id, b.exercise.id)
  );
}

interface SearchField {
  value: string;
  priority: number;
  typoEligible: boolean;
}

function searchFields(item: ExerciseDiscoveryItem): SearchField[] {
  const catalog = item.catalog;
  const searchId = catalog?.id ?? item.exercise.id;
  const idTokens = searchId.split('_');
  const localization = catalog?.localizations[item.catalogLocale];
  const fields: SearchField[] = [
    { value: item.localizedName, priority: 0, typoEligible: true },
  ];
  localization?.aliases.forEach((alias, index) => {
    fields.push({ value: alias, priority: 10 + index, typoEligible: true });
  });
  if (catalog && item.catalogLocale !== 'en') {
    const english = catalog.localizations.en;
    fields.push({ value: english.displayName, priority: 20, typoEligible: true });
    english.aliases.forEach((alias, index) => {
      fields.push({ value: alias, priority: 21 + index, typoEligible: true });
    });
  }
  if (item.exercise.name !== item.localizedName) {
    fields.push({ value: item.exercise.name, priority: 30, typoEligible: catalog == null });
  }
  fields.push({ value: searchId, priority: 40, typoEligible: true });
  idTokens.forEach((token, index) => {
    fields.push({ value: token, priority: 41 + index, typoEligible: false });
  });
  const equipment = catalog ? [...catalog.equipment.required, ...catalog.equipment.optional] : [];
  equipment.forEach((value, index) => {
    fields.push({ value, priority: 80 + index, typoEligible: false });
    value.split('_').forEach((token) => fields.push({ value: token, priority: 80 + index, typoEligible: false }));
  });
  if (catalog) {
    fields.push({ value: catalog.movementPattern, priority: 100, typoEligible: false });
    catalog.movementPattern.split('_').forEach((token) => {
      fields.push({ value: token, priority: 100, typoEligible: false });
    });
  }
  const regions = catalog
    ? [...catalog.primaryBodyRegions, ...catalog.secondaryBodyRegions]
    : [item.exercise.muscle_group];
  regions.forEach((value, index) => {
    fields.push({ value, priority: 120 + index, typoEligible: false });
  });
  item.searchAliases.forEach((value, index) => {
    fields.push({ value, priority: 140 + index, typoEligible: false });
  });
  return fields
    .map((field) => ({ ...field, value: normalizeExerciseSearch(field.value) }))
    .filter((field) => field.value.length > 0);
}

interface SearchScore {
  matchClass: 0 | 1 | 2 | 3;
  distance: number;
  fieldPriority: number;
}

function compareSearchScore(a: SearchScore, b: SearchScore): number {
  return a.matchClass - b.matchClass || a.distance - b.distance || a.fieldPriority - b.fieldPriority;
}

/** Exact → prefix → substring → bounded typo; null means no match. */
function searchScore(item: ExerciseDiscoveryItem, query: string): SearchScore | null {
  let best: SearchScore | null = null;
  for (const field of searchFields(item)) {
    let candidate: SearchScore | null = null;
    if (field.value === query) candidate = { matchClass: 0, distance: 0, fieldPriority: field.priority };
    else if (field.value.startsWith(query)) candidate = { matchClass: 1, distance: 0, fieldPriority: field.priority };
    else if (field.value.includes(query)) candidate = { matchClass: 2, distance: 0, fieldPriority: field.priority };
    if (candidate && (!best || compareSearchScore(candidate, best) < 0)) best = candidate;
  }
  if (best) return best;

  const maxDistance = typoDistanceLimit(query);
  if (maxDistance === 0) return null;
  for (const field of searchFields(item)) {
    if (!field.typoEligible) continue;
    const distance = boundedLevenshtein(query, field.value, maxDistance);
    if (distance <= maxDistance) {
      const candidate: SearchScore = { matchClass: 3, distance, fieldPriority: field.priority };
      if (!best || compareSearchScore(candidate, best) < 0) best = candidate;
    }
  }
  return best;
}

function inferredTypes(
  items: readonly ExerciseDiscoveryItem[],
  explicitIds: readonly string[] | undefined,
): Set<ExerciseType> | null {
  if (explicitIds == null || explicitIds.length === 0) return null;
  const explicit = new Set(explicitIds);
  const types = new Set<ExerciseType>();
  for (const item of items) {
    if (explicit.has(item.exercise.id)) types.add(item.exercise.type);
  }
  return types.size > 0 ? types : null;
}

/**
 * Empty query = the caller's curated region (or the full requested type), with recently used lifts
 * first. Active query = the full catalog inside the allowed exercise type, so ad-hoc DB exercises
 * and catalog entries outside the initial region remain discoverable.
 */
export function discoverExercises(
  items: readonly ExerciseDiscoveryItem[],
  options: ExerciseDiscoveryOptions,
): ExerciseDiscoveryItem[] {
  const query = normalizeExerciseSearch(options.query);
  const types = options.type ? new Set<ExerciseType>([options.type]) : inferredTypes(items, options.explicitIds);
  const allowed = types ? items.filter((item) => types.has(item.exercise.type)) : [...items];
  const programOrder = new Map(options.programExerciseIds?.map((id, index) => [id, index]) ?? []);
  const compareProgram = (a: ExerciseDiscoveryItem, b: ExerciseDiscoveryItem): number => {
    const ar = programOrder.get(a.exercise.id) ?? Number.POSITIVE_INFINITY;
    const br = programOrder.get(b.exercise.id) ?? Number.POSITIVE_INFINITY;
    return ar - br;
  };
  const compareDisplayOrder = (a: ExerciseDiscoveryItem, b: ExerciseDiscoveryItem): number =>
    (a.catalog?.displayOrder ?? Number.POSITIVE_INFINITY) -
    (b.catalog?.displayOrder ?? Number.POSITIVE_INFINITY);

  if (!query) {
    if (options.explicitIds != null) {
      const order = new Map(options.explicitIds.map((id, index) => [id, index]));
      return allowed
        .filter((item) => order.has(item.exercise.id))
        .sort(
          (a, b) =>
            compareProgram(a, b) ||
            compareRecent(a, b) ||
            compareDisplayOrder(a, b) ||
            order.get(a.exercise.id)! - order.get(b.exercise.id)!,
        );
    }
    return allowed.sort(
      (a, b) => compareProgram(a, b) || compareRecent(a, b) || compareDisplayOrder(a, b) || compareName(a, b),
    );
  }

  return allowed
    .map((item) => ({ item, score: searchScore(item, query) }))
    .filter((match): match is { item: ExerciseDiscoveryItem; score: SearchScore } => match.score != null)
    .sort(
      (a, b) =>
        compareSearchScore(a.score, b.score) ||
        compareProgram(a.item, b.item) ||
        compareRecent(a.item, b.item) ||
        compareDisplayOrder(a.item, b.item) ||
        compareName(a.item, b.item),
    )
    .map((match) => match.item);
}
