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
import { hasCurrentRemoteAiConsent } from '@/lib/settings';
import { deleteOwnedTemporaryFile } from '@/lib/temporaryFiles';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSubscription, type AiAccessDecision } from '@/features/subscription/SubscriptionProvider';
import {
  AiApiError,
  isAttemptLimitError,
  isQuotaError,
  isRemoteAiConsentError,
  isSubscriptionRequiredError,
} from '@/features/subscription/workerClient';
import { IconSquare, useSkinAccent } from '@/ui/primitives';
import { useSkinOrNull } from '@/ui/skins/SkinContext';
import type { HudSkin } from '@/ui/skins/types';
import { border, colors, radius } from '@/ui/theme/tokens';
import { QUICKLOG_ENDPOINT } from './config';
import type { ParseCandidate } from './parseEntry';
import { transcribeAudio } from './transcribe';
import { useQuickLog, type QuickSubmitResult, type SavedQuickSet } from './useQuickLog';

/** Where the voice flow is right now — hosts mirror this into their status line / input locks. */
export type MicState = 'idle' | 'recording' | 'finishing' | 'transcribing' | 'submitting';

/** Native recording ceiling; the Worker keeps a slightly larger validation allowance for rounding. */
export const MAX_VOICE_RECORDING_SECONDS = 30;
const VOICE_RECORDING_FALLBACK_DELAY_MS = 250;

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
export type QuickFailReason =
  | 'empty'
  | 'no_exercise'
  | 'no_reps'
  | 'no_session'
  | 'ai_offline'
  | 'ai_consent_required'
  | 'subscription_required'
  | 'ai_quota_exhausted';

/**
 * The one reason→hint mapping for quicklog submit failures — shared by MicButton (voice) and
 * QuickLogBar (typed) so the two paths can never drift apart.
 */
export function parseFailHint(reason: QuickFailReason, t: TFunction, ko: boolean): string {
  if (reason === 'ai_consent_required') {
    return t('quicklog.fail.ai_consent_required', {
      defaultValue: ko
        ? '원격 AI가 꺼져 있어 — 설정에서 켜거나 "벤치 100 5" 형식으로 로컬 기록해줘.'
        : 'Remote AI is off — enable it in Settings, or log locally with the "bench 100 5" format.',
    });
  }
  if (reason === 'ai_offline') {
    return t('quicklog.fail.ai_offline', {
      defaultValue: ko
        ? 'AI 연결 실패 — "벤치 100 5" 형식으로 써봐.'
        : 'Couldn\'t reach AI — try the "bench 100 5" format.',
    });
  }
  if (reason === 'subscription_required') return t('quicklog.fail.subscription_required');
  if (reason === 'ai_quota_exhausted') return t('quicklog.fail.ai_quota_exhausted');
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
  const remoteAiAllowed = useSettingsStore((s) => hasCurrentRemoteAiConsent(s.remoteAiConsent));
  const { requestAiAccess, showAiAccessError } = useSubscription();
  const skin = useSkinOrNull();
  const accent = useSkinAccent();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<MicState>('idle');
  const [checkingAccess, setCheckingAccess] = useState(false);
  const voiceGen = useRef(0); // bump = cancel the in-flight transcription (result gets dropped)
  const transcriptionAbort = useRef<AbortController | null>(null);
  const recordingActive = useRef(false);
  const recordingAutoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

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

  const clearRecordingAutoStop = useCallback(() => {
    if (recordingAutoStopTimer.current == null) return;
    clearTimeout(recordingAutoStopTimer.current);
    recordingAutoStopTimer.current = null;
  }, []);

  /**
   * One guarded recording completion path for both a user tap and the automatic ceiling. The ref
   * flips before the first await, so a tap racing the fallback timer can never upload twice.
   */
  const finishRecording = useCallback(async () => {
    if (!recordingActive.current) return;
    recordingActive.current = false;
    clearRecordingAutoStop();
    // Keep the control locked until stop(), the URI snapshot, and audio-mode reset complete. A
    // second tap must never prepare the same recorder while its previous file is still finalizing.
    go('finishing');

    let gen = -1;
    let recordedUri: string | null = null;
    let ctrl: AbortController | null = null;
    try {
      try {
        await recorder.stop();
      } catch (stopError) {
        // Native `forDuration` can finish before the JS fallback calls stop(). That is a valid
        // completion only when the recorder has already produced its owned temporary file.
        recordedUri = recorder.uri;
        if (!recordedUri) throw stopError;
      }
      recordedUri ??= recorder.uri;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!mounted.current) return;
      if (!recordedUri) {
        go('idle');
        onHint(t('quicklog.fail.no_recording'), 'device');
        return;
      }
      // Consent may have been withdrawn after recording started. Never upload in that case.
      // The timer owns its start-render callback for 30s. Read the store at finish time so a
      // consent withdrawal during recording can never upload through a stale closure.
      if (!hasCurrentRemoteAiConsent(useSettingsStore.getState().remoteAiConsent)) {
        go('idle');
        onHint(parseFailHint('ai_consent_required', t, ko), 'device');
        return;
      }
      gen = ++voiceGen.current;
      go('transcribing');
      ctrl = new AbortController();
      transcriptionAbort.current = ctrl;
      const heard = await transcribeAudio(recordedUri, QUICKLOG_ENDPOINT, locale, ctrl.signal); // transcribe in UI language
      if (gen !== voiceGen.current || !mounted.current) return; // cancelled/unmounted — drop silently
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
        if (mounted.current) go('idle');
      }
    } catch (error) {
      // Capture the stopped recording before returning to idle; a later recording must never be
      // mistaken for this request's cleanup target.
      recordedUri ??= recorder.uri;
      if (!mounted.current || (gen !== -1 && gen !== voiceGen.current)) return;
      go('idle');
      if (isRemoteAiConsentError(error)) {
        onHint(parseFailHint('ai_consent_required', t, ko), 'device');
      } else if (isQuotaError(error) || (error instanceof AiApiError && error.code === 'data_deleted_until_reset')) {
        showAiAccessError(error);
        onHint(parseFailHint('ai_quota_exhausted', t, ko), 'device');
      } else if (isAttemptLimitError(error)) {
        showAiAccessError(error);
        onHint(parseFailHint('ai_offline', t, ko), 'device');
      } else if (isSubscriptionRequiredError(error)) {
        onHint(parseFailHint('subscription_required', t, ko), 'device');
      } else {
        onHint(t('quicklog.fail.voice'), 'device');
      }
    } finally {
      if (ctrl != null && transcriptionAbort.current === ctrl) transcriptionAbort.current = null;
      if (!(await deleteOwnedTemporaryFile(recordedUri))) {
        console.error('[privacy] temporary voice recording could not be removed');
      }
    }
  }, [
    clearRecordingAutoStop,
    go,
    recorder,
    t,
    ko,
    locale,
    onHint,
    onTranscript,
    submitTranscript,
    showAiAccessError,
  ]);

  const toggle = useCallback(async () => {
    if (checkingAccess) return;
    // Escape hatch: tapping while transcribing CANCELS the wait — the control is never locked.
    if (state === 'transcribing') {
      transcriptionAbort.current?.abort();
      voiceGen.current += 1;
      go('idle');
      onHint(null, 'device');
      return;
    }
    if (state === 'finishing' || state === 'submitting') return; // self-locked — belt and braces

    if (state === 'recording') {
      await finishRecording();
      return;
    }

    if (!remoteAiAllowed) {
      onHint(parseFailHint('ai_consent_required', t, ko), 'device');
      return;
    }
    if (!QUICKLOG_ENDPOINT) {
      onHint(
        t('quicklog.fail.voice_unavailable', {
          defaultValue: dv('음성 기록은 지금 사용할 수 없어 — 직접 입력해줘.', "Voice logging isn't available right now — type it instead."),
        }),
        'device',
      );
      return;
    }

    setCheckingAccess(true);
    let access: AiAccessDecision;
    try {
      access = await requestAiAccess('voice');
    } finally {
      if (mounted.current) setCheckingAccess(false);
    }
    if (!mounted.current) return;
    if (access !== 'allowed') {
      onHint(
        parseFailHint(
          access === 'quota' || access === 'data_deleted'
            ? 'ai_quota_exhausted'
            : access === 'unavailable'
              ? 'ai_offline'
              : 'subscription_required',
          t,
          ko,
        ),
        'device',
      );
      return;
    }

    let recordingModeEnabled = false;
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!mounted.current) return;
      if (!perm.granted) {
        onHint(t('quicklog.fail.mic_denied'), 'device');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      recordingModeEnabled = true;
      if (!mounted.current) {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        return;
      }
      await recorder.prepareToRecordAsync();
      if (!mounted.current) {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        return;
      }
      recorder.record({ forDuration: MAX_VOICE_RECORDING_SECONDS });
      recordingActive.current = true;
      clearRecordingAutoStop();
      recordingAutoStopTimer.current = setTimeout(() => {
        void finishRecording();
      }, MAX_VOICE_RECORDING_SECONDS * 1000 + VOICE_RECORDING_FALLBACK_DELAY_MS);
      go('recording');
      onHint(null, 'device');
    } catch {
      recordingActive.current = false;
      clearRecordingAutoStop();
      if (recordingModeEnabled) {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
      }
      if (mounted.current) onHint(t('quicklog.fail.record'), 'device');
    }
  }, [
    state,
    checkingAccess,
    go,
    recorder,
    remoteAiAllowed,
    requestAiAccess,
    finishRecording,
    clearRecordingAutoStop,
    onHint,
    t,
    ko,
    dv,
  ]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      voiceGen.current += 1;
      transcriptionAbort.current?.abort();
      clearRecordingAutoStop();
      if (!recordingActive.current) return;
      recordingActive.current = false;
      void (async () => {
        let recordedUri = recorder.uri;
        try {
          await recorder.stop();
          recordedUri ??= recorder.uri;
        } catch {
          recordedUri ??= recorder.uri;
        }
        try {
          await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        } finally {
          if (!(await deleteOwnedTemporaryFile(recordedUri))) {
            console.error('[privacy] temporary voice recording could not be removed');
          }
        }
      })();
    };
  }, [clearRecordingAutoStop, recorder]);

  const recording = state === 'recording';
  const finishing = state === 'finishing';
  const transcribing = state === 'transcribing';
  const blocked = disabled || checkingAccess || finishing || state === 'submitting';
  const glyph = recording ? '●' : finishing ? '…' : transcribing ? '✕' : '🎤︎';
  const label = recording
    ? t('quicklog.stopRecording')
    : finishing
      ? t('quicklog.finishingRecording', { defaultValue: dv('녹음 마무리 중', 'Finishing recording') })
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
