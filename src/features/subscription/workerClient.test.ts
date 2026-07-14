import { getCurrentProEntitlement, type StoreKitEntitlement } from './nativeStoreKit';
import { useSubscriptionStore } from './subscriptionStore';
import type { SubscriptionUsage } from './types';
import { REMOTE_AI_CONSENT_VERSION } from '@/lib/settings';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  ENTITLEMENT_REQUEST_TIMEOUT_MS,
  AiApiError,
  authorizedAiFetch,
  clearWorkerSession,
  deleteSubscriptionLedger,
  refreshWorkerSession,
} from './workerClient';

jest.mock('./nativeStoreKit', () => ({
  getCurrentProEntitlement: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '123e4567-e89b-42d3-a456-426614174000'),
}));

const mockedEntitlement = jest.mocked(getCurrentProEntitlement);
const endpoint = 'https://worker.example';
const usage: SubscriptionUsage = {
  creditsUsed: 12,
  creditsLimit: 1_000,
  creditsRemaining: 988,
  photosUsed: 2,
  photosLimit: 60,
  photosRemaining: 58,
  resetAt: '2099-08-13T00:00:00.000Z',
};
const entitlement: StoreKitEntitlement = {
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
};

function response(status: number, body: unknown, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: jest.fn(async () => body),
    clone: jest.fn(() => response(status, body, headers)),
  } as unknown as Response;
}

function sessionResponse(token: string): Response {
  return response(200, {
    token,
    expiresAt: '2099-01-01T00:10:00.000Z',
    entitlement: {
      productId: entitlement.productId,
      environment: 'sandbox',
      expiresAt: entitlement.expirationDate,
    },
    usage,
  });
}

beforeEach(() => {
  clearWorkerSession();
  useSubscriptionStore.getState().setStoreKitActive(false);
  useSubscriptionStore.getState().setProduct(null);
  mockedEntitlement.mockResolvedValue(entitlement);
  useSettingsStore.getState().apply({
    remoteAiConsent: { version: REMOTE_AI_CONSENT_VERSION, acceptedAt: '2026-07-13T00:00:00.000Z' },
  });
  jest.restoreAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('authorized AI Worker client', () => {
  it('exchanges only transaction identity, then attaches the short-lived session and a UUID request id', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(sessionResponse('session-token-aaaaaaaa'))
      .mockResolvedValueOnce(response(200, { sets: [], usage }));

    await expect(
      authorizedAiFetch(endpoint, '/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${endpoint}/entitlements/session`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          transactionId: entitlement.transactionId,
          appAccountToken: entitlement.appAccountToken,
        }),
      }),
    );
    const sessionHeaders = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(sessionHeaders.get('x-reploom-client')).toBe('ios-v1');
    expect(sessionHeaders.get('authorization')).toBeNull();

    const aiHeaders = new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers);
    expect(aiHeaders.get('authorization')).toBe('Bearer session-token-aaaaaaaa');
    expect(aiHeaders.get('x-reploom-client')).toBe('ios-v1');
    expect(aiHeaders.get('content-type')).toBe('application/json');
    expect(aiHeaders.get('x-reploom-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('refreshes once on 401 and reuses the request id for the single safe retry', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(sessionResponse('session-token-aaaaaaaa'))
      .mockResolvedValueOnce(response(401, { code: 'entitlement_session_expired' }))
      .mockResolvedValueOnce(sessionResponse('session-token-bbbbbbbb'))
      .mockResolvedValueOnce(response(200, { sets: [], usage }));

    await authorizedAiFetch(endpoint, '/parse', { method: 'POST', body: '{}' });

    const firstAiHeaders = new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers);
    const retriedAiHeaders = new Headers((fetchMock.mock.calls[3][1] as RequestInit).headers);
    expect(retriedAiHeaders.get('x-reploom-request-id')).toBe(firstAiHeaders.get('x-reploom-request-id'));
    expect(firstAiHeaders.get('authorization')).toBe('Bearer session-token-aaaaaaaa');
    expect(retriedAiHeaders.get('authorization')).toBe('Bearer session-token-bbbbbbbb');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('never reuses a fresh worker token after the local entitlement state becomes inactive', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(sessionResponse('session-token-before-removal'));
    await expect(refreshWorkerSession(endpoint)).resolves.toBe(true);
    useSubscriptionStore.getState().setInactive();
    fetchMock
      .mockResolvedValueOnce(sessionResponse('session-token-after-recheck'))
      .mockResolvedValueOnce(response(200, { sets: [], usage }));

    await authorizedAiFetch(endpoint, '/parse', { method: 'POST', body: '{}' });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const aiHeaders = new Headers((fetchMock.mock.calls[2][1] as RequestInit).headers);
    expect(aiHeaders.get('authorization')).toBe('Bearer session-token-after-recheck');
  });

  it('clears the paid StoreKit marker when a refresh finds no current entitlement', async () => {
    useSubscriptionStore.getState().setStoreKitActive(true);
    mockedEntitlement.mockResolvedValue(null);
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(refreshWorkerSession(endpoint)).resolves.toBe(false);

    expect(useSubscriptionStore.getState().storeKitActive).toBe(false);
    expect(useSubscriptionStore.getState().phase).toBe('inactive');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts entitlement exchange after the bounded network timeout', async () => {
    jest.useFakeTimers();
    try {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, init) => new Promise<Response>((_resolve, reject) => {
          (init?.signal as AbortSignal).addEventListener('abort', () => reject(new Error('aborted')));
        }),
      );
      const refresh = refreshWorkerSession(endpoint);
      const assertion = expect(refresh).rejects.toMatchObject({ code: 'network_error', status: 0 });
      await jest.advanceTimersByTimeAsync(ENTITLEMENT_REQUEST_TIMEOUT_MS);
      await assertion;
      expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
    } finally {
      jest.useRealTimers();
    }
  });

  it('accepts an entitlement exchange that completes just before the bounded deadline', async () => {
    jest.useFakeTimers();
    try {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(
        (_url, init) => new Promise<Response>((resolve) => {
          setTimeout(() => resolve(sessionResponse('session-near-deadline')), ENTITLEMENT_REQUEST_TIMEOUT_MS - 100);
          expect((init?.signal as AbortSignal).aborted).toBe(false);
        }),
      );
      const refresh = refreshWorkerSession(endpoint);
      await jest.advanceTimersByTimeAsync(ENTITLEMENT_REQUEST_TIMEOUT_MS - 100);

      await expect(refresh).resolves.toBe(true);
      expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('surfaces authoritative credit-limit errors with the latest usage snapshot', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(sessionResponse('session-token-aaaaaaaa'))
      .mockResolvedValueOnce(response(429, { code: 'monthly_credit_limit_reached', usage }));

    const request = authorizedAiFetch(endpoint, '/food', { method: 'POST', body: '{}' });
    await expect(request).rejects.toEqual(
      expect.objectContaining<Partial<AiApiError>>({
        code: 'monthly_credit_limit_reached',
        status: 429,
        usage,
      }),
    );
    expect(useSubscriptionStore.getState().usage).toEqual(usage);
  });

  it('updates visible remaining usage from successful AI response headers', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(sessionResponse('session-token-aaaaaaaa'))
      .mockResolvedValueOnce(
        response(
          200,
          { sets: [] },
          {
            'x-reploom-credits-remaining': '980',
            'x-reploom-photos-remaining': '57',
            'x-reploom-reset-at': usage.resetAt,
          },
        ),
      );

    await authorizedAiFetch(endpoint, '/parse', { method: 'POST', body: '{}' });
    await Promise.resolve();
    await Promise.resolve();
    expect(useSubscriptionStore.getState().usage).toMatchObject({
      creditsUsed: 20,
      creditsRemaining: 980,
      photosUsed: 3,
      photosRemaining: 57,
    });
  });

  it('fails closed before contacting the Worker when StoreKit has no appAccountToken', async () => {
    mockedEntitlement.mockResolvedValue({ ...entitlement, appAccountToken: null });
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(authorizedAiFetch(endpoint, '/parse', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      code: 'subscription_invalid',
      status: 403,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails at the transport boundary before entitlement exchange when remote AI consent is off', async () => {
    useSettingsStore.getState().apply({ remoteAiConsent: null });
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    await expect(authorizedAiFetch(endpoint, '/parse', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      code: 'remote_ai_consent_required',
      status: 403,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the anti-reset deletion tombstone and its exact unblock time', async () => {
    const resetAt = '2099-08-13T00:00:00.000Z';
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(403, { code: 'data_deleted_until_reset', resetAt }));

    await expect(authorizedAiFetch(endpoint, '/food', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      code: 'data_deleted_until_reset',
      status: 403,
      resetAt,
    });
    expect(useSubscriptionStore.getState().lastErrorCode).toBe('data_deleted_until_reset');
  });

  it('returns blockedUntil from service-data deletion and immediately discards the session', async () => {
    const blockedUntil = '2099-08-13T00:00:00.000Z';
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(sessionResponse('session-token-aaaaaaaa'))
      .mockResolvedValueOnce(response(200, { ok: true, blockedUntil }));

    await expect(deleteSubscriptionLedger(endpoint)).resolves.toBe(blockedUntil);
    expect(useSubscriptionStore.getState()).toMatchObject({
      phase: 'inactive',
      usage: null,
      blockedUntil,
      lastErrorCode: 'data_deleted_until_reset',
    });
  });

  it('does not let an older background refresh swallow a newly purchased transaction', async () => {
    let resolveBackground!: (value: StoreKitEntitlement | null) => void;
    mockedEntitlement.mockImplementationOnce(
      () => new Promise<StoreKitEntitlement | null>((resolve) => (resolveBackground = resolve)),
    );
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(sessionResponse('session-token-after-purchase'));

    const background = refreshWorkerSession(endpoint);
    const purchased = refreshWorkerSession(endpoint, entitlement);
    resolveBackground(null);

    await expect(background).resolves.toBe(false);
    await expect(purchased).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${endpoint}/entitlements/session`,
      expect.objectContaining({
        body: JSON.stringify({
          transactionId: entitlement.transactionId,
          appAccountToken: entitlement.appAccountToken,
        }),
      }),
    );
  });

  it('reuses a fresh Worker session for the same explicit StoreKit transaction', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(sessionResponse('session-token-same-transaction'));

    await expect(refreshWorkerSession(endpoint, entitlement)).resolves.toBe(true);
    await expect(refreshWorkerSession(endpoint, entitlement)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces an explicit entitlement with a background exchange for the same transaction', async () => {
    let resolveSession!: (value: Response) => void;
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveSession = resolve)),
    );

    const background = refreshWorkerSession(endpoint);
    await Promise.resolve();
    const explicit = refreshWorkerSession(endpoint, entitlement);
    resolveSession(sessionResponse('session-token-coalesced'));

    await expect(background).resolves.toBe(true);
    await expect(explicit).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('coalesces two identical explicit waiters after an older background refresh', async () => {
    let resolveBackground!: (value: StoreKitEntitlement | null) => void;
    let resolveSession!: (value: Response) => void;
    mockedEntitlement.mockImplementationOnce(
      () => new Promise<StoreKitEntitlement | null>((resolve) => (resolveBackground = resolve)),
    );
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveSession = resolve)),
    );

    const background = refreshWorkerSession(endpoint);
    const firstExplicit = refreshWorkerSession(endpoint, entitlement);
    const secondExplicit = refreshWorkerSession(endpoint, entitlement);
    resolveBackground(null);
    await expect(background).resolves.toBe(false);
    await Promise.resolve();
    resolveSession(sessionResponse('session-token-two-waiters'));

    await expect(firstExplicit).resolves.toBe(true);
    await expect(secondExplicit).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serializes a genuinely newer explicit StoreKit transaction after an older exchange', async () => {
    const renewedEntitlement: StoreKitEntitlement = {
      ...entitlement,
      transactionId: '200000000000002',
      purchaseDate: '2026-08-13T00:00:00.000Z',
      expirationDate: '2099-09-13T00:00:00.000Z',
    };
    let resolveFirst!: (value: Response) => void;
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(sessionResponse('session-token-renewed'));

    const older = refreshWorkerSession(endpoint, entitlement);
    const newer = refreshWorkerSession(endpoint, renewedEntitlement);
    resolveFirst(sessionResponse('session-token-older'));

    await expect(older).resolves.toBe(true);
    await expect(newer).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${endpoint}/entitlements/session`,
      expect.objectContaining({
        body: JSON.stringify({
          transactionId: renewedEntitlement.transactionId,
          appAccountToken: renewedEntitlement.appAccountToken,
        }),
      }),
    );
  });

  it('does not reactivate a session cleared while an entitlement exchange is in flight', async () => {
    let resolveSession!: (value: Response) => void;
    jest.spyOn(globalThis, 'fetch').mockImplementationOnce(
      () => new Promise<Response>((resolve) => (resolveSession = resolve)),
    );

    const staleRefresh = refreshWorkerSession(endpoint, entitlement);
    clearWorkerSession();
    resolveSession(sessionResponse('session-token-after-removal'));

    await expect(staleRefresh).resolves.toBe(false);
    expect(useSubscriptionStore.getState().phase).toBe('inactive');
  });

  it('does not let an older null StoreKit lookup clear a newer active session', async () => {
    let resolveLookup!: (value: StoreKitEntitlement | null) => void;
    mockedEntitlement.mockImplementationOnce(
      () => new Promise<StoreKitEntitlement | null>((resolve) => { resolveLookup = resolve; }),
    );
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(sessionResponse('session-token-newer'));

    const olderLookup = refreshWorkerSession(endpoint);
    clearWorkerSession();
    await expect(refreshWorkerSession(endpoint, entitlement)).resolves.toBe(true);
    resolveLookup(null);

    await expect(olderLookup).resolves.toBe(false);
    expect(useSubscriptionStore.getState().phase).toBe('active');
  });

  it('does not let an older rejected exchange clear a newer active session', async () => {
    let resolveOlder!: (value: Response) => void;
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { resolveOlder = resolve; }))
      .mockResolvedValueOnce(sessionResponse('session-token-after-newer-refresh'));

    const olderExchange = refreshWorkerSession(endpoint, entitlement);
    clearWorkerSession();
    await expect(refreshWorkerSession(endpoint, entitlement)).resolves.toBe(true);
    resolveOlder(response(403, { code: 'subscription_not_active' }));

    await expect(olderExchange).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useSubscriptionStore.getState().phase).toBe('active');
  });
});
