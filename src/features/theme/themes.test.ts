import { THEMES, THEME_IDS, getTheme, calloutAt, normalizeThemeId } from './themes';

describe('themes registry', () => {
  it('every theme is well-formed (4 tier colors, callouts, label, accent)', () => {
    for (const id of THEME_IDS) {
      const th = THEMES[id];
      expect(th.id).toBe(id);
      for (const tier of [1, 2, 3, 4] as const) {
        expect(th.tierColor[tier]).toMatch(/^#|^rgb/i);
      }
      expect(th.callouts.length).toBeGreaterThan(0);
      th.callouts.forEach((c) => expect(c.trim().length).toBeGreaterThan(0));
      expect(th.overdriveLabel.trim().length).toBeGreaterThan(0);
      expect(th.accent.trim().length).toBeGreaterThan(0);
    }
  });

  it('callouts are original — no trademarked franchise phrases', () => {
    const banned = /kamehameha|super saiyan|saiyan|limit break|final fantasy|dragon ball/i;
    for (const id of THEME_IDS) {
      THEMES[id].callouts.forEach((c) => expect(c).not.toMatch(banned));
      expect(THEMES[id].overdriveLabel).not.toMatch(banned);
    }
  });

  it('getTheme falls back to aura for unknown / legacy / nullish values', () => {
    expect(getTheme('mogul').id).toBe('mogul');
    expect(getTheme('battle').id).toBe('aura'); // legacy AestheticPref value
    expect(getTheme('glow').id).toBe('aura');
    expect(getTheme(null).id).toBe('aura');
    expect(getTheme(undefined).id).toBe('aura');
    expect(getTheme('').id).toBe('aura');
  });

  it('normalizes persisted legacy theme ids before UI lookup', () => {
    expect(normalizeThemeId('pro')).toBe('pro');
    expect(normalizeThemeId('battle')).toBe('aura');
    expect(normalizeThemeId('glow')).toBe('aura');
    expect(normalizeThemeId(null)).toBe('aura');
  });

  it('calloutAt wraps the index and tolerates negatives', () => {
    const th = THEMES.aura;
    const n = th.callouts.length;
    expect(calloutAt(th, 0)).toBe(th.callouts[0]);
    expect(calloutAt(th, n)).toBe(th.callouts[0]);
    expect(calloutAt(th, n + 1)).toBe(th.callouts[1 % n]);
    expect(calloutAt(th, -1)).toBe(th.callouts[(n - 1) % n]);
  });
});
