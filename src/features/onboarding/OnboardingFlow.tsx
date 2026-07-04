import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stepper } from '@/features/logging/Stepper';
import { SPLIT_TEMPLATES, templateByKey } from '@/features/program/templates';
import { nowIso } from '@/lib/date';
import type { UserSettings } from '@/lib/settings';
import { displayToKg, kgToDisplay, weightUnit, type UnitSystem } from '@/lib/units';
import { currentSettings, persistSettings, useSettingsStore } from '@/stores/settingsStore';
import { Muted, NeonButton, Screen } from '@/ui/primitives';
import { colors, displayFamily, fontSize, radius, space } from '@/ui/theme/tokens';

const UNIT_SYSTEMS: UnitSystem[] = ['metric', 'imperial'];
const TOTAL_STEPS = 3; // units, weight (+ protein suggestion), split (welcome is step 0, no counter)
const PROTEIN_PER_KG = 1.8; // g/kg/day suggestion (for-fun default; user adjustable)

const roundForUnit = (value: number, unit: UnitSystem) => (unit === 'imperial' ? Math.round(value) : Math.round(value * 2) / 2);
const suggestProtein = (weightKg: number) => Math.round((weightKg * PROTEIN_PER_KG) / 5) * 5;

/**
 * First-run onboarding (spec §5). Skippable at any point — Skip stamps onboardedAt AND keeps
 * everything already entered up to the current step (save-on-skip; it only skips the REMAINING
 * steps). Finishing persists units, bodyweight, a protein target (auto-suggested from weight),
 * and the chosen split. Tap-driven; the only typing is none.
 */
export function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const apply = useSettingsStore((s) => s.apply);

  const [step, setStep] = useState(0);
  const [unit, setUnit] = useState<UnitSystem>(() => useSettingsStore.getState().unitSystem);
  const [weightDisplay, setWeightDisplay] = useState<number>(() => {
    const kg = useSettingsStore.getState().startWeightKg ?? 75;
    return roundForUnit(kgToDisplay(kg, useSettingsStore.getState().unitSystem), useSettingsStore.getState().unitSystem);
  });
  const [templateKey, setTemplateKey] = useState<string>('upperLower');
  const [saving, setSaving] = useState(false);

  const weightKg = displayToKg(weightDisplay, unit);
  const suggested = suggestProtein(weightKg);

  const changeUnit = (next: UnitSystem) => {
    if (next === unit) return;
    const kg = displayToKg(weightDisplay, unit);
    setUnit(next);
    setWeightDisplay(roundForUnit(kgToDisplay(kg, next), next));
  };

  const finish = async (full: boolean) => {
    if (saving) return;
    const prev = currentSettings();
    const patch: Partial<UserSettings> = { onboardedAt: nowIso() };
    // Save-on-skip: keep every value the user already reached — Skip only skips the REMAINING steps.
    if (full || step >= 1) patch.unitSystem = unit;
    if (full || step >= 2) {
      patch.startWeightKg = weightKg;
      patch.proteinTargetG = suggested; // shown on the weight step; adjustable anytime in Settings
    }
    if (full) {
      // 'upperLower' === built-in default → store null (the canonical sentinel); others materialize.
      patch.customProgram = templateKey === 'upperLower' ? null : (templateByKey(templateKey)?.build() ?? null);
    }
    apply(patch);
    setSaving(true);
    const ok = await persistSettings(db);
    setSaving(false);
    if (!ok) {
      apply(prev);
      Alert.alert(t('common.saveFailed'));
      return;
    }
    onDone();
  };

  const next = () => {
    if (saving) return;
    if (step >= TOTAL_STEPS) {
      void finish(true);
      return;
    }
    setStep((s) => s + 1);
  };
  const back = () => {
    if (!saving) setStep((s) => Math.max(0, s - 1));
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        {step > 0 ? <Text style={styles.counter}>{t('onboarding.step', { current: step, total: TOTAL_STEPS })}</Text> : <View />}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void finish(false)} hitSlop={10}>
          <Text style={styles.skip}>{t('onboarding.skip')}</Text>
        </Pressable>
      </View>

      {/* keyboardShouldPersistTaps: don't eat the first tap on +/− / ✓ while the Stepper type-in keyboard is up. */}
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        {step === 0 ? (
          <View style={styles.center}>
            <Text style={styles.brand}>REPLOOM</Text>
            <Text style={styles.welcomeTitle}>{t('onboarding.welcomeTitle')}</Text>
            <Muted style={styles.welcomeBody}>{t('onboarding.welcomeBody')}</Muted>
          </View>
        ) : null}

        {step === 1 ? (
          <View>
            <Text style={styles.stepTitle}>{t('onboarding.units.title')}</Text>
            <Muted style={styles.stepBody}>{t('onboarding.units.body')}</Muted>
            <View style={styles.wrapRow}>
              {UNIT_SYSTEMS.map((u) => (
                <Pressable
                  key={u}
                  accessibilityRole="button"
                  accessibilityState={{ selected: unit === u }}
                  onPress={() => changeUnit(u)}
                  style={[styles.bigPill, unit === u && styles.bigPillActive]}
                >
                  <Text style={[styles.bigPillText, unit === u && styles.bigPillTextActive]}>{t(`settings.units.${u}`)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <Text style={styles.stepTitle}>{t('onboarding.weight.title')}</Text>
            <Muted style={styles.stepBody}>{t('onboarding.weight.body')}</Muted>
            <Stepper
              label={t('onboarding.weight.label')}
              value={weightDisplay}
              // Bodyweight moves in 1s — the 5 lb plate-oriented step can't reach e.g. 172 lb.
              step={1}
              min={unit === 'imperial' ? 66 : 30}
              max={unit === 'imperial' ? 660 : 300}
              precision={unit === 'imperial' ? 0 : 1}
              unit={weightUnit(unit)}
              onChange={setWeightDisplay}
            />
            {/* Protein target folded in here (was its own step — a pure Next-tap: the default WAS the
                suggestion). Derived from weight, saved on finish/skip, adjustable in Settings. */}
            <Muted style={{ marginTop: space.sm }}>
              {`${t('onboarding.protein.label')} — ${t('onboarding.protein.suggested', { value: suggested })}`}
            </Muted>
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <Text style={styles.stepTitle}>{t('onboarding.split.title')}</Text>
            <Muted style={styles.stepBody}>{t('onboarding.split.body')}</Muted>
            {SPLIT_TEMPLATES.map((template) => {
              const active = template.key === templateKey;
              return (
                <Pressable
                  key={template.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setTemplateKey(template.key)}
                  style={[styles.templateCard, active && styles.templateCardActive]}
                >
                  <Text style={[styles.templateTitle, active && { color: colors.cyan }]}>{t(template.titleKey)}</Text>
                  <Muted>{t(template.descKey)}</Muted>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 ? (
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={back} hitSlop={10} style={styles.backBtn}>
            <Text style={styles.backText}>{t('onboarding.back')}</Text>
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <NeonButton
          label={step === 0 ? t('onboarding.start') : step >= TOTAL_STEPS ? t('onboarding.finish') : t('onboarding.next')}
          onPress={next}
          color={colors.energyHi}
          disabled={saving}
          style={styles.nextBtn}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md, minHeight: 28 },
  counter: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '800', letterSpacing: 1 },
  skip: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '800' },
  body: { flexGrow: 1, paddingVertical: space.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl },
  brand: { color: colors.cyan, fontFamily: displayFamily, fontSize: fontSize.xl, letterSpacing: 6, marginBottom: space.lg },
  welcomeTitle: { color: colors.text, fontSize: fontSize.xl, fontWeight: '900', textAlign: 'center' },
  welcomeBody: { textAlign: 'center', marginTop: space.md, lineHeight: 20 },
  stepTitle: { color: colors.text, fontSize: fontSize.xl, fontWeight: '900', marginTop: space.lg },
  stepBody: { marginTop: space.xs, marginBottom: space.lg, lineHeight: 20 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  bigPill: { flexGrow: 1, alignItems: 'center', borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  bigPillActive: { borderColor: colors.cyan, backgroundColor: colors.surfaceAlt },
  bigPillText: { color: colors.textDim, fontSize: fontSize.md, fontWeight: '800' },
  bigPillTextActive: { color: colors.cyan },
  templateCard: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, backgroundColor: colors.surfaceAlt },
  templateCardActive: { borderColor: colors.cyan },
  templateTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '900', marginBottom: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md, gap: space.md },
  backBtn: { minWidth: 64, paddingVertical: space.sm },
  backText: { color: colors.textDim, fontSize: fontSize.md, fontWeight: '800' },
  nextBtn: { flex: 1 },
});
