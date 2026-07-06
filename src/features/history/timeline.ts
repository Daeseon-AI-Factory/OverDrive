// History daily timeline — PURE grouping/formatting logic (no React, no DB). The repo feeds rows
// already tagged with their session's local calendar date (workout_session.date); this module
// folds them into day sections: summary numbers + a chronological list of exercise groups and
// cardio entries. Unit-tested in timeline.test.ts.

import { localDateDaysAgo, todayLocal } from '@/lib/date';

// Structural input types — supersets (SetLogWithDate / CardioLogWithDate from the repos) are
// assignable; tests build minimal literals.
export interface TimelineSetInput {
  id: string;
  date: string; // yyyy-mm-dd local (session date)
  exercise_id: string;
  weight: number; // kg (0 = bodyweight)
  reps: number;
  rir: number | null;
  is_pr: number; // 0/1
  logged_at: string; // ISO-8601 UTC
}

export interface TimelineCardioInput {
  id: string;
  date: string;
  modality: string; // exercise id (cardio catalog)
  duration_sec: number;
  distance_m: number | null;
  logged_at: string;
}

export interface SetChip {
  id: string;
  weightKg: number;
  reps: number;
  rir: number | null;
  isPr: boolean;
  loggedAt: string;
}

/** One exercise's sets for the day, in logging order (a returning exercise merges into its group). */
export interface ExerciseGroup {
  kind: 'exercise';
  exerciseId: string;
  firstLoggedAt: string;
  sets: SetChip[];
}

export interface CardioEntry {
  kind: 'cardio';
  id: string;
  modality: string;
  durationSec: number;
  distanceM: number | null;
  loggedAt: string;
}

export type TimelineItem = ExerciseGroup | CardioEntry;

export interface DaySection {
  date: string; // yyyy-mm-dd local
  totalSets: number;
  totalVolumeKg: number; // Σ weight·reps
  prCount: number;
  cardioMinutes: number;
  firstAt: string; // earliest logged_at (ISO) across sets + cardio
  lastAt: string; // latest logged_at
  items: TimelineItem[]; // chronological
}

const itemTime = (item: TimelineItem): string =>
  item.kind === 'exercise' ? item.firstLoggedAt : item.loggedAt;

/**
 * Fold raw set/cardio rows into day sections, newest day first. Within a day, work is grouped by
 * exercise (one group per exercise, anchored at its first set's time) and interleaved with cardio
 * entries in chronological order. ISO-UTC timestamps compare lexically — same format throughout.
 */
export function buildDaySections(
  sets: readonly TimelineSetInput[],
  cardio: readonly TimelineCardioInput[],
): DaySection[] {
  interface DayAcc {
    section: DaySection;
    groups: Map<string, ExerciseGroup>;
  }
  const days = new Map<string, DayAcc>();
  const dayFor = (date: string, at: string): DayAcc => {
    let acc = days.get(date);
    if (!acc) {
      acc = {
        section: {
          date,
          totalSets: 0,
          totalVolumeKg: 0,
          prCount: 0,
          cardioMinutes: 0,
          firstAt: at,
          lastAt: at,
          items: [],
        },
        groups: new Map(),
      };
      days.set(date, acc);
    }
    if (at < acc.section.firstAt) acc.section.firstAt = at;
    if (at > acc.section.lastAt) acc.section.lastAt = at;
    return acc;
  };

  for (const s of sets) {
    const acc = dayFor(s.date, s.logged_at);
    let group = acc.groups.get(s.exercise_id);
    if (!group) {
      group = { kind: 'exercise', exerciseId: s.exercise_id, firstLoggedAt: s.logged_at, sets: [] };
      acc.groups.set(s.exercise_id, group);
      acc.section.items.push(group);
    }
    if (s.logged_at < group.firstLoggedAt) group.firstLoggedAt = s.logged_at;
    group.sets.push({
      id: s.id,
      weightKg: s.weight,
      reps: s.reps,
      rir: s.rir,
      isPr: s.is_pr === 1,
      loggedAt: s.logged_at,
    });
    acc.section.totalSets += 1;
    acc.section.totalVolumeKg += s.weight * s.reps;
    if (s.is_pr === 1) acc.section.prCount += 1;
  }

  let cardioSec: Map<string, number> | null = null;
  for (const c of cardio) {
    const acc = dayFor(c.date, c.logged_at);
    acc.section.items.push({
      kind: 'cardio',
      id: c.id,
      modality: c.modality,
      durationSec: c.duration_sec,
      distanceM: c.distance_m,
      loggedAt: c.logged_at,
    });
    cardioSec ??= new Map();
    cardioSec.set(c.date, (cardioSec.get(c.date) ?? 0) + c.duration_sec);
  }
  if (cardioSec) {
    for (const [date, sec] of cardioSec) {
      const acc = days.get(date);
      if (acc) acc.section.cardioMinutes = Math.round(sec / 60);
    }
  }

  const sections = [...days.values()].map((d) => d.section);
  for (const section of sections) {
    section.items.sort((a, b) => (itemTime(a) < itemTime(b) ? -1 : itemTime(a) > itemTime(b) ? 1 : 0));
    for (const item of section.items) {
      if (item.kind === 'exercise') {
        item.sets.sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : a.loggedAt > b.loggedAt ? 1 : 0));
      }
    }
  }
  sections.sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));
  return sections;
}

// ── Labels & clocks ──────────────────────────────────────────────────────────────────────────

export type DayLabel = { kind: 'today' | 'yesterday' } | { kind: 'date'; month: number; day: number };

/** 오늘/어제 vs numeric month·day — the screen resolves the actual string through i18n. */
export function dayLabel(date: string, now: Date = new Date()): DayLabel {
  if (date === todayLocal(now)) return { kind: 'today' };
  if (date === localDateDaysAgo(1, now)) return { kind: 'yesterday' };
  return { kind: 'date', month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)) };
}

/** ISO timestamp → local wall clock "HH:MM". */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Workout span "14:05-15:12" (single time when first and last land on the same minute). */
export function clockSpan(firstAt: string, lastAt: string): string {
  const a = formatClock(firstAt);
  const b = formatClock(lastAt);
  return a === b ? a : `${a}-${b}`;
}

/** Chip digits: ≤1 decimal, trailing .0 trimmed (100 → "100", 102.5 → "102.5"). */
export function displayNum(v: number): string {
  return String(Math.round(v * 10) / 10);
}
