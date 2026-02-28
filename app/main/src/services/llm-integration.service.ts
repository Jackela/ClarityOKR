import type { LlmDraftResponse, LlmNextQuestionResponse } from '@clarityokr/contracts';
import { LlmDraftResponseSchema, LlmNextQuestionResponseSchema } from '@clarityokr/contracts';

import { getLlmConfig, type LlmConfig } from '../env.js';

export type ClarificationContext = {
  turns: Array<{ questionId: string; optionId: string; timestamp: string }>;
};
export type LastChoice = { questionId: string; optionId: string };

export class LlmIntegrationService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config?: (LlmConfig & { timeoutMs?: number }) | undefined) {
    const cfg = config ?? getLlmConfig();
    this.apiKey = cfg.apiKey ?? '';
    this.baseUrl = (cfg.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '');
    this.model = cfg.model ?? 'gpt-4o-mini';
    this.timeoutMs = (cfg as { timeoutMs?: number }).timeoutMs ?? 5000;
  }

  private async postJson(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
    return res.json() as unknown;
  }

  private async withTimeout<T>(
    p: Promise<T>,
    ms: number,
    controller?: AbortController,
  ): Promise<T> {
    return await Promise.race([
      p,
      new Promise<T>((_resolve, reject) => {
        const timer = setTimeout(() => {
          controller?.abort();
          reject(new Error('LLM request timed out'));
        }, ms);
        p.finally(() => clearTimeout(timer)).catch(() => clearTimeout(timer));
      }),
    ]);
  }

  private validateNextQuestion(payload: unknown): payload is LlmNextQuestionResponse {
    return LlmNextQuestionResponseSchema.safeParse(payload).success;
  }

  private validateDraft(payload: unknown): payload is LlmDraftResponse {
    return LlmDraftResponseSchema.safeParse(payload).success;
  }

  private async callLlmApi<T>(
    path: string,
    body: unknown,
    validate: (x: unknown) => x is T,
  ): Promise<T> {
    const attempt = async (): Promise<unknown> => {
      const ac = new AbortController();
      const fetchPromise = this.postJson(path, body, ac.signal);
      return this.withTimeout(fetchPromise, this.timeoutMs, ac);
    };

    let result: unknown;
    try {
      result = await attempt();
      if (validate(result)) return result;
    } catch {
      // continue to retry
    }
    result = await attempt();
    if (!validate(result)) {
      throw new Error('LLM response invalid after retry');
    }
    return result;
  }

  async getNextQuestion(
    context: ClarificationContext,
    lastChoice: LastChoice,
  ): Promise<LlmNextQuestionResponse> {
    const payload = { context, lastChoice, model: this.model, type: 'next-question' };
    return this.callLlmApi('/v1/responses', payload, (x): x is LlmNextQuestionResponse =>
      this.validateNextQuestion(x),
    );
  }

  async generateDraft(context: ClarificationContext): Promise<LlmDraftResponse> {
    const payload = { context, model: this.model, type: 'okr-draft' };
    return this.callLlmApi('/v1/responses', payload, (x): x is LlmDraftResponse =>
      this.validateDraft(x),
    );
  }
}
