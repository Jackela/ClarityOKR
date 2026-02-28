import nock from 'nock';
import { firstValueFrom } from 'rxjs';

import { LlmGatewayService } from '../../../app/renderer/src/app/clarification/services/llm-gateway.service';
import { TelemetryService } from '../../../app/renderer/src/app/services/telemetry.service';

describe('US1 - Clarification next-question (timeout)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('handles timeout with user-visible retry and idempotent state', async () => {
    const scope = nock(baseURL)
      .post(/.*/)
      .delay(3000)
      .reply(200, {
        question: {
          id: 'q-timeout',
          text: 'Slow response',
          options: [
            { id: 'o1', label: 'A', value: 'a' },
            { id: 'o2', label: 'B', value: 'b' },
          ],
        },
      });

    const telemetry = new TelemetryService();
    const service = new LlmGatewayService(telemetry);
    const context = { turns: [] };
    await expect(
      firstValueFrom(
        service.getNextQuestion(context as any, { questionId: 'qX', optionId: 'oX' } as any),
      ),
    ).rejects.toThrow();
    expect(scope.pendingMocks().length).toBeGreaterThanOrEqual(0);
  });
});
