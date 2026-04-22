/**
 * Clarification Controller - Window and IPC Coordination
 *
 * This module serves as the facade for the clarification workflow, coordinating
 * between the Electron main process, renderer windows, and all domain services.
 * It implements the Facade pattern to provide a simplified interface to the
 * complex subsystems involved in the OKR clarification process.
 *
 * Key Responsibilities:
 * - IPC channel registration and request routing (via ClarificationIpcRouter)
 * - Window lifecycle management (clarification and sticky windows)
 * - Session state coordination between renderer and persistence layers
 * - Test mode API exposure for E2E testing (via ClarificationControllerApis)
 *
 * Architecture:
 * The controller delegates to 6 specialized handlers:
 * - ClarificationSessionManager: Session lifecycle management
 * - ClarificationStateMachine: State transitions and validation
 * - ClarificationPromptHandler: Initial intent processing and question generation
 * - ClarificationResponseHandler: User selection recording
 * - ClarificationDraftHandler: OKR draft generation
 * - ClarificationPersistenceHandler: Session persistence operations
 *
 * @module windows/clarification-controller
 */

import type { ClarificationSession } from '@clarityokr/contracts';
import electron from 'electron';

import {
  ClarificationDraftHandler,
  ClarificationPersistenceHandler,
  ClarificationPromptHandler,
  ClarificationResponseHandler,
  ClarificationSessionManager,
  ClarificationStateMachine,
} from '../clarification/index.js';
import type { IActionLogWriter } from '../persistence/action-log-writer.js';
import type { OkrRepository } from '../persistence/okr-repository.js';
import type { ISessionRepository } from '../persistence/interfaces/index.js';
import { ActionLogService } from '../services/action-log.service.js';
import type { OkrAgentService } from '../services/okr-agent.service.js';
import type { OkrRegenerationService } from '../services/okr-regeneration.service.js';

import { ClarificationControllerApis } from './clarification-controller-apis.js';
import { ClarificationIpcRouter } from './clarification-ipc-router.js';
import type { StickyWindowManager } from './sticky-window-manager.js';

/**
  constructor(
    private readonly sessionRepository: ISessionRepository,
    private readonly okrRepository: OkrRepository,
    private readonly actionLogWriter: IActionLogWriter,
    private readonly stickyWindowManager: StickyWindowManager,
    private readonly okrAgentService: OkrAgentService,
  ) {}
 *
 * Coordinates all aspects of the clarification process including session management,
 * state transitions, LLM integration, window management, and persistence. Acts as
 * the single entry point for IPC handlers from the renderer process.
 *
 * The controller maintains 6 specialized handler instances that handle specific
 * domain concerns, delegating work rather than implementing business logic directly.
 *
 * @example
 * ```typescript
 * const controller = new ClarificationController(
 *   sessionRepository,
 *   okrRepository,
 *   actionLogWriter,
 *   stickyWindowManager,
 *   okrAgentService
 * );
 *
 * // IPC handlers are automatically registered
 * // Access test APIs
 * controller.resetSessions();
 * const count = controller.getSessionCount();
 * ```
 */
export class ClarificationController {
  /** Manages session lifecycle and retrieval */
  private readonly sessionManager: ClarificationSessionManager;
  /** Handles state machine transitions and validation */
  private readonly stateMachine: ClarificationStateMachine;
  /** Processes user intent inputs and generates prompts */
  private readonly promptHandler: ClarificationPromptHandler;
  /** Records user responses to clarification questions */
  private readonly responseHandler: ClarificationResponseHandler;
  /** Generates OKR drafts from completed clarifications */
  private readonly draftHandler: ClarificationDraftHandler;
  /** Handles persistence operations for sessions */
  private readonly persistenceHandler: ClarificationPersistenceHandler;
  /** Logs user actions for analytics and debugging */
  private readonly actionLogService: ActionLogService;
  /** Electron instance for IPC and window operations */
  private readonly elect: typeof electron;
  /** Repository for OKR storage */
  private readonly okrRepository: OkrRepository;
  /** Manager for sticky window lifecycle */
  private readonly stickyWindowManager: StickyWindowManager;
  /** Service for OKR regeneration */
  private readonly okrRegenerationService: OkrRegenerationService;

  /**
   * Creates a new ClarificationController instance.
   *
   * Initializes all specialized handlers with their dependencies and registers
   * IPC handlers for communication with the renderer process.
   *
   * @param sessionRepository - Repository for session persistence
   * @param okrRepository - Repository for OKR storage
   * @param actionLogWriter - Writer for action log persistence
   * @param stickyWindowManager - Manager for sticky window lifecycle
   * @param okrAgentService - Service for LLM API communication
   * @param okrRegenerationService - Service for OKR regeneration
   * @param elect - Electron instance (default: imported electron) - used for test injection
   */
  constructor(
    sessionRepository: ISessionRepository,
    okrRepository: OkrRepository,
    actionLogWriter: IActionLogWriter,
    stickyWindowManager: StickyWindowManager,
    okrAgentService: OkrAgentService,
    okrRegenerationService: OkrRegenerationService,
    elect: typeof electron = electron,
  ) {
    this.elect = elect;
    this.okrRepository = okrRepository;
    this.stickyWindowManager = stickyWindowManager;
    this.okrRegenerationService = okrRegenerationService;

    // Initialize specialized handlers via dependency injection
    this.stateMachine = new ClarificationStateMachine();
    this.persistenceHandler = new ClarificationPersistenceHandler(sessionRepository);
    this.sessionManager = new ClarificationSessionManager(sessionRepository, this.stateMachine);
    this.promptHandler = new ClarificationPromptHandler(
      this.sessionManager,
      this.stateMachine,
      okrAgentService,
    );
    this.responseHandler = new ClarificationResponseHandler(this.sessionManager, this.stateMachine);
    this.draftHandler = new ClarificationDraftHandler(
      this.sessionManager,
      this.stateMachine,
      okrAgentService,
    );
    this.actionLogService = new ActionLogService(actionLogWriter);

    this.registerHandlers();
  }

  /**
   * Gets controller dependencies for delegation to helper classes.
   */
  private getDeps() {
    return {
      sessionManager: this.sessionManager,
      stateMachine: this.stateMachine,
      promptHandler: this.promptHandler,
      responseHandler: this.responseHandler,
      draftHandler: this.draftHandler,
      persistenceHandler: this.persistenceHandler,
      okrRepository: this.okrRepository,
      stickyWindowManager: this.stickyWindowManager,
      okrRegenerationService: this.okrRegenerationService,
      actionLogService: this.actionLogService,
      ipcMain: this.elect.ipcMain,
      getAllWebContents: () => this.elect.webContents.getAllWebContents(),
    };
  }

  /**
   * Registers all IPC handlers for renderer communication.
   */
  private registerHandlers(): void {
    const deps = this.getDeps();
    ClarificationIpcRouter.registerHandlers(deps);
  }

  // ==================== TestMode API ====================

  /**
   * Resets all active clarification sessions.
   *
   * Used in E2E tests to ensure clean state between test runs.
   */
  resetSessions(): void {
    ClarificationControllerApis.resetSessions(this.getDeps());
  }

  /**
   * Gets all active sessions for testing.
   *
   * @returns Map of session IDs to session objects
   */
  getAllSessions(): Map<string, ClarificationSession> {
    return ClarificationControllerApis.getAllSessions(this.getDeps());
  }

  /**
   * Gets the ID of the currently active session.
   *
   * @returns Current session ID or null if no session is active
   */
  getCurrentSessionId(): string | null {
    return ClarificationControllerApis.getCurrentSessionId(this.getDeps());
  }

  /**
   * Manually sets a session for testing purposes.
   *
   * @param sessionId - The session ID to set
   * @param session - The session object to store
   */
  setSession(sessionId: string, session: ClarificationSession): void {
    ClarificationControllerApis.setSession(this.getDeps(), sessionId, session);
  }

  /**
   * Retrieves a session by ID for testing.
   *
   * @param sessionId - The session ID to retrieve
   * @returns The session object or undefined if not found
   */
  async getSessionForTest(sessionId: string): Promise<ClarificationSession | undefined> {
    return ClarificationControllerApis.getSessionForTest(this.getDeps(), sessionId);
  }

  /**
   * Gets the count of active sessions.
   *
   * @returns Number of active sessions
   */
  getSessionCount(): number {
    return ClarificationControllerApis.getSessionCount(this.getDeps());
  }

  // ==================== Advanced API ====================

  /**
   * Gets the session manager instance.
   *
   * @returns The ClarificationSessionManager instance
   */
  getSessionManager(): ClarificationSessionManager {
    return ClarificationControllerApis.getSessionManager(this.getDeps());
  }

  /**
   * Gets the state machine instance.
   *
   * @returns The ClarificationStateMachine instance
   */
  getStateMachine(): ClarificationStateMachine {
    return ClarificationControllerApis.getStateMachine(this.getDeps());
  }

  /**
   * Gets the prompt handler instance.
   *
   * @returns The ClarificationPromptHandler instance
   */
  getPromptHandler(): ClarificationPromptHandler {
    return ClarificationControllerApis.getPromptHandler(this.getDeps());
  }

  /**
   * Gets the response handler instance.
   *
   * @returns The ClarificationResponseHandler instance
   */
  getResponseHandler(): ClarificationResponseHandler {
    return ClarificationControllerApis.getResponseHandler(this.getDeps());
  }

  /**
   * Gets the draft handler instance.
   *
   * @returns The ClarificationDraftHandler instance
   */
  getDraftHandler(): ClarificationDraftHandler {
    return ClarificationControllerApis.getDraftHandler(this.getDeps());
  }

  /**
   * Gets the persistence handler instance.
   *
   * @returns The ClarificationPersistenceHandler instance
   */
  getPersistenceHandler(): ClarificationPersistenceHandler {
    return ClarificationControllerApis.getPersistenceHandler(this.getDeps());
  }
}
