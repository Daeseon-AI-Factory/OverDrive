// MicButton — the standalone voice-logging control. Owns the ENTIRE record→transcribe→submit
// flow (recording state, transcribe cancel-on-tap escape, voiceGen stale-drop, submit busy) so
// hosts only wire UI reactions through callbacks: onSaved / onAmbiguous / onHint (+ optional
// onTranscript / onStateChange). Two sizes:
//   'bar' — the QuickLogBar IconSquare (48pt machined block), pixel-identical to the old inline mic.
//   'fab' — 64pt prominent circle for the home screen: skin-accent glow ring + a subtle idle pulse
//           keyed off skin.motion.ambient ('none' → static, zero clock — decoration only, §6).
//
// Spec guards (§6 — voice must never slow logging):
//   - Tapping while TRANSCRIBING cancels the wait (voiceGen bump drops the stale result silently);
//     the control is never locked behind a network call.
//   - The submit goes through the host-provided `submit` (useQuickLog().submitText) — the SAME
//     instant save path as typed entries, so JUICE fires and recents refresh on the host's hook.
//     Omit `submit` and the button self-wires its own useQuickLog pipeline (standalone FAB mode).

import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSettingsStore } from '@/stores/settingsStore';
import { IconSquare, useSkinAccent } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import type { HudSkin } from '@/ui/skins/types';
import { border, colors, radius } from '@/ui/theme/tokens';
import { QUICKLOG_ENDPOINT } from './config';
import type { ParseCandidate } from './parseEntry';
import { transcribeAudio } from './transcribe';
import { useQuickLog, type QuickSubmitResult, type SavedQuickSet } from './useQuickLog';

/** Where the voice flow is right now — hosts mirror this into their status line / input locks. */
export type MicState = 'idle' | 'recording' | 'transcribing' | 'submitting';

/**
 * What a hint means, so hosts can react exactly like the pre-extraction QuickLogBar did:
 *   'device' — mic/permission/recording/transcription problem. Show the hint; nothing else changes
 *              (a prior save echo or pending disambiguation stays valid).
 *   'parse'  — the transcript submitted but could not be parsed/saved. Invalidate stale UI
 *              (confirm echo + pending row) before showing the hint.
 *   'save'   — the submit itself threw (db/session error). Clear the confirm echo, show the hint.
 * `text: null` clears the hint (recording started / transcribe cancelled).
 */
export type MicHintKind = 'device' | 'parse' | 'save';

/** A genuinely ambiguous transcript — NOTHING saved; hosts offer options for submitWith(). */
export interface MicPending {
  text: string;
  options: ParseCandidate[];
}

/** Failure reasons a submit can return (everything except 'ambiguous', which carries options). */
export type QuickFailReason = 'empty' | 'no_exercise' | 'no_reps' | 'no_session' | 'ai_offline';

/**
 * The one reason→hint mapping for quicklog submit failures — shared by MicButton (voice) and
 * QuickLogBar (typed) so the two paths can never drift apart.
 */
export function parseFailHint(reason: QuickFailReason, t: TFunction, ko: boolean): string {
  if (reason === 'ai_offline') {
    return t('quicklog.fail.ai_offline', {
      defaultValue: ko
        ? 'AI 연결 실패 — "벤치 100 5" 형식으로 써봐.'
        : 'Couldn\'t reach AI — try the "bench 100 5" format.',
    });
  }
  if (reason === 'no_exercise') return t('quicklog.fail.no_exercise');
  if (reason === 'no_reps' || reason === 'empty') return t('quicklog.fail.no_reps');
  return t('quicklog.fail.log');
}

export interface MicButtonProps {
  /** 'bar' = 48pt IconSquare (QuickLogBar); 'fab' = 64pt accent-glow circle (home FAB). */
  size: 'bar' | 'fab';
  /** Every successful voice save — full result array (multi-set AI saves) + display summary. */
  onSaved: (saved: SavedQuickSet[], summary: string) => void;
  /** Ambiguous transcript (near-tie exercises): nothing saved; host offers a one-tap pick. */
  onAmbiguous: (pending: MicPending) => void;
  /** Status/failure hints (see MicHintKind). null clears the current hint. */
  onHint: (text: string | null, kind: MicHintKind) => void;
  /** Fires with the recognized text right BEFORE submit — hosts may echo it into their input. */
  onTranscript?: (text: string) => void;
  /** Mirrors the internal flow state — hosts drive status lines / input locks off this. */
  onStateChange?: (state: MicState) => void;
  /**
   * The submit pipeline (normally the host's `useQuickLog().submitText`, so saves refresh the
   * host's recents). Omit to let the button run its own self-contained useQuickLog pipeline.
   */
  submit?: (text: string) => Promise<QuickSubmitResult>;
  /** Host-side lock (e.g. a typed submit in flight). The internal submit phase self-locks. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function MicButton(props: MicButtonProps) {
  // Component-level branch (not a conditional hook): hosts never flip `submit` between renders.
  if (props.submit != null) return <MicButtonCore {...props} submit={props.submit} />;
  return <SelfWiredMicButton {...props} />;
}

/** Standalone mode — owns its own quicklog pipeline (home FAB with no QuickLogBar around). */
function SelfWiredMicButton(props: MicButtonProps) {
  const { submitText } = useQuickLog();
  return <MicButtonCore {...props} submit={submitText} />;
}

/** Idle-pulse period per skin.motion.ambient — 'none' skins get a STATIC glow (zero clock). */
const PULSE_MS: Record<HudSkin['motion']['ambient'], number> = {
  flicker: 1400,
  pulse: 2000,
  shine: 2200,
  heat: 2800,
  none: 0,
};

const FAB = 64;
const GLOW_PAD = 8;

function MicButtonCore({
  size,
  onSaved,
  onAmbiguous,
  onHint,
  onTranscript,
  onStateChange,
  submit,
  disabled = false,
  style,
}: MicButtonProps & { submit: NonNullable<MicButtonProps['submit']> }) {
  const { t, i18n } = useTranslation();
  const locale = useSettingsStore((s) => s.locale); // transcribe in the UI language (Whisper code)
  const skin = useSkinOrNull();
  const accent = useSkinAccent();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<MicState>('idle');
  const voiceGen = useRef(0); // bump = cancel the in-flight transcription (result gets dropped)

  const ko = i18n.language.startsWith('ko');
  // New copy not yet in the locale catalogs (owned elsewhere) — per-locale defaults until translated.
  const dv = useCallback((koStr: string, enStr: string) => (ko ? koStr : enStr), [ko]);

  const go = useCallback(
    (next: MicState) => {
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  /** Submit the transcript through the host pipeline and triage the result into callbacks. */
  const submitTranscript = useCallback(
    async (value: string) => {
      try {
        const r = await submit(value);
        if (r.ok) {
          onSaved(r.saved, r.summary);
        } else if (r.reason === 'ambiguous') {
          onAmbiguous({ text: value, options: r.options });
        } else {
          onHint(parseFailHint(r.reason, t, ko), 'parse');
        }
      } catch {
        onHint(t('quicklog.fail.log'), 'save');
      }
    },
    [submit, onSaved, onAmbiguous, onHint, t, ko],
  );

  const toggle = useCallback(async () => {
    // Escape hatch: tapping while transcribing CANCELS the wait — the control is never locked.
    if (state === 'transcribing') {
      voiceGen.current += 1;
      go('idle');
      onHint(null, 'device');
      return;
    }
    if (state === 'submitting') return; // self-locked (rendered disabled) — belt and braces
    if (!QUICKLOG_ENDPOINT) {
      onHint(
        t('quicklog.fail.voice_unavailable', {
          defaultValue: dv('음성 기록은 지금 사용할 수 없어 — 직접 입력해줘.', "Voice logging isn't available right now — type it instead."),
        }),
        'device',
      );
      return;
    }

    if (state === 'recording') {
      go('idle');
      let gen = -1;
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        const uri = recorder.uri;
        if (!uri) {
          onHint(t('quicklog.fail.no_recording'), 'device');
          return;
        }
        gen = ++voiceGen.current;
        go('transcribing');
        const heard = await transcribeAudio(uri, QUICKLOG_ENDPOINT, locale); // transcribe in UI language
        if (gen !== voiceGen.current) return; // cancelled mid-upload — drop the result silently
        go('idle');
        if (!heard) {
          onHint(t('quicklog.fail.empty_voice'), 'device');
          return;
        }
        onTranscript?.(heard); // host may echo it into its input, like a typed line
        go('submitting'); // same in-flight semantics as a typed submit → host shows "logging…"
        try {
          await submitTranscript(heard);
        } finally {
          go('idle');
        }
      } catch {
        if (gen !== -1 && gen !== voiceGen.current) return; // cancelled — stay quiet
        go('idle');
        onHint(t('quicklog.fail.voice'), 'device');
      }
      return;
    }

    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        onHint(t('quicklog.fail.mic_denied'), 'device');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      go('recording');
      onHint(null, 'device');
    } catch {
      onHint(t('quicklog.fail.record'), 'device');
    }
  }, [state, go, recorder, locale, onHint, onTranscript, submitTranscript, t, dv]);

  const recording = state === 'recording';
  const transcribing = state === 'transcribing';
  const blocked = disabled || state === 'submitting';
  const glyph = recording ? '●' : transcribing ? '✕' : '🎤︎';
  const label = recording
    ? t('quicklog.stopRecording')
    : transcribing
      ? t('quicklog.cancelTranscribe', { defaultValue: dv('음성 인식 취소', 'Cancel voice transcription') })
      : t('quicklog.startRecording');

  // ── FAB idle pulse — decoration ONLY (§6): runs on the UI thread while idle, never gates taps.
  // Period comes from skin.motion.ambient; 'none' skins keep a static glow with zero clock.
  const period = PULSE_MS[skin?.motion.ambient ?? 'pulse'];
  const shouldPulse = size === 'fab' && state === 'idle' && !blocked && period > 0;
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!shouldPulse) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: period, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => {
      cancelAnimation(pulse);
      pulse.value = 0;
    };
  }, [shouldPulse, period, pulse]);
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + pulse.value * 0.35,
    transform: [{ scale: 1 + pulse.value * 0.06 }],
  }));

  if (size === 'bar') {
    // Pixel-identical to the old inline QuickLogBar mic (same IconSquare, tones, labels).
    return (
      <IconSquare
        glyph={glyph}
        tone={recording ? 'danger' : 'neutral'}
        onPress={() => void toggle()}
        disabled={blocked}
        accessibilityLabel={label}
        style={style}
      />
    );
  }

  // ── 'fab' — 64pt prominent circle. Skin tokens only: surface2 body, accent ring, accent-fill
  // glow halo (alpha-ramp tokens, no shadows). Recording flips to the ONE sanctioned danger surface.
  const dangerColor = skin != null ? skin.palette.danger : colors.danger;
  const surface = skin != null ? skin.palette.surface2 : colors.surface2;
  const mutedText = skin != null ? skin.palette.text2 : colors.text2;
  return (
    <View style={[styles.fabWrap, style]}>
      {state === 'idle' && !blocked ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.fabGlow, { backgroundColor: accent.fill, borderColor: accent.border }, glowStyle]}
        />
      ) : null}
      <Pressable
        onPress={() => void toggle()}
        disabled={blocked}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: blocked }}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: surface, borderColor: accent.border },
          recording && { backgroundColor: dangerColor, borderColor: dangerColor },
          pressed && { opacity: 0.85 },
          blocked && { opacity: 0.35 },
        ]}
      >
        <Text style={[styles.fabGlyph, { color: recording ? colors.flash : transcribing ? mutedText : accent.solid }]}>
          {glyph}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fabWrap: { width: FAB, height: FAB },
  fabGlow: {
    position: 'absolute',
    top: -GLOW_PAD,
    left: -GLOW_PAD,
    width: FAB + GLOW_PAD * 2,
    height: FAB + GLOW_PAD * 2,
    borderRadius: radius.pill,
    borderWidth: border.thin,
  },
  fab: {
    width: FAB,
    height: FAB,
    borderRadius: radius.pill,
    borderWidth: border.rail,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabGlyph: { fontSize: 24 },
});
