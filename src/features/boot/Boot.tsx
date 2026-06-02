import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { recomputeAndStore } from '../../db/repos/combatPowerRepo';
import { getSettings } from '../../db/repos/userRepo';
import { useCombatPowerStore } from '../../stores/combatPowerStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { colors, fontSize } from '../../ui/theme/tokens';

/**
 * Hydrates the in-memory stores from the DB once the database is migrated, then renders the app.
 * Runs inside <SQLiteProvider>, so the DB is ready and seeded by the time this mounts.
 */
export function Boot({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const settings = await getSettings(db);
      useSettingsStore.getState().hydrate(settings);
      const result = await recomputeAndStore(db);
      // First snapshot: align prev to score so the odometer doesn't slam on launch.
      useCombatPowerStore.setState({ score: result.score, prev: result.score, gradeKey: result.grade.key });
      if (alive) setReady(true);
    })().catch(() => {
      // Even if hydration fails, show the app with store defaults rather than hanging on splash.
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [db]);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <Text style={styles.brand}>OVERDRIVE</Text>
        <ActivityIndicator color={colors.cyan} style={{ marginTop: 16 }} />
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  brand: { color: colors.cyan, fontSize: fontSize.xl, fontWeight: '900', letterSpacing: 6 },
});
