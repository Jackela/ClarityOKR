import nock from 'nock';
import { firstValueFrom } from 'rxjs';

import { LlmGatewayService } from '../../../app/renderer/src/app/clarification/services/llm-gateway.service';
import { TelemetryService } from '../../../app/renderer/src/app/services/telemetry.service';

describe('US1 - Clarification next-question (validation repair)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('attempts a single repair on invalid response, then succeeds', async () => {
    const s1 = nock(baseURL)
      .post(/.*/)
      .reply(200, { question: { id: 'q2', text: 'Pick one' } });

    const s2 = nock(baseURL)
      .post(/.*/)
      .reply(200, {
        question: {
          id: 'q2',
          text: 'Pick one',
          options: [
            { id: 'o1', label: 'A', value: 'a' },
            { id: 'o2', label: 'B', value: 'b' },
          ],
        },
      });

    const telemetry = new TelemetryService();
    const service = new LlmGatewayService(telemetry);
    const context = { turns: [] };
    const result = await firstValueFrom(
      service.getNextQuestion(context as any, { questionId: 'q1', optionId: 'o1' } as any),
    );
    expect(result).toBeDefined();
    expect(s1.isDone()).toBe(true);
    expect(s2.isDone()).toBe(true);
  });
});
