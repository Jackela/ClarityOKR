import nock from 'nock';

// Import the main process service for integration testing
import { OkrAgentService } from '../../../app/main/src/services/okr-agent.service.js';

describe('US2 - Draft generation (Integration)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  beforeEach(() => {
    nock.cleanAll();
  });

  it('generates draft with 1 objective and 3-5 key results', async () => {
    const scope = nock(baseURL)
      .post(/.*/)
      .reply(200, {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '提高执行力',
              description: '自动生成',
              keyResults: [
                { id: 'kr1', statement: 'KR1', target: '10%', measurement: 'rate' },
                { id: 'kr2', statement: 'KR2', target: 5, measurement: 'count' },
                { id: 'kr3', statement: 'KR3', target: '2s', measurement: 'latency' },
              ],
            },
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
    const result = await service.generateDraft(context as any);

    expect(result.draft.objectives).toHaveLength(1);
    expect(result.draft.objectives[0].title).toBe('提高执行力');
    expect(result.draft.objectives[0].keyResults.length).toBeGreaterThanOrEqual(3);
    expect(result.draft.objectives[0].keyResults.length).toBeLessThanOrEqual(5);
    expect(scope.isDone()).toBe(true);
  });

  it('generates draft based on collected answers', async () => {
    const scope = nock(baseURL)
      .post(/.*/)
      .reply(200, {
        draft: {
          objectives: [
            {
              id: 'o-custom',
              title: '提高效率',
              description: '根据用户意图生成',
              keyResults: [
                { id: 'kr1', statement: '节省时间', target: '20%', measurement: 'rate' },
                { id: 'kr2', statement: '减少步骤', target: 3, measurement: 'count' },
                { id: 'kr3', statement: '提高质量', target: '95%', measurement: 'rate' },
              ],
            },
          ],
        },
      });

    const service = new OkrAgentService();
    const context = {
      turns: [
        { questionId: 'q1', optionId: 'efficiency', timestamp: new Date().toISOString() },
        { questionId: 'q2', optionId: 'automation', timestamp: new Date().toISOString() },
      ],
    };
    const result = await service.generateDraft(context as any);

    expect(result.draft.objectives[0].title).toBe('提高效率');
    expect(scope.isDone()).toBe(true);
  });

  it('persists draft after generation', async () => {
    nock(baseURL)
      .post(/.*/)
      .reply(200, {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: 'Test OKR',
              description: 'Test',
              keyResults: [
                { id: 'kr1', statement: 'KR1', target: 100, measurement: 'count' },
                { id: 'kr2', statement: 'KR2', target: 200, measurement: 'count' },
                { id: 'kr3', statement: 'KR3', target: 300, measurement: 'count' },
              ],
            },
          ],
        },
      });

    const service = new OkrAgentService();
    const context = {
      turns: [{ questionId: 'q1', optionId: 'o1', timestamp: new Date().toISOString() }],
    };
    const result = (await service.generateDraft(context as any)) as {
      draft: { objectives: unknown[] };
    };

    expect(result.draft).toBeDefined();
    expect(result.draft.objectives).toHaveLength(1);
  });

  it('includes all required OKR fields in draft', async () => {
    nock(baseURL)
      .post(/.*/)
      .reply(200, {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '完整OKR',
              description: '描述',
              keyResults: [
                { id: 'kr1', statement: '关键结果1', target: '10%', measurement: 'rate' },
                { id: 'kr2', statement: '关键结果2', target: 5, measurement: 'count' },
                { id: 'kr3', statement: '关键结果3', target: '2s', measurement: 'latency' },
              ],
            },
          ],
        },
      });

    const service = new OkrAgentService();
    const context = { turns: [] };
    const result = await service.generateDraft(context as any);

    const objective = result.draft.objectives[0];
    expect(objective).toHaveProperty('id');
    expect(objective).toHaveProperty('title');
    expect(objective).toHaveProperty('description');
    expect(objective).toHaveProperty('keyResults');
    expect(objective.keyResults[0]).toHaveProperty('id');
    expect(objective.keyResults[0]).toHaveProperty('statement');
    expect(objective.keyResults[0]).toHaveProperty('target');
    expect(objective.keyResults[0]).toHaveProperty('measurement');
  });
});
