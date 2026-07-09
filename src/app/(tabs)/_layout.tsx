import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';
import { useSkinAccent } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { border, colors, radius } from '@/ui/theme/tokens';

function tabIcon(glyph: string) {
  const Icon = ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  Icon.displayName = `TabIcon(${glyph})`;
  return Icon;
}

export default function TabsLayout() {
  const { t } = useTranslation();
  // SKIN accent (chrome) — switching skin recolors the tabs instantly. Without a SkinProvider
  // (tests, unskinned trees) both fall back to the legacy MONOLITH tokens + persona accent.
  const accent = useSkinAccent();
  const skin = useSkinOrNull();
  const logLabel = t('tabs.log', { defaultValue: t('food.log') });
  const exploreLabel = t('tabs.exercises', { defaultValue: 'Explore' });
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // bg1 chassis + hairline seam; the selected tab is the only lit element — tint change
        // only (no underline indicator, no glow).
        tabBarStyle: {
          backgroundColor: skin?.palette.bg1 ?? colors.bg1,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: skin?.palette.line ?? colors.line,
        },
        tabBarActiveTintColor: accent.solid,
        tabBarInactiveTintColor: skin?.palette.text3 ?? colors.text3,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.today'), tabBarIcon: tabIcon('◆') }} />
      <Tabs.Screen
        name="exercises"
        options={{ title: exploreLabel, tabBarAccessibilityLabel: exploreLabel, tabBarIcon: tabIcon('⌕') }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: logLabel,
          tabBarAccessibilityLabel: logLabel,
          tabBarIcon: ({ focused }) => (
            <View
              style={[
                styles.logIcon,
                {
                  backgroundColor: focused ? accent.solid : accent.fill,
                  borderColor: focused ? accent.solid : accent.border,
                },
              ]}
            >
              <Text
                accessible={false}
                style={[
                  styles.logGlyph,
                  { color: focused ? (skin?.palette.bg0 ?? colors.bg) : accent.solid },
                ]}
              >
                +
              </Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen name="history" options={{ title: t('tabs.history'), tabBarIcon: tabIcon('≡') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabs.settings'), tabBarIcon: tabIcon('⚙\uFE0E') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  logIcon: {
    width: 48,
    height: 48,
    marginTop: -14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: border.rail,
  },
  logGlyph: { fontSize: 30, lineHeight: 32, fontWeight: '400' },
});
