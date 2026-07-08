import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { ExerciseRow } from '@/db/types';
import { ExercisePose } from '@/features/exercise-art/ExercisePose';
import { exerciseFamily } from '@/features/exercise-art/families';
import { useSessionStore } from '@/features/forge/sessionStore';
import { playNamed } from '@/features/juice/audio/engine';
import { ConfirmUndoCard } from '@/features/quicklog/ConfirmUndoCard';
import { useEditIntentStore } from '@/features/quicklog/editIntentStore';
import { useQuickLog, type SavedQuickSet } from '@/features/quicklog/useQuickLog';
import { kgToDisplay, weightUnit } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button, Card, LiveDot, Metric, Muted, useSkinAccent } from '@/ui/primitives';
import { colors, hangulSafeLetterSpacing, numType, space, tracking, typeScale } from '@/ui/theme/tokens';
import type { NextAction, SetSuggestion } from './nextAction';
import { RestCountdownBar } from './RestCountdownBar';
import { useCoachPlan } from './useCoachPlan';

const POSE_SIZE = 128;

/**
 * The Today hero surface — the app decides, the user confirms ("손 치는 걸 최소화"). One glance:
 * a big animated pose + giant suggested-set digits + ONE mega button per state ('시작'/'했어'/
 * '이어서'/'수련 완료'). The '했어' one-tap goes through useQuickLog.repeat → the UNCHANGED
 * useLogSet hot path (save → CP → JUICE, §6: nothing runs before the durable write) and raises the
 * same ConfirmUndoCard certainty loop as the quicklog bar. The rest countdown is derived from the
 * last save timestamp (purely visual, §6); an overrun rest just reads '준비됨' — never a scold (§9).
 * ActiveWorkoutCard remains the detail surface behind the '자세히' toggle.
 */
export function CoachCard({
  ensureSession,
  onOpenExercise,
  onFinishWorkout,
  detailOpen,
  onToggleDetail,
}: {
  /** Silent session start (index-level) — '시작' must never play the 1.6s enter ritual (§6). */
  ensureSession: () => Promise<string>;
  /** Route to the screen-level logger sheets (cardio has no one-tap payload). */
  onOpenExercise: (exercise: ExerciseRow) => void;
  onFinishWorkout: () => void;
  detailOpen: boolean;
  onToggleDetail: () => void;
}) {
  const { t, i18n } = useTranslation();
  const accent = useSkinAccent();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const { loaded, dayTitle, exerciseById, compute } = useCoachPlan();
  const { repeat, undoSave } = useQuickLog(); // THE quicklog save/undo paths — JUICE + recents refresh
  const sessionActive = useSessionStore((s) => s.activeSessionId != null);

  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  // Confirm-as-undo card for the JUST-saved coach set — same contract as the quicklog bar host.
  const [card, setCard] = useState<{ nonce: number; saved: SavedQuickSet } | null>(null);
  const cardNonce = useRef(0);

  const ko = i18n.language.startsWith('ko');
  // New copy not yet in the locale catalogs (owned elsewhere) — per-locale defaults until translated.
  const dv = useCallback((koStr: string, enStr: string) => (ko ? koStr : enStr), [ko]);

  // 1s tick ONLY while a session is live (rest ring digits + resting→idle transition). Purely
  // visual bookkeeping — saves never wait on it (§6). Inactive states don't read the clock, so a
  // stale `now` between sessions is harmless (the first tick after activation corrects it).
  useEffect(() => {
    if (!sessionActive) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [sessionActive]);

  const action: NextAction = compute(now);
  const suggestion: SetSuggestion | null =
    action.kind === 'start_program_day' || action.kind === 'resting' || action.kind === 'session_idle'
      ? action.suggestion
      : null;
  const sugRow = suggestion != null ? (exerciseById.get(suggestion.exerciseId) ?? null) : null;

  // Rest-over ding (moved up from RestTimerBar — the coach card owns the countdown now). Armed only
  // after a real remain>0 was observed for THIS anchor, so remounting into an old rest stays silent.
  const armedAnchor = useRef<number | null>(null);
  useEffect(() => {
    if (action.kind !== 'resting' || action.restStartedAt == null) {
      armedAnchor.current = null;
      return;
    }
    if (action.restRemainSec > 0) {
      armedAnchor.current = action.restStartedAt;
      return;
    }
    if (armedAnchor.current === action.restStartedAt) {
      armedAnchor.current = null;
      playNamed('t1_tick');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [action]);

  const exName = useCallback(
    (id: string) => t(`exercise.${id}`, { defaultValue: exerciseById.get(id)?.name ?? id }),
    [t, exerciseById],
  );

  /** Open the prefilled logger for an exercise ('다르게' / cardio / no-history first set). */
  const openLogger = useCallback(
    (row: ExerciseRow) => {
      if (row.type === 'strength') useEditIntentStore.getState().open(row);
      else onOpenExercise(row);
    },
    [onOpenExercise],
  );

  /** '시작' — silent session start + the first exercise's logger, prefilled, in one tap. */
  const onStart = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setHint(null);
    try {
      await ensureSession();
      if (sugRow) openLogger(sugRow);
    } catch {
      setHint(t('quicklog.fail.log'));
    } finally {
      setBusy(false);
    }
  }, [busy, ensureSession, sugRow, openLogger, t]);

  /** '했어' — log the suggested set through the SAME instant save path (JUICE fires), then the
   * engine advances off the bumped set count. Raises the confirm-as-undo card. */
  const onDidIt = useCallback(async () => {
    if (busy || suggestion == null || suggestion.isCardio || suggestion.reps == null) return;
    setBusy(true);
    setHint(null);
    try {
      const saved = await repeat({
        exerciseId: suggestion.exerciseId,
        name: exName(suggestion.exerciseId),
        weight: suggestion.weightKg ?? 0,
        reps: suggestion.reps,
        rir: null,
        isBodyweight: sugRow?.is_bodyweight === 1,
      });
      if (saved) setCard({ nonce: ++cardNonce.current, saved });
    } catch {
      setHint(t('quicklog.fail.log'));
    } finally {
      setBusy(false);
    }
  }, [busy, suggestion, repeat, exName, sugRow, t]);

  const isBodyweight = sugRow?.is_bodyweight === 1 || suggestion?.weightKg === 0;
  const canOneTap =
    suggestion != null && !suggestion.isCardio && suggestion.reps != null && (suggestion.weightKg != null || isBodyweight);

  // The ONE mega primary per state — a single stable handler switching on the CURRENT action
  // (handlers are passed straight to JSX props, never stored in derived objects).
  const onPrimary = useCallback(() => {
    if (action.kind === 'start_program_day' || action.kind === 'start_free') void onStart();
    else if (action.kind === 'wrap_up') onFinishWorkout();
    else if (canOneTap) void onDidIt();
    else if (sugRow != null) openLogger(sugRow);
  }, [action.kind, canOneTap, sugRow, onStart, onDidIt, onFinishWorkout, openLogger]);

  const onAlt = useCallback(() => {
    if (sugRow != null) openLogger(sugRow);
  }, [sugRow, openLogger]);

  const onCardEdit = useCallback((saved: SavedQuickSet) => {
    setCard(null);
    if (saved.exercise && saved.exercise.type === 'strength') {
      useEditIntentStore.getState().open(saved.exercise);
    }
  }, []);

  const onCardUndo = useCallback(
    async (saved: SavedQuickSet) => {
      setCard(null);
      try {
        await undoSave(saved);
        setHint(null);
      } catch {
        setHint(t('quicklog.fail.log'));
      }
    },
    [undoSave, t],
  );

  if (!loaded) return null; // one query away — no wrong-state flash

  // ── Per-state chrome (minimal words: one overline + one verb) ─────────────────────────────
  const eyebrow =
    action.kind === 'start_program_day'
      ? dayTitle
      : action.kind === 'start_free'
        ? dv('자유 수련', 'FREE SESSION')
        : action.kind === 'resting'
          ? dv('다음 세트', 'NEXT SET')
          : action.kind === 'session_idle'
            ? dv('수련 중', 'IN SESSION')
            : action.kind === 'wrap_up'
              ? dv('오늘 완료', 'DONE TODAY')
              : dv('회복일', 'REST DAY');

  // Giant digits: "102.5×5 KG" / "12" (bodyweight) / "8 REPS" (no history — target reps only).
  const precision = unitSystem === 'imperial' ? 0 : 1;
  const compact = (v: number) => v.toFixed(precision).replace(/\.0$/, '');
  let stat: string | null = null;
  let statUnit: string | undefined;
  if (suggestion != null && !suggestion.isCardio && suggestion.reps != null) {
    if (isBodyweight) {
      stat = String(suggestion.reps);
    } else if (suggestion.weightKg != null) {
      stat = `${compact(kgToDisplay(suggestion.weightKg, unitSystem))}×${suggestion.reps}`;
      statUnit = weightUnit(unitSystem).toUpperCase();
    } else {
      stat = String(suggestion.reps);
      statUnit = 'REPS';
    }
  }

  const remainLabel =
    action.kind === 'resting' && action.restStartedAt != null
      ? action.restRemainSec > 0
        ? `${Math.floor(action.restRemainSec / 60)}:${String(action.restRemainSec % 60).padStart(2, '0')}`
        : null
      : null;

  // The ONE mega primary per state (label only — onPrimary switches on the same conditions).
  const primaryLabel =
    action.kind === 'start_program_day' || action.kind === 'start_free'
      ? dv('시작', 'Start')
      : action.kind === 'wrap_up' && action.sessionActive
        ? t('forge.finish')
        : (action.kind === 'resting' || action.kind === 'session_idle') && canOneTap
          ? action.kind === 'resting'
            ? dv('했어', 'Did it')
            : dv('이어서', 'Continue')
          : (action.kind === 'resting' || action.kind === 'session_idle') && sugRow != null
            ? dv('기록', 'Log')
            : null;

  const showAlt =
    sugRow != null && (action.kind === 'start_program_day' || action.kind === 'resting' || action.kind === 'session_idle');

  return (
    <View style={styles.wrap}>
      {card ? (
        <ConfirmUndoCard
          nonce={card.nonce}
          saved={card.saved}
          editable={card.saved.exercise?.type === 'strength'}
          onEdit={() => onCardEdit(card.saved)}
          onUndo={() => void onCardUndo(card.saved)}
          onDismiss={() => setCard(null)}
        />
      ) : null}

      <Card live style={styles.card}>
        <View style={styles.liveRow}>
          {sessionActive ? <LiveDot /> : null}
          <Text
            style={[
              styles.eyebrow,
              { color: accent.solid, letterSpacing: hangulSafeLetterSpacing(eyebrow, tracking.overline) },
            ]}
            numberOfLines={1}
          >
            {eyebrow}
          </Text>
          <View style={styles.spacer} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={detailOpen ? dv('상세 접기', 'Hide details') : dv('상세 보기', 'Show details')}
            accessibilityState={{ expanded: detailOpen }}
            onPress={onToggleDetail}
            hitSlop={8}
          >
            <Text style={styles.detailLink}>{detailOpen ? dv('접기 ▴', 'Hide ▴') : dv('자세히 ▾', 'Details ▾')}</Text>
          </Pressable>
        </View>

        {suggestion != null && sugRow != null ? (
          // Two-column grid — left: name → digits → rest, packed tight; right: the pose, BIG.
          // Kills the floating dead-center the build-10 sim audit caught.
          <View style={styles.grid}>
            <View style={styles.gridLeft}>
              <Text style={styles.exName} numberOfLines={2}>
                {exName(suggestion.exerciseId)}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaText}>
                  {t('activeWorkout.setProgress', {
                    current: Math.min(suggestion.setNumber, suggestion.targetSets),
                    total: suggestion.targetSets,
                  })}
                </Text>
                {suggestion.prChance ? (
                  <Text style={[styles.prText, { color: accent.solid }]}>{dv('PR 기회 +2.5', 'PR chance +2.5')}</Text>
                ) : null}
              </View>

              {stat != null ? <Metric value={stat} unit={statUnit} size="hero" style={styles.stat} /> : null}

              {action.kind === 'resting' && action.restStartedAt != null ? (
                <View style={styles.restRow}>
                  <RestCountdownBar anchorMs={action.restStartedAt} targetSec={action.restTargetSec} />
                  {remainLabel != null ? (
                    <Text style={styles.restTime}>{remainLabel}</Text>
                  ) : (
                    <Text style={[styles.readyText, { color: colors.positive }]}>{dv('준비됨', 'Ready')}</Text>
                  )}
                </View>
              ) : null}
            </View>
            <ExercisePose
              family={exerciseFamily(suggestion.exerciseId)}
              size={POSE_SIZE}
              animated={action.kind === 'resting' || action.kind === 'start_program_day'}
            />
          </View>
        ) : null}

        {action.kind === 'rest_day' ? (
          <View style={styles.heroRow}>
            <ExercisePose family="core" size={POSE_SIZE} animated={false} />
            <View style={styles.heroInfo}>
              <Text style={styles.exName}>{dv('회복', 'Recovery')}</Text>
              <Muted>{dv('회복도 수련이다.', 'Recovery is training.')}</Muted>
            </View>
          </View>
        ) : null}

        {action.kind === 'wrap_up' ? (
          <View style={styles.heroRow}>
            <Metric value={action.setsDone} unit="SETS" size="hero" />
            <View style={styles.heroInfo}>
              <Text style={[styles.doneText, { color: colors.positive }]}>
                {dv('오늘 프로그램 전부 완료', 'Program complete')}
              </Text>
            </View>
          </View>
        ) : null}

        {(action.kind === 'resting' || action.kind === 'session_idle') && suggestion == null ? (
          <Muted style={styles.freeHint}>{dv('말하거나 아래에서 기록해.', 'Speak or log below.')}</Muted>
        ) : null}

        {primaryLabel != null || showAlt ? (
          <View style={styles.ctaRow}>
            {primaryLabel != null ? (
              <Button
                label={busy ? t('activeWorkout.saving') : primaryLabel}
                onPress={onPrimary}
                disabled={busy}
                style={styles.ctaMain}
              />
            ) : null}
            {showAlt ? (
              <Button label={dv('다르게', 'Change')} onPress={onAlt} variant="ghost" compact disabled={busy} />
            ) : null}
          </View>
        ) : null}

        {action.kind === 'session_idle' ? (
          <Button
            label={dv('마무리', 'Wrap up')}
            onPress={onFinishWorkout}
            variant="secondary"
            compact
            style={styles.wrapUpBtn}
          />
        ) : null}

        {hint != null ? <Text style={styles.hintText}>{hint}</Text> : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.md },
  card: {},
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  eyebrow: { ...typeScale.overline, flexShrink: 1 },
  spacer: { flex: 1 },
  detailLink: { ...typeScale.label, color: colors.text3 },
  grid: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  gridLeft: { flex: 1, minWidth: 0 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  heroInfo: { flex: 1, minWidth: 0 },
  exName: { ...typeScale.title, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.xs, flexWrap: 'wrap' },
  metaText: { ...typeScale.caption, color: colors.text3 },
  prText: { ...typeScale.label },
  stat: { marginTop: space.sm },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  restTime: { ...numType.mid, color: colors.text2 },
  readyText: { ...typeScale.label },
  doneText: { ...typeScale.label },
  freeHint: { marginTop: space.md },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.lg },
  ctaMain: { flex: 1 },
  wrapUpBtn: { marginTop: space.sm },
  hintText: { ...typeScale.caption, color: colors.warning, marginTop: space.sm },
});
