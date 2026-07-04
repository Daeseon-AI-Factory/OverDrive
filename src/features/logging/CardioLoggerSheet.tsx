import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ExerciseRow } from '@/db/types';
import { distanceToMeters, distanceUnit } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Muted, NeonButton, Pill } from '@/ui/primitives';
import { colors, fontSize, radius, space } from '@/ui/theme/tokens';
import { Stepper } from './Stepper';
import { useLogCardio } from './useLogCardio';

/** Cardio logger — duration + optional distance + optional RPE. Writes cardio_log, fires JUICE. */
export function CardioLoggerSheet({
  exercise,
  ensureSession,
  onClose,
}: {
  exercise: ExerciseRow | null;
  ensureSession: () => Promise<string>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const logCardio = useLogCardio();
  const unitSystem = useSettingsStore((s) => s.unitSystem);

  const [minutes, setMinutes] = useState(20);
  const [distance, setDistance] = useState(0); // display units (km/mi)
  const [rpe, setRpe] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const commit = async () => {
    if (!exercise || minutes <= 0 || busy) return;
    setBusy(true);
    try {
      const sid = await ensureSession();
      await logCardio({
        sessionId: sid,
        modality: exercise.id,
        durationSec: Math.round(minutes * 60),
        distanceM: distance > 0 ? distanceToMeters(distance, unitSystem) : null,
        rpe,
      });
      setCount((c) => c + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={!!exercise} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        {exercise ? (
          <>
            <View style={styles.handle} />
            <Text style={styles.title}>{t(`exercise.${exercise.id}`)}</Text>
            <Muted>{count > 0 ? t('logger.sessionSetCount', { count }) : ''}</Muted>

            <Stepper label={t('cardio.duration')} value={minutes} step={5} min={0} max={600} precision={0} unit={t('cardio.min')} onChange={setMinutes} />
            <Stepper label={t('cardio.distance')} value={distance} step={0.5} min={0} max={500} precision={1} unit={distanceUnit(unitSystem)} onChange={setDistance} />

            <Text style={styles.rpeLabel}>{t('cardio.rpe')}</Text>
            <View style={styles.rpeRow}>
              {[6, 7, 8, 9, 10].map((n) => (
                <Pill key={n} label={String(n)} active={rpe === n} color={colors.violet} onPress={() => setRpe(rpe === n ? null : n)} />
              ))}
            </View>

            <NeonButton label={t('logger.logSet')} color={colors.energyHi} disabled={!minutes || busy} onPress={commit} style={{ marginTop: space.lg }} />
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
  rpeLabel: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '700', marginTop: space.lg, marginBottom: 6 },
  rpeRow: { flexDirection: 'row', gap: space.sm },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.sm },
});
