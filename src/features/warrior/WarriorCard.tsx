import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getLatest } from '@/db/repos/combatPowerRepo';
import type { CombatPowerComponent } from '@/features/combat-power/combatPower.types';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted } from '@/ui/primitives';
import { colors, displayFamily, fontSize, numberFamily, space } from '@/ui/theme/tokens';
import { warriorCompletion, type WarriorAxisKey } from './completion';

const AXIS_COLOR: Record<WarriorAxisKey, string> = {
  strength: colors.cyan,
  physique: colors.magenta,
  discipline: colors.success,
};

/**
 * 전사 완성도 — the north-star surface: real data (strength / physique / discipline) FILLS your
 * warrior toward "complete". Honest mirror (anti-shame §9): physique stays inactive until there's
 * body data (tap → measure), and overall renormalizes over active axes so missing data never drags.
 */
export function WarriorCard() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();
  const [breakdown, setBreakdown] = useState<CombatPowerComponent[]>([]);
  const health = useSettingsStore((s) => s.health);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const targetWeightKg = useSettingsStore((s) => s.targetWeightKg);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const row = await getLatest(db);
        if (!alive) return;
        try {
          setBreakdown(row ? (JSON.parse(row.breakdown) as CombatPowerComponent[]) : []);
        } catch {
          setBreakdown([]);
        }
      })();
      return () => {
        alive = false;
      };
    }, [db]),
  );

  const comp = (key: string) => breakdown.find((c) => c.key === key)?.score01 ?? 0;
  const disciplineTracked = breakdown.find((c) => c.key === 'discipline')?.active ?? false;

  const completion = warriorCompletion({
    strength01: comp('strengthVolume'),
    streak01: comp('streak'),
    discipline01: comp('discipline'),
    disciplineTracked,
    bodyFatFraction: health?.bodyFatFraction ?? null,
    weightKg: health?.bodyMassKg ?? null,
    startWeightKg,
    targetWeightKg,
  });

  const pct = Math.round(completion.overall01 * 100);

  return (
    <Card style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.title}>{t('warrior.title')}</Text>
        <Text style={styles.pct}>{pct}%</Text>
      </View>

      {completion.axes.map((a) => (
        <View key={a.key} style={styles.axisRow}>
          <Text style={styles.axisLabel}>{t(`warrior.axis.${a.key}`)}</Text>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${Math.round(a.fill01 * 100)}%`, backgroundColor: a.active ? AXIS_COLOR[a.key] : colors.line },
              ]}
            />
          </View>
          {a.active ? (
            <Text style={styles.axisPct}>{Math.round(a.fill01 * 100)}</Text>
          ) : (
            <Pressable onPress={() => router.push('/inbody')} hitSlop={8}>
              <Text style={styles.measure}>{t('warrior.measure')}</Text>
            </Pressable>
          )}
        </View>
      ))}

      <Muted style={styles.next}>
        {completion.nextFocus
          ? t('warrior.next', { axis: t(`warrior.axis.${completion.nextFocus}`) })
          : t('warrior.complete')}
      </Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: space.md },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space.sm },
  title: { color: colors.text, fontFamily: displayFamily, fontSize: fontSize.lg, letterSpacing: 2 },
  pct: { color: colors.flash, fontFamily: numberFamily, fontSize: fontSize.xl },
  axisRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 5 },
  axisLabel: { color: colors.text, fontSize: fontSize.sm, width: 64 },
  track: { flex: 1, height: 10, backgroundColor: colors.surfaceAlt, borderRadius: 5, overflow: 'hidden', marginHorizontal: space.sm },
  fill: { height: 10, borderRadius: 5 },
  axisPct: { color: colors.textDim, fontSize: fontSize.sm, width: 30, textAlign: 'right' },
  measure: { color: colors.cyan, fontSize: fontSize.xs, fontWeight: '800', width: 44, textAlign: 'right' },
  next: { marginTop: space.sm },
});
