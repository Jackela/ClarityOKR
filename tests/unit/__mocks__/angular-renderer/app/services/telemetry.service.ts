import { Injectable } from '@angular/core';

type Outcome = 'success' | 'error' | 'timeout' | 'invalid';

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private counters = new Map<string, number>();
  private latencies: number[] = [];

  recordCall(operation: string, outcome: Outcome, ms: number): void {
    this.bump(`${operation}:${outcome}`);
    this.latencies.push(ms);
    if (this.latencies.length > 1000) this.latencies.shift();
  }

  private bump(key: string): void {
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1);
  }

  snapshot(): { counters: Record<string, number>; p50: number; p90: number } {
    const entries = Array.from(this.counters.entries());
    const counters = Object.fromEntries(entries);
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const q = (p: number) =>
      sorted.length ? sorted[Math.floor((p / 100) * (sorted.length - 1))] : 0;
    return { counters, p50: q(50), p90: q(90) };
  }
}
