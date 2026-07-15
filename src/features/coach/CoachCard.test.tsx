import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useSessionStore } from '@/features/forge/sessionStore';
import { useEditIntentStore } from '@/features/quicklog/editIntentStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { CoachCard } from './CoachCard';

const mockRepeat = jest.fn();
const mockUndoSave = jest.fn();
const mockResolveSelection = jest.fn();

jest.mock('@/features/exercise-art/ExercisePose', () => ({ ExercisePose: () => null }));
jest.mock('@/features/juice/audio/engine', () => ({ playNamed: jest.fn() }));
jest.mock('@/features/quicklog/ConfirmUndoCard', () => ({ ConfirmUndoCard: () => null }));
jest.mock('@/features/quicklog/useQuickLog', () => ({
  useQuickLog: () => ({
    candidates: [{ id: 'row' }],
    repeat: mockRepeat,
    undoSave: mockUndoSave,
    resolveSelection: mockResolveSelection,
  }),
}));
jest.mock('./RestCountdownBar', () => ({ RestCountdownBar: () => null }));

jest.mock('./useCoachPlan', () => {
  const exercise = {
    id: 'row',
    name: 'Barbell row',
    muscle_group: 'back',
    type: 'strength',
    default_sets: 3,
    rep_low: 6,
    rep_high: 10,
    is_bodyweight: 0,
    created_at: '2026-07-14T00:00:00.000Z',
  };
  return {
    useCoachPlan: () => ({
      loaded: true,
      dayTitle: 'Pull day',
      exerciseById: new Map([[exercise.id, exercise]]),
      compute: () => ({
        kind: 'session_idle',
        idleSec: 12 * 60,
        idleAnchorAt: Date.parse('2026-07-14T17:48:00.000Z'),
        suggestion: {
          exerciseId: exercise.id,
          isCardio: false,
          weightKg: 82.5,
          reps: 7,
          setNumber: 2,
          targetSets: 3,
          prChance: false,
        },
      }),
    }),
  };
});

describe('CoachCard idle-session save guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useEditIntentStore.setState({ intent: null });
    mockResolveSelection.mockImplementation(async (exercise) => ({
      exercise,
      catalog: null,
      localizedName: 'Barbell row',
    }));
    useSettingsStore.setState({ unitSystem: 'metric' });
    useSessionStore.setState({
      activeSessionId: 'open-session',
      startedAt: Date.now() - 25 * 60_000,
      setCount: 2,
      volumeKg: 982.5,
      cpAtStart: 100,
      ritual: null,
      pendingLogWrites: 0,
      finishing: false,
      logRevision: 0,
      lastSetAt: null,
    });
  });

  afterEach(() => {
    act(() => {
      useEditIntentStore.setState({ intent: null });
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
  });

  it('keeps rows unchanged on Continue, then adds one only through the explicit set CTA', async () => {
    let rowCount = 2;
    mockRepeat.mockImplementation(async () => {
      rowCount += 1;
      return null;
    });

    render(
      <CoachCard
        ensureSession={jest.fn(async () => 'open-session')}
        onOpenExercise={jest.fn()}
        onFinishWorkout={jest.fn()}
        detailOpen={false}
        onToggleDetail={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByLabelText('Continue'));
    expect(rowCount).toBe(2);
    expect(mockRepeat).not.toHaveBeenCalled();

    const explicitSave = await screen.findByLabelText('Log 82.5kg × 7');
    fireEvent.press(explicitSave);

    await waitFor(() => expect(mockRepeat).toHaveBeenCalledTimes(1));
    expect(rowCount).toBe(3);
    expect(mockRepeat).toHaveBeenCalledWith({
      exerciseId: 'row',
      name: 'Barbell row',
      weight: 82.5,
      reps: 7,
      rir: null,
      isBodyweight: false,
    });
  });

  it('opens the strength logger with the resolved catalog selection intact', async () => {
    render(
      <CoachCard
        ensureSession={jest.fn(async () => 'open-session')}
        onOpenExercise={jest.fn()}
        onFinishWorkout={jest.fn()}
        detailOpen={false}
        onToggleDetail={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByLabelText('Change'));

    await waitFor(() => expect(mockResolveSelection).toHaveBeenCalledWith(expect.objectContaining({ id: 'row' })));
    expect(useEditIntentStore.getState().intent).toMatchObject({
      kind: 'new',
      selection: {
        exercise: expect.objectContaining({ id: 'row' }),
        localizedName: 'Barbell row',
      },
    });
  });
});
