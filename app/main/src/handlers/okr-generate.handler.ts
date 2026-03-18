import { randomUUID } from 'node:crypto';

import { generateOKRRequestSchema, generateOKRResponseSchema } from '@clarityokr/contracts';
import type { ClarificationSession, KeyResult, OKRDocument } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { OkrRepository } from '../persistence/okr-repository.js';
import type { SessionManager } from '../services/session-manager.service.js';
import type { StickyWindowManager } from '../windows/sticky-window-manager.js';

/**
 * OkrGenerateHandler - 处理OKR_GENERATE IPC请求
 * 职责：基于会话生成OKR文档
 */
export class OkrGenerateHandler {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly okrRepository: OkrRepository,
    private readonly stickyWindowManager: StickyWindowManager,
  ) {}

  async handle(payload: unknown) {
    const request = generateOKRRequestSchema.parse(payload);

    // 从内存缓存或持久化存储获取会话
    const session = await this.sessionManager.getSession(request.sessionId);

    if (!session) {
      throw new Error('No active session found for OKR generation.');
    }

    const okr = this.buildOkrDocument(session, request.intentSummary);

    Logger.info('[main] generating OKR document', {
      sessionId: session.id,
      okrId: okr.id,
    });

    // 完成会话
    await this.sessionManager.completeSession(session);

    await this.okrRepository.save(okr);

    await this.stickyWindowManager.open(okr);

    return generateOKRResponseSchema.parse({ okr, session });
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
}
