import { randomUUID } from 'node:crypto';
import type { ClarificationSession } from '@clarityokr/contracts';
import { Logger } from '../core/logger.js';
import type { ISessionControl, IStateReset, TestModeDependencies } from './types.js';
import type { StateObservationModule } from './state-observation.js';
import type { MockControlModule } from './mock-and-okr-control.js';
import type { AsyncControlModule } from './async-control.js';
import type { OkrControlModule } from './mock-and-okr-control.js';

export class SessionControlModule implements ISessionControl {
  constructor(
    private readonly deps: TestModeDependencies,
    private readonly stateObserver: StateObservationModule,
  ) {}

  async createMockSession(data: Partial<ClarificationSession>): Promise<string> {
    const sessionId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const session: ClarificationSession = {
      id: sessionId,
      initialIntent: data.initialIntent ?? 'Test intent',
      status: data.status ?? 'collecting',
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
      steps: data.steps ?? [],
      selectedOptions: data.selectedOptions ?? [],
      confidence: data.confidence ?? 0,
      pendingQuestionId: data.pendingQuestionId ?? null,
      ...data,
    };

    this.deps.controller.setSession(sessionId, session);
    await this.deps.sessionRepo.saveSession(session);
    this.stateObserver.notifyStateChange();

    Logger.info('[testMode] Created mock session:', sessionId);
    return sessionId;
  }

  setSession(sessionId: string, data: ClarificationSession): void {
    this.deps.controller.setSession(sessionId, data);
    this.stateObserver.notifyStateChange();
  }

  async getSession(sessionId: string): Promise<ClarificationSession | undefined> {
    return this.deps.controller.getSessionForTest(sessionId);
  }

  getAllSessions(): Map<string, ClarificationSession> {
    return this.deps.controller.getAllSessions();
  }
}

export class StateResetModule implements IStateReset {
  constructor(
    private readonly deps: TestModeDependencies,
    private readonly stateObserver: StateObservationModule,
    private readonly mockControl: MockControlModule,
    private readonly asyncControl: AsyncControlModule,
    private readonly okrControl: OkrControlModule,
  ) {}

  async resetState(): Promise<void> {
    Logger.info('[testMode] Resetting all state...');

    this.deps.controller.resetSessions();
    await this.deps.sessionRepo.saveSession(null);
    await this.okrControl.clearOKRs();

    await this.deps.actionLogWriter.append({
      id: randomUUID(),
      actionType: 'generate',
      sessionId: 'test-mode',
      payloadSummary: 'Test mode state reset',
      occurredAt: new Date().toISOString(),
    });

    this.mockControl.clearMockResponses();

    Logger.info('[testMode] State reset complete');
  }

  resetSession(): Promise<void> {
    Logger.info('[testMode] Resetting sessions...');
    this.deps.controller.resetSessions();
    this.stateObserver.notifyStateChange();
    return Promise.resolve();
  }

  async resetPersistence(): Promise<void> {
    Logger.info('[testMode] Resetting persistence...');
    await this.deps.sessionRepo.saveSession(null);
    await this.okrControl.clearOKRs();
  }
}
