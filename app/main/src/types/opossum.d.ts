// Type declaration for opossum
declare module 'opossum' {
  interface CircuitBreakerOptions {
    failureThreshold?: number;
    resetTimeout?: number;
    timeout?: number;
    errorThresholdPercentage?: number;
    rollingCountTimeout?: number;
    rollingCountBuckets?: number;
    name?: string;
  }

  interface CircuitBreakerStats {
    failures: number;
    successes: number;
    rejects: number;
    opens: number;
    halfOpens?: number;
  }

  class CircuitBreaker {
    constructor(action: (...args: unknown[]) => Promise<unknown>, options: CircuitBreakerOptions);

    readonly opened: boolean;
    readonly halfOpen: boolean;
    readonly stats: CircuitBreakerStats;

    on(event: string, listener: (...args: unknown[]) => void): void;
    fire(...args: unknown[]): Promise<unknown>;
    open(): void;
    close(): void;
    fallback<T>(fn: (...args: unknown[]) => T | Promise<T>): void;
  }

  export default CircuitBreaker;
}
