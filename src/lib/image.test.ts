import { downscaleForUpload } from './image';

const mockManipulateAsync = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
  SaveFormat: { JPEG: 'jpeg' },
}));

describe('downscaleForUpload', () => {
  beforeEach(() => mockManipulateAsync.mockReset());

  it('returns only the resized JPEG produced for upload', async () => {
    mockManipulateAsync.mockResolvedValue({ uri: 'file:///cache/reduced.jpg' });

    await expect(downscaleForUpload('file:///photos/original.heic')).resolves.toBe(
      'file:///cache/reduced.jpg',
    );
    expect(mockManipulateAsync).toHaveBeenCalledWith(
      'file:///photos/original.heic',
      [{ resize: { width: 1024 } }],
      { compress: 0.7, format: 'jpeg' },
    );
  });

  it('does not fall back to uploading the original when preparation fails', async () => {
    mockManipulateAsync.mockRejectedValue(new Error('decode failed'));

    await expect(downscaleForUpload('file:///photos/original.heic')).rejects.toThrow(
      'decode failed',
    );
  });
});
