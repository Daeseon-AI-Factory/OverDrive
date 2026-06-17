import { EXERCISE_SEED } from '@/db/seed';
import { generateProgram, type PlanEquipment, type PlanGoal } from './generate';

const ID_SET = new Set(EXERCISE_SEED.map((e) => e.id));
const BODYWEIGHT = new Set(EXERCISE_SEED.filter((e) => e.is_bodyweight).map((e) => e.id));
const GOALS: PlanGoal[] = ['muscle', 'strength', 'lean'];

describe('generateProgram', () => {
  it.each([2, 3, 4, 5, 6])('%i days/week → 7 weekdays with exactly that many training days', (days) => {
    const p = generateProgram({ goal: 'muscle', daysPerWeek: days, equipment: 'gym' });
    expect(Object.keys(p).map(Number).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const training = Object.values(p).filter((d) => d.dayType !== 'rest');
    expect(training).toHaveLength(days);
    expect(Object.values(p).filter((d) => d.dayType === 'rest').every((d) => d.slots.length === 0)).toBe(true);
  });

  it.each(GOALS)('every slot is a real catalog exercise with sane targets (goal=%s)', (goal) => {
    const p = generateProgram({ goal, daysPerWeek: 4, equipment: 'gym' });
    const slots = Object.values(p).flatMap((d) => d.slots);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      expect(ID_SET.has(s.exerciseId)).toBe(true);
      expect(s.targetSets).toBeGreaterThanOrEqual(1);
      expect(s.repLow).toBeLessThanOrEqual(s.repHigh);
    }
  });

  it('bodyweight equipment only programs bodyweight (or cardio) movements', () => {
    const p = generateProgram({ goal: 'muscle', daysPerWeek: 3, equipment: 'bodyweight' as PlanEquipment });
    const strengthSlots = Object.values(p)
      .flatMap((d) => d.slots)
      .filter((s) => s.repHigh > 0); // strength slots have a real rep range (cardio = 0)
    expect(strengthSlots.length).toBeGreaterThan(0);
    expect(strengthSlots.every((s) => BODYWEIGHT.has(s.exerciseId))).toBe(true);
  });

  it('lean goal appends a cardio finisher to each training day', () => {
    const p = generateProgram({ goal: 'lean', daysPerWeek: 3, equipment: 'gym' });
    const training = Object.values(p).filter((d) => d.dayType !== 'rest');
    for (const d of training) {
      const last = d.slots[d.slots.length - 1]!;
      expect(last.repHigh).toBe(0); // cardio slot
    }
  });

  it('is deterministic (same input → same output)', () => {
    const a = generateProgram({ goal: 'strength', daysPerWeek: 5, equipment: 'gym' });
    const b = generateProgram({ goal: 'strength', daysPerWeek: 5, equipment: 'gym' });
    expect(a).toEqual(b);
  });

  it('does not repeat an exercise within a day', () => {
    const p = generateProgram({ goal: 'muscle', daysPerWeek: 6, equipment: 'gym' });
    for (const d of Object.values(p)) {
      const ids = d.slots.map((s) => s.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
