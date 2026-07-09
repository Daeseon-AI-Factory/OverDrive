import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ExerciseRow } from '@/db/types';
import { MyCharacter } from '@/features/character/MyCharacter';
import { CARDIO_EXERCISE_IDS, REGIONS, type BodyRegionId } from '@/features/character/regions';
import { useSessionStore } from '@/features/forge/sessionStore';
import { useForge } from '@/features/forge/useForge';
import { CardioLoggerSheet } from '@/features/logging/CardioLoggerSheet';
import { ExerciseRegionSheet, type RegionPicker } from '@/features/logging/ExerciseRegionSheet';
import { SetLoggerSheet } from '@/features/logging/SetLoggerSheet';
import { Button, Card, Muted, Pill, Screen, SectionTitle } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { colors, space, typeScale } from '@/ui/theme/tokens';

const REGION_ORDER: BodyRegionId[] = ['chest', 'shoulders', 'back', 'arms', 'core', 'legs'];

function CatalogAction({
  title,
  body,
  onPress,
}: {
  title: string;
  body: string;
  onPress: () => void;
}) {
  const skin = useSkinOrNull();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      style={({ pressed }) => [styles.actionPress, pressed && styles.pressed]}
    >
      <Card style={styles.actionCard}>
        <View style={styles.actionRow}>
          <View style={styles.actionCopy}>
            <Text style={[styles.actionTitle, { color: skin?.palette.text ?? colors.text }]}>{title}</Text>
            <Muted style={styles.actionBody}>{body}</Muted>
          </View>
          <Text accessible={false} style={[styles.chevron, { color: skin?.palette.text3 ?? colors.text3 }]}>
            ›
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

export default function ExercisesScreen() {
  const { t } = useTranslation();
  const copy = useMemo(
    () => ({
      title: t('exerciseScreen.title'),
      subtitle: t('exerciseScreen.subtitle'),
      searchEyebrow: t('exerciseScreen.searchEyebrow'),
      searchAll: t('exerciseScreen.searchAll'),
      searchBody: t('exerciseScreen.searchBody'),
      strength: t('exerciseScreen.strength'),
      strengthBody: t('exerciseScreen.strengthBody'),
      cardio: t('exerciseScreen.cardio'),
      cardioBody: t('exerciseScreen.cardioBody'),
      byRegion: t('exerciseScreen.byRegion'),
      regionBody: t('exerciseScreen.regionBody'),
    }),
    [t],
  );
  const skin = useSkinOrNull();
  const { enter } = useForge();

  const [picker, setPicker] = useState<RegionPicker | null>(null);
  const [activeRegion, setActiveRegion] = useState<BodyRegionId | null>(null);
  const [activeExercise, setActiveExercise] = useState<ExerciseRow | null>(null);

  const ensureSession = useCallback(async (): Promise<string> => {
    const active = useSessionStore.getState().activeSessionId;
    if (active) return active;
    useSessionStore.getState().setSilentStart(true);
    try {
      await enter();
    } finally {
      useSessionStore.getState().setSilentStart(false);
    }
    const started = useSessionStore.getState().activeSessionId;
    if (!started) throw new Error('session_start_failed');
    return started;
  }, [enter]);

  const openRegion = useCallback(
    (region: BodyRegionId) => {
      setActiveRegion(region);
      setPicker({
        title: t(`region.${region}`),
        type: 'strength',
        exerciseIds: REGIONS[region].exerciseIds,
      });
    },
    [t],
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

  // Selection itself is read-only. The logger calls ensureSession only when the user saves, which
  // prevents a browse-and-close action from creating an empty resumable workout session.
  const chooseExercise = useCallback((exercise: ExerciseRow) => setActiveExercise(exercise), []);

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

        <Card live eyebrow={copy.searchEyebrow}>
          <Muted>{copy.searchBody}</Muted>
          <Button
            label={copy.searchAll}
            onPress={() => {
              setActiveRegion(null);
              setPicker({ title: copy.searchAll });
            }}
            style={styles.searchButton}
          />
        </Card>

        <View style={styles.actionStack}>
          <CatalogAction
            title={copy.strength}
            body={copy.strengthBody}
            onPress={() => {
              setActiveRegion(null);
              setPicker({ title: copy.strength, type: 'strength' });
            }}
          />
          <CatalogAction title={copy.cardio} body={copy.cardioBody} onPress={openCardio} />
        </View>

        <SectionTitle>{copy.byRegion}</SectionTitle>
        <Card>
          <Muted>{copy.regionBody}</Muted>
          <View style={styles.regionChips}>
            {REGION_ORDER.map((region) => (
              <Pill
                key={region}
                label={t(`region.${region}`)}
                active={activeRegion === region}
                onPress={() => openRegion(region)}
              />
            ))}
          </View>
          <MyCharacter
            activeRegion={activeRegion}
            onRegionPress={openRegion}
            onCardioPress={openCardio}
          />
        </Card>
      </ScrollView>

      <ExerciseRegionSheet
        picker={picker}
        onSelect={(exercise) => void chooseExercise(exercise)}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.lg, paddingBottom: space.xxxl },
  header: { marginBottom: space.lg },
  title: { ...typeScale.title },
  subtitle: { marginTop: space.xs },
  searchButton: { marginTop: space.lg },
  actionStack: { gap: space.sm, marginTop: space.md },
  actionPress: { minHeight: 72 },
  actionCard: { minHeight: 72, justifyContent: 'center' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  actionCopy: { flex: 1 },
  actionTitle: { ...typeScale.title },
  actionBody: { marginTop: space.xs },
  chevron: { fontSize: 22, lineHeight: 26 },
  pressed: { opacity: 0.72 },
  regionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
});
