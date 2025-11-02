import nock from 'nock';
// @ts-ignore - TDD import; file to be implemented
import { OkrAgentService } from '../../../app/renderer/src/app/clarification/services/okr-agent.service';

describe('US1 - Clarification next-question (validation repair)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('attempts a single repair on invalid response, then succeeds', async () => {
    // First invalid response
    const s1 = nock(baseURL)
      .post(/.*/)
      .reply(200, { question: { id: 'q2', text: 'Pick one' } });

    // Second valid response
    const s2 = nock(baseURL)
      .post(/.*/)
      .reply(200, {
        question: {
          id: 'q2',
          text: 'Pick one',
          options: [
            { id: 'o1', label: 'A', value: 'a' },
            { id: 'o2', label: 'B', value: 'b' }
          ]
        }
      });

    const service = new OkrAgentService();
    const context = { turns: [] };
    const result = await service.getNextQuestion(context as any, { questionId: 'q1', optionId: 'o1' } as any);
    expect(result.question.options.length).toBe(2);
    expect(s1.isDone()).toBe(true);
    expect(s2.isDone()).toBe(true);
  });
});
