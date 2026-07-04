import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ExerciseRow } from '@/db/types';
import { distanceToMeters, distanceUnit } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button, Muted, Pill } from '@/ui/primitives';
import { colors, hangulSafeLetterSpacing, radius, space, tracking, typeScale } from '@/ui/theme/tokens';
import { Stepper } from './Stepper';
import { useLogCardio } from './useLogCardio';

/**
 * Cardio logger — duration + optional distance + optional RPE. Writes cardio_log, fires JUICE.
 * MONOLITH sheet chrome: opaque surface1 panel, edge highlight, lineStrong grabber; the log CTA
 * is THE one solid-accent primary on the sheet.
 */
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
  const insets = useSafeAreaInsets();
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
      <View style={[styles.sheet, { paddingBottom: Math.max(space.lg, insets.bottom) }]}>
        <View pointerEvents="none" style={styles.sheetEdge} />
        {exercise ? (
          <>
            <View style={styles.grabber} />
            <Text style={styles.title}>{t(`exercise.${exercise.id}`)}</Text>
            <Muted style={styles.meta}>{count > 0 ? t('logger.sessionSetCount', { count }) : ''}</Muted>

            <Stepper label={t('cardio.duration')} value={minutes} step={5} min={0} max={600} precision={0} unit={t('cardio.min')} onChange={setMinutes} />
            <Stepper label={t('cardio.distance')} value={distance} step={0.5} min={0} max={500} precision={1} unit={distanceUnit(unitSystem)} onChange={setDistance} />

            <Text
              style={[
                styles.fieldLabel,
                { letterSpacing: hangulSafeLetterSpacing(t('cardio.rpe'), tracking.overline) },
              ]}
            >
              {t('cardio.rpe')}
            </Text>
            <View style={styles.rpeRow}>
              {[6, 7, 8, 9, 10].map((n) => (
                <Pill key={n} label={String(n)} active={rpe === n} onPress={() => setRpe(rpe === n ? null : n)} />
              ))}
            </View>

            <Button
              label={t('logger.logSet')}
              variant="primary"
              disabled={!minutes || busy}
              onPress={commit}
              style={{ marginTop: space.xl }}
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
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  // Opaque machined panel — logger digits never fight scroll bleed-through.
  sheet: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    overflow: 'hidden',
    paddingHorizontal: space.lg,
  },
  sheetEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: colors.edgeHi },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  title: { ...typeScale.title, color: colors.text },
  meta: { marginTop: space.xxs },
  fieldLabel: { ...typeScale.overline, marginTop: space.xl, marginBottom: space.sm },
  rpeRow: { flexDirection: 'row', gap: space.sm },
  closeBtn: { alignSelf: 'center', paddingVertical: space.md, marginTop: space.sm },
});
