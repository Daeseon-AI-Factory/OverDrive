import { displayToKg, formatDistance, formatWeight, kgToDisplay, weightStepDisplay, weightUnit } from './units';

describe('units', () => {
  it('metric is identity for weight', () => {
    expect(kgToDisplay(60, 'metric')).toBe(60);
    expect(displayToKg(60, 'metric')).toBe(60);
    expect(weightUnit('metric')).toBe('kg');
  });

  it('imperial converts kg↔lb and round-trips', () => {
    const lb = kgToDisplay(100, 'imperial');
    expect(lb).toBeCloseTo(220.462, 2);
    expect(displayToKg(lb, 'imperial')).toBeCloseTo(100, 6);
    expect(weightUnit('imperial')).toBe('lb');
  });

  it('formatWeight shows the right unit and hides non-positive (bodyweight)', () => {
    expect(formatWeight(60, 'metric')).toBe('60 kg');
    expect(formatWeight(100, 'imperial')).toBe('220.5 lb');
    expect(formatWeight(0, 'metric')).toBe('');
  });

  it('stepper increment: metric uses kg step, imperial uses 5 lb', () => {
    expect(weightStepDisplay('metric', 2.5)).toBe(2.5);
    expect(weightStepDisplay('imperial', 2.5)).toBe(5);
  });

  it('distance: km vs mi', () => {
    expect(formatDistance(5000, 'metric')).toBe('5 km');
    expect(formatDistance(1609.344, 'imperial')).toBe('1 mi');
  });
});
