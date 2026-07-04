import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { persistSettings, useSettingsStore } from '@/stores/settingsStore';
import { Button, Card, Muted, Pill, Screen, SectionTitle } from '@/ui/primitives';
import { colors, space, tracking, typeScale } from '@/ui/theme/tokens';
import { generateProgram, type PlanEquipment, type PlanGoal } from './generate';

const GOALS: PlanGoal[] = ['muscle', 'strength', 'lean'];
const DAYS = [2, 3, 4, 5, 6];
const EQUIP: PlanEquipment[] = ['gym', 'bodyweight'];

/**
 * "Lazy mode" — 3 taps (goal · days/week · equipment) → a full week auto-built into customProgram.
 * No slot editor. Lands the user back on Today where ActiveWorkout shows the generated day.
 */
export function AutoPlanScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();
  const apply = useSettingsStore((s) => s.apply);

  const [goal, setGoal] = useState<PlanGoal>('muscle');
  const [days, setDays] = useState(3);
  const [equipment, setEquipment] = useState<PlanEquipment>('gym');
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const program = generateProgram({ goal, daysPerWeek: days, equipment });
      apply({ customProgram: program });
      const ok = await persistSettings(db);
      if (!ok) {
        Alert.alert(t('common.saveFailed'));
        return;
      }
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => router.back()}
            hitSlop={10}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.back}>‹ {t('common.back')}</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>{t('plan.title')}</Text>
        <Muted style={{ marginTop: space.xs }}>{t('plan.note')}</Muted>

        <SectionTitle>{t('plan.goalSection')}</SectionTitle>
        <Card>
          <View style={styles.wrapRow}>
            {GOALS.map((g) => (
              <Pill key={g} label={t(`plan.goal.${g}`)} active={goal === g} onPress={() => setGoal(g)} />
            ))}
          </View>
        </Card>

        <SectionTitle>{t('plan.daysSection')}</SectionTitle>
        <Card>
          <View style={styles.wrapRow}>
            {DAYS.map((d) => (
              <Pill key={d} label={t('plan.days', { n: d })} active={days === d} onPress={() => setDays(d)} />
            ))}
          </View>
        </Card>

        <SectionTitle>{t('plan.equipSection')}</SectionTitle>
        <Card>
          <View style={styles.wrapRow}>
            {EQUIP.map((e) => (
              <Pill key={e} label={t(`plan.equip.${e}`)} active={equipment === e} onPress={() => setEquipment(e)} />
            ))}
          </View>
        </Card>

        {/* THE one solid-accent CTA of this screen. */}
        <View style={{ marginTop: space.lg }}>
          <Button label={t('plan.generate')} disabled={busy} onPress={() => void generate()} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { marginTop: space.md },
  // Nav is chrome, not signal — monochrome text2, no accent.
  back: { fontSize: 15, fontWeight: '600', letterSpacing: tracking.none, color: colors.text2 },
  title: { ...typeScale.title, color: colors.text, marginTop: space.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
