/**
 * TestMode API for E2E testing
 *
 * Provides programmatic control over application state for test scenarios:
 * - Reset state without restarting the app
 * - Inject mock data
 * - Control async operations
 * - Observe internal state changes
 */

import { randomUUID } from 'node:crypto';

import type { ClarificationSession, MockResponseConfig, OKRDocument } from '@clarityokr/contracts';

import type { ActionLogWriter } from './persistence/action-log-writer.js';
import type { OkrRepository } from './persistence/okr-repository.js';
import type { SessionRepository } from './persistence/session-repository.js';
import type { ClarificationController } from './windows/clarification-controller.js';

/**
 * Application state snapshot for testing
 */
export interface AppState {
  /** All active sessions */
  sessions: Map<string, ClarificationSession>;
  /** Currently active session ID */
  currentSessionId: string | null;
  /** Mock response configuration */
  mockResponses: MockResponseConfig;
  /** Whether async operations are paused */
  asyncPaused: boolean;
}

/**
 * TestMode API interface
 */
export interface TestModeAPI {
  // ==================== State Reset ====================

  /**
   * Reset all application state (sessions, persistence, mock responses)
   */
  resetState(): Promise<void>;

  /**
   * Reset only in-memory sessions
   */
  resetSession(): Promise<void>;

  /**
   * Reset only persistent storage
   */
  resetPersistence(): Promise<void>;

  // ==================== Session Control ====================

  /**
   * Create a mock session with test data
   * @param data - Partial session data to override defaults
   * @returns The created session ID
   */
  createMockSession(data: Partial<ClarificationSession>): Promise<string>;

  /**
   * Set a session directly
   * @param sessionId - The session ID
   * @param data - The session data
   */
  setSession(sessionId: string, data: ClarificationSession): void;

  /**
   * Get a session by ID
   * @param sessionId - The session ID
   * @returns The session or undefined
   */
  getSession(sessionId: string): ClarificationSession | undefined;

  /**
   * Get all sessions
   * @returns Map of all sessions
   */
  getAllSessions(): Map<string, ClarificationSession>;

  // ==================== Mock Control ====================

  /**
   * Set mock LLM response for a specific type
   * @param type - The response type
   * @param response - The response data
   */
  setMockLLMResponse(type: 'nextQuestion' | 'draft', response: unknown): void;

  /**
   * Clear all mock responses
   */
  clearMockResponses(): void;

  /**
   * Set full mock response configuration
   * @param config - The mock response configuration
   */
  setMockResponseConfig(config: MockResponseConfig): void;

  /**
   * Get current mock response configuration
   * @returns The current mock response configuration
   */
  getMockResponseConfig(): MockResponseConfig;

  // ==================== State Observation ====================

  /**
   * Get current application state snapshot
   * @returns The current state
   */
  getCurrentState(): AppState;

  /**
   * Subscribe to state changes
   * @param callback - Function to call when state changes
   * @returns Unsubscribe function
   */
  subscribeToStateChanges(callback: (state: AppState) => void): () => void;

  // ==================== Async Control ====================

  /**
   * Pause async operations
   */
  pauseAsyncOperations(): void;

  /**
   * Resume async operations
   */
  resumeAsyncOperations(): void;

  /**
   * Wait for all async operations to complete
   * @param timeout - Maximum wait time in milliseconds
   */
  waitForAsyncOperations(timeout?: number): Promise<void>;

  // ==================== OKR Control ====================

  /**
   * Get the latest OKR document
   * @returns The latest OKR or null
   */
  getLatestOKR(): Promise<OKRDocument | null>;

  /**
   * Save an OKR document directly
   * @param okr - The OKR document to save
   */
  saveOKR(okr: OKRDocument): Promise<void>;

  /**
   * Clear all OKR documents
   */
  clearOKRs(): Promise<void>;
}

/**
 * TestMode implementation
 */
export class TestMode implements TestModeAPI {
  private stateSubscribers: Set<(state: AppState) => void> = new Set();
  private mockLLMResponses: Map<string, unknown> = new Map();
  private mockResponseConfig: MockResponseConfig = {};
  private asyncPaused = false;
  private asyncQueue: (() => Promise<void>)[] = [];
  private asyncResolvers: Array<() => void> = [];

  constructor(
    private readonly controller: ClarificationController,
    private readonly sessionRepo: SessionRepository,
    private readonly okrRepo: OkrRepository,
    private readonly actionLogWriter: ActionLogWriter,
  ) {
    console.info('[testMode] Initialized');
  }

  // ==================== State Reset ====================

  async resetState(): Promise<void> {
    console.info('[testMode] Resetting all state...');

    // 1. Clear all sessions from controller
    this.controller.resetSessions();

    // 2. Clear persistent storage
    await this.sessionRepo.saveSession(null);
    await this.clearOKRs();

    // 3. Clear action log (append reset marker)
    await this.actionLogWriter.append({
      id: randomUUID(),
      actionType: 'generate',
      sessionId: 'test-mode',
      payloadSummary: 'Test mode state reset',
      occurredAt: new Date().toISOString(),
    });

    // 4. Reset mock responses
    this.mockLLMResponses.clear();
    this.mockResponseConfig = {};

    // 5. Resume async operations if paused
    this.asyncPaused = false;
    this.asyncQueue = [];

    // 6. Notify state change
    this.notifyStateChange();

    console.info('[testMode] State reset complete');
  }

  resetSession(): Promise<void> {
    console.info('[testMode] Resetting sessions...');
    this.controller.resetSessions();
    this.notifyStateChange();
    return Promise.resolve();
  }

  async resetPersistence(): Promise<void> {
    console.info('[testMode] Resetting persistence...');
    await this.sessionRepo.saveSession(null);
    await this.clearOKRs();
    // Note: ActionLogWriter doesn't have a clear method, it only appends
    // The log will be naturally empty in a fresh test environment
  }

  // ==================== Session Control ====================

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
      selectedOptionIds: data.selectedOptionIds ?? [],
      confidence: data.confidence ?? 0,
      pendingQuestionId: data.pendingQuestionId ?? null,
      ...data,
    };

    this.controller.setSession(sessionId, session);
    await this.sessionRepo.saveSession(session);
    this.notifyStateChange();

    console.info('[testMode] Created mock session:', sessionId);
    return sessionId;
  }

  setSession(sessionId: string, data: ClarificationSession): void {
    this.controller.setSession(sessionId, data);
    this.notifyStateChange();
  }

  getSession(sessionId: string): ClarificationSession | undefined {
    return this.controller.getSession(sessionId);
  }

  getAllSessions(): Map<string, ClarificationSession> {
    return this.controller.getAllSessions();
  }

  // ==================== Mock Control ====================

  setMockLLMResponse(type: 'nextQuestion' | 'draft', response: unknown): void {
    this.mockLLMResponses.set(type, response);
    this.notifyStateChange();
    console.info('[testMode] Set mock LLM response for:', type);
  }

  clearMockResponses(): void {
    this.mockLLMResponses.clear();
    this.mockResponseConfig = {};
    this.notifyStateChange();
  }

  setMockResponseConfig(config: MockResponseConfig): void {
    this.mockResponseConfig = config;
    this.notifyStateChange();
  }

  getMockResponseConfig(): MockResponseConfig {
    return { ...this.mockResponseConfig };
  }

  // ==================== State Observation ====================

  getCurrentState(): AppState {
    return {
      sessions: this.controller.getAllSessions(),
      currentSessionId: this.controller.getCurrentSessionId(),
      mockResponses: this.mockResponseConfig,
      asyncPaused: this.asyncPaused,
    };
  }

  subscribeToStateChanges(callback: (state: AppState) => void): () => void {
    this.stateSubscribers.add(callback);
    return () => this.stateSubscribers.delete(callback);
  }

  private notifyStateChange(): void {
    const state = this.getCurrentState();
    this.stateSubscribers.forEach((cb) => {
      try {
        cb(state);
      } catch (error) {
        console.error('[testMode] Error in state change callback:', error);
      }
    });
  }

  // ==================== Async Control ====================

  pauseAsyncOperations(): void {
    this.asyncPaused = true;
    this.notifyStateChange();
    console.info('[testMode] Async operations paused');
  }

  resumeAsyncOperations(): void {
    this.asyncPaused = false;
    void this.drainAsyncQueue();
    this.notifyStateChange();
    console.info('[testMode] Async operations resumed');
  }

  async waitForAsyncOperations(timeout = 30000): Promise<void> {
    if (!this.asyncPaused && this.asyncQueue.length === 0) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for async operations after ${timeout}ms`));
      }, timeout);

      const checkInterval = setInterval(() => {
        if (!this.asyncPaused && this.asyncQueue.length === 0) {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          resolve();
        }
      }, 100);

      // Also resolve if resumed and queue drained
      this.asyncResolvers.push(() => {
        if (this.asyncQueue.length === 0) {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          resolve();
        }
      });
    });
  }

  private async drainAsyncQueue(): Promise<void> {
    while (this.asyncQueue.length > 0) {
      const op = this.asyncQueue.shift();
      if (op) {
        try {
          await op();
        } catch (error) {
          console.error('[testMode] Error in async operation:', error);
        }
      }
    }

    // Notify all waiting resolvers
    this.asyncResolvers.forEach((resolve) => resolve());
    this.asyncResolvers = [];
  }

  /**
   * Enqueue an async operation if paused
   * @param operation - The operation to enqueue
   * @returns Whether the operation was enqueued (true) or can run immediately (false)
   */
  enqueueIfPaused(operation: () => Promise<void>): boolean {
    if (this.asyncPaused) {
      this.asyncQueue.push(operation);
      return true;
    }
    return false;
  }

  // ==================== OKR Control ====================

  async getLatestOKR(): Promise<OKRDocument | null> {
    return this.okrRepo.loadLatest();
  }

  async saveOKR(okr: OKRDocument): Promise<void> {
    await this.okrRepo.save(okr);
  }

  async clearOKRs(): Promise<void> {
    // Delete OKR file by saving null (repository doesn't have delete method)
    // We need to handle this at the file system level
    const { promises: fsPromises } = await import('node:fs');
    const { join } = await import('node:path');
    const dataDir = process.env.CLARITY_OKR_DATA_DIR ?? join(process.cwd(), 'data');
    const okrFile = join(dataDir, 'okr-document.json');

    try {
      await fsPromises.unlink(okrFile);
    } catch {
      // File may not exist, that's fine
    }
  }
}

// ==================== Global Instance ====================

let globalTestMode: TestMode | null = null;

/**
 * Initialize the global TestMode instance
 */
export function initializeTestMode(
  controller: ClarificationController,
  sessionRepo: SessionRepository,
  okrRepo: OkrRepository,
  actionLogWriter: ActionLogWriter,
): TestMode {
  globalTestMode = new TestMode(controller, sessionRepo, okrRepo, actionLogWriter);

  // Expose on global for E2E test access
  if (process.env.NODE_ENV === 'test' || process.env.CI || process.env.E2E_TEST) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (global as unknown as { testMode: TestMode }).testMode = globalTestMode;
    console.info('[testMode] Exposed to global.testMode for E2E access');
  }

  return globalTestMode;
}

/**
 * Get the global TestMode instance
 */
export function getTestMode(): TestMode | null {
  return globalTestMode;
}

/**
 * Check if TestMode is available
 */
export function isTestModeEnabled(): boolean {
  return globalTestMode !== null;
}
