/* eslint-disable import/first -- Jest must install native-module mocks before importing the client. */
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  EncodingType: { Base64: 'base64' },
  FileSystemUploadType: { MULTIPART: 1 },
  copyAsync: jest.fn(),
  createUploadTask: jest.fn(),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  moveAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('@/lib/image', () => ({ downscaleForUpload: jest.fn() }));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { PNG: 'png' },
  manipulateAsync: jest.fn(),
}));

import {
  BODY_AVATAR_DIRECTORY,
  BODY_AVATAR_ORIGINAL_PATH,
  BODY_AVATAR_TIMEOUT_MS,
  LEGACY_EVOLUTION_ORIGINAL_PATH,
  LEGACY_EVOLUTION_RESULT_PATH,
  BodyAvatarError,
  activateBodyAvatarGeneration,
  deleteBodyAvatarLocalFiles,
  discardBodyAvatarGeneration,
  generateBodyAvatar,
  pickAndStoreBodyAvatarPhoto,
} from './bodyAvatarClient';

const fileSystemMock = jest.requireMock('expo-file-system/legacy') as {
  copyAsync: jest.Mock;
  createUploadTask: jest.Mock;
  deleteAsync: jest.Mock;
  getInfoAsync: jest.Mock;
  makeDirectoryAsync: jest.Mock;
  moveAsync: jest.Mock;
  readAsStringAsync: jest.Mock;
  readDirectoryAsync: jest.Mock;
  writeAsStringAsync: jest.Mock;
};
const mockCopyAsync = fileSystemMock.copyAsync;
const mockUploadAsync = jest.fn();
const mockCancelAsync = jest.fn();
const mockCreateUploadTask = fileSystemMock.createUploadTask;
const mockDeleteAsync = fileSystemMock.deleteAsync;
const mockGetInfoAsync = fileSystemMock.getInfoAsync;
const mockMakeDirectoryAsync = fileSystemMock.makeDirectoryAsync;
const mockMoveAsync = fileSystemMock.moveAsync;
const mockReadAsStringAsync = fileSystemMock.readAsStringAsync;
const mockReadDirectoryAsync = fileSystemMock.readDirectoryAsync;
const mockWriteAsStringAsync = fileSystemMock.writeAsStringAsync;
const imageManipulatorMock = jest.requireMock('expo-image-manipulator') as { manipulateAsync: jest.Mock };
const mockManipulateAsync = imageManipulatorMock.manipulateAsync;
const imagePickerMock = jest.requireMock('expo-image-picker') as { launchImageLibraryAsync: jest.Mock };
const mockLaunchImageLibraryAsync = imagePickerMock.launchImageLibraryAsync;
const imageHelperMock = jest.requireMock('@/lib/image') as { downscaleForUpload: jest.Mock };
const mockDownscaleForUpload = imageHelperMock.downscaleForUpload;

const consent = { adultConfirmed: true, ownershipConfirmed: true, aiConsent: true };
const validFile = {
  exists: true,
  uri: BODY_AVATAR_ORIGINAL_PATH,
  isDirectory: false,
  size: 128,
  modificationTime: 1,
};

describe('generateBodyAvatar transport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInfoAsync.mockResolvedValue(validFile);
    mockReadAsStringAsync.mockRejectedValue(new Error('no manifest'));
    mockReadDirectoryAsync.mockResolvedValue([]);
    mockDeleteAsync.mockResolvedValue(undefined);
    mockCopyAsync.mockResolvedValue(undefined);
    mockMakeDirectoryAsync.mockResolvedValue(undefined);
    mockMoveAsync.mockResolvedValue(undefined);
    mockWriteAsStringAsync.mockResolvedValue(undefined);
    mockManipulateAsync.mockResolvedValue({ uri: 'file:///cache/body-avatar.png', width: 896, height: 1152 });
    mockCancelAsync.mockResolvedValue(undefined);
    mockCreateUploadTask.mockReturnValue({ uploadAsync: mockUploadAsync, cancelAsync: mockCancelAsync });
    mockLaunchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: [] });
    mockDownscaleForUpload.mockResolvedValue('file:///cache/body-avatar-source.jpg');
  });

  it('stages a revisioned preview and publishes it only after explicit activation', async () => {
    const image =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8rAAAAAASUVORK5CYII=';
    mockUploadAsync.mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({ mimeType: 'image/png', image }),
    });

    const result = await generateBodyAvatar('https://avatar.example/', {
      outfit: 'sport_top',
      consent,
    });

    expect(mockCreateUploadTask).toHaveBeenCalledWith(
      'https://avatar.example/body-avatar',
      BODY_AVATAR_ORIGINAL_PATH,
      expect.objectContaining({
        httpMethod: 'POST',
        uploadType: 1,
        fieldName: 'file',
        mimeType: 'image/jpeg',
        parameters: {
          outfit: 'sport_top',
          adultConfirmed: 'true',
          ownershipConfirmed: 'true',
          aiConsent: 'true',
        },
      }),
    );
    expect(result.manifest.generationRevision).toBe(1);
    expect(result.manifest.atlasPath).toMatch(/atlas-r1\.png$/);
    expect(result.pendingAtlasPath).toMatch(/pending-r1\.png$/);
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      expect.stringMatching(/atlas-input-\d+\.png$/),
      image,
      { encoding: 'base64' },
    );
    expect(mockWriteAsStringAsync).not.toHaveBeenCalledWith(
      expect.stringMatching(/manifest\.json\.\d+\.tmp$/),
      expect.any(String),
    );

    await activateBodyAvatarGeneration(result);

    expect(mockMoveAsync).toHaveBeenCalledWith({
      from: result.pendingAtlasPath,
      to: result.manifest.atlasPath,
    });
    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      expect.stringMatching(/manifest\.json\.\d+\.tmp$/),
      expect.stringContaining('"generationRevision":1'),
    );
  });

  it('rejects a decoded image that ignores the requested atlas ratio', async () => {
    const image =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8rAAAAAASUVORK5CYII=';
    mockUploadAsync.mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({ mimeType: 'image/png', image }),
    });
    mockManipulateAsync.mockResolvedValueOnce({ uri: 'file:///cache/square.png', width: 1024, height: 1024 });

    await expect(
      generateBodyAvatar('https://avatar.example', { outfit: 'sport_top', consent }),
    ).rejects.toEqual(expect.objectContaining<Partial<BodyAvatarError>>({ code: 'server' }));
  });

  it('cancels the native upload when the caller aborts', async () => {
    let rejectUpload: ((reason: Error) => void) | null = null;
    mockUploadAsync.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectUpload = reject;
        }),
    );
    mockCancelAsync.mockImplementation(async () => {
      rejectUpload?.(new Error('cancelled by test'));
    });
    const controller = new AbortController();
    const pending = generateBodyAvatar('https://avatar.example', {
      outfit: 'compression',
      consent,
      signal: controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toEqual(expect.objectContaining<Partial<BodyAvatarError>>({ code: 'cancelled' }));
    expect(mockCancelAsync).toHaveBeenCalledTimes(1);
    expect(BODY_AVATAR_TIMEOUT_MS).toBe(60_000);
  });

  it('keeps the current active atlas when a replacement photo is only selected', async () => {
    const activeAtlasPath = `${BODY_AVATAR_DIRECTORY}atlas-r4.png`;
    mockLaunchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///library/new-photo.jpg', mimeType: 'image/jpeg' }],
    });
    mockReadAsStringAsync.mockResolvedValue(
      JSON.stringify({
        schemaVersion: 1,
        generationRevision: 4,
        originalPath: BODY_AVATAR_ORIGINAL_PATH,
        atlasPath: activeAtlasPath,
        mimeType: 'image/png',
        outfit: 'compression',
        selectedAt: '2026-07-01T00:00:00.000Z',
        generatedAt: '2026-07-01T00:01:00.000Z',
      }),
    );
    mockReadDirectoryAsync.mockResolvedValue(['atlas-r3.png', 'atlas-r4.png']);

    await expect(pickAndStoreBodyAvatarPhoto()).resolves.toBe(BODY_AVATAR_ORIGINAL_PATH);

    expect(mockWriteAsStringAsync).toHaveBeenCalledWith(
      expect.stringMatching(/manifest\.json\.\d+\.tmp$/),
      expect.stringContaining(`"atlasPath":"${activeAtlasPath}"`),
    );
    expect(mockDeleteAsync).not.toHaveBeenCalledWith(activeAtlasPath, { idempotent: true });
    expect(mockDeleteAsync).toHaveBeenCalledWith(`${BODY_AVATAR_DIRECTORY}atlas-r3.png`, { idempotent: true });
  });

  it('deletes both the sportswear files and retired Evolution photo files', async () => {
    await deleteBodyAvatarLocalFiles();

    expect(mockDeleteAsync).toHaveBeenCalledWith(LEGACY_EVOLUTION_ORIGINAL_PATH, { idempotent: true });
    expect(mockDeleteAsync).toHaveBeenCalledWith(LEGACY_EVOLUTION_RESULT_PATH, { idempotent: true });
  });

  it('discards an unapproved preview without publishing its manifest', async () => {
    const image =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8rAAAAAASUVORK5CYII=';
    mockUploadAsync.mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({ mimeType: 'image/png', image }),
    });
    const generated = await generateBodyAvatar('https://avatar.example', { outfit: 'sleeveless', consent });

    await discardBodyAvatarGeneration(generated);

    expect(mockDeleteAsync).toHaveBeenCalledWith(generated.pendingAtlasPath, { idempotent: true });
    expect(mockWriteAsStringAsync).not.toHaveBeenCalledWith(
      expect.stringMatching(/manifest\.json\.\d+\.tmp$/),
      expect.any(String),
    );
  });
});
