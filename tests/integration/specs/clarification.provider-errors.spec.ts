import nock from 'nock';
// @ts-ignore - TDD import; file to be implemented
import { OkrAgentService } from '../../../app/renderer/src/app/clarification/services/okr-agent.service';

describe('US1 - Clarification next-question (provider errors)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('handles 429 with a meaningful error', async () => {
    const scope = nock(baseURL).post(/.*/).reply(429, { error: 'rate_limited' });
    const service = new OkrAgentService();
    const context = { turns: [] };
    await expect(
      service.getNextQuestion(context as any, { questionId: 'q1', optionId: 'o1' } as any)
    ).rejects.toThrow();
    expect(scope.isDone()).toBe(true);
  });

  it('handles 500 with a meaningful error', async () => {
    const scope = nock(baseURL).post(/.*/).reply(500, { error: 'server_error' });
    const service = new OkrAgentService();
    const context = { turns: [] };
    await expect(
      service.getNextQuestion(context as any, { questionId: 'q1', optionId: 'o1' } as any)
    ).rejects.toThrow();
    expect(scope.isDone()).toBe(true);
  });
});

