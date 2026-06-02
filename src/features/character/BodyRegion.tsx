import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fontSize } from '@/ui/theme/tokens';
import { pct, REGIONS, type RegionRect } from './regions';

/** One tappable body block, %-positioned inside the stage. Glows in its region color when active. */
export function BodyRegion({
  rect,
  active,
  onPress,
}: {
  rect: RegionRect;
  active: boolean;
  onPress: () => void;
}) {
  const def = REGIONS[rect.region];
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => {
        const lit = active || pressed;
        return [
          styles.block,
          {
            left: pct(rect.left),
            top: pct(rect.top),
            width: pct(rect.width),
            height: pct(rect.height),
            transform: rect.rotateDeg ? [{ rotate: `${rect.rotateDeg}deg` }] : undefined,
            borderColor: lit ? def.color : colors.line,
            backgroundColor: lit ? def.color + '2A' : colors.surfaceAlt + '88',
            shadowColor: def.color,
            shadowOpacity: lit ? 0.9 : 0,
          },
        ];
      }}
    >
      <Text style={[styles.label, { color: active ? def.color : colors.textDim }]} numberOfLines={1}>
        {t(`region.${rect.region}`)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 14,
  },
  label: { fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1 },
});
