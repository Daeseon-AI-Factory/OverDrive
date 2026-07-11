import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ExercisePose } from '@/features/exercise-art/ExercisePose';
import { exerciseFamily } from '@/features/exercise-art/families';
import { formatWeight, weightUnit } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button, Card, Metric } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { colors, space, typeScale } from '@/ui/theme/tokens';
import type { SavedQuickSet } from './useQuickLog';

const AUTO_DISMISS_MS = 15_000;
const POSE_SIZE = 44;

/**
 * Confirm-as-undo card (spec §6: confirmation is POST-save, skippable, auto-dismissing). Appears
 * above the quicklog bar after every successful save: animated exercise pose + name + weight×reps
 * in Metric digits + today's set count for that exercise, with [수정] (open the set logger
 * prefilled) and [취소] (delete the just-saved set) as the only actions. Auto-dismisses after
 * ~15s (linear progress hairline); tap the summary to dismiss early. With a
 * screen reader active it stays until an explicit action or the next save. It NEVER blocks further
 * logging — a new save just replaces it (fresh `nonce` restarts the clock).
 */
export function ConfirmUndoCard({
  nonce,
  saved,
  editable,
  busy = false,
  onEdit,
  onUndo,
  onDismiss,
}: {
  /** Bumped per save — restarts the auto-dismiss clock when a new log replaces the card. */
  nonce: number;
  saved: SavedQuickSet;
  /** [수정] shows only for strength catalog exercises (the SetLoggerSheet's domain). */
  editable: boolean;
  /** Pauses dismissal and disables actions while an async correction is being committed. */
  busy?: boolean;
  onEdit: () => void;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const { t, i18n } = useTranslation();
  const skin = useSkinOrNull();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState<boolean | null>(null);

  const ko = i18n.language.startsWith('ko');
  const dv = useCallback((koStr: string, enStr: string) => (ko ? koStr : enStr), [ko]);

  // Latest onDismiss behind a STABLE dispatcher — the parent recreates the callback per render,
  // and it must not re-arm the auto-dismiss timer or rebuild the PanResponder.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });
  const dismissNow = useCallback(() => onDismissRef.current(), []);

  const progress = useSharedValue(1); // 1 → 0 over AUTO_DISMISS_MS (the hairline width)

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isScreenReaderEnabled()
      .then((enabled) => {
        if (alive) setScreenReaderEnabled(enabled);
      })
      .catch(() => {
        if (alive) setScreenReaderEnabled(false);
      });
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReaderEnabled);
    return () => {
      alive = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    progress.value = 1;
    // Time-limited correction controls are unusable while VoiceOver/TalkBack is traversing them.
    if (screenReaderEnabled !== false || busy) return;
    progress.value = withTiming(0, { duration: AUTO_DISMISS_MS, easing: Easing.linear });
    const id = setTimeout(dismissNow, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [nonce, progress, dismissNow, screenReaderEnabled, busy]);

  const hairlineStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const w = formatWeight(saved.weightKg, unitSystem); // '' for bodyweight
  const stat = `${w ? `${w.split(' ')[0]}×` : ''}${saved.reps}`; // digits-only (Orbitron renders digits, not words)
  const hairlineColor = skin?.palette.accent ?? colors.positive;

  return (
    <View>
      <Card style={styles.card}>
        <View style={styles.row}>
          <Pressable
            onPress={dismissNow}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('quicklog.confirmCard.dismiss', {
              defaultValue: dv('기록 확인 닫기', 'Dismiss log confirmation'),
            })}
            style={styles.summaryAction}
          >
            <ExercisePose family={exerciseFamily(saved.exerciseId)} size={POSE_SIZE} animated />
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {saved.name}
              </Text>
              <View style={styles.statRow}>
                <Metric value={stat} unit={w ? weightUnit(unitSystem).toUpperCase() : undefined} size="small" />
                <Text style={styles.count}>
                  {/* `n`, not `count` — avoids i18next plural-suffix lookup on an in-code defaultValue */}
                  {t('quicklog.confirmCard.todayCount', {
                    n: saved.setCountToday,
                    defaultValue: dv('오늘 {n}세트', 'Set {n} today'),
                  })}
                </Text>
              </View>
            </View>
          </Pressable>
          {editable ? (
            <Button
              label={t('quicklog.confirmCard.edit', { defaultValue: dv('수정', 'Edit') })}
              variant="secondary"
              compact
              disabled={busy}
              onPress={onEdit}
            />
          ) : null}
          <Button
            label={t('quicklog.confirmCard.undo', { defaultValue: dv('취소', 'Undo') })}
            variant="ghost"
            compact
            disabled={busy}
            onPress={onUndo}
          />
        </View>
        {/* Auto-dismiss progress hairline — drains left→right over the card's lifetime. */}
        <View style={styles.track}>
          <Animated.View style={[styles.hairline, { backgroundColor: hairlineColor }, hairlineStyle]} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: space.sm, paddingHorizontal: space.md, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  summaryAction: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  info: { flex: 1, minWidth: 0 },
  name: { ...typeScale.label, color: colors.text },
  statRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginTop: space.xxs },
  count: { ...typeScale.caption, color: colors.text3, paddingBottom: 1 },
  track: { height: 2, marginTop: space.sm, overflow: 'hidden' },
  hairline: { height: 2 },
});
