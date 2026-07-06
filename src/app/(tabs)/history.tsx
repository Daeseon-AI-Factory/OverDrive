// HISTORY — a daily timeline. '주간' region-volume card pinned on top, then the last 14 days with
// data as day sections (오늘/어제/M월 D일): summary digits + a vertical rail of exercise groups and
// cardio entries. Long-press a set chip = delete (confirm Alert → deleteSet → recomputeAndStore).

import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { getCardioWithDateSince } from '@/db/repos/cardioRepo';
import { deleteSet, getSetsWithDateSince } from '@/db/repos/setLogRepo';
import { EXERCISE_TO_REGION } from '@/features/character/regions';
import { DayTimeline } from '@/features/history/DayTimeline';
import { buildDaySections, type DaySection } from '@/features/history/timeline';
import { emptyWeekly, WeeklyCard, type Weekly } from '@/features/history/WeeklyCard';
import { localDateDaysAgo } from '@/lib/date';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Button, Card, Muted, Screen, SectionTitle } from '@/ui/primitives';
import { useSkin } from '@/ui/skins/SkinContext';
import { space, typeScale } from '@/ui/theme/tokens';

const TIMELINE_DAYS = 14;

interface HistoryData {
  weekly: Weekly;
  weeklyCardio: { sessions: number; minutes: number };
  days: DaySection[];
}

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const router = useRouter();
  const skin = useSkin();
  const [data, setData] = useState<HistoryData>({
    weekly: emptyWeekly(),
    weeklyCardio: { sessions: 0, minutes: 0 },
    days: [],
  });

  const load = useCallback(async (): Promise<HistoryData> => {
    // '주간' pinned summary — last 7 days.
    const weekSince = localDateDaysAgo(6);
    const weekSets = await db.getAllAsync<{ exercise_id: string; weight: number; reps: number }>(
      `SELECT sl.exercise_id, sl.weight, sl.reps FROM set_log sl
       JOIN workout_session ws ON ws.id = sl.session_id WHERE ws.date >= ?`,
      [weekSince],
    );
    const weekly = emptyWeekly();
    for (const s of weekSets) {
      const r = EXERCISE_TO_REGION[s.exercise_id];
      if (r) {
        weekly[r].sets += 1;
        weekly[r].volumeKg += s.weight * s.reps;
      }
    }
    const card = await db.getFirstAsync<{ n: number; sec: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(cl.duration_sec), 0) AS sec FROM cardio_log cl
       JOIN workout_session ws ON ws.id = cl.session_id WHERE ws.date >= ?`,
      [weekSince],
    );

    // Daily timeline — last 14 days with data.
    const since = localDateDaysAgo(TIMELINE_DAYS - 1);
    const [sets, cardio] = await Promise.all([
      getSetsWithDateSince(db, since),
      getCardioWithDateSince(db, since),
    ]);
    return {
      weekly,
      weeklyCardio: { sessions: card?.n ?? 0, minutes: Math.round((card?.sec ?? 0) / 60) },
      days: buildDaySections(sets, cardio),
    };
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void load().then((d) => {
        if (alive) setData(d);
      });
      return () => {
        alive = false;
      };
    }, [load]),
  );

  const onDeleteSet = useCallback(
    (setId: string, label: string) => {
      Alert.alert(t('history.delete.title'), label, [
        { text: t('history.delete.cancel'), style: 'cancel' },
        {
          text: t('history.delete.confirm'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await deleteSet(db, setId);
              setData(await load());
              const result = await recomputeAndStore(db);
              useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
            })();
          },
        },
      ]);
    },
    [db, load, t],
  );

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <Text style={[styles.title, { color: skin.palette.text }]}>{t('history.title')}</Text>

        <SectionTitle>{t('history.weekly')}</SectionTitle>
        <WeeklyCard weekly={data.weekly} cardio={data.weeklyCardio} />

        <SectionTitle>{t('history.timeline')}</SectionTitle>
        {data.days.length === 0 ? (
          // Honest empty state — nothing logged in the window yet; the only CTA is the first set.
          <Card>
            <Muted>{t('history.empty')}</Muted>
            <View style={styles.emptyCta}>
              <Button label={t('history.emptyCta')} onPress={() => router.navigate('/')} />
            </View>
          </Card>
        ) : (
          data.days.map((section) => (
            <DayTimeline key={section.date} section={section} onDeleteSet={onDeleteSet} />
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...typeScale.title, marginTop: space.lg },
  emptyCta: { marginTop: space.md },
});
