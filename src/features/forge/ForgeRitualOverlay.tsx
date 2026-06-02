import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { auraFromCp } from '@/features/character/auraFromCp';
import { formatWeight } from '@/lib/units';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { colors, displayFamily, fontSize, numberFamily, space } from '@/ui/theme/tokens';
import { useSessionStore, type ForgeRitual } from './sessionStore';

/**
 * The Forge entry/completion ritual — the "entering the training chamber" moment (spec §6.4 hero).
 * v0 is Reanimated (dim → aura flare → callout / supernova + summary). The SkSL ambient-chamber +
 * particle version is the on-device fast-follow. Entry auto-dismisses; completion waits for a tap.
 */
export function ForgeRitualOverlay() {
  const ritual = useSessionStore((s) => s.ritual);
  const clearRitual = useSessionStore((s) => s.clearRitual);
  if (!ritual) return null;
  return <Ritual key={ritual.id} ritual={ritual} onDone={clearRitual} />;
}

function Ritual({ ritual, onDone }: { ritual: ForgeRitual; onDone: () => void }) {
  const { t } = useTranslation();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const score = useCombatPowerStore((s) => s.score);
  const color = auraFromCp(score).color;
  const isEnter = ritual.kind === 'enter';
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = 0;
    p.value = withTiming(1, { duration: isEnter ? 1600 : 800, easing: Easing.out(Easing.cubic) }, (finished) => {
      'worklet';
      if (finished && isEnter) runOnJS(onDone)();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dim = useAnimatedStyle(() => ({
    opacity: isEnter ? interpolate(p.value, [0, 0.2, 0.85, 1], [0, 0.94, 0.94, 0]) : 0.95,
  }));
  const flare = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.3, 0.7, 1], [0, 0.5, 0.35, isEnter ? 0 : 0.25]),
    transform: [{ scale: interpolate(p.value, [0, 0.5, 1], [0.4, 1.3, 1.7]) }],
  }));
  const flash = useAnimatedStyle(() => ({
    opacity: isEnter ? 0 : interpolate(p.value, [0, 0.1, 0.45], [0, 0.85, 0]),
  }));
  const title = useAnimatedStyle(() => ({
    opacity: isEnter
      ? interpolate(p.value, [0.15, 0.35, 0.8, 1], [0, 1, 1, 0])
      : interpolate(p.value, [0.1, 0.4, 1], [0, 1, 1]),
    transform: [{ scale: interpolate(p.value, [0.1, 0.45, 1], [0.7, 1.1, 1]) }],
  }));
  const summaryStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0.4, 0.8, 1], [0, 1, 1]),
    transform: [{ translateY: interpolate(p.value, [0.4, 1], [24, 0]) }],
  }));

  const s = ritual.summary;

  return (
    <View style={[StyleSheet.absoluteFill, styles.root]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg }, dim]} pointerEvents="none" />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.flash }, flash]} pointerEvents="none" />
      <Animated.View style={[styles.flare, { backgroundColor: color, shadowColor: color }, flare]} pointerEvents="none" />

      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} />

      <View style={styles.center} pointerEvents="none">
        <Animated.Text style={[styles.title, { color, textShadowColor: color }, title]}>
          {isEnter ? t('forge.enter') : t('forge.complete')}
        </Animated.Text>

        {isEnter ? (
          <Text style={styles.subtitle}>{t('forge.subtitle')}</Text>
        ) : s ? (
          <Animated.View style={[styles.summary, summaryStyle]}>
            <Text style={styles.summaryLine}>{t('forge.summary.sets', { count: s.sets })}</Text>
            <Text style={styles.summaryLine}>{t('forge.summary.volume', { vol: formatWeight(s.volumeKg, unitSystem, 0) || '—' })}</Text>
            <Text style={[styles.summaryLine, { color }]}>{t('forge.summary.cpGained', { delta: Math.max(0, Math.round(s.deltaCp)) })}</Text>
            {s.streakDays > 0 ? <Text style={styles.summaryLine}>{t('forge.summary.streak', { days: s.streakDays })}</Text> : null}
            <Text style={styles.tapHint}>{t('forge.tapToContinue')}</Text>
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', zIndex: 50, elevation: 50 },
  flare: { position: 'absolute', width: '90%', aspectRatio: 1, borderRadius: 999, shadowOpacity: 0.9, shadowRadius: 60, shadowOffset: { width: 0, height: 0 } },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  title: { fontFamily: displayFamily, fontSize: fontSize.hero, letterSpacing: 4, textAlign: 'center', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 30 },
  subtitle: { color: colors.textDim, fontSize: fontSize.sm, marginTop: space.md, letterSpacing: 2 },
  summary: { alignItems: 'center', marginTop: space.lg },
  summaryLine: { color: colors.text, fontFamily: numberFamily, fontSize: fontSize.lg, marginVertical: 4 },
  tapHint: { color: colors.textDim, fontSize: fontSize.xs, marginTop: space.lg, letterSpacing: 1 },
});
