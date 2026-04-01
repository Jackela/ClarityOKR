import nock from 'nock';

// Import the main process service for integration testing
import { OkrAgentService } from '../../../app/main/src/services/okr-agent.service.js';

describe('US2 - Draft generation (errors)', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  it('fails on 429 with clear error', async () => {
    const scope = nock(baseURL).post(/.*/).reply(429, { error: 'rate_limited' });
    const service = new OkrAgentService();
    await expect(service.generateDraft({ turns: [] } as any) as Promise<unknown>).rejects.toThrow();
    expect(scope.isDone()).toBe(true);
  });

  it('fails on 5xx with clear error', async () => {
    const scope = nock(baseURL).post(/.*/).reply(500, { error: 'server_error' });
    const service = new OkrAgentService();
    await expect(service.generateDraft({ turns: [] } as any) as Promise<unknown>).rejects.toThrow();
    expect(scope.isDone()).toBe(true);
  });
});
