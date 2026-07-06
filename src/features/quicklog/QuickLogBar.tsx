import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { formatWeight } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button, IconSquare, Input } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import { border, colors, numType, radius, space, typeScale } from '@/ui/theme/tokens';
import { QUICKLOG_ENDPOINT } from './config';
import { transcribeAudio } from './transcribe';
import { useQuickLog, type RecentChip } from './useQuickLog';

/**
 * The one input. Type or SPEAK "벤치 100 5" → parse → log → explosion. Or tap a recent lift to repeat.
 * Voice: hold-free toggle mic → record → Groq whisper transcribes (server-side key) → same parser.
 * No menus, no body-map — killing choice overload. Manual full entry lives behind a "수동" toggle.
 *
 * MONOLITH chrome: neutral machined blocks (mic IconSquare, recess Input, accent-tinted submit).
 * The ONLY colored surface is the recording-state mic (danger = live status); status feedback is
 * ≤13pt semantic text, never chrome.
 */
export function QuickLogBar() {
  const { t, i18n } = useTranslation();
  const skin = useSkinOrNull(); // themed CTA word (주입/단조/KO!…) — the skin's voice on the one log button
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const locale = useSettingsStore((s) => s.locale); // transcribe in the UI language (Whisper code)
  const { recents, submitText, repeat } = useQuickLog();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null); // failure hints (warning text)
  const [confirm, setConfirm] = useState<string | null>(null); // "what got saved" echo (positive text)
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [repeatingId, setRepeatingId] = useState<string | null>(null);
  const voiceGen = useRef(0); // bump = cancel the in-flight transcription (result gets dropped)

  const ko = i18n.language.startsWith('ko');
  // New copy not yet in the locale catalogs (owned elsewhere) — per-locale defaults until translated.
  const dv = useCallback((koStr: string, enStr: string) => (ko ? koStr : enStr), [ko]);

  const runSubmit = useCallback(
    async (value: string) => {
      try {
        const r = await submitText(value);
        if (r.ok) {
          setText('');
          setHint(null);
          setConfirm(r.summary ? `✓ ${r.summary}` : null); // echo WHAT was logged — misparses are visible
        } else {
          setConfirm(null);
          setHint(
            r.reason === 'ai_offline'
              ? t('quicklog.fail.ai_offline', {
                  defaultValue: dv('AI 연결 실패 — "벤치 100 5" 형식으로 써봐.', 'Couldn\'t reach AI — try the "bench 100 5" format.'),
                })
              : r.reason === 'no_exercise'
                ? t('quicklog.fail.no_exercise')
                : r.reason === 'no_reps' || r.reason === 'empty'
                  ? t('quicklog.fail.no_reps')
                  : t('quicklog.fail.log'),
          );
        }
      } catch {
        setConfirm(null);
        setHint(t('quicklog.fail.log'));
      }
    },
    [submitText, t, dv],
  );

  const onSubmit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await runSubmit(text);
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = useCallback(async () => {
    // Escape hatch: tapping the mic while transcribing CANCELS the wait — the bar is never locked.
    if (transcribing) {
      voiceGen.current += 1;
      setTranscribing(false);
      setHint(null);
      return;
    }
    if (!QUICKLOG_ENDPOINT) {
      setHint(
        t('quicklog.fail.voice_unavailable', {
          defaultValue: dv('음성 기록은 지금 사용할 수 없어 — 직접 입력해줘.', "Voice logging isn't available right now — type it instead."),
        }),
      );
      return;
    }

    if (recording) {
      setRecording(false);
      let gen = -1;
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        const uri = recorder.uri;
        if (!uri) {
          setHint(t('quicklog.fail.no_recording'));
          return;
        }
        gen = ++voiceGen.current;
        setTranscribing(true);
        const heard = await transcribeAudio(uri, QUICKLOG_ENDPOINT, locale); // transcribe in UI language
        if (gen !== voiceGen.current) return; // cancelled mid-upload — drop the result silently
        setTranscribing(false);
        if (!heard) {
          setHint(t('quicklog.fail.empty_voice'));
          return;
        }
        setText(heard);
        setBusy(true); // same in-flight state as a typed submit → visible "logging…" + no double submit
        try {
          await runSubmit(heard);
        } finally {
          setBusy(false);
        }
      } catch {
        if (gen !== -1 && gen !== voiceGen.current) return; // cancelled — stay quiet
        setTranscribing(false);
        setHint(t('quicklog.fail.voice'));
      }
      return;
    }

    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setHint(t('quicklog.fail.mic_denied'));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setHint(null);
    } catch {
      setHint(t('quicklog.fail.record'));
    }
  }, [recording, transcribing, recorder, runSubmit, locale, t, dv]);

  const onRepeat = useCallback(
    async (chip: RecentChip) => {
      if (recording || repeatingId) return; // chips are purely local — network states never block them
      setRepeatingId(chip.exerciseId);
      setHint(null);
      try {
        await repeat(chip);
        const w = formatWeight(chip.weight, unitSystem);
        setConfirm(`✓ ${chip.name}  ${w ? `${w}×` : ''}${chip.reps}`);
      } catch {
        setHint(t('quicklog.fail.log'));
      } finally {
        setRepeatingId(null);
      }
    },
    [recording, repeat, repeatingId, t, unitSystem],
  );

  const chipLabel = (c: RecentChip) => {
    const w = formatWeight(c.weight, unitSystem); // '' for bodyweight
    return `${c.name}  ${w ? `${w}×` : ''}${c.reps}`;
  };

  // Digits-only stat for the chip (Orbitron renders digits, never words — the unit lives in the
  // accessibility label / confirm echo, not the 30pt chip).
  const chipStat = (c: RecentChip) => {
    const w = formatWeight(c.weight, unitSystem); // "100 kg" | '' for bodyweight
    const n = w ? w.split(' ')[0] : '';
    return `${n ? `${n}×` : ''}${c.reps}`;
  };

  const statusHint = recording
    ? t('quicklog.recording')
    : transcribing
      ? t('quicklog.transcribing')
      : busy
        ? t('quicklog.logging', { defaultValue: dv('기록 중…', 'Logging…') })
        : (hint ?? confirm ?? t('quicklog.help'));
  const statusColor = recording
    ? colors.danger
    : transcribing || busy
      ? colors.text3
      : hint
        ? colors.warning
        : confirm
          ? colors.positive
          : colors.text3;

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <IconSquare
          glyph={recording ? '●' : transcribing ? '✕' : '🎤︎'}
          tone={recording ? 'danger' : 'neutral'}
          onPress={() => void toggleMic()}
          disabled={busy}
          accessibilityLabel={
            recording
              ? t('quicklog.stopRecording')
              : transcribing
                ? t('quicklog.cancelTranscribe', { defaultValue: dv('음성 인식 취소', 'Cancel voice transcription') })
                : t('quicklog.startRecording')
          }
        />
        <Input
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (hint) setHint(null);
          }}
          placeholder={t('quicklog.placeholder')}
          accessibilityLabel={t('quicklog.placeholder')}
          style={styles.input}
          onSubmitEditing={onSubmit}
          returnKeyType="done"
          submitBehavior="submit" // keep the keyboard up after logging — the next set is one line away
          autoCapitalize="none"
          autoCorrect={false}
          editable={!recording && !transcribing}
        />
        <Button
          label={skin?.cta.logWord ?? t('quicklog.log')}
          onPress={() => void onSubmit()}
          variant="secondary"
          compact
          disabled={!text.trim() || busy}
        />
      </View>

      <Text style={[styles.hint, { color: statusColor }]}>{statusHint}</Text>

      {recents.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}
        >
          {recents.map((c) => (
            <Pressable
              key={c.exerciseId}
              onPress={() => void onRepeat(c)}
              disabled={!!repeatingId || recording}
              accessibilityRole="button"
              accessibilityLabel={t('quicklog.repeatRecent', { label: chipLabel(c) })}
              accessibilityState={{ disabled: !!repeatingId || recording }}
              style={[styles.chip, (!!repeatingId || recording) && styles.disabled]}
              hitSlop={4}
            >
              {repeatingId === c.exerciseId ? (
                <Text style={styles.chipName}>…</Text>
              ) : (
                <>
                  <Text style={styles.chipName}>{c.name}</Text>
                  <Text style={styles.chipStat}>{chipStat(c)}</Text>
                </>
              )}
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: { flex: 1 },
  disabled: { opacity: 0.4 },
  hint: { ...typeScale.caption, marginTop: space.sm },
  chips: { gap: space.sm, paddingVertical: space.md, paddingRight: space.lg },
  // Pill-inactive chrome (neutral surface2 + 1pt line) — recents are history, not live state.
  chip: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    borderWidth: border.thin,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
  },
  chipName: { ...typeScale.label, color: colors.text2 },
  chipStat: { ...numType.small, color: colors.text2, marginLeft: space.sm },
});
