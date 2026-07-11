import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ExerciseRow } from '@/db/types';
import { MyCharacter } from '@/features/character/MyCharacter';
import { CARDIO_EXERCISE_IDS } from '@/features/character/regions';
import type { BodyHitRegionId } from '@/features/character/bodyHitMap';
import { useForge } from '@/features/forge/useForge';
import { CardioLoggerSheet } from '@/features/logging/CardioLoggerSheet';
import { BodyAvatarSetupSheet } from '@/features/evolution/BodyAvatarSetupSheet';
import { ExerciseRegionSheet, type RegionPicker } from '@/features/logging/ExerciseRegionSheet';
import { SetLoggerSheet } from '@/features/logging/SetLoggerSheet';
import { useTodayProgram } from '@/features/program/useProgram';
import { Button, Card, Muted, Screen } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { colors, space, typeScale } from '@/ui/theme/tokens';

export default function ExercisesScreen() {
  const { t } = useTranslation();
  const copy = useMemo(
    () => ({
      title: t('exerciseScreen.title'),
      subtitle: t('exerciseScreen.subtitle'),
      searchAll: t('exerciseScreen.searchAll'),
      cardio: t('exerciseScreen.cardio'),
      byRegion: t('exerciseScreen.byRegion'),
      regionBody: t('exerciseScreen.regionBody'),
      avatarPreview: t('exerciseScreen.avatarPreview'),
      customizeAvatar: t('bodyAvatar.open'),
    }),
    [t],
  );
  const skin = useSkinOrNull();
  const { enterSilently } = useForge();
  const today = useTodayProgram();
  const programExerciseIds = useMemo(() => today.slots.map((slot) => slot.exerciseId), [today.slots]);

  const [picker, setPicker] = useState<RegionPicker | null>(null);
  const [activeRegion, setActiveRegion] = useState<BodyHitRegionId | null>(null);
  const [activeExercise, setActiveExercise] = useState<ExerciseRow | null>(null);
  const [avatarSetupVisible, setAvatarSetupVisible] = useState(false);
  const [avatarRefreshKey, setAvatarRefreshKey] = useState(0);

  const ensureSession = useCallback(async (): Promise<string> => {
    return enterSilently();
  }, [enterSilently]);

  const openRegion = useCallback(
    (region: BodyHitRegionId) => {
      setActiveRegion(region);
      setPicker({
        title: t(`region.${region}`),
        type: 'strength',
        region,
        programExerciseIds,
      });
    },
    [programExerciseIds, t],
  );

  const openCardio = useCallback(() => {
    setActiveRegion(null);
    setPicker({
      title: copy.cardio,
      type: 'cardio',
      exerciseIds: [...CARDIO_EXERCISE_IDS],
    });
  }, [copy.cardio]);

  const closePicker = useCallback(() => {
    setPicker(null);
    setActiveRegion(null);
  }, []);

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: skin?.palette.text ?? colors.text }]}>{copy.title}</Text>
          <Muted style={styles.subtitle}>{copy.subtitle}</Muted>
        </View>

        <Button
          label={copy.searchAll}
          variant="secondary"
          onPress={() => {
            setActiveRegion(null);
            setPicker({ title: copy.searchAll });
          }}
          style={styles.searchButton}
        />

        <Card live eyebrow={copy.byRegion} style={styles.avatarCard}>
          <Muted>{copy.regionBody}</Muted>
          <MyCharacter
            variant="hero"
            activeRegion={activeRegion}
            onRegionPress={openRegion}
            onCardioPress={openCardio}
            avatarRefreshKey={avatarRefreshKey}
          />
          <Button
            label={copy.customizeAvatar}
            variant="ghost"
            onPress={() => setAvatarSetupVisible(true)}
            style={styles.avatarButton}
          />
          <Muted style={styles.previewNote}>{copy.avatarPreview}</Muted>
        </Card>
      </ScrollView>

      <ExerciseRegionSheet
        picker={picker}
        onSelect={(exercise) => setActiveExercise(exercise)}
        onClose={closePicker}
      />
      <SetLoggerSheet
        key={`exercise-strength-${activeExercise?.id ?? 'none'}`}
        exercise={activeExercise?.type === 'strength' ? activeExercise : null}
        ensureSession={ensureSession}
        onClose={() => setActiveExercise(null)}
      />
      <CardioLoggerSheet
        key={`exercise-cardio-${activeExercise?.id ?? 'none'}`}
        exercise={activeExercise?.type === 'cardio' ? activeExercise : null}
        ensureSession={ensureSession}
        onClose={() => setActiveExercise(null)}
      />
      <BodyAvatarSetupSheet
        visible={avatarSetupVisible}
        onClose={() => setAvatarSetupVisible(false)}
        onAvatarChanged={() => setAvatarRefreshKey((value) => value + 1)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.lg, paddingBottom: space.xxxl },
  header: { marginBottom: space.md },
  title: { ...typeScale.title },
  subtitle: { marginTop: space.xs },
  searchButton: { marginBottom: space.md },
  avatarCard: { paddingBottom: space.lg },
  avatarButton: { marginTop: space.md },
  previewNote: { textAlign: 'center', marginTop: space.md },
});
