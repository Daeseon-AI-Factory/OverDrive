import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { transcribeAudio } from './transcribe';
import { deleteOwnedTemporaryFile } from '@/lib/temporaryFiles';
import { MAX_VOICE_RECORDING_SECONDS, MicButton, type MicButtonProps } from './MicButton';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

jest.mock('expo-audio', () => {
  const recorder = {
    uri: null as string | null,
    isRecording: false,
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(),
    stop: jest.fn(async () => undefined),
  };
  return {
    __recorder: recorder,
    AudioModule: { requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })) },
    RecordingPresets: { HIGH_QUALITY: {} },
    setAudioModeAsync: jest.fn(async () => undefined),
    useAudioRecorder: () => recorder,
  };
});

jest.mock('@/lib/settings', () => ({ hasCurrentRemoteAiConsent: (value: unknown) => value != null }));
jest.mock('@/stores/settingsStore', () => {
  const state = { locale: 'en', remoteAiConsent: {} as object | null };
  const useSettingsStore = Object.assign(
    (selector: (value: typeof state) => unknown) => selector(state),
    { getState: () => state },
  );
  return {
    __setRemoteAiConsent: (value: object | null) => {
      state.remoteAiConsent = value;
    },
    useSettingsStore,
  };
});
jest.mock('@/features/subscription/SubscriptionProvider', () => {
  const requestAiAccess = jest.fn(async () => 'allowed');
  return {
    __requestAiAccess: requestAiAccess,
    useSubscription: () => ({ requestAiAccess, showAiAccessError: jest.fn() }),
  };
});
jest.mock('@/features/subscription/workerClient', () => {
  class MockAiApiError extends Error {
    code = 'worker_error';
  }
  return {
    AiApiError: MockAiApiError,
    isAttemptLimitError: () => false,
    isQuotaError: () => false,
    isRemoteAiConsentError: () => false,
    isSubscriptionRequiredError: () => false,
  };
});
jest.mock('@/lib/temporaryFiles', () => ({ deleteOwnedTemporaryFile: jest.fn(async () => true) }));
jest.mock('./config', () => ({ QUICKLOG_ENDPOINT: 'https://worker.example' }));
jest.mock('./transcribe', () => ({ transcribeAudio: jest.fn(async () => 'bench 100 5') }));
jest.mock('./useQuickLog', () => ({ useQuickLog: () => ({ submitText: jest.fn() }) }));
jest.mock('@/ui/skins/SkinContext', () => ({ useSkinOrNull: () => null }));
jest.mock('@/ui/primitives', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    IconSquare: ({
      glyph,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      glyph: string;
      onPress: () => void;
      disabled: boolean;
      accessibilityLabel: string;
    }) =>
      React.createElement(
        Pressable,
        { accessibilityRole: 'button', accessibilityLabel, disabled, onPress },
        React.createElement(Text, null, glyph),
      ),
    useSkinAccent: () => ({ fill: '#000000', border: '#000000', solid: '#000000' }),
  };
});
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    cancelAnimation: jest.fn(),
    Easing: { inOut: (value: unknown) => value, quad: jest.fn() },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

type MockRecorder = {
  uri: string | null;
  prepareToRecordAsync: jest.Mock<Promise<void>, []>;
  record: jest.Mock<void, [{ forDuration: number }]>;
  stop: jest.Mock<Promise<void>, []>;
};

const recorder = (jest.requireMock('expo-audio') as { __recorder: MockRecorder }).__recorder;
const requestAiAccess = (
  jest.requireMock('@/features/subscription/SubscriptionProvider') as {
    __requestAiAccess: jest.Mock<Promise<string>, []>;
  }
).__requestAiAccess;
const setRemoteAiConsent = (
  jest.requireMock('@/stores/settingsStore') as {
    __setRemoteAiConsent: (value: object | null) => void;
  }
).__setRemoteAiConsent;
const mockedTranscribe = jest.mocked(transcribeAudio);
const mockedDelete = jest.mocked(deleteOwnedTemporaryFile);

const baseProps: MicButtonProps = {
  size: 'bar',
  onSaved: jest.fn(),
  onAmbiguous: jest.fn(),
  onHint: jest.fn(),
  submit: jest.fn(async () => ({ ok: true as const, saved: [], summary: 'logged' })),
};

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function startRecording() {
  fireEvent.press(screen.getByRole('button', { name: 'quicklog.startRecording' }));
  await waitFor(() => expect(recorder.record).toHaveBeenCalledTimes(1));
}

describe('MicButton recording ceiling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    recorder.uri = null;
    setRemoteAiConsent({});
    recorder.stop.mockImplementation(async () => {
      recorder.uri = 'file:///voice.m4a';
    });
    requestAiAccess.mockResolvedValue('allowed');
    mockedTranscribe.mockResolvedValue('bench 100 5');
    mockedDelete.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('sets the native 30-second ceiling and automatically finishes through the JS fallback', async () => {
    render(<MicButton {...baseProps} />);
    await startRecording();

    expect(recorder.record).toHaveBeenCalledWith({ forDuration: MAX_VOICE_RECORDING_SECONDS });

    await act(async () => {
      jest.advanceTimersByTime(MAX_VOICE_RECORDING_SECONDS * 1000 + 250);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(mockedTranscribe).toHaveBeenCalledTimes(1));
    expect(baseProps.submit).toHaveBeenCalledTimes(1);
    expect(recorder.stop).toHaveBeenCalledTimes(1);
  });

  it('does not double-upload when a manual stop races the automatic fallback', async () => {
    let releaseStop!: () => void;
    recorder.stop.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseStop = () => {
            recorder.uri = 'file:///voice.m4a';
            resolve();
          };
        }),
    );
    render(<MicButton {...baseProps} />);
    await startRecording();

    fireEvent.press(screen.getByRole('button', { name: 'quicklog.stopRecording' }));
    expect(recorder.stop).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(MAX_VOICE_RECORDING_SECONDS * 1000 + 250));
    expect(recorder.stop).toHaveBeenCalledTimes(1);

    releaseStop();
    await flushAsyncWork();
    expect(mockedTranscribe).toHaveBeenCalledTimes(1);
    expect(baseProps.submit).toHaveBeenCalledTimes(1);
  });

  it('does not start another recording while the previous native stop is finalizing', async () => {
    let releaseStop!: () => void;
    recorder.stop.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseStop = () => {
            recorder.uri = 'file:///voice.m4a';
            resolve();
          };
        }),
    );
    render(<MicButton {...baseProps} />);
    await startRecording();

    fireEvent.press(screen.getByRole('button', { name: 'quicklog.stopRecording' }));
    const finishing = screen.getByRole('button', { name: 'Finishing recording' });
    fireEvent.press(finishing);

    expect(recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(recorder.record).toHaveBeenCalledTimes(1);
    expect(requestAiAccess).toHaveBeenCalledTimes(1);
    expect(recorder.stop).toHaveBeenCalledTimes(1);

    releaseStop();
    await flushAsyncWork();
    expect(mockedTranscribe).toHaveBeenCalledTimes(1);
  });

  it('stops and removes an owned recording when unmounted before the ceiling', async () => {
    const view = render(<MicButton {...baseProps} />);
    await startRecording();

    view.unmount();
    await flushAsyncWork();
    act(() => jest.advanceTimersByTime(MAX_VOICE_RECORDING_SECONDS * 1000 + 250));

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(mockedDelete).toHaveBeenCalledWith('file:///voice.m4a');
    expect(mockedTranscribe).not.toHaveBeenCalled();
  });

  it('does not start a recording when unmounted during the subscription check', async () => {
    let releaseAccess!: () => void;
    requestAiAccess.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          releaseAccess = () => resolve('allowed');
        }),
    );
    const view = render(<MicButton {...baseProps} />);
    fireEvent.press(screen.getByRole('button', { name: 'quicklog.startRecording' }));

    view.unmount();
    releaseAccess();
    await flushAsyncWork();

    expect(recorder.prepareToRecordAsync).not.toHaveBeenCalled();
    expect(recorder.record).not.toHaveBeenCalled();
  });

  it('rechecks live consent before an automatic upload and still removes the recording', async () => {
    const onHint = jest.fn();
    const view = render(<MicButton {...baseProps} onHint={onHint} />);
    await startRecording();

    setRemoteAiConsent(null);
    view.rerender(<MicButton {...baseProps} onHint={onHint} />);
    await act(async () => {
      jest.advanceTimersByTime(MAX_VOICE_RECORDING_SECONDS * 1000 + 250);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedTranscribe).not.toHaveBeenCalled();
    expect(onHint).toHaveBeenCalledWith(expect.stringContaining('Remote AI is off'), 'device');
    expect(mockedDelete).toHaveBeenCalledWith('file:///voice.m4a');
  });

  it('keeps tap-to-cancel while transcription is in flight', async () => {
    let uploadSignal: AbortSignal | undefined;
    mockedTranscribe.mockImplementationOnce(
      (_uri, _endpoint, _language, signal) =>
        new Promise<string>((_resolve, reject) => {
          uploadSignal = signal;
          signal?.addEventListener('abort', () => reject(new Error('transcribe cancelled')));
        }),
    );
    render(<MicButton {...baseProps} />);
    await startRecording();

    fireEvent.press(screen.getByRole('button', { name: 'quicklog.stopRecording' }));
    await waitFor(() => expect(mockedTranscribe).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByRole('button', { name: 'Cancel voice transcription' }));
    await flushAsyncWork();

    expect(uploadSignal?.aborted).toBe(true);
    expect(baseProps.submit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'quicklog.startRecording' })).toBeTruthy();
  });
});
