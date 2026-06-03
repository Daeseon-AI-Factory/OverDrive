import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { getDisciplineToday, setDisciplineToday } from '@/db/repos/disciplineRepo';
import { classifyEvent } from '@/features/juice/classifyEvent';
import { useJuice } from '@/features/juice/JuiceProvider';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Card, Pill, SectionTitle } from '@/ui/primitives';
import { colors, space } from '@/ui/theme/tokens';

/**
 * One-tap daily discipline (protein hit / slept well). Feeds the Combat Power discipline component
 * (activates once tracked). Low-friction comprehensive-health toehold; food/sleep auto-import is Phase 2.
 */
export function DisciplineCard() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const juice = useJuice();
  const [protein, setProtein] = useState(false);
  const [rest, setRest] = useState(false);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const v = await getDisciplineToday(db);
        if (alive) {
          setProtein(v.protein);
          setRest(v.rest);
        }
      })();
      return () => {
        alive = false;
      };
    }, [db]),
  );

  const toggle = useCallback(
    async (key: 'protein' | 'rest') => {
      if (busy) return;
      const next = { protein: key === 'protein' ? !protein : protein, rest: key === 'rest' ? !rest : rest };
      const turnedOn = key === 'protein' ? next.protein : next.rest;
      if (key === 'protein') setProtein(next.protein);
      else setRest(next.rest);
      setBusy(true);
      try {
        const prev = useCombatPowerStore.getState().score;
        await setDisciplineToday(db, next);
        const result = await recomputeAndStore(db);
        useCombatPowerStore.getState().setSnapshot(result.score, result.grade.key);
        if (turnedOn) {
          juice.fire(
            classifyEvent({ kind: 'set', isPr: false, rir: null, hitTargetReps: false, deltaCp: result.score - prev }),
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, protein, rest, db, juice],
  );

  return (
    <View style={styles.wrap}>
      <SectionTitle>{t('discipline.title')}</SectionTitle>
      <Card>
        <View style={styles.row}>
          <Pill label={t('discipline.protein')} active={protein} color={colors.success} onPress={() => toggle('protein')} />
          <Pill label={t('discipline.rest')} active={rest} color={colors.success} onPress={() => toggle('rest')} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xs },
  row: { flexDirection: 'row', gap: space.sm },
});
