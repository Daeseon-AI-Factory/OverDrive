import { computeStreak, shiftDay } from './aggregate';

describe('shiftDay', () => {
  it('moves across month/year boundaries', () => {
    expect(shiftDay('2026-06-02', -1)).toBe('2026-06-01');
    expect(shiftDay('2026-06-01', -1)).toBe('2026-05-31');
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDay('2026-06-02', 1)).toBe('2026-06-03');
  });
});

describe('computeStreak', () => {
  const today = '2026-06-02';

  it('counts consecutive days ending today', () => {
    expect(computeStreak(['2026-06-02', '2026-06-01', '2026-05-31'], today)).toBe(3);
  });

  it('anchors on yesterday if today has no session yet (live streak not zeroed)', () => {
    expect(computeStreak(['2026-06-01', '2026-05-31'], today)).toBe(2);
  });

  it('returns 0 when neither today nor yesterday has a session', () => {
    expect(computeStreak(['2026-05-30', '2026-05-29'], today)).toBe(0);
    expect(computeStreak([], today)).toBe(0);
  });

  it('a gap breaks the streak', () => {
    // today, yesterday, then a missing day before
    expect(computeStreak(['2026-06-02', '2026-06-01', '2026-05-30'], today)).toBe(2);
  });

  it('ignores duplicate dates', () => {
    expect(computeStreak(['2026-06-02', '2026-06-02', '2026-06-01'], today)).toBe(2);
  });
});
