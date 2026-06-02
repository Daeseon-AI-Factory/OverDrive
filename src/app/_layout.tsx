import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { migrateDbIfNeeded } from '@/db/migrate';
import { Boot } from '@/features/boot/Boot';
import { JuiceProvider } from '@/features/juice/JuiceProvider';
import { colors } from '@/ui/theme/tokens';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SQLiteProvider databaseName="overdrive.db" onInit={migrateDbIfNeeded}>
        <Boot>
          <JuiceProvider>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
          </JuiceProvider>
        </Boot>
      </SQLiteProvider>
    </GestureHandlerRootView>
  );
}
