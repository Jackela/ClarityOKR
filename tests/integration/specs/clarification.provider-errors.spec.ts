import nock from 'nock';
import { firstValueFrom } from 'rxjs';

import { LlmGatewayService } from '../../../app/renderer/src/app/clarification/services/llm-gateway.service';
import { TelemetryService } from '../../../app/renderer/src/app/services/telemetry.service';

describe('US1 - Clarification next-question (provider errors)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('handles 429 with a meaningful error', async () => {
    const scope = nock(baseURL).post(/.*/).reply(429, { error: 'rate_limited' });
    const telemetry = new TelemetryService();
    const service = new LlmGatewayService(telemetry);
    const context = { turns: [] };
    await expect(
      firstValueFrom(
        service.getNextQuestion(context as any, { questionId: 'q1', optionId: 'o1' } as any),
      ),
    ).rejects.toThrow();
    expect(scope.isDone()).toBe(true);
  });

  it('handles 500 with a meaningful error', async () => {
    const scope = nock(baseURL).post(/.*/).reply(500, { error: 'server_error' });
    const telemetry = new TelemetryService();
    const service = new LlmGatewayService(telemetry);
    const context = { turns: [] };
    await expect(
      firstValueFrom(
        service.getNextQuestion(context as any, { questionId: 'q1', optionId: 'o1' } as any),
      ),
    ).rejects.toThrow();
    expect(scope.isDone()).toBe(true);
  });
});
