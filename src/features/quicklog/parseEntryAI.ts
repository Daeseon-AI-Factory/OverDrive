import type { ParseCandidate, ParsedSet, UnitSystem } from './parseEntry';
import { authorizedAiFetch } from '@/features/subscription/workerClient';

/**
 * Validate + normalize the proxy's (LLM's) loose JSON into ParsedSet[]. Pure → unit-tested.
 * Keeps every set with positive reps. exerciseId may be '' (exercise not in the catalog) — the
 * caller resolves/creates it. Drops only rows that identify nothing or have bad reps.
 */
export function normalizeAISets(data: unknown): ParsedSet[] {
  const sets = (data as { sets?: unknown })?.sets;
  if (!Array.isArray(sets)) return [];
  const out: ParsedSet[] = [];
  for (const raw of sets) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const reps = Math.round(Number(s.reps));
    if (!Number.isFinite(reps) || reps <= 0) continue;
    const exerciseId = String(s.exerciseId ?? '').trim();
    const exerciseName = String(s.exerciseName ?? '').trim();
    if (!exerciseId && !exerciseName) continue; // nothing to identify the exercise
    const weightKg = Number(s.weightKg);
    out.push({
      exerciseId,
      exerciseName: exerciseName || exerciseId,
      weightKg: Number.isFinite(weightKg) && weightKg > 0 ? Math.round(weightKg * 100) / 100 : 0,
      reps,
      rir: s.rir == null ? null : Number.isFinite(Number(s.rir)) ? Number(s.rir) : null,
      isBodyweight: s.isBodyweight === true ? true : s.isBodyweight === false ? false : undefined,
    });
  }
  return out;
}

/**
 * AI parse via the Cloudflare Worker proxy (provider key server-side). Handles messy natural language
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
  const res = await authorizedAiFetch(endpoint, '/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, unitSystem, exercises }),
    signal,
  });
  const data = await res.json();
  return normalizeAISets(data);
}
