import { parseManualFoodDraft, scaleFoodItems } from './manualMeal';

describe('manual meal input', () => {
  it('accepts explicit non-negative values without estimating anything', () => {
    expect(parseManualFoodDraft('  Greek yogurt  ', '180', '17,5')).toEqual({
      name: 'Greek yogurt',
      kcal: 180,
      proteinG: 17.5,
    });
  });

  it.each([
    ['', '100', '10'],
    ['rice', '', '10'],
    ['rice', '100', ''],
    ['rice', '-1', '10'],
    ['rice', '100', 'protein'],
  ])('rejects incomplete or invalid drafts: %p / %p / %p', (name, kcal, protein) => {
    expect(parseManualFoodDraft(name, kcal, protein)).toBeNull();
  });

  it('applies the selected portion to kcal and protein with stable decimal rounding', () => {
    const items = [{ name: 'Chicken bowl', kcal: 501, proteinG: 43.3 }];
    expect(scaleFoodItems(items, 0.5)).toEqual([{ name: 'Chicken bowl', kcal: 250.5, proteinG: 21.7 }]);
    expect(scaleFoodItems(items, 1)).toEqual(items);
    expect(scaleFoodItems(items, 1.5)).toEqual([{ name: 'Chicken bowl', kcal: 751.5, proteinG: 65 }]);
  });
});
