import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ExerciseRow, SetLogRow } from '@/db/types';
import { useSessionStore } from '@/features/forge/sessionStore';
import { useEditIntentStore } from '@/features/quicklog/editIntentStore';
import type { SavedQuickSet } from '@/features/quicklog/useQuickLog';
import { SetLoggerSheet } from './SetLoggerSheet';

const mockUpdateSet = jest.fn();
const mockGetLastSet = jest.fn();
const mockGetSessionSummary = jest.fn();
const mockLogSet = jest.fn();
const mockRecompute = jest.fn();
const mockSetSnapshot = jest.fn();
const mockDb = {};
let mockUnitSystem: 'metric' | 'imperial' = 'metric';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@/db/repos/setLogRepo', () => ({
  getLastSetForExercise: (...args: unknown[]) => mockGetLastSet(...args),
  updateSet: (...args: unknown[]) => mockUpdateSet(...args),
}));
jest.mock('@/db/repos/sessionRepo', () => ({
  getSessionActivitySummary: (...args: unknown[]) => mockGetSessionSummary(...args),
}));
jest.mock('@/db/repos/combatPowerRepo', () => ({
  recomputeAndStore: (...args: unknown[]) => mockRecompute(...args),
}));
jest.mock('@/features/logging/useLogSet', () => ({ useLogSet: () => mockLogSet }));
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { unitSystem: 'metric' | 'imperial'; weightStep: number }) => unknown) =>
    selector({ unitSystem: mockUnitSystem, weightStep: 2.5 }),
}));
jest.mock('@/stores/combatPowerStore', () => ({
  useCombatPowerStore: { getState: () => ({ setSnapshot: mockSetSnapshot }) },
}));

const exercise: ExerciseRow = {
  id: 'barbell_bench_press',
  name: 'Bench',
  muscle_group: 'chest',
  type: 'strength',
  default_sets: 3,
  rep_low: 5,
  rep_high: 8,
  is_bodyweight: 0,
  created_at: '',
};

const saved: SavedQuickSet = {
  setId: 'set-1',
  sessionId: 'session-1',
  exerciseId: exercise.id,
  exercise,
  name: 'Bench',
  weightKg: 100,
  reps: 5,
  rir: 2,
  volumeKg: 500,
  setCountToday: 1,
};

const previous: SetLogRow = {
  id: saved.setId,
  client_uuid: 'client-1',
  session_id: 'session-1',
  exercise_id: exercise.id,
  weight: 100,
  reps: 5,
  rir: 2,
  order_index: 0,
  is_pr: 0,
  score: 116.67,
  logged_via: 'quick',
  logged_at: '2026-07-11T10:00:00.000Z',
};

describe('SetLoggerSheet edit intent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnitSystem = 'metric';
    useEditIntentStore.setState({ intent: null });
    useEditIntentStore.getState().openEdit(saved);
    useSessionStore.setState({
      activeSessionId: 'session-1',
      setCount: 1,
      volumeKg: 500,
      pendingLogWrites: 0,
      finishing: false,
      logRevision: 0,
      lastSetAt: 1234,
    });
    mockUpdateSet.mockResolvedValue({ previous, row: { ...previous }, isPr: false });
    mockGetSessionSummary.mockResolvedValue({ itemCount: 1, volumeKg: 500 });
    mockRecompute.mockResolvedValue({ score: 1234, grade: { key: 'fighter' } });
  });

  afterEach(() => {
    useEditIntentStore.setState({ intent: null });
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

  it('updates the exact saved row without starting a session or inserting another set', async () => {
    const ensureSession = jest.fn().mockResolvedValue('should-not-run');
    const onClose = jest.fn();
    render(<SetLoggerSheet exercise={null} ensureSession={ensureSession} onClose={onClose} />);

    const save = await screen.findByText('logger.saveChanges');
    await waitFor(() => expect(screen.getByText('100.0')).toBeTruthy());
    fireEvent.press(save);

    await waitFor(() => expect(mockUpdateSet).toHaveBeenCalledTimes(1));
    expect(mockUpdateSet).toHaveBeenCalledWith(mockDb, {
      setId: saved.setId,
      weight: 100,
      reps: 5,
      rir: 2,
    });
    expect(ensureSession).not.toHaveBeenCalled();
    expect(mockLogSet).not.toHaveBeenCalled();
    expect(useSessionStore.getState()).toMatchObject({ setCount: 1, volumeKg: 500, lastSetAt: 1234 });
    expect(mockRecompute).toHaveBeenCalledWith(mockDb);
    expect(mockSetSnapshot).toHaveBeenCalledWith(1234, 'fighter');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('preserves canonical kg when an imperial edit is saved without touching weight', async () => {
    mockUnitSystem = 'imperial';
    const ensureSession = jest.fn();
    render(<SetLoggerSheet exercise={null} ensureSession={ensureSession} onClose={jest.fn()} />);

    const save = await screen.findByText('logger.saveChanges');
    await waitFor(() => expect(screen.getByText('220.5')).toBeTruthy());
    fireEvent.press(save);

    await waitFor(() => expect(mockUpdateSet).toHaveBeenCalledTimes(1));
    expect(mockUpdateSet).toHaveBeenCalledWith(mockDb, expect.objectContaining({ weight: 100 }));
    expect(ensureSession).not.toHaveBeenCalled();
  });
});
