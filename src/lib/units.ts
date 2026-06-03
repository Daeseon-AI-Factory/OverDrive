// Unit system (kg/lb, km/mi). Canonical storage is ALWAYS metric (weight kg, distance meters) —
// Combat Power computes in kg. Only display + input convert. Default metric; user-toggleable.

export type UnitSystem = 'metric' | 'imperial';

const KG_PER_LB = 0.45359237;
const M_PER_MI = 1609.344;

const round = (v: number, p: number): number => {
  const f = 10 ** p;
  return Math.round(v * f) / f;
};

export function weightUnit(sys: UnitSystem): 'kg' | 'lb' {
  return sys === 'imperial' ? 'lb' : 'kg';
}
export function distanceUnit(sys: UnitSystem): 'km' | 'mi' {
  return sys === 'imperial' ? 'mi' : 'km';
}

/** Stored kg → number shown in the user's unit. */
export function kgToDisplay(kg: number, sys: UnitSystem): number {
  return sys === 'imperial' ? kg / KG_PER_LB : kg;
}
/** User-entered display number → kg for storage. */
export function displayToKg(value: number, sys: UnitSystem): number {
  return sys === 'imperial' ? value * KG_PER_LB : value;
}

/** "60 kg" / "132.3 lb". Empty string for non-positive (bodyweight). */
export function formatWeight(kg: number, sys: UnitSystem, precision = 1): string {
  if (kg <= 0) return '';
  return `${round(kgToDisplay(kg, sys), precision)} ${weightUnit(sys)}`;
}

/** Stepper increment in DISPLAY units: metric uses the user's kg step; imperial uses 5 lb. */
export function weightStepDisplay(sys: UnitSystem, metricStepKg: number): number {
  return sys === 'imperial' ? 5 : metricStepKg;
}

export function mToDistance(m: number, sys: UnitSystem): number {
  return sys === 'imperial' ? m / M_PER_MI : m / 1000;
}
/** Display distance (km or mi) → meters for storage. */
export function distanceToMeters(value: number, sys: UnitSystem): number {
  return sys === 'imperial' ? value * M_PER_MI : value * 1000;
}
export function formatDistance(m: number, sys: UnitSystem, precision = 2): string {
  return `${round(mToDistance(m, sys), precision)} ${distanceUnit(sys)}`;
}
