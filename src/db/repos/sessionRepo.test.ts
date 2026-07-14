import { sessionStartedAtMs } from './sessionRepo';

describe('sessionStartedAtMs', () => {
  it('returns the durable workout_session.started_at value', () => {
    expect(sessionStartedAtMs({ started_at: '2026-07-14T12:34:56.789Z' }, 1)).toBe(
      Date.parse('2026-07-14T12:34:56.789Z'),
    );
  });

  it('uses the explicit fallback only for a corrupt legacy timestamp', () => {
    expect(sessionStartedAtMs({ started_at: 'not-a-date' }, 1234)).toBe(1234);
  });
});
