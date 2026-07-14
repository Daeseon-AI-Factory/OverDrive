import {
  FileSystemUploadType,
  createUploadTask,
  type FileSystemUploadResult,
} from 'expo-file-system/legacy';
import { TRANSCRIBE_UPLOAD_TIMEOUT_MS, transcribeAudio } from './transcribe';

jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { MULTIPART: 'multipart' },
  createUploadTask: jest.fn(),
}));

jest.mock('@/features/subscription/workerClient', () => ({
  authorizedAiUpload: jest.fn(
    async (_endpoint: string, upload: (headers: Record<string, string>) => Promise<FileSystemUploadResult>) =>
      upload({ 'x-reploom-client': 'ios-v1' }),
  ),
}));

const mockedCreateUploadTask = jest.mocked(createUploadTask);

function uploadResult(status: number, body: string): FileSystemUploadResult {
  return { status, body, headers: {} } as FileSystemUploadResult;
}

function installUploadTask(uploadAsync: () => Promise<FileSystemUploadResult | null | undefined>) {
  const task = {
    uploadAsync: jest.fn(uploadAsync),
    cancelAsync: jest.fn(async () => undefined),
  };
  mockedCreateUploadTask.mockReturnValue(task as unknown as ReturnType<typeof createUploadTask>);
  return task;
}

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('transcribeAudio', () => {
  it('uploads with the client marker and returns trimmed text', async () => {
    const task = installUploadTask(async () => uploadResult(200, JSON.stringify({ text: '  bench 100 5  ' })));

    await expect(transcribeAudio('file:///voice.m4a', 'https://worker.example/', 'ko')).resolves.toBe('bench 100 5');
    expect(mockedCreateUploadTask).toHaveBeenCalledWith(
      'https://worker.example/transcribe',
      'file:///voice.m4a',
      expect.objectContaining({
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'audio/m4a',
        headers: { 'x-reploom-client': 'ios-v1' },
        parameters: { language: 'ko' },
      }),
    );
    expect(task.cancelAsync).not.toHaveBeenCalled();
  });

  it('rejects a result that races in after the bounded upload deadline', async () => {
    jest.useFakeTimers();
    let resolveUpload!: (value: FileSystemUploadResult) => void;
    const task = installUploadTask(() => new Promise((resolve) => (resolveUpload = resolve)));

    const result = transcribeAudio('file:///voice.m4a', 'https://worker.example');
    const rejected = expect(result).rejects.toThrow('transcribe timed out');
    await jest.advanceTimersByTimeAsync(TRANSCRIBE_UPLOAD_TIMEOUT_MS);
    resolveUpload(uploadResult(200, JSON.stringify({ text: 'late result' })));

    await rejected;
    expect(task.cancelAsync).toHaveBeenCalledTimes(1);
  });

  it('accepts a successful upload just before the bounded deadline', async () => {
    jest.useFakeTimers();
    const task = installUploadTask(
      () => new Promise((resolve) => {
        setTimeout(
          () => resolve(uploadResult(200, JSON.stringify({ text: 'bench 100 5' }))),
          TRANSCRIBE_UPLOAD_TIMEOUT_MS - 100,
        );
      }),
    );
    const result = transcribeAudio('file:///voice.m4a', 'https://worker.example');
    await jest.advanceTimersByTimeAsync(TRANSCRIBE_UPLOAD_TIMEOUT_MS - 100);

    await expect(result).resolves.toBe('bench 100 5');
    expect(task.cancelAsync).not.toHaveBeenCalled();
  });

  it('rejects a result that races in after caller cancellation', async () => {
    let resolveUpload!: (value: FileSystemUploadResult) => void;
    const task = installUploadTask(() => new Promise((resolve) => (resolveUpload = resolve)));
    const controller = new AbortController();

    const result = transcribeAudio('file:///voice.m4a', 'https://worker.example', undefined, controller.signal);
    const rejected = expect(result).rejects.toThrow('transcribe cancelled');
    controller.abort();
    resolveUpload(uploadResult(200, JSON.stringify({ text: 'cancelled result' })));

    await rejected;
    expect(task.cancelAsync).toHaveBeenCalledTimes(1);
  });
});
