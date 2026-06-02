import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Muted, Pill } from '@/ui/primitives';
import { colors, space } from '@/ui/theme/tokens';
import { BodyMap } from './BodyMap';
import { CharacterAura } from './CharacterAura';
import { STAGE_ASPECT, type BodyRegionId, type BodyView } from './regions';

/**
 * "MY CHARACTER" — neon humanoid body-map. Tap a region → onRegionPress(region). Front/back toggle
 * reaches back exercises. The aura behind powers up with Combat Power (the hero graphic).
 */
export function MyCharacter({
  activeRegion,
  onRegionPress,
  onCardioPress,
}: {
  activeRegion?: BodyRegionId | null;
  onRegionPress: (region: BodyRegionId) => void;
  onCardioPress: () => void;
}) {
  const [view, setView] = useState<BodyView>('front');

  return (
    <View>
      <View style={styles.toggleRow}>
        <Pill label="앞" active={view === 'front'} color={colors.cyan} onPress={() => setView('front')} />
        <Pill label="뒤" active={view === 'back'} color={colors.cyan} onPress={() => setView('back')} />
      </View>

      <View style={styles.stageWrap}>
        <View style={styles.stage}>
          <CharacterAura />
          <BodyMap view={view} activeRegion={activeRegion} onRegionPress={onRegionPress} />
        </View>
      </View>

      <View style={styles.cardioRow}>
        <Pill label="🏃 유산소 / 컨디셔닝" color={colors.energyLo} onPress={onCardioPress} />
      </View>
      <Muted style={styles.hint}>부위를 터치해서 운동을 골라. 전투력이 오르면 오라가 강해진다.</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', justifyContent: 'center', marginTop: space.md },
  stageWrap: { alignItems: 'center', marginTop: space.md },
  stage: { width: '64%', maxWidth: 280, aspectRatio: STAGE_ASPECT },
  cardioRow: { flexDirection: 'row', justifyContent: 'center', marginTop: space.lg },
  hint: { textAlign: 'center', marginTop: space.sm },
});
