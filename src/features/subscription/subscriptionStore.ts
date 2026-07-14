import { create } from 'zustand';
import type { ProductInfo } from './nativeStoreKit';
import type { ServerEntitlementSummary, SubscriptionUsage } from './types';

export type SubscriptionPhase = 'checking' | 'active' | 'inactive' | 'unavailable' | 'error';

interface SubscriptionState {
  phase: SubscriptionPhase;
  storeKitActive: boolean;
  product: ProductInfo | null;
  entitlement: ServerEntitlementSummary | null;
  usage: SubscriptionUsage | null;
  blockedUntil: string | null;
  lastErrorCode: string | null;
  setProduct: (product: ProductInfo | null) => void;
  setStoreKitActive: (active: boolean) => void;
  setChecking: () => void;
  setActive: (entitlement: ServerEntitlementSummary, usage: SubscriptionUsage) => void;
  setInactive: (errorCode?: string | null, blockedUntil?: string | null) => void;
  setUnavailable: () => void;
  setError: (errorCode: string) => void;
  setUsage: (usage: SubscriptionUsage | null) => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  phase: 'checking',
  storeKitActive: false,
  product: null,
  entitlement: null,
  usage: null,
  blockedUntil: null,
  lastErrorCode: null,
  setProduct: (product) => set({ product }),
  setStoreKitActive: (storeKitActive) => set({ storeKitActive }),
  setChecking: () =>
    set((state) =>
      state.phase === 'active'
        ? { lastErrorCode: null }
        : { phase: 'checking', lastErrorCode: null },
    ),
  setActive: (entitlement, usage) =>
    set({ phase: 'active', storeKitActive: true, entitlement, usage, blockedUntil: null, lastErrorCode: null }),
  setInactive: (errorCode = null, blockedUntil = null) =>
    set({ phase: 'inactive', entitlement: null, usage: null, blockedUntil, lastErrorCode: errorCode }),
  setUnavailable: () =>
    set({
      phase: 'unavailable',
      storeKitActive: false,
      entitlement: null,
      usage: null,
      blockedUntil: null,
      lastErrorCode: 'storekit_unavailable',
    }),
  setError: (lastErrorCode) => set({ phase: 'error', lastErrorCode }),
  setUsage: (usage) => set({ usage }),
}));
