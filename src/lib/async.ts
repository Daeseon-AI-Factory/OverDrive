/**
 * Reject if `p` doesn't settle within `ms`. The underlying work may keep running, but the caller
 * stops waiting. Used to bound network uploads: `expo-file-system` `uploadAsync` exposes no
 * AbortSignal, so without this a slow/stuck server would hang the spinner forever (meal photos).
 * The caller's existing try/catch turns the rejection into a graceful failure (e.g. fall back to typing).
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label = 'request'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
