import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { getDisciplineToday, setDisciplineToday } from '@/db/repos/disciplineRepo';
import {
  addFoodItems,
  getFoodToday,
  getRecentFoodBatches,
  undoFoodBatch,
  updateManualFoodItem,
} from '@/db/repos/foodRepo';
import type { FoodItemInput, FoodMealBatch, FoodSource } from '@/db/repos/foodRepo';
import { classifyEvent } from '@/features/juice/classifyEvent';
import { useJuice } from '@/features/juice/JuiceProvider';
import { QUICKLOG_ENDPOINT } from '@/features/quicklog/config';
import { useSubscription, type AiAccessDecision } from '@/features/subscription/SubscriptionProvider';
import {
  AiApiError,
  isAttemptLimitError,
  isQuotaError,
  isRemoteAiConsentError,
  isSubscriptionRequiredError,
} from '@/features/subscription/workerClient';
import { downscaleForUpload } from '@/lib/image';
import { deleteAppCacheFile } from '@/lib/temporaryFiles';
import { hasCurrentRemoteAiConsent } from '@/lib/settings';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button, Card, IconSquare, Input, Metric, Muted, Pill, SectionTitle, useAccent } from '@/ui/primitives';
import { RingGauge } from '@/ui/RingGauge';
import { colors, hangulSafeLetterSpacing, numType, space, tracking, typeScale } from '@/ui/theme/tokens';
import * as ImagePicker from 'expo-image-picker';
import {
  parseManualFoodDraft,
  PORTION_MULTIPLIERS,
  scaleFoodItems,
  type PortionMultiplier,
} from './manualMeal';
import { parseFoodPhoto, parseFoodText } from './parseFoodAI';

/**
 * 식단 — free/offline manual values and local recent-meal repeats are the primary hot path. Optional
 * Pro text/photo AI estimates converge on the same durable ledger. Hitting the protein target can
 * auto-complete the discipline check (→ real Combat Power) with a JUICE pop.
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
  const remoteAiAllowed = useSettingsStore((s) => hasCurrentRemoteAiConsent(s.remoteAiConsent));
  const { requestAiAccess, showAiAccessError } = useSubscription();
  const [today, setToday] = useState({ kcal: 0, proteinG: 0, entries: 0 });
  const [recentMeals, setRecentMeals] = useState<FoodMealBatch[]>([]);
  const [text, setText] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualKcal, setManualKcal] = useState('');
  const [manualProtein, setManualProtein] = useState('');
  const [portion, setPortion] = useState<PortionMultiplier>(1);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [hint, setHint] = useState<string | null>(null); // failure hints (warning text)
  const [confirm, setConfirm] = useState<string | null>(null); // exact durable values (positive text)
  const [undoMeal, setUndoMeal] = useState<{ batch: FoodMealBatch; autoCompletedProtein: boolean } | null>(null);
  const [editingMeal, setEditingMeal] = useState<{
    batch: FoodMealBatch;
    autoCompletedProtein: boolean;
  } | null>(null);

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
  const aiConsentRequired = () =>
    t('food.aiConsent.required', {
      defaultValue: dv(
        '원격 AI가 꺼져 있어 — 식단을 추정하려면 설정에서 먼저 켜줘.',
        'Remote AI is off — enable it in Settings before estimating a meal.',
      ),
    });
  const subscriptionRequired = () => t('food.subscriptionRequired');
  const quotaReached = () => t('food.quotaReached');
  const saveFailed = () =>
    t('food.saveFailed', {
      defaultValue: dv(
        '식사를 저장하지 못했어. 기록은 추가되지 않았어 — 다시 해봐.',
        "Couldn't save that meal. Nothing was added — try again.",
      ),
    });

  const accessFailure = (access: AiAccessDecision) => {
    setHint(
      access === 'quota' || access === 'data_deleted'
        ? quotaReached()
        : access === 'unavailable'
          ? aiUnavailable()
          : subscriptionRequired(),
    );
  };

  const remoteFailure = (error: unknown) => {
    if (isRemoteAiConsentError(error)) {
      setHint(aiConsentRequired());
    } else if (isQuotaError(error) || (error instanceof AiApiError && error.code === 'data_deleted_until_reset')) {
      showAiAccessError(error);
      setHint(quotaReached());
    } else if (isAttemptLimitError(error)) {
      showAiAccessError(error);
      setHint(aiUnavailable());
    } else if (isSubscriptionRequiredError(error)) {
      setHint(subscriptionRequired());
    } else {
      setHint(aiOffline());
    }
  };

  const reload = useCallback(async () => {
    const [nextToday, nextRecentMeals] = await Promise.all([getFoodToday(db), getRecentFoodBatches(db)]);
    setToday(nextToday);
    setRecentMeals(nextRecentMeals);
    return nextToday;
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void reload().catch(() => {});
    }, [reload]),
  );

  /** Derived protein credit follows durable food rows and never blocks their local save. */
  const reconcileProteinCredit = async (
    beforeProteinG: number,
    afterProteinG: number,
    previouslyAutoCompleted: boolean = false,
  ): Promise<boolean> => {
    if (!proteinTargetG) return previouslyAutoCompleted;
    let ownsProteinCredit = previouslyAutoCompleted;
    try {
      const disc = await getDisciplineToday(db);
      if (previouslyAutoCompleted && afterProteinG < proteinTargetG) {
        if (disc.protein) {
          await setDisciplineToday(db, { ...disc, protein: false });
          ownsProteinCredit = false;
          const result = await recomputeAndStore(db);
          useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
        }
        return ownsProteinCredit;
      }
      if (beforeProteinG < proteinTargetG && afterProteinG >= proteinTargetG && !disc.protein) {
        const prev = useCombatPowerStore.getState().score;
        await setDisciplineToday(db, { ...disc, protein: true });
        ownsProteinCredit = true;
        const result = await recomputeAndStore(db);
        useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
        juice.fire(
          classifyEvent({ kind: 'set', isPr: false, rir: 2, hitTargetReps: true, deltaCp: result.score - prev }),
        );
        return ownsProteinCredit;
      }
    } catch {
      // Food and any completed discipline write are already durable. Preserve their actual
      // ownership so Undo can reverse the credit even when derived power refresh fails.
    }
    return ownsProteinCredit;
  };

  /** Shared tail for manual, recent, text, and photo logging: persist first, then derived metrics. */
  const logItems = async (items: FoodItemInput[], source: FoodSource) => {
    if (!items || items.length === 0) {
      setHint(t('food.fail')); // the AI answered but estimated nothing → genuinely a wording problem
      return;
    }
    const before = today.proteinG;
    const batch = await addFoodItems(db, items, source);
    if (!batch) return;
    setText('');
    // Echo exactly what was stored. AI estimates stay visible; manual values remain user-authored.
    const kcal = Math.round(items.reduce((a, i) => a + i.kcal, 0));
    const prot = Math.round(items.reduce((a, i) => a + i.proteinG, 0));
    setConfirm(`✓ ${items.map((i) => i.name).join(' + ')} · ${kcal}kcal · ${prot}g`);
    const after = await reload();
    const autoCompletedProtein = await reconcileProteinCredit(before, after.proteinG);
    setUndoMeal({ batch, autoCompletedProtein });
  };

  /** Always-local form. It never checks consent, entitlement, quota, or a network endpoint. */
  const saveManual = async () => {
    if (busyRef.current) return;
    const item = parseManualFoodDraft(manualName, manualKcal, manualProtein);
    if (!item) {
      setHint(t('food.manual.invalid'));
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setHint(null);
    setConfirm(null);
    try {
      if (editingMeal) {
        const before = today.proteinG;
        const updated = await updateManualFoodItem(db, editingMeal.batch, item);
        if (!updated) throw new Error('manual meal no longer editable');
        const after = await reload();
        const autoCompletedProtein = await reconcileProteinCredit(
          before,
          after.proteinG,
          editingMeal.autoCompletedProtein,
        );
        setUndoMeal({ batch: updated, autoCompletedProtein });
        setConfirm(`✓ ${item.name} · ${item.kcal}kcal · ${item.proteinG}g`);
      } else {
        await logItems([item], 'manual');
      }
      setManualName('');
      setManualKcal('');
      setManualProtein('');
      setEditingMeal(null);
    } catch {
      setHint(saveFailed());
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const submit = async () => {
    const value = text.trim();
    if (!value || busyRef.current) return;
    if (!remoteAiAllowed) {
      setHint(aiConsentRequired());
      return;
    }
    if (!QUICKLOG_ENDPOINT) {
      setHint(aiUnavailable()); // no AI in this build — say so, don't blame the user's wording
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const access = await requestAiAccess('food_text');
      if (access !== 'allowed') {
        accessFailure(access);
        return;
      }
      setHint(null);
      setConfirm(null);
      setUndoMeal(null);
      const ctrl = new AbortController();
      // Worker provider work is capped at 7s; the client deadline includes transport/D1 margin.
      const timer = setTimeout(() => ctrl.abort(), 12_000);
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
    } catch (error) {
      remoteFailure(error); // network/proxy failure ≠ parse failure — don't tell the user to reword
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Photo — snap/pick a meal photo → Worker vision → logged. */
  const onPhoto = async () => {
    if (busyRef.current) return;
    if (!remoteAiAllowed) {
      setHint(aiConsentRequired());
      return;
    }
    if (!QUICKLOG_ENDPOINT) {
      setHint(aiUnavailable());
      return;
    }
    busyRef.current = true;
    let pickedUri: string | null = null;
    let uploadUri: string | null = null;
    setBusy(true);
    try {
      // Subscription/quota preflight intentionally precedes the system photo picker. A blocked
      // request never receives photo-library access and never creates a temporary image.
      const access = await requestAiAccess('food_photo');
      if (access !== 'allowed') {
        accessFailure(access);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 }).catch(() => null);
      if (!res || res.canceled || !res.assets?.[0]?.uri) return;
      pickedUri = res.assets[0].uri;
      setHint(null);
      setConfirm(null);
      setUndoMeal(null);
      try {
        uploadUri = await downscaleForUpload(pickedUri);
      } catch {
        setHint(t('food.photoPrepareFailed'));
        return;
      }
      const items = await parseFoodPhoto(uploadUri, QUICKLOG_ENDPOINT);
      try {
        await logItems(items, 'photo');
      } catch {
        setHint(saveFailed());
      }
    } catch (error) {
      remoteFailure(error);
    } finally {
      const temporaryUris = [...new Set([pickedUri, uploadUri].filter((uri): uri is string => !!uri))];
      const cleaned = await Promise.all(temporaryUris.map((uri) => deleteAppCacheFile(uri)));
      if (cleaned.some((ok) => !ok)) console.error('[privacy] temporary meal photo could not be removed');
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** Recent meal repeat — selected portion, local DB only, and truthfully marked manual. */
  const repeatRecent = async (meal: FoodMealBatch) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setHint(null);
    setConfirm(null);
    setUndoMeal(null);
    try {
      await logItems(scaleFoodItems(meal.items, portion), 'manual');
    } catch {
      setHint(saveFailed());
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const beginManualEdit = () => {
    if (!undoMeal || undoMeal.batch.source !== 'manual' || undoMeal.batch.items.length !== 1) return;
    const item = undoMeal.batch.items[0];
    setManualName(item.name);
    setManualKcal(String(item.kcal));
    setManualProtein(String(item.proteinG));
    setEditingMeal(undoMeal);
    setHint(null);
    setConfirm(t('food.manual.editing'));
  };

  /** Undo only the batch written by the latest successful action; derived protein state follows. */
  const undoLatestSave = async () => {
    if (!undoMeal || busyRef.current) return;
    const target = undoMeal;
    busyRef.current = true;
    setBusy(true);
    setHint(null);
    try {
      await undoFoodBatch(db, target.batch, {
        resetProteinIfBelowG: target.autoCompletedProtein ? (proteinTargetG ?? null) : null,
      });
      await reload();
      if (target.autoCompletedProtein) {
        // Source-of-truth food + discipline rows are already atomic. Recompute is idempotent, so a
        // transient failure can be retried without deleting any additional data.
        try {
          const power = await recomputeAndStore(db);
          useCombatPowerStore.getState().setSnapshot(power.score, power.grade.key);
        } catch {
          // The durable undo succeeded; derived power refresh must not invite a duplicate undo.
        }
      }
      setUndoMeal(null);
      setEditingMeal(null);
      setManualName('');
      setManualKcal('');
      setManualProtein('');
      setConfirm(t('food.cancelled'));
    } catch {
      setHint(t('food.undoFailed'));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const setTargetLabel = t('food.setTarget', {
    defaultValue: dv('단백질 목표 설정 →', 'Set protein target →'),
  });
  const proteinLabel = t('food.protein', { defaultValue: dv('단백질', 'Protein') });
  const manualTitle = t('food.manual.title');
  const aiTitle = t('food.aiTitle');
  const manualReady = parseManualFoodDraft(manualName, manualKcal, manualProtein) !== null;

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

        <View style={styles.manualBlock}>
          <Text
            style={[
              styles.subsectionTitle,
              { letterSpacing: hangulSafeLetterSpacing(manualTitle, tracking.overline) },
            ]}
          >
            {manualTitle}
          </Text>
          <Muted style={styles.manualDisclaimer}>{t('food.manual.disclaimer')}</Muted>
          <Input
            value={manualName}
            onChangeText={(value) => {
              setManualName(value);
              if (hint) setHint(null);
            }}
            placeholder={t('food.manual.name')}
            accessibilityLabel={t('food.manual.name')}
            autoCapitalize="sentences"
            editable={!busy}
          />
          <View style={styles.manualNumbersRow}>
            <Input
              value={manualKcal}
              onChangeText={(value) => {
                setManualKcal(value);
                if (hint) setHint(null);
              }}
              placeholder={t('food.manual.kcal')}
              accessibilityLabel={t('food.manual.kcal')}
              keyboardType="decimal-pad"
              maxLength={7}
              editable={!busy}
              style={styles.manualNumberInput}
            />
            <Input
              value={manualProtein}
              onChangeText={(value) => {
                setManualProtein(value);
                if (hint) setHint(null);
              }}
              placeholder={t('food.manual.protein')}
              accessibilityLabel={t('food.manual.protein')}
              keyboardType="decimal-pad"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={() => void saveManual()}
              editable={!busy}
              style={styles.manualNumberInput}
            />
            <Button
              label={busy ? '…' : t(editingMeal ? 'food.manual.update' : 'food.manual.save')}
              onPress={() => void saveManual()}
              variant="secondary"
              compact
              disabled={!manualReady || busy}
            />
          </View>
        </View>

        {recentMeals.length > 0 ? (
          <View style={styles.recentBlock}>
            <View style={styles.recentHeader}>
              <Muted>{t('food.recent.title')}</Muted>
              <View style={styles.portionRow}>
                {PORTION_MULTIPLIERS.map((value) => (
                  <Pill
                    key={value}
                    label={`${value}×`}
                    active={portion === value}
                    onPress={() => setPortion(value)}
                  />
                ))}
              </View>
            </View>
            <View style={styles.recentList}>
              {recentMeals.map((meal) => {
                const scaled = scaleFoodItems(meal.items, portion);
                const fullName = scaled.map((item) => item.name).join(' + ');
                const displayName = fullName.length > 26 ? `${fullName.slice(0, 25)}…` : fullName;
                const kcal = Math.round(scaled.reduce((sum, item) => sum + item.kcal, 0));
                const protein = Math.round(scaled.reduce((sum, item) => sum + item.proteinG, 0));
                return (
                  <Button
                    key={meal.batchId}
                    label={t('food.recent.item', { name: displayName, kcal, protein })}
                    onPress={() => void repeatRecent(meal)}
                    variant="ghost"
                    compact
                    disabled={busy}
                    style={styles.recentButton}
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        <Text
          style={[styles.subsectionTitle, styles.aiTitle, { letterSpacing: hangulSafeLetterSpacing(aiTitle, tracking.overline) }]}
        >
          {aiTitle}
        </Text>

        {!remoteAiAllowed ? (
          <View style={styles.aiConsentRow}>
            <Muted style={styles.hintText}>{t('food.aiConsent.explainer')}</Muted>
            <Button
              label={t('food.aiConsent.settings')}
              onPress={() => router.push('/settings')}
              variant="ghost"
              compact
            />
          </View>
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
        {hint || confirm ? (
          <View style={styles.confirmRow}>
            <Muted style={hint ? styles.hintText : styles.confirmText}>{hint ?? confirm}</Muted>
            {undoMeal ? (
              <View style={styles.confirmActions}>
                {undoMeal.batch.source === 'manual' && undoMeal.batch.items.length === 1 ? (
                  <Button
                    label={t('food.manual.edit')}
                    onPress={beginManualEdit}
                    variant="ghost"
                    compact
                    disabled={busy}
                  />
                ) : null}
                <Button
                  label={t('food.undo')}
                  onPress={() => void undoLatestSave()}
                  variant="ghost"
                  compact
                  disabled={busy}
                />
              </View>
            ) : null}
          </View>
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
  subsectionTitle: { ...typeScale.overline, color: colors.text3 },
  manualBlock: { gap: space.sm, marginTop: space.lg },
  manualDisclaimer: { color: colors.text3 },
  manualNumbersRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  manualNumberInput: { flex: 1, minWidth: 0 },
  recentBlock: { gap: space.sm, marginTop: space.md },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  portionRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recentList: { gap: space.xs },
  recentButton: { width: '100%' },
  aiTitle: { marginTop: space.lg },
  aiConsentRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  input: { flex: 1 },
  hintText: { flex: 1, color: colors.warning },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  confirmActions: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  confirmText: { flex: 1, color: colors.positive },
});
