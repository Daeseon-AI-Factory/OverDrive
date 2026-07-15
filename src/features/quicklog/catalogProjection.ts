import type { CatalogExerciseSelection, CatalogExerciseView, CatalogLocale } from '@/features/exercises/catalog/types';
import { normalizeCatalogSearch } from '@/features/exercises/catalog/normalization';
import {
  catalogAllowsExternalLoad,
  supportsCurrentLogger,
} from '@/features/exercises/catalog/loggingSupport';
import type { ParseCandidate } from './parseEntry';

export const MAX_QUICKLOG_CANDIDATES = 64;
export const MAX_QUICKLOG_NAMES = 4;
export const MAX_QUICKLOG_NAME_LENGTH = 60;

/** Final durable-write guard shared by local text, AI, and recent-repeat paths. */
export function resolvedQuickLogWeightKg(
  candidate: Pick<ParseCandidate, 'isBodyweight' | 'allowsExternalLoad'> | undefined,
  hintedIsBodyweight: boolean | undefined,
  requestedWeightKg: number,
): number {
  const isBodyweight = candidate?.isBodyweight ?? hintedIsBodyweight ?? false;
  return isBodyweight && candidate?.allowsExternalLoad !== true ? 0 : requestedWeightKg;
}

/** Deterministic, bounded candidates shared by the local parser and the AI projection. */
export function buildQuickLogCandidates(
  views: readonly CatalogExerciseView[],
  locale: CatalogLocale,
  fallbackNameFor: (view: CatalogExerciseView) => string,
): ParseCandidate[] {
  return [...views]
    .filter((view) =>
      (view.catalog?.exerciseType ?? view.exercise.type) === 'strength' &&
      supportsCurrentLogger(view.exercise, view.catalog),
    )
    .sort(compareViews)
    .slice(0, MAX_QUICKLOG_CANDIDATES)
    .map((view) => candidateForView(view, locale, fallbackNameFor(view)));
}

export function selectionFromCandidate(
  candidate: ParseCandidate,
  views: readonly CatalogExerciseView[],
): CatalogExerciseSelection | null {
  const view = views.find((item) => item.exercise.id === candidate.id);
  return view ? { ...view, localizedName: candidate.name } : null;
}

function candidateForView(
  view: CatalogExerciseView,
  locale: CatalogLocale,
  fallbackName: string,
): ParseCandidate {
  const localization = view.catalog?.localizations[locale];
  const englishFallback = locale === 'en' ? null : view.catalog?.localizations.en;
  const rawNames = localization
    ? [
        localization.displayName,
        ...localization.aliases,
        ...(englishFallback ? [englishFallback.displayName, ...englishFallback.aliases] : []),
      ]
    : [fallbackName, view.exercise.name, ...view.exercise.id.split('_')];
  const names: string[] = [];
  const normalized = new Set<string>();
  for (const value of rawNames) {
    if ([...value].length > MAX_QUICKLOG_NAME_LENGTH) continue;
    const key = normalizeCatalogSearch(value);
    if (!key || normalized.has(key)) continue;
    normalized.add(key);
    names.push(value);
    if (names.length === MAX_QUICKLOG_NAMES) break;
  }
  const name = names[0] ?? fallbackName.slice(0, MAX_QUICKLOG_NAME_LENGTH);
  const target = view.catalog?.defaultPrescription.target;
  return {
    id: view.exercise.id,
    catalogId: view.catalog?.id,
    name,
    aliases: names.slice(1),
    isBodyweight: view.catalog?.isBodyweight ?? view.exercise.is_bodyweight === 1,
    allowsExternalLoad: catalogAllowsExternalLoad(view.catalog),
    countingConvention: view.catalog?.defaultPrescription.countingConvention,
    targetRepLow: target?.unit === 'reps' ? target.low : view.exercise.rep_low,
  };
}

function compareViews(left: CatalogExerciseView, right: CatalogExerciseView): number {
  const leftCanonical = left.catalog != null;
  const rightCanonical = right.catalog != null;
  if (leftCanonical !== rightCanonical) return leftCanonical ? -1 : 1;
  const displayOrder = (left.catalog?.displayOrder ?? Number.POSITIVE_INFINITY) -
    (right.catalog?.displayOrder ?? Number.POSITIVE_INFINITY);
  if (displayOrder !== 0) return displayOrder;
  const leftId = left.catalog?.id ?? left.exercise.id;
  const rightId = right.catalog?.id ?? right.exercise.id;
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}
