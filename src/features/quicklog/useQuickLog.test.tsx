import { act, renderHook } from '@testing-library/react-native';
import type { ExerciseRow } from '@/db/types';
import { useSessionStore } from '@/features/forge/sessionStore';
import type { ParseCandidate } from './parseEntry';
import { useQuickLog } from './useQuickLog';

const mockDb = {};
const mockReadCatalogViews = jest.fn();
const mockBuildCandidates = jest.fn();
const mockGetRecentExercises = jest.fn();
const mockGetSetCounts = jest.fn();
const mockDeleteSets = jest.fn();
const mockGetSessionSummary = jest.fn();
const mockLogSet = jest.fn();
const mockLogSets = jest.fn();
const mockRequestAiAccess = jest.fn();
const mockRecompute = jest.fn();
const mockSetSnapshot = jest.fn();

jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('expo-router', () => ({ useFocusEffect: jest.fn() }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('@/db/repos/combatPowerRepo', () => ({
  recomputeAndStore: (...args: unknown[]) => mockRecompute(...args),
}));
jest.mock('@/db/repos/sessionRepo', () => ({
  getSessionActivitySummary: (...args: unknown[]) => mockGetSessionSummary(...args),
}));
jest.mock('@/db/repos/setLogRepo', () => ({
  deleteSets: (...args: unknown[]) => mockDeleteSets(...args),
  ensureExercise: jest.fn(),
  getRecentExercises: (...args: unknown[]) => mockGetRecentExercises(...args),
  getSetCountsForExercisesOnDate: (...args: unknown[]) => mockGetSetCounts(...args),
}));
jest.mock('@/features/exercises/catalog/service', () => ({
  readCatalogViews: (...args: unknown[]) => mockReadCatalogViews(...args),
}));
jest.mock('@/features/exercises/catalog/loggingSupport', () => ({ supportsCurrentLogger: () => true }));
jest.mock('@/features/forge/useForge', () => ({
  useForge: () => ({ enterSilently: jest.fn().mockResolvedValue('session-1') }),
}));
jest.mock('@/features/logging/useLogSet', () => ({
  useLogSet: () => mockLogSet,
  useLogSets: () => mockLogSets,
}));
jest.mock('@/features/subscription/SubscriptionProvider', () => ({
  useSubscription: () => ({ requestAiAccess: mockRequestAiAccess, showAiAccessError: jest.fn() }),
}));
jest.mock('@/features/subscription/workerClient', () => ({
  AiApiError: class AiApiError extends Error {},
  isAttemptLimitError: () => false,
  isQuotaError: () => false,
  isRemoteAiConsentError: () => false,
  isSubscriptionRequiredError: () => false,
}));
jest.mock('@/features/quicklog/config', () => ({ QUICKLOG_ENDPOINT: 'https://worker.example' }));
jest.mock('@/features/quicklog/catalogProjection', () => ({
  buildQuickLogCandidates: (...args: unknown[]) => mockBuildCandidates(...args),
  resolvedQuickLogWeightKg: (_candidate: unknown, _isBodyweight: boolean, weightKg: number) => weightKg,
}));
jest.mock('@/features/quicklog/parseEntryAI', () => ({ parseEntryAI: jest.fn() }));
jest.mock('@/lib/settings', () => ({ hasCurrentRemoteAiConsent: () => true }));
jest.mock('@/stores/combatPowerStore', () => ({
  useCombatPowerStore: { getState: () => ({ setSnapshot: mockSetSnapshot }) },
}));
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: {
    unitSystem: 'metric';
    locale: 'en';
    remoteAiConsent: object;
  }) => unknown) => selector({ unitSystem: 'metric', locale: 'en', remoteAiConsent: {} }),
}));

const exercise: ExerciseRow = {
  id: 'barbell_bench_press',
  name: 'Bench Press',
  muscle_group: 'chest',
  type: 'strength',
  default_sets: 3,
  rep_low: 5,
  rep_high: 8,
  is_bodyweight: 0,
  created_at: '',
};

const candidate: ParseCandidate = {
  id: exercise.id,
  name: exercise.name,
  aliases: ['bench'],
  isBodyweight: false,
  allowsExternalLoad: true,
  countingConvention: 'total',
  targetRepLow: 5,
};

describe('useQuickLog local durability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadCatalogViews.mockResolvedValue({
      source: 'seed',
      views: [{ exercise, catalog: null }],
    });
    mockBuildCandidates.mockReturnValue([candidate]);
    mockGetRecentExercises.mockResolvedValue([]);
    mockGetSetCounts.mockResolvedValue({ [exercise.id]: 1 });
    mockLogSet.mockResolvedValue({ setId: 'set-1' });
    mockLogSets.mockResolvedValue([]);
    mockRequestAiAccess.mockResolvedValue('cancelled');
    mockDeleteSets.mockResolvedValue(1);
    mockGetSessionSummary.mockResolvedValue({ itemCount: 0, volumeKg: 0 });
    mockRecompute.mockResolvedValue({ score: 100, grade: { key: 'fighter' } });
    useSessionStore.setState({
      activeSessionId: 'session-1',
      setCount: 0,
      volumeKg: 0,
      pendingLogWrites: 0,
      finishing: false,
      logRevision: 0,
      lastSetAt: null,
    });
  });

  afterEach(() => {
    act(() => {
      useSessionStore.setState({
        activeSessionId: null,
        setCount: 0,
        volumeKg: 0,
        pendingLogWrites: 0,
        finishing: false,
        logRevision: 0,
        lastSetAt: null,
      });
    });
  });

  it('loads local candidates before the first submit instead of entering the AI gate', async () => {
    const { result } = renderHook(() => useQuickLog());
    let response: Awaited<ReturnType<typeof result.current.submitText>> | null = null;

    await act(async () => {
      response = await result.current.submitText('bench 100 5');
    });

    expect(response).toMatchObject({ ok: true });
    expect(mockReadCatalogViews).toHaveBeenCalledWith(mockDb);
    expect(mockLogSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        exerciseId: exercise.id,
        weight: 100,
        reps: 5,
      }),
    );
    expect(mockRequestAiAccess).not.toHaveBeenCalled();
  });

  it('reports a durable undo as successful when summary and power refresh both fail', async () => {
    const { result } = renderHook(() => useQuickLog());
    let saved: Extract<Awaited<ReturnType<typeof result.current.submitText>>, { ok: true }> | null = null;
    await act(async () => {
      const response = await result.current.submitText('bench 100 5');
      if (response.ok) saved = response;
    });
    expect(saved).not.toBeNull();
    useSessionStore.setState({ setCount: 1, volumeKg: 500 });
    mockGetSessionSummary.mockRejectedValueOnce(new Error('summary unavailable'));
    mockRecompute.mockRejectedValueOnce(new Error('power unavailable'));

    await act(async () => {
      await expect(result.current.undoSave(saved!.saved)).resolves.toBeUndefined();
    });

    expect(mockDeleteSets).toHaveBeenCalledWith(mockDb, ['set-1']);
    expect(useSessionStore.getState()).toMatchObject({
      setCount: 0,
      volumeKg: 0,
      pendingLogWrites: 0,
    });
  });
});
