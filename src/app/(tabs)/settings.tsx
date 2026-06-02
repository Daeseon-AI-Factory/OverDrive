import { useSQLiteContext } from 'expo-sqlite';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { updateSettings } from '@/db/repos/userRepo';
import type { JuiceIntensity } from '@/lib/settings';
import { currentSettings, useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted, Pill, Screen, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, space } from '@/ui/theme/tokens';

const INTENSITY_OPTIONS: { key: JuiceIntensity; label: string }[] = [
  { key: 'full', label: '풀' },
  { key: 'mid', label: '중' },
  { key: 'minimal', label: '미니멀' },
];

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const juiceIntensity = useSettingsStore((s) => s.juiceIntensity);
  const soundOn = useSettingsStore((s) => s.soundOn);
  const weightStep = useSettingsStore((s) => s.weightStep);
  const apply = useSettingsStore((s) => s.apply);

  const persist = async (patch: Partial<ReturnType<typeof currentSettings>>) => {
    apply(patch);
    await updateSettings(db, currentSettings());
  };

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <Text style={styles.title}>설정</Text>

        <SectionTitle>JUICE 강도</SectionTitle>
        <Card>
          <View style={{ flexDirection: 'row' }}>
            {INTENSITY_OPTIONS.map((o) => (
              <Pill
                key={o.key}
                label={o.label}
                active={juiceIntensity === o.key}
                color={colors.energyHi}
                onPress={() => persist({ juiceIntensity: o.key })}
              />
            ))}
          </View>
          <Muted style={{ marginTop: space.sm }}>
            미니멀은 화면 연출을 끄고 햅틱만 남긴다(헬스장 무음용). 로깅 속도엔 영향 없음.
          </Muted>
        </Card>

        <SectionTitle>사운드</SectionTitle>
        <Card>
          <View style={styles.switchRow}>
            <Text style={styles.label}>효과음 / 콜아웃</Text>
            <Switch
              value={soundOn}
              onValueChange={(v) => persist({ soundOn: v })}
              trackColor={{ true: colors.cyan, false: colors.line }}
            />
          </View>
        </Card>

        <SectionTitle>무게 증가폭</SectionTitle>
        <Card>
          <View style={{ flexDirection: 'row' }}>
            {[1.25, 2.5, 5].map((w) => (
              <Pill
                key={w}
                label={`${w}kg`}
                active={weightStep === w}
                color={colors.cyan}
                onPress={() => persist({ weightStep: w })}
              />
            ))}
          </View>
          <Muted style={{ marginTop: space.sm }}>세트 기록에서 +/- 버튼이 한 번에 바꾸는 무게.</Muted>
        </Card>

        <Muted style={{ marginTop: space.xl }}>
          OVERDRIVE · Phase 1 로컬 MVP. 전투력은 재미용 자체 산식이다.
        </Muted>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '900', marginTop: space.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
});
