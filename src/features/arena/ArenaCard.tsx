import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { formatWeight } from '@/lib/units';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted, SectionTitle } from '@/ui/primitives';
import { colors, displayFamily, fontSize, numberFamily, space } from '@/ui/theme/tokens';
import { useArena } from './useArena';

/**
 * ARENA — the daily stakes, in ONE compact card (단순 철칙): the rival growing every day, the weekly
 * gains showdown (improvement-based, always winnable), and this week's boss (your next PR). The
 * reason to open the app every morning.
 */
export function ArenaCard() {
  const { t } = useTranslation();
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
          <Text style={styles.rivalName}>⚔️ {rival.name}</Text>
          <Text style={styles.rivalCp}>
            {rivalCp.toLocaleString()} <Text style={styles.gain}>+{rivalGainToday}</Text>
          </Text>
        </View>
        <Text style={[styles.status, { color: ahead ? colors.success : colors.energyHi }]}>
          {ahead ? t('arena.ahead', { n: margin }) : t('arena.behind', { n: margin })}
        </Text>

        {/* Weekly gains showdown bar */}
        <View style={styles.barTrack}>
          <View
            style={[styles.barFill, { flex: youWeekGain / total, backgroundColor: winning ? colors.cyan : colors.line }]}
          />
          <View
            style={[styles.barFill, { flex: rivalWeekGain / total, backgroundColor: winning ? colors.line : colors.magenta }]}
          />
        </View>
        <View style={styles.row}>
          <Muted>
            {t('arena.weekYou')} +{youWeekGain}
          </Muted>
          <Text style={[styles.verdict, { color: winning ? colors.cyan : colors.magenta }]}>
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
              {bossDefeated ? '☠️' : '👹'} {t('arena.boss')}{' '}
              <Text style={styles.bossTarget}>
                {t(`exercise.${boss.exerciseId}`, { defaultValue: boss.exerciseId })}{' '}
                {boss.isBodyweight
                  ? `×${boss.targetReps}`
                  : `${formatWeight(boss.targetWeight, unitSystem)}×${boss.targetReps}`}
              </Text>
            </Text>
            <Text style={[styles.bossState, { color: bossDefeated ? colors.success : colors.energyLo }]}>
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
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  rivalName: { color: colors.text, fontFamily: displayFamily, fontSize: fontSize.md, letterSpacing: 1 },
  rivalCp: { color: colors.magenta, fontFamily: numberFamily, fontSize: fontSize.lg },
  gain: { color: colors.textDim, fontSize: fontSize.xs },
  status: { fontSize: fontSize.sm, fontWeight: '800', marginTop: 2 },
  barTrack: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: space.md, marginBottom: 4, backgroundColor: colors.surfaceAlt },
  barFill: { height: '100%' },
  verdict: { fontFamily: displayFamily, fontSize: fontSize.sm, letterSpacing: 2 },
  bossRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: space.md },
  bossLabel: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700', flexShrink: 1 },
  bossTarget: { color: colors.energyLo, fontWeight: '900' },
  bossState: { fontSize: fontSize.xs, fontWeight: '900', letterSpacing: 1 },
});
