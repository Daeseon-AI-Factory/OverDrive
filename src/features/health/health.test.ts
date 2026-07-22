import {
  getMostRecentQuantitySample,
  isHealthDataAvailable,
  queryWorkoutSamples,
  requestAuthorization,
  saveQuantitySample,
} from '@kingstinct/react-native-healthkit';
import { readHealthSnapshot, writeBodyComposition } from './health';

jest.mock('@kingstinct/react-native-healthkit', () => ({
  getMostRecentQuantitySample: jest.fn(),
  isHealthDataAvailable: jest.fn(),
  queryWorkoutSamples: jest.fn(),
  requestAuthorization: jest.fn(),
  saveQuantitySample: jest.fn(),
  saveWorkoutSample: jest.fn(),
  WorkoutActivityType: { traditionalStrengthTraining: 50 },
}));

const mockAvailable = jest.mocked(isHealthDataAvailable);
const mockAuthorize = jest.mocked(requestAuthorization);
const mockSaveQuantity = jest.mocked(saveQuantitySample);
const mockMostRecent = jest.mocked(getMostRecentQuantitySample);
const mockQueryWorkouts = jest.mocked(queryWorkoutSamples);
const savedSample = {} as NonNullable<Awaited<ReturnType<typeof saveQuantitySample>>>;

describe('writeBodyComposition', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAvailable.mockReturnValue(true);
    mockAuthorize.mockResolvedValue(true);
    mockSaveQuantity.mockResolvedValue(savedSample);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('returns true only after both Health samples save', async () => {
    await expect(writeBodyComposition({ weightKg: 82.5, bodyFatFraction: 0.17 })).resolves.toBe(true);

    expect(mockSaveQuantity).toHaveBeenCalledTimes(2);
    expect(mockSaveQuantity).toHaveBeenNthCalledWith(
      1,
      'HKQuantityTypeIdentifierBodyMass',
      'kg',
      82.5,
      expect.any(Date),
      expect.any(Date),
    );
    expect(mockSaveQuantity).toHaveBeenNthCalledWith(
      2,
      'HKQuantityTypeIdentifierBodyFatPercentage',
      '%',
      0.17,
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('returns false if either sample fails and still attempts the other value', async () => {
    mockSaveQuantity.mockRejectedValueOnce(new Error('weight write failed')).mockResolvedValueOnce(savedSample);

    await expect(writeBodyComposition({ weightKg: 82.5, bodyFatFraction: 0.17 })).resolves.toBe(false);
    expect(mockSaveQuantity).toHaveBeenCalledTimes(2);
  });

  it('returns false when the second sample fails after weight succeeds', async () => {
    mockSaveQuantity.mockResolvedValueOnce(savedSample).mockRejectedValueOnce(new Error('body-fat write failed'));

    await expect(writeBodyComposition({ weightKg: 82.5, bodyFatFraction: 0.17 })).resolves.toBe(false);
    expect(mockSaveQuantity).toHaveBeenCalledTimes(2);
  });

  it('returns false without writes when authorization is denied', async () => {
    mockAuthorize.mockResolvedValue(false);

    await expect(writeBodyComposition({ weightKg: 82.5, bodyFatFraction: 0.17 })).resolves.toBe(false);
    expect(mockSaveQuantity).not.toHaveBeenCalled();
  });

  it('returns false when HealthKit resolves without a saved sample', async () => {
    mockSaveQuantity.mockResolvedValueOnce(undefined).mockResolvedValueOnce(savedSample);

    await expect(writeBodyComposition({ weightKg: 82.5, bodyFatFraction: 0.17 })).resolves.toBe(false);
    expect(mockSaveQuantity).toHaveBeenCalledTimes(2);
  });
});

describe('readHealthSnapshot canonical units', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAvailable.mockReturnValue(true);
    mockQueryWorkouts.mockResolvedValue([]);
    mockMostRecent.mockImplementation(async (identifier) => ({
      quantity:
        identifier === 'HKQuantityTypeIdentifierBodyMass'
          ? 78.5
          : identifier === 'HKQuantityTypeIdentifierBodyFatPercentage'
            ? 0.18
            : 44.2,
    }) as never);
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => consoleError.mockRestore());

  it('requests every value in the canonical unit used by the app', async () => {
    await expect(readHealthSnapshot()).resolves.toMatchObject({
      connected: true,
      bodyMassKg: 78.5,
      bodyFatFraction: 0.18,
      vo2Max: 44.2,
    });

    expect(mockMostRecent).toHaveBeenNthCalledWith(1, 'HKQuantityTypeIdentifierBodyMass', 'kg');
    expect(mockMostRecent).toHaveBeenNthCalledWith(2, 'HKQuantityTypeIdentifierBodyFatPercentage', '%');
    expect(mockMostRecent).toHaveBeenNthCalledWith(3, 'HKQuantityTypeIdentifierVO2Max', 'ml/(kg*min)');
  });

  it('keeps the other canonical values when one Health sample fails', async () => {
    mockMostRecent.mockImplementation(async (identifier) => {
      if (identifier === 'HKQuantityTypeIdentifierBodyMass') throw new Error('weight unavailable');
      return { quantity: identifier === 'HKQuantityTypeIdentifierBodyFatPercentage' ? 0.18 : 44.2 } as never;
    });

    await expect(readHealthSnapshot()).resolves.toMatchObject({
      connected: true,
      bodyMassKg: null,
      bodyFatFraction: 0.18,
      vo2Max: 44.2,
    });
  });
});
