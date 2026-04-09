import { Logger } from '../core/logger.js';
import type { TestModeAPI, TestModeDependencies, AppState } from './types.js';
import type { ClarificationSession, OKRDocument, MockResponseConfig } from '@clarityokr/contracts';
import { StateObservationModule } from './state-observation.js';
import { AsyncControlModule } from './async-control.js';
import { MockControlModule, OkrControlModule } from './mock-and-okr-control.js';
import { SessionControlModule, StateResetModule } from './session-and-reset.js';

export class TestMode implements TestModeAPI {
  private stateObserver: StateObservationModule;
  private asyncControl: AsyncControlModule;
  private mockControl: MockControlModule;
  private okrControl: OkrControlModule;
  private sessionControl: SessionControlModule;
  private stateReset: StateResetModule;

  constructor(deps: TestModeDependencies) {
    this.stateObserver = new StateObservationModule(deps);
    this.asyncControl = new AsyncControlModule(this.stateObserver);
    this.mockControl = new MockControlModule(this.stateObserver);
    this.okrControl = new OkrControlModule(deps, this.stateObserver);
    this.sessionControl = new SessionControlModule(deps, this.stateObserver);
    this.stateReset = new StateResetModule(
      deps,
      this.stateObserver,
      this.mockControl,
      this.asyncControl,
      this.okrControl,
    );

    Logger.info('[testMode] Initialized');
  }

  resetState(): Promise<void> {
    return this.stateReset.resetState();
  }

  resetSession(): Promise<void> {
    return this.stateReset.resetSession();
  }

  resetPersistence(): Promise<void> {
    return this.stateReset.resetPersistence();
  }

  createMockSession(data: Partial<ClarificationSession>): Promise<string> {
    return this.sessionControl.createMockSession(data);
  }

  setSession(sessionId: string, data: ClarificationSession): void {
    this.sessionControl.setSession(sessionId, data);
  }

  getSession(sessionId: string): Promise<ClarificationSession | undefined> {
    return this.sessionControl.getSession(sessionId);
  }

  getAllSessions(): Map<string, ClarificationSession> {
    return this.sessionControl.getAllSessions();
  }

  setMockLLMResponse(type: 'nextQuestion' | 'draft', response: unknown): void {
    this.mockControl.setMockLLMResponse(type, response);
  }

  clearMockResponses(): void {
    this.mockControl.clearMockResponses();
  }

  setMockResponseConfig(config: MockResponseConfig): void {
    this.mockControl.setMockResponseConfig(config);
  }

  getMockResponseConfig(): MockResponseConfig {
    return this.mockControl.getMockResponseConfig();
  }

  getCurrentState(): AppState {
    return this.stateObserver.getCurrentState();
  }

  subscribeToStateChanges(callback: (state: AppState) => void): () => void {
    return this.stateObserver.subscribeToStateChanges(callback);
  }

  pauseAsyncOperations(): void {
    this.asyncControl.pauseAsyncOperations();
  }

  resumeAsyncOperations(): void {
    this.asyncControl.resumeAsyncOperations();
  }

  waitForAsyncOperations(timeout?: number): Promise<void> {
    return this.asyncControl.waitForAsyncOperations(timeout);
  }

  enqueueIfPaused(operation: () => Promise<void>): boolean {
    return this.asyncControl.enqueueIfPaused(operation);
  }

  getLatestOKR(): Promise<OKRDocument | null> {
    return this.okrControl.getLatestOKR();
  }

  saveOKR(okr: OKRDocument): Promise<void> {
    return this.okrControl.saveOKR(okr);
  }

  clearOKRs(): Promise<void> {
    return this.okrControl.clearOKRs();
  }
}
