import nock from 'nock';

// Import the main process service for integration testing
import { OkrAgentService } from '../../../app/main/src/services/okr-agent.service';

describe('US2 - OKR draft generation (success)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('returns OKR draft with 1 Objective and 3–5 KRs', async () => {
    const scope = nock(baseURL)
      .post(/.*/)
      .reply(200, {
        draft: {
          objectives: [
            {
              id: 'obj1',
              title: 'Improve onboarding',
              description: 'Accelerate time-to-value',
              keyResults: [
                { id: 'kr1', statement: 'Reduce setup time', target: '10m', measurement: 'median' },
                {
                  id: 'kr2',
                  statement: 'Increase activation',
                  target: '+20%',
                  measurement: 'rate',
                },
                { id: 'kr3', statement: 'Improve CSAT', target: '4.5', measurement: 'score' },
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
      draft: { objectives: Array<{ keyResults: unknown[] }> };
    };
    expect(result.draft.objectives.length).toBe(1);
    expect(result.draft.objectives[0].keyResults.length).toBeGreaterThanOrEqual(3);
    expect(scope.isDone()).toBe(true);
  });
});
