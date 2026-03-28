import { Injectable, signal } from '@angular/core';
import type { Logger } from '../../core/services/logger.service';
import { TelemetryService } from '../../services/telemetry.service';
import { ClarificationStateMachine } from './clarification-state-machine.service';

export type TelemetryEventType =
  | 'step_view'
  | 'option_select'
  | 'completion'
  | 'drop_off'
  | 'error'
  | 'timing';

export interface TelemetryEvent {
  id: string;
  type: TelemetryEventType;
  timestamp: number;
  sessionId: string | null;
  payload: Record<string, unknown>;
}

export interface StepViewPayload {
  stepId: string;
  stepName: string;
  stepIndex: number;
  totalSteps: number;
  timeSpentMs?: number;
}

export interface OptionSelectPayload {
  promptId: string;
  optionId: string;
  optionLabel: string;
  selectionIndex: number;
}

export interface CompletionPayload {
  totalSteps: number;
  totalTimeMs: number;
  selectionsCount: number;
  success: boolean;
}

export interface DropOffPayload {
  stepId: string;
  stepName: string;
  timeSpentMs: number;
  selectionsCount: number;
  reason?: 'navigation' | 'error' | 'timeout' | 'unknown';
}

export interface TimingPayload {
  metric: string;
  durationMs: number;
  context?: Record<string, unknown>;
}

export interface TelemetryConfig {
  enabled: boolean;
  batchIntervalMs: number;
  batchSizeThreshold: number;
  collectPerformanceMetrics: boolean;
  sampleRate: number;
}

const DEFAULT_CONFIG: TelemetryConfig = {
  enabled: true,
  batchIntervalMs: 30000,
  batchSizeThreshold: 10,
  collectPerformanceMetrics: true,
  sampleRate: 1.0,
};

const TELEMETRY_OPT_OUT_KEY = 'clarityokr:telemetry:opt-out';
const TELEMETRY_CONFIG_KEY = 'clarityokr:telemetry:config';

@Injectable({ providedIn: 'root' })
export class ClarificationTelemetryService {
  private stateMachine!: ClarificationStateMachine;
  private baseTelemetry!: TelemetryService;
  private logger: Logger;

  private eventQueue: TelemetryEvent[] = [];
  private batchTimer: ReturnType<typeof setInterval> | null = null;
  private sessionStartTime = Date.now();
  private stepStartTime = Date.now();
  private currentStepId: string | null = null;
  private config: TelemetryConfig;

  readonly isOptedOut = signal<boolean>(false);
  readonly pendingEventCount = signal<number>(0);
  readonly currentSessionId = signal<string | null>(null);

  constructor(logger: Logger) {
    this.logger = logger;
    this.config = this.loadConfig();
    this.isOptedOut.set(this.checkOptOutStatus());
    this.initializeBatchTimer();
  }

  // Test helper to inject dependencies after construction
  initDependencies(stateMachine: ClarificationStateMachine, baseTelemetry: TelemetryService): void {
    this.stateMachine = stateMachine;
    this.baseTelemetry = baseTelemetry;
    this.currentSessionId.set(this.stateMachine.sessionId());
    this.setupStateMonitoring();
  }

  ngOnDestroy(): void {
    this.flushEvents();
    this.clearBatchTimer();
  }

  isEnabled(): boolean {
    return this.config.enabled && !this.isOptedOut();
  }

  optOut(): void {
    this.isOptedOut.set(true);
    localStorage.setItem(TELEMETRY_OPT_OUT_KEY, 'true');
    this.eventQueue = [];
    this.pendingEventCount.set(0);
  }

  optIn(): void {
    this.isOptedOut.set(false);
    localStorage.removeItem(TELEMETRY_OPT_OUT_KEY);
  }

  getOptOutStatus(): boolean {
    return this.isOptedOut();
  }

  trackStepView(payload: StepViewPayload): void {
    if (!this.shouldTrack()) return;

    const timeSpentMs = this.currentStepId ? Date.now() - this.stepStartTime : undefined;

    if (this.currentStepId && timeSpentMs) {
      this.trackEvent('step_view', {
        ...payload,
        timeSpentMs,
        previousStepId: this.currentStepId,
      });
    } else {
      this.trackEvent('step_view', payload);
    }

    this.currentStepId = payload.stepId;
    this.stepStartTime = Date.now();
  }

  trackOptionSelect(payload: OptionSelectPayload): void {
    if (!this.shouldTrack()) return;
    this.trackEvent('option_select', payload);
  }

  trackCompletion(success: boolean): void {
    if (!this.shouldTrack() || !this.stateMachine) return;

    const totalTimeMs = Date.now() - this.sessionStartTime;
    const selections = this.stateMachine.selections();

    const payload: CompletionPayload = {
      totalSteps: this.stateMachine.history().length + 1,
      totalTimeMs,
      selectionsCount: Object.keys(selections).length,
      success,
    };

    this.trackEvent('completion', payload);
    this.flushEvents();
  }

  trackDropOff(reason: DropOffPayload['reason'] = 'unknown'): void {
    if (!this.shouldTrack() || !this.stateMachine) return;

    const timeSpentMs = Date.now() - this.sessionStartTime;
    const selections = this.stateMachine.selections();
    const currentPrompt = this.stateMachine.currentPrompt();

    const payload: DropOffPayload = {
      stepId: currentPrompt?.id ?? 'unknown',
      stepName: currentPrompt?.question ?? 'Unknown Step',
      timeSpentMs,
      selectionsCount: Object.keys(selections).length,
      reason,
    };

    this.trackEvent('drop_off', payload);
    this.flushEvents();
  }

  trackTiming(metric: string, durationMs: number, context?: Record<string, unknown>): void {
    if (!this.shouldTrack() || !this.config.collectPerformanceMetrics) return;

    const payload: TimingPayload = {
      metric,
      durationMs,
      context,
    };

    this.trackEvent('timing', payload);
    if (this.baseTelemetry) {
      this.baseTelemetry.recordCall(
        'clarification',
        durationMs > 30000 ? 'timeout' : 'success',
        durationMs,
      );
    }
  }

  trackError(error: Error | string, context?: Record<string, unknown>): void {
    if (!this.shouldTrack()) return;

    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    this.trackEvent('error', {
      message: errorMessage,
      stack: errorStack,
      ...context,
    });
  }

  flushEvents(): void {
    if (this.eventQueue.length === 0) return;

    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];
    this.pendingEventCount.set(0);

    this.sendEvents(eventsToSend);
  }

  getPendingEventCount(): number {
    return this.eventQueue.length;
  }

  updateConfig(config: Partial<TelemetryConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();

    if (!this.config.enabled) {
      this.eventQueue = [];
      this.pendingEventCount.set(0);
    }
  }

  getConfig(): TelemetryConfig {
    return { ...this.config };
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private shouldTrack(): boolean {
    if (!this.config.enabled || this.isOptedOut()) {
      return false;
    }
    if (Math.random() > this.config.sampleRate) {
      return false;
    }
    return true;
  }

  private trackEvent(type: TelemetryEventType, payload: Record<string, unknown>): void {
    const event: TelemetryEvent = {
      id: this.generateEventId(),
      type,
      timestamp: Date.now(),
      sessionId: this.stateMachine?.sessionId() ?? null,
      payload,
    };

    this.eventQueue.push(event);
    this.pendingEventCount.set(this.eventQueue.length);

    if (this.eventQueue.length >= this.config.batchSizeThreshold) {
      this.flushEvents();
    }
  }

  private initializeBatchTimer(): void {
    this.clearBatchTimer();
    this.batchTimer = setInterval(() => {
      this.flushEvents();
    }, this.config.batchIntervalMs);
  }

  private clearBatchTimer(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  private sendEvents(events: TelemetryEvent[]): void {
    if (events.length === 0) return;

    try {
      const typeCounts = events.reduce(
        (acc, event) => {
          acc[event.type] = (acc[event.type] ?? 0) + 1;
          return acc;
        },
        {} as Record<TelemetryEventType, number>,
      );

      if (this.baseTelemetry) {
        Object.entries(typeCounts).forEach(([type, count]) => {
          for (let i = 0; i < count; i++) {
            this.baseTelemetry.recordCall(`clarification:${type}`, 'success', 0);
          }
        });
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('clarityokr:telemetry:batch', {
            detail: { events, timestamp: Date.now() },
          }),
        );
      }
    } catch (error) {
      this.logger.error('[TELEMETRY] Failed to send events', error);
    }
  }

  private setupStateMonitoring(): void {
    if (!this.stateMachine) return;

    const sessionId = this.stateMachine.sessionId();
    if (sessionId !== this.currentSessionId()) {
      this.currentSessionId.set(sessionId);
      this.sessionStartTime = Date.now();
      this.stepStartTime = Date.now();
    }

    const currentPrompt = this.stateMachine.currentPrompt();
    if (currentPrompt && currentPrompt.id !== this.currentStepId) {
      this.trackStepView({
        stepId: currentPrompt.id,
        stepName: currentPrompt.question,
        stepIndex: this.stateMachine.history().length,
        totalSteps: this.stateMachine.history().length + 1,
      });
    }

    const error = this.stateMachine.error();
    if (error) {
      this.trackError(error.message, {
        recoverable: error.recoverable,
        workflowState: this.stateMachine.workflowState(),
      });
    }
  }

  private checkOptOutStatus(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(TELEMETRY_OPT_OUT_KEY) === 'true';
  }

  private loadConfig(): TelemetryConfig {
    if (typeof window === 'undefined') return DEFAULT_CONFIG;

    try {
      const stored = localStorage.getItem(TELEMETRY_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<TelemetryConfig>;
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch {
      this.logger.warn('[TELEMETRY] Failed to load config from storage');
    }

    return DEFAULT_CONFIG;
  }

  private saveConfig(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(TELEMETRY_CONFIG_KEY, JSON.stringify(this.config));
    } catch {
      this.logger.warn('[TELEMETRY] Failed to save config to storage');
    }
  }
}
