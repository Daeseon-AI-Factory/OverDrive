import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { formatWeight } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Muted, NeonButton } from '@/ui/primitives';
import { colors, fontSize, monoFamily, space } from '@/ui/theme/tokens';
import { useSessionStore } from './sessionStore';

function useElapsed(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return '0:00';
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** ENTER THE FORGE button when idle; the active-session bar (timer · sets · volume · FINISH) when in. */
export function ForgeBar({ onEnter, onFinish }: { onEnter: () => void; onFinish: () => void }) {
  const { t } = useTranslation();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const startedAt = useSessionStore((s) => s.startedAt);
  const setCount = useSessionStore((s) => s.setCount);
  const volumeKg = useSessionStore((s) => s.volumeKg);
  const elapsed = useElapsed(startedAt);

  if (!activeSessionId) {
    return (
      <View style={styles.enterWrap}>
        <NeonButton label={t('forge.enter')} color={colors.energyHi} onPress={onEnter} />
        <Muted style={styles.hint}>{t('forge.hint')}</Muted>
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      <View style={{ flex: 1 }}>
        <Text style={styles.activeLabel}>{t('forge.active')}</Text>
        <Text style={styles.activeStats}>
          {elapsed} · {t('forge.summary.sets', { count: setCount })} · {formatWeight(volumeKg, unitSystem, 0) || '—'}
        </Text>
      </View>
      <NeonButton label={t('forge.finish')} color={colors.success} onPress={onFinish} style={{ paddingHorizontal: space.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  enterWrap: { marginTop: space.lg },
  hint: { textAlign: 'center', marginTop: space.sm },
  bar: {
    marginTop: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.success,
    padding: space.md,
  },
  activeLabel: { color: colors.success, fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 2 },
  activeStats: { color: colors.text, fontFamily: monoFamily, fontSize: fontSize.md, fontWeight: '700', marginTop: 2 },
});
