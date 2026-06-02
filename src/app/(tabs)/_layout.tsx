import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { colors } from '@/ui/theme/tokens';

function tabIcon(glyph: string) {
  const Icon = ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  Icon.displayName = `TabIcon(${glyph})`;
  return Icon;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.cyan,
        tabBarInactiveTintColor: colors.textDim,
      }}
    >
      <Tabs.Screen name="index" options={{ title: '오늘', tabBarIcon: tabIcon('◆') }} />
      <Tabs.Screen name="power" options={{ title: '전투력', tabBarIcon: tabIcon('⚡') }} />
      <Tabs.Screen name="history" options={{ title: '기록', tabBarIcon: tabIcon('≡') }} />
      <Tabs.Screen name="settings" options={{ title: '설정', tabBarIcon: tabIcon('⚙') }} />
    </Tabs>
  );
}
