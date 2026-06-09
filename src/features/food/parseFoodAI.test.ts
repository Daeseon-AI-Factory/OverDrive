import { normalizeFoodItems } from './parseFoodAI';

describe('normalizeFoodItems', () => {
  it('keeps named items, rounds + clamps numbers', () => {
    const out = normalizeFoodItems({
      items: [
        { name: '닭가슴살 300g', kcal: 495.4, proteinG: 92.7 },
        { name: 'rice bowl', kcal: 300, proteinG: 6 },
      ],
    });
    expect(out).toEqual([
      { name: '닭가슴살 300g', kcal: 495, proteinG: 93 },
      { name: 'rice bowl', kcal: 300, proteinG: 6 },
    ]);
  });

  it('drops nameless or numberless garbage', () => {
    const out = normalizeFoodItems({
      items: [{ name: '', kcal: 100, proteinG: 5 }, { name: 'mystery' }, 'junk', null],
    });
    expect(out).toEqual([]);
  });

  it('handles malformed shapes', () => {
    expect(normalizeFoodItems({})).toEqual([]);
    expect(normalizeFoodItems(null)).toEqual([]);
    expect(normalizeFoodItems({ items: 'x' })).toEqual([]);
  });

  it('negative values clamp to 0', () => {
    const out = normalizeFoodItems({ items: [{ name: 'weird', kcal: -50, proteinG: -3 }] });
    expect(out).toEqual([{ name: 'weird', kcal: 0, proteinG: 0 }]);
  });
});
