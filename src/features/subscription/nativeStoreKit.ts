import { Platform } from 'react-native';
import ReploomStoreKit, {
  type PurchaseResult,
  type ReploomStoreKitNativeModule,
  type StoreProduct,
  type StoreTransaction,
} from '../../../modules/reploom-storekit';
import { PRO_PRODUCT_ID } from './types';

export type ProductInfo = StoreProduct;
export type StoreKitEntitlement = StoreTransaction;
export type { PurchaseResult };

function nativeModule(): ReploomStoreKitNativeModule | null {
  if (Platform.OS !== 'ios') return null;
  return ReploomStoreKit;
}

export function isStoreKitAvailable(): boolean {
  return nativeModule() != null;
}

/** Simulator-binary-only visual QA state. Device builds always receive null from native code. */
export function getSubscriptionUiFixture(): 'active' | 'quota' | null {
  return nativeModule()?.getSubscriptionUiFixture() ?? null;
}

export async function getProProduct(): Promise<ProductInfo | null> {
  return nativeModule()?.getProductAsync(PRO_PRODUCT_ID) ?? null;
}

export async function getCurrentProEntitlement(): Promise<StoreKitEntitlement | null> {
  return nativeModule()?.getEntitlementAsync(PRO_PRODUCT_ID) ?? null;
}

export async function purchasePro(): Promise<PurchaseResult> {
  const module = nativeModule();
  if (!module) throw new Error('storekit_unavailable');
  // Native derives a stable, non-reversible UUID from StoreKit's verified AppTransaction. The
  // module also rejects a purchase if this token and the transaction's appAccountToken diverge.
  const token = await module.getAppAccountTokenAsync();
  return module.purchaseAsync(PRO_PRODUCT_ID, token);
}

export async function restorePro(): Promise<StoreKitEntitlement | null> {
  const module = nativeModule();
  if (!module) throw new Error('storekit_unavailable');
  return module.restoreAsync(PRO_PRODUCT_ID);
}

export async function openManageSubscriptions(): Promise<void> {
  const module = nativeModule();
  if (!module) throw new Error('storekit_unavailable');
  await module.openManageSubscriptionsAsync();
}

export function addEntitlementListener(
  listener: (entitlement: StoreKitEntitlement | null) => void,
): { remove(): void } | null {
  const module = nativeModule();
  if (!module) return null;
  return module.addListener('entitlementChanged', (event) => listener(event.entitlement));
}
