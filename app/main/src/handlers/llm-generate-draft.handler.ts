import { randomUUID } from 'node:crypto';

import type { OKRDocument } from '@clarityokr/contracts';
import { generateOKRResponseSchema } from '@clarityokr/contracts';
import electron from 'electron';
import { z } from 'zod';

import { IPC_CHANNELS } from '../bootstrap/ipc-channels.js';
import { Logger } from '../core/logger.js';
import type { OkrDraftResponse } from '../main/ipc.llm.js';
import type { OkrRepository } from '../persistence/okr-repository.js';
import type { OkrAgentService } from '../services/okr-agent.service.js';
import type { SessionManager } from '../services/session-manager.service.js';

// Zod schemas for runtime validation
const clarificationTurnSchema = z.object({
  questionId: z.string().min(1),
  optionId: z.string().min(1),
  timestamp: z.string().min(1),
});

const clarificationContextSchema = z.object({
  turns: z.array(clarificationTurnSchema),
});

const okrDraftRequestSchema = z.object({
  context: clarificationContextSchema.optional(),
  sessionId: z.string().min(1).optional(),
});

// Extended schema for LLM draft response validation
const draftKeyResultSchema = z.object({
  id: z.string().min(1).optional(),
  statement: z.string().min(1).optional(),
  target: z.union([z.string(), z.number()]).optional(),
  measurement: z.string().min(1).optional(),
});

const draftObjectiveSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  keyResults: z.array(draftKeyResultSchema).optional(),
});

const draftPayloadSchema = z.object({
  draft: z.object({
    objectives: z.array(draftObjectiveSchema).min(1),
  }),
});

/**
 * LlmGenerateDraftHandler - 处理LLM_GENERATE_DRAFT IPC请求
 * 职责：调用LLM生成OKR草案
 */
export class LlmGenerateDraftHandler {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly okrRepository: OkrRepository,
    private readonly okrAgentService: OkrAgentService,
    private readonly elect: typeof electron = electron,
  ) {}

  async handle(payload: unknown): Promise<OkrDraftResponse> {
    // Validate payload using Zod
    const parseResult = okrDraftRequestSchema.safeParse(payload);
    if (!parseResult.success) {
      throw new Error(`Invalid request payload: ${parseResult.error.message}`);
    }
    const body = parseResult.data;

    const requestSessionId = body.sessionId;

    // 验证sessionId
    if (!requestSessionId) {
      throw new Error('Session ID is required for LLM draft generation');
    }

    // 从内存缓存或持久化存储获取会话
    const session = await this.sessionManager.getSession(requestSessionId);

    if (session) {
      Logger.info(
        `[LlmGenerateDraftHandler] Session ${requestSessionId} restored from persistence`,
      );
    }

    // 如果仍然找不到：记录可用会话并抛出错误
    if (!session) {
      const availableSessions = Array.from(this.sessionManager.getAllSessions().keys()).join(', ');
      Logger.error(
        `[LlmGenerateDraftHandler] Session ${requestSessionId} not found. Available sessions: ${availableSessions || '(none)'}`,
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

    // Validate LLM response using Zod
    const draftParseResult = draftPayloadSchema.safeParse(llmDraft);
    if (!draftParseResult.success) {
      throw new Error(`Invalid LLM draft response: ${draftParseResult.error.message}`);
    }

    const draft = draftParseResult.data.draft;

    if (!draft.objectives || !Array.isArray(draft.objectives) || draft.objectives.length === 0) {
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
      .forEach((wc) => wc.send(IPC_CHANNELS.OKR_GENERATE, response));
    return response;
  }
}
