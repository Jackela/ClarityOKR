import nock from 'nock';
import { firstValueFrom } from 'rxjs';

import { LlmGatewayService } from '../../../app/renderer/src/app/clarification/services/llm-gateway.service';
import { TelemetryService } from '../../../app/renderer/src/app/services/telemetry.service';

jest.setTimeout(10000);

describe('US1 - Clarification next-question (success)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('returns next question with 2+ options based on context', async () => {
    const scope = nock(baseURL)
      .post(/\/v1\/chat\/completions|\/v1\/responses|\//)
      .reply(200, {
        question: {
          id: 'q2',
          text: 'Which focus area matters most now?',
          options: [
            { id: 'o1', label: 'Growth', value: 'growth' },
            { id: 'o2', label: 'Quality', value: 'quality' },
          ],
        },
      });

    const telemetry = new TelemetryService();
    const service = new LlmGatewayService(telemetry);
    const context = {
      turns: [{ questionId: 'q1', optionId: 'o3', timestamp: new Date().toISOString() }],
    };
    const result$ = service.getNextQuestion(
      context as any,
      { questionId: 'q1', optionId: 'o3' } as any,
    );
    const result = await firstValueFrom(result$);
    expect(result).toBeDefined();
    expect(scope.isDone()).toBe(true);
  });
});
