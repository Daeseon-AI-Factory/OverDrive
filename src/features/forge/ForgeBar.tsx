import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { formatWeight } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button, Card, Muted } from '@/ui/primitives';
import { colors, numType, space, typeScale } from '@/ui/theme/tokens';
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

/**
 * ENTER THE FORGE button when idle; the active-session bar (timer · sets · volume · FINISH) when in.
 *
 * MONOLITH: the active bar merges into the live card's language — `Card live` gives it the same 2pt
 * accent rail + accent eyebrow as ActiveWorkoutCard (no LiveDot here: the glow budget's slot 2 lives
 * on ActiveWorkoutCard). Timer digits are Orbitron; words stay system text. Finish = secondary tint
 * (the screen's ONE solid-accent primary belongs to ActiveWorkoutCard).
 */
export function ForgeBar({ onEnter, onFinish }: { onEnter: () => void; onFinish: () => void }) {
  const { t } = useTranslation();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const startedAt = useSessionStore((s) => s.startedAt);
  const setCount = useSessionStore((s) => s.setCount);
  const volumeKg = useSessionStore((s) => s.volumeKg);
  const pendingLogWrites = useSessionStore((s) => s.pendingLogWrites);
  const finishing = useSessionStore((s) => s.finishing);
  const elapsed = useElapsed(startedAt);

  if (!activeSessionId) {
    return (
      <View style={styles.enterWrap}>
        <Button label={t('forge.enter')} onPress={onEnter} variant="secondary" />
        <Muted style={styles.hint}>{t('forge.hint')}</Muted>
      </View>
    );
  }

  return (
    <Card live eyebrow={t('forge.active')} style={styles.bar}>
      <View style={styles.row}>
        <View style={styles.statsRow}>
          <Text style={styles.timer}>{elapsed}</Text>
          <Text style={styles.statsMeta} numberOfLines={1}>
            {' · '}
            {t('forge.summary.sets', { count: setCount })} · {formatWeight(volumeKg, unitSystem, 0) || '—'}
          </Text>
        </View>
        <Button
          label={t('forge.finish')}
          onPress={onFinish}
          variant="secondary"
          compact
          disabled={pendingLogWrites > 0 || finishing}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  enterWrap: { marginTop: space.lg },
  hint: { textAlign: 'center', marginTop: space.sm, color: colors.text3 },
  bar: { marginTop: space.md, padding: space.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  statsRow: { flex: 1, flexDirection: 'row', alignItems: 'flex-end' },
  timer: { ...numType.mid, color: colors.text },
  statsMeta: { ...typeScale.caption, color: colors.text2, paddingBottom: 2, flexShrink: 1 },
});
