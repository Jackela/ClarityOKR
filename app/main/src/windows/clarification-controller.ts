import { randomUUID } from 'node:crypto';

import {
  clarificationOptionSelectionSchema,
  clarificationPromptRequestSchema,
  clarificationPromptResponseSchema,
  clarificationSessionSchema,
  generateOKRRequestSchema,
  generateOKRResponseSchema,
} from '@clarityokr/contracts';
import type {
  ClarificationPrompt,
  ClarificationSession,
  KeyResult,
  OKRDocument,
  UserActionLogEntry,
} from '@clarityokr/contracts';

import electron from 'electron';

import { IPCChannels } from '../bootstrap/ipc-channels.js';
import { Logger } from '../core/logger.js';
import type {
  LlmNextQuestionRequest,
  LlmNextQuestionResponse,
  OkrDraftRequest,
  OkrDraftResponse,
} from '../main/ipc.llm.js';
import { OkrAgentService } from '../services/okr-agent.service.js';
import { ActionLogWriter } from '../persistence/action-log-writer.js';
import { OkrRepository } from '../persistence/okr-repository.js';
import { SessionRepository } from '../persistence/session-repository.js';
import { StickyWindowManager } from './sticky-window-manager.js';

export class ClarificationController {
  private readonly sessions = new Map<string, ClarificationSession>();
  private currentSessionId: string | null = null;

  constructor(
    private readonly sessionRepository: SessionRepository,
    private readonly okrRepository: OkrRepository,
    private readonly actionLogWriter: ActionLogWriter,
    private readonly stickyWindowManager: StickyWindowManager,
    private readonly okrAgentService: OkrAgentService,
    private readonly elect: typeof electron = electron,
  ) {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.elect.ipcMain.handle(IPCChannels.CLARIFICATION_PROMPT, async (_event, payload) => {
      const request = clarificationPromptRequestSchema.parse(payload);

      // Get session from memory cache or persistent storage
      let session = await this.getSession(request.sessionId);

      Logger.info('[main] prompt request received', {
        sessionId: request.sessionId,
        intent: request.intent,
        hasPersistedSession: Boolean(session),
      });

      const now = new Date().toISOString();
      if (!session) {
        session = {
          id: request.sessionId,
          initialIntent: request.intent,
          status: 'collecting',
          createdAt: now,
          updatedAt: now,
          steps: [],
          selectedOptionIds: [],
          confidence: 0,
          pendingQuestionId: null,
        };
        this.sessions.set(request.sessionId, session);
      }

      // Use LLM to generate the initial prompt as well
      let data: unknown;
      try {
        data = await this.okrAgentService.getNextQuestion(
          { turns: [] },
          { questionId: 'init', optionId: request.intent },
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        Logger.error('[main] LLM getNextQuestion failed:', errorMsg);
        throw new Error(`Failed to generate clarification prompt: ${errorMsg}`);
      }

      if (!data || typeof data !== 'object') {
        throw new Error('Empty or invalid response from LLM service');
      }

      type NextQ = {
        question: {
          id: string;
          text: string;
          options: Array<{ id: string; label: string; value?: string }>;
        };
      };
      const typedData = data as NextQ;

      if (!typedData.question || !typedData.question.id || !typedData.question.text) {
        throw new Error('LLM response missing required question fields');
      }

      const q = typedData.question;
      const nextPrompt: ClarificationPrompt = {
        id: q.id,
        sequence: 0,
        question: q.text,
        context: 'LLM generated',
        options: (q.options ?? []).map((o) => ({
          id: o.id,
          label: o.label,
          description: undefined,
          scopeTag: 'llm',
        })),
      };

      session.steps = [...session.steps, nextPrompt];
      session.pendingQuestionId = nextPrompt.id;
      session.updatedAt = new Date().toISOString();

      // Save session to both memory and persistence
      await this.saveSession(session);
      void this.logAction({
        actionType: 'generate',
        sessionId: session.id,
        okrId: null,
        payloadSummary: `prompt:${nextPrompt.id}`,
      }).catch((error) => {
        this.logUnexpectedError('Failed to record generate action', error);
      });

      Logger.info('[main] prompt resolved', {
        promptId: nextPrompt.id,
        sequence: nextPrompt.sequence,
      });
      return clarificationPromptResponseSchema.parse({ prompt: nextPrompt });
    });

    this.elect.ipcMain.on(IPCChannels.CLARIFICATION_RESPOND, (event, payload) => {
      // Persist selection only; next prompt will be produced by LLM path
      void this.handleResponse(payload);
    });

    this.elect.ipcMain.handle(IPCChannels.OKR_GENERATE, async (_event, payload) => {
      const request = generateOKRRequestSchema.parse(payload);

      // Get session from memory cache or persistent storage
      let session = await this.getSession(request.sessionId);

      if (!session) {
        throw new Error('No active session found for OKR generation.');
      }
      const okr = this.buildOkrDocument(session, request.intentSummary);

      Logger.info('[main] generating OKR document', {
        sessionId: session.id,
        okrId: okr.id,
      });

      session.status = 'completed';
      session.updatedAt = okr.generatedAt;
      session.pendingQuestionId = null;
      session.confidence = Math.max(session.confidence, 0.9);

      // Save session to both memory and persistence
      await this.saveSession(session);
      await this.okrRepository.save(okr);

      await this.logAction({
        actionType: 'generate',
        sessionId: session.id,
        okrId: okr.id,
        payloadSummary: `okr:${okr.id}`,
      });

      await this.stickyWindowManager.open(okr);

      return generateOKRResponseSchema.parse({ okr, session });
    });

    this.elect.ipcMain.handle(IPCChannels.STICKY_REOPEN, async () => {
      const okr = await this.okrRepository.loadLatest();
      if (!okr) {
        return { success: false };
      }

      await this.stickyWindowManager.open(okr);
      return { success: true };
    });

    this.elect.ipcMain.handle(IPCChannels.OKR_LATEST, async () => {
      const okr = await this.okrRepository.loadLatest();
      return okr ?? null;
    });

    // LLM-backed handlers for real-time clarification and OKR generation
    this.elect.ipcMain.handle(
      IPCChannels.LLM_NEXT_QUESTION,
      async (_event, payload): Promise<LlmNextQuestionResponse> => {
        const body = payload as LlmNextQuestionRequest;

        let data: LlmNextQuestionResponse;
        try {
          data = (await this.okrAgentService.getNextQuestion(
            body.context,
            body.lastChoice,
          )) as LlmNextQuestionResponse;
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          Logger.error('[main] LLM getNextQuestion failed:', errorMsg);
          throw new Error(`Failed to get next question: ${errorMsg}`);
        }

        if (!data || typeof data !== 'object') {
          throw new Error('Empty or invalid response from LLM next question service');
        }

        // If no question, it means clarification is complete (no more questions)
        if (!data.question) {
          Logger.info('[main] No more questions, clarification complete');
          return data;
        }

        // Map LLM question into ClarificationPrompt and broadcast
        // Get any existing session from persistence
        let session: ClarificationSession | null = null;
        const persisted = await this.sessionRepository.load();
        if (persisted.session) {
          session = clarificationSessionSchema.parse(persisted.session);
          // Update memory cache
          this.sessions.set(session.id, session);
        }
        if (!session) {
          return data;
        }
        const sequence = session.steps.length;
        const q = data.question;
        const prompt: ClarificationPrompt = {
          id: q.id,
          sequence,
          question: q.text,
          context: 'LLM generated',
          options: (q.options ?? []).map((o) => ({
            id: o.id,
            label: o.label,
            description: undefined,
            scopeTag: 'llm',
          })),
        };
        session.steps.push(prompt);
        session.pendingQuestionId = prompt.id;
        session.updatedAt = new Date().toISOString();
        // Save session to both memory and persistence
        await this.saveSession(session);
        this.elect.webContents
          .getAllWebContents()
          .forEach((wc) => wc.send(IPCChannels.CLARIFICATION_PROMPT, { prompt }));
        return data;
      },
    );

    this.elect.ipcMain.handle(
      IPCChannels.LLM_GENERATE_DRAFT,
      async (_event, payload): Promise<OkrDraftResponse> => {
        const body = payload as OkrDraftRequest;
        const requestSessionId = body.sessionId;

        // Validate sessionId
        if (!requestSessionId) {
          throw new Error('Session ID is required for LLM draft generation');
        }

        // Get session from memory cache or persistent storage
        let session = await this.getSession(requestSessionId);

        if (session) {
          Logger.info(
            `[ClarificationController] Session ${requestSessionId} restored from persistence`,
          );
        }

        // Still not found: Log available sessions and throw error
        if (!session) {
          const availableSessions = Array.from(this.sessions.keys()).join(', ');
          Logger.error(
            `[ClarificationController] Session ${requestSessionId} not found. Available sessions: ${availableSessions || '(none)'}`,
          );
          throw new Error(
            `No active session found for LLM draft generation. Session ID: ${requestSessionId}`,
          );
        }

        const context = body.context ?? {
          turns: session.steps.map((p) => ({
            questionId: p.id,
            optionId: 'unknown',
            timestamp: new Date().toISOString(),
          })),
        };

        let llmDraft: unknown;
        try {
          llmDraft = await this.okrAgentService.generateDraft(context);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          Logger.error('[main] LLM generateDraft failed:', errorMsg);
          throw new Error(`Failed to generate OKR draft: ${errorMsg}`);
        }

        if (!llmDraft || typeof llmDraft !== 'object') {
          throw new Error('Empty or invalid response from LLM draft service');
        }

        type DraftKR = { id?: string; statement?: string; target?: unknown; measurement?: string };
        type DraftObj = {
          id?: string;
          title?: string;
          description?: string;
          keyResults?: DraftKR[];
        };
        type DraftPayload = { draft?: { objectives?: DraftObj[] } };
        const draft = (llmDraft as DraftPayload).draft;

        if (
          !draft ||
          !draft.objectives ||
          !Array.isArray(draft.objectives) ||
          draft.objectives.length === 0
        ) {
          throw new Error('LLM draft response missing required objectives field');
        }

        const first = draft.objectives[0];
        if (!first || (!first.title && !first.description)) {
          throw new Error('LLM draft objective missing required title or description');
        }

        const okr: OKRDocument = {
          id: randomUUID(),
          objective: first.title ?? first.description ?? '自动生成的目标',
          keyResults: (first.keyResults ?? []).slice(0, 5).map((kr) => ({
            id: String(kr?.id ?? randomUUID()),
            statement: String(kr?.statement ?? ''),
            successMetric:
              typeof kr?.target !== 'undefined' && typeof kr?.measurement === 'string'
                ? `${String(kr.target)} ${kr.measurement}`
                : undefined,
            owner: undefined,
          })),
          sourceSessionId: session.id,
          generatedAt: new Date().toISOString(),
          lastEditedAt: null,
          regenerationPolicy: 'append',
          manualEdits: [],
        };

        await this.okrRepository.save(okr);

        const response = generateOKRResponseSchema.parse({ okr, session });
        this.elect.webContents
          .getAllWebContents()
          .forEach((wc) => wc.send(IPCChannels.OKR_GENERATE, response));
        return response;
      },
    );
  }

  private async logAction(entry: Omit<UserActionLogEntry, 'id' | 'occurredAt'>): Promise<void> {
    const action: UserActionLogEntry = {
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      ...entry,
    };

    await this.actionLogWriter.append(action);
  }

  private async handleResponse(payload: unknown): Promise<void> {
    const response = clarificationOptionSelectionSchema.parse(payload);

    Logger.info('[main] handleResponse: recording selection', {
      sessionId: response.sessionId,
      promptId: response.promptId,
      optionId: response.optionId,
    });

    // Get session from memory cache or persistent storage
    let session = await this.getSession(response.sessionId);

    if (!session) {
      Logger.warn('[main] handleResponse: session not found', {
        requestedId: response.sessionId,
      });
      throw new Error('Cannot record selection without an active clarification session.');
    }

    session.selectedOptionIds = [...session.selectedOptionIds, response.optionId];
    session.pendingQuestionId = null;
    session.updatedAt = new Date().toISOString();

    // Save session to both memory and persistence
    await this.saveSession(session);

    Logger.info('[ClarificationController] handleResponse: selection saved', {
      sessionId: session.id,
      selectedOptionCount: session.selectedOptionIds.length,
    });
    void this.logAction({
      actionType: 'edit',
      sessionId: session.id,
      okrId: null,
      payloadSummary: `selected:${response.optionId}`,
    }).catch((error) => {
      this.logUnexpectedError('Failed to record selection action', error);
    });
  }

  /**
   * Unified method to save session to both memory cache and persistent storage
   */
  private async saveSession(session: ClarificationSession): Promise<void> {
    // Update memory cache
    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;

    // Sync to persistent storage
    await this.sessionRepository.saveSession(session);

    Logger.info(`[ClarificationController] Session ${session.id} saved to memory and persistence`);
  }

  private buildOkrDocument(session: ClarificationSession, intentSummary: string): OKRDocument {
    const generatedAt = new Date().toISOString();

    const objective = `围绕"${intentSummary}"提升执行成效`;
    const keyResults = this.createKeyResults(intentSummary);

    return {
      id: randomUUID(),
      objective,
      keyResults,
      sourceSessionId: session.id,
      generatedAt,
      lastEditedAt: null,
      regenerationPolicy: 'append',
      manualEdits: [],
    } satisfies OKRDocument;
  }

  private logUnexpectedError(message: string, error: unknown): void {
    if (error instanceof Error) {
      Logger.error(message, error);
      return;
    }

    let serialized: string;

    if (typeof error === 'string') {
      serialized = error;
    } else if (typeof error === 'object' && error !== null) {
      try {
        serialized = JSON.stringify(error, undefined, 2);
      } catch {
        serialized = '[object Object]';
      }
    } else {
      serialized = String(error);
    }

    Logger.error(message, new Error(serialized));
  }

  private createKeyResults(intentSummary: string): KeyResult[] {
    return [
      {
        id: randomUUID(),
        statement: `为"${intentSummary}"设定可衡量的流程节奏`,
        successMetric: '每周复盘 1 次',
        owner: '团队负责人',
      },
      {
        id: randomUUID(),
        statement: `建立 ${intentSummary} 成果指标追踪`,
        successMetric: '关键指标提升 15%',
        owner: undefined,
      },
    ];
  }

  // ==================== TestMode API Support ====================

  /**
   * Reset all session state (for test mode)
   * Clears both in-memory sessions and current session tracking
   */
  resetSessions(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    this.currentSessionId = null;
    Logger.info(`[ClarificationController] All sessions cleared (${count} sessions)`);
  }

  /**
   * Get all sessions (for test mode)
   * @returns A copy of the sessions map
   */
  getAllSessions(): Map<string, ClarificationSession> {
    return new Map(this.sessions);
  }

  /**
   * Get the current active session ID (for test mode)
   * Returns the most recently saved/accessed session
   * @returns The current session ID or null
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Set a session directly (for test mode)
   * @param sessionId - The session ID
   * @param session - The session data
   */
  setSession(sessionId: string, session: ClarificationSession): void {
    this.sessions.set(sessionId, session);
    this.currentSessionId = sessionId;
    Logger.info(`[ClarificationController] Session ${sessionId} set manually`);
  }

  /**
   * Get a session by ID (for test mode)
   * @param sessionId - The session ID
   * @returns The session or undefined
   */
  async getSessionForTest(sessionId: string): Promise<ClarificationSession | undefined> {
    const session = await this.getSession(sessionId);
    return session ?? undefined;
  }

  /**
   * Get the number of active sessions (for test mode)
   * @returns The count of sessions in memory
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get session from memory cache or load from persistent storage
   * @param sessionId - The session ID to look up
   * @returns The session if found, null otherwise
   */
  private async getSession(sessionId: string): Promise<ClarificationSession | null> {
    // Try memory cache first
    let session = this.sessions.get(sessionId);
    if (session) {
      return session;
    }

    // Fall back to persistent storage
    const persisted = await this.sessionRepository.load();
    if (persisted.session && persisted.session.id === sessionId) {
      session = clarificationSessionSchema.parse(persisted.session);
      this.sessions.set(sessionId, session);
      return session;
    }

    return null;
  }
}
