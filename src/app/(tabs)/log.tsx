import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ExerciseRow } from '@/db/types';
import { FoodCard } from '@/features/food/FoodCard';
import { useForge } from '@/features/forge/useForge';
import { AmbientAura } from '@/features/juice/AmbientAura';
import { CardioLoggerSheet } from '@/features/logging/CardioLoggerSheet';
import { ExerciseRegionSheet, type RegionPicker } from '@/features/logging/ExerciseRegionSheet';
import { SetLoggerSheet } from '@/features/logging/SetLoggerSheet';
import { QuickLogBar } from '@/features/quicklog/QuickLogBar';
import { Card, Muted, Screen, SectionTitle } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { colors, space, typeScale } from '@/ui/theme/tokens';

function BrowseAction({
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

export default function LogScreen() {
  const { t } = useTranslation();
  const copy = useMemo(
    () => ({
      title: t('logScreen.title'),
      subtitle: t('logScreen.subtitle'),
      quickEyebrow: t('logScreen.quickEyebrow'),
      browse: t('logScreen.browse'),
      strength: t('logScreen.strength'),
      strengthBody: t('logScreen.strengthBody'),
      cardio: t('logScreen.cardio'),
      cardioBody: t('logScreen.cardioBody'),
    }),
    [t],
  );
  const skin = useSkinOrNull();
  const { enterSilently } = useForge();
  const [picker, setPicker] = useState<RegionPicker | null>(null);
  const [activeExercise, setActiveExercise] = useState<ExerciseRow | null>(null);

  const ensureSession = useCallback(async (): Promise<string> => {
    return enterSilently();
  }, [enterSilently]);

  // ExerciseRegionSheet delivers only after its picker Modal is fully dismissed. Session creation
  // stays inside the logger's actual save action, so browsing and closing cannot leave an empty
  // durable workout behind.
  const chooseExercise = useCallback((exercise: ExerciseRow) => setActiveExercise(exercise), []);

  return (
    <Screen background={<AmbientAura />}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: skin?.palette.text ?? colors.text }]}>{copy.title}</Text>
          <Muted style={styles.subtitle}>{copy.subtitle}</Muted>
        </View>

        <Card live eyebrow={copy.quickEyebrow}>
          <QuickLogBar />
        </Card>

        <SectionTitle>{copy.browse}</SectionTitle>
        <View style={styles.actionStack}>
          <BrowseAction
            title={copy.strength}
            body={copy.strengthBody}
            onPress={() => setPicker({ title: copy.strength, type: 'strength' })}
          />
          <BrowseAction
            title={copy.cardio}
            body={copy.cardioBody}
            onPress={() => setPicker({ title: copy.cardio, type: 'cardio' })}
          />
        </View>

        {/* Food stays a distinct surface: the mic above is explicitly a strength quick-log, not a
            generic food voice control. FoodCard keeps its own text/photo/repeat save paths. */}
        <FoodCard />
      </ScrollView>

      <ExerciseRegionSheet
        picker={picker}
        onSelect={(exercise) => void chooseExercise(exercise)}
        onClose={() => setPicker(null)}
      />
      <SetLoggerSheet
        key={`log-strength-${activeExercise?.id ?? 'none'}`}
        exercise={activeExercise?.type === 'strength' ? activeExercise : null}
        ensureSession={ensureSession}
        onClose={() => setActiveExercise(null)}
      />
      <CardioLoggerSheet
        key={`log-cardio-${activeExercise?.id ?? 'none'}`}
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
  actionStack: { gap: space.sm },
  actionPress: { minHeight: 72 },
  actionCard: { minHeight: 72, justifyContent: 'center' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  actionCopy: { flex: 1 },
  actionTitle: { ...typeScale.title },
  actionBody: { marginTop: space.xs },
  chevron: { fontSize: 22, lineHeight: 26 },
  pressed: { opacity: 0.72 },
});
