import type { ExerciseRow, ExerciseType } from '@/db/types';

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
}

/**
 * Search normalization shared by every exercise picker. NFKC folds full-width input; the retained
 * ranges cover the app's four current catalogs (Latin, Hangul, and CJK) without a dependency.
 */
export function normalizeExerciseSearch(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\u3400-\u9fff가-힣]/g, '');
}

export function buildExerciseDiscoveryItems(
  exercises: readonly ExerciseRow[],
  localizedNameFor: (exercise: ExerciseRow) => string,
  recentSets: readonly RecentExerciseSet[],
  searchAliasesFor: (exercise: ExerciseRow) => readonly string[] = () => [],
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

function compareName(a: ExerciseDiscoveryItem, b: ExerciseDiscoveryItem): number {
  return a.localizedName.localeCompare(b.localizedName) || a.exercise.id.localeCompare(b.exercise.id);
}

function searchFields(item: ExerciseDiscoveryItem): string[] {
  const idTokens = item.exercise.id.split('_');
  const groupTokens = item.exercise.muscle_group.split('_');
  return [
    item.localizedName,
    item.exercise.name,
    item.exercise.id,
    ...idTokens,
    item.exercise.muscle_group,
    ...groupTokens,
    ...item.searchAliases,
  ]
    .map(normalizeExerciseSearch)
    .filter(Boolean);
}

/** Lower is better; null means no match. */
function searchScore(item: ExerciseDiscoveryItem, query: string): number | null {
  let best = Number.POSITIVE_INFINITY;
  for (const field of searchFields(item)) {
    if (field === query) best = Math.min(best, 0);
    else if (field.startsWith(query)) best = Math.min(best, 1);
    else if (field.includes(query)) best = Math.min(best, 2);
  }
  return Number.isFinite(best) ? best : null;
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

  if (!query) {
    if (options.explicitIds != null) {
      const order = new Map(options.explicitIds.map((id, index) => [id, index]));
      return allowed
        .filter((item) => order.has(item.exercise.id))
        .sort((a, b) => compareRecent(a, b) || order.get(a.exercise.id)! - order.get(b.exercise.id)!);
    }
    return allowed.sort((a, b) => compareRecent(a, b) || compareName(a, b));
  }

  return allowed
    .map((item) => ({ item, score: searchScore(item, query) }))
    .filter((match): match is { item: ExerciseDiscoveryItem; score: number } => match.score != null)
    .sort((a, b) => a.score - b.score || compareRecent(a.item, b.item) || compareName(a.item, b.item))
    .map((match) => match.item);
}
