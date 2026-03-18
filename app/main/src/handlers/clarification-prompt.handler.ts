import {
  clarificationPromptRequestSchema,
  clarificationPromptResponseSchema,
  llmQuestionSchema,
} from '@clarityokr/contracts';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { z } from 'zod';

import { Logger } from '../core/logger.js';
import type { OkrAgentService } from '../services/okr-agent.service.js';
import type { SessionManager } from '../services/session-manager.service.js';

export interface ClarificationPromptRequest {
  sessionId: string;
  intent: string;
}

// Zod schema for LLM next question response validation
const nextQuestionResponseSchema = z.object({
  question: llmQuestionSchema,
});

/**
 * ClarificationPromptHandler - 处理CLARIFICATION_PROMPT IPC请求
 * 职责：生成初始澄清问题提示
 */
export class ClarificationPromptHandler {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly okrAgentService: OkrAgentService,
  ) {}

  async handle(payload: unknown): Promise<{ prompt: ClarificationPrompt }> {
    const request = clarificationPromptRequestSchema.parse(payload);

    // 从内存缓存或持久化存储获取会话
    let session = await this.sessionManager.getSession(request.sessionId);

    Logger.info('[main] prompt request received', {
      sessionId: request.sessionId,
      intent: request.intent,
      hasPersistedSession: Boolean(session),
    });

    // 如果会话不存在，创建新会话
    if (!session) {
      session = this.sessionManager.createSession(request.sessionId, request.intent);
    }

    // 使用LLM生成初始提示
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

    // Use Zod for runtime validation instead of type assertion
    const parseResult = nextQuestionResponseSchema.safeParse(data);
    if (!parseResult.success) {
      throw new Error(`LLM response validation failed: ${parseResult.error.message}`);
    }

    const typedData = parseResult.data;

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

    // 更新会话步骤
    session.steps = [...session.steps, nextPrompt];
    await this.sessionManager.addStep(session, nextPrompt.id, 0);

    Logger.info('[main] prompt resolved', {
      promptId: nextPrompt.id,
      sequence: nextPrompt.sequence,
    });

    return clarificationPromptResponseSchema.parse({ prompt: nextPrompt });
  }
}
