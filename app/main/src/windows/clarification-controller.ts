/**
 * Clarification Controller - Window and IPC Coordination
 *
 * This module serves as the facade for the clarification workflow, coordinating
 * between the Electron main process, renderer windows, and all domain services.
 * It implements the Facade pattern to provide a simplified interface to the
 * complex subsystems involved in the OKR clarification process.
 *
 * Key Responsibilities:
 * - IPC channel registration and request routing
 * - Window lifecycle management (clarification and sticky windows)
 * - Session state coordination between renderer and persistence layers
 * - Backward compatibility for legacy IPC payload formats
 * - Test mode API exposure for E2E testing
 *
 * Dependencies:
 * - Electron: IPC and window management
 * - Clarification module: 6 specialized handlers for domain logic
 * - Repositories: Session, OKR, and action log persistence
 * - Services: LLM agent, sticky window manager
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

import { IPC_CHANNELS } from '../bootstrap/ipc-channels.js';
import {
  ClarificationDraftHandler,
  ClarificationPersistenceHandler,
  ClarificationPromptHandler,
  ClarificationResponseHandler,
  ClarificationSessionManager,
  ClarificationStateMachine,
} from '../clarification/index.js';
import type { ActionLogWriter } from '../persistence/action-log-writer.js';
import type { OkrRepository } from '../persistence/okr-repository.js';
import type { SessionRepository } from '../persistence/session-repository.js';
import { ActionLogService } from '../services/action-log.service.js';
import type { OkrAgentService } from '../services/okr-agent.service.js';

import type { StickyWindowManager } from './sticky-window-manager.js';

// ============================================================================
// IPC Payload Types for Backward Compatibility
// ============================================================================

/**
 * Represents a single turn in the clarification conversation.
 */
interface ClarificationTurn {
  /** Unique identifier for the question */
  questionId: string;
  /** Selected option identifier */
  optionId: string;
  /** ISO timestamp of when the selection was made */
  timestamp: string;
}

/**
 * Context containing the history of clarification turns.
 */
interface ClarificationContext {
  /** Array of question-answer pairs from the current session */
  turns: ClarificationTurn[];
}

/**
 * Represents the user's most recent selection.
 */
interface LastChoice {
  /** Question that was answered */
  questionId: string;
  /** Option that was selected */
  optionId: string;
}

/**
 * New format for LLM_NEXT_QUESTION IPC channel.
 * Preferred format using explicit session and question IDs.
 */
interface NextQuestionPayloadNew {
  /** Active session identifier */
  sessionId: string;
  /** Current question being answered */
  currentQuestionId: string;
  /** Clarification context with turn history */
  context: ClarificationContext;
}

/**
 * Legacy format for LLM_NEXT_QUESTION IPC channel.
 * Used for backward compatibility with older renderer versions.
 */
interface NextQuestionPayloadOld {
  /** Clarification context with turn history */
  context: ClarificationContext;
  /** User's most recent selection */
  lastChoice: LastChoice;
}

/**
 * Union type supporting both new and legacy payload formats.
 */
type NextQuestionPayload = NextQuestionPayloadNew | NextQuestionPayloadOld;

/**
 * New format for LLM_GENERATE_DRAFT IPC channel.
 * Preferred format using explicit session ID.
 */
interface GenerateDraftPayloadNew {
  /** Active session identifier */
  sessionId: string;
}

/**
 * Legacy format for LLM_GENERATE_DRAFT IPC channel.
 * Used for backward compatibility with older renderer versions.
 */
interface GenerateDraftPayloadOld {
  /** Clarification context with turn history */
  context: ClarificationContext;
}

/**
 * Union type supporting both new and legacy payload formats.
 */
type GenerateDraftPayload = GenerateDraftPayloadNew | GenerateDraftPayloadOld;

/**
 * Type guard to check if payload uses the new format for LLM_NEXT_QUESTION.
 *
 * @param payload - The payload to check
 * @returns True if the payload matches the new format with sessionId and currentQuestionId
 */
function isNextQuestionPayloadNew(payload: unknown): payload is NextQuestionPayloadNew {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'sessionId' in payload &&
    typeof (payload as Record<string, unknown>).sessionId === 'string' &&
    'currentQuestionId' in payload &&
    typeof (payload as Record<string, unknown>).currentQuestionId === 'string'
  );
}

/**
 * Type guard to check if payload uses the legacy format for LLM_NEXT_QUESTION.
 *
 * @param payload - The payload to check
 * @returns True if the payload matches the legacy format with context and lastChoice
 */
function isNextQuestionPayloadOld(payload: unknown): payload is NextQuestionPayloadOld {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'context' in payload &&
    'lastChoice' in payload &&
    typeof (payload as Record<string, unknown>).lastChoice === 'object' &&
    (payload as Record<string, unknown>).lastChoice !== null &&
    'questionId' in ((payload as Record<string, unknown>).lastChoice as Record<string, unknown>)
  );
}

/**
 * Type guard to check if payload uses the new format for LLM_GENERATE_DRAFT.
 *
 * @param payload - The payload to check
 * @returns True if the payload matches the new format with sessionId
 */
function isGenerateDraftPayloadNew(payload: unknown): payload is GenerateDraftPayloadNew {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'sessionId' in payload &&
    typeof (payload as Record<string, unknown>).sessionId === 'string'
  );
}

/**
 * Facade controller for the OKR clarification workflow.
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
   * @param elect - Electron instance (default: imported electron) - used for test injection
   */
  constructor(
    sessionRepository: SessionRepository,
    private readonly okrRepository: OkrRepository,
    actionLogWriter: ActionLogWriter,
    private readonly stickyWindowManager: StickyWindowManager,
    okrAgentService: OkrAgentService,
    private readonly elect: typeof electron = electron,
  ) {
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
   * Registers all IPC handlers for renderer communication.
   *
   * Sets up handlers for:
   * - CLARIFICATION_PROMPT: Process initial user intent
   * - CLARIFICATION_RESPOND: Record user selections
   * - LLM_NEXT_QUESTION: Get next clarification question (supports legacy format)
   * - LLM_GENERATE_DRAFT: Generate OKR draft (supports legacy format)
   * - STICKY_REOPEN: Reopen sticky window with latest OKR
   * - OKR_LATEST: Retrieve most recent OKR
   * - OKR_GENERATE: Generate and display new OKR
   *
   * @private
   */
  private registerHandlers(): void {
    // CLARIFICATION_PROMPT: Generate initial clarification prompt from user intent
    this.elect.ipcMain.handle(IPC_CHANNELS.CLARIFICATION_PROMPT, async (_event, payload) => {
      const { sessionId, intent } = payload;
      const prompt = await this.promptHandler.handlePrompt(sessionId, intent);

      // Log action asynchronously without blocking response
      void this.actionLogService
        .logAction('generate', prompt.id, null, `prompt:${prompt.id}`)
        .catch((error) => {
          this.actionLogService.logUnexpectedError('Failed to record generate action', error);
        });

      return { prompt };
    });

    // CLARIFICATION_RESPOND: Record user response to a clarification prompt
    this.elect.ipcMain.on(IPC_CHANNELS.CLARIFICATION_RESPOND, (_event, payload) => {
      const { sessionId, promptId, optionId } = payload;
      void this.responseHandler.handleResponse(sessionId, promptId, optionId).catch((error) => {
        this.actionLogService.logUnexpectedError('Failed to handle response', error);
      });
    });

    // LLM_NEXT_QUESTION: Get next question (supports both new and legacy payload formats)
    this.elect.ipcMain.handle(IPC_CHANNELS.LLM_NEXT_QUESTION, async (_event, payload) => {
      let sessionId: string;
      let currentQuestionId: string;
      let context: ClarificationContext;

      if (isNextQuestionPayloadNew(payload)) {
        // New format: { sessionId, currentQuestionId, context }
        sessionId = payload.sessionId;
        currentQuestionId = payload.currentQuestionId;
        context = payload.context;
      } else if (isNextQuestionPayloadOld(payload)) {
        // Legacy format: { context, lastChoice } - backward compatibility
        const currentSessionId = this.sessionManager.getCurrentSessionId();
        if (!currentSessionId) {
          throw new Error('No active session found. Please start a clarification session first.');
        }
        sessionId = currentSessionId;
        currentQuestionId = payload.lastChoice.questionId;
        context = payload.context;
      } else {
        throw new Error(
          'Invalid payload format for LLM_NEXT_QUESTION. Expected { sessionId, currentQuestionId, context } or { context, lastChoice }',
        );
      }

      const question = await this.promptHandler.getNextQuestion(
        sessionId,
        currentQuestionId,
        context,
      );
      return question;
    });

    // LLM_GENERATE_DRAFT: Generate OKR draft (supports both new and legacy payload formats)
    this.elect.ipcMain.handle(
      IPC_CHANNELS.LLM_GENERATE_DRAFT,
      async (_event, payload: GenerateDraftPayload) => {
        let sessionId: string;

        if (isGenerateDraftPayloadNew(payload)) {
          // New format: { sessionId }
          sessionId = payload.sessionId;
        } else if ('context' in payload && payload.context) {
          // Legacy format: { context } - backward compatibility, uses current session
          const currentSessionId = this.sessionManager.getCurrentSessionId();
          if (!currentSessionId) {
            throw new Error('No active session found. Please start a clarification session first.');
          }
          sessionId = currentSessionId;
        } else {
          throw new Error(
            'Invalid payload format for LLM_GENERATE_DRAFT. Expected { sessionId } or { context }',
          );
        }

        const result = await this.draftHandler.generateDraft(sessionId);
        await this.okrRepository.save(result.okr);
        this.elect.webContents
          .getAllWebContents()
          .forEach((wc) => wc.send(IPC_CHANNELS.OKR_GENERATE, result));
        await this.actionLogService.logAction(
          'generate',
          result.session.id,
          result.okr.id,
          `okr:${result.okr.id}`,
        );
        return result;
      },
    );

    // STICKY_REOPEN: Reopen the sticky window with the latest OKR
    this.elect.ipcMain.handle(IPC_CHANNELS.STICKY_REOPEN, async () => {
      const okr = await this.okrRepository.loadLatest();
      if (!okr) {
        return { success: false };
      }
      await this.stickyWindowManager.open(okr);
      return { success: true };
    });

    // OKR_LATEST: Retrieve the most recently generated OKR
    this.elect.ipcMain.handle(IPC_CHANNELS.OKR_LATEST, async () => {
      const okr = await this.okrRepository.loadLatest();
      return okr ?? null;
    });

    // OKR_GENERATE: Generate a new OKR and open it in the sticky window
    this.elect.ipcMain.handle(IPC_CHANNELS.OKR_GENERATE, async (_event, payload) => {
      const result = await this.draftHandler.generateDraft(payload.sessionId);
      await this.okrRepository.save(result.okr);
      await this.stickyWindowManager.open(result.okr);
      await this.sessionManager.endSession(payload.sessionId);
      await this.actionLogService.logAction(
        'generate',
        result.session.id,
        result.okr.id,
        `okr:${result.okr.id}`,
      );
      return result;
    });
  }

  // ==================== TestMode API ====================

  /**
   * Resets all active clarification sessions.
   *
   * Used in E2E tests to ensure clean state between test runs.
   */
  resetSessions(): void {
    this.sessionManager.cleanupSessions();
  }

  /**
   * Gets all active sessions for testing.
   *
   * @returns Map of session IDs to session objects
   */
  getAllSessions(): Map<string, ClarificationSession> {
    return this.sessionManager.getAllSessions();
  }

  /**
   * Gets the ID of the currently active session.
   *
   * @returns Current session ID or null if no session is active
   */
  getCurrentSessionId(): string | null {
    return this.sessionManager.getCurrentSessionId();
  }

  /**
   * Manually sets a session for testing purposes.
   *
   * @param sessionId - The session ID to set
   * @param session - The session object to store
   */
  setSession(sessionId: string, session: ClarificationSession): void {
    this.sessionManager.setSession(sessionId, session);
  }

  /**
   * Retrieves a session by ID for testing.
   *
   * @param sessionId - The session ID to retrieve
   * @returns The session object or undefined if not found
   */
  async getSessionForTest(sessionId: string): Promise<ClarificationSession | undefined> {
    return (await this.sessionManager.getSession(sessionId)) ?? undefined;
  }

  /**
   * Gets the count of active sessions.
   *
   * @returns Number of active sessions
   */
  getSessionCount(): number {
    return this.sessionManager.getSessionCount();
  }

  // ==================== Advanced API ====================

  /**
   * Gets the session manager instance.
   *
   * @returns The ClarificationSessionManager instance
   */
  getSessionManager(): ClarificationSessionManager {
    return this.sessionManager;
  }

  /**
   * Gets the state machine instance.
   *
   * @returns The ClarificationStateMachine instance
   */
  getStateMachine(): ClarificationStateMachine {
    return this.stateMachine;
  }

  /**
   * Gets the prompt handler instance.
   *
   * @returns The ClarificationPromptHandler instance
   */
  getPromptHandler(): ClarificationPromptHandler {
    return this.promptHandler;
  }

  /**
   * Gets the response handler instance.
   *
   * @returns The ClarificationResponseHandler instance
   */
  getResponseHandler(): ClarificationResponseHandler {
    return this.responseHandler;
  }

  /**
   * Gets the draft handler instance.
   *
   * @returns The ClarificationDraftHandler instance
   */
  getDraftHandler(): ClarificationDraftHandler {
    return this.draftHandler;
  }

  /**
   * Gets the persistence handler instance.
   *
   * @returns The ClarificationPersistenceHandler instance
   */
  getPersistenceHandler(): ClarificationPersistenceHandler {
    return this.persistenceHandler;
  }
}
