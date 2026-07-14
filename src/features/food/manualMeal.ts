import type { FoodItemInput } from '@/db/repos/foodRepo';

export const PORTION_MULTIPLIERS = [0.5, 1, 1.5] as const;
export type PortionMultiplier = (typeof PORTION_MULTIPLIERS)[number];

/** Parse only user-entered nutrition values. No estimation, inference, or network fallback. */
export function parseManualFoodDraft(
  name: string,
  kcalText: string,
  proteinText: string,
): FoodItemInput | null {
  const trimmedName = name.trim();
  const kcal = parseNonNegativeDecimal(kcalText);
  const proteinG = parseNonNegativeDecimal(proteinText);
  if (!trimmedName || kcal == null || proteinG == null) return null;
  return { name: trimmedName, kcal, proteinG };
}

/** Scale a saved local meal without modifying its history row. Rounded to one display-safe decimal. */
export function scaleFoodItems(items: FoodItemInput[], multiplier: PortionMultiplier): FoodItemInput[] {
  return items.map((item) => ({
    ...item,
    kcal: roundTenth(item.kcal * multiplier),
    proteinG: roundTenth(item.proteinG * multiplier),
  }));
}

function parseNonNegativeDecimal(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function roundTenth(value: number): number {
  return Math.round((value + 1e-9) * 10) / 10;
}
