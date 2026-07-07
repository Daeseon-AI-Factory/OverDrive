import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatWeight } from '@/lib/units';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, Metric, Muted, SectionTitle, useAccent } from '@/ui/primitives';
import { colors, space, typeScale } from '@/ui/theme/tokens';
import { useArena } from './useArena';

/**
 * ARENA — the duel, DE-TEXTED: two Metric numbers (you vs the rival, CP), the weekly-gains duel
 * bar, and exactly ONE status word (앞서는 중 / 추격 중 — chase framing, anti-shame §9: behind is
 * warning-amber pursuit, never red scolding). Everything that used to be prose (margin, weekly
 * ±gains, win/lose verdict, the weekly boss) moved behind a tap on the card — reachable, not gone.
 * The full margin also rides the card's accessibilityLabel (the old arena.ahead/behind strings).
 *
 * MONOLITH: YOUR side is the persona accent (your data is what's alive); the rival is monochrome.
 */
export function ArenaCard() {
  const { t } = useTranslation();
  const accent = useAccent();
  const score = useCombatPowerStore((s) => s.score);
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const { rival, rivalCp, rivalGainToday, youWeekGain, rivalWeekGain, boss, bossDefeated } = useArena();
  const [detailOpen, setDetailOpen] = useState(false);

  if (!rival) return null;

  const ahead = score >= rivalCp;
  const margin = Math.abs(score - rivalCp);
  const winning = youWeekGain >= rivalWeekGain;
  const total = Math.max(1, youWeekGain + rivalWeekGain);

  return (
    <View style={styles.wrap}>
      <SectionTitle>{t('arena.title')}</SectionTitle>
      <Card>
        <Pressable
          onPress={() => setDetailOpen((v) => !v)}
          accessibilityRole="button"
          // Screen readers get the full old sentence (margin included); the eye gets one word.
          accessibilityLabel={ahead ? t('arena.ahead', { n: margin }) : t('arena.behind', { n: margin })}
          accessibilityState={{ expanded: detailOpen }}
        >
          <View style={styles.duelRow}>
            <View style={styles.duelSide}>
              <Metric value={score.toLocaleString()} unit="CP" size="mid" color={accent.solid} />
              <Text style={styles.duelName}>{t('arena.weekYou')}</Text>
            </View>
            <Text style={[styles.status, { color: ahead ? colors.positive : colors.warning }]}>
              {ahead ? t('arena.statusAhead') : t('arena.statusChasing')}
            </Text>
            <View style={[styles.duelSide, styles.duelSideRight]}>
              <Metric value={rivalCp.toLocaleString()} unit="CP" size="mid" />
              <Text style={styles.duelName} numberOfLines={1}>
                {rival.name}
              </Text>
            </View>
          </View>

          {/* Weekly gains duel bar — you = accent, rival = monochrome (improvement-based, always winnable). */}
          <View
            style={styles.barTrack}
            accessibilityLabel={`${t('arena.weekYou')} +${youWeekGain} · ${rival.name} +${rivalWeekGain}`}
          >
            <View style={[styles.barFill, { flex: youWeekGain / total, backgroundColor: accent.solid }]} />
            <View style={[styles.barFill, { flex: rivalWeekGain / total, backgroundColor: colors.lineStrong }]} />
          </View>
        </Pressable>

        {/* Tap-open detail: the demoted readouts (weekly ±gains + verdict, rival's daily growth,
            the weekly boss) — the exact information the compact tile no longer spells out. */}
        {detailOpen ? (
          <View style={styles.detail}>
            <View style={styles.metaRow}>
              <Muted>
                {t('arena.weekYou')} +{youWeekGain}
              </Muted>
              <Text style={[styles.verdict, { color: winning ? colors.positive : colors.warning }]}>
                {winning ? t('arena.winning') : t('arena.losing')}
              </Text>
              <Muted>
                {rival.name} +{rivalWeekGain} · +{rivalGainToday}
              </Muted>
            </View>
            {boss ? (
              <View style={styles.bossRow}>
                <Text style={styles.bossLabel}>
                  {t('arena.boss')}{' '}
                  <Text style={styles.bossTarget}>
                    {t(`exercise.${boss.exerciseId}`, { defaultValue: boss.exerciseId })}{' '}
                    {boss.isBodyweight
                      ? `×${boss.targetReps}`
                      : `${formatWeight(boss.targetWeight, unitSystem)}×${boss.targetReps}`}
                  </Text>
                </Text>
                <Text style={[styles.bossState, { color: bossDefeated ? colors.positive : colors.warning }]}>
                  {bossDefeated ? t('arena.bossDown') : t('arena.bossAlive')}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.xs },
  duelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  duelSide: { flexShrink: 1 },
  duelSideRight: { alignItems: 'flex-end' },
  duelName: { ...typeScale.caption, color: colors.text3, marginTop: space.xxs },
  status: { ...typeScale.label },
  barTrack: {
    flexDirection: 'row',
    columnGap: 2,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: space.md,
    backgroundColor: colors.recess,
  },
  barFill: { height: '100%' },
  detail: { marginTop: space.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  verdict: { ...typeScale.label },
  bossRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  bossLabel: { ...typeScale.label, color: colors.text2, flexShrink: 1, marginRight: space.sm },
  bossTarget: { color: colors.text, fontWeight: '600' },
  bossState: { ...typeScale.caption, fontWeight: '600' },
});
