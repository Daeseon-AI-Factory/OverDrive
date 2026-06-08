// QuickLog parser — the shared brain for "just say/type it" logging. One free-text line (typed OR
// from on-device speech) → a structured set. Pure + on-device (no LLM, no server key): handles the
// common gym grammar ("벤치 100 5", "스쿼트 80kg 10개 rir 2", "풀업 12", "bench 100x5"). Messy natural
// language is Phase 2 (server LLM). The UI layer turns a ParsedSet into the unchanged logging hot path.

export type UnitSystem = 'metric' | 'imperial';
const LB_TO_KG = 0.45359237;

/** A catalog entry to match against: the exercise + every name/alias it can be called by. */
export interface ParseCandidate {
  id: string;
  name: string; // canonical display name (for echo-back)
  aliases: string[]; // localized names + nicknames (e.g. ['벤치프레스','벤치','bench press','bench'])
  isBodyweight: boolean;
}

export interface ParsedSet {
  exerciseId: string;
  exerciseName: string;
  weightKg: number; // canonical kg (0 for bodyweight / weightless)
  reps: number;
  rir: number | null;
}

export type ParseResult =
  | { ok: true; set: ParsedSet }
  | { ok: false; reason: 'empty' | 'no_exercise' | 'no_reps'; text: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

/** Parse one free-text entry into a set. `unitSystem` interprets bare weights with no explicit unit. */
export function parseEntry(raw: string, catalog: ParseCandidate[], unitSystem: UnitSystem = 'metric'): ParseResult {
  const text = (raw ?? '').trim();
  if (!text) return { ok: false, reason: 'empty', text: raw };

  // --- exercise match: longest alias contained in the normalized text wins ---
  const ntext = norm(text);
  let best: ParseCandidate | null = null;
  let bestLen = 0;
  let bestAlias = '';
  for (const c of catalog) {
    for (const alias of [c.name, ...c.aliases]) {
      const na = norm(alias);
      if (na.length < 2) continue;
      if (ntext.includes(na) && na.length > bestLen) {
        best = c;
        bestLen = na.length;
        bestAlias = alias;
      }
    }
  }
  if (!best) return { ok: false, reason: 'no_exercise', text: raw };

  const lower = text.toLowerCase();

  // RIR first, then strip it so it isn't re-read as weight/reps.
  let rir: number | null = null;
  const rirM = lower.match(/rir\s*(\d+)/);
  if (rirM) rir = Number(rirM[1]);
  // Strip the matched exercise name BEFORE reading numbers, so digits inside a name (e.g. the "2" in
  // "Zone 2 Run") are never mistaken for weight/reps.
  const body = lower.replace(/rir\s*\d+/, ' ').replace(bestAlias.toLowerCase(), ' ');

  // Explicit unit hints take priority over bare-number position.
  let weightKg: number | null = null;
  let weightNum: number | null = null; // the RAW number consumed as weight (pre-conversion), for reps exclusion
  let reps: number | null = null;
  const kgM = body.match(/(\d+(?:\.\d+)?)\s*(?:kg|킬로|키로|kilo)/);
  const lbM = body.match(/(\d+(?:\.\d+)?)\s*(?:lbs?|파운드|pound)/);
  const repM = body.match(/(\d+)\s*(?:개|회|reps?)/);
  if (kgM) {
    weightNum = Number(kgM[1]);
    weightKg = weightNum;
  } else if (lbM) {
    weightNum = Number(lbM[1]);
    weightKg = weightNum * LB_TO_KG;
  }
  if (repM) reps = Number(repM[1]);

  // Fill the rest from bare numbers, in order. Convention: "<name> <weight> <reps>".
  const nums = (body.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (weightKg == null && reps == null) {
    if (nums.length >= 2) {
      weightKg = nums[0];
      reps = nums[1];
    } else if (nums.length === 1) {
      reps = nums[0]; // a lone number is reps (bodyweight / "풀업 12")
      weightKg = 0;
    }
  } else if (reps == null) {
    reps = nums.find((n) => n !== weightNum) ?? null; // exclude the RAW weight number, not the converted kg
  } else if (weightKg == null) {
    weightKg = nums.find((n) => n !== reps) ?? null;
  }

  weightKg = weightKg ?? 0;
  // Bare weight (no kg/lb word) is in the user's display unit → convert imperial input to kg.
  if (!kgM && !lbM && weightKg > 0 && unitSystem === 'imperial') weightKg = weightKg * LB_TO_KG;
  if (best.isBodyweight && !kgM && !lbM && nums.length < 2) weightKg = 0;

  if (reps == null || reps <= 0) return { ok: false, reason: 'no_reps', text: raw };
  return {
    ok: true,
    set: { exerciseId: best.id, exerciseName: best.name, weightKg: Math.round(weightKg * 100) / 100, reps, rir },
  };
}
