import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stepper } from '@/features/logging/Stepper';
import { displayToKg, kgToDisplay, weightStepDisplay, weightUnit } from '@/lib/units';
import { persistSettings, useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted, NeonButton, Screen, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, space } from '@/ui/theme/tokens';
import { writeBodyComposition } from './health';

/**
 * InBody / body-composition entry — dead simple: punch in weight + body-fat with steppers, hit save,
 * and it uploads to Apple Health (bodyMass + bodyFatPercentage) and updates your profile weight.
 * Real measured data only; no game numbers go to Health (§4). Muscle/lean mass intentionally omitted
 * to keep this the simplest possible surface.
 */
export function InBodyScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const health = useSettingsStore((s) => s.health);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const apply = useSettingsStore((s) => s.apply);

  const initialWeightKg = health?.bodyMassKg ?? startWeightKg ?? 75;
  const initialFatPct =
    health?.bodyFatFraction != null ? Math.round(health.bodyFatFraction <= 1 ? health.bodyFatFraction * 100 : health.bodyFatFraction) : 20;

  const [weightDisp, setWeightDisp] = useState(kgToDisplay(initialWeightKg, unitSystem));
  const [bodyFatPct, setBodyFatPct] = useState(initialFatPct);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setSaved(false);
    try {
      const weightKg = displayToKg(weightDisp, unitSystem);
      const fraction = bodyFatPct / 100;
      await writeBodyComposition({ weightKg, bodyFatFraction: fraction });
      // Profile weight is the local source of truth (strength-to-weight, protein target).
      apply({ startWeightKg: weightKg });
      await persistSettings(db);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.back}>‹ {t('common.back')}</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>{t('inbody.title')}</Text>
        <Muted style={{ marginTop: space.xs }}>{t('inbody.note')}</Muted>

        <SectionTitle>{t('inbody.section')}</SectionTitle>
        <Card>
          <Stepper
            label={t('settings.profile.bodyweight')}
            value={weightDisp}
            step={weightStepDisplay(unitSystem, 1)}
            min={unitSystem === 'imperial' ? 66 : 30}
            max={unitSystem === 'imperial' ? 660 : 300}
            precision={unitSystem === 'imperial' ? 0 : 1}
            unit={weightUnit(unitSystem)}
            onChange={(v) => {
              setWeightDisp(v);
              setSaved(false);
            }}
          />
          <Stepper
            label={t('inbody.bodyFat')}
            value={bodyFatPct}
            step={1}
            min={3}
            max={60}
            precision={0}
            unit="%"
            onChange={(v) => {
              setBodyFatPct(v);
              setSaved(false);
            }}
          />
        </Card>

        <View style={{ marginTop: space.lg }}>
          <NeonButton label={saved ? t('inbody.saved') : t('inbody.save')} color={saved ? colors.success : colors.cyan} disabled={busy} onPress={() => void save()} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { marginTop: space.md },
  back: { color: colors.cyan, fontSize: fontSize.md, fontWeight: '800' },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '900', marginTop: space.sm },
});
