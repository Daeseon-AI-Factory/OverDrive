import type { ParseCandidate, ParsedSet, UnitSystem } from './parseEntry';
import { authorizedAiFetch } from '@/features/subscription/workerClient';

/**
 * Validate + normalize the proxy's (LLM's) loose JSON into ParsedSet[]. Pure → unit-tested.
 * exerciseId may be '' (an explicit name-only proposal not in the catalog), but every persisted
 * scalar is bounded to the same contract as the native logger before a durable write is possible.
 */
export function normalizeAISets(data: unknown): ParsedSet[] {
  const sets = (data as { sets?: unknown })?.sets;
  if (!Array.isArray(sets)) return [];
  const out: ParsedSet[] = [];
  for (const raw of sets) {
    if (!raw || typeof raw !== 'object') continue;
    const s = raw as Record<string, unknown>;
    const reps = Number(s.reps);
    if (!Number.isInteger(reps) || reps < 1 || reps > 999) continue;
    const exerciseId = typeof s.exerciseId === 'string' ? s.exerciseId.trim() : '';
    if (exerciseId && ([...exerciseId].length > 64 || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(exerciseId))) {
      continue;
    }
    const exerciseName = typeof s.exerciseName === 'string' ? s.exerciseName.trim() : '';
    if ([...exerciseName].length > 60 || /[\u0000-\u001f\u007f]/.test(exerciseName)) continue;
    if (!exerciseId && !exerciseName) continue; // nothing to identify the exercise
    const weightValue = s.weightKg == null || s.weightKg === '' ? 0 : Number(s.weightKg);
    if (!Number.isFinite(weightValue) || weightValue < 0 || weightValue > 2000) continue;
    const rirValue = s.rir == null ? null : Number(s.rir);
    const rir = rirValue != null && Number.isInteger(rirValue) && rirValue >= 0 && rirValue <= 4
      ? rirValue
      : null;
    out.push({
      exerciseId,
      exerciseName: exerciseName || exerciseId,
      weightKg: Math.round(weightValue * 100) / 100,
      reps,
      rir,
      isBodyweight: s.isBodyweight === true ? true : s.isBodyweight === false ? false : undefined,
    });
    if (out.length === 30) break;
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
  const safeCandidates = candidates
    .filter((candidate): candidate is ParseCandidate & { catalogId: string } => Boolean(candidate.catalogId))
    .slice(0, 64);
  const exercises = safeCandidates.map((candidate) => ({
    id: candidate.catalogId,
    names: [candidate.name, ...candidate.aliases]
      .filter((name) => name.length > 0 && [...name].length <= 60)
      .slice(0, 4),
  }));
  const res = await authorizedAiFetch(endpoint, '/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, unitSystem, exercises }),
    signal,
  });
  const data = await res.json();
  const localIdByCatalogId = new Map(safeCandidates.map((candidate) => [candidate.catalogId, candidate.id]));
  return normalizeAISets(data).flatMap((set) => {
    if (!set.exerciseId) return [set]; // explicit name-only proposal; caller may create ad-hoc
    const localId = localIdByCatalogId.get(set.exerciseId);
    return localId ? [{ ...set, exerciseId: localId }] : [];
  });
}
