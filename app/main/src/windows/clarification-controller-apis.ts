/**
 * Clarification Controller APIs
 *
 * This module provides test mode APIs and advanced accessor methods for the
 * ClarificationController. These APIs are primarily used for E2E testing and
 * advanced use cases requiring direct access to handler instances.
 *
 * @module windows/clarification-controller-apis
 */

import type { ClarificationSession } from '@clarityokr/contracts';

import type {
  ClarificationDraftHandler,
  ClarificationPersistenceHandler,
  ClarificationPromptHandler,
  ClarificationResponseHandler,
  ClarificationSessionManager,
  ClarificationStateMachine,
} from '../clarification/index.js';

/**
 * Dependencies required for controller APIs.
 */
export interface ClarificationControllerApiDeps {
  /** Manages session lifecycle and retrieval */
  sessionManager: ClarificationSessionManager;
  /** Handles state machine transitions and validation */
  stateMachine: ClarificationStateMachine;
  /** Processes user intent inputs and generates prompts */
  promptHandler: ClarificationPromptHandler;
  /** Records user responses to clarification questions */
  responseHandler: ClarificationResponseHandler;
  /** Generates OKR drafts from completed clarifications */
  draftHandler: ClarificationDraftHandler;
  /** Handles persistence operations for sessions */
  persistenceHandler: ClarificationPersistenceHandler;
}

/**
 * Test mode and advanced APIs for ClarificationController.
 *
 * Provides methods for E2E testing (resetting sessions, accessing session state)
 * and advanced use cases requiring direct access to handler instances.
 */
export class ClarificationControllerApis {
  /**
   * Resets all active clarification sessions.
   *
   * Used in E2E tests to ensure clean state between test runs.
   *
   * @param deps - Controller dependencies
   */
  static resetSessions(deps: ClarificationControllerApiDeps): void {
    deps.sessionManager.cleanupSessions();
  }

  /**
   * Gets all active sessions for testing.
   *
   * @param deps - Controller dependencies
   * @returns Map of session IDs to session objects
   */
  static getAllSessions(deps: ClarificationControllerApiDeps): Map<string, ClarificationSession> {
    return deps.sessionManager.getAllSessions();
  }

  /**
   * Gets the ID of the currently active session.
   *
   * @param deps - Controller dependencies
   * @returns Current session ID or null if no session is active
   */
  static getCurrentSessionId(deps: ClarificationControllerApiDeps): string | null {
    return deps.sessionManager.getCurrentSessionId();
  }

  /**
   * Manually sets a session for testing purposes.
   *
   * @param deps - Controller dependencies
   * @param sessionId - The session ID to set
   * @param session - The session object to store
   */
  static setSession(
    deps: ClarificationControllerApiDeps,
    sessionId: string,
    session: ClarificationSession,
  ): void {
    deps.sessionManager.setSession(sessionId, session);
  }

  /**
   * Retrieves a session by ID for testing.
   *
   * @param deps - Controller dependencies
   * @param sessionId - The session ID to retrieve
   * @returns The session object or undefined if not found
   */
  static async getSessionForTest(
    deps: ClarificationControllerApiDeps,
    sessionId: string,
  ): Promise<ClarificationSession | undefined> {
    return (await deps.sessionManager.getSession(sessionId)) ?? undefined;
  }

  /**
   * Gets the count of active sessions.
   *
   * @param deps - Controller dependencies
   * @returns Number of active sessions
   */
  static getSessionCount(deps: ClarificationControllerApiDeps): number {
    return deps.sessionManager.getSessionCount();
  }

  // ==================== Advanced API ====================

  /**
   * Gets the session manager instance.
   *
   * @param deps - Controller dependencies
   * @returns The ClarificationSessionManager instance
   */
  static getSessionManager(deps: ClarificationControllerApiDeps): ClarificationSessionManager {
    return deps.sessionManager;
  }

  /**
   * Gets the state machine instance.
   *
   * @param deps - Controller dependencies
   * @returns The ClarificationStateMachine instance
   */
  static getStateMachine(deps: ClarificationControllerApiDeps): ClarificationStateMachine {
    return deps.stateMachine;
  }

  /**
   * Gets the prompt handler instance.
   *
   * @param deps - Controller dependencies
   * @returns The ClarificationPromptHandler instance
   */
  static getPromptHandler(deps: ClarificationControllerApiDeps): ClarificationPromptHandler {
    return deps.promptHandler;
  }

  /**
   * Gets the response handler instance.
   *
   * @param deps - Controller dependencies
   * @returns The ClarificationResponseHandler instance
   */
  static getResponseHandler(deps: ClarificationControllerApiDeps): ClarificationResponseHandler {
    return deps.responseHandler;
  }

  /**
   * Gets the draft handler instance.
   *
   * @param deps - Controller dependencies
   * @returns The ClarificationDraftHandler instance
   */
  static getDraftHandler(deps: ClarificationControllerApiDeps): ClarificationDraftHandler {
    return deps.draftHandler;
  }

  /**
   * Gets the persistence handler instance.
   *
   * @param deps - Controller dependencies
   * @returns The ClarificationPersistenceHandler instance
   */
  static getPersistenceHandler(
    deps: ClarificationControllerApiDeps,
  ): ClarificationPersistenceHandler {
    return deps.persistenceHandler;
  }
}
