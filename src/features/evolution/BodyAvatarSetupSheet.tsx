import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { QUICKLOG_ENDPOINT } from '@/features/quicklog/config';
import { Button, Muted, Pill, useSkinAccent } from '@/ui/primitives';
import { colors, radius, space, typeScale } from '@/ui/theme/tokens';
import {
  BodyAvatarError,
  activateBodyAvatarGeneration,
  deleteBodyAvatarLocalFiles,
  discardBodyAvatarGeneration,
  generateBodyAvatar,
  hasBodyAvatarAtlas,
  hasBodyAvatarOriginal,
  hasLegacyBodyAvatarFiles,
  pickAndStoreBodyAvatarPhoto,
  type BodyAvatarConsent,
  type BodyAvatarGeneration,
  type BodyAvatarOutfit,
} from './bodyAvatarClient';

const OUTFITS: readonly BodyAvatarOutfit[] = ['sleeveless', 'sport_top', 'compression'];
const EMPTY_CONSENT: BodyAvatarConsent = {
  adultConfirmed: false,
  ownershipConfirmed: false,
  aiConsent: false,
};

export function BodyAvatarSetupSheet({
  visible,
  onClose,
  onAvatarChanged,
}: {
  visible: boolean;
  onClose: () => void;
  onAvatarChanged: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const accent = useSkinAccent();
  const abortRef = useRef<AbortController | null>(null);
  const [outfit, setOutfit] = useState<BodyAvatarOutfit>('sleeveless');
  const [consent, setConsent] = useState<BodyAvatarConsent>(EMPTY_CONSENT);
  const [photoReady, setPhotoReady] = useState(false);
  const [avatarReady, setAvatarReady] = useState(false);
  const [legacyReady, setLegacyReady] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState<BodyAvatarGeneration | null>(null);
  const [alignmentConfirmed, setAlignmentConfirmed] = useState(false);
  const [busy, setBusy] = useState<'pick' | 'generate' | 'activate' | 'discard' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = () => {
    setConsent(EMPTY_CONSENT);
    setError(null);
    void Promise.all([hasBodyAvatarOriginal(), hasBodyAvatarAtlas(), hasLegacyBodyAvatarFiles()])
      .then(([hasPhoto, hasAvatar, hasLegacy]) => {
        setPhotoReady(hasPhoto);
        setAvatarReady(hasAvatar);
        setLegacyReady(hasLegacy);
      })
      .catch(() => {
        setPhotoReady(false);
        setAvatarReady(false);
        setLegacyReady(false);
      });
  };

  const close = () => {
    abortRef.current?.abort();
    if (busy === 'generate' || busy === 'activate') return;
    if (pendingGeneration) void discardBodyAvatarGeneration(pendingGeneration);
    setPendingGeneration(null);
    setAlignmentConfirmed(false);
    onClose();
  };

  const pickPhoto = async () => {
    setBusy('pick');
    setError(null);
    try {
      const path = await pickAndStoreBodyAvatarPhoto();
      if (path) {
        setPhotoReady(true);
        setAvatarReady(await hasBodyAvatarAtlas());
        setConsent(EMPTY_CONSENT);
      }
    } catch (cause) {
      console.warn('[body-avatar] photo pick failed', cause);
      setError(t('bodyAvatar.error.pick'));
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy('generate');
    setError(null);
    try {
      const generated = await generateBodyAvatar(QUICKLOG_ENDPOINT, { outfit, consent, signal: controller.signal });
      setPendingGeneration(generated);
      setAlignmentConfirmed(false);
    } catch (cause) {
      console.warn('[body-avatar] generation failed', cause);
      if (cause instanceof BodyAvatarError && cause.code === 'cancelled') return;
      setError(
        cause instanceof BodyAvatarError && cause.code === 'timeout'
          ? t('bodyAvatar.error.timeout')
          : t('bodyAvatar.error.generate'),
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(null);
    }
  };

  const activatePreview = async () => {
    if (!pendingGeneration || !alignmentConfirmed) return;
    setBusy('activate');
    setError(null);
    try {
      await activateBodyAvatarGeneration(pendingGeneration);
      setPendingGeneration(null);
      setAvatarReady(true);
      onAvatarChanged();
      onClose();
    } catch (cause) {
      console.warn('[body-avatar] activation failed', cause);
      setError(t('bodyAvatar.error.activate'));
    } finally {
      setBusy(null);
    }
  };

  const discardPreview = async () => {
    if (!pendingGeneration) return;
    setBusy('discard');
    setError(null);
    try {
      await discardBodyAvatarGeneration(pendingGeneration);
      setPendingGeneration(null);
      setAlignmentConfirmed(false);
    } catch (cause) {
      console.warn('[body-avatar] preview discard failed', cause);
      setError(t('bodyAvatar.error.delete'));
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = () => {
    Alert.alert(t('bodyAvatar.delete.title'), t('bodyAvatar.delete.body'), [
      { text: t('bodyAvatar.cancel'), style: 'cancel' },
      {
        text: t('bodyAvatar.delete.action'),
        style: 'destructive',
        onPress: () => {
          setBusy('delete');
          void deleteBodyAvatarLocalFiles()
            .then(() => {
              setPhotoReady(false);
              setAvatarReady(false);
              setLegacyReady(false);
              setPendingGeneration(null);
              setAlignmentConfirmed(false);
              setConsent(EMPTY_CONSENT);
              onAvatarChanged();
              onClose();
            })
            .catch((cause) => {
              console.warn('[body-avatar] delete failed', cause);
              setError(t('bodyAvatar.error.delete'));
            })
            .finally(() => setBusy(null));
        },
      },
    ]);
  };

  const allConfirmed = consent.adultConfirmed && consent.ownershipConfirmed && consent.aiConsent;
  const setConfirmation = (key: keyof BodyAvatarConsent, value: boolean) => {
    setConsent((current) => ({ ...current, [key]: value }));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} onShow={refreshStatus}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: Math.max(space.lg, insets.bottom) }]}>
        <View pointerEvents="none" style={styles.sheetEdge} />
        <View style={styles.grabber} />
        <Text style={styles.title}>{t('bodyAvatar.title')}</Text>
        <Muted>{t('bodyAvatar.subtitle')}</Muted>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {pendingGeneration ? (
            <View>
              <Text style={styles.label}>{t('bodyAvatar.preview.title')}</Text>
              <Image source={{ uri: pendingGeneration.pendingAtlasPath }} resizeMode="contain" style={styles.preview} />
              <Muted style={styles.noticeBody}>{t('bodyAvatar.preview.instructions')}</Muted>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{t('bodyAvatar.preview.confirm')}</Text>
                <Switch
                  value={alignmentConfirmed}
                  disabled={busy != null}
                  onValueChange={setAlignmentConfirmed}
                  trackColor={{ false: colors.surface3, true: accent.solid }}
                  thumbColor={colors.text}
                />
              </View>
              <Button
                label={busy === 'activate' ? t('bodyAvatar.preview.activating') : t('bodyAvatar.preview.use')}
                disabled={!alignmentConfirmed || busy != null}
                onPress={() => void activatePreview()}
                style={styles.blockGap}
              />
              <Button
                label={t('bodyAvatar.preview.retry')}
                variant="ghost"
                disabled={busy != null}
                onPress={() => void discardPreview()}
                style={styles.smallGap}
              />
            </View>
          ) : (
            <>
              <Text style={styles.label}>{t('bodyAvatar.outfit.title')}</Text>
              <View style={styles.wrapRow}>
                {OUTFITS.map((item) => (
                  <Pill
                    key={item}
                    label={t(`bodyAvatar.outfit.${item}`)}
                    active={outfit === item}
                    onPress={() => setOutfit(item)}
                  />
                ))}
              </View>

              <Button
                label={photoReady ? t('bodyAvatar.photo.change') : t('bodyAvatar.photo.pick')}
                variant="secondary"
                disabled={busy != null}
                onPress={() => void pickPhoto()}
                style={styles.blockGap}
              />
              {photoReady ? <Muted style={styles.ready}>{t('bodyAvatar.photo.ready')}</Muted> : null}

              <View style={styles.notice}>
                <Text style={styles.label}>{t('bodyAvatar.consent.title')}</Text>
                <Muted style={styles.noticeBody}>{t('bodyAvatar.consent.provider')}</Muted>
                {(['adultConfirmed', 'ownershipConfirmed', 'aiConsent'] as const).map((key) => (
                  <View key={key} style={styles.switchRow}>
                    <Text style={styles.switchLabel}>{t(`bodyAvatar.consent.${key}`)}</Text>
                    <Switch
                      value={consent[key]}
                      disabled={!photoReady || busy != null}
                      onValueChange={(value) => setConfirmation(key, value)}
                      trackColor={{ false: colors.surface3, true: accent.solid }}
                      thumbColor={colors.text}
                    />
                  </View>
                ))}
              </View>

              <Button
                label={busy === 'generate' ? t('bodyAvatar.generating') : t('bodyAvatar.generate')}
                disabled={!photoReady || !allConfirmed || busy != null || !QUICKLOG_ENDPOINT}
                onPress={() => void generate()}
                style={styles.blockGap}
              />
              {busy === 'generate' ? (
                <Button label={t('bodyAvatar.cancelGeneration')} variant="ghost" onPress={() => abortRef.current?.abort()} style={styles.smallGap} />
              ) : null}
            </>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {photoReady || avatarReady || legacyReady ? (
            <Button
              label={t('bodyAvatar.delete.action')}
              variant="ghost"
              disabled={busy != null}
              onPress={confirmDelete}
              style={styles.smallGap}
            />
          ) : null}
        </ScrollView>

        <Pressable onPress={close} style={styles.closeBtn} hitSlop={8} disabled={busy === 'generate' || busy === 'activate'}>
          <Muted>{t('logger.close')}</Muted>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    maxHeight: '84%',
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
    paddingHorizontal: space.lg,
  },
  sheetEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: colors.edgeHi },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  title: { ...typeScale.title, color: colors.text, marginBottom: space.xs },
  content: { paddingTop: space.lg },
  label: { ...typeScale.label, color: colors.text },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  blockGap: { marginTop: space.lg },
  smallGap: { marginTop: space.sm },
  ready: { marginTop: space.sm, color: colors.text2 },
  notice: { marginTop: space.lg, padding: space.md, backgroundColor: colors.surface2, borderRadius: radius.md },
  noticeBody: { marginTop: space.xs, marginBottom: space.sm },
  preview: { width: '100%', aspectRatio: 4 / 5, marginTop: space.md, backgroundColor: colors.surface2 },
  switchRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  switchLabel: { ...typeScale.body, color: colors.text2, flex: 1 },
  error: { ...typeScale.caption, color: colors.warning, marginTop: space.md },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.sm },
});
