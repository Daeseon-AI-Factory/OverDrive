import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import type { ExerciseRow } from '@/db/types';
import type { SavedQuickSet } from './useQuickLog';
import { ConfirmUndoCard } from './ConfirmUndoCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('@/features/exercise-art/ExercisePose', () => ({ ExercisePose: () => null }));
jest.mock('@/ui/skins/SkinContext', () => ({ useSkinOrNull: () => null }));
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { unitSystem: 'metric'; aestheticPref: 'aura' }) => unknown) =>
    selector({ unitSystem: 'metric', aestheticPref: 'aura' }),
}));
jest.mock('react-native-reanimated', () => {
  const { View: NativeView } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View: NativeView },
    Easing: { linear: (value: number) => value },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withTiming: (value: unknown) => value,
  };
});

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

describe('ConfirmUndoCard accessibility timing', () => {
  const remove = jest.fn();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({ remove } as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    remove.mockClear();
  });

  it('keeps Edit and Undo available without a timer while a screen reader is active', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const onEdit = jest.fn();
    const onUndo = jest.fn();
    const onDismiss = jest.fn();
    render(
      <ConfirmUndoCard
        nonce={1}
        saved={saved}
        editable
        onEdit={onEdit}
        onUndo={onUndo}
        onDismiss={onDismiss}
      />,
    );
    await act(async () => {});

    act(() => jest.advanceTimersByTime(60_000));
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'quicklog.confirmCard.edit' }));
    fireEvent.press(screen.getByRole('button', { name: 'quicklog.confirmCard.undo' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after fifteen seconds when no screen reader is active', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    const onDismiss = jest.fn();
    render(
      <ConfirmUndoCard
        nonce={1}
        saved={saved}
        editable
        onEdit={jest.fn()}
        onUndo={jest.fn()}
        onDismiss={onDismiss}
      />,
    );
    await act(async () => {});

    act(() => jest.advanceTimersByTime(14_999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('pauses dismissal while an async correction is busy and restarts the window afterwards', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    const onDismiss = jest.fn();
    const props = {
      nonce: 1,
      saved,
      editable: true,
      onEdit: jest.fn(),
      onUndo: jest.fn(),
      onDismiss,
    };
    const view = render(<ConfirmUndoCard {...props} busy />);
    await act(async () => {});

    act(() => jest.advanceTimersByTime(60_000));
    expect(onDismiss).not.toHaveBeenCalled();

    view.rerender(<ConfirmUndoCard {...props} busy={false} />);
    act(() => jest.advanceTimersByTime(15_000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
