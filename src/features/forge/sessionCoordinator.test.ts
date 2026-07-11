import { coordinateSessionStart } from './sessionCoordinator';

describe('coordinateSessionStart', () => {
  it('returns the active session without invoking a starter', async () => {
    const start = jest.fn(async () => 'new');
    await expect(coordinateSessionStart('silent', () => 'open', start)).resolves.toBe('open');
    expect(start).not.toHaveBeenCalled();
  });

  it('shares one start across different callers and starter closures', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const firstStart = jest.fn(async () => {
      await gate;
      return 'shared';
    });
    const secondStart = jest.fn(async () => 'duplicate');

    const first = coordinateSessionStart('silent', () => null, firstStart);
    const second = coordinateSessionStart('silent', () => null, secondStart);
    release();

    await expect(Promise.all([first, second])).resolves.toEqual(['shared', 'shared']);
    expect(firstStart).toHaveBeenCalledTimes(1);
    expect(secondStart).not.toHaveBeenCalled();
  });

  it('lets a concurrent save suppress an explicit entry ritual', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let silentAtCommit = false;
    const start = jest.fn(async (shouldStartSilently: () => boolean) => {
      await gate;
      silentAtCommit = shouldStartSilently();
      return 'session-1';
    });

    const explicit = coordinateSessionStart('explicit', () => null, start);
    const saveDriven = coordinateSessionStart('silent', () => null, jest.fn(async () => 'duplicate'));
    release();

    await expect(Promise.all([explicit, saveDriven])).resolves.toEqual(['session-1', 'session-1']);
    expect(silentAtCommit).toBe(true);
  });

  it('clears a failed request so a later start can retry', async () => {
    await expect(
      coordinateSessionStart('silent', () => null, async () => {
        throw new Error('db unavailable');
      }),
    ).rejects.toThrow('db unavailable');

    await expect(coordinateSessionStart('silent', () => null, async () => 'retry')).resolves.toBe('retry');
  });
});
