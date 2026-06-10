import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { gradeForScore } from '@/features/combat-power/grades';
import { QUICKLOG_ENDPOINT } from '@/features/quicklog/config';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Card, Muted, NeonButton, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, radius, space } from '@/ui/theme/tokens';
import { EVOLVED_PATH, ORIGINAL_PATH, evolve, hasEvolved, hasOriginal, pickPhoto } from './evolveClient';

/**
 * EVOLUTION — your own photo, transformed by the AI to match your grade. The shareable hero moment
 * (the "aura farming" shot). Anti-shame (§9): transformations only flatter and only move UP — a
 * grade drop never downgrades the image. Photo goes through the Worker pass-through only.
 */
export function EvolutionCard() {
  const { t } = useTranslation();
  const score = useCombatPowerStore((s) => s.score);
  const grade = gradeForScore(score);

  const [orig, setOrig] = useState(false);
  const [evolved, setEvolved] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cacheBust, setCacheBust] = useState(0);

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
    setBusy(true);
    setErr(null);
    try {
      await evolve(QUICKLOG_ENDPOINT, grade.key);
      setEvolved(true);
      setShowOriginal(false);
      setCacheBust((n) => n + 1); // bust Image cache for the rewritten file
    } catch (e) {
      setErr(`${t('evolution.fail')} ${(e instanceof Error ? e.message : '').slice(0, 80)}`);
    } finally {
      setBusy(false);
    }
  }, [grade.key, t]);

  const onPick = useCallback(async () => {
    setErr(null);
    const uri = await pickPhoto().catch(() => null);
    if (!uri) return;
    setOrig(true);
    await runEvolve();
  }, [runEvolve]);

  return (
    <View>
      <SectionTitle>{t('evolution.title')}</SectionTitle>
      <Card>
        {!orig ? (
          <>
            <Muted>{t('evolution.intro')}</Muted>
            <NeonButton label={t('evolution.pick')} color={colors.violet} onPress={onPick} style={{ marginTop: space.md }} />
          </>
        ) : (
          <>
            {evolved || busy ? (
              <Pressable onPress={() => setShowOriginal((v) => !v)} disabled={busy}>
                <View>
                  <Image
                    source={{ uri: `${showOriginal ? ORIGINAL_PATH : EVOLVED_PATH}?v=${cacheBust}` }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                  {busy ? (
                    <View style={styles.busyOverlay}>
                      <ActivityIndicator color={colors.cyan} size="large" />
                      <Text style={styles.busyText}>{t('evolution.evolving')}</Text>
                    </View>
                  ) : (
                    <Text style={styles.flipHint}>
                      {showOriginal ? t('evolution.tagOriginal') : t('evolution.tagEvolved', { grade: t(`grade.${grade.key}`) })}
                    </Text>
                  )}
                </View>
              </Pressable>
            ) : null}

            {err ? <Muted style={{ color: colors.energyLo, marginTop: space.sm }}>{err}</Muted> : null}

            <View style={styles.btnRow}>
              <NeonButton
                label={busy ? '…' : t('evolution.reEvolve', { grade: t(`grade.${grade.key}`) })}
                color={colors.cyan}
                disabled={busy}
                onPress={runEvolve}
                style={styles.btn}
              />
              <NeonButton label={t('evolution.changePhoto')} color={colors.violet} disabled={busy} onPress={onPick} style={styles.btn} />
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
