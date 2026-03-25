import {
  clarificationPromptRequestSchema,
  clarificationPromptResponseSchema,
  llmQuestionSchema,
  type ClarificationPrompt,
} from '@clarityokr/contracts';
import { z } from 'zod';

import { Logger } from '../core/logger.js';
import type { OkrAgentService } from '../services/okr-agent.service.js';
import type { IClarificationPromptHandler } from './interfaces/prompt-handler.interface.js';
import type { IClarificationSessionManager } from './interfaces/session-manager.interface.js';
import type { IClarificationStateMachine } from './interfaces/state-machine.interface.js';
import { ValidationError, LLMError } from './types.js';

// Zod schema for LLM next question response validation
const nextQuestionResponseSchema = z.object({
  question: llmQuestionSchema,
});

/**
 * ClarificationPromptHandler - 处理用户意图输入
 * 职责：验证用户输入并生成初始澄清提示
 */
export class ClarificationPromptHandler implements IClarificationPromptHandler {
  constructor(
    private readonly sessionManager: IClarificationSessionManager,
    private readonly stateMachine: IClarificationStateMachine,
    private readonly okrAgentService: OkrAgentService,
  ) {}

  /**
   * 处理用户意图输入
   */
  async handlePrompt(sessionId: string, intent: string): Promise<ClarificationPrompt> {
    // 验证输入
    if (!this.validateIntent(intent)) {
      throw new ValidationError('Intent must be at least 3 characters long');
    }

    // 获取或创建会话
    let session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      session = this.sessionManager.createSession(sessionId, intent);
    }

    Logger.info('[PromptHandler] Processing prompt request', {
      sessionId,
      intent,
      hasPersistedSession: Boolean(session.steps.length > 0),
    });

    // 调用 LLM 生成第一个问题
    let data: unknown;
    try {
      data = await this.okrAgentService.getNextQuestion(
        { turns: [] },
        { questionId: 'init', optionId: intent },
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('[PromptHandler] LLM getNextQuestion failed:', errorMsg);
      throw new LLMError(`Failed to generate clarification prompt: ${errorMsg}`);
    }

    if (!data || typeof data !== 'object') {
      throw new LLMError('Empty or invalid response from LLM service');
    }

    // 验证 LLM 响应
    const parseResult = nextQuestionResponseSchema.safeParse(data);
    if (!parseResult.success) {
      throw new LLMError(`LLM response validation failed: ${parseResult.error.message}`);
    }

    const typedData = parseResult.data;

    if (!typedData.question || !typedData.question.id || !typedData.question.text) {
      throw new LLMError('LLM response missing required question fields');
    }

    // 转换为 ClarificationPrompt
    const q = typedData.question;
    const prompt: ClarificationPrompt = {
      id: q.id,
      sequence: session.steps.length,
      question: q.text,
      context: 'LLM generated',
      options: (q.options ?? []).map((o) => ({
        id: o.id,
        label: o.label,
        description: undefined,
        scopeTag: 'llm',
      })),
    };

    // 更新会话
    session.steps.push(prompt);
    await this.sessionManager.saveSession(session);

    // 状态转换：collecting -> ready
    if (this.stateMachine.canTransition(session.status, 'ready')) {
      await this.stateMachine.transition(session, 'ready');
    }

    Logger.info('[PromptHandler] Prompt resolved', {
      promptId: prompt.id,
      sequence: prompt.sequence,
    });

    return clarificationPromptResponseSchema.parse({ prompt }).prompt;
  }

  /**
   * 验证用户意图
   */
  validateIntent(intent: string): boolean {
    return Boolean(intent && intent.trim().length >= 3);
  }

  /**
   * 获取下一个问题
   */
  async getNextQuestion(
    sessionId: string,
    currentQuestionId: string,
    context: { turns: Array<{ questionId: string; optionId: string; timestamp: string }> },
  ): Promise<ClarificationPrompt> {
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new ValidationError(`Session not found: ${sessionId}`);
    }

    let data: unknown;
    try {
      data = await this.okrAgentService.getNextQuestion(context, {
        questionId: currentQuestionId,
        optionId: '',
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('[PromptHandler] LLM getNextQuestion failed:', errorMsg);
      throw new LLMError(`Failed to get next question: ${errorMsg}`);
    }

    if (!data || typeof data !== 'object') {
      throw new LLMError('Empty or invalid response from LLM service');
    }

    const parseResult = nextQuestionResponseSchema.safeParse(data);
    if (!parseResult.success) {
      throw new LLMError(`LLM response validation failed: ${parseResult.error.message}`);
    }

    const typedData = parseResult.data;
    const q = typedData.question;
    const prompt: ClarificationPrompt = {
      id: q.id,
      sequence: session.steps.length,
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
    await this.sessionManager.saveSession(session);

    return clarificationPromptResponseSchema.parse({ prompt }).prompt;
  }
}
