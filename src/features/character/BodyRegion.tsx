import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, fontSize } from '@/ui/theme/tokens';
import { pct, REGIONS, type RegionRect } from './regions';

const alphaHex = (a: number) =>
  Math.round(Math.min(1, Math.max(0, a)) * 255)
    .toString(16)
    .padStart(2, '0');

/**
 * One tappable body block, %-positioned. `glow` (0..1) = trained-this-week intensity → the region
 * keeps a persistent neon glow proportional to how much you hit it. Pressing lights it fully.
 */
export function BodyRegion({
  rect,
  active,
  glow,
  onPress,
}: {
  rect: RegionRect;
  active: boolean;
  glow: number;
  onPress: () => void;
}) {
  const def = REGIONS[rect.region];
  const { t } = useTranslation();
  const trained = glow > 0.04;

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
            borderWidth: 1.5 + glow * 1.5,
            borderColor: lit || trained ? def.color : colors.line,
            backgroundColor: lit
              ? def.color + '2A'
              : trained
                ? def.color + alphaHex(glow * 0.22)
                : colors.surfaceAlt + '88',
            shadowColor: def.color,
            shadowOpacity: lit ? 0.95 : glow * 0.8,
          },
        ];
      }}
    >
      <Text style={[styles.label, { color: active || trained ? def.color : colors.textDim }]} numberOfLines={1}>
        {t(`region.${rect.region}`)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 16,
  },
  label: { fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 1 },
});
