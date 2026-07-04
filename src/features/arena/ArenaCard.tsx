import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { formatWeight } from '@/lib/units';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, Metric, Muted, SectionTitle, useAccent } from '@/ui/primitives';
import { colors, space, typeScale } from '@/ui/theme/tokens';
import { useArena } from './useArena';

/**
 * ARENA — the daily stakes, in ONE compact card (단순 철칙): the rival growing every day, the weekly
 * gains showdown (improvement-based, always winnable), and this week's boss (your next PR). The
 * reason to open the app every morning.
 *
 * MONOLITH: neutral card chrome. YOUR side of the showdown bar is the persona accent (your data is
 * what's alive); the rival is monochrome. Win/lose/boss states are small semantic status text only —
 * behind reads as warning (chase framing, anti-shame §9), never red.
 */
export function ArenaCard() {
  const { t } = useTranslation();
  const accent = useAccent();
  const score = useCombatPowerStore((s) => s.score);
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const { rival, rivalCp, rivalGainToday, youWeekGain, rivalWeekGain, boss, bossDefeated } = useArena();

  if (!rival) return null;

  const ahead = score >= rivalCp;
  const margin = Math.abs(score - rivalCp);
  const winning = youWeekGain >= rivalWeekGain;
  const total = Math.max(1, youWeekGain + rivalWeekGain);

  return (
    <View style={styles.wrap}>
      <SectionTitle>{t('arena.title')}</SectionTitle>
      <Card>
        {/* Rival line */}
        <View style={styles.row}>
          <Text style={styles.rivalName} numberOfLines={1}>
            {rival.name}
          </Text>
          <View style={styles.rivalRight}>
            <Metric value={rivalCp.toLocaleString()} unit="CP" size="mid" />
            <Text style={styles.gain}>+{rivalGainToday}</Text>
          </View>
        </View>
        <Text style={[styles.status, { color: ahead ? colors.positive : colors.warning }]}>
          {ahead ? t('arena.ahead', { n: margin }) : t('arena.behind', { n: margin })}
        </Text>

        {/* Weekly gains showdown bar — you = accent, rival = monochrome */}
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { flex: youWeekGain / total, backgroundColor: accent.solid }]} />
          <View style={[styles.barFill, { flex: rivalWeekGain / total, backgroundColor: colors.lineStrong }]} />
        </View>
        <View style={styles.metaRow}>
          <Muted>
            {t('arena.weekYou')} +{youWeekGain}
          </Muted>
          <Text style={[styles.verdict, { color: winning ? colors.positive : colors.warning }]}>
            {winning ? t('arena.winning') : t('arena.losing')}
          </Text>
          <Muted>
            {rival.name} +{rivalWeekGain}
          </Muted>
        </View>

        {/* Weekly boss */}
        {boss ? (
          <View style={styles.bossRow}>
            <Text style={styles.bossLabel}>
              {t('arena.boss')}{' '}
              <Text style={styles.bossTarget}>
                {t(`exercise.${boss.exerciseId}`, { defaultValue: boss.exerciseId })}{' '}
                {boss.isBodyweight
                  ? `×${boss.targetReps}`
                  : `${formatWeight(boss.targetWeight, unitSystem)}×${boss.targetReps}`}
              </Text>
            </Text>
            <Text style={[styles.bossState, { color: bossDefeated ? colors.positive : colors.warning }]}>
              {bossDefeated ? t('arena.bossDown') : t('arena.bossAlive')}
            </Text>
          </View>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rivalName: { ...typeScale.title, color: colors.text, flexShrink: 1, marginRight: space.sm },
  rivalRight: { flexDirection: 'row', alignItems: 'flex-end' },
  gain: { ...typeScale.caption, color: colors.text3, marginLeft: space.xs, paddingBottom: 2 },
  status: { ...typeScale.label, marginTop: space.xs },
  barTrack: {
    flexDirection: 'row',
    columnGap: 2,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: space.md,
    marginBottom: space.sm,
    backgroundColor: colors.recess,
  },
  barFill: { height: '100%' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  verdict: { ...typeScale.label },
  bossRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  bossLabel: { ...typeScale.label, color: colors.text2, flexShrink: 1, marginRight: space.sm },
  bossTarget: { color: colors.text, fontWeight: '600' },
  bossState: { ...typeScale.caption, fontWeight: '600' },
});
