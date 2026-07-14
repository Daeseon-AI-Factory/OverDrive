import {
  FileSystemUploadType,
  createUploadTask,
  type FileSystemUploadResult,
} from 'expo-file-system/legacy';
import { FOOD_PHOTO_UPLOAD_TIMEOUT_MS, normalizeFoodItems, parseFoodPhoto } from './parseFoodAI';

jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { MULTIPART: 'multipart' },
  createUploadTask: jest.fn(),
}));

jest.mock('@/features/subscription/workerClient', () => ({
  authorizedAiFetch: jest.fn(),
  authorizedAiUpload: jest.fn(async (_endpoint: string, upload: (headers: Record<string, string>) => Promise<FileSystemUploadResult>) => {
    const result = await upload({ 'x-reploom-client': 'ios-v1' });
    if (result.status < 200 || result.status >= 300) throw new Error(`worker_error ${result.status}`);
    return result;
  }),
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

describe('normalizeFoodItems', () => {
  it('keeps named items, rounds + clamps numbers', () => {
    const out = normalizeFoodItems({
      items: [
        { name: '닭가슴살 300g', kcal: 495.4, proteinG: 92.7 },
        { name: 'rice bowl', kcal: 300, proteinG: 6 },
      ],
    });
    expect(out).toEqual([
      { name: '닭가슴살 300g', kcal: 495, proteinG: 93 },
      { name: 'rice bowl', kcal: 300, proteinG: 6 },
    ]);
  });

  it('drops nameless or numberless garbage', () => {
    const out = normalizeFoodItems({
      items: [{ name: '', kcal: 100, proteinG: 5 }, { name: 'mystery' }, 'junk', null],
    });
    expect(out).toEqual([]);
  });

  it('handles malformed shapes', () => {
    expect(normalizeFoodItems({})).toEqual([]);
    expect(normalizeFoodItems(null)).toEqual([]);
    expect(normalizeFoodItems({ items: 'x' })).toEqual([]);
  });

  it('negative values clamp to 0', () => {
    const out = normalizeFoodItems({ items: [{ name: 'weird', kcal: -50, proteinG: -3 }] });
    expect(out).toEqual([{ name: 'weird', kcal: 0, proteinG: 0 }]);
  });
});

describe('parseFoodPhoto', () => {
  it('uploads with the native task and returns normalized food items', async () => {
    const task = installUploadTask(async () =>
      uploadResult(200, JSON.stringify({ items: [{ name: 'rice', kcal: 301.4, proteinG: 6.2 }] })),
    );

    await expect(parseFoodPhoto('file:///meal.jpg', 'https://worker.example/')).resolves.toEqual([
      { name: 'rice', kcal: 301, proteinG: 6 },
    ]);
    expect(mockedCreateUploadTask).toHaveBeenCalledWith(
      'https://worker.example/food',
      'file:///meal.jpg',
      expect.objectContaining({
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: 'image/jpeg',
        headers: { 'x-reploom-client': 'ios-v1' },
      }),
    );
    expect(task.cancelAsync).not.toHaveBeenCalled();
  });

  it('cancels the native upload and rejects when the bounded deadline expires', async () => {
    jest.useFakeTimers();
    const task = installUploadTask(() => new Promise(() => {}));

    const result = parseFoodPhoto('file:///meal.jpg', 'https://worker.example');
    const rejected = expect(result).rejects.toThrow('food photo timed out');
    await jest.advanceTimersByTimeAsync(FOOD_PHOTO_UPLOAD_TIMEOUT_MS);

    await rejected;
    expect(task.cancelAsync).toHaveBeenCalledTimes(1);
  });

  it('accepts a successful photo response just before the bounded deadline', async () => {
    jest.useFakeTimers();
    const task = installUploadTask(
      () => new Promise((resolve) => {
        setTimeout(
          () => resolve(uploadResult(200, JSON.stringify({ items: [{ name: 'rice', kcal: 300, proteinG: 6 }] }))),
          FOOD_PHOTO_UPLOAD_TIMEOUT_MS - 100,
        );
      }),
    );
    const result = parseFoodPhoto('file:///meal.jpg', 'https://worker.example');
    await jest.advanceTimersByTimeAsync(FOOD_PHOTO_UPLOAD_TIMEOUT_MS - 100);

    await expect(result).resolves.toEqual([{ name: 'rice', kcal: 300, proteinG: 6 }]);
    expect(task.cancelAsync).not.toHaveBeenCalled();
  });

  it('cancels the native upload when the caller aborts', async () => {
    const task = installUploadTask(() => new Promise(() => {}));
    const controller = new AbortController();

    const result = parseFoodPhoto('file:///meal.jpg', 'https://worker.example', controller.signal);
    controller.abort();

    await expect(result).rejects.toThrow('food photo cancelled');
    expect(task.cancelAsync).toHaveBeenCalledTimes(1);
  });

  it('preserves upload failures without reporting a cancellation', async () => {
    const task = installUploadTask(async () => {
      throw new Error('network down');
    });

    await expect(parseFoodPhoto('file:///meal.jpg', 'https://worker.example')).rejects.toThrow('network down');
    expect(task.cancelAsync).not.toHaveBeenCalled();
  });

  it('rejects non-success HTTP responses', async () => {
    const task = installUploadTask(async () => uploadResult(503, '{"error":"unavailable"}'));

    await expect(parseFoodPhoto('file:///meal.jpg', 'https://worker.example')).rejects.toThrow('worker_error 503');
    expect(task.cancelAsync).not.toHaveBeenCalled();
  });
});
