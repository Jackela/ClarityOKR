import type { ClarificationPrompt } from '@clarityokr/contracts';
import electron from 'electron';

import { IPCChannels } from '../bootstrap/ipc-channels.js';
import { Logger } from '../core/logger.js';
import type { LlmNextQuestionRequest, LlmNextQuestionResponse } from '../main/ipc.llm.js';
import type { OkrAgentService } from '../services/okr-agent.service.js';
import type { SessionManager } from '../services/session-manager.service.js';

/**
 * LlmNextQuestionHandler - 处理LLM_NEXT_QUESTION IPC请求
 * 职责：调用LLM获取下一个澄清问题
 */
export class LlmNextQuestionHandler {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly okrAgentService: OkrAgentService,
    private readonly elect: typeof electron = electron,
  ) {}

  async handle(payload: unknown): Promise<LlmNextQuestionResponse> {
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

    // 如果没有问题，表示澄清已完成
    if (!data.question) {
      Logger.info('[main] No more questions, clarification complete');
      return data;
    }

    // 将LLM问题映射为ClarificationPrompt并广播
    const session = await this.loadAndCacheSession();
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
    await this.sessionManager.addStep(session, prompt.id, sequence);

    // 广播到所有窗口
    this.elect.webContents
      .getAllWebContents()
      .forEach((wc) => wc.send(IPCChannels.CLARIFICATION_PROMPT, { prompt }));

    return data;
  }

  /**
   * 从持久化存储加载会话并缓存到内存
   */
  private async loadAndCacheSession() {
    return this.sessionManager.loadFromPersistence();
  }
}
