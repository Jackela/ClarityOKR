import { randomUUID } from 'node:crypto';

import type {
  ClarificationPrompt,
  ClarificationSession,
  KeyResult,
  LlmDraftResponse,
  LlmObjective,
  OKRDocument,
} from '@clarityokr/contracts';

export class OkrBuilderService {
  buildOkrFromLlmDraft(session: ClarificationSession, draft: LlmDraftResponse): OKRDocument {
    const firstObjective = draft?.draft?.objectives?.[0];
    if (!firstObjective) {
      throw new Error('LLM draft response missing objectives');
    }

    return this.createOkrDocument(session, firstObjective);
  }

  buildFallbackOkr(session: ClarificationSession, intentSummary: string): OKRDocument {
    const generatedAt = new Date().toISOString();
    const objective = `围绕"${intentSummary}"提升执行成效`;
    const keyResults = this.createFallbackKeyResults(intentSummary);

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

  mapLlmQuestionToPrompt(
    question: { id: string; text: string; options: Array<{ id: string; label: string }> },
    sequence: number,
  ): ClarificationPrompt {
    return {
      id: question.id,
      sequence,
      question: question.text,
      context: 'LLM generated',
      options: (question.options ?? []).map((o) => ({
        id: o.id,
        label: o.label,
        description: undefined,
        scopeTag: 'llm',
      })),
    };
  }

  private createOkrDocument(session: ClarificationSession, objective: LlmObjective): OKRDocument {
    return {
      id: randomUUID(),
      objective: objective.title ?? objective.description ?? '自动生成的目标',
      keyResults: this.mapKeyResults(objective.keyResults ?? []),
      sourceSessionId: session.id,
      generatedAt: new Date().toISOString(),
      lastEditedAt: null,
      regenerationPolicy: 'append',
      manualEdits: [],
    };
  }

  private mapKeyResults(krs: LlmObjective['keyResults']): KeyResult[] {
    return krs.slice(0, 5).map((kr) => ({
      id: String(kr?.id ?? randomUUID()),
      statement: String(kr?.statement ?? ''),
      successMetric: this.buildSuccessMetric(kr),
      owner: undefined,
    }));
  }

  private buildSuccessMetric(kr: { target?: unknown; measurement?: string }): string | undefined {
    if (typeof kr?.target !== 'undefined' && typeof kr?.measurement === 'string') {
      return `${String(kr.target)} ${kr.measurement}`;
    }
    return undefined;
  }

  private createFallbackKeyResults(intentSummary: string): KeyResult[] {
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
