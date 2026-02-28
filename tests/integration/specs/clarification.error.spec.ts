import nock from 'nock';
import { firstValueFrom } from 'rxjs';

import { LlmGatewayService } from '../../../app/renderer/src/app/clarification/services/llm-gateway.service';
import { TelemetryService } from '../../../app/renderer/src/app/services/telemetry.service';

describe('US1 - Clarification next-question (repair fails)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('fails with friendly error when validation and one repair both fail', async () => {
    const s1 = nock(baseURL)
      .post(/.*/)
      .reply(200, { question: { id: 'q2', text: 'Pick one' } });
    const s2 = nock(baseURL)
      .post(/.*/)
      .reply(200, { question: { id: 'q2', text: 'Still invalid' } });

    const telemetry = new TelemetryService();
    const service = new LlmGatewayService(telemetry);
    const context = { turns: [] };
    await expect(
      firstValueFrom(
        service.getNextQuestion(context as any, { questionId: 'q1', optionId: 'o1' } as any),
      ),
    ).rejects.toThrow(/invalid/i);
    expect(s1.isDone()).toBe(true);
    expect(s2.isDone()).toBe(true);
  });
});
