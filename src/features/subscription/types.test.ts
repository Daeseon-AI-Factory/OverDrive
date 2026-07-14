import { AI_CREDIT_COST, quotaBlockForFeature, type SubscriptionUsage } from './types';

function usage(overrides: Partial<SubscriptionUsage> = {}): SubscriptionUsage {
  return {
    creditsUsed: 0,
    creditsLimit: 1_000,
    creditsRemaining: 1_000,
    photosUsed: 0,
    photosLimit: 60,
    photosRemaining: 60,
    resetAt: '2026-08-13T00:00:00.000Z',
    ...overrides,
  };
}

describe('subscription quota preflight', () => {
  it('preflights the maximum credit cost of each complete user workflow', () => {
    expect(AI_CREDIT_COST).toEqual({ workout_text: 1, voice: 4, food_text: 2, food_photo: 8 });
  });

  it('blocks a photo before opening the picker when the photo allowance is exhausted', () => {
    expect(quotaBlockForFeature(usage({ photosRemaining: 0 }), 'food_photo')).toBe(
      'monthly_photo_limit_reached',
    );
  });

  it('blocks a route when fewer credits remain than that route costs', () => {
    expect(quotaBlockForFeature(usage({ creditsRemaining: 3 }), 'voice')).toBe(
      'monthly_credit_limit_reached',
    );
    expect(quotaBlockForFeature(usage({ creditsRemaining: 2 }), 'food_text')).toBeNull();
  });

  it('does not treat a missing snapshot as authorization or as a local quota denial', () => {
    expect(quotaBlockForFeature(null, 'food_photo')).toBeNull();
  });
});
