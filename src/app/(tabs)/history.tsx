import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted, Screen } from '@/ui/primitives';
import { formatWeight } from '@/lib/units';
import { colors, fontSize, space } from '@/ui/theme/tokens';

interface HistoryRow {
  id: string;
  weight: number; // kg (canonical)
  reps: number;
  rir: number | null;
  is_pr: number;
  logged_at: string;
  exercise_id: string;
}

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const [rows, setRows] = useState<HistoryRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const r = await db.getAllAsync<HistoryRow>(
          `SELECT id, weight, reps, rir, is_pr, logged_at, exercise_id
           FROM set_log ORDER BY logged_at DESC LIMIT 100`,
        );
        if (alive) setRows(r);
      })();
      return () => {
        alive = false;
      };
    }, [db]),
  );

  return (
    <Screen>
      <Text style={styles.title}>{t('history.title')}</Text>
      {rows.length === 0 ? (
        <Card>
          <Muted>{t('history.empty')}</Muted>
        </Card>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          renderItem={({ item }) => {
            const main =
              item.weight > 0
                ? `${formatWeight(item.weight, unitSystem)} × ${item.reps}`
                : t('history.repsOnly', { reps: item.reps });
            const rir = item.rir != null ? t('history.rirSuffix', { rir: item.rir }) : '';
            return (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ex}>{t(`exercise.${item.exercise_id}`)}</Text>
                  <Muted>
                    {main}
                    {rir}
                  </Muted>
                </View>
                {item.is_pr === 1 ? <Text style={styles.pr}>{t('history.prBadge')}</Text> : null}
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '900', marginTop: space.lg, marginBottom: space.md },
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
