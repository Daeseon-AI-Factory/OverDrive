import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { getScoreOnOrBefore } from '@/db/repos/combatPowerRepo';
import { newUuid } from '@/db/uuid';
import { addDays, weekStartLocal } from '@/features/arena/rival';
import { QUICKLOG_ENDPOINT } from '@/features/quicklog/config';
import { CP_FLOOR } from '@/features/combat-power/constants';
import { todayLocal } from '@/lib/date';
import { useCombatPowerStore } from '@/stores/combatPowerStore';
import { persistSettings, useSettingsStore } from '@/stores/settingsStore';
import { Button, Card, Input, Muted, Pill, SectionTitle, useAccent } from '@/ui/primitives';
import { colors, numType, radius, space, typeScale } from '@/ui/theme/tokens';
import { fetchBoard, submitRank, type RankBoard, type RankSort } from './rankClient';

/**
 * RANKINGS — real leaderboards (Worker + D1). Opt-in by picking a handle; until then nothing leaves
 * the device. Primary board = WEEKLY GAIN (improvement — a beginner can beat a veteran, §10).
 * Crew board = your gym, joined by a shared code. Self-reported in Phase 1 (trust-tiering = Phase 4).
 */
export function RankSection() {
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const accent = useAccent();
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
  const [loading, setLoading] = useState(false);

  const persist = useCallback(async () => {
    await persistSettings(db);
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
    setLoading(true);
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
    } finally {
      setLoading(false);
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
              <Input
                value={draftHandle}
                onChangeText={setDraftHandle}
                placeholder={t('rank.handlePlaceholder')}
                accessibilityLabel={t('rank.handlePlaceholder')}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.input}
              />
              <Button
                label={t('rank.join')}
                variant="secondary"
                compact
                disabled={!draftHandle.trim()}
                onPress={() => void join()}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.tabs}>
              <Pill label={t('rank.tabWeek')} active={sort === 'weekGain'} onPress={() => setSort('weekGain')} />
              <Pill label={t('rank.tabCp')} active={sort === 'cp'} onPress={() => setSort('cp')} />
              <Pill
                label={rankCrew ? rankCrew : t('rank.tabCrew')}
                active={scope === 'crew'}
                onPress={() => setScope(scope === 'crew' ? 'global' : 'crew')}
              />
            </View>

            {scope === 'crew' && !rankCrew ? (
              <View style={styles.joinRow}>
                <Input
                  value={draftCrew}
                  onChangeText={setDraftCrew}
                  placeholder={t('rank.crewPlaceholder')}
                  accessibilityLabel={t('rank.crewPlaceholder')}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.input}
                />
                <Button
                  label={t('rank.join')}
                  variant="secondary"
                  compact
                  disabled={!draftCrew.trim()}
                  onPress={() => void saveCrew()}
                />
              </View>
            ) : null}

            {board?.myRank ? (
              <Text style={styles.myRank}>
                {t('rank.myRank', { rank: board.myRank })} <Muted>· {rankHandle}</Muted>
              </Text>
            ) : null}

            {/* First load: show that the board is coming instead of a blank card (stale board stays up on refetches). */}
            {loading && !board ? <ActivityIndicator color={accent.solid} style={styles.loading} /> : null}
            {err ? (
              <Pressable onPress={() => void refresh()} disabled={loading} hitSlop={8} accessibilityRole="button">
                <Muted>
                  {t('rank.offline')}{' '}
                  <Text style={[styles.retry, { color: accent.solid }]}>{t('rank.retry', { defaultValue: 'Tap to retry' })}</Text>
                </Muted>
              </Pressable>
            ) : null}
            {board && board.entries.length === 0 && !err && !loading ? <Muted>{t('rank.empty')}</Muted> : null}

            {board?.entries.slice(0, 10).map((e, i) => (
              <View key={`${e.handle}-${i}`} style={[styles.row, e.isMe === 1 && [styles.meRow, { backgroundColor: accent.faint }]]}>
                <Text style={[styles.pos, i < 3 && { color: colors.text }]}>{i + 1}</Text>
                <Text style={[styles.handle, e.isMe === 1 && { color: accent.solid, fontWeight: '600' }]} numberOfLines={1}>
                  {e.handle}
                </Text>
                <Text style={styles.value}>{sort === 'weekGain' ? `+${e.weekGain}` : e.cp.toLocaleString()}</Text>
              </View>
            ))}
            <Muted style={styles.selfReport}>{t('rank.selfReport')}</Muted>
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  input: { flex: 1 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
  myRank: { ...typeScale.body, fontWeight: '600', color: colors.text, marginVertical: space.sm },
  loading: { marginVertical: space.sm },
  retry: { fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 32, paddingVertical: space.xs },
  // accent.faint row highlight (the ONE colored surface on the board — it's you, alive right now);
  // negative margin keeps the columns aligned with the unhighlighted rows.
  meRow: { borderRadius: radius.sm, paddingHorizontal: space.sm, marginHorizontal: -space.sm },
  pos: { ...numType.small, color: colors.text3, width: 28 },
  handle: { ...typeScale.body, flex: 1, color: colors.text },
  value: { ...numType.small, color: colors.text },
  selfReport: { marginTop: space.sm, color: colors.text3 },
});
