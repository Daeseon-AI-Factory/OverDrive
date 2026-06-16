import { withTimeout } from './async';

describe('withTimeout', () => {
  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });

  it('propagates the original rejection (not a timeout) when the promise fails fast', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });

  it('rejects with a labelled timeout error when the promise is too slow', async () => {
    const slow = new Promise<void>((resolve) => setTimeout(resolve, 50));
    await expect(withTimeout(slow, 5, 'upload')).rejects.toThrow(/upload timed out/);
  });
});
