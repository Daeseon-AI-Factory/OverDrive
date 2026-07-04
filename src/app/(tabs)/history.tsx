import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { deleteSet } from '@/db/repos/setLogRepo';
import { EXERCISE_TO_REGION, type BodyRegionId } from '@/features/character/regions';
import { localDateDaysAgo } from '@/lib/date';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { formatWeight, kgToDisplay, weightUnit } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, Metric, Muted, Screen, SectionTitle } from '@/ui/primitives';
import { colors, hangulSafeLetterSpacing, space, tracking, typeScale } from '@/ui/theme/tokens';

const WEEKLY_ORDER: BodyRegionId[] = ['chest', 'shoulders', 'back', 'arms', 'core', 'legs'];
type Weekly = Record<BodyRegionId, { sets: number; volumeKg: number }>;
const emptyWeekly = (): Weekly => ({
  chest: { sets: 0, volumeKg: 0 },
  shoulders: { sets: 0, volumeKg: 0 },
  back: { sets: 0, volumeKg: 0 },
  arms: { sets: 0, volumeKg: 0 },
  core: { sets: 0, volumeKg: 0 },
  legs: { sets: 0, volumeKg: 0 },
});

interface RecentRow {
  id: string;
  weight: number;
  reps: number;
  rir: number | null;
  is_pr: number;
  exercise_id: string;
}

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [weekly, setWeekly] = useState<Weekly>(emptyWeekly);
  const [cardio, setCardio] = useState({ sessions: 0, minutes: 0 });
  const [recent, setRecent] = useState<RecentRow[]>([]);

  const onDeleteSet = useCallback(
    (item: RecentRow, label: string) => {
      Alert.alert(t('history.delete.title'), label, [
        { text: t('history.delete.cancel'), style: 'cancel' },
        {
          text: t('history.delete.confirm'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await deleteSet(db, item.id);
              setRecent((rs) => rs.filter((r) => r.id !== item.id));
              const result = await recomputeAndStore(db);
              useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
            })();
          },
        },
      ]);
    },
    [db, t],
  );

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const since = localDateDaysAgo(6);
        const sets = await db.getAllAsync<{ exercise_id: string; weight: number; reps: number }>(
          `SELECT sl.exercise_id, sl.weight, sl.reps FROM set_log sl
           JOIN workout_session ws ON ws.id = sl.session_id WHERE ws.date >= ?`,
          [since],
        );
        const map = emptyWeekly();
        for (const s of sets) {
          const r = EXERCISE_TO_REGION[s.exercise_id];
          if (r) {
            map[r].sets += 1;
            map[r].volumeKg += s.weight * s.reps;
          }
        }
        const card = await db.getFirstAsync<{ n: number; sec: number }>(
          `SELECT COUNT(*) AS n, COALESCE(SUM(cl.duration_sec), 0) AS sec FROM cardio_log cl
           JOIN workout_session ws ON ws.id = cl.session_id WHERE ws.date >= ?`,
          [since],
        );
        const r = await db.getAllAsync<RecentRow>(
          `SELECT id, weight, reps, rir, is_pr, exercise_id FROM set_log ORDER BY logged_at DESC LIMIT 60`,
        );
        if (!alive) return;
        setWeekly(map);
        setCardio({ sessions: card?.n ?? 0, minutes: Math.round((card?.sec ?? 0) / 60) });
        setRecent(r);
      })();
      return () => {
        alive = false;
      };
    }, [db]),
  );

  const minUnit = t('cardio.min');

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <Text style={styles.title}>{t('history.title')}</Text>

        <SectionTitle>{t('history.weekly')}</SectionTitle>
        <Card>
          {WEEKLY_ORDER.map((region) => {
            const w = weekly[region];
            const done = w.sets > 0;
            return (
              <View key={region} style={styles.weekRow}>
                {/* Trained regions get full text, untrained recede to text3 — status by light, not hue. */}
                <Text style={[styles.regionLabel, { color: done ? colors.text : colors.text3 }]}>
                  {t(`region.${region}`)}
                </Text>
                {done ? (
                  <View style={styles.statCluster}>
                    <Metric value={w.sets} unit="SET" size="small" />
                    {w.volumeKg > 0 ? (
                      <>
                        <Text style={styles.statDot}>·</Text>
                        <Metric value={Math.round(kgToDisplay(w.volumeKg, unitSystem))} unit={weightUnit(unitSystem)} size="small" />
                      </>
                    ) : null}
                  </View>
                ) : (
                  <Muted style={styles.none}>{t('history.noneThisWeek')}</Muted>
                )}
              </View>
            );
          })}
          <View style={[styles.weekRow, styles.cardioRow]}>
            <Text style={[styles.regionLabel, { color: cardio.sessions > 0 ? colors.text : colors.text3 }]}>
              {t('today.cardioSheetTitle')}
            </Text>
            {cardio.sessions > 0 ? (
              <View style={styles.statCluster}>
                <Metric value={cardio.sessions} size="small" />
                <Text style={styles.statDot}>·</Text>
                <Metric
                  value={cardio.minutes}
                  unit={minUnit}
                  size="small"
                  unitStyle={{ letterSpacing: hangulSafeLetterSpacing(minUnit, tracking.overline) }}
                />
              </View>
            ) : (
              <Muted style={styles.none}>{t('history.noneThisWeek')}</Muted>
            )}
          </View>
        </Card>

        <SectionTitle>{t('history.title')}</SectionTitle>
        {recent.length === 0 ? (
          <Card>
            <Muted>{t('history.empty')}</Muted>
          </Card>
        ) : (
          <Card style={styles.listCard}>
            {recent.map((item, idx) => {
              const main =
                item.weight > 0
                  ? `${formatWeight(item.weight, unitSystem)} × ${item.reps}`
                  : t('history.repsOnly', { reps: item.reps });
              const exName = t(`exercise.${item.exercise_id}`, { defaultValue: item.exercise_id });
              return (
                <Pressable
                  key={item.id}
                  style={({ pressed }) => [
                    styles.row,
                    idx < recent.length - 1 && styles.rowSep,
                    pressed && styles.rowPressed,
                  ]}
                  onLongPress={() => onDeleteSet(item, `${exName} · ${main}`)}
                  delayLongPress={400}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ex}>{exName}</Text>
                    <Muted>
                      {main}
                      {item.rir != null ? t('history.rirSuffix', { rir: item.rir }) : ''}
                    </Muted>
                  </View>
                  {item.is_pr === 1 ? <Text style={styles.pr}>{t('history.prBadge')}</Text> : null}
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typeScale.title, color: colors.text, marginTop: space.lg },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  cardioRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, marginTop: space.xs },
  regionLabel: { ...typeScale.body },
  statCluster: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  statDot: { ...typeScale.caption, color: colors.text3, paddingBottom: 1 },
  none: { color: colors.text3 },
  // One machined panel for the whole log — rows + hairline seams instead of per-row mini-cards.
  listCard: { padding: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  rowSep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  rowPressed: { backgroundColor: colors.surface2 },
  ex: { ...typeScale.body, color: colors.text },
  pr: { ...typeScale.label, color: colors.positive },
});
