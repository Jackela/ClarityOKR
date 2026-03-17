import type { ClarificationSession } from '@clarityokr/contracts';
import electron from 'electron';

import { IPCChannels } from '../bootstrap/ipc-channels.js';
import { ClarificationPromptHandler } from '../handlers/clarification-prompt.handler.js';
import { ClarificationRespondHandler } from '../handlers/clarification-respond.handler.js';
import { LlmGenerateDraftHandler } from '../handlers/llm-generate-draft.handler.js';
import { LlmNextQuestionHandler } from '../handlers/llm-next-question.handler.js';
import { OkrGenerateHandler } from '../handlers/okr-generate.handler.js';
import type { ActionLogWriter } from '../persistence/action-log-writer.js';
import type { OkrRepository } from '../persistence/okr-repository.js';
import type { SessionRepository } from '../persistence/session-repository.js';
import { ActionLogService } from '../services/action-log.service.js';
import type { OkrAgentService } from '../services/okr-agent.service.js';
import { SessionManager } from '../services/session-manager.service.js';
import type { StickyWindowManager } from './sticky-window-manager.js';

/**
 * ClarificationController - 澄清流程协调器（重构后）
 *
 * 职责：协调各个Handler处理IPC请求，不再直接处理业务逻辑
 * 将原有7个职责拆分到6个专门的类中：
 * - SessionManager: 会话生命周期管理
 * - ClarificationPromptHandler: CLARIFICATION_PROMPT处理
 * - ClarificationRespondHandler: CLARIFICATION_RESPOND处理
 * - LlmNextQuestionHandler: LLM_NEXT_QUESTION处理
 * - LlmGenerateDraftHandler: LLM_GENERATE_DRAFT处理
 * - OkrGenerateHandler: OKR_GENERATE处理
 */
export class ClarificationController {
  private readonly sessionManager: SessionManager;
  private readonly actionLogService: ActionLogService;

  // Handlers
  private readonly clarificationPromptHandler: ClarificationPromptHandler;
  private readonly clarificationRespondHandler: ClarificationRespondHandler;
  private readonly llmNextQuestionHandler: LlmNextQuestionHandler;
  private readonly llmGenerateDraftHandler: LlmGenerateDraftHandler;
  private readonly okrGenerateHandler: OkrGenerateHandler;

  constructor(
    sessionRepository: SessionRepository,
    private readonly okrRepository: OkrRepository,
    actionLogWriter: ActionLogWriter,
    private readonly stickyWindowManager: StickyWindowManager,
    okrAgentService: OkrAgentService,
    private readonly elect: typeof electron = electron,
  ) {
    // 初始化服务
    this.sessionManager = new SessionManager(sessionRepository);
    this.actionLogService = new ActionLogService(actionLogWriter);

    // 初始化Handlers（依赖注入）
    this.clarificationPromptHandler = new ClarificationPromptHandler(
      this.sessionManager,
      okrAgentService,
    );
    this.clarificationRespondHandler = new ClarificationRespondHandler(this.sessionManager);
    this.llmNextQuestionHandler = new LlmNextQuestionHandler(
      this.sessionManager,
      okrAgentService,
      this.elect,
    );
    this.llmGenerateDraftHandler = new LlmGenerateDraftHandler(
      this.sessionManager,
      this.okrRepository,
      okrAgentService,
      this.elect,
    );
    this.okrGenerateHandler = new OkrGenerateHandler(
      this.sessionManager,
      this.okrRepository,
      this.stickyWindowManager,
    );

    this.registerHandlers();
  }

  private registerHandlers(): void {
    // CLARIFICATION_PROMPT: 生成初始澄清提示
    this.elect.ipcMain.handle(IPCChannels.CLARIFICATION_PROMPT, async (_event, payload) => {
      const result = await this.clarificationPromptHandler.handle(payload);
      // 异步记录日志，不阻塞主流程
      void this.actionLogService
        .logAction('generate', result.prompt.id, null, `prompt:${result.prompt.id}`)
        .catch((error) => {
          this.actionLogService.logUnexpectedError('Failed to record generate action', error);
        });
      return result;
    });

    // CLARIFICATION_RESPOND: 记录用户响应
    this.elect.ipcMain.on(IPCChannels.CLARIFICATION_RESPOND, (_event, payload) => {
      void this.clarificationRespondHandler.handle(payload).catch((error) => {
        this.actionLogService.logUnexpectedError('Failed to handle response', error);
      });
    });

    // OKR_GENERATE: 生成OKR文档
    this.elect.ipcMain.handle(IPCChannels.OKR_GENERATE, async (_event, payload) => {
      const result = await this.okrGenerateHandler.handle(payload);
      // 记录生成动作
      await this.actionLogService.logAction(
        'generate',
        result.session.id,
        result.okr.id,
        `okr:${result.okr.id}`,
      );
      return result;
    });

    // STICKY_REOPEN: 重新打开浮动窗口
    this.elect.ipcMain.handle(IPCChannels.STICKY_REOPEN, async () => {
      const okr = await this.okrRepository.loadLatest();
      if (!okr) {
        return { success: false };
      }
      await this.stickyWindowManager.open(okr);
      return { success: true };
    });

    // OKR_LATEST: 获取最新OKR
    this.elect.ipcMain.handle(IPCChannels.OKR_LATEST, async () => {
      const okr = await this.okrRepository.loadLatest();
      return okr ?? null;
    });

    // LLM_NEXT_QUESTION: 获取下一个LLM问题
    this.elect.ipcMain.handle(IPCChannels.LLM_NEXT_QUESTION, async (_event, payload) => {
      return this.llmNextQuestionHandler.handle(payload);
    });

    // LLM_GENERATE_DRAFT: 生成OKR草案
    this.elect.ipcMain.handle(IPCChannels.LLM_GENERATE_DRAFT, async (_event, payload) => {
      return this.llmGenerateDraftHandler.handle(payload);
    });
  }

  // ==================== TestMode API Support ====================

  /**
   * Reset all session state (for test mode)
   */
  resetSessions(): void {
    this.sessionManager.resetSessions();
  }

  /**
   * Get all sessions (for test mode)
   */
  getAllSessions(): Map<string, ClarificationSession> {
    return this.sessionManager.getAllSessions();
  }

  /**
   * Get the current active session ID (for test mode)
   */
  getCurrentSessionId(): string | null {
    return this.sessionManager.getCurrentSessionId();
  }

  /**
   * Set a session directly (for test mode)
   */
  setSession(sessionId: string, session: ClarificationSession): void {
    this.sessionManager.setSession(sessionId, session);
  }

  /**
   * Get a session by ID (for test mode)
   */
  async getSessionForTest(sessionId: string): Promise<ClarificationSession | undefined> {
    return this.sessionManager.getSessionForTest(sessionId);
  }

  /**
   * Get the number of active sessions (for test mode)
   */
  getSessionCount(): number {
    return this.sessionManager.getSessionCount();
  }
}
