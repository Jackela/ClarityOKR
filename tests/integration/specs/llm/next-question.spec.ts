import nock from 'nock';

// Import the main process service for integration testing
import { OkrAgentService } from '../../../app/main/src/services/okr-agent.service';

describe('US3 - Next question generation (Integration)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  beforeEach(() => {
    nock.cleanAll();
  });

  it('generates next question based on user selection', async () => {
    const scope = nock(baseURL)
      .post(/.*/)
      .reply(200, {
        question: {
          id: 'q2',
          text: '请选择下一步',
          options: [
            { id: 'a', label: '选项A', value: 'a' },
            { id: 'b', label: '选项B', value: 'b' },
          ],
        },
      });

    const service = new OkrAgentService();
    const context = {
      turns: [{ questionId: 'q1', optionId: 'o1', timestamp: new Date().toISOString() }],
    };
    const result = await service.getNextQuestion(
      context as any,
      {
        questionId: 'q1',
        optionId: 'o1',
      } as any,
    );

    expect(result.question.id).toBe('q2');
    expect(result.question.text).toBe('请选择下一步');
    expect(result.question.options).toHaveLength(2);
    expect(scope.isDone()).toBe(true);
  });

  it('updates context after user selection', async () => {
    const scope = nock(baseURL)
      .post(/.*/)
      .reply(200, {
        question: {
          id: 'q3',
          text: '再补充一个细节',
          options: [
            { id: 'c', label: '选项C', value: 'c' },
            { id: 'd', label: '选项D', value: 'd' },
          ],
        },
      });

    const service = new OkrAgentService();
    const context = {
      turns: [
        { questionId: 'q1', optionId: 'o1', timestamp: new Date().toISOString() },
        { questionId: 'q2', optionId: 'o2', timestamp: new Date().toISOString() },
      ],
    };
    const result = await service.getNextQuestion(
      context as any,
      {
        questionId: 'q2',
        optionId: 'o2',
      } as any,
    );

    expect(result.question.id).toBe('q3');
    expect(scope.isDone()).toBe(true);
  });

  it('handles multiple sequential questions', async () => {
    nock(baseURL)
      .post(/.*/)
      .reply(200, {
        question: {
          id: 'q2',
          text: '问题2',
          options: [
            { id: 'a', label: 'A', value: 'a' },
            { id: 'b', label: 'B', value: 'b' },
          ],
        },
      });

    nock(baseURL)
      .post(/.*/)
      .reply(200, {
        question: {
          id: 'q3',
          text: '问题3',
          options: [
            { id: 'c', label: 'C', value: 'c' },
            { id: 'd', label: 'D', value: 'd' },
          ],
        },
      });

    const service = new OkrAgentService();
    const context1 = {
      turns: [{ questionId: 'q1', optionId: 'o1', timestamp: new Date().toISOString() }],
    };
    const result1 = await service.getNextQuestion(
      context1 as any,
      {
        questionId: 'q1',
        optionId: 'o1',
      } as any,
    );

    expect(result1.question.id).toBe('q2');

    const context2 = {
      turns: [
        ...context1.turns,
        { questionId: 'q2', optionId: 'a', timestamp: new Date().toISOString() },
      ],
    };
    const result2 = await service.getNextQuestion(
      context2 as any,
      {
        questionId: 'q2',
        optionId: 'a',
      } as any,
    );

    expect(result2.question.id).toBe('q3');
  });
});
