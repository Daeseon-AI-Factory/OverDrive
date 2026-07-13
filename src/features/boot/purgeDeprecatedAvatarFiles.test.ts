import { purgeDeprecatedAvatarFiles } from './purgeDeprecatedAvatarFiles';

describe('purgeDeprecatedAvatarFiles', () => {
  it('idempotently removes every deprecated photo-avatar path', async () => {
    const remove = jest.fn(async () => undefined);

    await expect(purgeDeprecatedAvatarFiles('file:///documents/', remove)).resolves.toBe(true);
    expect(remove.mock.calls).toEqual([
      ['file:///documents/body-avatar/', { idempotent: true }],
      ['file:///documents/evolution-original.jpg', { idempotent: true }],
      ['file:///documents/evolution-evolved.jpg', { idempotent: true }],
    ]);
  });

  it('reports failure so boot retries on the next launch', async () => {
    const remove = jest.fn(async (uri: string) => {
      if (uri.endsWith('evolution-original.jpg')) throw new Error('disk busy');
    });

    await expect(purgeDeprecatedAvatarFiles('file:///documents/', remove)).resolves.toBe(false);
  });
});
