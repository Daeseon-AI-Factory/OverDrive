import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getLatest } from '@/db/repos/combatPowerRepo';
import type { CombatPowerComponent } from '@/features/combat-power/combatPower.types';
import { useSettingsStore } from '@/stores/settingsStore';
import { Metric, Muted, ProgressTrack, useAccent } from '@/ui/primitives';
import { colors, hangulSafeLetterSpacing, numType, space, tracking, typeScale } from '@/ui/theme/tokens';
import { warriorCompletion } from './completion';

/**
 * 전사 완성도 — the north-star surface: real data (strength / physique / discipline) FILLS your
 * warrior toward "complete". Honest mirror (anti-shame §9): physique stays inactive until there's
 * body data (tap → measure), and overall renormalizes over active axes so missing data never drags.
 *
 * MONOLITH: part of the hero zone under the CP shrine — card chrome is stripped (transparent, no
 * border) so it sits directly on the AmbientAura. One accent: axis fills use the persona accent
 * (→ positive green at complete), never per-axis hues.
 */
export function WarriorCard() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();
  const accent = useAccent();
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
  const title = t('warrior.title');

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { letterSpacing: hangulSafeLetterSpacing(title, tracking.overline) }]}>
          {title}
        </Text>
        <Metric value={pct} unit="%" size="large" />
      </View>

      {completion.axes.map((a) => (
        <View key={a.key} style={styles.axisRow}>
          <Text style={styles.axisLabel}>{t(`warrior.axis.${a.key}`)}</Text>
          <ProgressTrack progress={a.active ? a.fill01 : 0} style={styles.track} />
          {a.active ? (
            <Text style={styles.axisPct}>{Math.round(a.fill01 * 100)}</Text>
          ) : (
            <Pressable onPress={() => router.push('/inbody')} hitSlop={8}>
              <Text style={[styles.measure, { color: accent.solid }]}>{t('warrior.measure')}</Text>
            </Pressable>
          )}
        </View>
      ))}

      <Muted style={styles.next}>
        {completion.nextFocus
          ? t('warrior.next', { axis: t(`warrior.axis.${completion.nextFocus}`) })
          : t('warrior.complete')}
      </Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: space.md },
  title: { ...typeScale.overline, marginBottom: space.xs },
  axisRow: { flexDirection: 'row', alignItems: 'center', marginVertical: space.xs + 1 },
  axisLabel: { fontSize: 13, fontWeight: '400', lineHeight: 18, color: colors.text2, width: 64 },
  track: { flex: 1, marginHorizontal: space.sm },
  axisPct: { ...numType.small, color: colors.text2, width: 32, textAlign: 'right' },
  measure: { ...typeScale.label, width: 44, textAlign: 'right' },
  next: { marginTop: space.md, color: colors.text3 },
});
