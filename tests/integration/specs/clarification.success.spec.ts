import nock from 'nock';

// Intentionally import the service path to drive TDD (will fail until implemented)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { OkrAgentService } from '../../../app/renderer/src/app/clarification/services/okr-agent.service';

describe('US1 - Clarification next-question (success)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('returns next question with 2+ options based on context', async () => {
    const scope = nock(baseURL)
      .post(/\/v1\/chat\/completions|\/v1\/responses|\//)
      .reply(200, {
        question: {
          id: 'q2',
          text: 'Which focus area matters most now?',
          options: [
            { id: 'o1', label: 'Growth', value: 'growth' },
            { id: 'o2', label: 'Quality', value: 'quality' }
          ]
        }
      });

    const service = new OkrAgentService();
    const context = { turns: [{ questionId: 'q1', optionId: 'o3', timestamp: new Date().toISOString() }] };
    const result = await service.getNextQuestion(context as any, { questionId: 'q1', optionId: 'o3' } as any);
    expect(result.question.id).toBe('q2');
    expect(result.question.options.length).toBeGreaterThanOrEqual(2);
    expect(scope.isDone()).toBe(true);
  });
});

