export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => void,
): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          onTimeout && onTimeout();
        } finally {
          reject(new Error('Operation timed out'));
        }
      }, ms);
      promise.finally(() => clearTimeout(timer)).catch(() => clearTimeout(timer));
    }),
  ]);
}

export async function retryOnce<T>(fn: () => Promise<T>, validate?: (x: T) => boolean): Promise<T> {
  try {
    const first = await fn();
    if (!validate || validate(first)) return first;
  } catch {
    /* proceed to second attempt */
  }
  const second = await fn();
  if (validate && !validate(second)) {
    throw new Error('Validation failed after retry');
  }
  return second;
}
