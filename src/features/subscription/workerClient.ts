import * as Crypto from 'expo-crypto';
import { REPLOOM_CLIENT_HEADERS } from '@/features/quicklog/config';
import { hasCurrentRemoteAiConsent } from '@/lib/settings';
import { useSettingsStore } from '@/stores/settingsStore';
import { getCurrentProEntitlement, type StoreKitEntitlement } from './nativeStoreKit';
import { useSubscriptionStore } from './subscriptionStore';
import {
  isSubscriptionUsage,
  PRO_PRODUCT_ID,
  type ServerEntitlementSummary,
  type SubscriptionUsage,
} from './types';

export const ENTITLEMENT_PATHS = {
  session: '/entitlements/session',
  usage: '/entitlements/usage',
  delete: '/entitlements/delete',
} as const;
// The Worker may make bounded Production then Sandbox Apple calls sequentially. Keep enough margin
// for both server deadlines plus D1 and the device↔Worker round trip.
export const ENTITLEMENT_REQUEST_TIMEOUT_MS = 15_000;

export type AiApiErrorCode =
  | 'entitlement_session_required'
  | 'entitlement_session_invalid'
  | 'entitlement_session_expired'
  | 'subscription_not_active'
  | 'subscription_invalid'
  | 'data_deleted_until_reset'
  | 'monthly_credit_limit_reached'
  | 'monthly_photo_limit_reached'
  | 'monthly_provider_attempt_limit_reached'
  | 'monthly_photo_attempt_limit_reached'
  | 'sandbox_daily_provider_attempt_limit_reached'
  | 'sandbox_daily_photo_attempt_limit_reached'
  | 'request_in_progress'
  | 'request_already_completed'
  | 'request_previously_failed'
  | 'invalid_request_id'
  | 'storekit_unavailable'
  | 'remote_ai_consent_required'
  | 'network_error'
  | 'worker_error';

export class AiApiError extends Error {
  constructor(
    public readonly code: AiApiErrorCode,
    public readonly status: number,
    public readonly usage: SubscriptionUsage | null = null,
    public readonly resetAt: string | null = null,
  ) {
    super(code);
    this.name = 'AiApiError';
  }
}

interface WorkerSession {
  token: string;
  expiresAt: string;
  transactionId: string;
}

interface SessionPayload {
  token?: unknown;
  expiresAt?: unknown;
  entitlement?: unknown;
  usage?: unknown;
}

let workerSession: WorkerSession | null = null;
interface SessionRefresh {
  task: Promise<boolean>;
  /** Null means the task is still resolving StoreKit's current entitlement. */
  transactionId: string | null;
}

let sessionRefresh: SessionRefresh | null = null;
let sessionGeneration = 0;

function workerUrl(endpoint: string, path: string): string {
  return `${endpoint.replace(/\/$/, '')}${path}`;
}

async function entitlementFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENTITLEMENT_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    throw new AiApiError('network_error', 0);
  } finally {
    clearTimeout(timeout);
  }
}

function requireRemoteAiConsent(): void {
  if (!hasCurrentRemoteAiConsent(useSettingsStore.getState().remoteAiConsent)) {
    throw new AiApiError('remote_ai_consent_required', 403);
  }
}

function sessionIsFresh(): boolean {
  if (!workerSession) return false;
  const expiresAt = Date.parse(workerSession.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt - Date.now() > 15_000;
}

function sessionIsFreshForTransaction(transactionId: string): boolean {
  return (
    sessionIsFresh()
    && workerSession?.transactionId === transactionId
    && useSubscriptionStore.getState().phase === 'active'
  );
}

function responseCode(value: unknown): AiApiErrorCode {
  const code =
    value != null && typeof value === 'object' && typeof (value as { code?: unknown }).code === 'string'
      ? (value as { code: string }).code
      : 'worker_error';
  const known: readonly AiApiErrorCode[] = [
    'entitlement_session_required',
    'entitlement_session_invalid',
    'entitlement_session_expired',
    'subscription_not_active',
    'subscription_invalid',
    'data_deleted_until_reset',
    'monthly_credit_limit_reached',
    'monthly_photo_limit_reached',
    'monthly_provider_attempt_limit_reached',
    'monthly_photo_attempt_limit_reached',
    'sandbox_daily_provider_attempt_limit_reached',
    'sandbox_daily_photo_attempt_limit_reached',
    'request_in_progress',
    'request_already_completed',
    'request_previously_failed',
    'invalid_request_id',
  ];
  return known.includes(code as AiApiErrorCode) ? (code as AiApiErrorCode) : 'worker_error';
}

function usageFrom(value: unknown): SubscriptionUsage | null {
  if (isSubscriptionUsage(value)) return value;
  if (value != null && typeof value === 'object' && isSubscriptionUsage((value as { usage?: unknown }).usage)) {
    return (value as { usage: SubscriptionUsage }).usage;
  }
  return null;
}

function resetAtFrom(value: unknown): string | null {
  if (value == null || typeof value !== 'object') return null;
  const resetAt = (value as { resetAt?: unknown }).resetAt;
  return typeof resetAt === 'string' && !Number.isNaN(Date.parse(resetAt)) ? resetAt : null;
}

function usageFromHeaders(
  headers: Headers | Record<string, string> | null | undefined,
): SubscriptionUsage | null {
  const current = useSubscriptionStore.getState().usage;
  if (!headers || !current) return null;
  const get = (name: string): string | null => {
    if (typeof (headers as Headers).get === 'function') return (headers as Headers).get(name);
    const record = headers as Record<string, string>;
    const key = Object.keys(record).find((candidate) => candidate.toLowerCase() === name);
    return key ? record[key] : null;
  };
  const creditsRaw = get('x-reploom-credits-remaining');
  const photosRaw = get('x-reploom-photos-remaining');
  const creditsRemaining = Number(creditsRaw);
  const photosRemaining = Number(photosRaw);
  const resetAt = get('x-reploom-reset-at');
  if (
    creditsRaw == null ||
    photosRaw == null ||
    !Number.isFinite(creditsRemaining) ||
    !Number.isFinite(photosRemaining) ||
    !resetAt ||
    Number.isNaN(Date.parse(resetAt))
  ) {
    return null;
  }
  const nextCredits = Math.max(0, Math.min(current.creditsLimit, Math.trunc(creditsRemaining)));
  const nextPhotos = Math.max(0, Math.min(current.photosLimit, Math.trunc(photosRemaining)));
  return {
    ...current,
    creditsUsed: current.creditsLimit - nextCredits,
    creditsRemaining: nextCredits,
    photosUsed: current.photosLimit - nextPhotos,
    photosRemaining: nextPhotos,
    resetAt,
  };
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function validEntitlementSummary(value: unknown): ServerEntitlementSummary | null {
  if (value == null || typeof value !== 'object') return null;
  const e = value as Partial<ServerEntitlementSummary>;
  if (
    e.productId !== PRO_PRODUCT_ID ||
    typeof e.environment !== 'string' ||
    typeof e.expiresAt !== 'string' ||
    Number.isNaN(Date.parse(e.expiresAt))
  ) {
    return null;
  }
  return { productId: e.productId, environment: e.environment, expiresAt: e.expiresAt };
}

async function exchangeTransaction(
  endpoint: string,
  entitlement: StoreKitEntitlement,
  generation: number,
): Promise<boolean> {
  if (generation !== sessionGeneration) return false;
  if (!entitlement.appAccountToken) {
    workerSession = null;
    useSubscriptionStore.getState().setInactive('subscription_invalid');
    throw new AiApiError('subscription_invalid', 403);
  }
  let response: Response;
  try {
    response = await entitlementFetch(workerUrl(endpoint, ENTITLEMENT_PATHS.session), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...REPLOOM_CLIENT_HEADERS },
      body: JSON.stringify({
        transactionId: entitlement.transactionId,
        appAccountToken: entitlement.appAccountToken,
      }),
    });
  } catch {
    if (generation !== sessionGeneration) return false;
    throw new AiApiError('network_error', 0);
  }
  const payload = (await responseJson(response)) as SessionPayload | null;
  if (generation !== sessionGeneration) return false;
  if (!response.ok) {
    const code = responseCode(payload);
    const resetAt = resetAtFrom(payload);
    if (response.status === 401 || response.status === 403) {
      workerSession = null;
      useSubscriptionStore.getState().setInactive(code, resetAt);
    }
    throw new AiApiError(code, response.status, usageFrom(payload), resetAt);
  }
  const entitlementSummary = validEntitlementSummary(payload?.entitlement);
  const usage = usageFrom(payload?.usage);
  if (
    typeof payload?.token !== 'string' ||
    payload.token.length < 16 ||
    typeof payload.expiresAt !== 'string' ||
    Number.isNaN(Date.parse(payload.expiresAt)) ||
    !entitlementSummary ||
    !usage
  ) {
    throw new AiApiError('worker_error', response.status);
  }
  // StoreKit may have reported revocation/removal while the Apple/Worker exchange was in flight.
  // Never let that stale response reactivate a locally cleared entitlement.
  if (generation !== sessionGeneration) return false;
  workerSession = {
    token: payload.token,
    expiresAt: payload.expiresAt,
    transactionId: entitlement.transactionId,
  };
  useSubscriptionStore.getState().setActive(entitlementSummary, usage);
  return true;
}

export function clearWorkerSession(next: 'inactive' | 'checking' = 'inactive'): void {
  sessionGeneration += 1;
  workerSession = null;
  sessionRefresh = null;
  if (next === 'checking') useSubscriptionStore.getState().setChecking();
  else useSubscriptionStore.getState().setInactive();
}

export function hasFreshWorkerSession(): boolean {
  return sessionIsFresh() && useSubscriptionStore.getState().phase === 'active';
}

export async function refreshWorkerSession(
  endpoint: string,
  entitlementOverride?: StoreKitEntitlement | null,
): Promise<boolean> {
  if (
    entitlementOverride
    && sessionIsFreshForTransaction(entitlementOverride.transactionId)
  ) {
    return true;
  }
  while (sessionRefresh) {
    if (entitlementOverride === undefined) return sessionRefresh.task;
    if (
      entitlementOverride
      && sessionRefresh.transactionId === entitlementOverride.transactionId
    ) {
      return sessionRefresh.task;
    }
    // A purchase/restore result is newer evidence than a background current-entitlement refresh.
    // Let the older exchange finish, then reuse it only if it verified this same transaction.
    // A genuinely newer transaction still gets its own serialized exchange.
    const prior = sessionRefresh;
    await prior.task.catch(() => false);
    if (sessionRefresh === prior) sessionRefresh = null;
    if (
      entitlementOverride
      && sessionIsFreshForTransaction(entitlementOverride.transactionId)
    ) {
      return true;
    }
    // Another explicit waiter may have installed its serialized exchange while this caller was
    // resuming. Loop so an identical transaction shares it and a newer one waits behind it.
  }
  const task = (async () => {
    const generation = sessionGeneration;
    useSubscriptionStore.getState().setChecking();
    const entitlement = entitlementOverride === undefined ? await getCurrentProEntitlement() : entitlementOverride;
    if (generation !== sessionGeneration) return false;
    if (!entitlement || entitlement.productId !== PRO_PRODUCT_ID || entitlement.revocationDate != null) {
      useSubscriptionStore.getState().setStoreKitActive(false);
      clearWorkerSession();
      return false;
    }
    return exchangeTransaction(endpoint, entitlement, generation);
  })();
  const refresh: SessionRefresh = {
    task,
    transactionId: entitlementOverride?.transactionId ?? null,
  };
  sessionRefresh = refresh;
  try {
    return await task;
  } finally {
    if (sessionRefresh === refresh) sessionRefresh = null;
  }
}

async function requireSession(endpoint: string, forceRefresh = false): Promise<WorkerSession> {
  if (
    !forceRefresh
    && sessionIsFresh()
    && workerSession
    && useSubscriptionStore.getState().phase === 'active'
  ) {
    return workerSession;
  }
  const active = await refreshWorkerSession(endpoint);
  if (!active || !workerSession) throw new AiApiError('entitlement_session_required', 401);
  return workerSession;
}

function authorizedHeaders(session: WorkerSession, requestId?: string): Headers {
  const headers = new Headers(REPLOOM_CLIENT_HEADERS);
  headers.set('authorization', `Bearer ${session.token}`);
  if (requestId) headers.set('x-reploom-request-id', requestId);
  return headers;
}

function mergeHeaders(base: Headers, added?: HeadersInit): Headers {
  const merged = new Headers(added);
  base.forEach((value, key) => merged.set(key, value));
  return merged;
}

async function errorForResponse(response: Response): Promise<AiApiError> {
  const payload = await responseJson(response);
  const usage = usageFrom(payload);
  if (usage) useSubscriptionStore.getState().setUsage(usage);
  return new AiApiError(responseCode(payload), response.status, usage, resetAtFrom(payload));
}

async function observeSuccessfulResponse(response: Response, endpoint: string): Promise<void> {
  const payload = await responseJson(response.clone());
  const usage = usageFrom(payload);
  if (usage) {
    useSubscriptionStore.getState().setUsage(usage);
    return;
  }
  const headerUsage = usageFromHeaders(response.headers);
  if (headerUsage) {
    useSubscriptionStore.getState().setUsage(headerUsage);
    return;
  }
  // Existing AI response shapes stay untouched. Usage display refreshes after the durable response,
  // and a failure here never changes the user's AI result.
  void refreshSubscriptionUsage(endpoint).catch(() => {});
}

/** Authorized JSON/Fetch path for all AI routes. A 401 gets exactly one fresh session + retry. */
export async function authorizedAiFetch(
  endpoint: string,
  path: '/parse' | '/food',
  init: RequestInit,
): Promise<Response> {
  // Privacy guard at the transport boundary. UI checks this first for good UX, but a future caller
  // still cannot exchange entitlement or upload selected content after consent is withdrawn.
  requireRemoteAiConsent();
  const requestId = Crypto.randomUUID();
  const run = async (forceRefresh: boolean) => {
    const session = await requireSession(endpoint, forceRefresh);
    return fetch(workerUrl(endpoint, path), {
      ...init,
      headers: mergeHeaders(authorizedHeaders(session, requestId), init.headers),
    });
  };
  let response: Response;
  try {
    response = await run(false);
    if (response.status === 401) response = await run(true);
  } catch (error) {
    if (error instanceof AiApiError) throw error;
    throw new AiApiError('network_error', 0);
  }
  if (!response.ok) throw await errorForResponse(response);
  void observeSuccessfulResponse(response, endpoint).catch(() => {});
  return response;
}

export interface NativeUploadResponse {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

/** Native multipart counterpart to authorizedAiFetch; recreates the upload task once after 401. */
export async function authorizedAiUpload<T extends NativeUploadResponse>(
  endpoint: string,
  upload: (headers: Record<string, string>) => Promise<T>,
): Promise<T> {
  requireRemoteAiConsent();
  const requestId = Crypto.randomUUID();
  const run = async (forceRefresh: boolean) => {
    const session = await requireSession(endpoint, forceRefresh);
    const headers: Record<string, string> = {
      ...REPLOOM_CLIENT_HEADERS,
      authorization: `Bearer ${session.token}`,
      'x-reploom-request-id': requestId,
    };
    return upload(headers);
  };
  let response: T;
  try {
    response = await run(false);
    if (response.status === 401) response = await run(true);
  } catch (error) {
    if (error instanceof AiApiError) throw error;
    throw error;
  }
  if (response.status < 200 || response.status >= 300) {
    let payload: unknown = null;
    try {
      payload = JSON.parse(response.body);
    } catch {
      // Non-JSON provider/proxy failure is still surfaced as worker_error.
    }
    const usage = usageFrom(payload);
    if (usage) useSubscriptionStore.getState().setUsage(usage);
    throw new AiApiError(responseCode(payload), response.status, usage, resetAtFrom(payload));
  }
  let successPayload: unknown = null;
  try {
    successPayload = JSON.parse(response.body || 'null');
  } catch {
    // Successful provider responses are expected to be JSON, but usage refresh must stay cosmetic.
  }
  const usage = usageFrom(successPayload) ?? usageFromHeaders(response.headers);
  if (usage) useSubscriptionStore.getState().setUsage(usage);
  else void refreshSubscriptionUsage(endpoint).catch(() => {});
  return response;
}

export async function refreshSubscriptionUsage(endpoint: string): Promise<SubscriptionUsage> {
  const run = async (forceRefresh: boolean) => {
    const session = await requireSession(endpoint, forceRefresh);
    return entitlementFetch(workerUrl(endpoint, ENTITLEMENT_PATHS.usage), {
      headers: authorizedHeaders(session),
    });
  };
  let response = await run(false);
  if (response.status === 401) response = await run(true);
  if (!response.ok) throw await errorForResponse(response);
  const payload = await responseJson(response);
  const usage = usageFrom(payload);
  if (!usage) throw new AiApiError('worker_error', response.status);
  useSubscriptionStore.getState().setUsage(usage);
  return usage;
}

export async function deleteSubscriptionLedger(endpoint: string): Promise<string> {
  const run = async (forceRefresh: boolean) => {
    const session = await requireSession(endpoint, forceRefresh);
    return entitlementFetch(workerUrl(endpoint, ENTITLEMENT_PATHS.delete), {
      method: 'POST',
      headers: authorizedHeaders(session),
    });
  };
  let response = await run(false);
  if (response.status === 401) response = await run(true);
  if (!response.ok) throw await errorForResponse(response);
  const payload = await responseJson(response);
  const blockedUntil =
    payload != null &&
    typeof payload === 'object' &&
    typeof (payload as { blockedUntil?: unknown }).blockedUntil === 'string' &&
    !Number.isNaN(Date.parse((payload as { blockedUntil: string }).blockedUntil))
      ? (payload as { blockedUntil: string }).blockedUntil
      : null;
  if (!blockedUntil) throw new AiApiError('worker_error', response.status);
  workerSession = null;
  useSubscriptionStore.getState().setInactive('data_deleted_until_reset', blockedUntil);
  return blockedUntil;
}

export function isQuotaError(error: unknown): error is AiApiError {
  return (
    error instanceof AiApiError &&
    (error.code === 'monthly_credit_limit_reached' || error.code === 'monthly_photo_limit_reached')
  );
}

export function isAttemptLimitError(error: unknown): error is AiApiError {
  return (
    error instanceof AiApiError &&
    (error.code === 'monthly_provider_attempt_limit_reached' ||
      error.code === 'monthly_photo_attempt_limit_reached' ||
      error.code === 'sandbox_daily_provider_attempt_limit_reached' ||
      error.code === 'sandbox_daily_photo_attempt_limit_reached')
  );
}

export function isSubscriptionRequiredError(error: unknown): error is AiApiError {
  return (
    error instanceof AiApiError &&
    (error.code.startsWith('entitlement_session_') ||
      error.code === 'subscription_not_active' ||
      error.code === 'subscription_invalid')
  );
}

export function isRemoteAiConsentError(error: unknown): error is AiApiError {
  return error instanceof AiApiError && error.code === 'remote_ai_consent_required';
}
