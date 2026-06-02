// Original combat-power grade ladder (spec §6.3). Names are OVERDRIVE-original — no borrowed IP.
// Bands are inclusive-low: a score >= min (and below the next grade's min) is that grade.

export const GRADES = [
  { key: 'ordinary', label: '일반인', min: 0 },
  { key: 'rookie', label: '루키', min: 800 },
  { key: 'fighter', label: '파이터', min: 2000 },
  { key: 'warrior', label: '워리어', min: 3500 },
  { key: 'beast', label: '비스트', min: 5000 },
  { key: 'monster', label: '괴수', min: 6500 },
  { key: 'ascendant', label: '초월자', min: 8200 },
] as const;

export type Grade = (typeof GRADES)[number];
export type GradeKey = Grade['key'];

/** Highest grade whose `min` the score reaches. Always returns a grade (>=0 → 일반인). */
export function gradeForScore(score: number): Grade {
  let result: Grade = GRADES[0];
  for (const grade of GRADES) {
    if (score >= grade.min) result = grade;
  }
  return result;
}
