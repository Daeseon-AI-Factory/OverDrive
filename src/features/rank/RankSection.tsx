import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getScoreOnOrBefore } from '@/db/repos/combatPowerRepo';
import { updateSettings } from '@/db/repos/userRepo';
import { newUuid } from '@/db/uuid';
import { addDays, weekStartLocal } from '@/features/arena/rival';
import { QUICKLOG_ENDPOINT } from '@/features/quicklog/config';
import { CP_FLOOR } from '@/features/combat-power/constants';
import { todayLocal } from '@/lib/date';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { currentSettings, useSettingsStore } from '@/stores/settingsStore';
import { Card, Muted, Pill, SectionTitle } from '@/ui/primitives';
import { colors, fontSize, numberFamily, radius, space } from '@/ui/theme/tokens';
import { fetchBoard, submitRank, type RankBoard, type RankSort } from './rankClient';

/**
 * RANKINGS — real leaderboards (Worker + D1). Opt-in by picking a handle; until then nothing leaves
 * the device. Primary board = WEEKLY GAIN (improvement — a beginner can beat a veteran, §10).
 * Crew board = your gym, joined by a shared code. Self-reported in Phase 1 (trust-tiering = Phase 4).
 */
export function RankSection() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const score = useCombatPowerStore((s) => s.score);
  const gradeKey = useCombatPowerStore((s) => s.gradeKey);
  const rankHandle = useSettingsStore((s) => s.rankHandle);
  const rankCrew = useSettingsStore((s) => s.rankCrew);
  const rankDeviceId = useSettingsStore((s) => s.rankDeviceId);
  const apply = useSettingsStore((s) => s.apply);

  const [draftHandle, setDraftHandle] = useState('');
  const [draftCrew, setDraftCrew] = useState('');
  const [sort, setSort] = useState<RankSort>('weekGain');
  const [scope, setScope] = useState<'global' | 'crew'>('global');
  const [board, setBoard] = useState<RankBoard | null>(null);
  const [err, setErr] = useState(false);

  const persist = useCallback(async () => {
    await updateSettings(db, currentSettings()).catch(() => {});
  }, [db]);

  const join = async () => {
    const handle = draftHandle.trim().toUpperCase().slice(0, 20);
    if (!handle) return;
    apply({ rankHandle: handle, rankDeviceId: rankDeviceId ?? newUuid() });
    await persist();
  };

  const saveCrew = async () => {
    const crew = draftCrew.trim().toUpperCase().slice(0, 24);
    apply({ rankCrew: crew || null });
    setDraftCrew('');
    await persist();
    void refresh();
  };

  const refresh = useCallback(async () => {
    if (!rankHandle || !rankDeviceId || !QUICKLOG_ENDPOINT) return;
    setErr(false);
    try {
      const weekStart = weekStartLocal(todayLocal());
      const base = (await getScoreOnOrBefore(db, addDays(weekStart, -1))) ?? CP_FLOOR;
      await submitRank(QUICKLOG_ENDPOINT, {
        deviceId: rankDeviceId,
        handle: rankHandle,
        cp: score,
        weekGain: Math.max(0, score - base),
        gradeKey,
        crew: rankCrew,
      });
      const useCrew = scope === 'crew' && rankCrew;
      setBoard(await fetchBoard(QUICKLOG_ENDPOINT, { deviceId: rankDeviceId, sort, crew: useCrew ? rankCrew : null }));
    } catch {
      setErr(true);
    }
  }, [db, rankHandle, rankDeviceId, rankCrew, score, gradeKey, sort, scope]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <View>
      <SectionTitle>{t('rank.title')}</SectionTitle>
      <Card>
        {!rankHandle ? (
          <>
            <Muted>{t('rank.optIn')}</Muted>
            <View style={styles.joinRow}>
              <TextInput
                value={draftHandle}
                onChangeText={setDraftHandle}
                placeholder={t('rank.handlePlaceholder')}
                placeholderTextColor={colors.textDim}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.input}
              />
              <Pressable onPress={join} disabled={!draftHandle.trim()} style={[styles.joinBtn, { opacity: draftHandle.trim() ? 1 : 0.4 }]}>
                <Text style={styles.joinText}>{t('rank.join')}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.tabs}>
              <Pill label={t('rank.tabWeek')} active={sort === 'weekGain'} color={colors.cyan} onPress={() => setSort('weekGain')} />
              <Pill label={t('rank.tabCp')} active={sort === 'cp'} color={colors.magenta} onPress={() => setSort('cp')} />
              <Pill
                label={rankCrew ? rankCrew : t('rank.tabCrew')}
                active={scope === 'crew'}
                color={colors.violet}
                onPress={() => setScope(scope === 'crew' ? 'global' : 'crew')}
              />
            </View>

            {scope === 'crew' && !rankCrew ? (
              <View style={styles.joinRow}>
                <TextInput
                  value={draftCrew}
                  onChangeText={setDraftCrew}
                  placeholder={t('rank.crewPlaceholder')}
                  placeholderTextColor={colors.textDim}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.input}
                />
                <Pressable onPress={saveCrew} disabled={!draftCrew.trim()} style={[styles.joinBtn, { opacity: draftCrew.trim() ? 1 : 0.4 }]}>
                  <Text style={styles.joinText}>{t('rank.join')}</Text>
                </Pressable>
              </View>
            ) : null}

            {board?.myRank ? (
              <Text style={styles.myRank}>
                {t('rank.myRank', { rank: board.myRank })} <Muted>· {rankHandle}</Muted>
              </Text>
            ) : null}

            {err ? <Muted>{t('rank.offline')}</Muted> : null}
            {board && board.entries.length === 0 && !err ? <Muted>{t('rank.empty')}</Muted> : null}

            {board?.entries.slice(0, 10).map((e, i) => (
              <View key={`${e.handle}-${i}`} style={[styles.row, e.isMe === 1 && styles.meRow]}>
                <Text style={[styles.pos, i < 3 && { color: colors.energyLo }]}>{i + 1}</Text>
                <Text style={[styles.handle, e.isMe === 1 && { color: colors.cyan }]} numberOfLines={1}>
                  {e.handle}
                </Text>
                <Text style={styles.value}>{sort === 'weekGain' ? `+${e.weekGain}` : e.cp.toLocaleString()}</Text>
              </View>
            ))}
            <Muted style={{ marginTop: space.sm, fontSize: 10 }}>{t('rank.selfReport')}</Muted>
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  joinBtn: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.cyan,
  },
  joinText: { color: colors.cyan, fontSize: fontSize.sm, fontWeight: '900' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginBottom: space.sm },
  myRank: { color: colors.text, fontSize: fontSize.md, fontWeight: '900', marginVertical: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  meRow: { backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, paddingHorizontal: 6 },
  pos: { width: 26, color: colors.textDim, fontFamily: numberFamily, fontSize: fontSize.sm },
  handle: { flex: 1, color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  value: { color: colors.text, fontFamily: numberFamily, fontSize: fontSize.sm },
});
