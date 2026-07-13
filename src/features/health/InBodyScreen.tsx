import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getLatestBodyCompositionEntry, saveBodyCompositionEntry } from '@/db/repos/bodyCompositionRepo';
import { Stepper } from '@/features/logging/Stepper';
import { displayToKg, kgToDisplay, weightUnit } from '@/lib/units';
import { currentSettings, useSettingsStore } from '@/stores/settingsStore';
import { Button, Card, Muted, Screen, SectionTitle } from '@/ui/primitives';
import { colors, space, tracking, typeScale } from '@/ui/theme/tokens';
import { healthAvailable, writeBodyComposition } from './health';

/**
 * InBody / body-composition entry — dead simple: punch in weight + body-fat with steppers, hit save,
 * and it updates your profile weight (local source of truth, ALWAYS saved first) then uploads to
 * Apple Health (bodyMass + bodyFatPercentage) best-effort — a Health auth failure never discards
 * the entry. Real measured data only; no game numbers go to Health (§4). Muscle/lean mass
 * intentionally omitted to keep this the simplest possible surface.
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
  const edited = useRef(false);

  useEffect(() => {
    let mounted = true;
    void getLatestBodyCompositionEntry(db)
      .then((latest) => {
        if (!mounted || edited.current || !latest) return;
        setWeightDisp(kgToDisplay(latest.weight_kg, unitSystem));
        setBodyFatPct(Math.round(latest.body_fat_fraction * 100));
      })
      .catch((e) => console.error('[inbody] load latest failed', e));
    return () => {
      mounted = false;
    };
  }, [db, unitSystem]);

  const save = async () => {
    // A pending initial-load promise must never overwrite values the user has chosen to save.
    edited.current = true;
    setBusy(true);
    setSaved(false);
    try {
      const weightKg = displayToKg(weightDisp, unitSystem);
      const fraction = bodyFatPct / 100;
      const nextSettings = { ...currentSettings(), startWeightKg: weightKg };
      // Local save FIRST: append both measured values and update profile weight in one transaction.
      // Only reflect it in memory after SQLite commits, so a partial save can never look successful.
      await saveBodyCompositionEntry(db, { weightKg, bodyFatFraction: fraction }, nextSettings);
      apply({ startWeightKg: weightKg });
      setSaved(true);
      // Then best-effort Apple Health upload. On failure the local save stands — say exactly that.
      const healthOk = await writeBodyComposition({ weightKg, bodyFatFraction: fraction });
      if (healthAvailable() && !healthOk) {
        Alert.alert(t('inbody.saved'), t('inbody.saveFailed'));
      }
    } catch {
      Alert.alert(t('common.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {/* keyboardShouldPersistTaps: don't eat the first tap on +/− / ✓ while the Stepper type-in keyboard is up. */}
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.xxl }}>
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
        <Text style={styles.title}>{t('inbody.title')}</Text>
        <Muted style={{ marginTop: space.xs }}>{t('inbody.note')}</Muted>

        <SectionTitle>{t('inbody.section')}</SectionTitle>
        <Card>
          <Stepper
            label={t('settings.profile.bodyweight')}
            value={weightDisp}
            // Bodyweight moves in 1s — the 5 lb plate-oriented step can't reach e.g. 172 lb.
            step={1}
            min={unitSystem === 'imperial' ? 66 : 30}
            max={unitSystem === 'imperial' ? 660 : 300}
            precision={unitSystem === 'imperial' ? 0 : 1}
            unit={weightUnit(unitSystem)}
            onChange={(v) => {
              edited.current = true;
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
              edited.current = true;
              setBodyFatPct(v);
              setSaved(false);
            }}
          />
        </Card>

        {/* THE one solid-accent CTA of this screen; the saved state speaks through the label. */}
        <View style={{ marginTop: space.lg }}>
          <Button label={saved ? t('inbody.saved') : t('inbody.save')} disabled={busy} onPress={() => void save()} />
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
});
