import { EXERCISE_SEED } from '@/db/seed';
import type { DayType } from '@/db/types';
import type { ProgramDayConfig, ProgramSlot, WeeklyProgram } from './types';

// "Lazy mode" plan generator: 3 taps (goal · days/week · equipment) → a full week, no slot editor.
// Pure + unit-tested. Output is a WeeklyProgram (settings.customProgram) the rest of the app already
// consumes (ActiveWorkout, forge, resolve).

export type PlanGoal = 'muscle' | 'strength' | 'lean';
export type PlanEquipment = 'gym' | 'bodyweight';

const PUSH = ['chest', 'shoulders', 'triceps'];
const PULL = ['back', 'biceps'];
const LEGS = ['quads', 'hamstrings', 'posterior_chain', 'calves'];

// Compounds first so a generated day leads with the big lifts.
const COMPOUND_FIRST = [
  'barbell_back_squat', 'deadlift', 'barbell_bench_press', 'overhead_press', 'pull_up', 'barbell_row',
  'romanian_deadlift', 'dips', 'leg_press', 'incline_db_press', 'lat_pulldown', 'bulgarian_split_squat',
];
const CARDIO_PICK = ['hiit_intervals', 'zone2_run', 'rowing', 'cycling', 'jump_rope'];

interface DaySpec {
  label: string;
  dayType: DayType;
  groups: string[]; // muscle_group buckets to pull from
  count: number;
}

const FULL: DaySpec = { label: 'Full Body', dayType: 'upper', groups: [...PUSH, ...PULL, ...LEGS, 'core'], count: 5 };
const DPUSH: DaySpec = { label: 'Push', dayType: 'upper', groups: PUSH, count: 5 };
const DPULL: DaySpec = { label: 'Pull', dayType: 'upper', groups: [...PULL, 'core'], count: 5 };
const DLEGS: DaySpec = { label: 'Legs', dayType: 'lower', groups: [...LEGS, 'core'], count: 5 };
const DUPPER: DaySpec = { label: 'Upper', dayType: 'upper', groups: [...PUSH, ...PULL], count: 6 };
const DLOWER: DaySpec = { label: 'Lower', dayType: 'lower', groups: [...LEGS, 'core'], count: 5 };

// Training-day structure by frequency.
function splitFor(days: number): DaySpec[] {
  switch (Math.max(2, Math.min(6, days))) {
    case 2: return [FULL, FULL];
    case 3: return [DPUSH, DPULL, DLEGS];
    case 4: return [DUPPER, DLOWER, DUPPER, DLOWER];
    case 5: return [DPUSH, DPULL, DLEGS, DUPPER, DLOWER];
    default: return [DPUSH, DPULL, DLEGS, DPUSH, DPULL, DLEGS]; // 6
  }
}

// Which weekdays (0=Sun..6=Sat) the training days land on — spread across the week.
function weekdaysFor(days: number): number[] {
  switch (Math.max(2, Math.min(6, days))) {
    case 2: return [1, 4];
    case 3: return [1, 3, 5];
    case 4: return [1, 2, 4, 5];
    case 5: return [1, 2, 3, 5, 6];
    default: return [1, 2, 3, 4, 5, 6];
  }
}

// Goal → sets/rep range for a strength slot.
function targets(goal: PlanGoal, repLow: number, repHigh: number): { targetSets: number; repLow: number; repHigh: number } {
  if (goal === 'strength') return { targetSets: 5, repLow: Math.max(3, Math.min(repLow, 5)), repHigh: Math.max(5, Math.min(repLow + 2, 6)) };
  if (goal === 'lean') return { targetSets: 3, repLow: Math.max(12, repLow), repHigh: Math.max(15, repHigh) };
  return { targetSets: 4, repLow: Math.max(8, repLow), repHigh: Math.min(12, Math.max(repHigh, 12)) }; // muscle (hypertrophy)
}

/** Generate a full weekly program. Deterministic (no RNG) for a given input. */
export function generateProgram(opts: { goal: PlanGoal; daysPerWeek: number; equipment: PlanEquipment }): WeeklyProgram {
  const { goal, equipment } = opts;
  const pool = EXERCISE_SEED.filter((e) => e.type === 'strength' && (equipment === 'gym' || e.is_bodyweight));
  const compoundRank = (id: string) => {
    const i = COMPOUND_FIRST.indexOf(id);
    return i === -1 ? 999 : i;
  };
  const byGroup = (g: string) => pool.filter((e) => e.muscle_group === g).sort((a, b) => compoundRank(a.id) - compoundRank(b.id));

  const specs = splitFor(opts.daysPerWeek);
  const weekdays = weekdaysFor(opts.daysPerWeek);

  const program: WeeklyProgram = {};
  for (let wd = 0; wd <= 6; wd++) {
    program[wd] = { dayType: 'rest', label: null, labelKey: 'program.dayType.rest', slots: [] };
  }

  specs.forEach((spec, i) => {
    const wd = weekdays[i]!;
    // Round-robin across the day's muscle groups so the day is balanced, compounds first.
    const picked: ProgramSlot[] = [];
    const seen = new Set<string>();
    const cursors: Record<string, number> = {};
    let guard = 0;
    while (picked.length < spec.count && guard++ < 50) {
      let added = false;
      for (const g of spec.groups) {
        if (picked.length >= spec.count) break;
        const list = byGroup(g);
        const idx = cursors[g] ?? 0;
        const ex = list[idx];
        cursors[g] = idx + 1;
        if (ex && !seen.has(ex.id)) {
          seen.add(ex.id);
          const t = targets(goal, ex.rep_low, ex.rep_high);
          picked.push({ exerciseId: ex.id, ...t });
          added = true;
        }
      }
      if (!added) break; // groups exhausted
    }
    // Lean goal: cap each day with a cardio finisher.
    if (goal === 'lean') {
      const cardio = CARDIO_PICK.find((id) => EXERCISE_SEED.some((e) => e.id === id));
      if (cardio) picked.push({ exerciseId: cardio, targetSets: 1, repLow: 0, repHigh: 0 });
    }
    program[wd] = { dayType: spec.dayType, label: spec.label, labelKey: null, slots: picked } satisfies ProgramDayConfig;
  });

  return program;
}
