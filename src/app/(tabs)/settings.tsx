import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { updateLocale, updateSettings } from '@/db/repos/userRepo';
import { useHealth } from '@/features/health/useHealth';
import { Stepper } from '@/features/logging/Stepper';
import i18n, { LOCALE_LABEL, SUPPORTED_LOCALES, type AppLocale } from '@/i18n';
import type { JuiceIntensity } from '@/lib/settings';
import { displayToKg, kgToDisplay, weightStepDisplay, weightUnit, type UnitSystem } from '@/lib/units';
import { currentSettings, useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted, NeonButton, Pill, Screen, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, space } from '@/ui/theme/tokens';

const PROTEIN_PER_KG = 1.8;

const INTENSITY: JuiceIntensity[] = ['full', 'mid', 'minimal'];
const UNIT_SYSTEMS: UnitSystem[] = ['metric', 'imperial'];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();
  const juiceIntensity = useSettingsStore((s) => s.juiceIntensity);
  const soundOn = useSettingsStore((s) => s.soundOn);
  const weightStep = useSettingsStore((s) => s.weightStep);
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const locale = useSettingsStore((s) => s.locale);
  const startWeightKg = useSettingsStore((s) => s.startWeightKg);
  const proteinTargetG = useSettingsStore((s) => s.proteinTargetG);
  const customProgram = useSettingsStore((s) => s.customProgram);
  const apply = useSettingsStore((s) => s.apply);
  const setLocale = useSettingsStore((s) => s.setLocale);
  const hk = useHealth();
  const [syncing, setSyncing] = useState(false);
  const onSyncHealth = async () => {
    setSyncing(true);
    try {
      await hk.sync();
    } finally {
      setSyncing(false);
    }
  };

  const weightKg = startWeightKg ?? 75;
  const suggestedProtein = Math.round((weightKg * PROTEIN_PER_KG) / 5) * 5;

  // What Apple Health actually returned — shown so "connected" isn't an opaque no-op.
  const h = hk.health;
  const healthHasData = !!h && (h.workouts7d > 0 || h.bodyMassKg != null || h.bodyFatFraction != null || h.vo2Max != null);
  const healthRead = {
    workouts: h?.workouts7d ?? 0,
    weight: h?.bodyMassKg != null ? `${h.bodyMassKg.toFixed(1)}kg` : '—',
    bodyFat: h?.bodyFatFraction != null ? `${Math.round(h.bodyFatFraction <= 1 ? h.bodyFatFraction * 100 : h.bodyFatFraction)}%` : '—',
    vo2: h?.vo2Max != null ? h.vo2Max.toFixed(0) : '—',
  };

  const persist = async (patch: Partial<ReturnType<typeof currentSettings>>) => {
    apply(patch);
    await updateSettings(db, currentSettings());
  };

  const changeLanguage = async (l: AppLocale) => {
    setLocale(l);
    await i18n.changeLanguage(l);
    await updateLocale(db, l);
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <Text style={styles.title}>{t('settings.title')}</Text>

        <SectionTitle>{t('settings.language.section')}</SectionTitle>
        <Card>
          <View style={styles.wrapRow}>
            {SUPPORTED_LOCALES.map((l) => (
              <Pill key={l} label={LOCALE_LABEL[l]} active={locale === l} color={colors.cyan} onPress={() => changeLanguage(l)} />
            ))}
          </View>
        </Card>

        <SectionTitle>{t('settings.units.section')}</SectionTitle>
        <Card>
          <View style={styles.wrapRow}>
            {UNIT_SYSTEMS.map((u) => (
              <Pill
                key={u}
                label={t(`settings.units.${u}`)}
                active={unitSystem === u}
                color={colors.cyan}
                onPress={() => persist({ unitSystem: u })}
              />
            ))}
          </View>
        </Card>

        <SectionTitle>{t('settings.profile.section')}</SectionTitle>
        <Card>
          <Stepper
            label={t('settings.profile.bodyweight')}
            value={kgToDisplay(weightKg, unitSystem)}
            step={weightStepDisplay(unitSystem, 1)}
            min={unitSystem === 'imperial' ? 66 : 30}
            max={unitSystem === 'imperial' ? 660 : 300}
            precision={unitSystem === 'imperial' ? 0 : 1}
            unit={weightUnit(unitSystem)}
            onChange={(v) => persist({ startWeightKg: displayToKg(v, unitSystem) })}
          />
          <Stepper
            label={t('settings.profile.proteinTarget')}
            value={proteinTargetG ?? suggestedProtein}
            step={5}
            min={0}
            max={400}
            precision={0}
            unit={t('settings.profile.proteinUnit')}
            onChange={(v) => persist({ proteinTargetG: v })}
          />
          <Muted style={{ marginTop: space.sm }}>
            {proteinTargetG == null ? t('settings.profile.proteinSuggested', { value: suggestedProtein }) : t('settings.profile.proteinHint')}
          </Muted>
        </Card>

        <SectionTitle>{t('settings.program.section')}</SectionTitle>
        <Card>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.program.edit')}
            onPress={() => router.push('/program')}
            style={({ pressed }) => [styles.navRow, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t('settings.program.edit')}</Text>
              <Muted>{customProgram ? t('settings.program.custom') : t('settings.program.default')}</Muted>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </Card>

        {hk.available ? (
          <>
            <SectionTitle>{t('settings.health.section')}</SectionTitle>
            <Card>
              {hk.connected ? (
                <>
                  <Text style={styles.label}>{t('settings.health.connected')}</Text>
                  <Muted style={{ marginTop: space.xs }}>
                    {healthHasData ? t('settings.health.read', healthRead) : t('settings.health.empty')}
                  </Muted>
                  <View style={[styles.wrapRow, { marginTop: space.md }]}>
                    <Pill
                      label={syncing ? t('settings.health.syncing') : t('settings.health.sync')}
                      color={colors.cyan}
                      onPress={() => void onSyncHealth()}
                    />
                    <Pill label={t('settings.health.disconnect')} color={colors.energyLo} onPress={() => void hk.disconnect()} />
                  </View>
                </>
              ) : (
                <>
                  <Muted>{t('settings.health.explainer')}</Muted>
                  <View style={{ marginTop: space.md }}>
                    <NeonButton label={t('settings.health.connect')} color={colors.cyan} onPress={() => void hk.connect()} />
                  </View>
                </>
              )}
            </Card>
          </>
        ) : null}

        <SectionTitle>{t('settings.juice.section')}</SectionTitle>
        <Card>
          <View style={styles.wrapRow}>
            {INTENSITY.map((o) => (
              <Pill key={o} label={t(`settings.juice.${o}`)} active={juiceIntensity === o} color={colors.energyHi} onPress={() => persist({ juiceIntensity: o })} />
            ))}
          </View>
          <Muted style={{ marginTop: space.sm }}>{t('settings.juice.explainer')}</Muted>
        </Card>

        <SectionTitle>{t('settings.sound.section')}</SectionTitle>
        <Card>
          <View style={styles.switchRow}>
            <Text style={styles.label}>{t('settings.sound.label')}</Text>
            <Switch value={soundOn} onValueChange={(v) => persist({ soundOn: v })} trackColor={{ true: colors.cyan, false: colors.line }} />
          </View>
        </Card>

        <SectionTitle>{t('settings.weightStep.section')}</SectionTitle>
        <Card>
          <View style={styles.wrapRow}>
            {[1.25, 2.5, 5].map((w) => (
              <Pill key={w} label={t('settings.weightStep.pill', { step: w })} active={weightStep === w} color={colors.cyan} onPress={() => persist({ weightStep: w })} />
            ))}
          </View>
          <Muted style={{ marginTop: space.sm }}>{t('settings.weightStep.explainer')}</Muted>
        </Card>

        <Muted style={{ marginTop: space.xl }}>{t('settings.footer')}</Muted>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '900', marginTop: space.lg },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chevron: { color: colors.cyan, fontSize: 28, fontWeight: '900' },
});
