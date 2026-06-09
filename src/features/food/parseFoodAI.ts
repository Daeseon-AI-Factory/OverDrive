import type { FoodItemInput } from '@/db/repos/foodRepo';

/** Pure: validate + normalize the proxy's loose food JSON. Drops empty/garbage rows. Unit-tested. */
export function normalizeFoodItems(data: unknown): FoodItemInput[] {
  const items = (data as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: FoodItemInput[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = String(r.name ?? '').trim();
    const kcal = Number(r.kcal);
    const proteinG = Number(r.proteinG);
    if (!name) continue;
    if (!Number.isFinite(kcal) && !Number.isFinite(proteinG)) continue;
    out.push({
      name,
      kcal: Number.isFinite(kcal) ? Math.max(0, Math.round(kcal)) : 0,
      proteinG: Number.isFinite(proteinG) ? Math.max(0, Math.round(proteinG)) : 0,
    });
  }
  return out;
}

/** Meal description text → estimated items, via the Worker proxy (Groq; key server-side). */
export async function parseFoodText(text: string, endpoint: string, signal?: AbortSignal): Promise<FoodItemInput[]> {
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/food`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok) throw new Error(`food proxy ${res.status}`);
  return normalizeFoodItems(await res.json());
}
