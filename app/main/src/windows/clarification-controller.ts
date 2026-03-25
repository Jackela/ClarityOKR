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

    // LLM_NEXT_QUESTION: 获取下一个问题
    this.elect.ipcMain.handle(IPC_CHANNELS.LLM_NEXT_QUESTION, async (_event, payload) => {
      const { sessionId, currentQuestionId, context } = payload;
      const question = await this.promptHandler.getNextQuestion(
        sessionId,
        currentQuestionId,
        context,
      );
      return question;
    });

    // LLM_GENERATE_DRAFT: 生成OKR草案
    this.elect.ipcMain.handle(IPC_CHANNELS.LLM_GENERATE_DRAFT, async (_event, payload) => {
      const result = await this.draftHandler.generateDraft(payload.sessionId);
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
    });

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
