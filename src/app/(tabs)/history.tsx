import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Card, Muted, Screen } from '@/ui/primitives';
import { colors, fontSize, space } from '@/ui/theme/tokens';

interface HistoryRow {
  id: string;
  weight: number;
  reps: number;
  rir: number | null;
  is_pr: number;
  logged_at: string;
  exercise_name: string;
}

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const [rows, setRows] = useState<HistoryRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const r = await db.getAllAsync<HistoryRow>(
          `SELECT sl.id, sl.weight, sl.reps, sl.rir, sl.is_pr, sl.logged_at, e.name AS exercise_name
           FROM set_log sl JOIN exercise e ON e.id = sl.exercise_id
           ORDER BY sl.logged_at DESC LIMIT 100`,
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
      <Text style={styles.title}>기록</Text>
      {rows.length === 0 ? (
        <Card>
          <Muted>아직 기록이 없어. 오늘 탭에서 첫 세트를 남겨봐.</Muted>
        </Card>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ex}>{item.exercise_name}</Text>
                <Muted>
                  {item.weight > 0 ? `${item.weight}kg × ${item.reps}` : `${item.reps}회`}
                  {item.rir != null ? ` · RIR ${item.rir}` : ''}
                </Muted>
              </View>
              {item.is_pr === 1 ? <Text style={styles.pr}>PR ⚡</Text> : null}
            </View>
          )}
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
