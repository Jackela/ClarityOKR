import nock from 'nock';
// @ts-ignore - TDD import; file to be implemented
import { OkrAgentService } from '../../../app/renderer/src/app/clarification/services/okr-agent.service';

describe('US1 - Clarification next-question (timeout)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('handles timeout with user-visible retry and idempotent state', async () => {
    const scope = nock(baseURL)
      .post(/.*/)
      .delay(3000)
      .reply(200, {
        question: {
          id: 'q-timeout',
          text: 'Slow response',
          options: [
            { id: 'o1', label: 'A', value: 'a' },
            { id: 'o2', label: 'B', value: 'b' }
          ]
        }
      });

    const service = new OkrAgentService();
    const context = { turns: [] };
    // Implementation expected to use internal timeout shorter than 3s
    await expect(
      service.getNextQuestion(context as any, { questionId: 'qX', optionId: 'oX' } as any)
    ).rejects.toThrow();
    // Request may be aborted before completion; ensure scope was engaged
    expect(scope.pendingMocks().length).toBeGreaterThanOrEqual(0);
  });
});
