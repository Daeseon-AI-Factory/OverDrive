import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { getDisciplineToday, setDisciplineToday } from '@/db/repos/disciplineRepo';
import { addFoodItems, getFoodToday } from '@/db/repos/foodRepo';
import { classifyEvent } from '@/features/juice/classifyEvent';
import { useJuice } from '@/features/juice/JuiceProvider';
import { QUICKLOG_ENDPOINT } from '@/features/quicklog/config';
import { downscaleForUpload } from '@/lib/image';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, numberFamily, radius, space } from '@/ui/theme/tokens';
import * as ImagePicker from 'expo-image-picker';
import { parseFoodPhoto, parseFoodText } from './parseFoodAI';

/**
 * 식단 — one line, AI does the rest: type what you ate ("닭가슴살 300그램이랑 밥") → Groq estimates
 * kcal+protein → logged. Hitting your protein target auto-completes the discipline protein check
 * (→ real Combat Power) with a JUICE pop. Photo mode rides the same /food endpoint (native batch).
 */
export function FoodCard() {
  const db = useSQLiteContext();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const juice = useJuice();
  const proteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const [today, setToday] = useState({ kcal: 0, proteinG: 0, entries: 0 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null); // failure hints (energyLo)
  const [confirm, setConfirm] = useState<string | null>(null); // "what the AI logged" echo (success color)

  // New copy not yet in the locale catalogs (owned elsewhere) — per-locale defaults until translated.
  const ko = i18n.language.startsWith('ko');
  const dv = (koStr: string, enStr: string) => (ko ? koStr : enStr);
  const aiUnavailable = () =>
    t('food.aiUnavailable', {
      defaultValue: dv('AI 추정은 지금 사용할 수 없어 — 잠시 후 다시 해봐.', 'AI estimate is unavailable right now — try again later.'),
    });
  const aiOffline = () =>
    t('food.aiOffline', {
      defaultValue: dv('AI 연결 실패 — 잠시 후 다시 해봐.', "Couldn't reach AI — try again in a moment."),
    });

  const reload = useCallback(async () => {
    setToday(await getFoodToday(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void reload().catch(() => {});
    }, [reload]),
  );

  /** Shared tail for text + photo logging: persist, refresh, protein-target → discipline + pop. */
  const logItems = async (items: { name: string; kcal: number; proteinG: number }[], source: 'text' | 'photo') => {
    if (!items || items.length === 0) {
      setHint(t('food.fail')); // the AI answered but estimated nothing → genuinely a wording problem
      return;
    }
    const before = today.proteinG;
    await addFoodItems(db, items, source);
    setText('');
    // Echo WHAT the AI logged — a wild estimate should be visible, not silent.
    const kcal = Math.round(items.reduce((a, i) => a + i.kcal, 0));
    const prot = Math.round(items.reduce((a, i) => a + i.proteinG, 0));
    setConfirm(`✓ ${items.map((i) => i.name).join(' + ')} · ${kcal}kcal · ${prot}g`);
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
  };

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    if (!QUICKLOG_ENDPOINT) {
      setHint(aiUnavailable()); // no AI in this build — say so, don't blame the user's wording
      return;
    }
    setBusy(true);
    setHint(null);
    setConfirm(null);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      let items;
      try {
        items = await parseFoodText(value, QUICKLOG_ENDPOINT, ctrl.signal);
      } finally {
        clearTimeout(timer);
      }
      await logItems(items, 'text');
    } catch {
      setHint(aiOffline()); // network/proxy failure ≠ parse failure — don't tell the user to reword
    } finally {
      setBusy(false);
    }
  };

  /** 📷 — snap/pick a meal photo → Worker vision → logged. */
  const onPhoto = async () => {
    if (busy) return;
    if (!QUICKLOG_ENDPOINT) {
      setHint(aiUnavailable());
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 }).catch(() => null);
    if (!res || res.canceled || !res.assets?.[0]?.uri) return;
    setBusy(true);
    setHint(null);
    setConfirm(null);
    try {
      const uri = await downscaleForUpload(res.assets[0].uri);
      await logItems(await parseFoodPhoto(uri, QUICKLOG_ENDPOINT), 'photo');
    } catch {
      setHint(aiOffline());
    } finally {
      setBusy(false);
    }
  };

  const setTargetLabel = t('food.setTarget', {
    defaultValue: dv('단백질 목표 설정 →', 'Set protein target →'),
  });

  return (
    <View style={styles.wrap}>
      <SectionTitle>{t('food.title')}</SectionTitle>
      <Card>
        <View style={styles.row}>
          {proteinTargetG ? (
            <Text style={styles.protein}>
              🍗 <Text style={styles.proteinNum}>{`${today.proteinG} / ${proteinTargetG}g`}</Text>
            </Text>
          ) : (
            // No target yet → a bare "0g" means nothing; offer the one-tap setup instead.
            <Pressable
              onPress={() => router.push('/settings')}
              accessibilityRole="button"
              accessibilityLabel={setTargetLabel}
              hitSlop={8}
            >
              <Text style={styles.protein}>
                🍗 <Text style={styles.proteinNum}>{today.proteinG > 0 ? `${today.proteinG}g · ` : ''}</Text>
                <Text style={styles.setTarget}>{setTargetLabel}</Text>
              </Text>
            </Pressable>
          )}
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
          <Pressable
            onPress={onPhoto}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('food.photo')}
            accessibilityState={{ disabled: busy }}
            style={[styles.photoBtn, { opacity: busy ? 0.4 : 1 }]}
            hitSlop={6}
          >
            <Text style={{ fontSize: fontSize.lg }}>📷</Text>
          </Pressable>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (hint) setHint(null);
            }}
            placeholder={t('food.placeholder')}
            accessibilityLabel={t('food.placeholder')}
            placeholderTextColor={colors.textDim}
            style={styles.input}
            onSubmitEditing={submit}
            returnKeyType="done"
            editable={!busy}
          />
          <Pressable
            onPress={submit}
            disabled={!text.trim() || busy}
            accessibilityRole="button"
            accessibilityLabel={t('food.log')}
            accessibilityState={{ disabled: !text.trim() || busy }}
            style={[styles.btn, { opacity: text.trim() && !busy ? 1 : 0.4 }]}
            hitSlop={6}
          >
            <Text style={styles.btnText}>{busy ? '…' : t('food.log')}</Text>
          </Pressable>
        </View>
        {hint ? (
          <Muted style={{ color: colors.energyLo, marginTop: 4 }}>{hint}</Muted>
        ) : confirm ? (
          <Muted style={{ color: colors.success, marginTop: 4 }}>{confirm}</Muted>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xs },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  protein: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  proteinNum: { fontFamily: numberFamily, color: colors.energyLo },
  setTarget: { color: colors.cyan, fontSize: fontSize.sm },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden', marginTop: space.sm },
  fill: { height: '100%', borderRadius: 3 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  photoBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.violet,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
