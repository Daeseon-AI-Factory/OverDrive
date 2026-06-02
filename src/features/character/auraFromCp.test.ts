import { auraFromCp } from './auraFromCp';
import { colors } from '@/ui/theme/tokens';

describe('auraFromCp', () => {
  it('returns the grade at the score and a bounded intensity', () => {
    for (const score of [50, 400, 799, 800, 5000, 8200, 9999]) {
      const a = auraFromCp(score);
      expect(a.intensity01).toBeGreaterThanOrEqual(0);
      expect(a.intensity01).toBeLessThanOrEqual(1);
    }
  });

  it('intensity charges through a band (monotonic within a grade)', () => {
    // rookie band is [800, 2000)
    const lo = auraFromCp(800).intensity01; // start of band → ~0
    const mid = auraFromCp(1400).intensity01;
    const hi = auraFromCp(1999).intensity01; // end of band → ~1
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThan(hi);
    expect(lo).toBeCloseTo(0, 2);
  });

  it('top grade (초월자) is fully charged', () => {
    const a = auraFromCp(9999);
    expect(a.gradeKey).toBe('ascendant');
    expect(a.intensity01).toBe(1);
  });

  it('colors ramp cool→hot by grade', () => {
    expect(auraFromCp(50).color).toBe(colors.textDim); // 일반인
    expect(auraFromCp(900).color).toBe(colors.cyan); // 루키
    expect(auraFromCp(5200).color).toBe(colors.magenta); // 비스트
    expect(auraFromCp(9999).color).toBe(colors.flash); // 초월자
  });
});
