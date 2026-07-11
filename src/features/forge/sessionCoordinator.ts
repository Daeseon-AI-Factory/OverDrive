export type SessionStartMode = 'explicit' | 'silent';

interface PendingStart {
  promise: Promise<string>;
  /** Any save-driven caller wins over ceremony so logging controls are never covered. */
  silentRequested: boolean;
}

let pendingStart: PendingStart | null = null;

/**
 * Process-wide start coordinator used by every useForge instance. The first caller owns the DB
 * work; later callers share its result. A concurrent silent request can still suppress ceremony
 * because the starter reads `shouldStartSilently()` only at the atomic store.start boundary.
 */
export function coordinateSessionStart(
  mode: SessionStartMode,
  getActiveSessionId: () => string | null,
  start: (shouldStartSilently: () => boolean) => Promise<string>,
): Promise<string> {
  const active = getActiveSessionId();
  if (active) return Promise.resolve(active);

  if (pendingStart) {
    if (mode === 'silent') pendingStart.silentRequested = true;
    return pendingStart.promise;
  }

  const request: PendingStart = {
    silentRequested: mode === 'silent',
    promise: Promise.resolve(''),
  };
  request.promise = (async () => {
    const existing = getActiveSessionId();
    if (existing) return existing;
    return start(() => request.silentRequested);
  })();
  pendingStart = request;
  void request.promise.then(
    () => {
      if (pendingStart === request) pendingStart = null;
    },
    () => {
      if (pendingStart === request) pendingStart = null;
    },
  );
  return request.promise;
}
