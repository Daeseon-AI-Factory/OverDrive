import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { updateLocale } from '@/db/repos/userRepo';
import { useHealth } from '@/features/health/useHealth';
import { Stepper } from '@/features/logging/Stepper';
import { THEME_IDS, THEMES, getTheme } from '@/features/theme/themes';
import i18n, { LOCALE_LABEL, SUPPORTED_LOCALES, type AppLocale } from '@/i18n';
import type { JuiceIntensity } from '@/lib/settings';
import { displayToKg, kgToDisplay, weightUnit, type UnitSystem } from '@/lib/units';
import { currentSettings, persistSettings, useSettingsStore } from '@/stores/settingsStore';
import { Button, Card, Muted, Pill, Screen, SectionTitle, useAccent } from '@/ui/primitives';
import { border, colors, radius, space, typeScale } from '@/ui/theme/tokens';

const PROTEIN_PER_KG = 1.8;

const INTENSITY: JuiceIntensity[] = ['full', 'mid', 'minimal'];
const UNIT_SYSTEMS: UnitSystem[] = ['metric', 'imperial'];

// Alert-only copy kept inline (the locale catalogs are owned by a separate workstream; every other
// string here reuses existing keys). Disconnect is destructive — it wipes the synced health data
// and recomputes Combat Power — so it must confirm first.
const DISCONNECT_CONFIRM: Record<AppLocale, string> = {
  en: 'This clears the synced Apple Health data from Reploom and recomputes your Combat Power. You can reconnect anytime.',
  ko: '동기화된 Apple 건강 데이터가 Reploom에서 지워지고 전투력이 다시 계산돼. 언제든 다시 연동할 수 있어.',
  es: 'Esto borra los datos de Apple Health sincronizados en Reploom y recalcula tu Poder de Combate. Puedes reconectar cuando quieras.',
  zh: '这会清除 Reploom 中已同步的 Apple 健康数据，并重新计算战斗力。随时可以重新连接。',
};
const CANCEL_LABEL: Record<AppLocale, string> = { en: 'Cancel', ko: '취소', es: 'Cancelar', zh: '取消' };

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { t } = useTranslation();
  const accent = useAccent();
  const aestheticPref = useSettingsStore((s) => s.aestheticPref);
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
  const activeTheme = getTheme(aestheticPref);
  const [syncing, setSyncing] = useState(false);
  const [syncedFlash, setSyncedFlash] = useState(false); // brief ✓ so a successful sync is visible
  const onSyncHealth = async () => {
    setSyncing(true);
    setSyncedFlash(false);
    try {
      const ok = await hk.sync();
      if (ok) {
        setSyncedFlash(true);
        setTimeout(() => setSyncedFlash(false), 2000);
      } else {
        // A failed sync must not look identical to a successful one.
        Alert.alert(t('settings.health.sync'), t('inbody.saveFailed'));
      }
    } finally {
      setSyncing(false);
    }
  };
  const onConnectHealth = async () => {
    const ok = await hk.connect();
    // Success is self-evident (the card flips to the connected state); failure needs saying.
    if (!ok) Alert.alert(t('settings.health.connect'), t('inbody.saveFailed'));
  };
  const confirmDisconnect = () => {
    Alert.alert(t('settings.health.disconnect'), DISCONNECT_CONFIRM[locale], [
      { text: CANCEL_LABEL[locale], style: 'cancel' },
      { text: t('settings.health.disconnect'), style: 'destructive', onPress: () => void hk.disconnect() },
    ]);
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
    const prev = currentSettings();
    apply(patch);
    const ok = await persistSettings(db);
    if (!ok) {
      apply(prev);
      Alert.alert(t('common.saveFailed'));
    }
  };

  const changeLanguage = async (l: AppLocale) => {
    if (l === locale) return;
    const prev = locale;
    try {
      setLocale(l);
      await i18n.changeLanguage(l);
      await updateLocale(db, l);
    } catch {
      setLocale(prev);
      await i18n.changeLanguage(prev).catch(() => {});
      Alert.alert(t('common.saveFailed'));
    }
  };

  return (
    <Screen>
      {/* keyboardShouldPersistTaps: don't eat the first tap on +/− / ✓ while the Stepper type-in keyboard is up. */}
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.xxl }}>
        <Text style={styles.title}>{t('settings.title')}</Text>

        <SectionTitle>{t('settings.language.section')}</SectionTitle>
        <Card>
          <View style={styles.wrapRow}>
            {SUPPORTED_LOCALES.map((l) => (
              <Pill key={l} label={LOCALE_LABEL[l]} active={locale === l} onPress={() => void changeLanguage(l)} />
            ))}
          </View>
        </Card>

        <SectionTitle>{t('settings.units.section')}</SectionTitle>
        <Card>
          <View style={styles.wrapRow}>
            {UNIT_SYSTEMS.map((u) => (
              <Pill key={u} label={t(`settings.units.${u}`)} active={unitSystem === u} onPress={() => persist({ unitSystem: u })} />
            ))}
          </View>
        </Card>

        <SectionTitle>{t('settings.profile.section')}</SectionTitle>
        <Card>
          <Stepper
            label={t('settings.profile.bodyweight')}
            value={kgToDisplay(weightKg, unitSystem)}
            // Bodyweight moves in 1s — the 5 lb plate-oriented step can't reach e.g. 172 lb.
            step={1}
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
            accessibilityLabel={t('plan.entry')}
            onPress={() => router.push('/plan')}
            style={({ pressed }) => [styles.navRow, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{t('plan.entry')}</Text>
              <Muted>{t('plan.entryHint')}</Muted>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settings.program.edit')}
            onPress={() => router.push('/program')}
            style={({ pressed }) => [styles.navRow, styles.navRowDivided, pressed && { opacity: 0.7 }]}
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
                      label={syncing ? t('settings.health.syncing') : syncedFlash ? `✓ ${t('settings.health.sync')}` : t('settings.health.sync')}
                      active={syncedFlash}
                      onPress={() => void onSyncHealth()}
                    />
                    <Pill label={t('settings.health.disconnect')} onPress={confirmDisconnect} />
                  </View>
                </>
              ) : (
                <>
                  <Muted>{t('settings.health.explainer')}</Muted>
                  <View style={{ marginTop: space.md }}>
                    <Button label={t('settings.health.connect')} variant="secondary" onPress={() => void onConnectHealth()} />
                  </View>
                </>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('inbody.entry')}
                onPress={() => router.push('/inbody')}
                style={({ pressed }) => [styles.navRow, styles.navRowDivided, pressed && { opacity: 0.7 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>{t('inbody.entry')}</Text>
                  <Muted>{t('inbody.entryHint')}</Muted>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            </Card>
          </>
        ) : null}

        <SectionTitle>{t('settings.theme.section')}</SectionTitle>
        <Card>
          {/* Persona picker — the ONE place multiple hues may appear, as data (12×12 swatch dots),
              never as chrome. Cards stay neutral; the selected card borrows the CURRENT accent border. */}
          <View style={styles.wrapRow}>
            {THEME_IDS.map((id) => {
              const selected = activeTheme.id === id;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={t(`theme.${id}.name`)}
                  accessibilityState={{ selected }}
                  onPress={() => persist({ aestheticPref: id })}
                  style={({ pressed }) => [
                    styles.themeCard,
                    selected && { borderColor: accent.border },
                    pressed && { backgroundColor: colors.surface3 },
                  ]}
                >
                  <View style={[styles.swatch, { backgroundColor: THEMES[id].accent }]} />
                  <Text style={[styles.themeName, selected && { color: colors.text }]}>{t(`theme.${id}.name`)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Muted style={{ marginTop: space.sm }}>
            {t(`theme.${activeTheme.id}.tagline`)} — {t('settings.theme.explainer')}
          </Muted>
        </Card>

        <SectionTitle>{t('settings.juice.section')}</SectionTitle>
        <Card>
          <View style={styles.wrapRow}>
            {INTENSITY.map((o) => (
              <Pill key={o} label={t(`settings.juice.${o}`)} active={juiceIntensity === o} onPress={() => persist({ juiceIntensity: o })} />
            ))}
          </View>
          <Muted style={{ marginTop: space.sm }}>{t('settings.juice.explainer')}</Muted>
        </Card>

        <SectionTitle>{t('settings.sound.section')}</SectionTitle>
        <Card>
          <View style={styles.switchRow}>
            <Text style={styles.label}>{t('settings.sound.label')}</Text>
            <Switch
              value={soundOn}
              onValueChange={(v) => persist({ soundOn: v })}
              trackColor={{ true: accent.solid, false: colors.surface3 }}
              thumbColor={colors.text}
            />
          </View>
        </Card>

        <SectionTitle>{t('settings.weightStep.section')}</SectionTitle>
        <Card>
          <View style={styles.wrapRow}>
            {[1.25, 2.5, 5].map((w) => (
              <Pill key={w} label={t('settings.weightStep.pill', { step: w })} active={weightStep === w} onPress={() => persist({ weightStep: w })} />
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
  title: { ...typeScale.title, color: colors.text, marginTop: space.lg },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  // Settings is a quiet monochrome list — rows 52pt, body-weight labels, hairline seams.
  label: { ...typeScale.body, color: colors.text },
  navRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navRowDivided: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  chevron: { color: colors.text3, fontSize: 22, fontWeight: '400' },
  // Neutral machined cards; only the swatch dot carries a hue (data, not chrome).
  themeCard: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
  },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  themeName: { ...typeScale.label, color: colors.text2 },
});
