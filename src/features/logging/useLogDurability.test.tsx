import { act, renderHook } from '@testing-library/react-native';
import { useSessionStore } from '@/features/forge/sessionStore';
import { useLogCardio } from './useLogCardio';
import { useLogSet } from './useLogSet';

const mockDb = {};
const mockAddSet = jest.fn();
const mockAddCardio = jest.fn();
const mockRecompute = jest.fn();
const mockJuiceFire = jest.fn();
const mockStartRest = jest.fn();

jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('@/db/repos/setLogRepo', () => ({ addSet: (...args: unknown[]) => mockAddSet(...args) }));
jest.mock('@/db/repos/cardioRepo', () => ({ addCardio: (...args: unknown[]) => mockAddCardio(...args) }));
jest.mock('@/db/repos/combatPowerRepo', () => ({
  recomputeAndStore: (...args: unknown[]) => mockRecompute(...args),
}));
jest.mock('@/db/repos/powerEventRepo', () => ({ appendPowerEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/features/juice/JuiceProvider', () => ({ useJuice: () => ({ fire: mockJuiceFire }) }));
jest.mock('@/features/juice/classifyEvent', () => ({
  classifyEvent: () => ({ tier: 1, reason: 'set', dismiss: 'auto' }),
}));
jest.mock('@/features/rest/restTimerStore', () => ({
  useRestTimerStore: { getState: () => ({ start: mockStartRest }) },
}));
jest.mock('@/stores/combatPowerStore', () => ({
  useCombatPowerStore: { getState: () => ({ score: 100, setSnapshot: jest.fn() }) },
}));

describe('durable logging boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSessionStore.setState({
      activeSessionId: 'session-1',
      startedAt: Date.now(),
      setCount: 0,
      volumeKg: 0,
      cpAtStart: 100,
      ritual: null,
      pendingLogWrites: 0,
      finishing: false,
      logRevision: 0,
      lastSetAt: null,
    });
    mockRecompute.mockRejectedValue(new Error('cp unavailable'));
  });

  afterEach(() => {
    useSessionStore.setState({
      activeSessionId: null,
      startedAt: null,
      setCount: 0,
      volumeKg: 0,
      pendingLogWrites: 0,
      finishing: false,
      logRevision: 0,
      lastSetAt: null,
    });
  });

  it('returns a saved set instead of inviting a duplicate when CP recomputation fails', async () => {
    mockAddSet.mockResolvedValue({ row: { id: 'set-1' }, isPr: false });
    const { result } = renderHook(() => useLogSet());

    let saved: Awaited<ReturnType<ReturnType<typeof useLogSet>>> | null = null;
    await act(async () => {
      saved = await result.current({
        sessionId: 'session-1',
        exerciseId: 'barbell_bench_press',
        weight: 100,
        reps: 5,
        rir: 2,
        hitTargetReps: true,
      });
    });

    expect(saved).toMatchObject({ setId: 'set-1', deltaCp: 0 });
    expect(useSessionStore.getState()).toMatchObject({ setCount: 1, volumeKg: 500, pendingLogWrites: 0 });
    expect(mockStartRest).toHaveBeenCalledTimes(1);
  });

  it('returns saved cardio instead of inviting a duplicate when CP recomputation fails', async () => {
    mockAddCardio.mockResolvedValue({ id: 'cardio-1' });
    const { result } = renderHook(() => useLogCardio());

    let saved: Awaited<ReturnType<ReturnType<typeof useLogCardio>>> | null = null;
    await act(async () => {
      saved = await result.current({
        sessionId: 'session-1',
        modality: 'zone2_run',
        durationSec: 1200,
        distanceM: null,
        rpe: 6,
      });
    });

    expect(saved).toMatchObject({ cardioId: 'cardio-1', deltaCp: 0 });
    expect(useSessionStore.getState()).toMatchObject({ setCount: 1, volumeKg: 0, pendingLogWrites: 0 });
  });
});
