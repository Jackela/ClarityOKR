/**
 * TestMode Types and Interfaces
 *
 * Shared types for the TestMode API system.
 */

import type { ClarificationSession, MockResponseConfig, OKRDocument } from '@clarityokr/contracts';

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
 * TestMode API interface - State Reset operations
 */
export interface IStateReset {
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
}

/**
 * TestMode API interface - Session Control operations
 */
export interface ISessionControl {
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
  getSession(sessionId: string): Promise<ClarificationSession | undefined>;

  /**
   * Get all sessions
   * @returns Map of all sessions
   */
  getAllSessions(): Map<string, ClarificationSession>;
}

/**
 * TestMode API interface - Mock Control operations
 */
export interface IMockControl {
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
}

/**
 * TestMode API interface - State Observation operations
 */
export interface IStateObservation {
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
}

/**
 * TestMode API interface - Async Control operations
 */
export interface IAsyncControl {
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

  /**
   * Enqueue an async operation if paused
   * @param operation - The operation to enqueue
   * @returns Whether the operation was enqueued (true) or can run immediately (false)
   */
  enqueueIfPaused(operation: () => Promise<void>): boolean;
}

/**
 * TestMode API interface - OKR Control operations
 */
export interface IOkrControl {
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
 * Complete TestMode API interface
 */
export interface TestModeAPI
  extends
    IStateReset,
    ISessionControl,
    IMockControl,
    IStateObservation,
    IAsyncControl,
    IOkrControl {}

/**
 * Dependencies required by TestMode modules
 */
export interface TestModeDependencies {
  controller: {
    resetSessions(): void;
    setSession(sessionId: string, session: ClarificationSession): void;
    getSessionForTest(sessionId: string): Promise<ClarificationSession | undefined>;
    getAllSessions(): Map<string, ClarificationSession>;
    getCurrentSessionId(): string | null;
  };
  sessionRepo: {
    saveSession(session: ClarificationSession | null): Promise<void>;
  };
  okrRepo: {
    loadLatest(): Promise<OKRDocument | null>;
    save(okr: OKRDocument): Promise<void>;
  };
  actionLogWriter: {
    append(entry: {
      id: string;
      actionType: string;
      sessionId: string;
      payloadSummary: string;
      occurredAt: string;
    }): Promise<void>;
  };
}
