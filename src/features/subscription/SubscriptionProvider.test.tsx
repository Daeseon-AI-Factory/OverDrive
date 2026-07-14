import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, Pressable, Text, type AppStateStatus } from 'react-native';
import { SubscriptionProvider, useSubscription, type AiAccessDecision } from './SubscriptionProvider';
import { SubscriptionSettingsCard } from './SubscriptionSettingsCard';
import {
  addEntitlementListener,
  getCurrentProEntitlement,
  getProProduct,
  getSubscriptionUiFixture,
  purchasePro,
} from './nativeStoreKit';
import { useSubscriptionStore } from './subscriptionStore';
import { REMOTE_AI_CONSENT_VERSION } from '@/lib/settings';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  clearWorkerSession,
  hasFreshWorkerSession,
  refreshSubscriptionUsage,
  refreshWorkerSession,
} from './workerClient';

jest.mock('./nativeStoreKit', () => ({
  isStoreKitAvailable: jest.fn(() => true),
  getSubscriptionUiFixture: jest.fn(() => null),
  getCurrentProEntitlement: jest.fn(async () => null),
  getProProduct: jest.fn(async () => ({
    id: 'ai.daeseon.reploom.pro.monthly.v1',
    displayName: 'Reploom Pro',
    description: 'Pro AI',
    displayPrice: '$4.99',
    price: 4.99,
    currencyCode: 'USD',
    subscriptionPeriod: { unit: 'month', value: 1 },
  })),
  addEntitlementListener: jest.fn(() => null),
  purchasePro: jest.fn(),
  restorePro: jest.fn(async () => null),
  openManageSubscriptions: jest.fn(async () => undefined),
}));

jest.mock('./workerClient', () => {
  class MockAiApiError extends Error {
    code = 'worker_error';
    status = 500;
    usage = null;
    resetAt = null;
  }
  return {
    AiApiError: MockAiApiError,
    clearWorkerSession: jest.fn(),
    hasFreshWorkerSession: jest.fn(() => false),
    isQuotaError: jest.fn(() => false),
    isAttemptLimitError: jest.fn(() => false),
    refreshWorkerSession: jest.fn(async () => false),
    refreshSubscriptionUsage: jest.fn(async () => undefined),
  };
});

const mockedPurchase = jest.mocked(purchasePro);
const mockedGetProduct = jest.mocked(getProProduct);
const mockedUiFixture = jest.mocked(getSubscriptionUiFixture);
const mockedClearWorkerSession = jest.mocked(clearWorkerSession);
const mockedAddEntitlementListener = jest.mocked(addEntitlementListener);
const mockedCurrentEntitlement = jest.mocked(getCurrentProEntitlement);
const mockedRefresh = jest.mocked(refreshWorkerSession);
const mockedHasFreshSession = jest.mocked(hasFreshWorkerSession);
const mockedRefreshUsage = jest.mocked(refreshSubscriptionUsage);

const activeUsage = {
  creditsUsed: 12,
  creditsLimit: 1_000,
  creditsRemaining: 988,
  photosUsed: 2,
  photosLimit: 60,
  photosRemaining: 58,
  resetAt: '2099-08-13T00:00:00.000Z',
};

const activeEntitlement = {
  productId: 'ai.daeseon.reploom.pro.monthly.v1' as const,
  environment: 'sandbox',
  expiresAt: '2099-08-13T00:00:00.000Z',
};

const storeKitEntitlement = {
  productId: 'ai.daeseon.reploom.pro.monthly.v1',
  transactionId: '200000000000001',
  originalTransactionId: '200000000000000',
  purchaseDate: '2026-07-13T00:00:00.000Z',
  originalPurchaseDate: '2026-07-13T00:00:00.000Z',
  expirationDate: '2099-08-13T00:00:00.000Z',
  revocationDate: null,
  isUpgraded: false,
  environment: 'sandbox',
  appAccountToken: '8f4cfa62-0d65-806e-8e88-b730ddad5c59',
  jwsRepresentation: 'not-sent-to-worker',
  appTransactionId: '400000000000000',
} as const;

let onAppStateChange: ((state: AppStateStatus) => void) | null = null;
let onEntitlementChange: Parameters<typeof addEntitlementListener>[0] | null = null;
const appStateSpy = jest.spyOn(AppState, 'addEventListener');

function GateProbe({ onDecision }: { onDecision: (decision: AiAccessDecision) => void }) {
  const { requestAiAccess } = useSubscription();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="request photo AI"
      onPress={() => void requestAiAccess('food_photo').then(onDecision)}
    >
      <Text>Request</Text>
    </Pressable>
  );
}

function RefreshProbe({ onResult }: { onResult: (active: boolean) => void }) {
  const { refresh } = useSubscription();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="refresh subscription"
      onPress={() => void refresh().then(onResult)}
    >
      <Text>Refresh</Text>
    </Pressable>
  );
}

function PaywallProbe() {
  const { openPaywall } = useSubscription();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="open Pro panel" onPress={openPaywall}>
      <Text>Open</Text>
    </Pressable>
  );
}

beforeEach(() => {
  onAppStateChange = null;
  onEntitlementChange = null;
  appStateSpy.mockReset();
  appStateSpy.mockImplementation((_event, listener) => {
    onAppStateChange = listener;
    return { remove: jest.fn() };
  });
  useSubscriptionStore.getState().setInactive();
  useSubscriptionStore.getState().setStoreKitActive(false);
  useSubscriptionStore.getState().setProduct(null);
  mockedGetProduct.mockReset();
  mockedGetProduct.mockResolvedValue({
    id: 'ai.daeseon.reploom.pro.monthly.v1',
    displayName: 'Reploom Pro',
    description: 'Pro AI',
    displayPrice: '$4.99',
    price: 4.99,
    currencyCode: 'USD',
    subscriptionPeriod: { unit: 'month', value: 1 },
  });
  mockedAddEntitlementListener.mockReset();
  mockedUiFixture.mockReset();
  mockedUiFixture.mockReturnValue(null);
  mockedAddEntitlementListener.mockImplementation((listener) => {
    onEntitlementChange = listener;
    return { remove: jest.fn() };
  });
  mockedCurrentEntitlement.mockReset();
  mockedCurrentEntitlement.mockResolvedValue(null);
  mockedRefresh.mockReset();
  mockedRefresh.mockResolvedValue(false);
  mockedHasFreshSession.mockReset();
  mockedHasFreshSession.mockReturnValue(false);
  mockedRefreshUsage.mockReset();
  mockedRefreshUsage.mockResolvedValue(activeUsage);
  mockedPurchase.mockReset();
  mockedClearWorkerSession.mockReset();
  useSettingsStore.getState().apply({
    remoteAiConsent: {
      version: REMOTE_AI_CONSENT_VERSION,
      acceptedAt: '2026-07-13T00:00:00.000Z',
    },
  });
});

it('shows an explicit simulator-only quota fixture without contacting StoreKit or the Worker', async () => {
  mockedUiFixture.mockReturnValue('quota');
  const view = render(
    <SubscriptionProvider>
      <Text>Child</Text>
    </SubscriptionProvider>,
  );

  expect(await view.findByText('AI limit reached')).toBeTruthy();
  expect(view.getByText('1000 / 1000')).toBeTruthy();
  expect(view.getByText('60 / 60')).toBeTruthy();
  expect(mockedRefresh).not.toHaveBeenCalled();
  expect(mockedGetProduct).not.toHaveBeenCalled();
});

it('refreshes usage without re-exchanging entitlement on a fresh foreground session', async () => {
  mockedHasFreshSession.mockReturnValue(true);
  useSubscriptionStore.getState().setActive(activeEntitlement, activeUsage);

  const view = render(
    <SubscriptionProvider>
      <Text>Child</Text>
    </SubscriptionProvider>,
  );

  await waitFor(() => expect(mockedRefresh).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mockedRefreshUsage).toHaveBeenCalledTimes(1));
  mockedRefresh.mockClear();
  mockedRefreshUsage.mockClear();

  act(() => onAppStateChange?.('active'));

  await waitFor(() => expect(mockedRefreshUsage).toHaveBeenCalledTimes(1));
  expect(mockedRefresh).not.toHaveBeenCalled();
  expect(useSubscriptionStore.getState().phase).toBe('active');

  view.unmount();
});

it('preserves the active phase while a worker session refresh is in flight', async () => {
  const onResult = jest.fn();
  useSubscriptionStore.getState().setActive(activeEntitlement, activeUsage);
  const view = render(
    <SubscriptionProvider>
      <RefreshProbe onResult={onResult} />
    </SubscriptionProvider>,
  );
  await waitFor(() => expect(mockedRefresh).toHaveBeenCalledTimes(1));
  mockedRefresh.mockReset();

  let finishRefresh!: (active: boolean) => void;
  mockedRefresh.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        useSubscriptionStore.getState().setChecking();
        finishRefresh = resolve;
      }),
  );

  fireEvent.press(view.getByLabelText('refresh subscription'));

  await waitFor(() => expect(mockedRefresh).toHaveBeenCalledTimes(1));
  expect(useSubscriptionStore.getState()).toMatchObject({
    phase: 'active',
    entitlement: activeEntitlement,
    usage: activeUsage,
  });
  expect(onResult).not.toHaveBeenCalled();

  act(() => finishRefresh(true));
  await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
});

it('still exchanges an explicit transaction delivered by the entitlement listener', async () => {
  const view = render(
    <SubscriptionProvider>
      <Text>Child</Text>
    </SubscriptionProvider>,
  );
  await waitFor(() => expect(mockedRefresh).toHaveBeenCalledTimes(1));
  mockedRefresh.mockClear();

  act(() => onEntitlementChange?.(storeKitEntitlement));

  await waitFor(() =>
    expect(mockedRefresh).toHaveBeenCalledWith(expect.any(String), storeKitEntitlement),
  );
  view.unmount();
});

it('immediately clears the worker session when StoreKit removes the entitlement', async () => {
  const view = render(
    <SubscriptionProvider>
      <Text>Child</Text>
    </SubscriptionProvider>,
  );
  await waitFor(() => expect(mockedRefresh).toHaveBeenCalledTimes(1));

  act(() => onEntitlementChange?.(null));

  expect(mockedClearWorkerSession).toHaveBeenCalledTimes(1);
  expect(useSubscriptionStore.getState().storeKitActive).toBe(false);
  view.unmount();
});

it('returns unavailable without a purchase CTA when StoreKit is active but verification fails', async () => {
  const onDecision = jest.fn();
  mockedCurrentEntitlement.mockResolvedValue(storeKitEntitlement);
  mockedRefresh.mockRejectedValue(new Error('verification unavailable'));
  const view = render(
    <SubscriptionProvider>
      <GateProbe onDecision={onDecision} />
    </SubscriptionProvider>,
  );

  fireEvent.press(view.getByLabelText('request photo AI'));

  await waitFor(() => expect(onDecision).toHaveBeenCalledWith('unavailable'));
  expect(view.getByLabelText('Manage subscription')).toBeTruthy();
  expect(view.getByLabelText('Restore purchases')).toBeTruthy();
  expect(view.queryByLabelText('Subscribe for $4.99')).toBeNull();
});

it('keeps deleted service data distinct and never offers a repurchase from the Pro panel', async () => {
  useSubscriptionStore
    .getState()
    .setInactive('data_deleted_until_reset', '2099-08-13T00:00:00.000Z');
  useSubscriptionStore.getState().setStoreKitActive(true);
  const view = render(
    <SubscriptionProvider>
      <PaywallProbe />
    </SubscriptionProvider>,
  );

  fireEvent.press(view.getByLabelText('open Pro panel'));

  expect(await view.findByText('AI data was deleted')).toBeTruthy();
  expect(view.getByLabelText('Manage subscription')).toBeTruthy();
  expect(view.queryByLabelText('Subscribe for $4.99')).toBeNull();
});

it('labels a paid but data-deleted subscription as Pro and offers management instead of View Pro', async () => {
  mockedCurrentEntitlement.mockResolvedValue(storeKitEntitlement);
  useSubscriptionStore
    .getState()
    .setInactive('data_deleted_until_reset', '2099-08-13T00:00:00.000Z');
  useSubscriptionStore.getState().setStoreKitActive(true);
  const view = render(
    <SubscriptionProvider>
      <SubscriptionSettingsCard />
    </SubscriptionProvider>,
  );

  expect(view.getByText('PRO')).toBeTruthy();
  expect(view.getByLabelText('Manage subscription')).toBeTruthy();
  expect(view.queryByLabelText('View Pro')).toBeNull();
  await waitFor(() => expect(mockedRefresh).toHaveBeenCalled());
});

it('never offers Subscribe while StoreKit ownership is still being checked', async () => {
  let resolveEntitlement!: (value: typeof storeKitEntitlement | null) => void;
  mockedCurrentEntitlement.mockImplementation(
    () => new Promise((resolve) => { resolveEntitlement = resolve; }),
  );
  useSubscriptionStore.getState().setChecking();
  const view = render(
    <SubscriptionProvider>
      <PaywallProbe />
      <SubscriptionSettingsCard />
    </SubscriptionProvider>,
  );

  fireEvent.press(view.getByLabelText('open Pro panel'));

  expect(view.getByText('…')).toBeTruthy();
  expect(view.getAllByLabelText('Contacting the App Store…').length).toBeGreaterThan(0);
  expect(view.queryByLabelText('View Pro')).toBeNull();
  expect(view.queryByLabelText('Subscribe for $4.99')).toBeNull();
  await waitFor(() => expect(mockedCurrentEntitlement).toHaveBeenCalled());
  await act(async () => resolveEntitlement(null));
});

it('never offers Subscribe when StoreKit ownership verification failed', async () => {
  mockedCurrentEntitlement.mockRejectedValue(new Error('StoreKit unavailable'));
  useSubscriptionStore.getState().setError('worker_error');
  const view = render(
    <SubscriptionProvider>
      <PaywallProbe />
      <SubscriptionSettingsCard />
    </SubscriptionProvider>,
  );

  fireEvent.press(view.getByLabelText('open Pro panel'));

  expect(view.getByText('…')).toBeTruthy();
  expect(view.getByText('Pro verification is unavailable')).toBeTruthy();
  expect(view.getByLabelText('Manage subscription')).toBeTruthy();
  expect(view.queryByLabelText('View Pro')).toBeNull();
  expect(view.queryByLabelText('Subscribe for $4.99')).toBeNull();
  await waitFor(() => expect(mockedCurrentEntitlement).toHaveBeenCalled());
});

it('retries a transient StoreKit product-catalog failure when the paywall opens', async () => {
  mockedGetProduct
    .mockRejectedValueOnce(new Error('catalog temporarily unavailable'))
    .mockResolvedValueOnce({
      id: 'ai.daeseon.reploom.pro.monthly.v1',
      displayName: 'Reploom Pro',
      description: 'Pro AI',
      displayPrice: '$4.99',
      price: 4.99,
      currencyCode: 'USD',
      subscriptionPeriod: { unit: 'month', value: 1 },
    });
  const view = render(
    <SubscriptionProvider>
      <PaywallProbe />
    </SubscriptionProvider>,
  );

  await waitFor(() => expect(mockedGetProduct).toHaveBeenCalledTimes(1));
  fireEvent.press(view.getByLabelText('open Pro panel'));

  await waitFor(() => expect(mockedGetProduct).toHaveBeenCalledTimes(2));
  expect(await view.findByLabelText('Subscribe for $4.99')).toBeTruthy();
});

it('retries a transient StoreKit product-catalog failure on foreground activation', async () => {
  mockedGetProduct
    .mockRejectedValueOnce(new Error('catalog temporarily unavailable'))
    .mockResolvedValueOnce({
      id: 'ai.daeseon.reploom.pro.monthly.v1',
      displayName: 'Reploom Pro',
      description: 'Pro AI',
      displayPrice: '$4.99',
      price: 4.99,
      currencyCode: 'USD',
      subscriptionPeriod: { unit: 'month', value: 1 },
    });
  const view = render(
    <SubscriptionProvider>
      <Text>Child</Text>
    </SubscriptionProvider>,
  );

  await waitFor(() => expect(mockedGetProduct).toHaveBeenCalledTimes(1));
  act(() => onAppStateChange?.('active'));

  await waitFor(() => expect(mockedGetProduct).toHaveBeenCalledTimes(2));
  expect(useSubscriptionStore.getState().product?.displayPrice).toBe('$4.99');
  view.unmount();
});

it('settles the waiting AI action when the paywall is closed', async () => {
  const onDecision = jest.fn();
  const view = render(
    <SubscriptionProvider>
      <GateProbe onDecision={onDecision} />
    </SubscriptionProvider>,
  );

  fireEvent.press(view.getByLabelText('request photo AI'));
  await waitFor(() => expect(view.getAllByLabelText('Close').length).toBeGreaterThan(0));
  expect(view.getByText('Per use: workout text 1 · meal text 2 · voice workout 3–4 · meal photo 8 credits')).toBeTruthy();
  expect(view.getByText(/AI provider failures return included usage/u)).toBeTruthy();
  expect(view.getByText(/requires confirmation that you are 18 or older/u)).toBeTruthy();
  expect(onDecision).not.toHaveBeenCalled();

  fireEvent.press(view.getAllByLabelText('Close')[0]);
  await waitFor(() => expect(onDecision).toHaveBeenCalledWith('cancelled'));
});

it('does not contact StoreKit when remote AI consent is missing', async () => {
  useSettingsStore.getState().apply({ remoteAiConsent: null });
  const view = render(
    <SubscriptionProvider>
      <PaywallProbe />
    </SubscriptionProvider>,
  );

  fireEvent.press(view.getByLabelText('open Pro panel'));
  fireEvent.press(await view.findByLabelText('Subscribe for $4.99'));

  expect(mockedPurchase).not.toHaveBeenCalled();
  expect(await view.findByText(/Enable “18\+ and allow remote AI” in Settings before subscribing/u)).toBeTruthy();
});

it('keeps the initiating AI action pending while a purchased entitlement is verified', async () => {
  const onDecision = jest.fn();
  let resolveVerification!: (active: boolean) => void;
  mockedPurchase.mockResolvedValue({ status: 'purchased', entitlement: storeKitEntitlement });
  mockedRefresh.mockImplementation(async (_endpoint, entitlement) => {
    if (!entitlement) return false;
    return new Promise<boolean>((resolve) => { resolveVerification = resolve; });
  });
  const view = render(
    <SubscriptionProvider>
      <GateProbe onDecision={onDecision} />
    </SubscriptionProvider>,
  );

  fireEvent.press(view.getByLabelText('request photo AI'));
  fireEvent.press(await view.findByLabelText('Subscribe for $4.99'));
  await waitFor(() => expect(mockedPurchase).toHaveBeenCalledTimes(1));
  fireEvent.press(view.getAllByLabelText('Close')[0]);
  expect(onDecision).not.toHaveBeenCalled();

  act(() => resolveVerification(true));
  await waitFor(() => expect(onDecision).toHaveBeenCalledWith('allowed'));
  expect(onDecision).toHaveBeenCalledTimes(1);
});

it('settles as allowed after purchase verification so the original action can resume', async () => {
  const onDecision = jest.fn();
  const purchasedEntitlement = {
    productId: 'ai.daeseon.reploom.pro.monthly.v1',
    transactionId: '200000000000001',
    appAccountToken: '8f4cfa62-0d65-806e-8e88-b730ddad5c59',
  };
  mockedPurchase.mockResolvedValue({
    status: 'purchased',
    entitlement: purchasedEntitlement as Awaited<ReturnType<typeof purchasePro>> extends {
      status: 'purchased';
      entitlement: infer T;
    }
      ? T
      : never,
  });
  mockedRefresh.mockImplementation(async (_endpoint, entitlement) => entitlement != null);

  const view = render(
    <SubscriptionProvider>
      <GateProbe onDecision={onDecision} />
    </SubscriptionProvider>,
  );
  fireEvent.press(view.getByLabelText('request photo AI'));
  const subscribe = await view.findByLabelText('Subscribe for $4.99');
  fireEvent.press(subscribe);

  await waitFor(() => expect(onDecision).toHaveBeenCalledWith('allowed'));
});

it('deduplicates the native entitlement event emitted during and after purchase completion', async () => {
  const onDecision = jest.fn();
  mockedPurchase.mockImplementation(async () => {
    onEntitlementChange?.(storeKitEntitlement);
    return { status: 'purchased', entitlement: storeKitEntitlement };
  });
  mockedRefresh.mockImplementation(async (_endpoint, entitlement) => entitlement != null);

  const view = render(
    <SubscriptionProvider>
      <GateProbe onDecision={onDecision} />
    </SubscriptionProvider>,
  );
  await waitFor(() => expect(mockedRefresh).toHaveBeenCalledTimes(1));
  mockedRefresh.mockClear();

  fireEvent.press(view.getByLabelText('request photo AI'));
  const subscribe = await view.findByLabelText('Subscribe for $4.99');
  mockedRefresh.mockClear();
  fireEvent.press(subscribe);
  await waitFor(() => expect(onDecision).toHaveBeenCalledWith('allowed'));

  expect(mockedRefresh).toHaveBeenCalledTimes(1);
  expect(mockedRefresh).toHaveBeenCalledWith(expect.any(String), storeKitEntitlement);
  mockedHasFreshSession.mockReturnValue(true);
  act(() => onEntitlementChange?.(storeKitEntitlement));
  expect(mockedRefresh).toHaveBeenCalledTimes(1);
});

it('settles as unavailable and removes the purchase CTA when post-purchase verification fails', async () => {
  const onDecision = jest.fn();
  mockedPurchase.mockResolvedValue({ status: 'purchased', entitlement: storeKitEntitlement });
  mockedRefresh.mockImplementation(async (_endpoint, entitlement) => {
    if (entitlement) throw new Error('worker unavailable');
    return false;
  });
  const view = render(
    <SubscriptionProvider>
      <GateProbe onDecision={onDecision} />
    </SubscriptionProvider>,
  );

  fireEvent.press(view.getByLabelText('request photo AI'));
  fireEvent.press(await view.findByLabelText('Subscribe for $4.99'));

  await waitFor(() => expect(onDecision).toHaveBeenCalledWith('unavailable'));
  expect(view.getByLabelText('Manage subscription')).toBeTruthy();
  expect(view.queryByLabelText('Subscribe for $4.99')).toBeNull();
  expect(useSubscriptionStore.getState().storeKitActive).toBe(true);
});
