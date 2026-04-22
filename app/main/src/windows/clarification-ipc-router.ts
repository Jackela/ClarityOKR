/**
 * Clarification IPC Router
 *
 * This module handles all IPC channel registration and routing for the
 * clarification workflow. It sets up handlers for communication between
 * the main process and renderer, supporting both new and legacy payload
 * formats for backward compatibility.
 *
 * @module windows/clarification-ipc-router
 */

import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';

import { IPC_CHANNELS } from '../bootstrap/ipc-channels.js';
import type {
  ClarificationDraftHandler,
  ClarificationPromptHandler,
  ClarificationResponseHandler,
  ClarificationSessionManager,
} from '../clarification/index.js';
import type { OkrRepository } from '../persistence/okr-repository.js';
import type { ActionLogService } from '../services/action-log.service.js';
import type { OkrRegenerationService } from '../services/okr-regeneration.service.js';
import type { StickyWindowManager } from './sticky-window-manager.js';
import {
  isGenerateDraftPayloadNew,
  isGenerateDraftPayloadOld,
  isNextQuestionPayloadNew,
  isNextQuestionPayloadOld,
  type ClarificationContext,
  type GenerateDraftPayload,
} from './clarification-ipc-payloads.js';

/**
 * Dependencies required for IPC routing.
 */
export interface ClarificationIpcRouterDeps {
  /** Electron IPC main instance */
  ipcMain: IpcMain;
  /** Function to get all web contents for broadcasting */
  getAllWebContents: () => WebContents[];
  /** Session manager for session operations */
  sessionManager: ClarificationSessionManager;
  /** Prompt handler for question generation */
  promptHandler: ClarificationPromptHandler;
  /** Response handler for recording user selections */
  responseHandler: ClarificationResponseHandler;
  /** Draft handler for OKR generation */
  draftHandler: ClarificationDraftHandler;
  /** Repository for OKR persistence */
  okrRepository: OkrRepository;
  /** Manager for sticky window lifecycle */
  stickyWindowManager: StickyWindowManager;
  /** Service for OKR regeneration */
  okrRegenerationService: OkrRegenerationService;
  /** Service for action logging */
  actionLogService: ActionLogService;
}

/**
 * Router for clarification IPC channels.
 *
 * Registers and handles all IPC communication between the main process
 * and renderer for the clarification workflow.
 */
export class ClarificationIpcRouter {
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
   * @param deps - Dependencies required for IPC routing
   */
  static registerHandlers(deps: ClarificationIpcRouterDeps): void {
    const {
      ipcMain,
      getAllWebContents,
      sessionManager,
      promptHandler,
      responseHandler,
      draftHandler,
      okrRepository,
      stickyWindowManager,
      actionLogService,
    } = deps;

    // CLARIFICATION_PROMPT: Generate initial clarification prompt from user intent
    ipcMain.handle(IPC_CHANNELS.CLARIFICATION_PROMPT, async (_event, payload) => {
      const { sessionId, intent } = payload;
      const prompt = await promptHandler.handlePrompt(sessionId, intent);

      // Log action asynchronously without blocking response
      void actionLogService
        .logAction('generate', prompt.id, null, `prompt:${prompt.id}`)
        .catch((error) => {
          actionLogService.logUnexpectedError('Failed to record generate action', error);
        });

      return { prompt };
    });

    // CLARIFICATION_RESPOND: Record user response to a clarification prompt
    ipcMain.on(IPC_CHANNELS.CLARIFICATION_RESPOND, (_event, payload) => {
      const { sessionId, promptId, optionId } = payload;
      void responseHandler.handleResponse(sessionId, promptId, optionId).catch((error) => {
        actionLogService.logUnexpectedError('Failed to handle response', error);
      });
    });

    // LLM_NEXT_QUESTION: Get next question (supports both new and legacy payload formats)
    ipcMain.handle(IPC_CHANNELS.LLM_NEXT_QUESTION, async (_event, payload) => {
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
        const currentSessionId = sessionManager.getCurrentSessionId();
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

      const question = await promptHandler.getNextQuestion(sessionId, currentQuestionId, context);
      return question;
    });

    // LLM_GENERATE_DRAFT: Generate OKR draft (supports both new and legacy payload formats)
    ipcMain.handle(
      IPC_CHANNELS.LLM_GENERATE_DRAFT,
      async (_event: IpcMainInvokeEvent, payload: GenerateDraftPayload) => {
        let sessionId: string;

        if (isGenerateDraftPayloadNew(payload)) {
          // New format: { sessionId }
          sessionId = payload.sessionId;
        } else if (isGenerateDraftPayloadOld(payload)) {
          // Legacy format: { context } - backward compatibility, uses current session
          const currentSessionId = sessionManager.getCurrentSessionId();
          if (!currentSessionId) {
            throw new Error('No active session found. Please start a clarification session first.');
          }
          sessionId = currentSessionId;
        } else {
          throw new Error(
            'Invalid payload format for LLM_GENERATE_DRAFT. Expected { sessionId } or { context }',
          );
        }

        const result = await draftHandler.generateDraft(sessionId);
        await okrRepository.save(result.okr);
        getAllWebContents().forEach((wc) => wc.send(IPC_CHANNELS.OKR_GENERATE, result));
        await actionLogService.logAction(
          'generate',
          result.session.id,
          result.okr.id,
          `okr:${result.okr.id}`,
        );
        return result;
      },
    );

    // STICKY_REOPEN: Reopen the sticky window with the latest OKR
    ipcMain.handle(IPC_CHANNELS.STICKY_REOPEN, async () => {
      const okr = await okrRepository.loadLatest();
      if (!okr) {
        return { success: false };
      }
      await stickyWindowManager.open(okr);
      return { success: true };
    });

    // OKR_LATEST: Retrieve the most recently generated OKR
    ipcMain.handle(IPC_CHANNELS.OKR_LATEST, async () => {
      const okr = await okrRepository.loadLatest();
      return okr ?? null;
    });

    // OKR_GENERATE: Generate a new OKR and open it in the sticky window
    ipcMain.handle(IPC_CHANNELS.OKR_GENERATE, async (_event, payload) => {
      const result = await draftHandler.generateDraft(payload.sessionId);
      await okrRepository.save(result.okr);
      await stickyWindowManager.open(result.okr);
      await sessionManager.endSession(payload.sessionId);
      await actionLogService.logAction(
        'generate',
        result.session.id,
        result.okr.id,
        `okr:${result.okr.id}`,
      );
      return result;
    });
  }
}
