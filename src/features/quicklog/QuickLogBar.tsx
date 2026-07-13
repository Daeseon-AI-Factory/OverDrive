import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ExercisePose } from '@/features/exercise-art/ExercisePose';
import { exerciseFamily } from '@/features/exercise-art/families';
import { formatWeight } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button, Input } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { border, colors, numType, radius, space, typeScale } from '@/ui/theme/tokens';
import { ConfirmUndoCard } from './ConfirmUndoCard';
import { useEditIntentStore } from './editIntentStore';
import { MicButton, parseFailHint, type MicHintKind, type MicPending, type MicState } from './MicButton';
import type { ParseCandidate } from './parseEntry';
import { useQuickLog, type RecentChip, type SavedQuickSet } from './useQuickLog';

/**
 * The one input. Type or SPEAK "벤치 100 5" → parse → log → explosion. Or tap a recent lift to repeat.
 * Voice: the whole record→transcribe→submit flow lives in MicButton (size 'bar'); the bar only
 * wires its UI reactions (transcript echo, save card, hints) through the MicButton callbacks.
 * No menus, no body-map — killing choice overload. Manual full entry lives behind a "수동" toggle.
 *
 * Certainty loop (spec §6 — save-first stays sacred):
 *   - A genuinely AMBIGUOUS parse (near-tie exercises) saves nothing and shows a one-line chip row
 *     ("어느 운동?") — one tap resolves it through the same instant save path. Unambiguous parses
 *     save instantly, exactly as before.
 *   - EVERY successful save raises the confirm-as-undo card above the bar (pose + name + stat +
 *     [수정]/[취소]), auto-dismissing in ~15s. It never blocks the next log — it just gets replaced.
 *
 * MONOLITH chrome: neutral machined blocks (mic IconSquare, recess Input, accent-tinted submit).
 * The ONLY colored surface is the recording-state mic (danger = live status); status feedback is
 * ≤13pt semantic text, never chrome.
 */
export function QuickLogBar() {
  const { t, i18n } = useTranslation();
  const skin = useSkinOrNull(); // Korean keeps the skin's original CTA voice; other locales use their translated action.
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const { recents, submitText, submitWith, repeat, undoSave } = useQuickLog();
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null); // failure hints (warning text)
  const [confirm, setConfirm] = useState<string | null>(null); // "what got saved" echo (positive text)
  const [busy, setBusy] = useState(false); // typed submit / disambiguation pick in flight
  const [micState, setMicState] = useState<MicState>('idle'); // mirrored from MicButton
  const [repeatingId, setRepeatingId] = useState<string | null>(null);
  // Disambiguation: the parse was a near-tie → NOTHING saved yet; one chip tap resolves it.
  const [pending, setPending] = useState<{ text: string; options: ParseCandidate[] } | null>(null);
  // Confirm-as-undo card for the JUST-saved set. A new save replaces it (nonce restarts its clock).
  const [card, setCard] = useState<{ nonce: number; saved: SavedQuickSet; savedBatch: SavedQuickSet[] } | null>(null);
  const [undoingNonce, setUndoingNonce] = useState<number | null>(null);
  const cardNonce = useRef(0);

  const recording = micState === 'recording';
  const transcribing = micState === 'transcribing';
  const anyBusy = busy || micState === 'submitting'; // typed OR voice submit — one shared lock

  const ko = i18n.language.startsWith('ko');
  // New copy not yet in the locale catalogs (owned elsewhere) — per-locale defaults until translated.
  const dv = useCallback((koStr: string, enStr: string) => (ko ? koStr : enStr), [ko]);

  const showCard = useCallback((savedBatch: SavedQuickSet[]) => {
    const saved = savedBatch[savedBatch.length - 1];
    if (saved) setCard({ nonce: ++cardNonce.current, saved, savedBatch });
  }, []);

  // ── Shared submit reactions (typed path + MicButton callbacks — identical by construction) ──
  const onSaved = useCallback(
    (saved: SavedQuickSet[], summary: string) => {
      setText('');
      setHint(null);
      setPending(null);
      setConfirm(summary ? `✓ ${summary}` : null); // echo WHAT was logged — misparses are visible
      showCard(saved);
    },
    [showCard],
  );

  const onAmbiguous = useCallback((p: MicPending) => {
    // Nothing saved — keep the entered line (numbers retained) and ask which exercise.
    setConfirm(null);
    setHint(null);
    setPending(p);
  }, []);

  const onMicHint = useCallback((msg: string | null, kind: MicHintKind) => {
    if (kind === 'parse') {
      // The line submitted but couldn't be parsed/saved — stale echo + pending row are invalid.
      setConfirm(null);
      setPending(null);
    } else if (kind === 'save') {
      setConfirm(null);
    }
    setHint(msg);
  }, []);

  const runSubmit = useCallback(
    async (value: string) => {
      try {
        const r = await submitText(value);
        if (r.ok) onSaved(r.saved, r.summary);
        else if (r.reason === 'ambiguous') onAmbiguous({ text: value, options: r.options });
        else onMicHint(parseFailHint(r.reason, t, ko), 'parse');
      } catch {
        onMicHint(t('quicklog.fail.log'), 'save');
      }
    },
    [submitText, onSaved, onAmbiguous, onMicHint, t, ko],
  );

  const onSubmit = async () => {
    if (!text.trim() || anyBusy) return;
    setBusy(true);
    try {
      await runSubmit(text);
    } finally {
      setBusy(false);
    }
  };

  /** Disambiguation chip tap → save with THAT exercise through the same instant path. */
  const onPick = useCallback(
    async (option: ParseCandidate) => {
      if (!pending || anyBusy) return;
      setBusy(true);
      try {
        const r = await submitWith(pending.text, option);
        if (r.ok) {
          setPending(null);
          setText('');
          setHint(null);
          setConfirm(`✓ ${r.summary}`);
          showCard(r.saved);
        } else {
          setPending(null);
          setHint(t('quicklog.fail.log'));
        }
      } catch {
        setHint(t('quicklog.fail.log'));
      } finally {
        setBusy(false);
      }
    },
    [pending, anyBusy, submitWith, showCard, t],
  );

  /** Confirm card [수정] → open the screen-level SetLoggerSheet prefilled (via the intent store). */
  const onCardEdit = useCallback((saved: SavedQuickSet) => {
    setCard(null);
    if (saved.exercise && saved.exercise.type === 'strength') {
      useEditIntentStore.getState().openEdit(saved);
    }
  }, []);

  /** Confirm card [취소] → delete the just-saved set + recompute CP; brief '취소됨' echo. */
  const onCardUndo = useCallback(
    async (savedBatch: SavedQuickSet[], nonce: number) => {
      setUndoingNonce(nonce);
      try {
        await undoSave(savedBatch);
        setCard((current) => (current?.nonce === nonce ? null : current));
        setHint(null);
        setConfirm(t('quicklog.cancelled', { defaultValue: dv('취소됨', 'Cancelled') }));
      } catch {
        setHint(t('quicklog.fail.log'));
      } finally {
        setUndoingNonce((current) => (current === nonce ? null : current));
      }
    },
    [undoSave, t, dv],
  );

  const onRepeat = useCallback(
    async (chip: RecentChip) => {
      if (recording || repeatingId) return; // chips are purely local — network states never block them
      setRepeatingId(chip.exerciseId);
      setHint(null);
      try {
        const saved = await repeat(chip);
        const w = formatWeight(chip.weight, unitSystem);
        setConfirm(`✓ ${chip.name}  ${w ? `${w}×` : ''}${chip.reps}`);
        if (saved) showCard([saved]);
      } catch {
        setHint(t('quicklog.fail.log'));
      } finally {
        setRepeatingId(null);
      }
    },
    [recording, repeat, repeatingId, showCard, t, unitSystem],
  );

  const chipLabel = (c: RecentChip) => {
    const w = formatWeight(c.weight, unitSystem); // '' for bodyweight
    return `${c.name}  ${w ? `${w}×` : ''}${c.reps}`;
  };

  // Digits-only stat for the chip (Orbitron renders digits, never words — the unit lives in the
  // accessibility label / confirm echo, not the 30pt chip).
  const chipStat = (c: RecentChip) => {
    const w = formatWeight(c.weight, unitSystem); // "100 kg" | '' for bodyweight
    const n = w ? w.split(' ')[0] : '';
    return `${n ? `${n}×` : ''}${c.reps}`;
  };

  const statusHint = recording
    ? t('quicklog.recording')
    : transcribing
      ? t('quicklog.transcribing')
      : anyBusy
        ? t('quicklog.logging', { defaultValue: dv('기록 중…', 'Logging…') })
        : (hint ?? confirm ?? t('quicklog.help'));
  const statusColor = recording
    ? colors.danger
    : transcribing || anyBusy
      ? colors.text3
      : hint
        ? colors.warning
        : confirm
          ? colors.positive
          : colors.text3;

  return (
    <View style={styles.wrap}>
      {card ? (
        <ConfirmUndoCard
          nonce={card.nonce}
          saved={card.saved}
          editable={card.savedBatch.length === 1 && card.saved.exercise?.type === 'strength'}
          busy={undoingNonce === card.nonce}
          onEdit={() => onCardEdit(card.saved)}
          onUndo={() => void onCardUndo(card.savedBatch, card.nonce)}
          onDismiss={() => setCard(null)}
        />
      ) : null}

      <View style={styles.inputRow}>
        <MicButton
          size="bar"
          submit={submitText}
          disabled={busy}
          onStateChange={setMicState}
          onTranscript={setText}
          onSaved={onSaved}
          onAmbiguous={onAmbiguous}
          onHint={onMicHint}
        />
        <Input
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (hint) setHint(null);
            if (pending) setPending(null); // editing the line invalidates the pending disambiguation
          }}
          placeholder={t('quicklog.placeholder')}
          accessibilityLabel={t('quicklog.placeholder')}
          style={styles.input}
          onSubmitEditing={onSubmit}
          returnKeyType="done"
          submitBehavior="submit" // keep the keyboard up after logging — the next set is one line away
          autoCapitalize="none"
          autoCorrect={false}
          editable={!recording && !transcribing}
        />
        <Button
          label={ko && skin ? skin.cta.logWord : t('quicklog.log')}
          onPress={() => void onSubmit()}
          variant="secondary"
          compact
          disabled={!text.trim() || anyBusy}
        />
      </View>

      {pending ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.pickRow}
        >
          <Text style={styles.pickLabel}>
            {t('quicklog.whichExercise', { defaultValue: dv('어느 운동?', 'Which exercise?') })}
          </Text>
          {pending.options.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => void onPick(o)}
              disabled={anyBusy}
              accessibilityRole="button"
              accessibilityLabel={o.name}
              accessibilityState={{ disabled: anyBusy }}
              style={[styles.pickChip, anyBusy && styles.disabled]}
              hitSlop={4}
            >
              <ExercisePose family={exerciseFamily(o.id)} size={22} animated={false} />
              <Text style={styles.chipName}>{o.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <Text style={[styles.hint, { color: statusColor }]}>{statusHint}</Text>

      {recents.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}
        >
          {recents.map((c) => (
            <Pressable
              key={c.exerciseId}
              onPress={() => void onRepeat(c)}
              disabled={!!repeatingId || recording}
              accessibilityRole="button"
              accessibilityLabel={t('quicklog.repeatRecent', { label: chipLabel(c) })}
              accessibilityState={{ disabled: !!repeatingId || recording }}
              style={[styles.chip, (!!repeatingId || recording) && styles.disabled]}
              hitSlop={4}
            >
              {repeatingId === c.exerciseId ? (
                <Text style={styles.chipName}>…</Text>
              ) : (
                <>
                  <Text style={styles.chipName}>{c.name}</Text>
                  <Text style={styles.chipStat}>{chipStat(c)}</Text>
                </>
              )}
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
  input: { flex: 1 },
  disabled: { opacity: 0.4 },
  hint: { ...typeScale.caption, marginTop: space.sm },
  chips: { gap: space.sm, paddingVertical: space.md, paddingRight: space.lg },
  // Disambiguation row — one line, chips carry a small static pose + name; one tap saves.
  pickRow: { gap: space.sm, alignItems: 'center', paddingTop: space.sm, paddingRight: space.lg },
  pickLabel: { ...typeScale.caption, color: colors.text2 },
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
  // Pill-inactive chrome (neutral surface2 + 1pt line) — recents are history, not live state.
  chip: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
  },
  chipName: { ...typeScale.label, color: colors.text2 },
  chipStat: { ...numType.small, color: colors.text2, marginLeft: space.sm },
});
