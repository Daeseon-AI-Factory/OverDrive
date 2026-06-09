import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { playNamed } from '@/features/juice/audio/engine';
import { colors, fontSize, numberFamily, radius, space } from '@/ui/theme/tokens';
import { useRestTimerStore } from './restTimerStore';

/**
 * Compact rest countdown — appears only while resting (zero clutter otherwise). Auto-started by the
 * logging hot path; ding + haptic at zero; tap to dismiss. Absolute-timestamp based (no drift).
 */
export function RestTimerBar() {
  const { t } = useTranslation();
  const endsAt = useRestTimerStore((s) => s.endsAt);
  const durationSec = useRestTimerStore((s) => s.durationSec);
  const stop = useRestTimerStore((s) => s.stop);
  const [now, setNow] = useState(() => Date.now());
  const dinged = useRef(false);

  useEffect(() => {
    if (!endsAt) return;
    dinged.current = false;
    const iv = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(iv);
  }, [endsAt]);

  useEffect(() => {
    if (!endsAt) return;
    if (now >= endsAt && !dinged.current) {
      dinged.current = true;
      playNamed('t1_tick');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const id = setTimeout(() => stop(), 1500); // linger briefly at 0:00, then clear
      return () => clearTimeout(id);
    }
  }, [now, endsAt, stop]);

  if (!endsAt) return null;
  const remain = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const mm = Math.floor(remain / 60);
  const ss = String(remain % 60).padStart(2, '0');
  const pct = Math.max(0, Math.min(1, remain / durationSec));

  return (
    <Pressable onPress={stop} style={styles.wrap} hitSlop={6}>
      <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      <Text style={styles.label}>
        {t('rest.label')} <Text style={styles.time}>{mm}:{ss}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: space.sm,
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cyan,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#11424d' },
  label: { color: colors.cyan, fontSize: fontSize.sm, fontWeight: '800', letterSpacing: 1 },
  time: { fontFamily: numberFamily, fontSize: fontSize.md },
});
