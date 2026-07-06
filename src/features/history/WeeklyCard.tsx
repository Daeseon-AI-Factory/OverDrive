// '주간' pinned section — per-region set/volume totals + cardio totals for the last 7 days.
// Extracted from the old history screen and restyled onto the skin palette (no hardcoded token
// colors); data loading stays in the screen.

import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import type { BodyRegionId } from '@/features/character/regions';
import { kgToDisplay, weightUnit } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Card, Metric, Muted } from '@/ui/primitives';
import { useSkin } from '@/ui/skins/SkinContext';
import { hangulSafeLetterSpacing, space, tracking, typeScale } from '@/ui/theme/tokens';

const WEEKLY_ORDER: BodyRegionId[] = ['chest', 'shoulders', 'back', 'arms', 'core', 'legs'];

export type Weekly = Record<BodyRegionId, { sets: number; volumeKg: number }>;

export const emptyWeekly = (): Weekly => ({
  chest: { sets: 0, volumeKg: 0 },
  shoulders: { sets: 0, volumeKg: 0 },
  back: { sets: 0, volumeKg: 0 },
  arms: { sets: 0, volumeKg: 0 },
  core: { sets: 0, volumeKg: 0 },
  legs: { sets: 0, volumeKg: 0 },
});

export interface WeeklyCardProps {
  weekly: Weekly;
  cardio: { sessions: number; minutes: number };
}

export function WeeklyCard({ weekly, cardio }: WeeklyCardProps) {
  const { t } = useTranslation();
  const skin = useSkin();
  const palette = skin.palette;
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const minUnit = t('cardio.min');

  return (
    <Card>
      {WEEKLY_ORDER.map((region) => {
        const w = weekly[region];
        const done = w.sets > 0;
        return (
          <View key={region} style={styles.weekRow}>
            {/* Trained regions get full text, untrained recede to text3 — status by light, not hue. */}
            <Text style={[styles.regionLabel, { color: done ? palette.text : palette.text3 }]}>
              {t(`region.${region}`)}
            </Text>
            {done ? (
              <View style={styles.statCluster}>
                <Metric value={w.sets} unit="SET" size="small" />
                {w.volumeKg > 0 ? (
                  <>
                    <Text style={[styles.statDot, { color: palette.text3 }]}>·</Text>
                    <Metric
                      value={Math.round(kgToDisplay(w.volumeKg, unitSystem))}
                      unit={weightUnit(unitSystem)}
                      size="small"
                    />
                  </>
                ) : null}
              </View>
            ) : (
              <Muted style={{ color: palette.text3 }}>{t('history.noneThisWeek')}</Muted>
            )}
          </View>
        );
      })}
      <View style={[styles.weekRow, styles.cardioRow, { borderTopColor: palette.line }]}>
        <Text style={[styles.regionLabel, { color: cardio.sessions > 0 ? palette.text : palette.text3 }]}>
          {t('today.cardioSheetTitle')}
        </Text>
        {cardio.sessions > 0 ? (
          <View style={styles.statCluster}>
            <Metric value={cardio.sessions} size="small" />
            <Text style={[styles.statDot, { color: palette.text3 }]}>·</Text>
            <Metric
              value={cardio.minutes}
              unit={minUnit}
              size="small"
              unitStyle={{ letterSpacing: hangulSafeLetterSpacing(minUnit, tracking.overline) }}
            />
          </View>
        ) : (
          <Muted style={{ color: palette.text3 }}>{t('history.noneThisWeek')}</Muted>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm },
  cardioRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: space.xs },
  regionLabel: { ...typeScale.body },
  statCluster: { flexDirection: 'row', alignItems: 'flex-end', gap: space.xs },
  statDot: { ...typeScale.caption, paddingBottom: 1 },
});
