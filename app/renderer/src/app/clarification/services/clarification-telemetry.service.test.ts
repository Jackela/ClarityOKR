import { TestBed } from '@angular/core/testing';
import { ClarificationTelemetryService } from './clarification-telemetry.service';
import { ClarificationStateMachine } from './clarification-state-machine.service';
import { Logger } from '../../core/services/logger.service';
import { TelemetryService } from '../../services/telemetry.service';
import { TELEMETRY_CONFIG_KEY, TELEMETRY_OPT_OUT_KEY } from './clarification-telemetry.config';

describe('Actual clarification telemetry privacy and batching', () => {
  let state: ClarificationStateMachine;
  let telemetry: TelemetryService;
  let service: ClarificationTelemetryService;
  const step = { stepId: 'goal', stepName: 'Goal', stepIndex: 0, totalSteps: 2 };
  function create() {
    return TestBed.runInInjectionContext(() => new ClarificationTelemetryService(new Logger()));
  }
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    state = new ClarificationStateMachine(new Logger());
    telemetry = new TelemetryService();
    TestBed.configureTestingModule({
      providers: [
        { provide: ClarificationStateMachine, useValue: state },
        { provide: TelemetryService, useValue: telemetry },
      ],
    });
    service = create();
  });
  afterEach(() => {
    service.ngOnDestroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('drops queued data on opt-out and honors persisted privacy choices', () => {
    service.trackStepView(step);
    expect(service.pendingEventCount()).toBe(1);
    service.optOut();
    expect(service.isEnabled()).toBe(false);
    expect(service.getOptOutStatus()).toBe(true);
    expect(service.getPendingEventCount()).toBe(0);
    service.trackOptionSelect({
      promptId: 'goal',
      optionId: 'speed',
      optionLabel: 'Speed',
      selectionIndex: 0,
    });
    service.trackCompletion(true);
    service.trackDropOff();
    service.trackTiming('request', 10);
    service.trackError('private');
    service.trackStepView(step);
    expect(telemetry.snapshot().counters).toEqual({});
    const reopened = create();
    expect(reopened.getOptOutStatus()).toBe(true);
    reopened.ngOnDestroy();
    expect(localStorage.getItem(TELEMETRY_OPT_OUT_KEY)).toBe('true');
    service.optIn();
    expect(localStorage.getItem(TELEMETRY_OPT_OUT_KEY)).toBeNull();
    expect(service.isEnabled()).toBe(true);
  });

  it('batches step and answer events, preserves timing and flushes on completion', () => {
    const batches: unknown[] = [];
    const listener = (event: Event) => batches.push((event as CustomEvent).detail);
    window.addEventListener('clarityokr:telemetry:batch', listener);
    state.start('Goal');
    state.setSessionId('session');
    service.trackStepView(step);
    jest.advanceTimersByTime(20);
    service.trackStepView({ ...step, stepId: 'owner' });
    service.trackOptionSelect({
      promptId: 'goal',
      optionId: 'speed',
      optionLabel: 'Speed',
      selectionIndex: 0,
    });
    service.trackCompletion(true);
    expect(service.getPendingEventCount()).toBe(0);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      events: [
        { type: 'step_view', sessionId: 'session', payload: step },
        { type: 'step_view', payload: { previousStepId: 'goal', timeSpentMs: 20 } },
        { type: 'option_select', payload: { optionId: 'speed' } },
        { type: 'completion', payload: { success: true, totalTimeMs: 20 } },
      ],
    });
    expect(telemetry.snapshot().counters).toEqual({
      'clarification:step_view:success': 2,
      'clarification:option_select:success': 1,
      'clarification:completion:success': 1,
    });
    window.removeEventListener('clarityokr:telemetry:batch', listener);
  });

  it('flushes at a configured threshold and interval, tracks errors and timeouts', () => {
    service.updateConfig({ batchSizeThreshold: 2 });
    service.trackError(new Error('first'));
    service.trackError('second', { operation: 'draft' });
    expect(service.pendingEventCount()).toBe(0);
    expect(telemetry.snapshot().counters['clarification:error:success']).toBe(2);
    service.trackTiming('request', 30001);
    service.trackTiming('request', 30000);
    expect(telemetry.snapshot().counters).toMatchObject({
      'clarification:timeout': 1,
      'clarification:success': 1,
    });
    service.trackStepView(step);
    jest.advanceTimersByTime(30000);
    expect(service.getPendingEventCount()).toBe(0);
    service.trackDropOff('unknown');
    expect(telemetry.snapshot().counters['clarification:drop_off:success']).toBe(1);
    service.updateConfig({ collectPerformanceMetrics: false });
    service.trackTiming('ignored', 10);
    service.updateConfig({ enabled: false });
    expect(service.isEnabled()).toBe(false);
    expect(JSON.parse(localStorage.getItem(TELEMETRY_CONFIG_KEY) ?? '{}')).toMatchObject({
      enabled: false,
    });
  });

  it('applies sampling, invalid stored configuration fallback and transport error containment', () => {
    service.updateConfig({ sampleRate: 0 });
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    service.trackStepView(step);
    expect(service.getPendingEventCount()).toBe(0);
    localStorage.setItem(TELEMETRY_CONFIG_KEY, '{invalid');
    const reopened = create();
    expect(reopened.getConfig().sampleRate).toBe(1);
    jest.spyOn(telemetry, 'recordCall').mockImplementation(() => {
      throw new Error('transport');
    });
    reopened.trackError('failure');
    expect(() => reopened.flushEvents()).not.toThrow();
    expect(reopened.getPendingEventCount()).toBe(0);
    reopened.ngOnDestroy();
  });
});
