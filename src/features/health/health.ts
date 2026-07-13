import {
  getMostRecentQuantitySample,
  isHealthDataAvailable,
  queryWorkoutSamples,
  requestAuthorization,
  saveQuantitySample,
  saveWorkoutSample,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';
import { Platform } from 'react-native';
import { EMPTY_HEALTH_SNAPSHOT, type HealthSnapshot } from './types';

// Minimum-necessary READ set (compliance §5.1.1 / docs/compliance/health-data.md) — only types tied
// to a real Combat Power input.
const READ_TYPES = [
  'HKWorkoutTypeIdentifier',
  'HKQuantityTypeIdentifierVO2Max',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
] as const;

// WRITE only REAL user-performed data (§4 / Apple 5.1.3) — workouts you finish + body metrics you
// measure/enter (InBody). NEVER Combat Power or any game-derived number.
const WRITE_TYPES = [
  'HKWorkoutTypeIdentifier',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Apple Health (iOS) only for now; Android Health Connect is a later impl. Never throws. */
export function healthAvailable(): boolean {
  try {
    return Platform.OS === 'ios' && isHealthDataAvailable();
  } catch {
    return false;
  }
}

/** Ask the user to grant read + write access. Returns false (never throws) if unavailable/denied. */
export async function requestHealthAuthorization(): Promise<boolean> {
  if (!healthAvailable()) return false;
  try {
    return await requestAuthorization({ toRead: READ_TYPES, toShare: WRITE_TYPES });
  } catch (e) {
    console.error('[health] authorization failed', e);
    return false;
  }
}

/** Write a finished in-app workout to Apple Health as an HKWorkout. Real activity only. Never throws. */
export async function writeWorkout(start: Date, end: Date): Promise<void> {
  if (!healthAvailable()) return;
  try {
    await saveWorkoutSample(WorkoutActivityType.traditionalStrengthTraining, [], start, end);
  } catch (e) {
    console.error('[health] writeWorkout failed', e);
  }
}

/** Write the user's body weight (kg) to Apple Health. Real measured data only. Never throws. */
export async function writeBodyMass(kg: number): Promise<boolean> {
  if (!healthAvailable() || !Number.isFinite(kg) || !(kg > 0)) return false;
  try {
    const now = new Date();
    const saved = await saveQuantitySample('HKQuantityTypeIdentifierBodyMass', 'kg', kg, now, now);
    return saved != null;
  } catch (e) {
    console.error('[health] writeBodyMass failed', e);
    return false;
  }
}

/** Write body-fat as a FRACTION (0..1) to Apple Health (HealthKit % unit is a fraction). Never throws. */
export async function writeBodyFat(fraction: number): Promise<boolean> {
  if (!healthAvailable() || !Number.isFinite(fraction) || !(fraction >= 0 && fraction <= 1)) return false;
  try {
    const now = new Date();
    const saved = await saveQuantitySample('HKQuantityTypeIdentifierBodyFatPercentage', '%', fraction, now, now);
    return saved != null;
  } catch (e) {
    console.error('[health] writeBodyFat failed', e);
    return false;
  }
}

/** Request write access + push InBody body-composition values to Apple Health. Returns false on failure. */
export async function writeBodyComposition(input: {
  weightKg?: number | null;
  bodyFatFraction?: number | null;
}): Promise<boolean> {
  if (!healthAvailable()) return false;
  const ok = await requestHealthAuthorization();
  if (!ok) return false;
  let attempted = false;
  let savedAll = true;
  if (input.weightKg != null) {
    attempted = true;
    savedAll = (await writeBodyMass(input.weightKg)) && savedAll;
  }
  if (input.bodyFatFraction != null) {
    attempted = true;
    savedAll = (await writeBodyFat(input.bodyFatFraction)) && savedAll;
  }
  return attempted && savedAll;
}

async function recent(id: Parameters<typeof getMostRecentQuantitySample>[0]): Promise<number | null> {
  try {
    const s = await getMostRecentQuantitySample(id);
    return s?.quantity ?? null;
  } catch {
    return null;
  }
}

/** Read the current health snapshot. Fully defensive — any failure yields the empty snapshot. */
export async function readHealthSnapshot(): Promise<HealthSnapshot> {
  if (!healthAvailable()) return EMPTY_HEALTH_SNAPSHOT;
  try {
    let workouts7d = 0;
    try {
      const since = new Date(Date.now() - 7 * DAY_MS);
      const workouts = await queryWorkoutSamples({ filter: { date: { startDate: since } }, limit: 0 });
      workouts7d = Array.isArray(workouts) ? workouts.length : 0;
    } catch (e) {
      console.error('[health] workout query failed', e);
    }
    const [bodyMassKg, bodyFatFraction, vo2Max] = await Promise.all([
      recent('HKQuantityTypeIdentifierBodyMass'),
      recent('HKQuantityTypeIdentifierBodyFatPercentage'),
      recent('HKQuantityTypeIdentifierVO2Max'),
    ]);
    return { connected: true, workouts7d, bodyMassKg, bodyFatFraction, vo2Max };
  } catch (e) {
    console.error('[health] snapshot failed', e);
    return EMPTY_HEALTH_SNAPSHOT;
  }
}
