import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { GoalUnit } from '@/db/types';
import { Card, Muted, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, radius, space } from '@/ui/theme/tokens';
import { DailyGoalEditorSheet } from './DailyGoalEditorSheet';
import { useDailyGoals } from './useDailyGoals';

const stepFor = (u: GoalUnit) => (u === 'sec' || u === 'm' ? 10 : u === 'reps' ? 5 : 1);
const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

/**
 * Daily training goals (실제도움 + 성취감 + 단순): recurring targets you crush every day. Tap +step to
 * rack up progress; completing one moves real Combat Power and fires a JUICE pop. Long-press a goal to
 * remove it. Modality-agnostic — burpees (reps), farmer's walk (sets/m), plank (sec) all fit.
 */
export function DailyGoalsCard() {
  const { t } = useTranslation();
  const { goals, bump, reset, add, remove } = useDailyGoals();
  const [editorOpen, setEditorOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <SectionTitle>{t('goals.title')}</SectionTitle>
        <Pressable onPress={() => setEditorOpen(true)} hitSlop={8}>
          <Text style={styles.addLink}>{t('goals.add')}</Text>
        </Pressable>
      </View>
      <Card>
        {goals.length === 0 ? (
          <Muted>{t('goals.empty')}</Muted>
        ) : (
          goals.map((g) => {
            const unit = g.target.unit;
            const pct = Math.min(100, Math.round((g.progress / g.target.target) * 100));
            const step = stepFor(unit);
            return (
              <View key={g.target.id} style={styles.goalRow}>
                <View style={styles.goalMain}>
                  <View style={styles.goalTop}>
                    <Pressable onLongPress={() => remove(g.target.id)} hitSlop={6}>
                      <Text style={[styles.goalLabel, g.done && styles.dim]}>{g.target.label}</Text>
                    </Pressable>
                    <Text style={styles.goalProgress}>
                      {fmt(g.progress)} / {fmt(g.target.target)} {t(`goals.unit.${unit}`)}
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View
                      style={[styles.fill, { width: `${pct}%`, backgroundColor: g.done ? colors.success : colors.cyan }]}
                    />
                  </View>
                </View>

                <View style={styles.actions}>
                  {g.done ? (
                    <Pressable onPress={() => reset(g)} style={styles.donePill} hitSlop={6}>
                      <Text style={styles.doneText}>{t('goals.done')}</Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable onPress={() => bump(g, step)} style={styles.incBtn} hitSlop={6}>
                        <Text style={styles.incText}>+{step}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => bump(g, g.target.target - g.progress)}
                        style={styles.checkBtn}
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

      <DailyGoalEditorSheet visible={editorOpen} onClose={() => setEditorOpen(false)} onAdd={add} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addLink: { color: colors.cyan, fontSize: fontSize.sm, fontWeight: '800', letterSpacing: 1 },
  goalRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm },
  goalMain: { flex: 1, marginRight: space.md },
  goalTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  goalLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '800' },
  goalProgress: { color: colors.textDim, fontSize: fontSize.sm, fontWeight: '700' },
  dim: { color: colors.textDim },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  incBtn: {
    minWidth: 52,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.cyan,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
  },
  incText: { color: colors.cyan, fontSize: fontSize.md, fontWeight: '900' },
  checkBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { color: colors.success, fontSize: fontSize.lg, fontWeight: '900' },
  donePill: {
    paddingHorizontal: space.md,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.success,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: { color: colors.bg, fontSize: fontSize.sm, fontWeight: '900', letterSpacing: 1 },
});
