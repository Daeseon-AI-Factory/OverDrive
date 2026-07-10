import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type ImageSourcePropType,
} from 'react-native';
import avatarBack from '../../../assets/images/bodymap/sportswear-avatar-back.png';
import avatarFront from '../../../assets/images/bodymap/sportswear-avatar-front.png';
import { useSkinAccent } from '@/ui/primitives';
import { colors } from '@/ui/theme/tokens';
import {
  BODY_HIT_AREAS,
  BODY_HIT_REGIONS,
  hitTestBodyRegionWithTolerance,
  type BodyHitRegionId,
  type BodyHitView,
} from './bodyHitMap';
import type { RegionGlow } from './useWeeklyRegions';

export type BodyAvatarSources =
  | { kind: 'split'; front: ImageSourcePropType; back: ImageSourcePropType }
  | { kind: 'atlas'; atlas: ImageSourcePropType };

export const DEFAULT_BODY_AVATAR_SOURCES: BodyAvatarSources = {
  kind: 'split',
  front: avatarFront,
  back: avatarBack,
};

/**
 * A fixed-pose sportswear avatar with a deterministic polygon layer. The bitmap is presentation;
 * every tap is resolved by bodyHitMap so a generated image can never invent the exercise target.
 */
export function BodyMap({
  view,
  activeRegion,
  glow,
  onRegionPress,
  avatarSources = DEFAULT_BODY_AVATAR_SOURCES,
  accessibilityLabel,
}: {
  view: BodyHitView;
  activeRegion?: BodyHitRegionId | null;
  glow: RegionGlow;
  onRegionPress: (region: BodyHitRegionId) => void;
  avatarSources?: BodyAvatarSources;
  accessibilityLabel: string;
}) {
  const { t } = useTranslation();
  const accent = useSkinAccent();
  const [size, setSize] = useState({ width: 0, height: 0 });

  const paths = useMemo(() => {
    if (size.width <= 0 || size.height <= 0) return [];
    return BODY_HIT_AREAS[view].flatMap((area) => {
      const first = area.polygon[0];
      if (!first) return [];
      const path = Skia.Path.Make();
      path.moveTo(first.x * size.width, first.y * size.height);
      for (const point of area.polygon.slice(1)) {
        path.lineTo(point.x * size.width, point.y * size.height);
      }
      path.close();
      return [{ area, path }];
    });
  }, [size.height, size.width, view]);

  const pressBody = (event: GestureResponderEvent) => {
    if (size.width <= 0 || size.height <= 0) return;
    const region = hitTestBodyRegionWithTolerance(
      view,
      {
        x: event.nativeEvent.locationX / size.width,
        y: event.nativeEvent.locationY / size.height,
      },
      { ...size, radius: 22 },
    );
    if (region) onRegionPress(region);
  };

  // iOS caches custom accessibility action names on a mounted native view. Expose all ten regions
  // on both poses so switching Front/Back can never leave VoiceOver with stale actions.
  const accessibilityActions = BODY_HIT_REGIONS.map((region) => ({
    name: region,
    label: t(`region.${region}`),
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={t('character.accessibilityHint')}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={(event) => {
        const region = BODY_HIT_REGIONS.find((candidate) => candidate === event.nativeEvent.actionName);
        if (region) onRegionPress(region);
      }}
      onPress={pressBody}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
      }}
      style={styles.fill}
    >
      {avatarSources.kind === 'split' ? (
        <Image source={avatarSources[view]} resizeMode="stretch" style={styles.avatar} />
      ) : (
        <Image
          source={avatarSources.atlas}
          resizeMode="stretch"
          style={[styles.atlas, view === 'back' && styles.atlasBack]}
        />
      )}
      <Canvas pointerEvents="none" style={styles.fill}>
        {paths.map(({ area, path }) => {
          const active = area.region === activeRegion;
          const trained = glow[area.region] > 0.04;
          return (
            <Path
              key={area.id}
              path={path}
              color={active ? accent.fillActive : trained ? accent.faint : colors.edgeHi}
              style="fill"
            />
          );
        })}
        {paths.map(({ area, path }) => {
          const active = area.region === activeRegion;
          const trained = glow[area.region] > 0.04;
          return (
            <Path
              key={`${area.id}-edge`}
              path={path}
              color={active ? accent.solid : trained ? accent.border : colors.edgeHi}
              style="stroke"
              strokeWidth={active ? 2 : 1}
            />
          );
        })}
      </Canvas>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  avatar: { width: '100%', height: '100%' },
  atlas: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '200%', height: '100%' },
  atlasBack: { left: '-100%' },
});
