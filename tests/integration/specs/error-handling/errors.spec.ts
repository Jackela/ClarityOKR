import nock from 'nock';

// Import the main process service for integration testing
import { OkrAgentService } from '../../../app/main/src/services/okr-agent.service.js';

describe('Integration: Error handling scenarios', () => {
  const baseURL = process.env.LLM_BASE_URL || 'https://llm.example.test';

  beforeEach(() => {
    nock.cleanAll();
  });

  describe('Network errors', () => {
    it('handles connection refused error', async () => {
      nock(baseURL)
        .post(/.*/)
        .replyWithError({ code: 'ECONNREFUSED', message: 'Connection refused' });

      const service = new OkrAgentService();
      const context = { turns: [] };

      await expect(service.getNextQuestion(context as any, {} as any)).rejects.toThrow();
    });

    it('handles timeout error', async () => {
      nock(baseURL)
        .post(/.*/)
        .delay(60000) // 延迟超过超时时间
        .reply(200, { question: { id: 'q1', text: 'Test', options: [] } });

      const service = new OkrAgentService();
      const context = { turns: [] };

      await expect(service.getNextQuestion(context as any, {} as any)).rejects.toThrow();
    });

    it('handles 5xx server errors', async () => {
      nock(baseURL).post(/.*/).reply(503, 'Service Unavailable');

      const service = new OkrAgentService();
      const context = { turns: [] };

      await expect(service.generateDraft(context as any)).rejects.toThrow();
    });

    it('handles 4xx client errors', async () => {
      nock(baseURL).post(/.*/).reply(400, { error: 'Bad Request' });

      const service = new OkrAgentService();
      const context = { turns: [] };

      await expect(service.getNextQuestion(context as any, {} as any)).rejects.toThrow();
    });

    it('handles service unavailable errors', async () => {
      nock(baseURL).post(/.*/).reply(503, 'Service Unavailable');

      const service = new OkrAgentService();
      const context = { turns: [] };

      await expect(
        service.getNextQuestion(context as any, {} as any) as Promise<unknown>,
      ).rejects.toThrow();
    });
  });

  describe('Invalid response handling', () => {
    it('handles malformed JSON response', async () => {
      nock(baseURL)
        .post(/.*/)
        .reply(200, '{ invalid json }', { 'Content-Type': 'application/json' });

      const service = new OkrAgentService();
      const context = { turns: [] };

      await expect(service.getNextQuestion(context as any, {} as any)).rejects.toThrow();
    });

    it('handles empty response body', async () => {
      nock(baseURL).post(/.*/).reply(200, '');

      const service = new OkrAgentService();
      const context = { turns: [] };

      await expect(service.generateDraft(context as any)).rejects.toThrow();
    });

    it('handles missing required fields', async () => {
      nock(baseURL)
        .post(/.*/)
        .reply(200, { question: { id: 'q1' } }); // 缺少text和options

      const service = new OkrAgentService();
      const context = { turns: [] };

      await expect(service.getNextQuestion(context as any, {} as any)).rejects.toThrow();
    });

    it('handles unexpected response structure', async () => {
      nock(baseURL).post(/.*/).reply(200, { unexpected: 'data', format: 'wrong' });

      const service = new OkrAgentService();
      const context = { turns: [] };

      await expect(service.generateDraft(context as any)).rejects.toThrow();
    });

    it('handles null fields where object expected', async () => {
      nock(baseURL)
        .post(/.*/)
        .reply(200, {
          draft: {
            objectives: null,
          },
        });

      const service = new OkrAgentService();
      const context = { turns: [] };

      await expect(service.generateDraft(context as any)).rejects.toThrow();
    });
  });
});
