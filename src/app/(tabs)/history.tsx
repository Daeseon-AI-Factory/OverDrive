import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EXERCISE_TO_REGION, REGIONS, type BodyRegionId } from '@/features/character/regions';
import { localDateDaysAgo } from '@/lib/date';
import { formatWeight } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted, Screen, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, numberFamily, space } from '@/ui/theme/tokens';

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
                <Text style={[styles.regionLabel, { color: done ? REGIONS[region].color : colors.textDim }]}>
                  {t(`region.${region}`)}
                </Text>
                {done ? (
                  <Text style={styles.weekStat}>
                    {w.sets} · {formatWeight(w.volumeKg, unitSystem, 0)}
                  </Text>
                ) : (
                  <Muted>{t('history.noneThisWeek')}</Muted>
                )}
              </View>
            );
          })}
          <View style={[styles.weekRow, styles.cardioRow]}>
            <Text style={[styles.regionLabel, { color: cardio.sessions > 0 ? colors.energyLo : colors.textDim }]}>
              🏃 {t('today.cardioSheetTitle')}
            </Text>
            {cardio.sessions > 0 ? (
              <Text style={styles.weekStat}>
                {cardio.sessions} · {cardio.minutes} {t('cardio.min')}
              </Text>
            ) : (
              <Muted>{t('history.noneThisWeek')}</Muted>
            )}
          </View>
        </Card>

        <SectionTitle>{t('history.title')}</SectionTitle>
        {recent.length === 0 ? (
          <Card>
            <Muted>{t('history.empty')}</Muted>
          </Card>
        ) : (
          recent.map((item) => {
            const main =
              item.weight > 0
                ? `${formatWeight(item.weight, unitSystem)} × ${item.reps}`
                : t('history.repsOnly', { reps: item.reps });
            return (
              <View key={item.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ex}>{t(`exercise.${item.exercise_id}`)}</Text>
                  <Muted>
                    {main}
                    {item.rir != null ? t('history.rirSuffix', { rir: item.rir }) : ''}
                  </Muted>
                </View>
                {item.is_pr === 1 ? <Text style={styles.pr}>{t('history.prBadge')}</Text> : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '900', marginTop: space.lg },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  cardioRow: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: space.xs },
  regionLabel: { fontSize: fontSize.md, fontWeight: '800' },
  weekStat: { color: colors.text, fontFamily: numberFamily, fontSize: fontSize.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space.md,
    marginBottom: space.sm,
  },
  ex: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  pr: { color: colors.energyHi, fontSize: fontSize.sm, fontWeight: '900' },
});
