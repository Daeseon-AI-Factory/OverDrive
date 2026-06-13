import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ActiveWorkoutCard } from './ActiveWorkoutCard';

// --- mocks (names prefixed `mock` so babel-plugin-jest-hoist allows them in factories) ---
const mockGetAllAsync = jest.fn();
const mockGetLastSet = jest.fn();
const mockGetSetCounts = jest.fn();
const mockGetCardioCounts = jest.fn();
const mockGetLastCardio = jest.fn();
const mockLogSet = jest.fn();
// Stable db reference (real expo-sqlite context is stable across renders; a fresh object each
// render would make db-dependent effects re-run and reset progress).
const mockDb = { getAllAsync: (...a: unknown[]) => mockGetAllAsync(...a) };

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  // i18n/index.ts calls i18n.use(initReactI18next).init(...) at import — keep it a valid plugin.
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('@/features/logging/useLogSet', () => ({ useLogSet: () => mockLogSet }));
jest.mock('@/features/logging/useLogCardio', () => ({ useLogCardio: () => jest.fn() }));
jest.mock('@/features/program/useProgram', () => ({
  // One-exercise upper day. targetSets:2 OVERRIDES the catalog default (3) — the test asserts the
  // workout completes after 2 sets, proving the slot override is honored.
  useTodayProgram: () => ({
    dayType: 'upper',
    title: 'Upper',
    focus: 'Focus',
    slots: [{ exerciseId: 'barbell_bench_press', targetSets: 2, repLow: 5, repHigh: 8 }],
  }),
}));
jest.mock('@/db/repos/setLogRepo', () => ({
  getLastSetForExercise: (...a: unknown[]) => mockGetLastSet(...a),
  getSetCountsForExercisesOnDate: (...a: unknown[]) => mockGetSetCounts(...a),
  deleteSet: jest.fn(),
}));
jest.mock('@/db/repos/cardioRepo', () => ({
  getCardioCountsForModalitiesOnDate: (...a: unknown[]) => mockGetCardioCounts(...a),
  getLastCardioForModality: (...a: unknown[]) => mockGetLastCardio(...a),
  deleteCardio: jest.fn(),
}));
jest.mock('@/db/repos/combatPowerRepo', () => ({ recomputeAndStore: jest.fn().mockResolvedValue({ score: 1000, grade: { key: 'rookie' } }) }));

const benchRow = {
  id: 'barbell_bench_press',
  name: 'Bench',
  muscle_group: 'chest',
  type: 'strength',
  default_sets: 3, // catalog default — slot override (2) should win
  rep_low: 5,
  rep_high: 8,
  is_bodyweight: 0,
  created_at: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllAsync.mockResolvedValue([benchRow]);
  mockGetSetCounts.mockResolvedValue({});
  mockGetCardioCounts.mockResolvedValue({});
  mockGetLastSet.mockResolvedValue({ weight: 60, reps: 5, rir: null });
  mockGetLastCardio.mockResolvedValue(null);
  mockLogSet.mockResolvedValue({ setId: 'set-1', isPr: false, deltaCp: 0, verdict: { tier: 1, reason: 'set' } });
});

describe('ActiveWorkoutCard', () => {
  it('logs a set through useLogSet with the prefilled weight/reps and slot rep target', async () => {
    const ensureSession = jest.fn().mockResolvedValue('session-1');
    render(<ActiveWorkoutCard ensureSession={ensureSession} onOpenCardio={jest.fn()} onFinishWorkout={jest.fn()} />);

    await screen.findByText('activeWorkout.completeSet');
    // Wait for the prefill (last set: 60kg x 5) to land so reps > 0 and the button is enabled.
    await waitFor(() => expect(screen.getByText(/60/)).toBeTruthy());
    fireEvent.press(screen.getByText('activeWorkout.completeSet'));

    await waitFor(() => expect(mockLogSet).toHaveBeenCalledTimes(1));
    expect(mockLogSet).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        exerciseId: 'barbell_bench_press',
        weight: 60,
        reps: 5,
        hitTargetReps: true, // 5 reps >= slot repLow 5
        loggedVia: 'quick',
      }),
    );
  });

  it('completes the workout after the slot target sets (2), not the catalog default (3)', async () => {
    const onFinishWorkout = jest.fn();
    const ensureSession = jest.fn().mockResolvedValue('session-1');
    render(<ActiveWorkoutCard ensureSession={ensureSession} onOpenCardio={jest.fn()} onFinishWorkout={onFinishWorkout} />);

    await screen.findByText('activeWorkout.completeSet');
    await waitFor(() => expect(screen.getByText(/60/)).toBeTruthy());

    fireEvent.press(screen.getByText('activeWorkout.completeSet'));
    await waitFor(() => expect(mockLogSet).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('activeWorkout.saving')).toBeNull()); // busy cleared

    fireEvent.press(screen.getByText('activeWorkout.completeSet'));
    await waitFor(() => expect(mockLogSet).toHaveBeenCalledTimes(2));

    // 2 sets done against a slot target of 2 → workout complete (catalog default 3 would not).
    const finish = await screen.findByText('activeWorkout.finishWorkout');
    fireEvent.press(finish);
    expect(onFinishWorkout).toHaveBeenCalledTimes(1);
  });
});
