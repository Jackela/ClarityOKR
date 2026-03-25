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

interface ClarificationTurn {
  questionId: string;
  optionId: string;
  timestamp: string;
}

interface ClarificationContext {
  turns: ClarificationTurn[];
}

interface LastChoice {
  questionId: string;
  optionId: string;
}

/** New format for LLM_NEXT_QUESTION */
interface NextQuestionPayloadNew {
  sessionId: string;
  currentQuestionId: string;
  context: ClarificationContext;
}

/** Old format for LLM_NEXT_QUESTION (backward compatibility) */
interface NextQuestionPayloadOld {
  context: ClarificationContext;
  lastChoice: LastChoice;
}

/** Union type for LLM_NEXT_QUESTION payload */
type NextQuestionPayload = NextQuestionPayloadNew | NextQuestionPayloadOld;

/** New format for LLM_GENERATE_DRAFT */
interface GenerateDraftPayloadNew {
  sessionId: string;
}

/** Old format for LLM_GENERATE_DRAFT (backward compatibility) */
interface GenerateDraftPayloadOld {
  context: ClarificationContext;
}

/** Union type for LLM_GENERATE_DRAFT payload */
type GenerateDraftPayload = GenerateDraftPayloadNew | GenerateDraftPayloadOld;

/**
 * Type guard to check if payload is new format for LLM_NEXT_QUESTION
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
 * Type guard to check if payload is old format for LLM_NEXT_QUESTION
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
 * Type guard to check if payload is new format for LLM_GENERATE_DRAFT
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
 * ClarificationController - 澄清流程协调器 (Facade模式)
 *
 * 职责：协调6个专用类处理IPC请求，作为简化的统一接口
 * - ClarificationSessionManager: 会话生命周期管理
 * - ClarificationStateMachine: 状态转换管理
 * - ClarificationPromptHandler: 处理用户意图输入
 * - ClarificationResponseHandler: 处理用户选择响应
 * - ClarificationDraftHandler: OKR草稿生成管理
 * - ClarificationPersistenceHandler: 会话持久化操作
 */
export class ClarificationController {
  // 专用类实例
  private readonly sessionManager: ClarificationSessionManager;
  private readonly stateMachine: ClarificationStateMachine;
  private readonly promptHandler: ClarificationPromptHandler;
  private readonly responseHandler: ClarificationResponseHandler;
  private readonly draftHandler: ClarificationDraftHandler;
  private readonly persistenceHandler: ClarificationPersistenceHandler;
  private readonly actionLogService: ActionLogService;

  constructor(
    sessionRepository: SessionRepository,
    private readonly okrRepository: OkrRepository,
    actionLogWriter: ActionLogWriter,
    private readonly stickyWindowManager: StickyWindowManager,
    okrAgentService: OkrAgentService,
    private readonly elect: typeof electron = electron,
  ) {
    // 初始化专用类（依赖注入）
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

  private registerHandlers(): void {
    // CLARIFICATION_PROMPT: 生成初始澄清提示
    this.elect.ipcMain.handle(IPC_CHANNELS.CLARIFICATION_PROMPT, async (_event, payload) => {
      const { sessionId, intent } = payload;
      const prompt = await this.promptHandler.handlePrompt(sessionId, intent);

      // 异步记录日志
      void this.actionLogService
        .logAction('generate', prompt.id, null, `prompt:${prompt.id}`)
        .catch((error) => {
          this.actionLogService.logUnexpectedError('Failed to record generate action', error);
        });

      return { prompt };
    });

    // CLARIFICATION_RESPOND: 记录用户响应
    this.elect.ipcMain.on(IPC_CHANNELS.CLARIFICATION_RESPOND, (_event, payload) => {
      const { sessionId, promptId, optionId } = payload;
      void this.responseHandler.handleResponse(sessionId, promptId, optionId).catch((error) => {
        this.actionLogService.logUnexpectedError('Failed to handle response', error);
      });
    });

    // LLM_NEXT_QUESTION: 获取下一个问题 (支持新旧两种payload格式)
    this.elect.ipcMain.handle(IPC_CHANNELS.LLM_NEXT_QUESTION, async (_event, payload) => {
      let sessionId: string;
      let currentQuestionId: string;
      let context: ClarificationContext;

      if (isNextQuestionPayloadNew(payload)) {
        // 新格式: { sessionId, currentQuestionId, context }
        sessionId = payload.sessionId;
        currentQuestionId = payload.currentQuestionId;
        context = payload.context;
      } else if (isNextQuestionPayloadOld(payload)) {
        // 旧格式: { context, lastChoice } - 向后兼容
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

    // LLM_GENERATE_DRAFT: 生成OKR草案 (支持新旧两种payload格式)
    this.elect.ipcMain.handle(
      IPC_CHANNELS.LLM_GENERATE_DRAFT,
      async (_event, payload: GenerateDraftPayload) => {
        let sessionId: string;

        if (isGenerateDraftPayloadNew(payload)) {
          // 新格式: { sessionId }
          sessionId = payload.sessionId;
        } else if ('context' in payload && payload.context) {
          // 旧格式: { context } - 向后兼容，使用当前会话
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

    // STICKY_REOPEN: 重新打开浮动窗口
    this.elect.ipcMain.handle(IPC_CHANNELS.STICKY_REOPEN, async () => {
      const okr = await this.okrRepository.loadLatest();
      if (!okr) {
        return { success: false };
      }
      await this.stickyWindowManager.open(okr);
      return { success: true };
    });

    // OKR_LATEST: 获取最新OKR
    this.elect.ipcMain.handle(IPC_CHANNELS.OKR_LATEST, async () => {
      const okr = await this.okrRepository.loadLatest();
      return okr ?? null;
    });

    // OKR_GENERATE: 生成OKR（直接使用草稿生成）
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
  resetSessions(): void {
    this.sessionManager.cleanupSessions();
  }
  getAllSessions(): Map<string, ClarificationSession> {
    return this.sessionManager.getAllSessions();
  }
  getCurrentSessionId(): string | null {
    return this.sessionManager.getCurrentSessionId();
  }
  setSession(sessionId: string, session: ClarificationSession): void {
    this.sessionManager.setSession(sessionId, session);
  }
  async getSessionForTest(sessionId: string): Promise<ClarificationSession | undefined> {
    return (await this.sessionManager.getSession(sessionId)) ?? undefined;
  }
  getSessionCount(): number {
    return this.sessionManager.getSessionCount();
  }

  // ==================== Advanced API ====================
  getSessionManager(): ClarificationSessionManager {
    return this.sessionManager;
  }
  getStateMachine(): ClarificationStateMachine {
    return this.stateMachine;
  }
  getPromptHandler(): ClarificationPromptHandler {
    return this.promptHandler;
  }
  getResponseHandler(): ClarificationResponseHandler {
    return this.responseHandler;
  }
  getDraftHandler(): ClarificationDraftHandler {
    return this.draftHandler;
  }
  getPersistenceHandler(): ClarificationPersistenceHandler {
    return this.persistenceHandler;
  }
}
