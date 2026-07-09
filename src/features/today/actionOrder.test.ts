import { todayActionOrder } from './actionOrder';

describe('todayActionOrder', () => {
  it('puts meal capture first while idle', () => {
    expect(todayActionOrder(false)).toEqual(['food', 'quicklog', 'goals', 'discipline', 'character']);
  });

  it('puts live workout controls first while a session is active', () => {
    expect(todayActionOrder(true)).toEqual(['forge', 'quicklog', 'food', 'character', 'goals', 'discipline']);
  });

  it('keeps every non-session action reachable in both states', () => {
    const idle = new Set(todayActionOrder(false));
    const active = new Set(todayActionOrder(true));
    expect([...idle].every((surface) => active.has(surface))).toBe(true);
    expect(active.has('forge')).toBe(true);
    expect(idle.has('forge')).toBe(false);
  });
});
