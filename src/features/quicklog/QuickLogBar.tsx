import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatWeight } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Muted } from '@/ui/primitives';
import { colors, fontSize, radius, space } from '@/ui/theme/tokens';
import { useQuickLog, type RecentChip } from './useQuickLog';

/**
 * The one input. Type (or later speak) "벤치 100 5" → parse → log → explosion. Or tap a recent lift
 * to repeat it in one touch. No menus, no body-map, no steppers — the whole point is killing choice
 * overload (the builder's #1 complaint). Manual full entry lives behind a "수동" toggle on the screen.
 */
export function QuickLogBar() {
  const { t } = useTranslation();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const { recents, submitText, repeat } = useQuickLog();
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const r = await submitText(text);
    setBusy(false);
    if (r.ok) {
      setText('');
      setHint(null);
    } else {
      setHint(t(`quicklog.fail.${r.reason === 'no_exercise' ? 'no_exercise' : 'no_reps'}`));
    }
  };

  const chipLabel = (c: RecentChip) => {
    const w = formatWeight(c.weight, unitSystem); // '' for bodyweight
    return `${c.name}  ${w ? `${w}×` : ''}${c.reps}`;
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (hint) setHint(null);
          }}
          placeholder={t('quicklog.placeholder')}
          placeholderTextColor={colors.textDim}
          style={styles.input}
          onSubmitEditing={onSubmit}
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          onPress={onSubmit}
          disabled={!text.trim() || busy}
          style={[styles.logBtn, { opacity: text.trim() && !busy ? 1 : 0.4 }]}
          hitSlop={6}
        >
          <Text style={styles.logText}>{t('quicklog.log')}</Text>
        </Pressable>
      </View>

      <Muted style={[styles.hint, hint ? { color: colors.energyLo } : null]}>{hint ?? t('quicklog.help')}</Muted>

      {recents.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {recents.map((c) => (
            <Pressable key={c.exerciseId} onPress={() => repeat(c)} style={styles.chip} hitSlop={4}>
              <Text style={styles.chipText}>{chipLabel(c)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  logBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.energyHi,
    backgroundColor: colors.surfaceAlt,
  },
  logText: { color: colors.energyHi, fontSize: fontSize.md, fontWeight: '900', letterSpacing: 1 },
  hint: { marginTop: 6 },
  chips: { gap: space.sm, paddingVertical: space.md, paddingRight: space.lg },
  chip: {
    borderWidth: 1,
    borderColor: colors.cyan,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.cyan, fontSize: fontSize.sm, fontWeight: '800' },
});
