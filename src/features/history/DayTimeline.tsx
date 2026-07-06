// One day of the history timeline — summary header (Metric small digits) + a vertical rail of
// the day's work: exercise groups (static ExercisePose thumb + per-set chips) and cardio entries,
// chronological. Long-press a set chip → delete flow (owned by the screen: confirm Alert +
// recomputeAndStore). Pure display: all grouping math lives in timeline.ts.

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ExercisePose } from '@/features/exercise-art/ExercisePose';
import { exerciseFamily } from '@/features/exercise-art/families';
import { formatDistance, kgToDisplay, weightUnit } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, Metric, useSkinAccent } from '@/ui/primitives';
import { useSkin } from '@/ui/skins/SkinContext';
import { hangulSafeLetterSpacing, radius, space, tracking, typeScale } from '@/ui/theme/tokens';
import {
  clockSpan,
  dayLabel,
  displayNum,
  formatClock,
  type CardioEntry,
  type DaySection,
  type ExerciseGroup,
  type SetChip,
} from './timeline';

const THUMB = 36; // static pose thumbnail (animated=false → zero clock)
const TIME_W = 44; // HH:MM column
const RAIL_W = 14; // dot column; the rail line runs through its center
const DOT = 8;

export interface DayTimelineProps {
  section: DaySection;
  /** Long-press delete — the screen owns confirm Alert + deleteSet + recomputeAndStore. */
  onDeleteSet: (setId: string, label: string) => void;
}

export function DayTimeline({ section, onDeleteSet }: DayTimelineProps) {
  const { t } = useTranslation();
  const skin = useSkin();
  const accent = useSkinAccent();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const palette = skin.palette;
  const minUnit = t('cardio.min');

  const label = (() => {
    const l = dayLabel(section.date);
    return l.kind === 'date' ? t('history.day.date', { month: l.month, day: l.day }) : t(`history.day.${l.kind}`);
  })();

  const exName = (id: string) => t(`exercise.${id}`, { defaultValue: id });

  const chipText = (chip: SetChip) =>
    chip.weightKg > 0
      ? `${displayNum(kgToDisplay(chip.weightKg, unitSystem))}×${chip.reps}`
      : t('history.repsOnly', { reps: chip.reps });

  // Summary stats — only what happened shows up (a 0 is silence, not a verdict; anti-shame §9).
  const stats: React.ReactNode[] = [];
  if (section.totalSets > 0) stats.push(<Metric key="sets" value={section.totalSets} unit="SET" size="small" />);
  const volume = Math.round(kgToDisplay(section.totalVolumeKg, unitSystem));
  if (volume > 0) stats.push(<Metric key="vol" value={volume} unit={weightUnit(unitSystem)} size="small" />);
  if (section.prCount > 0) {
    stats.push(
      <Metric key="pr" value={section.prCount} unit="PR" size="small" color={accent.solid} unitColor={accent.solid} />,
    );
  }
  if (section.cardioMinutes > 0) {
    stats.push(
      <Metric
        key="cardio"
        value={section.cardioMinutes}
        unit={minUnit}
        size="small"
        unitStyle={{ letterSpacing: hangulSafeLetterSpacing(minUnit, tracking.overline) }}
      />,
    );
  }

  const renderExercise = (group: ExerciseGroup) => {
    const name = exName(group.exerciseId);
    return (
      <>
        <View style={styles.exHeader}>
          <ExercisePose family={exerciseFamily(group.exerciseId)} size={THUMB} />
          <Text style={[styles.exName, { color: palette.text }]} numberOfLines={1}>
            {name}
          </Text>
        </View>
        <View style={styles.chips}>
          {group.sets.map((chip) => {
            const text = chipText(chip);
            const a11y = `${name} ${text}${chip.isPr ? ' PR' : ''}`;
            return (
              <Pressable
                key={chip.id}
                onLongPress={() => onDeleteSet(chip.id, `${name} · ${text}`)}
                delayLongPress={400}
                accessibilityLabel={a11y}
                accessibilityHint={t('history.deleteHint')}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: palette.surface2, borderColor: palette.line },
                  chip.isPr && { backgroundColor: accent.fill, borderColor: accent.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.chipText, { color: palette.text2 }, chip.isPr && { color: accent.solid }]}>
                  {text}
                </Text>
                {chip.isPr ? <Text style={[styles.chipPr, { color: accent.solid }]}>PR</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </>
    );
  };

  const renderCardio = (entry: CardioEntry) => (
    <>
      <View style={styles.exHeader}>
        <ExercisePose family={exerciseFamily(entry.modality)} size={THUMB} />
        <Text style={[styles.exName, { color: palette.text }]} numberOfLines={1}>
          {exName(entry.modality)}
        </Text>
      </View>
      <View style={styles.chips}>
        <View style={[styles.chip, { backgroundColor: palette.surface2, borderColor: palette.line }]}>
          <Text style={[styles.chipText, { color: palette.text2 }]}>
            {Math.round(entry.durationSec / 60)}
            {minUnit}
          </Text>
        </View>
        {entry.distanceM != null && entry.distanceM > 0 ? (
          <View style={[styles.chip, { backgroundColor: palette.surface2, borderColor: palette.line }]}>
            <Text style={[styles.chipText, { color: palette.text2 }]}>
              {formatDistance(entry.distanceM, unitSystem)}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[styles.dayLabel, { color: palette.text }]}>{label}</Text>
        <Metric value={clockSpan(section.firstAt, section.lastAt)} size="small" color={palette.text2} />
      </View>
      <View style={styles.summaryRow}>
        {stats.map((node, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <Text style={[styles.statDot, { color: palette.text3 }]}>·</Text> : null}
            {node}
          </React.Fragment>
        ))}
      </View>
      <View style={[styles.divider, { backgroundColor: palette.line }]} />
      <View style={styles.timeline}>
        {/* Thin accent rail through the dot column's center. */}
        <View pointerEvents="none" style={[styles.rail, { backgroundColor: accent.border }]} />
        {section.items.map((item) => (
          <View key={item.kind === 'exercise' ? `ex-${item.exerciseId}` : `cd-${item.id}`} style={styles.itemRow}>
            <Text style={[styles.time, { color: palette.text3 }]}>
              {formatClock(item.kind === 'exercise' ? item.firstLoggedAt : item.loggedAt)}
            </Text>
            <View style={styles.railCell}>
              <View style={[styles.dot, { backgroundColor: accent.solid }]} />
            </View>
            <View style={styles.itemBody}>{item.kind === 'exercise' ? renderExercise(item) : renderCardio(item)}</View>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: space.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  dayLabel: { ...typeScale.title },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: space.xs, marginTop: space.sm },
  statDot: { ...typeScale.caption, paddingBottom: 1, marginHorizontal: space.xxs },
  divider: { height: StyleSheet.hairlineWidth, marginTop: space.md },
  timeline: { marginTop: space.xs },
  rail: {
    position: 'absolute',
    left: TIME_W + RAIL_W / 2 - 1,
    top: 14,
    bottom: 14,
    width: 2,
    borderRadius: 1,
  },
  itemRow: { flexDirection: 'row', paddingVertical: space.sm },
  // System font for the clock keeps the row quiet; Orbitron is reserved for the summary digits.
  time: { width: TIME_W, ...typeScale.caption, fontVariant: ['tabular-nums'], paddingTop: 2 },
  railCell: { width: RAIL_W, alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginTop: 5 },
  itemBody: { flex: 1, paddingLeft: space.sm },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  exName: { ...typeScale.body, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingHorizontal: space.sm,
    borderRadius: radius.chip,
    borderWidth: 1,
  },
  chipText: { ...typeScale.label, fontVariant: ['tabular-nums'] },
  chipPr: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
});
