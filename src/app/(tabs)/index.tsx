import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getLastSetForExercise } from '@/db/repos/setLogRepo';
import { startSession } from '@/db/repos/sessionRepo';
import type { ExerciseRow } from '@/db/types';
import { todayProgram } from '@/features/program/defaultProgram';
import { useLogSet } from '@/features/logging/useLogSet';
import { gradeForScore } from '@/features/combat-power/grades';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Card, Muted, NeonButton, Pill, Screen, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, monoFamily, space } from '@/ui/theme/tokens';

export default function TodayScreen() {
  const db = useSQLiteContext();
  const logSet = useLogSet();
  const score = useCombatPowerStore((s) => s.score);

  const program = useMemo(() => todayProgram(), []);
  const [exercises, setExercises] = useState<ExerciseRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [rir, setRir] = useState('');
  const [hint, setHint] = useState<string>('지난 기록 없음 — 첫 세트!');

  const selected = exercises.find((e) => e.id === selectedId) ?? null;

  // Load today's program exercises (fallback: all strength exercises).
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = program.exerciseIds;
      const rows = ids.length
        ? await db.getAllAsync<ExerciseRow>(
            `SELECT * FROM exercise WHERE id IN (${ids.map(() => '?').join(',')})`,
            ids,
          )
        : await db.getAllAsync<ExerciseRow>(`SELECT * FROM exercise WHERE type = 'strength' LIMIT 8`);
      if (!alive) return;
      // preserve program order
      const ordered = ids.length ? ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as ExerciseRow[] : rows;
      setExercises(ordered);
      if (ordered.length && !selectedId) setSelectedId(ordered[0]!.id);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only on db/program change; selectedId default is set inside
  }, [db, program]);

  // Prefill from the last set of the selected exercise.
  useEffect(() => {
    let alive = true;
    if (!selectedId) return;
    (async () => {
      const last = await getLastSetForExercise(db, selectedId);
      if (!alive) return;
      if (last) {
        setWeight(String(last.weight));
        setReps(String(last.reps));
        setRir(last.rir != null ? String(last.rir) : '');
        setHint(`지난: ${last.weight}kg × ${last.reps}${last.rir != null ? ` (RIR ${last.rir})` : ''}`);
      } else {
        setHint('지난 기록 없음 — 첫 세트!');
      }
    })();
    return () => {
      alive = false;
    };
  }, [db, selectedId]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;
    const s = await startSession(db, { dayType: program.dayType });
    setSessionId(s.id);
    return s.id;
  }, [db, program.dayType, sessionId]);

  const onLog = useCallback(async () => {
    if (!selected) return;
    const w = selected.is_bodyweight ? 0 : Number(weight) || 0;
    const r = Number(reps) || 0;
    if (r <= 0) return;
    const rirVal = rir.trim() === '' ? null : Number(rir);
    const sid = await ensureSession();
    const hitTarget = r >= selected.rep_low;
    await logSet({
      sessionId: sid,
      exerciseId: selected.id,
      weight: w,
      reps: r,
      rir: rirVal,
      hitTargetReps: hitTarget,
    });
    setHint(`방금: ${w}kg × ${r}${rirVal != null ? ` (RIR ${rirVal})` : ''} ✓`);
  }, [selected, weight, reps, rir, ensureSession, logSet]);

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
        </Card>

        {program.dayType === 'rest' ? (
          <Card style={{ marginTop: space.lg }}>
            <Text style={styles.restText}>오늘은 휴식 💤 — 회복도 전투력이다. 단백질·수면 챙겨라.</Text>
          </Card>
        ) : (
          <>
            <SectionTitle>운동 선택</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 2 }}>
              {exercises.map((e) => (
                <Pill key={e.id} label={e.name} active={e.id === selectedId} onPress={() => setSelectedId(e.id)} />
              ))}
            </ScrollView>

            <SectionTitle>세트 기록</SectionTitle>
            <Card>
              <Muted>{hint}</Muted>
              <View style={styles.inputRow}>
                {!selected?.is_bodyweight && (
                  <Field label="무게(kg)" value={weight} onChange={setWeight} />
                )}
                <Field label="횟수" value={reps} onChange={setReps} />
                <Field label="RIR" value={rir} onChange={setRir} optional />
              </View>
              <NeonButton
                label="기록 ⚡"
                color={colors.energyHi}
                disabled={!selected || !reps}
                onPress={onLog}
                style={{ marginTop: space.md }}
              />
            </Card>
            <Muted style={{ marginTop: space.sm }}>
              PR을 넘기면 OVERDRIVE가 터진다. 목표 횟수 + RIR 1–3이면 견고한 세트.
            </Muted>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Muted style={{ marginBottom: 4 }}>
        {label}
        {optional ? ' ·옵션' : ''}
      </Muted>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={colors.textDim}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', marginTop: space.lg },
  cpScore: { color: colors.text, fontFamily: monoFamily, fontSize: fontSize.odometer, fontWeight: '900' },
  grade: { fontSize: fontSize.lg, fontWeight: '800', letterSpacing: 2 },
  dayTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '800', marginBottom: 2 },
  restText: { color: colors.text, fontSize: fontSize.md, lineHeight: 24 },
  inputRow: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  field: { flex: 1 },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    textAlign: 'center',
  },
});
