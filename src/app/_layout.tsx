import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { I18nextProvider } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { migrateDbIfNeeded } from '@/db/migrate';
import { Boot } from '@/features/boot/Boot';
import { JuiceProvider } from '@/features/juice/JuiceProvider';
import i18n from '@/i18n';
import { colors } from '@/ui/theme/tokens';

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Mounted above <Boot> so light status-bar content covers the splash and first-run onboarding too. */}
        <StatusBar style="light" />
        <SQLiteProvider databaseName="overdrive.db" onInit={migrateDbIfNeeded}>
          <Boot>
            <JuiceProvider>
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
            </JuiceProvider>
          </Boot>
        </SQLiteProvider>
      </GestureHandlerRootView>
    </I18nextProvider>
  );
}
