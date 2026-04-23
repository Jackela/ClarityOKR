/**
 * ClarificationDraftHandler - OKR Draft Generation Management
 *
 * Responsibilities:
 * - Calls LLM service to generate OKR drafts from session context
 * - Validates LLM responses against expected schema
 * - Transforms LLM output into OKRDocument format
 * - Manages state transitions during draft generation
 *
 * The handler converts LLM-generated objectives and key results into
 * the application's standard OKR document format for storage and display.
 */

import { randomUUID } from 'node:crypto';
import type { OKRDocument } from '@clarityokr/contracts';
import { z } from 'zod';

import { Logger } from '../core/logger.js';
import type { OkrAgentService } from '../services/okr-agent.service.js';
import type {
  IClarificationDraftHandler,
  OkrDraftResponse,
} from './interfaces/draft-handler.interface.js';
import type { IClarificationSessionManager } from './interfaces/session-manager.interface.js';
import type { IClarificationStateMachine } from './interfaces/state-machine.interface.js';
import { SessionNotFoundError, DraftValidationError, LLMError, ValidationError } from './types.js';

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
 * ClarificationDraftHandler - OKR草稿生成管理
 * 职责：调用LLM生成OKR草案并验证
 */
export class ClarificationDraftHandler implements IClarificationDraftHandler {
  constructor(
    private readonly sessionManager: IClarificationSessionManager,
    private readonly stateMachine: IClarificationStateMachine,
    private readonly okrAgentService: OkrAgentService,
  ) {}

  /**
   * Generates an OKR draft from the current session context.
   *
   * @param sessionId - The active session identifier
   * @returns Promise resolving to the draft response with OKR and session
   * @throws {ValidationError} If session ID is missing
   * @throws {SessionNotFoundError} If session does not exist
   * @throws {LLMError} If LLM service fails
   * @throws {DraftValidationError} If LLM response is invalid
   */


  async generateDraft(sessionId: string): Promise<OkrDraftResponse> {
    if (!sessionId) {
      throw new ValidationError('Session ID is required');
    }

    // 获取会话
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      Logger.error(`[DraftHandler] Session ${sessionId} not found`);
      throw new SessionNotFoundError(sessionId);
    }

    Logger.info(`[DraftHandler] Generating draft for session ${sessionId}`);

    // 构建上下文
    const context = {
      turns: session.steps.map((p: { id: string; selectedOptionId?: string }) => ({
        questionId: p.id,
        optionId: p.selectedOptionId ?? 'unknown',
        timestamp: new Date().toISOString(),
      })),
    };

    // 状态转换：collecting/ready -> ready
    if (this.stateMachine.canTransition(session.status, 'ready')) {
      await this.stateMachine.transition(session, 'ready');
    }

    // 调用 LLM
    let llmDraft: unknown;
    try {
      llmDraft = await this.okrAgentService.generateDraft(context);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error('[DraftHandler] LLM generateDraft failed:', errorMsg);
      throw new LLMError(`Failed to generate OKR draft: ${errorMsg}`);
    }

    if (!llmDraft || typeof llmDraft !== 'object') {
      throw new LLMError('Empty or invalid response from LLM draft service');
    }

    // 验证草案
    if (!this.validateDraft(llmDraft)) {
      throw new DraftValidationError('LLM draft validation failed');
    }

    const parseResult = draftPayloadSchema.safeParse(llmDraft);
    if (!parseResult.success) {
      throw new DraftValidationError(`Invalid draft: ${parseResult.error.message}`);
    }

    const draft = parseResult.data.draft;
    const first = draft.objectives[0];

    if (!first || (!first.title && !first.description)) {
      throw new DraftValidationError('Draft objective missing required fields');
    }

    // 转换为 OKRDocument
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

    Logger.info(`[DraftHandler] Draft generated`, {
      sessionId,
      okrId: okr.id,
    });

    return { okr, session };
  }

  /**
   * Validates the LLM draft response against the expected schema.
   *
   * @param draft - The draft object to validate
   * @returns True if draft passes validation
   */


  validateDraft(draft: unknown): boolean {
    const result = draftPayloadSchema.safeParse(draft);
    return result.success;
  }
}


