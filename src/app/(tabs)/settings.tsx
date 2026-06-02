import { useSQLiteContext } from 'expo-sqlite';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { updateLocale, updateSettings } from '@/db/repos/userRepo';
import i18n, { LOCALE_LABEL, SUPPORTED_LOCALES, type AppLocale } from '@/i18n';
import type { JuiceIntensity } from '@/lib/settings';
import type { UnitSystem } from '@/lib/units';
import { currentSettings, useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted, Pill, Screen, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, space } from '@/ui/theme/tokens';

const INTENSITY: JuiceIntensity[] = ['full', 'mid', 'minimal'];
const UNIT_SYSTEMS: UnitSystem[] = ['metric', 'imperial'];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const juiceIntensity = useSettingsStore((s) => s.juiceIntensity);
  const soundOn = useSettingsStore((s) => s.soundOn);
  const weightStep = useSettingsStore((s) => s.weightStep);
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const locale = useSettingsStore((s) => s.locale);
  const apply = useSettingsStore((s) => s.apply);
  const setLocale = useSettingsStore((s) => s.setLocale);

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
});
