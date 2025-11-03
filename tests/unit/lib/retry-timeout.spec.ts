import { retryOnce, withTimeout } from '../../../app/renderer/src/app/lib/retry-timeout';

describe('retry-timeout helpers', () => {
  it('withTimeout rejects when the operation exceeds the limit', async () => {
    const p = new Promise<void>((resolve) => setTimeout(resolve, 50));
    await expect(withTimeout(p, 10)).rejects.toThrow(/timed out/i);
  });

  it('retryOnce returns first result when valid', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return { ok: true } as const;
    };
    const res = await retryOnce(fn, (x) => x.ok === true);
    expect(res.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it('retryOnce retries once on failure then succeeds', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return { ok: true } as const;
    };
    const res = await retryOnce(fn, (x) => x.ok === true);
    expect(res.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it('retryOnce retries once on invalid response then throws', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      return { ok: false } as const;
    };
    await expect(retryOnce(fn, (x) => x.ok === true)).rejects.toThrow(/validation/i);
    expect(calls).toBe(2);
  });
});

