import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Muted, ProgressTrack, SectionTitle } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { colors, space, typeScale } from '@/ui/theme/tokens';
import { useSubscription } from './SubscriptionProvider';
import { useSubscriptionStore } from './subscriptionStore';

export function SubscriptionSettingsCard() {
  const { t, i18n } = useTranslation();
  const { openPaywall, restorePurchases, manageSubscriptions } = useSubscription();
  const phase = useSubscriptionStore((state) => state.phase);
  const storeKitActive = useSubscriptionStore((state) => state.storeKitActive);
  const usage = useSubscriptionStore((state) => state.usage);
  const entitlement = useSubscriptionStore((state) => state.entitlement);
  const lastErrorCode = useSubscriptionStore((state) => state.lastErrorCode);
  const blockedUntil = useSubscriptionStore((state) => state.blockedUntil);
  const skin = useSkinOrNull();
  const [restoring, setRestoring] = useState(false);
  const expires = (() => {
    if (!entitlement?.expiresAt) return null;
    try {
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
        new Date(entitlement.expiresAt),
      );
    } catch {
      return entitlement.expiresAt;
    }
  })();
  const blockedUntilLabel = (() => {
    if (!blockedUntil) return null;
    try {
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(blockedUntil),
      );
    } catch {
      return blockedUntil;
    }
  })();
  const paid = phase === 'active' || storeKitActive;
  const dataDeleted = lastErrorCode === 'data_deleted_until_reset';
  const ownershipKnownFree = phase === 'inactive' && !paid && lastErrorCode == null;

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      await restorePurchases();
    } finally {
      setRestoring(false);
    }
  };

  const status =
    phase === 'active'
      ? t('subscription.settings.active', { date: expires ?? '—' })
      : phase === 'checking'
        ? t('subscription.settings.checking')
        : dataDeleted
          ? t('subscription.settings.deleted', { date: blockedUntilLabel ?? '—' })
          : phase === 'unavailable'
            ? t('subscription.settings.unavailable')
            : phase === 'error'
              ? t('subscription.settings.verifyError')
              : t('subscription.settings.free');
  const textColor = skin?.palette.text ?? colors.text;
  const secondary = skin?.palette.text2 ?? colors.text2;

  return (
    <>
      <SectionTitle>{t('subscription.settings.section')}</SectionTitle>
      <Card live={phase === 'active'}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: textColor }]}>Reploom Pro</Text>
            <Text style={[styles.status, { color: secondary }]}>{status}</Text>
          </View>
          <Text
            style={[
              styles.badge,
              {
                color: dataDeleted
                  ? (skin?.palette.warning ?? colors.warning)
                  : paid
                    ? (skin?.palette.positive ?? colors.positive)
                    : secondary,
              },
            ]}
          >
            {paid ? t('subscription.settings.pro') : ownershipKnownFree ? t('subscription.settings.freeBadge') : '…'}
          </Text>
        </View>

        {phase === 'active' && usage ? (
          <View style={styles.meters}>
            <Meter
              label={t('subscription.usage.credits')}
              value={`${usage.creditsUsed} / ${usage.creditsLimit}`}
              progress={usage.creditsLimit > 0 ? usage.creditsUsed / usage.creditsLimit : 0}
            />
            <Meter
              label={t('subscription.usage.photos')}
              value={`${usage.photosUsed} / ${usage.photosLimit}`}
              progress={usage.photosLimit > 0 ? usage.photosUsed / usage.photosLimit : 0}
            />
          </View>
        ) : null}

        <Muted style={styles.explainer}>{t('subscription.settings.freeCore')}</Muted>
        <View style={styles.actions}>
          {paid ? (
            <Button
              label={t('subscription.manage')}
              onPress={() => void manageSubscriptions()}
              variant="secondary"
              compact
              style={styles.action}
            />
          ) : ownershipKnownFree ? (
            <Button
              label={t('subscription.settings.viewPro')}
              onPress={openPaywall}
              variant="secondary"
              compact
              style={styles.action}
            />
          ) : (
            <Button
              label={phase === 'checking' ? t('subscription.processing') : t('subscription.subscribeUnavailable')}
              onPress={() => {}}
              variant="secondary"
              compact
              disabled
              style={styles.action}
            />
          )}
          <Button
            label={restoring ? t('subscription.processing') : t('subscription.restore')}
            onPress={() => void restore()}
            variant="ghost"
            compact
            disabled={restoring}
            style={styles.action}
          />
        </View>
      </Card>
    </>
  );
}

function Meter({ label, value, progress }: { label: string; value: string; progress: number }) {
  const skin = useSkinOrNull();
  const color = skin?.palette.text2 ?? colors.text2;
  return (
    <View>
      <View style={styles.meterHeader}>
        <Text style={[styles.meterLabel, { color }]}>{label}</Text>
        <Text style={[styles.meterValue, { color }]}>{value}</Text>
      </View>
      <ProgressTrack progress={progress} complete={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  headerText: { flex: 1 },
  title: { ...typeScale.title },
  status: { ...typeScale.caption, marginTop: space.xs },
  badge: { ...typeScale.overline },
  meters: { gap: space.md, marginTop: space.lg },
  meterHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xs },
  meterLabel: { ...typeScale.label },
  meterValue: { ...typeScale.caption, fontVariant: ['tabular-nums'] },
  explainer: { marginTop: space.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.lg },
  action: { flexGrow: 1, flexBasis: '45%' },
});
