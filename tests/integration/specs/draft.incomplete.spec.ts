import nock from 'nock';

// Import the main process service for integration testing
import { OkrAgentService } from '../../../app/main/src/services/okr-agent.service';

describe('US2 - Draft generation (incomplete context)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('succeeds with minimal context by proceeding with assumptions', async () => {
    const scope = nock(baseURL)
      .post(/.*/)
      .reply(200, {
        draft: {
          objectives: [
            {
              id: 'obj1',
              title: 'Improve onboarding',
              description: 'Assumed intent',
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
    const context = { turns: [] };
    const result = (await service.generateDraft(context as any)) as {
      draft: { objectives: unknown[] };
    };
    expect(result.draft.objectives.length).toBe(1);
    expect(scope.isDone()).toBe(true);
  });
});
