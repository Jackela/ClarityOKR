import nock from 'nock';
import { firstValueFrom } from 'rxjs';

import { LlmGatewayService } from '../../../app/renderer/src/app/clarification/services/llm-gateway.service';
import { TelemetryService } from '../../../app/renderer/src/app/services/telemetry.service';

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

    const telemetry = new TelemetryService();
    const service = new LlmGatewayService(telemetry);
    const context = { turns: [] };
    const result = await firstValueFrom(service.generateDraft(context as any));
    expect(result).toBeDefined();
    expect(scope.isDone()).toBe(true);
  });
});
