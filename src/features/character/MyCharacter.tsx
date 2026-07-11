import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { Muted, Pill, useSkinAccent } from '@/ui/primitives';
import { colors, space, typeScale } from '@/ui/theme/tokens';
import { hasBodyAvatarAtlas, loadBodyAvatarManifest } from '@/features/evolution/bodyAvatarClient';
import { BodyMap, DEFAULT_BODY_AVATAR_SOURCES, type BodyAvatarSources } from './BodyMap';
import { type BodyHitRegionId, type BodyHitView } from './bodyHitMap';
import { CharacterAura } from './CharacterAura';
import { useWeeklyRegions } from './useWeeklyRegions';

/** Sportswear training avatar. The image is cosmetic; the body-region contract stays deterministic. */
export function MyCharacter({
  activeRegion,
  onRegionPress,
  onCardioPress,
  variant = 'compact',
  avatarSources,
  avatarRefreshKey = 0,
}: {
  activeRegion?: BodyHitRegionId | null;
  onRegionPress: (region: BodyHitRegionId) => void;
  onCardioPress: () => void;
  variant?: 'compact' | 'hero';
  avatarSources?: BodyAvatarSources;
  avatarRefreshKey?: number;
}) {
  const [view, setView] = useState<BodyHitView>('front');
  const { t } = useTranslation();
  const accent = useSkinAccent();
  const glow = useWeeklyRegions();
  const [localAvatar, setLocalAvatar] = useState<BodyAvatarSources | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (avatarSources) return undefined;
      let alive = true;
      void (async () => {
        const manifest = await loadBodyAvatarManifest();
        const available = manifest?.atlasPath ? await hasBodyAvatarAtlas() : false;
        if (!alive) return;
        setLocalAvatar(
          available && manifest?.atlasPath
            ? {
                kind: 'atlas',
                atlas: { uri: `${manifest.atlasPath}?r=${manifest.generationRevision}&k=${avatarRefreshKey}` },
              }
            : null,
        );
      })().catch(() => {
        if (alive) setLocalAvatar(null);
      });
      return () => {
        alive = false;
      };
    }, [avatarRefreshKey, avatarSources]),
  );

  const resolvedAvatar = avatarSources ?? localAvatar ?? DEFAULT_BODY_AVATAR_SOURCES;

  return (
    <View>
      <View style={styles.toggleRow}>
        <Pill label={t('character.toggle.front')} active={view === 'front'} onPress={() => setView('front')} />
        <Pill label={t('character.toggle.back')} active={view === 'back'} onPress={() => setView('back')} />
        <Pill label={t('character.cardioChip')} onPress={onCardioPress} />
      </View>

      <View style={styles.stageWrap}>
        <View style={[styles.stage, variant === 'hero' ? styles.stageHero : styles.stageCompact]}>
          <CharacterAura />
          <BodyMap
            key={view}
            view={view}
            activeRegion={activeRegion}
            glow={glow}
            onRegionPress={onRegionPress}
            avatarSources={resolvedAvatar}
            accessibilityLabel={t('character.accessibility')}
          />
        </View>
      </View>

      <View style={styles.readout}>
        <Text style={[styles.readoutText, activeRegion && { color: accent.solid }]}>
          {activeRegion ? t(`region.${activeRegion}`) : t('character.ready')}
        </Text>
      </View>
      {variant === 'compact' ? <Muted style={styles.hint}>{t('character.hint')}</Muted> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: space.sm,
    rowGap: space.sm,
    marginTop: space.md,
  },
  stageWrap: { alignItems: 'center', marginTop: space.sm },
  stage: { aspectRatio: 0.48 },
  stageCompact: { width: '52%', maxWidth: 205 },
  stageHero: { width: '58%', maxWidth: 225 },
  readout: { alignItems: 'center', minHeight: 22, marginTop: space.sm },
  readoutText: { ...typeScale.label, color: colors.text3 },
  hint: { textAlign: 'center', marginTop: space.sm, color: colors.text3 },
});
