import { StyleSheet, View } from 'react-native';
import { colors } from '@/ui/theme/tokens';
import { BodyRegion } from './BodyRegion';
import { DECOR_RECTS, pct, rectsForView, type BodyRegionId, type BodyView } from './regions';
import type { RegionGlow } from './useWeeklyRegions';

/** The tappable humanoid for one view. Decorative head/hips behind, Pressable regions on top. */
export function BodyMap({
  view,
  activeRegion,
  glow,
  onRegionPress,
}: {
  view: BodyView;
  activeRegion?: BodyRegionId | null;
  glow: RegionGlow;
  onRegionPress: (region: BodyRegionId) => void;
}) {
  return (
    <View style={styles.fill}>
      {DECOR_RECTS.map((d) => (
        <View
          key={d.id}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: pct(d.left),
            top: pct(d.top),
            width: pct(d.width),
            height: pct(d.height),
            borderRadius: d.radius,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.surfaceAlt + '55',
          }}
        />
      ))}
      {rectsForView(view).map((rect) => (
        <BodyRegion
          key={rect.id}
          rect={rect}
          active={activeRegion === rect.region}
          glow={glow[rect.region]}
          onPress={() => onRegionPress(rect.region)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
