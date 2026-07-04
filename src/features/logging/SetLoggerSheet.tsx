import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getLastSetForExercise } from '@/db/repos/setLogRepo';
import type { ExerciseRow } from '@/db/types';
import { displayToKg, formatWeight, kgToDisplay, weightStepDisplay, weightUnit } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Muted, NeonButton, Pill } from '@/ui/primitives';
import { colors, fontSize, radius, space } from '@/ui/theme/tokens';
import { Stepper } from './Stepper';
import { useLogSet } from './useLogSet';

/**
 * Low-friction set logger (spec §6.1). Prefilled from the last set; "repeat last set" logs in ONE
 * tap, steppers replace the keyboard. Weight is shown/edited in the user's units (kg/lb) but stored
 * canonical kg. Stays open after logging. Calls the unchanged useLogSet hot path (→ JUICE fires).
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
  const { t } = useTranslation();
  const logSet = useLogSet();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const weightStepKg = useSettingsStore((s) => s.weightStep);

  const isBw = exercise?.is_bodyweight === 1;

  // weight is in DISPLAY units (kg or lb); lastSet keeps canonical kg for exact repeats.
  const [weight, setWeight] = useState(0);
  const [reps, setReps] = useState(0);
  const [rir, setRir] = useState<number | null>(null);
  const [lastSet, setLastSet] = useState<{ weightKg: number; reps: number; rir: number | null } | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!exercise) return;
    let alive = true;
    (async () => {
      const last = await getLastSetForExercise(db, exercise.id);
      if (!alive) return;
      if (last) {
        setLastSet({ weightKg: last.weight, reps: last.reps, rir: last.rir });
        setWeight(Math.round(kgToDisplay(last.weight, unitSystem) * 10) / 10);
        setReps(last.reps);
        setRir(last.rir);
      } else {
        setLastSet(null);
        setWeight(exercise.is_bodyweight ? 0 : Math.round(kgToDisplay(20, unitSystem)));
        setReps(exercise.rep_low);
        setRir(null);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, exercise?.id, unitSystem]);

  const commitKg = async (weightKg: number, r: number, rv: number | null) => {
    if (!exercise || r <= 0 || busy) return;
    setBusy(true);
    try {
      const sid = await ensureSession();
      const finalKg = exercise.is_bodyweight ? 0 : weightKg;
      await logSet({
        sessionId: sid,
        exerciseId: exercise.id,
        weight: finalKg,
        reps: r,
        rir: rv,
        hitTargetReps: r >= exercise.rep_low,
        loggedVia: 'quick',
      });
      setCount((c) => c + 1);
      setLastSet({ weightKg: finalKg, reps: r, rir: rv });
    } finally {
      setBusy(false);
    }
  };

  const lastSetText = (() => {
    if (!lastSet) return t('logger.firstSet');
    const w = formatWeight(lastSet.weightKg, unitSystem); // '' for bodyweight
    const core = `${w ? `${w} × ` : ''}${lastSet.reps}${lastSet.rir != null ? t('logger.lastSetRir', { rir: lastSet.rir }) : ''}`;
    return t('logger.lastSet', { set: core });
  })();

  return (
    <Modal visible={!!exercise} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {exercise ? (
          <>
            <View style={styles.handle} />
            <Text style={styles.title}>{t(`exercise.${exercise.id}`)}</Text>
            <Muted>
              {lastSetText}
              {count > 0 ? t('logger.sessionSetCount', { count }) : ''}
            </Muted>

            {!isBw ? (
              <Stepper
                label={t('logger.field.weight')}
                value={weight}
                step={weightStepDisplay(unitSystem, weightStepKg)}
                min={0}
                max={2000}
                precision={1}
                unit={weightUnit(unitSystem)}
                onChange={setWeight}
              />
            ) : null}
            <Stepper
              label={isBw ? t('logger.field.repsOrTime') : t('logger.field.reps')}
              value={reps}
              step={1}
              min={0}
              max={999}
              precision={0}
              onChange={setReps}
            />

            <Text style={styles.rirLabel}>{t('logger.rirLabel')}</Text>
            <View style={styles.rirRow}>
              {[0, 1, 2, 3, 4].map((n) => (
                <Pill
                  key={n}
                  label={n === 4 ? t('logger.rirMaxPill') : String(n)}
                  active={rir === n}
                  color={colors.violet}
                  onPress={() => setRir(rir === n ? null : n)}
                />
              ))}
            </View>

            <NeonButton
              label={t('logger.repeatLast')}
              color={colors.cyan}
              disabled={!lastSet || busy}
              onPress={() => lastSet && commitKg(lastSet.weightKg, lastSet.reps, lastSet.rir)}
              style={{ marginTop: space.lg }}
            />
            <NeonButton
              label={t('logger.logSet')}
              color={colors.energyHi}
              disabled={!reps || busy}
              onPress={() => commitKg(displayToKg(weight, unitSystem), reps, rir)}
              style={{ marginTop: space.sm }}
            />
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Muted>{t('logger.close')}</Muted>
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
  rirRow: { flexDirection: 'row', gap: space.sm },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.sm },
});
