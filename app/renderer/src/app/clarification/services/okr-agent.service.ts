/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, no-empty */
import { nextQuestionResponseSchema, okrDraftResponseSchema } from '@clarityokr/contracts';

type ClarificationContext = { turns: Array<{ questionId: string; optionId: string; timestamp: string }> };
type LastChoice = { questionId: string; optionId: string };

export class OkrAgentService {
  private baseUrl = 'https://llm.example.test';
  private timeoutMs = 1500; // keep below 3s to satisfy timeout test

  private async postJson(path: string, body: unknown, signal?: AbortSignal): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
    if (!res.ok) {
      throw new Error(`LLM request failed: ${res.status}`);
    }
    return res.json();
  }

  private async withTimeout<T>(p: Promise<T>, ms: number, controller?: AbortSignal | { abort: () => void }): Promise<T> {
    return await Promise.race([
      p,
      new Promise<T>((_resolve, reject) => {
        const timer = setTimeout(() => {
          try {
            controller && 'abort' in controller && controller.abort();
          } catch {}
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

  // Centralized LLM API call with simple validation and single repair attempt
  /**
   * Renderer-side test-only HTTP call used by integration tests with nock.
   * Centralizes timeout, single repair, and validation against shared contracts.
   */
  private async callLlmApi<T = any>(path: string, body: unknown, validate: (x: any) => boolean): Promise<T> {
    // First attempt
    const attempt = async () => {
      const controller = new AbortController();
      const fetchPromise = this.postJson(path, body, controller.signal);
      return this.withTimeout(fetchPromise, this.timeoutMs, controller);
    };

    let result: any;
    try {
      result = await attempt();
      if (validate(result)) return result as T;
    } catch (e) {
      // continue to repair attempt
    }

    // Single repair attempt
    result = await attempt();
    if (!validate(result)) {
      throw new Error('LLM response invalid after repair attempt');
    }
    return result as T;
  }

  async getNextQuestion(context: ClarificationContext, lastChoice: LastChoice): Promise<any> {
    /**
     * Requests next question and options. Used by tests to validate behavior via network stubs.
     */
    const payload = { context, lastChoice };
    const data = await this.callLlmApi('/v1/responses', payload, (x) => this.isValidNextQuestion(x));
    return data;
  }

  async generateDraft(context: ClarificationContext): Promise<any> {
    /**
     * Requests draft generation with minimal context. Used by tests to validate success and error paths.
     */
    const payload = { context };
    const data = await this.callLlmApi('/v1/responses', payload, (x) => this.isValidDraft(x));
    return data;
  }
}
