// Leaderboard client for the Worker's D1-backed /rank endpoints. STRICTLY opt-in: nothing is ever
// sent without a user-chosen handle (privacy default). Scores are the for-fun Combat Power + weekly
// gain only — no health raw data leaves the device. Phase 4 adds trust-tiering/verification.

export interface RankEntry {
  handle: string;
  cp: number;
  weekGain: number;
  gradeKey: string;
  crew: string | null;
  isMe: number; // 0/1
}

export interface RankBoard {
  entries: RankEntry[];
  myRank: number | null;
}

export type RankSort = 'weekGain' | 'cp';

export async function submitRank(
  endpoint: string,
  body: {
    deviceId: string;
    handle: string;
    cp: number;
    weekGain: number;
    gradeKey: string;
    crew?: string | null;
    region?: string | null;
  },
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/rank/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`rank submit ${res.status}`);
}

export async function fetchBoard(
  endpoint: string,
  body: { deviceId: string; sort: RankSort; crew?: string | null },
  signal?: AbortSignal,
): Promise<RankBoard> {
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/rank/board`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`rank board ${res.status}`);
  const data = (await res.json()) as Partial<RankBoard>;
  return { entries: Array.isArray(data.entries) ? data.entries : [], myRank: data.myRank ?? null };
}
