import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, type ColorValue } from 'react-native';
import { useAccent } from '@/ui/primitives';
import { colors } from '@/ui/theme/tokens';

function tabIcon(glyph: string) {
  const Icon = ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  Icon.displayName = `TabIcon(${glyph})`;
  return Icon;
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const accent = useAccent();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // MONOLITH: bg1 chassis + hairline seam; the selected tab is the only lit element — tint
        // change only (no underline indicator, no glow).
        tabBarStyle: {
          backgroundColor: colors.bg1,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.line,
        },
        tabBarActiveTintColor: accent.solid,
        tabBarInactiveTintColor: colors.text3,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.today'), tabBarIcon: tabIcon('◆') }} />
      {/* U+FE0E (VS15) forces text presentation — bare U+26A1 draws the color emoji, ignoring tab tint. */}
      <Tabs.Screen name="power" options={{ title: t('tabs.power'), tabBarIcon: tabIcon('⚡\uFE0E') }} />
      <Tabs.Screen name="history" options={{ title: t('tabs.history'), tabBarIcon: tabIcon('≡') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings'), tabBarIcon: tabIcon('⚙') }} />
    </Tabs>
  );
}
