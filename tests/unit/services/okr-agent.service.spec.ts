import { jest } from '@jest/globals';
import { OkrAgentService } from '../../../app/main/src/services/okr-agent.service.js';

describe('OkrAgentService Unit Tests', () => {
  let okrAgentService: OkrAgentService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    // 任务19.2: OkrAgentService单元测试
    process.env.LLM_API_KEY = 'test-api-key';
    process.env.LLM_BASE_URL = 'https://api.test.com';
    process.env.LLM_MODEL = 'gpt-4o-mini';

    okrAgentService = new OkrAgentService();

    // Mock global fetch
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
  });

  describe('getNextQuestion', () => {
    it('should call LLM API with correct parameters', async () => {
      const mockResponse = {
        question: {
          id: 'q1',
          text: 'What is your goal?',
          options: [
            { id: 'opt1', label: 'Option 1' },
            { id: 'opt2', label: 'Option 2' },
          ],
        },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const context = { turns: [] };
      const lastChoice = { questionId: 'init', optionId: 'test' };

      const result = await okrAgentService.getNextQuestion(context, lastChoice);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/v1/responses',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-api-key',
          }),
          body: expect.stringContaining('next-question'),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    // 任务19.6: 负面测试 - API错误
    it('should throw error when API returns non-ok status', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const context = { turns: [] };
      const lastChoice = { questionId: 'init', optionId: 'test' };

      await expect(okrAgentService.getNextQuestion(context, lastChoice)).rejects.toThrow(
        'LLM request failed: 500',
      );
    });

    // 任务19.6: 负面测试 - 超时
    it('should throw error on timeout', async () => {
      fetchMock.mockImplementation(() => new Promise(() => {})); // Never resolves

      const context = { turns: [] };
      const lastChoice = { questionId: 'init', optionId: 'test' };

      await expect(okrAgentService.getNextQuestion(context, lastChoice)).rejects.toThrow(
        'LLM request timed out',
      );
    });

    // 任务19.6: 负面测试 - 无效响应
    it('should throw error when response validation fails twice', async () => {
      const invalidResponse = { invalid: 'data' };
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(invalidResponse),
      });

      const context = { turns: [] };
      const lastChoice = { questionId: 'init', optionId: 'test' };

      await expect(okrAgentService.getNextQuestion(context, lastChoice)).rejects.toThrow(
        'LLM response invalid after repair attempt',
      );
    });

    // 任务19.6: 修复尝试成功
    it('should succeed on retry when first attempt fails validation', async () => {
      const validResponse = {
        question: {
          id: 'q1',
          text: 'Question?',
          options: [{ id: 'opt1', label: 'Option' }],
        },
      };

      let callCount = 0;
      fetchMock.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(callCount === 1 ? { invalid: true } : validResponse),
        });
      });

      const context = { turns: [] };
      const lastChoice = { questionId: 'init', optionId: 'test' };

      const result = await okrAgentService.getNextQuestion(context, lastChoice);

      expect(result).toEqual(validResponse);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateDraft', () => {
    it('should call LLM API for draft generation', async () => {
      const mockResponse = {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: 'Test Objective',
              keyResults: [{ id: 'kr1', statement: 'KR1', target: '10', measurement: 'count' }],
            },
          ],
        },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const context = {
        turns: [{ questionId: 'q1', optionId: 'opt1', timestamp: new Date().toISOString() }],
      };

      const result = await okrAgentService.generateDraft(context);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/v1/responses',
        expect.objectContaining({
          body: expect.stringContaining('okr-draft'),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    // 任务19.6: 负面测试
    it('should throw error for invalid draft response', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ invalid: true }),
      });

      const context = { turns: [] };

      await expect(okrAgentService.generateDraft(context)).rejects.toThrow();
    });
  });

  // 任务19.7: 边界条件测试
  describe('边界条件', () => {
    it('should handle empty context turns', async () => {
      const mockResponse = {
        question: {
          id: 'q1',
          text: 'First question',
          options: [{ id: 'opt1', label: 'Option' }],
        },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await okrAgentService.getNextQuestion(
        { turns: [] },
        { questionId: 'init', optionId: 'test' },
      );

      expect(result).toEqual(mockResponse);
    });

    it('should handle many turns in context', async () => {
      const mockResponse = {
        draft: {
          objectives: [
            {
              id: 'o1',
              title: 'Objective',
              keyResults: [{ id: 'kr1', statement: 'KR', target: 1, measurement: 'count' }],
            },
          ],
        },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const manyTurns = Array.from({ length: 50 }, (_, i) => ({
        questionId: `q${i}`,
        optionId: `opt${i}`,
        timestamp: new Date().toISOString(),
      }));

      const result = await okrAgentService.generateDraft({ turns: manyTurns });

      expect(result).toEqual(mockResponse);
      // 验证请求体包含所有turns
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody.context.turns).toHaveLength(50);
    });

    it('should handle special characters in optionId', async () => {
      const mockResponse = {
        question: { id: 'q1', text: 'Question', options: [{ id: 'opt1', label: 'Option' }] },
      };

      fetchMock.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const specialOptionId = '🎯\n\r\t"\\';
      const result = await okrAgentService.getNextQuestion(
        { turns: [] },
        { questionId: 'init', optionId: specialOptionId },
      );

      expect(result).toEqual(mockResponse);
      const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(requestBody.lastChoice.optionId).toBe(specialOptionId);
    });
  });

  describe('默认值配置', () => {
    it('should use default values when env vars not set', async () => {
      delete process.env.LLM_API_KEY;
      delete process.env.LLM_BASE_URL;
      delete process.env.LLM_MODEL;

      const service = new OkrAgentService();

      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            question: { id: 'q1', text: 'Q', options: [{ id: 'opt1', label: 'Opt' }] },
          }),
      });

      await service.getNextQuestion({ turns: [] }, { questionId: 'init', optionId: 'test' });

      const call = fetchMock.mock.calls[0];
      expect(call[0]).toBe('https://api.openai.com/v1/responses');
      expect(JSON.parse(call[1].body).model).toBe('gpt-4o-mini');
    });

    it('should strip trailing slash from base URL', async () => {
      process.env.LLM_BASE_URL = 'https://api.test.com/';
      process.env.LLM_API_KEY = 'key';

      const service = new OkrAgentService();

      fetchMock.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            question: { id: 'q1', text: 'Q', options: [{ id: 'opt1', label: 'Opt' }] },
          }),
      });

      await service.getNextQuestion({ turns: [] }, { questionId: 'init', optionId: 'test' });

      const call = fetchMock.mock.calls[0];
      expect(call[0]).toBe('https://api.test.com/v1/responses');
    });
  });
});
