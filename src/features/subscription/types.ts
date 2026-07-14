export const PRO_PRODUCT_ID = 'ai.daeseon.reploom.pro.monthly.v1';
export const PRO_CREDIT_LIMIT = 1_000;
export const PRO_PHOTO_LIMIT = 60;

export type AiFeature = 'workout_text' | 'voice' | 'food_text' | 'food_photo';

export const AI_CREDIT_COST: Readonly<Record<AiFeature, number>> = {
  workout_text: 1,
  // A complete voice-workout flow always transcribes (3) and may need the flexible parser (+1).
  // Preflight the worst case to reduce partial voice flows; the Worker remains authoritative and
  // another device can still spend shared credits between the two separately metered requests.
  voice: 4,
  food_text: 2,
  food_photo: 8,
};

export interface SubscriptionUsage {
  creditsUsed: number;
  creditsLimit: number;
  creditsRemaining: number;
  photosUsed: number;
  photosLimit: number;
  photosRemaining: number;
  resetAt: string;
}

export interface ServerEntitlementSummary {
  productId: string;
  environment: string;
  expiresAt: string;
}

export type QuotaBlock = 'monthly_credit_limit_reached' | 'monthly_photo_limit_reached';

/**
 * UX preflight only. The Worker is still authoritative and evaluates every request atomically.
 * A stale client snapshot can allow a request to reach the Worker, but can never grant access.
 */
export function quotaBlockForFeature(
  usage: SubscriptionUsage | null,
  feature: AiFeature,
): QuotaBlock | null {
  if (!usage) return null;
  if (feature === 'food_photo' && usage.photosRemaining <= 0) return 'monthly_photo_limit_reached';
  if (usage.creditsRemaining < AI_CREDIT_COST[feature]) return 'monthly_credit_limit_reached';
  return null;
}

export function isSubscriptionUsage(value: unknown): value is SubscriptionUsage {
  if (value == null || typeof value !== 'object') return false;
  const u = value as Partial<SubscriptionUsage>;
  return (
    Number.isFinite(u.creditsUsed) &&
    Number.isFinite(u.creditsLimit) &&
    Number.isFinite(u.creditsRemaining) &&
    Number.isFinite(u.photosUsed) &&
    Number.isFinite(u.photosLimit) &&
    Number.isFinite(u.photosRemaining) &&
    typeof u.resetAt === 'string' &&
    !Number.isNaN(Date.parse(u.resetAt))
  );
}
