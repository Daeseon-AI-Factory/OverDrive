import type { ParseCandidate, ParsedSet, UnitSystem } from './parseEntry';

/**
 * Validate + normalize the proxy's (Gemini's) loose JSON into ParsedSet[]. Pure → unit-tested.
 * Drops rows whose exerciseId isn't in the real catalog (anti-hallucination) or with bad reps.
 */
export function normalizeAISets(data: unknown, validIds: Set<string>): ParsedSet[] {
  const sets = (data as { sets?: unknown })?.sets;
  if (!Array.isArray(sets)) return [];
  const out: ParsedSet[] = [];
  for (const raw of sets) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const exerciseId = String(s.exerciseId ?? '');
    const reps = Math.round(Number(s.reps));
    if (!validIds.has(exerciseId) || !Number.isFinite(reps) || reps <= 0) continue;
    const weightKg = Number(s.weightKg);
    out.push({
      exerciseId,
      exerciseName: String(s.exerciseName ?? exerciseId),
      weightKg: Number.isFinite(weightKg) && weightKg > 0 ? Math.round(weightKg * 100) / 100 : 0,
      reps,
      rir: s.rir == null ? null : Number.isFinite(Number(s.rir)) ? Number(s.rir) : null,
    });
  }
  return out;
}

/**
 * AI parse via the Cloudflare Worker proxy (Gemini, key server-side). Handles messy natural language
 * and multiple sets per line. Throws on network/HTTP error so the caller can fall back to the
 * on-device rule parser — logging must never depend on the network.
 */
export async function parseEntryAI(
  text: string,
  candidates: ParseCandidate[],
  unitSystem: UnitSystem,
  endpoint: string,
  signal?: AbortSignal,
): Promise<ParsedSet[]> {
  const exercises = candidates.map((c) => ({ id: c.id, names: [c.name, ...c.aliases].filter(Boolean) }));
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, unitSystem, exercises }),
    signal,
  });
  if (!res.ok) throw new Error(`quicklog proxy ${res.status}`);
  const data = await res.json();
  return normalizeAISets(data, new Set(candidates.map((c) => c.id)));
}
