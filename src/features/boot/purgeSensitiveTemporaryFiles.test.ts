import { purgeSensitiveTemporaryFiles } from './purgeSensitiveTemporaryFiles';

describe('purgeSensitiveTemporaryFiles', () => {
  it('removes only the voice and selected-photo cache directories', async () => {
    const remove = jest.fn(async () => undefined);

    await expect(purgeSensitiveTemporaryFiles('file:///cache/', remove)).resolves.toBe(true);
    expect(remove.mock.calls).toEqual([
      ['file:///cache/ExpoAudio/', { idempotent: true }],
      ['file:///cache/ImagePicker/', { idempotent: true }],
      ['file:///cache/ImageManipulator/', { idempotent: true }],
    ]);
  });
});
