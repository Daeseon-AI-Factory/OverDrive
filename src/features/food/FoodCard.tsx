import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { getDisciplineToday, setDisciplineToday } from '@/db/repos/disciplineRepo';
import { addFoodItems, getFoodToday, getLatestFoodBatch } from '@/db/repos/foodRepo';
import type { FoodItemInput, FoodMealBatch, FoodSource } from '@/db/repos/foodRepo';
import { classifyEvent } from '@/features/juice/classifyEvent';
import { useJuice } from '@/features/juice/JuiceProvider';
import { QUICKLOG_ENDPOINT } from '@/features/quicklog/config';
import { downscaleForUpload } from '@/lib/image';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button, Card, IconSquare, Input, Metric, Muted, SectionTitle, useAccent } from '@/ui/primitives';
import { RingGauge } from '@/ui/RingGauge';
import { colors, hangulSafeLetterSpacing, numType, space, tracking, typeScale } from '@/ui/theme/tokens';
import * as ImagePicker from 'expo-image-picker';
import { parseFoodPhoto, parseFoodText } from './parseFoodAI';

/**
 * 식단 — one line, AI does the rest: type what you ate ("닭가슴살 300그램이랑 밥") → Groq estimates
 * kcal+protein → logged. Hitting your protein target auto-completes the discipline protein check
 * (→ real Combat Power) with a JUICE pop. Photo mode rides the same /food endpoint (native batch).
 *
 * DE-TEXTED instrument tile: the protein reading is a STATIC Skia ring gauge (g / target, accent →
 * positive at target) with the digits in the center — no prose readout line. kcal is a Metric.
 * The input row stays; hint/confirm text appears ONLY on a state change (failure / fresh log).
 */
export function FoodCard() {
  const db = useSQLiteContext();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const juice = useJuice();
  const accent = useAccent();
  const proteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const [today, setToday] = useState({ kcal: 0, proteinG: 0, entries: 0 });
  const [latestMeal, setLatestMeal] = useState<FoodMealBatch | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null); // failure hints (warning text)
  const [confirm, setConfirm] = useState<string | null>(null); // "what the AI logged" echo (positive text)

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
  const saveFailed = () =>
    t('food.saveFailed', {
      defaultValue: dv(
        '식사를 저장하지 못했어. 기록은 추가되지 않았어 — 다시 해봐.',
        "Couldn't save that meal. Nothing was added — try again.",
      ),
    });

  const reload = useCallback(async () => {
    const [nextToday, nextLatestMeal] = await Promise.all([getFoodToday(db), getLatestFoodBatch(db)]);
    setToday(nextToday);
    setLatestMeal(nextLatestMeal);
    return nextToday;
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void reload().catch(() => {});
    }, [reload]),
  );

  /** Shared tail for text + photo logging: persist, refresh, protein-target → discipline + pop. */
  const logItems = async (items: FoodItemInput[], source: FoodSource) => {
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
    const after = await reload();

    // Crossing the protein target auto-completes the discipline check → real CP + a pop.
    if (proteinTargetG && before < proteinTargetG && after.proteinG >= proteinTargetG) {
      // Food is already durable at this point. Derived discipline/CP work must never turn a
      // successful meal save into a failure message or block the logging hot path.
      try {
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
      } catch {
        // Non-blocking derived metric: the meal itself remains saved and truthfully confirmed.
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
      try {
        await logItems(items, 'text');
      } catch {
        setHint(saveFailed());
      }
    } catch {
      setHint(aiOffline()); // network/proxy failure ≠ parse failure — don't tell the user to reword
    } finally {
      setBusy(false);
    }
  };

  /** Photo — snap/pick a meal photo → Worker vision → logged. */
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
      const items = await parseFoodPhoto(uri, QUICKLOG_ENDPOINT);
      try {
        await logItems(items, 'photo');
      } catch {
        setHint(saveFailed());
      }
    } catch {
      setHint(aiOffline());
    } finally {
      setBusy(false);
    }
  };

  /** Latest meal repeat — entirely local and routed through the same save/refresh/discipline tail. */
  const repeatLatest = async () => {
    if (!latestMeal || busy) return;
    setBusy(true);
    setHint(null);
    setConfirm(null);
    try {
      await logItems(latestMeal.items, latestMeal.source);
    } catch {
      setHint(saveFailed());
    } finally {
      setBusy(false);
    }
  };

  const setTargetLabel = t('food.setTarget', {
    defaultValue: dv('단백질 목표 설정 →', 'Set protein target →'),
  });
  const proteinLabel = t('food.protein', { defaultValue: dv('단백질', 'Protein') });

  return (
    <View style={styles.wrap}>
      <SectionTitle>{t('food.title')}</SectionTitle>
      <Card>
        <View style={styles.gaugeRow}>
          {/* Protein ring — the reading IS the instrument (digits in the center, arc = g/target). */}
          <RingGauge
            value={today.proteinG}
            target={proteinTargetG ?? 0}
            accessibilityLabel={`${proteinLabel} ${today.proteinG}${proteinTargetG ? ` / ${proteinTargetG}` : ''}g`}
          >
            <Text style={styles.ringNum}>{today.proteinG}</Text>
            <Text style={styles.ringUnit}>G</Text>
          </RingGauge>
          <View style={styles.gaugeMeta}>
            <Text
              style={[styles.proteinOverline, { letterSpacing: hangulSafeLetterSpacing(proteinLabel, tracking.overline) }]}
            >
              {proteinLabel}
            </Text>
            {proteinTargetG ? (
              <Text style={styles.proteinTarget}>{`/ ${proteinTargetG}g`}</Text>
            ) : (
              // No target yet → an empty ring means nothing; offer the one-tap setup instead.
              <Pressable
                onPress={() => router.push('/settings')}
                accessibilityRole="button"
                accessibilityLabel={setTargetLabel}
                hitSlop={8}
              >
                <Text style={[styles.setTarget, { color: accent.solid }]}>{setTargetLabel}</Text>
              </Pressable>
            )}
            {today.kcal > 0 ? (
              // Localized full reading for screen readers — the visual is digits + micro-unit only.
              <View accessible accessibilityLabel={t('food.kcal', { n: today.kcal })}>
                <Metric value={today.kcal.toLocaleString()} unit="KCAL" size="mid" style={styles.kcal} />
              </View>
            ) : null}
          </View>
        </View>

        {latestMeal ? (
          <Button
            label={t('food.repeatLast')}
            onPress={() => void repeatLatest()}
            variant="ghost"
            compact
            disabled={busy}
            style={styles.repeatButton}
          />
        ) : null}

        <View style={styles.inputRow}>
          <IconSquare
            compact
            glyph={'📷︎'}
            onPress={() => void onPhoto()}
            busy={busy}
            accessibilityLabel={t('food.photo')}
          />
          <Input
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (hint) setHint(null);
            }}
            placeholder={t('food.placeholder')}
            accessibilityLabel={t('food.placeholder')}
            style={styles.input}
            onSubmitEditing={submit}
            returnKeyType="done"
            editable={!busy}
          />
          <Button
            label={busy ? '…' : t('food.log')}
            onPress={() => void submit()}
            variant="secondary"
            compact
            disabled={!text.trim() || busy}
          />
        </View>
        {hint ? (
          <Muted style={styles.hintText}>{hint}</Muted>
        ) : confirm ? (
          <Muted style={styles.confirmText}>{confirm}</Muted>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xs },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  gaugeMeta: { flexShrink: 1, gap: space.xxs },
  proteinOverline: { ...typeScale.overline },
  // Ring center readout: Orbitron digits over a Latin micro-unit (Metric convention).
  ringNum: { ...numType.mid, color: colors.text },
  ringUnit: { fontSize: 10, fontWeight: '600', lineHeight: 12, letterSpacing: tracking.overline, color: colors.text3 },
  proteinTarget: { ...typeScale.caption, color: colors.text3 },
  setTarget: { ...typeScale.caption },
  kcal: { marginTop: space.xs },
  repeatButton: { marginTop: space.md },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  input: { flex: 1 },
  hintText: { color: colors.warning, marginTop: space.xs },
  confirmText: { color: colors.positive, marginTop: space.xs },
});
