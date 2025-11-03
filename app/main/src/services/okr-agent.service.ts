import { nextQuestionResponseSchema, okrDraftResponseSchema } from '@clarityokr/contracts';

import { getLlmConfig } from '../env.js';

type ClarificationContext = { turns: Array<{ questionId: string; optionId: string; timestamp: string }> };
type LastChoice = { questionId: string; optionId: string };

export class OkrAgentService {
  private readonly cfg = getLlmConfig();
  private readonly baseUrl = (this.cfg.baseUrl || 'https://api.openai.com').replace(/\/$/, '');
  private readonly model = this.cfg.model || 'gpt-4o-mini';
  private readonly timeoutMs = 5000;

  private async postJson(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.cfg.apiKey}`
      },
      body: JSON.stringify(body),
      signal
    });
    if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
    return res.json() as unknown;
  }

  private async withTimeout<T>(p: Promise<T>, ms: number, controller?: AbortSignal | { abort: () => void }): Promise<T> {
    return await Promise.race([
      p,
      new Promise<T>((_resolve, reject) => {
        const timer = setTimeout(() => {
          try {
            controller && 'abort' in controller && controller.abort();
          } catch {
            // ignore abort errors
            void 0;
          }
          reject(new Error('LLM request timed out'));
        }, ms);
        p.finally(() => clearTimeout(timer)).catch(() => clearTimeout(timer));
      })
    ]);
  }

  private isValidNextQuestion(payload: unknown): boolean {
    return nextQuestionResponseSchema.safeParse(payload).success;
  }

  private isValidDraft(payload: unknown): boolean {
    return okrDraftResponseSchema.safeParse(payload).success;
  }

  /**
   * Calls the configured LLM HTTP endpoint and validates the structured response.
   * Performs a single retry when a transport failure occurs or validation fails.
   * Never leaks secrets to renderer; runs in Electron main.
   */
  private async callLlmApi<T = unknown>(path: string, body: unknown, validate: (x: unknown) => boolean): Promise<T> {
    const attempt = async () => {
      const ac = new AbortController();
      const fetchPromise = this.postJson(path, body, ac.signal);
      return this.withTimeout(fetchPromise, this.timeoutMs, ac);
    };

    let result: unknown;
    try {
      result = await attempt();
      if (validate(result)) return result as T;
    } catch (_err) {
      // continue to repair attempt
      void _err;
    }
    result = await attempt();
    if (!validate(result)) throw new Error('LLM response invalid after repair attempt');
    return result as T;
  }

  async getNextQuestion(context: ClarificationContext, lastChoice: LastChoice): Promise<unknown> {
    /**
     * Requests the next clarification question and options using the full context and last choice.
     */
    const payload = { context, lastChoice, model: this.model, type: 'next-question' };
    return this.callLlmApi('/v1/responses', payload, (x) => this.isValidNextQuestion(x));
  }

  async generateDraft(context: ClarificationContext): Promise<unknown> {
    /**
     * Generates an OKR draft using the clarification context. Validates a minimal viable draft and returns it.
     */
    const payload = { context, model: this.model, type: 'okr-draft' };
    return this.callLlmApi('/v1/responses', payload, (x) => this.isValidDraft(x));
  }
}
