import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GoalUnit } from '@/db/types';
import { ExercisePose } from '@/features/exercise-art/ExercisePose';
import { exerciseFamily, type Family } from '@/features/exercise-art/families';
import { Card, Muted, SectionTitle, useSkinAccent } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { border, colors, numType, radius, space, typeScale } from '@/ui/theme/tokens';
import { DailyGoalEditorSheet } from './DailyGoalEditorSheet';
import { useDailyGoals } from './useDailyGoals';

const stepFor = (u: GoalUnit) => (u === 'sec' || u === 'm' ? 10 : u === 'reps' ? 5 : 1);
const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

const POSE_SIZE = 44;
const TICKS = 5;

// Goal labels are free text (per-locale: "버피", "Push-ups", "深蹲", …) — map them onto the 12
// original pose families so every tile gets art. Locale keywords first (all goals.suggest.* picks
// across ko/en/es/zh), then the slugified label through the exercise-art keyword fallback.
const GOAL_FAMILY_RULES: readonly (readonly [RegExp, Family])[] = [
  [/버피|burpee/i, 'pressHorizontal'],
  [/푸시업|푸쉬업|팔굽|flexion|俯卧撑|push/i, 'pressHorizontal'],
  [/풀업|턱걸이|친업|dominada|引体|pull|chin/i, 'pullVertical'],
  [/플랭크|plancha|平板|plank/i, 'core'],
  [/크런치|윗몸|abdominal|卷腹|crunch|sit.?up/i, 'core'],
  [/파머스|농부|granjero|农夫|farmer/i, 'hinge'],
  [/런지|estocada|zancada|弓步|lunge/i, 'squat'],
  [/스쿼트|sentadilla|深蹲|squat/i, 'squat'],
  [/러닝|달리기|조깅|correr|carrera|跑|run|jog/i, 'cardio'],
];

function goalFamily(label: string): Family {
  for (const [re, family] of GOAL_FAMILY_RULES) if (re.test(label)) return family;
  return exerciseFamily(label.trim().toLowerCase().replace(/[\s-]+/g, '_'));
}

/**
 * Daily training goals (실제도움 + 성취감 + 단순): recurring targets you crush every day.
 *
 * DE-TEXTED into pose tiles: each goal is an icon chip — original pose art + an x/y count badge +
 * progress ticks; the only words are the goal name (≤12pt). Tap a tile = +step; tap the badge =
 * finish the remainder (the old ✓); tap a done tile = reset (old 완료 button); long-press = remove
 * (unchanged, announced via accessibilityHint). Full progress/unit detail lives in each tile's
 * accessibilityLabel — nothing is lost, it just stopped being prose. Completing a goal still moves
 * real Combat Power + fires the JUICE pop (useDailyGoals).
 */
export function DailyGoalsCard() {
  const { t } = useTranslation();
  const accent = useSkinAccent();
  const skin = useSkinOrNull();
  const { goals, bump, reset, add, remove } = useDailyGoals();
  const [editorOpen, setEditorOpen] = useState(false);

  const positive = skin != null ? skin.palette.positive : colors.positive;
  const tickOff = skin != null ? skin.palette.bg1 : colors.recess;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <SectionTitle>{t('goals.title')}</SectionTitle>
        <Pressable onPress={() => setEditorOpen(true)} hitSlop={8}>
          <Text style={[styles.addLink, { color: accent.solid }]}>{t('goals.add')}</Text>
        </Pressable>
      </View>
      <Card>
        {goals.length === 0 ? (
          <Muted>{t('goals.empty')}</Muted>
        ) : (
          <View style={styles.tileRow}>
            {goals.map((g) => {
              const unit = g.target.unit;
              const step = stepFor(unit);
              // Any progress lights at least one tick (started ≠ zero); full ticks only when done.
              const ratio = g.progress / g.target.target;
              const filledTicks = g.done
                ? TICKS
                : Math.min(TICKS - 1, Math.max(g.progress > 0 ? 1 : 0, Math.round(ratio * TICKS)));
              return (
                <Pressable
                  key={g.target.id}
                  // Tap = +step (the old +N button); done tile tap = reset (the old 완료 button).
                  onPress={() => (g.done ? void reset(g) : void bump(g, step))}
                  onLongPress={() => void remove(g.target.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.target.label} · ${fmt(g.progress)} / ${fmt(g.target.target)} ${t(`goals.unit.${unit}`)}`}
                  accessibilityHint={t('goals.removeHint')}
                  accessibilityState={{ selected: g.done }}
                  style={({ pressed }) => [
                    styles.tile,
                    skin != null && { backgroundColor: skin.palette.surface2, borderColor: skin.palette.line },
                    g.done && { backgroundColor: accent.fill, borderColor: accent.border },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <ExercisePose
                    family={goalFamily(g.target.label)}
                    size={POSE_SIZE}
                    animated={false}
                    accent={g.done ? positive : accent.solid}
                  />
                  {/* Count badge — x/y digits; done → positive ✓. Tapping it finishes the remainder
                      in one go (the old ✓ button); once done the whole tile handles reset. */}
                  <Pressable
                    disabled={g.done}
                    onPress={() => void bump(g, g.target.target - g.progress)}
                    accessibilityRole="button"
                    accessibilityLabel={g.done ? t('goals.done') : `✓ ${g.target.label}`}
                    hitSlop={6}
                    style={[styles.badge, skin != null && { backgroundColor: skin.palette.surface1, borderColor: skin.palette.line }]}
                  >
                    {g.done ? (
                      <Text style={[styles.badgeDone, { color: positive }]}>✓</Text>
                    ) : (
                      <Text style={styles.badgeNum}>{`${fmt(g.progress)}/${fmt(g.target.target)}`}</Text>
                    )}
                  </Pressable>
                  <Text style={[styles.tileName, g.done && styles.dim]} numberOfLines={1}>
                    {g.target.label}
                  </Text>
                  <View style={styles.ticks}>
                    {Array.from({ length: TICKS }, (_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.tick,
                          { backgroundColor: i < filledTicks ? (g.done ? positive : accent.solid) : tickOff },
                        ]}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </Card>

      <DailyGoalEditorSheet visible={editorOpen} onClose={() => setEditorOpen(false)} onAdd={add} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addLink: { ...typeScale.label },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  // Machined chip: pose art + badge + ≤12pt name + ticks. ~3 per row on a standard width.
  tile: {
    width: '31%',
    flexGrow: 1,
    maxWidth: '48%',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.md,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
  },
  badge: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
    minWidth: 22,
    height: 18,
    paddingHorizontal: space.xs,
    borderRadius: radius.chip,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNum: { ...numType.small, fontSize: 10, lineHeight: 12, color: colors.text2 },
  badgeDone: { ...typeScale.label, fontSize: 11, lineHeight: 13 },
  tileName: { ...typeScale.caption, color: colors.text, marginTop: space.xs, maxWidth: '100%' },
  dim: { color: colors.text3 },
  ticks: { flexDirection: 'row', gap: space.xxs, marginTop: space.xs },
  tick: { width: 10, height: 3, borderRadius: 1 },
});
