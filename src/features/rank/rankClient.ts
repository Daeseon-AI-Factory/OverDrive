import { REPLOOM_CLIENT_HEADERS } from '@/features/quicklog/config';

/** Delete a legacy TestFlight ranking row. Public ranking itself is not shipped in v1. */
export async function deleteLegacyRank(endpoint: string, deviceId: string, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/rank/delete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...REPLOOM_CLIENT_HEADERS },
    body: JSON.stringify({ deviceId }),
    signal,
  });
  if (!res.ok) throw new Error(`rank delete ${res.status}`);
}
