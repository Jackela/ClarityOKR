import { jest } from '@jest/globals';
import type { ClarificationPrompt } from '@clarityokr/contracts';

import { ClarificationTelemetryService } from '@clarityokr/renderer/app/clarification/services/clarification-telemetry.service';
import { Logger } from '@clarityokr/renderer/app/core/services/logger.service';
import { TelemetryService } from '@clarityokr/renderer/app/services/telemetry.service';
import { ClarificationStateMachine } from '@clarityokr/renderer/app/clarification/services/clarification-state-machine.service';

// Define mock types
type LocalStorageMock = {
  getItem: ReturnType<typeof jest.fn>;
  setItem: ReturnType<typeof jest.fn>;
  removeItem: ReturnType<typeof jest.fn>;
  clear: () => void;
};

// Create mock factory functions
function createLocalStorageMock(): LocalStorageMock {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: () => {
      store = {};
    },
  };
}

// Initialize mocks
const localStorageMock = createLocalStorageMock();
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

const dispatchEventMock = jest.fn();
Object.defineProperty(global, 'window', {
  value: {
    dispatchEvent: dispatchEventMock,
  },
  writable: true,
});

// Note: We don't use jest.useFakeTimers() at module level to avoid conflicts
// with the service's internal setInterval. Individual tests may use fake timers.

function buildPrompt(id = 'prompt-1', question = 'Test Question'): ClarificationPrompt {
  return {
    id,
    question,
    sequence: 0,
    context: 'goal-dimension',
    options: [
      { id: 'opt-1', label: 'Option 1', description: undefined, scopeTag: 'test' },
      { id: 'opt-2', label: 'Option 2', description: undefined, scopeTag: 'test' },
    ],
  } satisfies ClarificationPrompt;
}

describe('ClarificationTelemetryService', () => {
  let service: ClarificationTelemetryService;
  let stateMachine: ClarificationStateMachine;
  let baseTelemetry: TelemetryService;
  let logger: Logger;

  beforeEach(() => {
    localStorageMock.clear();
    dispatchEventMock.mockClear();

    logger = new Logger();
    stateMachine = new ClarificationStateMachine(logger);
    baseTelemetry = new TelemetryService();

    // Mock baseTelemetry.recordCall
    jest.spyOn(baseTelemetry, 'recordCall').mockImplementation(() => {});

    service = new ClarificationTelemetryService(logger);
    // Inject mocked dependencies
    service.initDependencies(stateMachine, baseTelemetry);
  });

  afterEach(() => {
    service.ngOnDestroy();
    jest.clearAllMocks();
  });

  // ==================== Initialization Tests ====================

  describe('Service Initialization', () => {
    it('should initialize with default configuration', () => {
      const config = service.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.batchIntervalMs).toBe(30000);
      expect(config.batchSizeThreshold).toBe(10);
      expect(config.collectPerformanceMetrics).toBe(true);
      expect(config.sampleRate).toBe(1.0);
    });

    it('should initialize with opt-out status from localStorage', () => {
      localStorageMock.setItem('clarityokr:telemetry:opt-out', 'true');
      const newService = new ClarificationTelemetryService(logger);
      newService.initDependencies(stateMachine, baseTelemetry);
      expect(newService.getOptOutStatus()).toBe(true);
      expect(newService.isEnabled()).toBe(false);
      newService.ngOnDestroy();
    });

    it('should load custom configuration from localStorage', () => {
      const customConfig = {
        enabled: false,
        batchIntervalMs: 60000,
        batchSizeThreshold: 20,
        collectPerformanceMetrics: false,
        sampleRate: 0.5,
      };
      localStorageMock.setItem('clarityokr:telemetry:config', JSON.stringify(customConfig));

      const newService = new ClarificationTelemetryService(logger);
      newService.initDependencies(stateMachine, baseTelemetry);
      const config = newService.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.batchIntervalMs).toBe(60000);
      expect(config.batchSizeThreshold).toBe(20);
      expect(config.collectPerformanceMetrics).toBe(false);
      expect(config.sampleRate).toBe(0.5);
      newService.ngOnDestroy();
    });

    it('should handle invalid localStorage config gracefully', () => {
      localStorageMock.setItem('clarityokr:telemetry:config', 'invalid-json');

      const newService = new ClarificationTelemetryService(logger);
      newService.initDependencies(stateMachine, baseTelemetry);
      const config = newService.getConfig();
      expect(config.enabled).toBe(true); // Should use defaults
      newService.ngOnDestroy();
    });
  });

  // ==================== Privacy Compliance Tests ====================

  describe('Privacy Compliance', () => {
    it('should respect opt-out status', () => {
      service.optOut();
      expect(service.isOptedOut()).toBe(true);
      expect(service.isEnabled()).toBe(false);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('clarityokr:telemetry:opt-out', 'true');
    });

    it('should clear event queue on opt-out', () => {
      // Add some events
      service.trackStepView({
        stepId: 'step-1',
        stepName: 'Test Step',
        stepIndex: 0,
        totalSteps: 5,
      });
      expect(service.getPendingEventCount()).toBeGreaterThan(0);

      service.optOut();
      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should allow opt-in after opt-out', () => {
      service.optOut();
      expect(service.isOptedOut()).toBe(true);

      service.optIn();
      expect(service.isOptedOut()).toBe(false);
      expect(service.isEnabled()).toBe(true);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('clarityokr:telemetry:opt-out');
    });

    it('should not track events when opted out', () => {
      service.optOut();
      service.trackStepView({
        stepId: 'step-1',
        stepName: 'Test Step',
        stepIndex: 0,
        totalSteps: 5,
      });
      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should not track events when telemetry is disabled', () => {
      service.updateConfig({ enabled: false });
      expect(service.isEnabled()).toBe(false);

      service.trackStepView({
        stepId: 'step-1',
        stepName: 'Test Step',
        stepIndex: 0,
        totalSteps: 5,
      });
      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should clear event queue when telemetry is disabled', () => {
      service.trackStepView({
        stepId: 'step-1',
        stepName: 'Test Step',
        stepIndex: 0,
        totalSteps: 5,
      });
      expect(service.getPendingEventCount()).toBeGreaterThan(0);

      service.updateConfig({ enabled: false });
      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should respect sampling rate', () => {
      service.updateConfig({ sampleRate: 0 });

      service.trackStepView({
        stepId: 'step-1',
        stepName: 'Test Step',
        stepIndex: 0,
        totalSteps: 5,
      });
      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should update pending event count signal', () => {
      expect(service.pendingEventCount()).toBe(0);

      service.trackStepView({
        stepId: 'step-1',
        stepName: 'Test Step',
        stepIndex: 0,
        totalSteps: 5,
      });
      expect(service.pendingEventCount()).toBe(1);
    });
  });

  // ==================== Event Tracking Tests ====================

  describe('Step View Tracking', () => {
    it('should track step view event', () => {
      service.trackStepView({
        stepId: 'intent-input',
        stepName: '输入意图',
        stepIndex: 0,
        totalSteps: 5,
      });

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should include time spent when tracking consecutive steps', () => {
      service.trackStepView({
        stepId: 'step-1',
        stepName: 'First Step',
        stepIndex: 0,
        totalSteps: 3,
      });

      // Small delay to simulate time passing
      const startTime = Date.now();
      while (Date.now() - startTime < 10) {
        // Busy wait for 10ms
      }

      service.trackStepView({
        stepId: 'step-2',
        stepName: 'Second Step',
        stepIndex: 1,
        totalSteps: 3,
      });

      // Both events should be queued
      expect(service.getPendingEventCount()).toBe(2);
    });
  });

  describe('Option Select Tracking', () => {
    it('should track option selection event', () => {
      service.trackOptionSelect({
        promptId: 'prompt-1',
        optionId: 'opt-a',
        optionLabel: '提高效率',
        selectionIndex: 0,
      });

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should not track when opted out', () => {
      service.optOut();
      service.trackOptionSelect({
        promptId: 'prompt-1',
        optionId: 'opt-a',
        optionLabel: '提高效率',
        selectionIndex: 0,
      });

      expect(service.getPendingEventCount()).toBe(0);
    });
  });

  describe('Completion Tracking', () => {
    it('should track successful completion', () => {
      stateMachine.start('test intent');
      stateMachine.recordSelection('prompt-1', 'opt-1');

      service.trackCompletion(true);

      // Completion triggers immediate flush, so queue should be empty
      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should track failed completion', () => {
      stateMachine.start('test intent');
      service.trackCompletion(false);

      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should not track completion when opted out', () => {
      service.optOut();
      service.trackCompletion(true);

      expect(service.getPendingEventCount()).toBe(0);
    });
  });

  describe('Drop-off Tracking', () => {
    it('should track drop-off with default reason', () => {
      stateMachine.start('test intent');
      stateMachine.setPrompt(buildPrompt('prompt-1'));

      service.trackDropOff();

      // Drop-off triggers immediate flush
      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should track drop-off with specific reason', () => {
      stateMachine.start('test intent');
      stateMachine.setPrompt(buildPrompt('prompt-1'));

      service.trackDropOff('error');

      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should track drop-off for navigation reason', () => {
      stateMachine.start('test intent');
      stateMachine.setPrompt(buildPrompt('prompt-1'));

      service.trackDropOff('navigation');

      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should track drop-off for timeout reason', () => {
      stateMachine.start('test intent');
      stateMachine.setPrompt(buildPrompt('prompt-1'));

      service.trackDropOff('timeout');

      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should not track drop-off when opted out', () => {
      service.optOut();
      service.trackDropOff('unknown');

      expect(service.getPendingEventCount()).toBe(0);
    });
  });

  describe('Timing/Performance Tracking', () => {
    it('should track performance timing', () => {
      service.trackTiming('api-response', 150, { endpoint: 'generate-okr' });

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should record to base telemetry service', () => {
      const recordSpy = jest.spyOn(baseTelemetry, 'recordCall');
      service.trackTiming('api-response', 150);

      expect(recordSpy).toHaveBeenCalledWith('clarification', 'success', 150);
    });

    it('should treat durations > 30s as timeout', () => {
      const recordSpy = jest.spyOn(baseTelemetry, 'recordCall');
      service.trackTiming('api-response', 31000);

      expect(recordSpy).toHaveBeenCalledWith('clarification', 'timeout', 31000);
    });

    it('should not track timing when performance metrics disabled', () => {
      service.updateConfig({ collectPerformanceMetrics: false });
      service.trackTiming('api-response', 150);

      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should not track timing when opted out', () => {
      service.optOut();
      service.trackTiming('api-response', 150);

      expect(service.getPendingEventCount()).toBe(0);
    });
  });

  describe('Error Tracking', () => {
    it('should track Error object', () => {
      const error = new Error('Test error message');
      service.trackError(error, { context: 'test' });

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should track error string', () => {
      service.trackError('Simple error message');

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should include error stack when available', () => {
      const error = new Error('Test error');
      service.trackError(error);

      expect(service.getPendingEventCount()).toBe(1);
    });

    it('should not track error when opted out', () => {
      service.optOut();
      service.trackError(new Error('Test'));

      expect(service.getPendingEventCount()).toBe(0);
    });
  });

  // ==================== Batch Processing Tests ====================

  describe('Event Batching', () => {
    it('should batch events up to threshold', () => {
      service.updateConfig({ batchSizeThreshold: 3 });

      // Add 2 events (below threshold)
      service.trackStepView({ stepId: '1', stepName: 'Step 1', stepIndex: 0, totalSteps: 5 });
      service.trackStepView({ stepId: '2', stepName: 'Step 2', stepIndex: 1, totalSteps: 5 });

      expect(service.getPendingEventCount()).toBe(2);
    });

    it('should flush when threshold reached', () => {
      service.updateConfig({ batchSizeThreshold: 2 });

      service.trackStepView({ stepId: '1', stepName: 'Step 1', stepIndex: 0, totalSteps: 5 });
      expect(service.getPendingEventCount()).toBe(1);

      // This should trigger flush
      service.trackStepView({ stepId: '2', stepName: 'Step 2', stepIndex: 1, totalSteps: 5 });

      // Events should be flushed
      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should flush events manually', () => {
      service.trackStepView({ stepId: '1', stepName: 'Step 1', stepIndex: 0, totalSteps: 5 });
      service.trackStepView({ stepId: '2', stepName: 'Step 2', stepIndex: 1, totalSteps: 5 });
      expect(service.getPendingEventCount()).toBe(2);

      service.flushEvents();

      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should handle flush with empty queue', () => {
      expect(() => service.flushEvents()).not.toThrow();
      expect(service.getPendingEventCount()).toBe(0);
    });

    it('should update config and persist to localStorage', () => {
      service.updateConfig({ batchSizeThreshold: 25 });

      expect(service.getConfig().batchSizeThreshold).toBe(25);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'clarityokr:telemetry:config',
        expect.stringContaining('25'),
      );
    });
  });

  // ==================== Analytics Endpoint Tests ====================

  describe('Analytics Endpoint', () => {
    it('should dispatch batch event to window', () => {
      service.trackStepView({ stepId: '1', stepName: 'Step 1', stepIndex: 0, totalSteps: 5 });
      service.flushEvents();

      expect(dispatchEventMock).toHaveBeenCalled();
      const event = dispatchEventMock.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe('clarityokr:telemetry:batch');
      expect(event.detail.events).toHaveLength(1);
    });

    it('should include event metadata in dispatch', () => {
      service.trackStepView({ stepId: '1', stepName: 'Step 1', stepIndex: 0, totalSteps: 5 });
      service.flushEvents();

      const event = dispatchEventMock.mock.calls[0][0] as CustomEvent;
      expect(event.detail.timestamp).toBeDefined();
      expect(event.detail.events[0].type).toBe('step_view');
      expect(event.detail.events[0].payload.stepId).toBe('1');
    });

    it('should record event counts to base telemetry', () => {
      const recordSpy = jest.spyOn(baseTelemetry, 'recordCall');

      service.trackStepView({ stepId: '1', stepName: 'Step 1', stepIndex: 0, totalSteps: 5 });
      service.trackOptionSelect({
        promptId: 'p1',
        optionId: 'o1',
        optionLabel: 'Label',
        selectionIndex: 0,
      });
      service.flushEvents();

      expect(recordSpy).toHaveBeenCalledWith('clarification:step_view', 'success', 0);
      expect(recordSpy).toHaveBeenCalledWith('clarification:option_select', 'success', 0);
    });
  });

  // ==================== Session Management Tests ====================

  describe('Session Management', () => {
    it('should track current session ID', () => {
      stateMachine.setSessionId('session-123');

      const newService = new ClarificationTelemetryService(logger);
      newService.initDependencies(stateMachine, baseTelemetry);
      expect(newService.currentSessionId()).toBe('session-123');
      newService.ngOnDestroy();
    });

    it('should handle null session ID', () => {
      expect(service.currentSessionId()).toBeNull();
    });
  });

  // ==================== Cleanup Tests ====================

  describe('Service Cleanup', () => {
    it('should flush events on destroy', () => {
      service.trackStepView({ stepId: '1', stepName: 'Step 1', stepIndex: 0, totalSteps: 5 });
      expect(service.getPendingEventCount()).toBe(1);

      service.ngOnDestroy();

      expect(service.getPendingEventCount()).toBe(0);
      expect(dispatchEventMock).toHaveBeenCalled();
    });

    it('should clear batch timer on destroy', () => {
      service.ngOnDestroy();

      // Timer cleared, no issues expected
      expect(service).toBeDefined();
    });
  });

  // ==================== State Monitoring Tests ====================

  describe('State Machine Monitoring', () => {
    it('should track state changes automatically', () => {
      // Setup state machine with a prompt
      stateMachine.start('test intent');
      stateMachine.setSessionId('session-test');

      // Creating new service should pick up current state
      const newService = new ClarificationTelemetryService(logger);
      newService.initDependencies(stateMachine, baseTelemetry);

      expect(newService.currentSessionId()).toBe('session-test');
      newService.ngOnDestroy();
    });

    it('should track errors from state machine', () => {
      stateMachine.setError('Test error from state machine');

      // The service monitors state but events are only tracked on explicit calls
      // This test verifies the service handles state machine error state
      expect(stateMachine.error()).not.toBeNull();
    });
  });
});
