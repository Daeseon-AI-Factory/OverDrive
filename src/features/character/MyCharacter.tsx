import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Muted, Pill } from '@/ui/primitives';
import { colors, space } from '@/ui/theme/tokens';
// MONOLITH: chips are neutral machined blocks; the active front/back toggle is the only
// accent-tinted chip (Pill handles this via the persona ramp — no per-chip hues).
import { BodyMap } from './BodyMap';
import { CharacterAura } from './CharacterAura';
import { STAGE_ASPECT, type BodyRegionId, type BodyView } from './regions';
import { useWeeklyRegions } from './useWeeklyRegions';

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
  const { t } = useTranslation();
  const glow = useWeeklyRegions();

  return (
    <View>
      <View style={styles.toggleRow}>
        <Pill label={t('character.toggle.front')} active={view === 'front'} onPress={() => setView('front')} />
        <Pill label={t('character.toggle.back')} active={view === 'back'} onPress={() => setView('back')} />
      </View>

      <View style={styles.stageWrap}>
        <View style={styles.stage}>
          <CharacterAura />
          <BodyMap view={view} activeRegion={activeRegion} glow={glow} onRegionPress={onRegionPress} />
        </View>
      </View>

      <View style={styles.cardioRow}>
        <Pill label={t('character.cardioChip')} onPress={onCardioPress} />
      </View>
      <Muted style={styles.hint}>{t('character.hint')}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, marginTop: space.md },
  stageWrap: { alignItems: 'center', marginTop: space.md },
  stage: { width: '64%', maxWidth: 280, aspectRatio: STAGE_ASPECT },
  cardioRow: { flexDirection: 'row', justifyContent: 'center', marginTop: space.lg },
  hint: { textAlign: 'center', marginTop: space.sm, color: colors.text3 },
});
