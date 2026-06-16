import {
  getMostRecentQuantitySample,
  isHealthDataAvailable,
  queryWorkoutSamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { Platform } from 'react-native';
import { EMPTY_HEALTH_SNAPSHOT, type HealthSnapshot } from './types';

// Minimum-necessary READ set (compliance §5.1.1 / docs/compliance/health-data.md) — only types tied
// to a real Combat Power input. No WRITE for now (Phase 1 reads; writing real sessions is later).
const READ_TYPES = [
  'HKWorkoutTypeIdentifier',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierVO2Max',
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

/** Ask the user to grant read access. Returns false (never throws) if unavailable/denied. */
export async function requestHealthAuthorization(): Promise<boolean> {
  if (!healthAvailable()) return false;
  try {
    return await requestAuthorization({ toRead: READ_TYPES });
  } catch (e) {
    console.error('[health] authorization failed', e);
    return false;
  }
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
    const [bodyMassKg, bodyFatFraction, vo2Max, restingHeartRate] = await Promise.all([
      recent('HKQuantityTypeIdentifierBodyMass'),
      recent('HKQuantityTypeIdentifierBodyFatPercentage'),
      recent('HKQuantityTypeIdentifierVO2Max'),
      recent('HKQuantityTypeIdentifierRestingHeartRate'),
    ]);
    return { connected: true, workouts7d, bodyMassKg, bodyFatFraction, vo2Max, restingHeartRate };
  } catch (e) {
    console.error('[health] snapshot failed', e);
    return EMPTY_HEALTH_SNAPSHOT;
  }
}
