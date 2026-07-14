import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Anton_400Regular, useFonts } from '@expo-google-fonts/anton';
import { Orbitron_700Bold, Orbitron_900Black } from '@expo-google-fonts/orbitron';
import { useSQLiteContext } from 'expo-sqlite';
import i18n, { DEFAULT_LOCALE, isSupportedLocale, type AppLocale } from '@/i18n';
import { computeCombatPower } from '@/features/combat-power/computeCombatPower';
import { loadSfx } from '@/features/juice/audio/engine';
import { OnboardingFlow } from '@/features/onboarding/OnboardingFlow';
import { getOpenSessionForDate, getSessionActivitySummary, sessionStartedAtMs } from '@/db/repos/sessionRepo';
import { useSessionStore } from '@/features/forge/sessionStore';
import { todayLocal } from '@/lib/date';
import { purgeDeprecatedAvatarFiles } from './purgeDeprecatedAvatarFiles';
import { purgeSensitiveTemporaryFiles } from './purgeSensitiveTemporaryFiles';
import { buildInput, upsertSnapshot } from '../../db/repos/combatPowerRepo';
import { getSettings, getUser, updateLocale } from '../../db/repos/userRepo';
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
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [fontsLoaded, fontError] = useFonts({ Anton_400Regular, Orbitron_700Bold, Orbitron_900Black });

  useEffect(() => {
    let alive = true;
    void loadSfx(); // preload JUICE SFX players (fire-and-forget; splash never waits on audio)
    (async () => {
      // Independent reads run in parallel — first paint waits on no serial round-trips.
      const [settings, user, input, deprecatedAvatarFilesPurged, sensitiveTemporaryFilesPurged] = await Promise.all([
        getSettings(db),
        getUser(db),
        buildInput(db),
        purgeDeprecatedAvatarFiles(),
        purgeSensitiveTemporaryFiles(),
      ]);
      if (!deprecatedAvatarFilesPurged) {
        // Retry on every launch; never mark a failed privacy cleanup as complete.
        console.error('[privacy] deprecated avatar files could not be fully removed');
      }
      if (!sensitiveTemporaryFilesPurged) {
        // The per-request cleanup still runs; retry the crash-recovery sweep on the next launch.
        console.error('[privacy] sensitive temporary files could not be fully removed');
      }
      useSettingsStore.getState().hydrate(settings);
      if (alive && !settings.onboardedAt) setNeedsOnboarding(true);

      // Resolve UI language from the User row (default 'en'; persist the seed on first run).
      const stored = user?.locale ?? '';
      let locale: AppLocale;
      if (isSupportedLocale(stored)) {
        locale = stored;
      } else {
        locale = DEFAULT_LOCALE;
        void updateLocale(db, locale).catch(() => {}); // idempotent write — never gates first paint
      }
      if (i18n.language !== locale) await i18n.changeLanguage(locale);
      useSettingsStore.getState().setLocale(locale);

      const result = computeCombatPower(input);
      // First snapshot: align prev to score so the odometer doesn't slam on launch.
      useCombatPowerStore.setState({ score: result.score, prev: result.score, gradeKey: result.grade.key });

      // Rehydrate an in-progress workout so the coach's rest/next-set loop survives an app
      // relaunch or an iOS background-kill mid-session (otherwise activeSessionId starts null and
      // the coach forgets you're training — the flagship "손 최소화" loop silently disappears). The
      // The timer keeps workout_session.started_at instead of restarting at launch. The rest anchor
      // re-derives from this exact session's set_log rows in useCoachPlan. cpAtStart uses the
      // just-computed score, matching the existing enter()/finish() resume.
      if (useSessionStore.getState().activeSessionId == null) {
        const open = await getOpenSessionForDate(db, todayLocal());
        if (open) {
          const summary = await getSessionActivitySummary(db, open.id);
          useSessionStore
            .getState()
            .resume(open.id, result.score, sessionStartedAtMs(open), summary.itemCount, summary.volumeKg);
        }
      }
      if (alive) setReady(true);
      // Persist today's snapshot off the critical path (idempotent upsert; in-memory score already set).
      void upsertSnapshot(db, result).catch(() => {});
    })().catch(() => {
      // Even if hydration fails, show the app with store defaults rather than hanging on splash.
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [db]);

  // On a font-load error, proceed with the system font instead of stranding the user on the splash.
  if (!ready || (!fontsLoaded && !fontError)) {
    return (
      <View style={styles.splash}>
        <Text style={styles.brand}>REPLOOM</Text>
        <ActivityIndicator color={colors.cyan} style={{ marginTop: 16 }} />
      </View>
    );
  }
  if (needsOnboarding) {
    return <OnboardingFlow onDone={() => setNeedsOnboarding(false)} />;
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  brand: { color: colors.cyan, fontSize: fontSize.xl, fontWeight: '900', letterSpacing: 6 },
});
