import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { startSession } from '@/db/repos/sessionRepo';
import type { ExerciseRow } from '@/db/types';
import { gradeForScore } from '@/features/combat-power/grades';
import { MyCharacter } from '@/features/character/MyCharacter';
import { CARDIO_EXERCISE_IDS, REGIONS, type BodyRegionId } from '@/features/character/regions';
import { ExerciseRegionSheet, type RegionPicker } from '@/features/logging/ExerciseRegionSheet';
import { SetLoggerSheet } from '@/features/logging/SetLoggerSheet';
import { todayProgram } from '@/features/program/defaultProgram';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Card, Muted, Screen } from '@/ui/primitives';
import { colors, fontSize, monoFamily, space } from '@/ui/theme/tokens';

export default function TodayScreen() {
  const db = useSQLiteContext();
  const score = useCombatPowerStore((s) => s.score);
  const program = useMemo(() => todayProgram(), []);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeRegion, setActiveRegion] = useState<BodyRegionId | null>(null);
  const [picker, setPicker] = useState<RegionPicker | null>(null);
  const [activeExercise, setActiveExercise] = useState<ExerciseRow | null>(null);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;
    const s = await startSession(db, { dayType: program.dayType });
    setSessionId(s.id);
    return s.id;
  }, [db, program.dayType, sessionId]);

  const onRegionPress = useCallback((region: BodyRegionId) => {
    setActiveRegion(region);
    setPicker({ title: REGIONS[region].labelKo, exerciseIds: REGIONS[region].exerciseIds });
  }, []);

  const onCardioPress = useCallback(() => {
    setActiveRegion(null);
    setPicker({ title: '유산소 / 컨디셔닝', exerciseIds: [...CARDIO_EXERCISE_IDS] });
  }, []);

  const grade = gradeForScore(score);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space.xxl }}>
        <View style={styles.header}>
          <Muted>전투력</Muted>
          <Text style={styles.cpScore}>{score}</Text>
          <Text style={[styles.grade, { color: colors.cyan }]}>{grade.label}</Text>
        </View>

        <Card>
          <Text style={styles.dayTitle}>{program.title}</Text>
          <Muted>{program.focus}</Muted>
          {program.dayType === 'rest' ? (
            <Muted style={{ marginTop: space.sm }}>오늘은 휴식 💤 — 그래도 기록하고 싶으면 부위를 터치해.</Muted>
          ) : null}
        </Card>

        <MyCharacter activeRegion={activeRegion} onRegionPress={onRegionPress} onCardioPress={onCardioPress} />
      </ScrollView>

      <ExerciseRegionSheet
        picker={picker}
        onSelect={(ex) => {
          setActiveExercise(ex);
          setPicker(null);
        }}
        onClose={() => {
          setPicker(null);
          setActiveRegion(null);
        }}
      />

      <SetLoggerSheet
        key={activeExercise?.id ?? 'none'}
        exercise={activeExercise}
        ensureSession={ensureSession}
        onClose={() => setActiveExercise(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: space.lg },
  cpScore: { color: colors.text, fontFamily: monoFamily, fontSize: fontSize.odometer, fontWeight: '900' },
  grade: { fontSize: fontSize.lg, fontWeight: '800', letterSpacing: 2 },
  dayTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800', marginBottom: 2 },
});
