import * as WebBrowser from 'expo-web-browser';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { QUICKLOG_ENDPOINT } from '@/features/quicklog/config';
import { Button, Card, Muted, ProgressTrack, useSkinAccent } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { border, colors, radius, space, typeScale } from '@/ui/theme/tokens';
import { hasCurrentRemoteAiConsent } from '@/lib/settings';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  addEntitlementListener,
  getSubscriptionUiFixture,
  getCurrentProEntitlement,
  getProProduct,
  isStoreKitAvailable,
  openManageSubscriptions,
  purchasePro,
  restorePro,
  type StoreKitEntitlement,
} from './nativeStoreKit';
import { useSubscriptionStore } from './subscriptionStore';
import { PRO_PRODUCT_ID, quotaBlockForFeature, type AiFeature, type QuotaBlock } from './types';
import {
  AiApiError,
  clearWorkerSession,
  hasFreshWorkerSession,
  isAttemptLimitError,
  isQuotaError,
  refreshSubscriptionUsage,
  refreshWorkerSession,
} from './workerClient';

const PUBLIC_SITE_ORIGIN = 'https://reploom.pages.dev';

export type AiAccessDecision = 'allowed' | 'cancelled' | 'quota' | 'unavailable' | 'data_deleted';
type PaywallMode =
  | 'subscribe'
  | 'checking'
  | 'details'
  | 'quota'
  | 'safety_limit'
  | 'unavailable'
  | 'data_deleted';

interface SubscriptionContextValue {
  requestAiAccess: (feature: AiFeature) => Promise<AiAccessDecision>;
  openPaywall: () => void;
  showAiAccessError: (error: unknown) => void;
  refresh: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  manageSubscriptions: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

interface PendingGate {
  promise: Promise<AiAccessDecision>;
  resolve: (decision: AiAccessDecision) => void;
}

function isActiveProEntitlement(entitlement: StoreKitEntitlement | null): entitlement is StoreKitEntitlement {
  return (
    entitlement != null &&
    entitlement.productId === PRO_PRODUCT_ID &&
    entitlement.revocationDate == null
  );
}

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const uiFixture = useMemo(() => getSubscriptionUiFixture(), []);
  const phase = useSubscriptionStore((state) => state.phase);
  const usage = useSubscriptionStore((state) => state.usage);
  const [visible, setVisible] = useState(uiFixture === 'quota');
  const [mode, setMode] = useState<PaywallMode>(uiFixture === 'quota' ? 'quota' : 'subscribe');
  const [resetAtOverride, setResetAtOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [messageKey, setMessageKey] = useState<string | null>(null);
  const pendingGate = useRef<PendingGate | null>(null);
  const productLoad = useRef<Promise<boolean> | null>(null);
  const storeKitOperationInFlight = useRef(false);
  const lastExplicitTransactionId = useRef<string | null>(null);
  const storeKitActive = useRef(
    useSubscriptionStore.getState().storeKitActive
      || phase === 'active'
      || useSubscriptionStore.getState().lastErrorCode === 'data_deleted_until_reset',
  );

  const settlePending = useCallback((decision: AiAccessDecision) => {
    const pending = pendingGate.current;
    pendingGate.current = null;
    pending?.resolve(decision);
  }, []);

  const show = useCallback((nextMode: PaywallMode, resetAt: string | null = null) => {
    setMode(nextMode);
    setResetAtOverride(resetAt);
    setMessageKey(null);
    setVisible(true);
  }, []);

  const loadProduct = useCallback((): Promise<boolean> => {
    if (useSubscriptionStore.getState().product) return Promise.resolve(true);
    if (!isStoreKitAvailable()) return Promise.resolve(false);
    if (productLoad.current) return productLoad.current;
    const task = getProProduct()
      .then((product) => {
        useSubscriptionStore.getState().setProduct(product);
        return product != null;
      })
      .catch(() => false)
      .finally(() => {
        if (productLoad.current === task) productLoad.current = null;
      });
    productLoad.current = task;
    return task;
  }, []);

  const refresh = useCallback(async (entitlement?: StoreKitEntitlement | null): Promise<boolean> => {
    try {
      const currentEntitlement = entitlement === undefined ? await getCurrentProEntitlement() : entitlement;
      storeKitActive.current = isActiveProEntitlement(currentEntitlement);
      useSubscriptionStore.getState().setStoreKitActive(storeKitActive.current);
      return await refreshWorkerSession(QUICKLOG_ENDPOINT, currentEntitlement);
    } catch (error) {
      if (error instanceof AiApiError && error.code === 'data_deleted_until_reset') {
        storeKitActive.current = true;
        useSubscriptionStore.getState().setStoreKitActive(true);
        useSubscriptionStore.getState().setInactive(error.code, error.resetAt);
        setResetAtOverride(error.resetAt);
      } else {
        useSubscriptionStore
          .getState()
          .setError(error instanceof AiApiError ? error.code : 'worker_error');
      }
      return false;
    }
  }, []);

  const completePurchase = useCallback(
    async (entitlement: StoreKitEntitlement): Promise<boolean> => {
      lastExplicitTransactionId.current = entitlement.transactionId;
      const active = await refresh(entitlement);
      if (!active) {
        const state = useSubscriptionStore.getState();
        if (state.lastErrorCode === 'data_deleted_until_reset') {
          show('data_deleted', state.blockedUntil);
          settlePending('data_deleted');
        } else {
          show('unavailable');
          setMessageKey('subscription.error.verify');
          settlePending('unavailable');
        }
        return false;
      }
      setVisible(false);
      settlePending('allowed');
      return true;
    },
    [refresh, settlePending, show],
  );

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    storeKitOperationInFlight.current = true;
    setBusy(true);
    setMessageKey(null);
    try {
      const entitlement = await restorePro();
      if (!entitlement) {
        storeKitActive.current = false;
        useSubscriptionStore.getState().setStoreKitActive(false);
        useSubscriptionStore.getState().setInactive();
        show('subscribe');
        setMessageKey('subscription.error.nothingToRestore');
        return false;
      }
      return await completePurchase(entitlement);
    } catch {
      const state = useSubscriptionStore.getState();
      show(
        state.lastErrorCode === 'data_deleted_until_reset'
          ? 'data_deleted'
          : phase === 'active'
            ? 'details'
            : storeKitActive.current
              ? 'unavailable'
              : 'subscribe',
        state.blockedUntil,
      );
      setMessageKey('subscription.error.restore');
      return false;
    } finally {
      storeKitOperationInFlight.current = false;
      setBusy(false);
    }
  }, [completePurchase, phase, show]);

  const manageSubscriptions = useCallback(async () => {
    try {
      await openManageSubscriptions();
    } catch {
      const state = useSubscriptionStore.getState();
      show(
        state.lastErrorCode === 'data_deleted_until_reset'
          ? 'data_deleted'
          : phase === 'active'
            ? 'details'
            : storeKitActive.current
              ? 'unavailable'
              : 'subscribe',
        state.blockedUntil,
      );
      setMessageKey('subscription.error.manage');
    }
  }, [phase, show]);

  const requestAiAccess = useCallback(
    async (feature: AiFeature): Promise<AiAccessDecision> => {
      const decideFromUsage = (): AiAccessDecision | null => {
        const blocked = quotaBlockForFeature(useSubscriptionStore.getState().usage, feature);
        if (!blocked) return null;
        show('quota');
        return 'quota';
      };

      if (hasFreshWorkerSession()) return decideFromUsage() ?? 'allowed';

      try {
        const currentEntitlement = await getCurrentProEntitlement();
        storeKitActive.current = isActiveProEntitlement(currentEntitlement);
        useSubscriptionStore.getState().setStoreKitActive(storeKitActive.current);
        const active = await refreshWorkerSession(QUICKLOG_ENDPOINT, currentEntitlement);
        if (active) return decideFromUsage() ?? 'allowed';
      } catch (error) {
        if (error instanceof AiApiError && error.code === 'data_deleted_until_reset') {
          storeKitActive.current = true;
          useSubscriptionStore.getState().setStoreKitActive(true);
          show('data_deleted', error.resetAt);
          return 'data_deleted';
        }
        if (isQuotaError(error)) {
          show('quota', error.resetAt);
          return 'quota';
        }
        if (isAttemptLimitError(error)) {
          show('safety_limit', error.resetAt);
          return 'unavailable';
        }
        show('unavailable');
        setMessageKey('subscription.error.verify');
        return 'unavailable';
      }

      if (storeKitActive.current) {
        show('unavailable');
        setMessageKey('subscription.error.verify');
        return 'unavailable';
      }

      if (pendingGate.current) return pendingGate.current.promise;
      let resolve!: (decision: AiAccessDecision) => void;
      const promise = new Promise<AiAccessDecision>((done) => {
        resolve = done;
      });
      pendingGate.current = { promise, resolve };
      void loadProduct();
      show('subscribe');
      return promise;
    },
    [loadProduct, show],
  );

  const showAiAccessError = useCallback(
    (error: unknown) => {
      if (isQuotaError(error)) {
        show('quota', error.resetAt);
      } else if (isAttemptLimitError(error)) {
        show('safety_limit', error.resetAt);
      } else if (error instanceof AiApiError && error.code === 'data_deleted_until_reset') {
        show('data_deleted', error.resetAt);
      }
    },
    [show],
  );

  const openPaywall = useCallback(() => {
    const state = useSubscriptionStore.getState();
    if (!state.product) void loadProduct();
    if (state.lastErrorCode === 'data_deleted_until_reset') {
      show('data_deleted', state.blockedUntil);
      return;
    }
    if (state.phase === 'active') {
      show('details');
      return;
    }
    const canOfferPurchase = state.phase === 'inactive'
      && !state.storeKitActive
      && state.lastErrorCode == null;
    show(canOfferPurchase ? 'subscribe' : state.phase === 'checking' ? 'checking' : 'unavailable');
  }, [loadProduct, show]);

  const close = useCallback(() => {
    if (busy) return;
    setVisible(false);
    settlePending('cancelled');
  }, [busy, settlePending]);

  const purchase = useCallback(async () => {
    if (!hasCurrentRemoteAiConsent(useSettingsStore.getState().remoteAiConsent)) {
      setMessageKey('subscription.error.consentRequired');
      return;
    }
    storeKitOperationInFlight.current = true;
    setBusy(true);
    setMessageKey(null);
    try {
      const result = await purchasePro();
      if (result.status === 'cancelled') return;
      if (result.status === 'pending') {
        setMessageKey('subscription.pending');
        settlePending('cancelled');
        return;
      }
      await completePurchase(result.entitlement);
    } catch {
      setMessageKey('subscription.error.purchase');
    } finally {
      storeKitOperationInFlight.current = false;
      setBusy(false);
    }
  }, [completePurchase, settlePending]);

  useEffect(() => {
    let alive = true;
    if (uiFixture) {
      const now = Date.now();
      const resetAt = new Date(now + 21 * 24 * 60 * 60 * 1_000).toISOString();
      const quotaReached = uiFixture === 'quota';
      storeKitActive.current = true;
      useSubscriptionStore.getState().setStoreKitActive(true);
      useSubscriptionStore.getState().setActive(
        {
          productId: PRO_PRODUCT_ID,
          environment: 'xcode-ui-fixture',
          expiresAt: resetAt,
        },
        {
          creditsUsed: quotaReached ? 1_000 : 412,
          creditsLimit: 1_000,
          creditsRemaining: quotaReached ? 0 : 588,
          photosUsed: quotaReached ? 60 : 18,
          photosLimit: 60,
          photosRemaining: quotaReached ? 0 : 42,
          resetAt,
        },
      );
      return () => settlePending('cancelled');
    }
    if (!isStoreKitAvailable()) {
      useSubscriptionStore.getState().setUnavailable();
      return;
    }
    void loadProduct();
    const initialRefresh = setTimeout(() => void refresh(), 0);

    const entitlementSubscription = addEntitlementListener((entitlement) => {
      if (!alive) return;
      if (!entitlement) {
        storeKitActive.current = false;
        useSubscriptionStore.getState().setStoreKitActive(false);
        clearWorkerSession();
        return;
      }
      storeKitActive.current = isActiveProEntitlement(entitlement);
      useSubscriptionStore.getState().setStoreKitActive(storeKitActive.current);
      // Native sends entitlementChanged as part of purchase/restore before the corresponding
      // promise settles. The explicit completion path owns that exchange; a late duplicate event
      // for the same transaction is also redundant while its Worker session is fresh.
      if (storeKitOperationInFlight.current) return;
      if (
        entitlement.transactionId === lastExplicitTransactionId.current
        && hasFreshWorkerSession()
      ) return;
      void refresh(entitlement);
    });
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      void loadProduct();
      if (hasFreshWorkerSession()) {
        void refreshSubscriptionUsage(QUICKLOG_ENDPOINT).catch(() => {});
        return;
      }
      void refresh();
    });
    return () => {
      alive = false;
      clearTimeout(initialRefresh);
      entitlementSubscription?.remove();
      appStateSubscription.remove();
      settlePending('cancelled');
    };
  }, [loadProduct, refresh, settlePending, uiFixture]);

  useEffect(() => {
    if (uiFixture) return;
    if (phase !== 'active' || !hasFreshWorkerSession()) return;
    void refreshSubscriptionUsage(QUICKLOG_ENDPOINT).catch(() => {});
  }, [phase, uiFixture]);

  const context = useMemo<SubscriptionContextValue>(
    () => ({
      requestAiAccess,
      openPaywall,
      showAiAccessError,
      refresh: () => refresh(),
      restorePurchases,
      manageSubscriptions,
    }),
    [requestAiAccess, openPaywall, showAiAccessError, refresh, restorePurchases, manageSubscriptions],
  );

  return (
    <SubscriptionContext.Provider value={context}>
      {children}
      <SubscriptionPaywall
        visible={visible}
        mode={mode}
        busy={busy}
        message={messageKey ? t(messageKey) : null}
        resetAt={resetAtOverride ?? usage?.resetAt ?? null}
        onClose={close}
        onPurchase={() => void purchase()}
        onRestore={() => void restorePurchases()}
        onManage={() => void manageSubscriptions()}
      />
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const value = useContext(SubscriptionContext);
  if (!value) throw new Error('SubscriptionProvider is missing');
  return value;
}

function SubscriptionPaywall({
  visible,
  mode,
  busy,
  message,
  resetAt,
  onClose,
  onPurchase,
  onRestore,
  onManage,
}: {
  visible: boolean;
  mode: PaywallMode;
  busy: boolean;
  message: string | null;
  resetAt: string | null;
  onClose: () => void;
  onPurchase: () => void;
  onRestore: () => void;
  onManage: () => void;
}) {
  const { t, i18n } = useTranslation();
  const product = useSubscriptionStore((state) => state.product);
  const usage = useSubscriptionStore((state) => state.usage);
  const skin = useSkinOrNull();
  const accent = useSkinAccent();
  const active = useSubscriptionStore((state) => state.phase) === 'active';
  const storeKitActive = useSubscriptionStore((state) => state.storeKitActive);
  const resetLabel = useMemo(() => {
    if (!resetAt) return null;
    try {
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(resetAt),
      );
    } catch {
      return resetAt;
    }
  }, [resetAt, i18n.language]);

  const openLegal = (path: '/privacy' | '/terms') => {
    void WebBrowser.openBrowserAsync(`${PUBLIC_SITE_ORIGIN}${path}`).catch(() => {});
  };
  const title =
    mode === 'quota'
      ? t('subscription.quota.title')
      : mode === 'safety_limit'
        ? t('subscription.safety.title')
      : mode === 'data_deleted'
        ? t('subscription.deleted.title')
        : active || mode === 'details' || (mode === 'unavailable' && storeKitActive)
          ? t('subscription.activeTitle')
          : mode === 'unavailable'
            ? t('subscription.unavailableTitle')
            : t('subscription.title');
  const textColor = skin?.palette.text ?? colors.text;
  const surface = skin?.palette.bg0 ?? colors.bg0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.backdrop} onPress={onClose} />
        <View
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={[styles.sheet, { backgroundColor: surface, borderColor: skin?.palette.line ?? colors.line }]}
        >
          <View style={styles.sheetHeader}>
            <Text accessibilityRole="header" style={[styles.sheetTitle, { color: textColor }]}>{title}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.closeText, { color: skin?.palette.text2 ?? colors.text2 }]}>✕</Text>
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
            {mode === 'quota' ? (
              <Card live>
                <Text style={[styles.cardTitle, { color: textColor }]}>{t('subscription.quota.reached')}</Text>
                <Muted style={styles.blockGap}>{t('subscription.quota.body')}</Muted>
                {usage ? <UsageMeters usage={usage} /> : null}
                {resetLabel ? <Muted style={styles.blockGap}>{t('subscription.quota.reset', { date: resetLabel })}</Muted> : null}
              </Card>
            ) : mode === 'safety_limit' ? (
              <Card>
                <Text style={[styles.cardTitle, { color: textColor }]}>{t('subscription.safety.reached')}</Text>
                <Muted style={styles.blockGap}>{t('subscription.safety.body')}</Muted>
                {resetLabel ? <Muted style={styles.blockGap}>{t('subscription.quota.reset', { date: resetLabel })}</Muted> : null}
              </Card>
            ) : mode === 'data_deleted' ? (
              <Card>
                <Text style={[styles.cardTitle, { color: textColor }]}>{t('subscription.deleted.blocked')}</Text>
                <Muted style={styles.blockGap}>{t('subscription.deleted.body')}</Muted>
                {resetLabel ? <Muted style={styles.blockGap}>{t('subscription.quota.reset', { date: resetLabel })}</Muted> : null}
              </Card>
            ) : (
              <>
                <Card live={!active}>
                  <Text style={[styles.proName, { color: textColor }]}>
                    {product?.displayName ?? 'Reploom Pro'}
                  </Text>
                  <Text style={[styles.price, { color: accent.solid }]}>
                    {product?.displayPrice
                      ? t('subscription.priceMonthly', { price: product.displayPrice })
                      : t('subscription.priceLoading')}
                  </Text>
                  <View style={styles.benefits}>
                    <Benefit text={t('subscription.benefit.credits')} />
                    <Benefit text={t('subscription.benefit.photos')} />
                    <Benefit text={t('subscription.benefit.freeCore')} />
                  </View>
                  <Muted style={styles.blockGap}>{t('subscription.benefit.costs')}</Muted>
                  <Muted style={styles.blockGap}>{t('subscription.benefit.safety')}</Muted>
                  <Muted style={styles.blockGap}>{t('subscription.benefit.consent')}</Muted>
                  <Muted style={styles.blockGap}>{t('subscription.renewal')}</Muted>
                </Card>
                {active && usage ? (
                  <Card>
                    <Text style={[styles.cardTitle, { color: textColor }]}>{t('subscription.usage.title')}</Text>
                    <UsageMeters usage={usage} />
                    {resetLabel ? <Muted style={styles.blockGap}>{t('subscription.quota.reset', { date: resetLabel })}</Muted> : null}
                  </Card>
                ) : null}
              </>
            )}

            {message ? (
              <Text
                accessibilityRole="alert"
                style={[styles.warning, { color: skin?.palette.warning ?? colors.warning }]}
              >
                {message}
              </Text>
            ) : null}
            {busy ? <ActivityIndicator color={accent.solid} accessibilityLabel={t('subscription.processing')} /> : null}

            {mode === 'subscribe' && !active ? (
              <Button
                label={product?.displayPrice ? t('subscription.subscribe', { price: product.displayPrice }) : t('subscription.subscribeUnavailable')}
                onPress={onPurchase}
                disabled={busy || !product}
              />
            ) : mode === 'checking' ? (
              <Button label={t('subscription.processing')} onPress={() => {}} disabled />
            ) : (
              <Button label={t('subscription.manage')} onPress={onManage} variant="secondary" disabled={busy} />
            )}
            {mode === 'subscribe' || mode === 'checking' || mode === 'details' || mode === 'unavailable' ? (
              <Button label={t('subscription.restore')} onPress={onRestore} variant="ghost" disabled={busy} />
            ) : null}

            <View style={styles.legalRow}>
              <Pressable accessibilityRole="link" onPress={() => openLegal('/terms')} hitSlop={8}>
                <Text style={[styles.legalLink, { color: accent.solid }]}>{t('settings.legal.terms')}</Text>
              </Pressable>
              <Text style={[styles.legalDot, { color: skin?.palette.text3 ?? colors.text3 }]}>·</Text>
              <Pressable accessibilityRole="link" onPress={() => openLegal('/privacy')} hitSlop={8}>
                <Text style={[styles.legalLink, { color: accent.solid }]}>{t('settings.legal.privacy')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Benefit({ text }: { text: string }) {
  const skin = useSkinOrNull();
  return (
    <View style={styles.benefitRow}>
      <Text style={[styles.bullet, { color: skin?.palette.positive ?? colors.positive }]}>✓</Text>
      <Text style={[styles.benefitText, { color: skin?.palette.text2 ?? colors.text2 }]}>{text}</Text>
    </View>
  );
}

function UsageMeters({ usage }: { usage: NonNullable<ReturnType<typeof useSubscriptionStore.getState>['usage']> }) {
  const { t } = useTranslation();
  const skin = useSkinOrNull();
  const labelColor = skin?.palette.text2 ?? colors.text2;
  return (
    <View style={styles.usageMeters}>
      <View>
        <View style={styles.meterLabelRow}>
          <Text style={[styles.meterLabel, { color: labelColor }]}>{t('subscription.usage.credits')}</Text>
          <Text style={[styles.meterValue, { color: labelColor }]}>{usage.creditsUsed} / {usage.creditsLimit}</Text>
        </View>
        <ProgressTrack progress={usage.creditsLimit > 0 ? usage.creditsUsed / usage.creditsLimit : 0} complete={false} />
      </View>
      <View>
        <View style={styles.meterLabelRow}>
          <Text style={[styles.meterLabel, { color: labelColor }]}>{t('subscription.usage.photos')}</Text>
          <Text style={[styles.meterValue, { color: labelColor }]}>{usage.photosUsed} / {usage.photosLimit}</Text>
        </View>
        <ProgressTrack progress={usage.photosLimit > 0 ? usage.photosUsed / usage.photosLimit : 0} complete={false} />
      </View>
    </View>
  );
}

export function decisionForQuota(block: QuotaBlock | null): AiAccessDecision {
  return block ? 'quota' : 'allowed';
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.backdrop },
  sheet: {
    maxHeight: '92%',
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: border.thin,
    paddingTop: space.lg,
  },
  sheetHeader: {
    minHeight: 44,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { ...typeScale.title, flex: 1 },
  close: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  closeText: { ...typeScale.body },
  sheetBody: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.md },
  cardTitle: { ...typeScale.title },
  proName: { ...typeScale.title },
  price: { ...typeScale.title, marginTop: space.xs },
  benefits: { gap: space.sm, marginTop: space.lg },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  bullet: { ...typeScale.label, width: 18 },
  benefitText: { ...typeScale.body, flex: 1 },
  blockGap: { marginTop: space.md },
  usageMeters: { gap: space.md, marginTop: space.md },
  meterLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xs },
  meterLabel: { ...typeScale.label },
  meterValue: { ...typeScale.caption, fontVariant: ['tabular-nums'] },
  warning: { ...typeScale.caption, textAlign: 'center' },
  legalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, minHeight: 44 },
  legalLink: { ...typeScale.label },
  legalDot: { ...typeScale.caption },
});
