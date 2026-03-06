import nock from 'nock';

// Import the main process service for integration testing
import { OkrAgentService } from '../../../app/main/src/services/okr-agent.service';

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
            { id: 'o2', label: 'Quality', value: 'quality' },
          ],
        },
      });

    const service = new OkrAgentService();
    const context = {
      turns: [{ questionId: 'q1', optionId: 'o3', timestamp: new Date().toISOString() }],
    };
    const result = (await service.getNextQuestion(
      context as any,
      { questionId: 'q1', optionId: 'o3' } as any,
    )) as { question: { id: string; options: unknown[] } };
    expect(result.question.id).toBe('q2');
    expect(result.question.options.length).toBeGreaterThanOrEqual(2);
    expect(scope.isDone()).toBe(true);
  });
});
