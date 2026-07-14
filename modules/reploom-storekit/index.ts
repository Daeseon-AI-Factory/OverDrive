import {
  type NativeModule,
  requireOptionalNativeModule,
} from 'expo-modules-core';

export const REPLOOM_PRO_MONTHLY_PRODUCT_ID =
  'ai.daeseon.reploom.pro.monthly.v1' as const;

export type SubscriptionPeriodUnit = 'day' | 'week' | 'month' | 'year';

export interface SubscriptionPeriod {
  unit: SubscriptionPeriodUnit;
  value: number;
}

export interface StoreProduct {
  id: string;
  displayName: string;
  description: string;
  displayPrice: string;
  price: number;
  currencyCode: string | null;
  subscriptionPeriod: SubscriptionPeriod | null;
}

export type StoreEnvironment =
  | 'sandbox'
  | 'production'
  | 'xcode'
  | 'unknown';

export interface StoreTransaction {
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  appTransactionId: string;
  purchaseDate: string;
  originalPurchaseDate: string;
  expirationDate: string | null;
  revocationDate: string | null;
  isUpgraded: boolean;
  environment: StoreEnvironment;
  appAccountToken: string | null;
  jwsRepresentation: string;
}

export interface AppTransactionInfo {
  appTransactionId: string;
  appId: string | null;
  appVersionId: string | null;
  appVersion: string;
  originalAppVersion: string;
  bundleId: string;
  originalPurchaseDate: string;
  environment: StoreEnvironment;
  jwsRepresentation: string;
}

export type PurchaseResult =
  | { status: 'purchased'; entitlement: StoreTransaction }
  | { status: 'cancelled' }
  | { status: 'pending' };

export type ReploomStoreKitEvents = {
  entitlementChanged(event: {
    entitlement: StoreTransaction | null;
  }): void;
  transactionUpdated(
    event:
      | { status: 'verified'; transaction: StoreTransaction }
      | { status: 'unverified'; errorCode: string }
  ): void;
};

export declare class ReploomStoreKitNativeModule extends NativeModule<ReploomStoreKitEvents> {
  getSubscriptionUiFixture(): 'active' | 'quota' | null;
  getProductAsync(productId: string): Promise<StoreProduct | null>;
  getEntitlementAsync(productId?: string): Promise<StoreTransaction | null>;
  purchaseAsync(
    productId: string,
    appAccountToken?: string
  ): Promise<PurchaseResult>;
  restoreAsync(productId?: string): Promise<StoreTransaction | null>;
  openManageSubscriptionsAsync(): Promise<void>;
  getAppTransactionAsync(): Promise<AppTransactionInfo | null>;
  getAppAccountTokenAsync(): Promise<string>;
}

const ReploomStoreKit =
  requireOptionalNativeModule<ReploomStoreKitNativeModule>(
    'ExpoReploomStoreKit'
  );

export default ReploomStoreKit;
