import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FoodCard } from './FoodCard';

const mockDb = {};
const mockAddFoodItems = jest.fn();
const mockGetFoodToday = jest.fn();
const mockGetRecentFoodBatches = jest.fn();
const mockRequestAiAccess = jest.fn();

jest.mock('expo-sqlite', () => ({ useSQLiteContext: () => mockDb }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
    useRouter: () => ({ push: jest.fn() }),
  };
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      key === 'food.recent.item'
        ? `${values?.name} · ${values?.kcal} kcal · ${values?.protein}g`
        : (values?.defaultValue as string | undefined) ?? key,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));
jest.mock('@/db/repos/foodRepo', () => ({
  addFoodItems: (...args: unknown[]) => mockAddFoodItems(...args),
  getFoodToday: (...args: unknown[]) => mockGetFoodToday(...args),
  getRecentFoodBatches: (...args: unknown[]) => mockGetRecentFoodBatches(...args),
  undoFoodBatch: jest.fn(),
  updateManualFoodItem: jest.fn(),
}));
jest.mock('@/db/repos/disciplineRepo', () => ({
  getDisciplineToday: jest.fn(),
  setDisciplineToday: jest.fn(),
}));
jest.mock('@/db/repos/combatPowerRepo', () => ({ recomputeAndStore: jest.fn() }));
jest.mock('@/features/juice/classifyEvent', () => ({ classifyEvent: jest.fn() }));
jest.mock('@/features/juice/JuiceProvider', () => ({ useJuice: () => ({ fire: jest.fn() }) }));
jest.mock('@/features/quicklog/config', () => ({ QUICKLOG_ENDPOINT: 'https://unused.test' }));
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
jest.mock('@/features/food/parseFoodAI', () => ({ parseFoodPhoto: jest.fn(), parseFoodText: jest.fn() }));
jest.mock('@/lib/image', () => ({ downscaleForUpload: jest.fn() }));
jest.mock('@/lib/temporaryFiles', () => ({ deleteAppCacheFile: jest.fn().mockResolvedValue(true) }));
jest.mock('@/lib/settings', () => ({ hasCurrentRemoteAiConsent: () => false }));
jest.mock('@/stores/combatPowerStore', () => ({
  useCombatPowerStore: { getState: () => ({ score: 0, setSnapshot: jest.fn() }) },
}));
jest.mock('@/stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: { proteinTargetG: null; remoteAiConsent: null }) => unknown) =>
    selector({ proteinTargetG: null, remoteAiConsent: null }),
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@/ui/RingGauge', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return { RingGauge: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children) };
});
jest.mock('@/ui/primitives', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text, TextInput, View } = jest.requireActual('react-native');
  return {
    Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
      React.createElement(
        Pressable,
        { accessibilityRole: 'button', accessibilityLabel: label, disabled, onPress },
        React.createElement(Text, null, label),
      ),
    Card: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    IconSquare: ({ accessibilityLabel, onPress }: { accessibilityLabel: string; onPress: () => void }) =>
      React.createElement(Pressable, { accessibilityRole: 'button', accessibilityLabel, onPress }),
    Input: (props: Record<string, unknown>) => React.createElement(TextInput, props),
    Metric: ({ value }: { value: string }) => React.createElement(Text, null, value),
    Muted: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    Pill: ({ label, onPress }: { label: string; onPress: () => void }) =>
      React.createElement(
        Pressable,
        { accessibilityRole: 'button', accessibilityLabel: label, onPress },
        React.createElement(Text, null, label),
      ),
    SectionTitle: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    useAccent: () => ({ solid: '#fff' }),
  };
});

const savedManualBatch = {
  ids: ['food-new'],
  batchId: 'batch-new',
  items: [{ name: 'Greek yogurt', kcal: 180, proteinG: 17.5 }],
  source: 'manual' as const,
  loggedAt: '2026-07-14T12:00:00.000Z',
  date: '2026-07-14',
  userId: 'local',
};

describe('FoodCard free local path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFoodToday.mockResolvedValue({ kcal: 0, proteinG: 0, entries: 0 });
    mockGetRecentFoodBatches.mockResolvedValue([]);
    mockAddFoodItems.mockResolvedValue(savedManualBatch);
  });

  it('saves a fresh manual meal without consent, subscription, quota, or network access', async () => {
    render(<FoodCard />);

    fireEvent.changeText(screen.getByLabelText('food.manual.name'), 'Greek yogurt');
    fireEvent.changeText(screen.getByLabelText('food.manual.kcal'), '180');
    fireEvent.changeText(screen.getByLabelText('food.manual.protein'), '17.5');
    fireEvent.press(screen.getByRole('button', { name: 'food.manual.save' }));

    await waitFor(() =>
      expect(mockAddFoodItems).toHaveBeenCalledWith(
        mockDb,
        [{ name: 'Greek yogurt', kcal: 180, proteinG: 17.5 }],
        'manual',
      ),
    );
    expect(mockRequestAiAccess).not.toHaveBeenCalled();
  });

  it('repeats a recent local meal at the selected portion without AI access', async () => {
    mockGetRecentFoodBatches.mockResolvedValue([
      {
        ...savedManualBatch,
        ids: ['food-old'],
        batchId: 'batch-old',
        items: [{ name: 'Chicken bowl', kcal: 400, proteinG: 40 }],
        source: 'photo',
      },
    ]);
    render(<FoodCard />);

    fireEvent.press(await screen.findByRole('button', { name: '0.5×' }));
    fireEvent.press(screen.getByRole('button', { name: 'Chicken bowl · 200 kcal · 20g' }));

    await waitFor(() =>
      expect(mockAddFoodItems).toHaveBeenCalledWith(
        mockDb,
        [{ name: 'Chicken bowl', kcal: 200, proteinG: 20 }],
        'manual',
      ),
    );
    expect(mockRequestAiAccess).not.toHaveBeenCalled();
  });
});
