import nock from 'nock';

// Import the main process service for integration testing
import { OkrAgentService } from '../../../app/main/src/services/okr-agent.service.js';

describe('US1 - Clarification next-question (repair fails)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('fails with friendly error when validation and one repair both fail', async () => {
    // Both responses invalid (missing options)
    const s1 = nock(baseURL)
      .post(/.*/)
      .reply(200, { question: { id: 'q2', text: 'Pick one' } });
    const s2 = nock(baseURL)
      .post(/.*/)
      .reply(200, { question: { id: 'q2', text: 'Still invalid' } });

    const service = new OkrAgentService();
    const context = { turns: [] };
    await expect(
      service.getNextQuestion(
        context as any,
        { questionId: 'q1', optionId: 'o1' } as any,
      ) as Promise<unknown>,
    ).rejects.toThrow(/invalid/i);
    expect(s1.isDone()).toBe(true);
    expect(s2.isDone()).toBe(true);
  });
});
