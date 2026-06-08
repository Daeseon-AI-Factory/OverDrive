import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { formatWeight } from '@/lib/units';
import { useSettingsStore } from '@/stores/settingsStore';
import { Muted } from '@/ui/primitives';
import { colors, fontSize, radius, space } from '@/ui/theme/tokens';
import { QUICKLOG_ENDPOINT } from './config';
import { transcribeAudio } from './transcribe';
import { useQuickLog, type RecentChip } from './useQuickLog';

/**
 * The one input. Type or SPEAK "벤치 100 5" → parse → log → explosion. Or tap a recent lift to repeat.
 * Voice: hold-free toggle mic → record → Groq whisper transcribes (server-side key) → same parser.
 * No menus, no body-map — killing choice overload. Manual full entry lives behind a "수동" toggle.
 */
export function QuickLogBar() {
  const { t } = useTranslation();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const locale = useSettingsStore((s) => s.locale); // transcribe in the UI language (Whisper code)
  const { recents, submitText, repeat } = useQuickLog();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [text, setText] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const runSubmit = useCallback(
    async (value: string) => {
      const r = await submitText(value);
      if (r.ok) {
        setText('');
        setHint(null);
      } else {
        setHint(t(`quicklog.fail.${r.reason === 'no_exercise' ? 'no_exercise' : 'no_reps'}`));
      }
    },
    [submitText, t],
  );

  const onSubmit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    await runSubmit(text);
    setBusy(false);
  };

  const toggleMic = useCallback(async () => {
    if (!QUICKLOG_ENDPOINT) {
      setHint(t('quicklog.fail.no_voice'));
      return;
    }
    if (transcribing) return;

    if (recording) {
      setRecording(false);
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        const uri = recorder.uri;
        if (!uri) {
          setHint('🎤 no recording (uri null)');
          return;
        }
        setTranscribing(true);
        const heard = await transcribeAudio(uri, QUICKLOG_ENDPOINT, locale); // transcribe in UI language
        setTranscribing(false);
        if (!heard) {
          setHint('🎤 heard nothing — speak, then tap stop');
          return;
        }
        setText(heard);
        await runSubmit(heard);
      } catch (err) {
        setTranscribing(false);
        setHint('🎤 ' + (err instanceof Error ? err.message : String(err)).slice(0, 110));
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
    } catch (err) {
      setHint('🎤 rec: ' + (err instanceof Error ? err.message : String(err)).slice(0, 110));
    }
  }, [recording, transcribing, recorder, runSubmit, locale, t]);

  const chipLabel = (c: RecentChip) => {
    const w = formatWeight(c.weight, unitSystem); // '' for bodyweight
    return `${c.name}  ${w ? `${w}×` : ''}${c.reps}`;
  };

  const statusHint = recording
    ? t('quicklog.recording')
    : transcribing
      ? t('quicklog.transcribing')
      : (hint ?? t('quicklog.help'));

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <Pressable
          onPress={toggleMic}
          style={[styles.micBtn, recording ? styles.micRec : null]}
          hitSlop={6}
          disabled={transcribing}
        >
          <Text style={[styles.micIcon, recording ? styles.micIconRec : null]}>{recording ? '●' : '🎤'}</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (hint) setHint(null);
          }}
          placeholder={t('quicklog.placeholder')}
          placeholderTextColor={colors.textDim}
          style={styles.input}
          onSubmitEditing={onSubmit}
          returnKeyType="done"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!recording && !transcribing}
        />
        <Pressable
          onPress={onSubmit}
          disabled={!text.trim() || busy}
          style={[styles.logBtn, { opacity: text.trim() && !busy ? 1 : 0.4 }]}
          hitSlop={6}
        >
          <Text style={styles.logText}>{t('quicklog.log')}</Text>
        </Pressable>
      </View>

      <Muted style={[styles.hint, hint || recording ? { color: recording ? colors.energyHi : colors.energyLo } : null]}>
        {statusHint}
      </Muted>

      {recents.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {recents.map((c) => (
            <Pressable key={c.exerciseId} onPress={() => repeat(c)} style={styles.chip} hitSlop={4}>
              <Text style={styles.chipText}>{chipLabel(c)}</Text>
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
  micBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.violet,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micRec: { borderColor: colors.energyHi, backgroundColor: colors.energyHi },
  micIcon: { fontSize: fontSize.lg },
  micIconRec: { color: colors.flash, fontSize: fontSize.xl, fontWeight: '900' },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  logBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.energyHi,
    backgroundColor: colors.surfaceAlt,
  },
  logText: { color: colors.energyHi, fontSize: fontSize.md, fontWeight: '900', letterSpacing: 1 },
  hint: { marginTop: 6 },
  chips: { gap: space.sm, paddingVertical: space.md, paddingRight: space.lg },
  chip: {
    borderWidth: 1,
    borderColor: colors.cyan,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.cyan, fontSize: fontSize.sm, fontWeight: '800' },
});
