import nock from 'nock';
import { firstValueFrom } from 'rxjs';

import { LlmGatewayService } from '../../../app/renderer/src/app/clarification/services/llm-gateway.service';
import { TelemetryService } from '../../../app/renderer/src/app/services/telemetry.service';

describe('US2 - Draft generation (errors)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('fails on 429 with clear error', async () => {
    const scope = nock(baseURL).post(/.*/).reply(429, { error: 'rate_limited' });
    const telemetry = new TelemetryService();
    const service = new LlmGatewayService(telemetry);
    await expect(firstValueFrom(service.generateDraft({ turns: [] } as any))).rejects.toThrow();
    expect(scope.isDone()).toBe(true);
  });

  it('fails on 5xx with clear error', async () => {
    const scope = nock(baseURL).post(/.*/).reply(500, { error: 'server_error' });
    const telemetry = new TelemetryService();
    const service = new LlmGatewayService(telemetry);
    await expect(firstValueFrom(service.generateDraft({ turns: [] } as any))).rejects.toThrow();
    expect(scope.isDone()).toBe(true);
  });
});
