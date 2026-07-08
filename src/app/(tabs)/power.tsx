import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getLatest } from '@/db/repos/combatPowerRepo';
import type { CombatPowerComponent } from '@/features/combat-power/combatPower.types';
import { gradeForScore } from '@/features/combat-power/grades';
import { EvolutionCard } from '@/features/evolution/EvolutionCard';
import { AmbientAura } from '@/features/juice/AmbientAura';
import { useJuice } from '@/features/juice/JuiceProvider';
import { TIER_DURATION_MS } from '@/features/juice/constants';
import { RankSection } from '@/features/rank/RankSection';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Button, Card, Metric, Muted, ProgressTrack, Screen, SectionTitle, useAccent } from '@/ui/primitives';
import { colors, displayGrade, hasHangul, numType, space, tracking, typeScale } from '@/ui/theme/tokens';

export default function PowerScreen() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const accent = useAccent();
  const score = useCombatPowerStore((s) => s.score);
  const [breakdown, setBreakdown] = useState<CombatPowerComponent[]>([]);
  const [verifiedRatio, setVerifiedRatio] = useState(0);
  // Don't flash 'No data yet' before the first DB read resolves; stays true on refocus (stale data > flicker).
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const row = await getLatest(db);
        if (!alive) return;
        if (row) {
          try {
            setBreakdown(JSON.parse(row.breakdown) as CombatPowerComponent[]);
          } catch {
            setBreakdown([]);
          }
          setVerifiedRatio(row.verified_ratio);
        }
        setLoaded(true);
      })();
      return () => {
        alive = false;
      };
    }, [db]),
  );

  const grade = gradeForScore(score);
  const gradeWord = t(`grade.${grade.key}`);
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
    <Screen background={<AmbientAura />}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        {/* The shrine — biggest single element in the app. Glow slot 1 of 2 = the CP number. */}
        <View style={styles.hero}>
          <Metric value={score} unit="CP" size="heroXL" />
          {/* Anton is Latin-only (Hangul renders fallback tofu) — Korean grade words drop to system 600. */}
          <Text style={[hasHangul(gradeWord) ? styles.gradeHangul : styles.grade, { color: accent.solid }]}>
            {gradeWord}
          </Text>
          <Text style={styles.disclaimer}>{t('power.disclaimer')}</Text>
        </View>

        <EvolutionCard />

        <RankSection />

        {loaded ? (
          <>
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
                    <ProgressTrack progress={c.score01} style={styles.rowTrack} />
                    <Text style={styles.rowPct}>{Math.round(c.score01 * 100)}</Text>
                  </View>
                ))}
              </Card>
            )}

            <SectionTitle>{t('power.section.verified')}</SectionTitle>
            <Card>
              <Muted>{t('power.verifiedExplainer', { pct: Math.round(verifiedRatio * 100) })}</Muted>
            </Card>
          </>
        ) : null}

        {/* Demo replay — a utility, not a hero: ghost + bottom of the scroll, far from the shrine. */}
        <Button label={t('power.demoFire')} onPress={fireDemo} variant="ghost" compact style={styles.demoBtn} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: space.xl },
  grade: { ...displayGrade, marginTop: space.xs },
  // System-font fallback for Hangul grade words (Anton has no Hangul glyphs); tracking ≤0.5.
  gradeHangul: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: tracking.hangulMax,
    marginTop: space.xs,
  },
  disclaimer: { ...typeScale.caption, color: colors.text3, marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', height: 28 },
  rowLabel: { fontSize: 13, fontWeight: '400', lineHeight: 18, color: colors.text2, width: 112 },
  rowTrack: { flex: 1, marginHorizontal: space.sm },
  rowPct: { ...numType.small, color: colors.text, width: 32, textAlign: 'right' },
  demoBtn: { marginTop: space.xl, alignSelf: 'center' },
});
