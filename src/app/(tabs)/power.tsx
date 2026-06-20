import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getLatest } from '@/db/repos/combatPowerRepo';
import type { CombatPowerComponent } from '@/features/combat-power/combatPower.types';
import { gradeForScore } from '@/features/combat-power/grades';
import { EvolutionCard } from '@/features/evolution/EvolutionCard';
import { useJuice } from '@/features/juice/JuiceProvider';
import { TIER_DURATION_MS } from '@/features/juice/constants';
import { RankSection } from '@/features/rank/RankSection';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Card, Muted, NeonButton, Screen, SectionTitle } from '@/ui/primitives';
import { colors, displayFamily, fontSize, numberFamily, space } from '@/ui/theme/tokens';

export default function PowerScreen() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const score = useCombatPowerStore((s) => s.score);
  const [breakdown, setBreakdown] = useState<CombatPowerComponent[]>([]);
  const [verifiedRatio, setVerifiedRatio] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const row = await getLatest(db);
        if (!alive || !row) return;
        try {
          setBreakdown(JSON.parse(row.breakdown) as CombatPowerComponent[]);
        } catch {
          setBreakdown([]);
        }
        setVerifiedRatio(row.verified_ratio);
      })();
      return () => {
        alive = false;
      };
    }, [db]),
  );

  const grade = gradeForScore(score);
  const active = breakdown.filter((c) => c.active);
  const juice = useJuice();

  // On-demand T4 supernova — lets you screen-record the hero explosion for a share clip
  // (normally JUICE only fires on a real log). Pure presentation, writes nothing.
  const fireDemo = useCallback(() => {
    juice.fire({
      tier: 4,
      reason: 'session',
      deltaCp: Math.max(150, Math.round(score * 0.04)),
      intensity01: 1,
      dismiss: 'tap',
      durationMs: TIER_DURATION_MS[4],
    });
  }, [juice, score]);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={styles.hero}>
          <Text style={styles.score}>{score}</Text>
          <Text style={[styles.grade, { color: colors.cyan }]}>{t(`grade.${grade.key}`)}</Text>
          <Text style={styles.disclaimer}>{t('power.disclaimer')}</Text>
          <NeonButton label={t('power.demoFire')} color={colors.energyHi} onPress={fireDemo} style={{ marginTop: space.md }} />
        </View>

        <EvolutionCard />

        <RankSection />

        <SectionTitle>{t('power.section.breakdown')}</SectionTitle>
        {active.length === 0 ? (
          <Card>
            <Muted>{t('power.empty')}</Muted>
          </Card>
        ) : (
          <Card>
            {active.map((c) => (
              <View key={c.key} style={styles.row}>
                <Text style={styles.rowLabel}>{t(`cp.component.${c.key}`)}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.round(c.score01 * 100)}%` }]} />
                </View>
                <Text style={styles.rowPct}>{Math.round(c.score01 * 100)}</Text>
              </View>
            ))}
          </Card>
        )}

        <SectionTitle>{t('power.section.verified')}</SectionTitle>
        <Card>
          <Muted>{t('power.verifiedExplainer', { pct: Math.round(verifiedRatio * 100) })}</Muted>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: space.xl },
  score: { color: colors.text, fontFamily: numberFamily, fontSize: fontSize.odometer },
  grade: { fontFamily: displayFamily, fontSize: fontSize.xl, letterSpacing: 3 },
  disclaimer: { color: colors.textDim, fontSize: fontSize.xs, marginTop: space.sm, letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  rowLabel: { color: colors.text, fontSize: fontSize.sm, width: 120 },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.surfaceAlt, borderRadius: 4, overflow: 'hidden', marginHorizontal: space.sm },
  barFill: { height: 8, backgroundColor: colors.cyan, borderRadius: 4 },
  rowPct: { color: colors.textDim, fontSize: fontSize.sm, width: 28, textAlign: 'right' },
});
