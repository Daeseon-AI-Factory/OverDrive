import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { gradeForScore } from '@/features/combat-power/grades';
import { QUICKLOG_ENDPOINT } from '@/features/quicklog/config';
import { normalizeThemeId } from '@/features/theme/themes';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted, NeonButton, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, radius, space } from '@/ui/theme/tokens';
import { EVOLVED_PATH, EvolveError, ORIGINAL_PATH, evolve, hasEvolved, hasOriginal, pickPhoto } from './evolveClient';

/**
 * EVOLUTION — your own photo, transformed by the AI to match your grade. The shareable hero moment
 * (the "aura farming" shot). Anti-shame (§9): transformations only flatter and only move UP — a
 * grade drop never downgrades the image. Photo goes through the Worker pass-through only.
 */
export function EvolutionCard() {
  const { t } = useTranslation();
  const score = useCombatPowerStore((s) => s.score);
  const grade = gradeForScore(score);
  const themeId = normalizeThemeId(useSettingsStore((s) => s.aestheticPref));

  const [orig, setOrig] = useState(false);
  const [evolved, setEvolved] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cacheBust, setCacheBust] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setOrig(await hasOriginal().catch(() => false));
        setEvolved(await hasEvolved().catch(() => false));
      })();
    }, []),
  );

  const runEvolve = useCallback(async () => {
    if (!QUICKLOG_ENDPOINT) {
      setErr(t('evolution.noEndpoint'));
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setErr(null);
    try {
      await evolve(QUICKLOG_ENDPOINT, grade.key, themeId, ctrl.signal);
      setEvolved(true);
      setShowOriginal(false);
      setCacheBust((n) => n + 1); // bust Image cache for the rewritten file
    } catch (e) {
      // Friendly copy only — raw HTTP status/body stays in the console (EvolveError.detail).
      console.warn('[evolution] evolve failed:', e);
      if (e instanceof EvolveError && e.code === 'cancelled') {
        // user cancelled — their photo is untouched, no error to show
      } else if (e instanceof EvolveError && e.code === 'timeout') {
        setErr(t('evolution.failTimeout', { defaultValue: 'Evolution timed out — tap Re-evolve to try again.' }));
      } else {
        setErr(t('evolution.failRetry', { defaultValue: 'Evolution failed — your photo is safe, tap Re-evolve to retry.' }));
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setBusy(false);
    }
  }, [grade.key, themeId, t]);

  const onCancelEvolve = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const onPick = useCallback(async () => {
    setErr(null);
    let uri: string | null = null;
    try {
      setPicking(true); // feedback while the picked photo downscales + copies (can be a 12MP image)
      uri = await pickPhoto();
    } catch (e) {
      console.warn('[evolution] photo pick failed:', e);
      setErr(t('evolution.pickFail', { defaultValue: "Couldn't load that photo — try another one." }));
      return;
    } finally {
      setPicking(false);
    }
    if (!uri) return; // user cancelled the picker — not an error
    setOrig(true);
    // New file behind the same ORIGINAL_PATH uri → bust the Image cache, and show the freshly
    // picked photo (not a stale previous evolve) while the upload runs / if it fails.
    setEvolved(false);
    setShowOriginal(false);
    setCacheBust((n) => n + 1);
    await runEvolve();
  }, [runEvolve, t]);

  // Share the evolved hero image (RN built-in share sheet — no extra native dep). The viral
  // artifact: "I evolved my workouts into a hero." Caption carries the hook; user adds their own.
  const onShare = useCallback(async () => {
    try {
      await Share.share({
        url: EVOLVED_PATH,
        message: t('evolution.shareCaption', { cp: score, grade: t(`grade.${grade.key}`) }),
      });
    } catch {
      // user cancelled or share unavailable — never block
    }
  }, [score, grade.key, t]);

  return (
    <View>
      <SectionTitle>{t('evolution.title')}</SectionTitle>
      <Card>
        {!orig ? (
          <>
            <Muted>{t('evolution.intro')}</Muted>
            <NeonButton
              label={picking ? '…' : t('evolution.pick')}
              color={colors.violet}
              disabled={picking}
              onPress={onPick}
              style={{ marginTop: space.md }}
            />
            {err ? <Muted style={{ color: colors.energyLo, marginTop: space.sm }}>{err}</Muted> : null}
          </>
        ) : (
          <>
            <Pressable onPress={() => setShowOriginal((v) => !v)} disabled={busy || !evolved}>
              <View>
                <Image
                  // The user's own photo stays visible before the first evolve succeeds and after a
                  // failure — never a blank box, never a vanished photo.
                  source={{ uri: `${showOriginal || !evolved ? ORIGINAL_PATH : EVOLVED_PATH}?v=${cacheBust}` }}
                  style={styles.photo}
                  resizeMode="cover"
                />
                {busy ? (
                  <View style={styles.busyOverlay}>
                    <ActivityIndicator color={colors.cyan} size="large" />
                    <Text style={styles.busyText}>{t('evolution.evolving')}</Text>
                    <Text style={styles.busyHint}>{t('evolution.evolvingHint', { defaultValue: 'usually 30–60s' })}</Text>
                    <Pressable
                      onPress={onCancelEvolve}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('evolution.cancel', { defaultValue: 'Cancel' })}
                      style={({ pressed }) => [styles.cancelBtn, { opacity: pressed ? 0.6 : 1 }]}
                    >
                      <Text style={styles.cancelText}>{t('evolution.cancel', { defaultValue: 'Cancel' })}</Text>
                    </Pressable>
                  </View>
                ) : evolved ? (
                  <Text style={styles.flipHint}>
                    {showOriginal ? t('evolution.tagOriginal') : t('evolution.tagEvolved', { grade: t(`grade.${grade.key}`) })}
                  </Text>
                ) : null}
              </View>
            </Pressable>

            {err ? <Muted style={{ color: colors.energyLo, marginTop: space.sm }}>{err}</Muted> : null}

            {evolved && !busy ? (
              <NeonButton label={t('evolution.share')} color={colors.energyHi} onPress={onShare} style={{ marginTop: space.md }} />
            ) : null}

            <View style={styles.btnRow}>
              <NeonButton
                label={busy ? '…' : t('evolution.reEvolve', { grade: t(`grade.${grade.key}`) })}
                color={colors.cyan}
                disabled={busy || picking}
                onPress={runEvolve}
                style={styles.btn}
              />
              <NeonButton
                label={picking ? '…' : t('evolution.changePhoto')}
                color={colors.violet}
                disabled={busy || picking}
                onPress={onPick}
                style={styles.btn}
              />
            </View>
            <Muted style={{ marginTop: space.sm, fontSize: 10 }}>{t('evolution.privacy')}</Muted>
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000AA',
    borderRadius: radius.md,
  },
  busyText: { color: colors.cyan, fontSize: fontSize.sm, fontWeight: '800', marginTop: space.sm, letterSpacing: 1 },
  busyHint: { color: colors.textDim, fontSize: fontSize.xs, marginTop: 4 },
  cancelBtn: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  cancelText: { color: colors.textDim, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1 },
  flipHint: {
    position: 'absolute',
    bottom: space.sm,
    alignSelf: 'center',
    color: colors.flash,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1,
    backgroundColor: '#000000AA',
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  btnRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  btn: { flex: 1 },
});
