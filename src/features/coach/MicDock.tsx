import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ExercisePose } from '@/features/exercise-art/ExercisePose';
import { exerciseFamily } from '@/features/exercise-art/families';
import { ConfirmUndoCard } from '@/features/quicklog/ConfirmUndoCard';
import { useEditIntentStore } from '@/features/quicklog/editIntentStore';
import { MicButton, parseFailHint, type MicHintKind, type MicPending, type MicState } from '@/features/quicklog/MicButton';
import type { ParseCandidate } from '@/features/quicklog/parseEntry';
import { useQuickLog, type SavedQuickSet } from '@/features/quicklog/useQuickLog';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { border, colors, radius, space, typeScale } from '@/ui/theme/tokens';

const HINT_MS = 6000;

/**
 * Floating voice dock — the MicButton 'fab' pinned to the thumb zone (bottom-right, above the tab
 * bar) so ONE tap logs a set from anywhere in the Today scroll. Reactions mirror the QuickLogBar
 * contract exactly (same MicButton callbacks, same parseFailHint mapping, same useQuickLog paths):
 *   - saved      → ConfirmUndoCard floats above the fab (edit/undo, auto-dismiss)
 *   - ambiguous  → one-line exercise chips; one tap resolves through the SAME instant save path
 *   - hint       → transient caption bubble (auto-clears; a device hint never kills a valid save UI)
 * Everything here is post-save decoration — the durable write happened inside useQuickLog (§6).
 */
export function MicDock() {
  const { t, i18n } = useTranslation();
  const skin = useSkinOrNull();
  const { submitText, submitWith, undoSave } = useQuickLog();

  const [micState, setMicState] = useState<MicState>('idle');
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // disambiguation pick in flight
  const [pending, setPending] = useState<MicPending | null>(null);
  const [card, setCard] = useState<{ nonce: number; saved: SavedQuickSet } | null>(null);
  const cardNonce = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ko = i18n.language.startsWith('ko');
  // New copy not yet in the locale catalogs (owned elsewhere) — per-locale defaults until translated.
  const dv = useCallback((koStr: string, enStr: string) => (ko ? koStr : enStr), [ko]);

  /** Transient hint — floating chrome must clean up after itself (unlike the bar's status line). */
  const flashHint = useCallback((msg: string | null) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setHint(msg);
    if (msg != null) hideTimer.current = setTimeout(() => setHint(null), HINT_MS);
  }, []);
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  // ── MicButton reactions (identical semantics to QuickLogBar's host wiring) ─────────────────
  const onSaved = useCallback(
    (saved: SavedQuickSet[]) => {
      flashHint(null);
      setPending(null);
      const last = saved[saved.length - 1]; // multi-set AI saves: the card acts on the newest
      if (last) setCard({ nonce: ++cardNonce.current, saved: last });
    },
    [flashHint],
  );

  const onAmbiguous = useCallback(
    (p: MicPending) => {
      flashHint(null);
      setPending(p);
    },
    [flashHint],
  );

  const onMicHint = useCallback(
    (msg: string | null, kind: MicHintKind) => {
      if (kind === 'parse') setPending(null); // the line failed to parse — the pending row is stale
      flashHint(msg);
    },
    [flashHint],
  );

  /** Disambiguation chip tap → save with THAT exercise through the same instant path. */
  const onPick = useCallback(
    async (option: ParseCandidate) => {
      if (!pending || busy) return;
      setBusy(true);
      try {
        const r = await submitWith(pending.text, option);
        setPending(null);
        if (r.ok) {
          const last = r.saved[r.saved.length - 1];
          if (last) setCard({ nonce: ++cardNonce.current, saved: last });
        } else {
          flashHint(r.reason === 'ambiguous' ? t('quicklog.fail.log') : parseFailHint(r.reason, t, ko));
        }
      } catch {
        flashHint(t('quicklog.fail.log'));
      } finally {
        setBusy(false);
      }
    },
    [pending, busy, submitWith, flashHint, t, ko],
  );

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
      } catch {
        flashHint(t('quicklog.fail.log'));
      }
    },
    [undoSave, flashHint, t],
  );

  const status =
    micState === 'recording'
      ? t('quicklog.recording')
      : micState === 'transcribing'
        ? t('quicklog.transcribing')
        : micState === 'submitting'
          ? t('quicklog.logging', { defaultValue: dv('기록 중…', 'Logging…') })
          : hint;
  const statusColor =
    micState === 'recording' ? colors.danger : micState === 'idle' && hint != null ? colors.warning : colors.text2;

  const bubbleChrome = {
    backgroundColor: skin != null ? skin.palette.surface2 : colors.surface2,
    borderColor: skin != null ? skin.palette.line : colors.line,
  };

  return (
    <View pointerEvents="box-none" style={styles.dock}>
      {card ? (
        <View style={styles.cardHost} pointerEvents="box-none">
          <ConfirmUndoCard
            nonce={card.nonce}
            saved={card.saved}
            editable={card.saved.exercise?.type === 'strength'}
            onEdit={() => onCardEdit(card.saved)}
            onUndo={() => void onCardUndo(card.saved)}
            onDismiss={() => setCard(null)}
          />
        </View>
      ) : null}

      {pending ? (
        <View style={[styles.pickWrap, bubbleChrome]}>
          <Text style={styles.pickLabel}>{t('quicklog.whichExercise', { defaultValue: dv('어느 운동?', 'Which exercise?') })}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pickRow}>
            {pending.options.map((o) => (
              <Pressable
                key={o.id}
                onPress={() => void onPick(o)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={o.name}
                accessibilityState={{ disabled: busy }}
                style={[styles.pickChip, busy && styles.disabled]}
                hitSlop={4}
              >
                <ExercisePose family={exerciseFamily(o.id)} size={22} animated={false} />
                <Text style={styles.chipName}>{o.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {status != null ? (
        <View style={[styles.bubble, bubbleChrome]}>
          <Text style={[styles.bubbleText, { color: statusColor }]}>{status}</Text>
        </View>
      ) : null}

      <MicButton
        size="fab"
        submit={submitText}
        disabled={busy}
        onStateChange={setMicState}
        onSaved={onSaved}
        onAmbiguous={onAmbiguous}
        onHint={onMicHint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Pinned inside the Screen's SafeAreaView → bottom edge sits just above the tab bar.
  dock: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.lg,
    alignItems: 'flex-end',
    gap: space.sm,
  },
  cardHost: { alignSelf: 'stretch' },
  bubble: {
    maxWidth: 280,
    borderRadius: radius.md,
    borderWidth: border.thin,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  bubbleText: { ...typeScale.caption },
  pickWrap: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    borderWidth: border.thin,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  pickLabel: { ...typeScale.caption, color: colors.text2 },
  pickRow: { gap: space.sm, alignItems: 'center', paddingTop: space.sm },
  pickChip: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: space.xs,
    paddingRight: space.md,
    borderRadius: radius.chip,
    borderWidth: border.thin,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface2,
  },
  chipName: { ...typeScale.label, color: colors.text2 },
  disabled: { opacity: 0.4 },
});
