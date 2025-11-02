import { TelemetryService } from '../../../app/renderer/src/app/services/telemetry.service';

describe('TelemetryService', () => {
  it('records outcomes and computes basic percentiles', () => {
    const t = new TelemetryService();
    t.recordCall('next-question', 'success', 120);
    t.recordCall('next-question', 'error', 300);
    t.recordCall('draft', 'timeout', 1000);
    const snap = t.snapshot();
    expect(snap.counters['next-question:success']).toBe(1);
    expect(snap.counters['next-question:error']).toBe(1);
    expect(snap.counters['draft:timeout']).toBe(1);
    expect(snap.p50).toBeGreaterThan(0);
    expect(snap.p90).toBeGreaterThan(0);
  });
});

