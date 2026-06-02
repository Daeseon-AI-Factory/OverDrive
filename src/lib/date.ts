// Date helpers. All persisted timestamps are ISO-8601 UTC (→ Postgres TIMESTAMPTZ in Phase 2).
// "Calendar day" values are local yyyy-mm-dd (a workout belongs to the day you did it).

export const nowIso = (): string => new Date().toISOString();

/** Local calendar day as yyyy-mm-dd. */
export function todayLocal(from: Date = new Date()): string {
  const y = from.getFullYear();
  const m = String(from.getMonth() + 1).padStart(2, '0');
  const d = String(from.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local calendar day, n days before `from`. */
export function localDateDaysAgo(n: number, from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() - n);
  return todayLocal(d);
}
