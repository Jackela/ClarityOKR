/* eslint-disable @typescript-eslint/ban-types */
import nock from 'nock';
import { jest } from '@jest/globals';

import { OkrAgentService } from '../../../app/main/src/services/okr-agent.service.js';

describe('Integration: LLM service (main)', () => {
  const baseURL = 'http://127.0.0.1:7777';

  beforeAll(() => {
    // Provide test env for LLM client
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = baseURL;
    process.env.LLM_MODEL = 'test-model';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getNextQuestion returns a valid question and does not leak secrets', async () => {
    const scope = nock(baseURL)
      .post('/v1/responses')
      .reply(200, {
        question: {
          id: 'q-next',
          text: 'What is the priority?',
          options: [
            { id: 'hi', label: 'High' },
            { id: 'lo', label: 'Low' },
          ],
        },
      });

    const service = new OkrAgentService();
    const context = { turns: [] };
    const res = (await service.getNextQuestion(
      context as any,
      { questionId: 'init', optionId: 'hi' } as any,
    )) as { question: { id: string } };

    expect(res).toHaveProperty('question.id', 'q-next');
    expect(JSON.stringify(res)).not.toContain(process.env.LLM_API_KEY ?? '');
    expect(scope.isDone()).toBe(true);
  });

  it('generateDraft returns OKR draft and does not leak secrets', async () => {
    const scope = nock(baseURL)
      .post('/v1/responses')
      .reply(200, {
        draft: {
          objectives: [
            {
              id: 'o-int',
              title: 'Improve Quality',
              keyResults: [
                { id: 'kr1', statement: 'Reduce bugs', target: 10, measurement: 'count' },
                { id: 'kr2', statement: 'Lower escape rate', target: '5%', measurement: 'rate' },
                { id: 'kr3', statement: 'Faster MTTR', target: '2h', measurement: 'latency' },
              ],
            },
          ],
        },
      });

    const service = new OkrAgentService();
    const context = {
      turns: [
        { questionId: 'q1', optionId: 'a', timestamp: new Date().toISOString(), scopeTag: 'llm' },
      ],
    };

    const res = (await service.generateDraft(context as any)) as {
      draft: { objectives: unknown[] };
    };

    expect(res).toHaveProperty('draft.objectives');
    expect(res.draft.objectives.length).toBeGreaterThan(0);
    expect(JSON.stringify(res)).not.toContain(process.env.LLM_API_KEY ?? '');
    expect(scope.isDone()).toBe(true);
  });
});
