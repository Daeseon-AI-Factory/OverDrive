import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { DayType } from '@/db/types';
import { persistSettings, useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted, Screen } from '@/ui/primitives';
import { colors, fontSize, numberFamily, radius, space } from '@/ui/theme/tokens';
import { defaultWeeklyProgram, slotFromExerciseId } from './defaultProgram';
import { ProgramExercisePicker } from './ProgramExercisePicker';
import { SPLIT_TEMPLATES } from './templates';
import type { ProgramDayConfig, ProgramSlot, WeeklyProgram } from './types';

const DEFAULT_TEMPLATE_KEY = SPLIT_TEMPLATES[0]!.key; // 'upperLower' === the built-in default → store as null

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun (Date.getDay() values)
const WEEKDAY_KEY: Record<number, string> = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };
const DAY_TYPES: DayType[] = ['upper', 'lower', 'cardio', 'rest'];
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

type DayMode = 'strength' | 'cardio' | 'rest';
const modeOf = (dayType: DayType): DayMode => (dayType === 'rest' ? 'rest' : dayType === 'cardio' ? 'cardio' : 'strength');

function MiniAdjust({
  label,
  value,
  onChange,
  min,
  max,
  a11yLabel,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  a11yLabel: string;
}) {
  return (
    <View style={styles.mini}>
      <Text style={styles.miniLabel}>{label}</Text>
      <View style={styles.miniRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${a11yLabel} -`}
          onPress={() => onChange(clamp(value - 1, min, max))}
          style={({ pressed }) => [styles.miniBtn, pressed && styles.pressed]}
          hitSlop={6}
        >
          <Text style={styles.miniBtnText}>−</Text>
        </Pressable>
        <Text style={styles.miniValue}>{value}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${a11yLabel} +`}
          onPress={() => onChange(clamp(value + 1, min, max))}
          style={({ pressed }) => [styles.miniBtn, pressed && styles.pressed]}
          hitSlop={6}
        >
          <Text style={styles.miniBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function ProgramEditorScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();
  const apply = useSettingsStore((s) => s.apply);

  // Normalize to a full 7-day program: overlay any stored days on a complete default base so every
  // weekday key is guaranteed present (resolve/useTodayProgram tolerate partial programs; the editor
  // dereferences all 7 days, so a sparse stored program — e.g. from a future sync — would crash it).
  const [draft, setDraft] = useState<WeeklyProgram>(() => {
    const stored = useSettingsStore.getState().customProgram;
    return stored ? { ...defaultWeeklyProgram(), ...stored } : defaultWeeklyProgram();
  });
  const [selected, setSelected] = useState<number>(() => new Date().getDay());
  const [pickerOpen, setPickerOpen] = useState(false);

  const day = draft[selected]!;
  const mode = modeOf(day.dayType);

  const save = (next: WeeklyProgram | null) => {
    apply({ customProgram: next });
    void persistSettings(db).then((ok) => {
      if (!ok) Alert.alert(t('common.saveFailed'));
    });
  };

  const persist = (next: WeeklyProgram) => {
    setDraft(next);
    save(next);
  };

  const updateDay = (next: ProgramDayConfig) => persist({ ...draft, [selected]: next });

  // The default split round-trips to null (the canonical "use built-in default" sentinel), matching
  // onboarding + Reset — so Settings shows "Default", not "Custom", and Today stays reactive.
  const resetToDefault = () => {
    setDraft(defaultWeeklyProgram());
    save(null);
  };

  const applyTemplate = (key: string) => {
    if (key === DEFAULT_TEMPLATE_KEY) {
      resetToDefault();
      return;
    }
    const template = SPLIT_TEMPLATES.find((tpl) => tpl.key === key);
    if (template) persist(template.build());
  };

  const setDayType = (dayType: DayType) => {
    if (dayType === day.dayType) return;
    const keepSlots = modeOf(dayType) === mode && dayType !== 'rest';
    updateDay({ ...day, dayType, slots: keepSlots ? day.slots : [] });
  };

  const setLabel = (label: string) => updateDay({ ...day, label });

  const addExercise = (exerciseId: string) => {
    setPickerOpen(false);
    if (day.slots.some((slot) => slot.exerciseId === exerciseId)) return;
    updateDay({ ...day, slots: [...day.slots, slotFromExerciseId(exerciseId)] });
  };

  const updateSlot = (index: number, patch: Partial<ProgramSlot>) => {
    const slots = day.slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot));
    updateDay({ ...day, slots });
  };

  const removeSlot = (index: number) => updateDay({ ...day, slots: day.slots.filter((_, i) => i !== index) });

  const moveSlot = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= day.slots.length) return;
    const slots = [...day.slots];
    [slots[index], slots[target]] = [slots[target]!, slots[index]!];
    updateDay({ ...day, slots });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{t('programEditor.title')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <Muted style={styles.subtitle}>{t('programEditor.subtitle')}</Muted>

        {/* Templates */}
        <Text style={styles.sectionLabel}>{t('programEditor.templatesLabel')}</Text>
        <View style={styles.wrapRow}>
          {SPLIT_TEMPLATES.map((template) => (
            <Pressable
              key={template.key}
              accessibilityRole="button"
              accessibilityLabel={t(template.titleKey)}
              onPress={() => applyTemplate(template.key)}
              style={({ pressed }) => [styles.templatePill, pressed && styles.pressed]}
            >
              <Text style={styles.templateTitle}>{t(template.titleKey)}</Text>
              <Muted>{t(template.descKey)}</Muted>
            </Pressable>
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={resetToDefault} hitSlop={8} style={styles.resetBtn}>
          <Text style={styles.resetText}>{t('programEditor.reset')}</Text>
        </Pressable>

        {/* Weekday selector */}
        <Text style={styles.sectionLabel}>{t('programEditor.weekLabel')}</Text>
        <View style={styles.wrapRow}>
          {WEEKDAY_ORDER.map((weekday) => {
            const active = weekday === selected;
            const count = draft[weekday]!.slots.length;
            return (
              <Pressable
                key={weekday}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setSelected(weekday)}
                style={[styles.dayPill, active && styles.dayPillActive]}
              >
                <Text style={[styles.dayPillText, active && styles.dayPillTextActive]}>{t(`programEditor.weekday.${WEEKDAY_KEY[weekday]}`)}</Text>
                <Text style={[styles.dayPillCount, active && styles.dayPillTextActive]}>{draft[weekday]!.dayType === 'rest' ? '·' : count}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Day editor */}
        <Card style={styles.dayCard}>
          <Text style={styles.sectionLabel}>{t('programEditor.dayTypeLabel')}</Text>
          <View style={styles.wrapRow}>
            {DAY_TYPES.map((dt) => (
              <Pressable
                key={dt}
                accessibilityRole="button"
                accessibilityState={{ selected: day.dayType === dt }}
                onPress={() => setDayType(dt)}
                style={[styles.typePill, day.dayType === dt && styles.typePillActive]}
              >
                <Text style={[styles.typePillText, day.dayType === dt && styles.typePillTextActive]}>{t(`program.dayType.${dt}`)}</Text>
              </Pressable>
            ))}
          </View>

          {day.dayType !== 'rest' ? (
            <>
              <Text style={[styles.sectionLabel, { marginTop: space.md }]}>{t('programEditor.dayNameLabel')}</Text>
              <TextInput
                value={day.label ?? (day.labelKey ? t(day.labelKey) : '')}
                onChangeText={setLabel}
                placeholder={t('programEditor.dayNamePlaceholder')}
                accessibilityLabel={t('programEditor.dayNameLabel')}
                placeholderTextColor={colors.textDim}
                style={styles.nameInput}
                maxLength={24}
              />
            </>
          ) : null}

          {day.dayType === 'rest' ? (
            <Muted style={{ marginTop: space.md }}>{t('programEditor.restDay')}</Muted>
          ) : (
            <>
              {day.slots.length === 0 ? <Muted style={{ marginTop: space.md }}>{t('programEditor.empty')}</Muted> : null}
              {day.slots.map((slot, index) => (
                <View key={`${slot.exerciseId}-${index}`} style={styles.slot}>
                  <View style={styles.slotHead}>
                    <Text style={styles.slotName}>{t(`exercise.${slot.exerciseId}`)}</Text>
                    <View style={styles.slotActions}>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('programEditor.moveUp')} accessibilityState={{ disabled: index === 0 }} disabled={index === 0} onPress={() => moveSlot(index, -1)} hitSlop={6} style={({ pressed }) => [styles.iconBtn, index === 0 && styles.disabled, pressed && styles.pressed]}>
                        <Text style={styles.iconText}>↑</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('programEditor.moveDown')} accessibilityState={{ disabled: index === day.slots.length - 1 }} disabled={index === day.slots.length - 1} onPress={() => moveSlot(index, 1)} hitSlop={6} style={({ pressed }) => [styles.iconBtn, index === day.slots.length - 1 && styles.disabled, pressed && styles.pressed]}>
                        <Text style={styles.iconText}>↓</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('programEditor.remove')} onPress={() => removeSlot(index)} hitSlop={6} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
                        <Text style={[styles.iconText, { color: colors.danger }]}>✕</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={styles.slotControls}>
                    <MiniAdjust label={t('programEditor.setsLabel')} value={slot.targetSets} onChange={(v) => updateSlot(index, { targetSets: v })} min={1} max={10} a11yLabel={`${t(`exercise.${slot.exerciseId}`)} ${t('programEditor.setsLabel')}`} />
                    {mode === 'strength' ? (
                      <>
                        <MiniAdjust label={t('programEditor.repLow')} value={slot.repLow} onChange={(v) => updateSlot(index, { repLow: v, repHigh: Math.max(v, slot.repHigh) })} min={1} max={100} a11yLabel={`${t(`exercise.${slot.exerciseId}`)} ${t('programEditor.repLow')}`} />
                        <MiniAdjust label={t('programEditor.repHigh')} value={slot.repHigh} onChange={(v) => updateSlot(index, { repHigh: Math.max(v, slot.repLow) })} min={1} max={100} a11yLabel={`${t(`exercise.${slot.exerciseId}`)} ${t('programEditor.repHigh')}`} />
                      </>
                    ) : null}
                  </View>
                </View>
              ))}

              <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}>
                <Text style={styles.addText}>{t('programEditor.addExercise')}</Text>
              </Pressable>
            </>
          )}
        </Card>
      </ScrollView>

      <ProgramExercisePicker
        visible={pickerOpen}
        mode={mode === 'rest' ? 'strength' : mode}
        existingIds={day.slots.map((slot) => slot.exerciseId)}
        onPick={addExercise}
        onClose={() => setPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.cyan, fontSize: 34, fontWeight: '900', lineHeight: 36 },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '900' },
  subtitle: { marginBottom: space.sm },
  sectionLabel: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: space.lg, marginBottom: space.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  templatePill: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: space.sm, paddingHorizontal: space.md, backgroundColor: colors.surfaceAlt, flexGrow: 1 },
  templateTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '900', marginBottom: 2 },
  resetBtn: { alignSelf: 'flex-start', marginTop: space.sm, paddingVertical: space.xs },
  resetText: { color: colors.cyan, fontSize: fontSize.sm, fontWeight: '900' },
  dayPill: { minWidth: 44, alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: space.xs, paddingHorizontal: space.sm },
  dayPillActive: { borderColor: colors.cyan, backgroundColor: colors.surfaceAlt },
  dayPillText: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '800' },
  dayPillTextActive: { color: colors.cyan },
  dayPillCount: { color: colors.textDim, fontFamily: numberFamily, fontSize: 13, fontWeight: '900', marginTop: 2 },
  dayCard: { marginTop: space.md, padding: space.md },
  nameInput: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, marginTop: 4 },
  typePill: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingVertical: space.xs + 2, paddingHorizontal: space.md },
  typePillActive: { borderColor: colors.violet, backgroundColor: colors.violet },
  typePillText: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '800' },
  typePillTextActive: { color: colors.bg },
  slot: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.sm, marginTop: space.sm },
  slotHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  slotName: { flex: 1, color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  slotActions: { flexDirection: 'row', gap: space.xs },
  iconBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line },
  iconText: { color: colors.textDim, fontSize: fontSize.md, fontWeight: '900' },
  slotControls: { flexDirection: 'row', gap: space.md, marginTop: space.sm, flexWrap: 'wrap' },
  mini: { alignItems: 'center' },
  miniLabel: { color: colors.textDim, fontSize: 11, fontWeight: '800', marginBottom: 4 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  miniBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: colors.cyan, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  miniBtnText: { color: colors.cyan, fontSize: 18, fontWeight: '900', lineHeight: 20 },
  miniValue: { minWidth: 30, textAlign: 'center', color: colors.text, fontFamily: numberFamily, fontSize: fontSize.md, fontWeight: '900' },
  addBtn: { marginTop: space.md, borderWidth: 1.5, borderColor: colors.cyan, borderRadius: radius.md, paddingVertical: space.sm, alignItems: 'center', backgroundColor: colors.surfaceAlt },
  addText: { color: colors.cyan, fontSize: fontSize.md, fontWeight: '900' },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.7 },
});
