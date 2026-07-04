import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GoalUnit } from '@/db/types';
import { Card, Muted, ProgressTrack, SectionTitle, useAccent } from '@/ui/primitives';
import { border, colors, numType, radius, space, typeScale } from '@/ui/theme/tokens';
import { DailyGoalEditorSheet } from './DailyGoalEditorSheet';
import { useDailyGoals } from './useDailyGoals';

const stepFor = (u: GoalUnit) => (u === 'sec' || u === 'm' ? 10 : u === 'reps' ? 5 : 1);
const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

/**
 * Daily training goals (실제도움 + 성취감 + 단순): recurring targets you crush every day. Tap +step to
 * rack up progress; completing one moves real Combat Power and fires a JUICE pop. Long-press a goal to
 * remove it. Modality-agnostic — burpees (reps), farmer's walk (sets/m), plank (sec) all fit.
 *
 * MONOLITH: neutral card; progress = accent fill → positive green at complete (achieved status, §9).
 * Action squares are ghost chrome (surface2 + line) — semantic green appears only as ≤13pt text.
 */
export function DailyGoalsCard() {
  const { t } = useTranslation();
  const accent = useAccent();
  const { goals, bump, reset, add, remove } = useDailyGoals();
  const [editorOpen, setEditorOpen] = useState(false);

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
          goals.map((g) => {
            const unit = g.target.unit;
            const step = stepFor(unit);
            return (
              <View key={g.target.id} style={styles.goalRow}>
                <View style={styles.goalMain}>
                  <View style={styles.goalTop}>
                    <Pressable accessibilityHint={t('goals.removeHint')} onLongPress={() => remove(g.target.id)} hitSlop={6}>
                      <Text style={[styles.goalLabel, g.done && styles.dim]}>{g.target.label}</Text>
                    </Pressable>
                    <View style={styles.goalProgress}>
                      <Text style={styles.goalProgressNow}>{fmt(g.progress)}</Text>
                      <Text style={styles.goalProgressMeta}>{` / ${fmt(g.target.target)} ${t(`goals.unit.${unit}`)}`}</Text>
                    </View>
                  </View>
                  <ProgressTrack progress={g.progress / g.target.target} complete={g.done} />
                </View>

                <View style={styles.actions}>
                  {g.done ? (
                    <Pressable
                      onPress={() => reset(g)}
                      style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
                      hitSlop={6}
                    >
                      <Text style={styles.doneText}>{t('goals.done')}</Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable
                        onPress={() => bump(g, step)}
                        style={({ pressed }) => [styles.actionBtn, styles.incBtn, pressed && styles.actionPressed]}
                        hitSlop={6}
                      >
                        <Text style={styles.incText}>+{step}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => bump(g, g.target.target - g.progress)}
                        style={({ pressed }) => [styles.actionBtn, styles.checkBtn, pressed && styles.actionPressed]}
                        hitSlop={6}
                      >
                        <Text style={styles.checkText}>✓</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
      </Card>

      {goals.length > 0 ? <Muted style={styles.removeHint}>{t('goals.removeHint')}</Muted> : null}

      <DailyGoalEditorSheet visible={editorOpen} onClose={() => setEditorOpen(false)} onAdd={add} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xs },
  removeHint: { marginTop: space.xs, color: colors.text3 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addLink: { ...typeScale.label },
  goalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm },
  goalMain: { flex: 1, marginRight: space.md },
  goalTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: space.sm },
  goalLabel: { ...typeScale.body, color: colors.text },
  goalProgress: { flexDirection: 'row', alignItems: 'flex-end' },
  goalProgressNow: { ...numType.small, color: colors.text },
  goalProgressMeta: { ...typeScale.caption, color: colors.text3, paddingBottom: 1 },
  dim: { color: colors.text3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // Ghost machined block — the shared chrome for +step / ✓ / done-reset.
  actionBtn: {
    height: 40,
    minWidth: 44,
    borderRadius: radius.md,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  actionPressed: { backgroundColor: colors.surface3 },
  incBtn: { minWidth: 52 },
  checkBtn: { width: 44, paddingHorizontal: 0 },
  incText: { ...numType.small, color: colors.text2 },
  checkText: { ...typeScale.label, color: colors.positive },
  doneText: { ...typeScale.label, color: colors.positive },
});
