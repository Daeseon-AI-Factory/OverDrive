import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { recomputeAndStore } from '@/db/repos/combatPowerRepo';
import { getDisciplineToday, setDisciplineToday } from '@/db/repos/disciplineRepo';
import { classifyEvent } from '@/features/juice/classifyEvent';
import { useJuice } from '@/features/juice/JuiceProvider';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { Card, SectionTitle, useSkinAccent } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { border, colors, radius, space, typeScale } from '@/ui/theme/tokens';

/**
 * One-tap daily discipline (protein hit / slept well). Feeds the Combat Power discipline component
 * (activates once tracked). Low-friction comprehensive-health toehold; food/sleep auto-import is Phase 2.
 *
 * DE-TEXTED: two BIG toggle tiles — the locale's emoji as the icon, the word at ≤12pt, state = the
 * accent tint-fill + a positive ✓ (done = achieved status, §9). Same toggle path (optimistic →
 * persist → CP recompute → JUICE on turn-on), zero prose.
 */

// Locale labels are "<emoji> <word>" ("🥩 단백질") — split so the emoji becomes the tile icon and
// only the word renders as (small) text. Labels without an emoji prefix render word-only.
const LEAD_TOKEN = /^(\S+)\s+(.+)$/;
function splitLabel(label: string): { icon: string | null; word: string } {
  const m = LEAD_TOKEN.exec(label);
  if (m) {
    const first = m[1].codePointAt(0) ?? 0;
    // Emoji / pictograph leading token (🥩 U+1F969, 😴 U+1F634, ☑ U+2611, …) — not a word.
    if (first >= 0x1f000 || (first >= 0x2600 && first <= 0x27bf)) return { icon: m[1], word: m[2] };
  }
  return { icon: null, word: label };
}
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
      } catch (e) {
        // Revert the optimistic toggle so the UI matches what's actually in the DB.
        console.error('[discipline] toggle failed', e);
        if (key === 'protein') setProtein(protein);
        else setRest(rest);
      } finally {
        setBusy(false);
      }
    },
    [busy, protein, rest, db, juice],
  );

  const skin = useSkinOrNull();
  const accent = useSkinAccent();
  const positive = skin != null ? skin.palette.positive : colors.positive;

  const tile = (key: 'protein' | 'rest', active: boolean) => {
    const label = t(`discipline.${key}`);
    const { icon, word } = splitLabel(label);
    return (
      <Pressable
        onPress={() => void toggle(key)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active, busy }}
        style={({ pressed }) => [
          styles.tile,
          skin != null && { backgroundColor: skin.palette.surface2, borderColor: skin.palette.line },
          // Active = accent tint-fill (12%) + 40% border — never a solid neon fill (MONOLITH law).
          active && { backgroundColor: accent.fill, borderColor: accent.border },
          pressed && { opacity: 0.75 },
        ]}
      >
        {active ? <Text style={[styles.check, { color: positive }]}>✓</Text> : null}
        {icon != null ? <Text style={styles.icon}>{icon}</Text> : null}
        <Text style={[styles.word, active && { color: accent.solid }]} numberOfLines={1}>
          {word}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      <SectionTitle>{t('discipline.title')}</SectionTitle>
      <Card>
        <View style={styles.row}>
          {tile('protein', protein)}
          {tile('rest', rest)}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xs },
  row: { flexDirection: 'row', gap: space.sm },
  // Big machined toggle block: icon + ≤12pt word; ~4× the old Pill's touch area.
  tile: {
    flex: 1,
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderRadius: radius.md,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
  },
  icon: { fontSize: 28, lineHeight: 34 },
  word: { ...typeScale.caption, color: colors.text2 },
  check: { position: 'absolute', top: space.sm, right: space.sm + 2, ...typeScale.label },
});
