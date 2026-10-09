import { TelemetryService } from './telemetry.service';

describe('TelemetryService actual latency window', () => {
  it('reports an empty distribution and independent outcome counters', () => {
    const service = new TelemetryService();
    expect(service.snapshot()).toEqual({ counters: {}, p50: 0, p90: 0 });
    service.recordCall('draft', 'success', 20);
    service.recordCall('draft', 'error', 100);
    service.recordCall('draft', 'success', 40);
    service.recordCall('question', 'timeout', 200);
    expect(service.snapshot()).toEqual({
      counters: {
        'draft:success': 2,
        'draft:error': 1,
        'question:timeout': 1,
      },
      p50: 40,
      p90: 100,
    });
    expect(service.snapshot().counters).not.toBe(service.snapshot().counters);
  });

  it('evicts the oldest latency while preserving lifetime counters', () => {
    const service = new TelemetryService();
    service.recordCall('draft', 'invalid', 100000);
    for (let index = 1; index <= 1000; index++) service.recordCall('draft', 'success', index);
    expect(service.snapshot()).toEqual({
      counters: {
        'draft:invalid': 1,
        'draft:success': 1000,
      },
      p50: 500,
      p90: 900,
    });
  });
});
