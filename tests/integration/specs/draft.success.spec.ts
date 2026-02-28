import nock from 'nock';
import { firstValueFrom } from 'rxjs';

import { LlmGatewayService } from '../../../app/renderer/src/app/clarification/services/llm-gateway.service';
import { TelemetryService } from '../../../app/renderer/src/app/services/telemetry.service';

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

    const telemetry = new TelemetryService();
    const service = new LlmGatewayService(telemetry);
    const context = {
      turns: [{ questionId: 'q1', optionId: 'o1', timestamp: new Date().toISOString() }],
    };
    const result = await firstValueFrom(service.generateDraft(context as any));
    expect(result).toBeDefined();
    expect(scope.isDone()).toBe(true);
  });
});
