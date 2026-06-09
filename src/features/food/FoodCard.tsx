import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { getDisciplineToday, setDisciplineToday } from '@/db/repos/disciplineRepo';
import { addFoodItems, getFoodToday } from '@/db/repos/foodRepo';
import { classifyEvent } from '@/features/juice/classifyEvent';
import { useJuice } from '@/features/juice/JuiceProvider';
import { QUICKLOG_ENDPOINT } from '@/features/quicklog/config';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, numberFamily, radius, space } from '@/ui/theme/tokens';
import { normalizeFoodItems, parseFoodText } from './parseFoodAI';

/**
 * 식단 — one line, AI does the rest: type what you ate ("닭가슴살 300그램이랑 밥") → Groq estimates
 * kcal+protein → logged. Hitting your protein target auto-completes the discipline protein check
 * (→ real Combat Power) with a JUICE pop. Photo mode rides the same /food endpoint (native batch).
 */
export function FoodCard() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const juice = useJuice();
  const proteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const [today, setToday] = useState({ kcal: 0, proteinG: 0, entries: 0 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setToday(await getFoodToday(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void reload().catch(() => {});
    }, [reload]),
  );

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setHint(null);
    try {
      let items;
      if (QUICKLOG_ENDPOINT) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 9000);
        try {
          items = await parseFoodText(value, QUICKLOG_ENDPOINT, ctrl.signal);
        } finally {
          clearTimeout(timer);
        }
      } else {
        items = normalizeFoodItems({ items: [] });
      }
      if (!items || items.length === 0) {
        setHint(t('food.fail'));
        return;
      }
      const before = today.proteinG;
      await addFoodItems(db, items, 'text');
      setText('');
      await reload();
      const after = await getFoodToday(db);

      // Crossing the protein target auto-completes the discipline check → real CP + a pop.
      if (proteinTargetG && before < proteinTargetG && after.proteinG >= proteinTargetG) {
        const disc = await getDisciplineToday(db);
        if (!disc.protein) {
          const prev = useCombatPowerStore.getState().score;
          await setDisciplineToday(db, { ...disc, protein: true });
          const result = await recomputeAndStore(db);
          useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
          juice.fire(
            classifyEvent({ kind: 'set', isPr: false, rir: 2, hitTargetReps: true, deltaCp: result.score - prev }),
          );
        }
      }
    } catch {
      setHint(t('food.fail'));
    } finally {
      setBusy(false);
    }
  };

  const targetText = proteinTargetG
    ? `${today.proteinG} / ${proteinTargetG}g`
    : `${today.proteinG}g`;

  return (
    <View style={styles.wrap}>
      <SectionTitle>{t('food.title')}</SectionTitle>
      <Card>
        <View style={styles.row}>
          <Text style={styles.protein}>
            🍗 <Text style={styles.proteinNum}>{targetText}</Text>
          </Text>
          <Muted>{today.kcal > 0 ? t('food.kcal', { n: today.kcal }) : ''}</Muted>
        </View>
        {proteinTargetG ? (
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.min(100, Math.round((today.proteinG / proteinTargetG) * 100))}%`,
                  backgroundColor: today.proteinG >= proteinTargetG ? colors.success : colors.energyLo,
                },
              ]}
            />
          </View>
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (hint) setHint(null);
            }}
            placeholder={t('food.placeholder')}
            placeholderTextColor={colors.textDim}
            style={styles.input}
            onSubmitEditing={submit}
            returnKeyType="done"
            editable={!busy}
          />
          <Pressable onPress={submit} disabled={!text.trim() || busy} style={[styles.btn, { opacity: text.trim() && !busy ? 1 : 0.4 }]} hitSlop={6}>
            <Text style={styles.btnText}>{busy ? '…' : t('food.log')}</Text>
          </Pressable>
        </View>
        {hint ? <Muted style={{ color: colors.energyLo, marginTop: 4 }}>{hint}</Muted> : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xs },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  protein: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  proteinNum: { fontFamily: numberFamily, color: colors.energyLo },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden', marginTop: space.sm },
  fill: { height: '100%', borderRadius: 3 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  btn: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.energyLo,
    backgroundColor: colors.surfaceAlt,
  },
  btnText: { color: colors.energyLo, fontSize: fontSize.sm, fontWeight: '900' },
});
