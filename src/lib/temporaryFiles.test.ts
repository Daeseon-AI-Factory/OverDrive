import { deleteAppCacheFile, deleteOwnedTemporaryFile, isAppCacheFile } from './temporaryFiles';

describe('temporary file cleanup', () => {
  it('recognizes only files inside the app cache root', () => {
    expect(isAppCacheFile('file:///app/Library/Caches/ImagePicker/meal.jpg', 'file:///app/Library/Caches/')).toBe(true);
    expect(isAppCacheFile('file:///photos/original.jpg', 'file:///app/Library/Caches/')).toBe(false);
  });

  it('never deletes a picker URI outside the app cache', async () => {
    const remove = jest.fn(async () => undefined);
    await expect(deleteAppCacheFile('file:///photos/original.jpg', 'file:///app/cache/', remove)).resolves.toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes app-owned recordings idempotently and reports failures', async () => {
    const remove = jest.fn(async () => undefined);
    await expect(deleteOwnedTemporaryFile('file:///app/cache/recording.m4a', remove)).resolves.toBe(true);
    expect(remove).toHaveBeenCalledWith('file:///app/cache/recording.m4a', { idempotent: true });

    await expect(
      deleteOwnedTemporaryFile('file:///app/cache/recording.m4a', async () => {
        throw new Error('busy');
      }),
    ).resolves.toBe(false);
  });
});
