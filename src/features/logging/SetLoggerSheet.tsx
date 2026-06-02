import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getLastSetForExercise } from '@/db/repos/setLogRepo';
import type { ExerciseRow } from '@/db/types';
import { useSettingsStore } from '@/stores/settingsStore';
import { Muted, NeonButton, Pill } from '@/ui/primitives';
import { colors, fontSize, radius, space } from '@/ui/theme/tokens';
import { useLogSet } from './useLogSet';
import { Stepper } from './Stepper';

/**
 * Low-friction set logger (spec §6.1). Prefilled from the last set; "지난 세트 반복" logs in ONE tap,
 * steppers replace the keyboard. Stays open after logging so set 2+ is a single tap. Calls the
 * unchanged useLogSet hot path (→ JUICE fires there).
 */
export function SetLoggerSheet({
  exercise,
  ensureSession,
  onClose,
}: {
  exercise: ExerciseRow | null;
  ensureSession: () => Promise<string>;
  onClose: () => void;
}) {
  const db = useSQLiteContext();
  const logSet = useLogSet();
  const weightStep = useSettingsStore((s) => s.weightStep);

  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [rir, setRir] = useState<number | null>(null);
  const [lastSet, setLastSet] = useState<{ weight: number; reps: number; rir: number | null } | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const isBw = exercise?.is_bodyweight === 1;

  useEffect(() => {
    if (!exercise) return;
    let alive = true;
    (async () => {
      const last = await getLastSetForExercise(db, exercise.id);
      if (!alive) return;
      if (last) {
        setLastSet({ weight: last.weight, reps: last.reps, rir: last.rir });
        setWeight(last.weight);
        setReps(last.reps);
        setRir(last.rir);
      } else {
        setLastSet(null);
        setWeight(exercise.is_bodyweight ? 0 : 20);
        setReps(exercise.rep_low);
        setRir(null);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, exercise?.id]);

  const commit = async (w: number, r: number, rv: number | null) => {
    if (!exercise || r <= 0 || busy) return;
    setBusy(true);
    try {
      const sid = await ensureSession();
      const finalW = exercise.is_bodyweight ? 0 : w;
      await logSet({
        sessionId: sid,
        exerciseId: exercise.id,
        weight: finalW,
        reps: r,
        rir: rv,
        hitTargetReps: r >= exercise.rep_low,
        loggedVia: 'quick',
      });
      setCount((c) => c + 1);
      setLastSet({ weight: finalW, reps: r, rir: rv });
    } finally {
      setBusy(false);
    }
  };

  const lastLabel = lastSet
    ? `지난: ${lastSet.weight > 0 ? `${lastSet.weight}kg × ` : ''}${lastSet.reps}${lastSet.rir != null ? ` (RIR ${lastSet.rir})` : ''}`
    : '첫 세트!';

  return (
    <Modal visible={!!exercise} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {exercise ? (
          <>
            <View style={styles.handle} />
            <Text style={styles.title}>{exercise.name}</Text>
            <Muted>
              {lastLabel}
              {count > 0 ? `   ·   이번 세션 ${count}세트 ✓` : ''}
            </Muted>

            {!isBw ? (
              <Stepper label="무게" value={weight} step={weightStep} min={0} max={500} precision={1} unit="kg" onChange={setWeight} />
            ) : null}
            <Stepper label={isBw ? '횟수 / 초' : '횟수'} value={reps} step={1} min={0} max={999} precision={0} onChange={setReps} />

            <Text style={styles.rirLabel}>RIR (선택)</Text>
            <View style={styles.rirRow}>
              {[0, 1, 2, 3, 4].map((n) => (
                <Pill
                  key={n}
                  label={n === 4 ? '4+' : String(n)}
                  active={rir === n}
                  color={colors.violet}
                  onPress={() => setRir(rir === n ? null : n)}
                />
              ))}
            </View>

            <NeonButton
              label="지난 세트 반복 ⚡"
              color={colors.cyan}
              disabled={!lastSet || busy}
              onPress={() => lastSet && commit(lastSet.weight, lastSet.reps, lastSet.rir)}
              style={{ marginTop: space.lg }}
            />
            <NeonButton
              label="기록 ⚡"
              color={colors.energyHi}
              disabled={!reps || busy}
              onPress={() => commit(weight, reps, rir)}
              style={{ marginTop: space.sm }}
            />
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Muted>닫기</Muted>
            </Pressable>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000AA' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    paddingTop: space.sm,
  },
  handle: { alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: space.md },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '900' },
  rirLabel: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '700', marginTop: space.lg, marginBottom: 6 },
  rirRow: { flexDirection: 'row' },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.sm },
});
