import { act, renderHook } from '@testing-library/react-native';
import { useSessionStore } from './sessionStore';
import { useForge } from './useForge';

const mockDb = {};
const mockCompleteSession = jest.fn();
const mockGetCompletedDates = jest.fn();
const mockGetOpenSession = jest.fn();
const mockGetSessionSummary = jest.fn();
const mockRecompute = jest.fn();
const mockSetSnapshot = jest.fn();
const mockJuiceFire = jest.fn();

jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('@/db/repos/sessionRepo', () => ({
  completeSession: (...args: unknown[]) => mockCompleteSession(...args),
  getCompletedSessionDates: (...args: unknown[]) => mockGetCompletedDates(...args),
  getOpenSessionForDate: (...args: unknown[]) => mockGetOpenSession(...args),
  getSessionActivitySummary: (...args: unknown[]) => mockGetSessionSummary(...args),
  startSession: jest.fn(),
}));
jest.mock('@/db/repos/combatPowerRepo', () => ({
  recomputeAndStore: (...args: unknown[]) => mockRecompute(...args),
}));
jest.mock('@/db/repos/powerEventRepo', () => ({ appendPowerEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/features/juice/JuiceProvider', () => ({ useJuice: () => ({ fire: mockJuiceFire }) }));
jest.mock('@/features/juice/classifyEvent', () => ({ classifyEvent: () => ({ tier: 4 }) }));
jest.mock('@/features/juice/haptics', () => ({ fireHaptic: jest.fn() }));
jest.mock('@/features/juice/audio/engine', () => ({ playNamed: jest.fn() }));
jest.mock('@/features/health/health', () => ({ writeWorkout: jest.fn() }));
jest.mock('@/features/program/resolve', () => ({ resolveProgramDay: () => ({ dayType: 'push' }) }));
jest.mock('@/stores/combatPowerStore', () => ({
  useCombatPowerStore: { getState: () => ({ score: 100, setSnapshot: mockSetSnapshot }) },
}));
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ customProgram: null, health: null }) },
}));

describe('useForge completion durability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({
      activeSessionId: 'session-1',
      startedAt: 1_700_000_000_000,
      setCount: 2,
      volumeKg: 1000,
      cpAtStart: 100,
      ritual: null,
      pendingLogWrites: 0,
      finishing: false,
      logRevision: 0,
      lastSetAt: null,
    });
    mockCompleteSession.mockResolvedValue(true);
    mockGetCompletedDates.mockResolvedValue([]);
    mockGetOpenSession.mockResolvedValue(null);
    mockGetSessionSummary.mockResolvedValue({ itemCount: 2, volumeKg: 1000 });
  });

  afterEach(() => {
    useSessionStore.setState({
      activeSessionId: null,
      startedAt: null,
      setCount: 0,
      volumeKg: 0,
      cpAtStart: 0,
      ritual: null,
      pendingLogWrites: 0,
      finishing: false,
      logRevision: 0,
      lastSetAt: null,
    });
  });

  it('clears the active store after durable completion even if CP recomputation fails', async () => {
    mockRecompute.mockRejectedValue(new Error('cp unavailable'));
    const { result } = renderHook(() => useForge());

    let completed = false;
    await act(async () => {
      completed = await result.current.finish();
    });

    expect(completed).toBe(true);
    expect(mockCompleteSession).toHaveBeenCalledWith(mockDb, 'session-1');
    expect(useSessionStore.getState()).toMatchObject({
      activeSessionId: null,
      finishing: false,
      ritual: {
        kind: 'complete',
        summary: { sets: 2, volumeKg: 1000, deltaCp: 0 },
      },
    });
    expect(mockSetSnapshot).not.toHaveBeenCalled();
  });

  it('keeps the session active and releases the finish gate when the durable write fails', async () => {
    mockCompleteSession.mockRejectedValue(new Error('db unavailable'));
    const { result } = renderHook(() => useForge());

    await expect(
      act(async () => {
        await result.current.finish();
      }),
    ).rejects.toThrow('db unavailable');
    expect(useSessionStore.getState()).toMatchObject({ activeSessionId: 'session-1', finishing: false });
  });

  it('keeps its finish lease while hydrating an open DB session', async () => {
    useSessionStore.setState({ activeSessionId: null, finishing: false, pendingLogWrites: 0 });
    mockGetOpenSession.mockResolvedValue({ id: 'session-open' });
    mockRecompute.mockRejectedValue(new Error('cp unavailable'));
    const { result } = renderHook(() => useForge());

    let completed = false;
    await act(async () => {
      completed = await result.current.finish();
    });

    expect(completed).toBe(true);
    expect(mockCompleteSession).toHaveBeenCalledWith(mockDb, 'session-open');
    expect(useSessionStore.getState()).toMatchObject({ activeSessionId: null, finishing: false });
  });
});
