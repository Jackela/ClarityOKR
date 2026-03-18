import type { ClarificationPrompt } from '@clarityokr/contracts';
import electron from 'electron';
import { z } from 'zod';

import { IPC_CHANNELS } from '../bootstrap/ipc-channels.js';
import { Logger } from '../core/logger.js';
import type { LlmNextQuestionRequest, LlmNextQuestionResponse } from '../main/ipc.llm.js';
import type { OkrAgentService } from '../services/okr-agent.service.js';
import type { SessionManager } from '../services/session-manager.service.js';

// Zod schemas for runtime validation
const lastChoiceSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1),
});

const clarificationTurnSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1),
  timestamp: z.string().min(1),
});

const clarificationContextSchema = z.object({
  turns: z.array(clarificationTurnSchema),
});

const llmNextQuestionRequestSchema = z.object({
  context: clarificationContextSchema,
  lastChoice: lastChoiceSchema,
});

const nextQuestionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.string().optional(),
});

const nextQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  options: z.array(nextQuestionOptionSchema).min(2).max(6),
});

const llmNextQuestionResponseSchema = z.object({
  question: nextQuestionSchema,
});

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
    // Validate payload using Zod instead of type assertion
    const parseResult = llmNextQuestionRequestSchema.safeParse(payload);
    if (!parseResult.success) {
      throw new Error(`Invalid request payload: ${parseResult.error.message}`);
    }
    const body = parseResult.data;

    let data: unknown;
    try {
      data = await this.okrAgentService.getNextQuestion(body.context, body.lastChoice);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('[main] LLM getNextQuestion failed:', errorMsg);
      throw new Error(`Failed to get next question: ${errorMsg}`);
    }

    if (!data || typeof data !== 'object') {
      throw new Error('Empty or invalid response from LLM next question service');
    }

    // Validate response using Zod
    const responseParseResult = llmNextQuestionResponseSchema.safeParse(data);
    if (!responseParseResult.success) {
      throw new Error(`Invalid LLM response: ${responseParseResult.error.message}`);
    }

    const validatedData = responseParseResult.data;

    // 如果没有问题，表示澄清已完成
    if (!validatedData.question) {
      Logger.info('[main] No more questions, clarification complete');
      return validatedData;
    }

    // 将LLM问题映射为ClarificationPrompt并广播
    const session = await this.loadAndCacheSession();
    if (!session) {
      return validatedData;
    }

    const sequence = session.steps.length;
    const q = validatedData.question;
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
      .forEach((wc) => wc.send(IPC_CHANNELS.CLARIFICATION_PROMPT, { prompt }));

    return validatedData;
  }

  /**
   * 从持久化存储加载会话并缓存到内存
   */
  private async loadAndCacheSession() {
    return this.sessionManager.loadFromPersistence();
  }
}
