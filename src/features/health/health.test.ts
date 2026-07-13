import {
  isHealthDataAvailable,
  requestAuthorization,
  saveQuantitySample,
} from '@kingstinct/react-native-healthkit';
import { writeBodyComposition } from './health';

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
