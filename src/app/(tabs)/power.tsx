import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getLatest } from '@/db/repos/combatPowerRepo';
import type { CombatPowerComponent } from '@/features/combat-power/combatPower.types';
import { gradeForScore } from '@/features/combat-power/grades';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Card, Muted, Screen, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, monoFamily, space } from '@/ui/theme/tokens';

export default function PowerScreen() {
  const db = useSQLiteContext();
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

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={styles.hero}>
          <Text style={styles.score}>{score}</Text>
          <Text style={[styles.grade, { color: colors.cyan }]}>{grade.label}</Text>
          {/* REQUIRED label — spec §6.3 / §11.4 */}
          <Text style={styles.disclaimer}>재미용 자체 산식 · 과학적 지표 아님</Text>
        </View>

        <SectionTitle>구성 (breakdown)</SectionTitle>
        {active.length === 0 ? (
          <Card>
            <Muted>아직 데이터가 없어. 오늘 탭에서 세트를 기록하면 전투력이 나타난다.</Muted>
          </Card>
        ) : (
          <Card>
            {active.map((c) => (
              <View key={c.key} style={styles.row}>
                <Text style={styles.rowLabel}>{c.label}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.round(c.score01 * 100)}%` }]} />
                </View>
                <Text style={styles.rowPct}>{Math.round(c.score01 * 100)}</Text>
              </View>
            ))}
          </Card>
        )}

        <SectionTitle>검증 데이터</SectionTitle>
        <Card>
          <Muted>
            검증 비율 {Math.round(verifiedRatio * 100)}% — 워치/임포트/센서 데이터는 전투력에 가중(보너스)된다.
            Phase 1은 전부 자기보고라 보너스 0. (자기보고도 절대 깎이지 않음.)
          </Muted>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: space.xl },
  score: { color: colors.text, fontFamily: monoFamily, fontSize: fontSize.odometer, fontWeight: '900' },
  grade: { fontSize: fontSize.xl, fontWeight: '900', letterSpacing: 3 },
  disclaimer: { color: colors.textDim, fontSize: fontSize.xs, marginTop: space.sm, letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  rowLabel: { color: colors.text, fontSize: fontSize.sm, width: 120 },
  barTrack: { flex: 1, height: 8, backgroundColor: colors.surfaceAlt, borderRadius: 4, overflow: 'hidden', marginHorizontal: space.sm },
  barFill: { height: 8, backgroundColor: colors.cyan, borderRadius: 4 },
  rowPct: { color: colors.textDim, fontSize: fontSize.sm, width: 28, textAlign: 'right' },
});
