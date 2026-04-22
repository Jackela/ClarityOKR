import { loadConfig, getConfig, resetConfig } from '../../../app/main/src/config/app-config.js';

describe('app-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    resetConfig();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetConfig();
  });

  describe('loadConfig', () => {
    it('returns default values when only LLM_API_KEY is set', () => {
      process.env.LLM_API_KEY = 'test-key';
      delete process.env.LLM_BASE_URL;
      delete process.env.LLM_MODEL;
      delete process.env.LLM_TIMEOUT_MS;
      delete process.env.DATA_DIR;

      const cfg = loadConfig();

      expect(cfg.llm.apiKey).toBe('test-key');
      expect(cfg.llm.baseUrl).toBe('https://api.openai.com');
      expect(cfg.llm.model).toBe('gpt-4o-mini');
      expect(cfg.llm.timeoutMs).toBe(5000);
      expect(cfg.dataDir).toMatch(/data$/);
    });

    it('reads all environment variables correctly', () => {
      process.env.LLM_API_KEY = 'custom-key';
      process.env.LLM_BASE_URL = 'https://custom.llm.com';
      process.env.LLM_MODEL = 'gpt-4';
      process.env.LLM_TIMEOUT_MS = '10000';
      process.env.DATA_DIR = '/custom/data';

      const cfg = loadConfig();

      expect(cfg.llm.apiKey).toBe('custom-key');
      expect(cfg.llm.baseUrl).toBe('https://custom.llm.com');
      expect(cfg.llm.model).toBe('gpt-4');
      expect(cfg.llm.timeoutMs).toBe(10000);
      expect(cfg.dataDir).toBe('/custom/data');
    });

    it('strips trailing slash from baseUrl', () => {
      process.env.LLM_API_KEY = 'test-key';
      process.env.LLM_BASE_URL = 'https://api.openai.com/';

      const cfg = loadConfig();

      expect(cfg.llm.baseUrl).toBe('https://api.openai.com');
    });

    it('throws when LLM_API_KEY is missing', () => {
      delete process.env.LLM_API_KEY;

      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('throws when LLM_API_KEY is empty', () => {
      process.env.LLM_API_KEY = '';

      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('throws when LLM_BASE_URL is invalid', () => {
      process.env.LLM_API_KEY = 'test-key';
      process.env.LLM_BASE_URL = 'not-a-url';

      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('throws when LLM_TIMEOUT_MS is not a positive integer', () => {
      process.env.LLM_API_KEY = 'test-key';
      process.env.LLM_TIMEOUT_MS = '-1';

      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('coerces LLM_TIMEOUT_MS from string to number', () => {
      process.env.LLM_API_KEY = 'test-key';
      process.env.LLM_TIMEOUT_MS = '15000';

      const cfg = loadConfig();

      expect(cfg.llm.timeoutMs).toBe(15000);
      expect(typeof cfg.llm.timeoutMs).toBe('number');
    });
  });

  describe('getConfig', () => {
    it('returns the same singleton instance on multiple calls', () => {
      process.env.LLM_API_KEY = 'singleton-key';

      const cfg1 = getConfig();
      const cfg2 = getConfig();

      expect(cfg1).toBe(cfg2);
    });

    it('reloads config after resetConfig is called', () => {
      process.env.LLM_API_KEY = 'first-key';

      const cfg1 = getConfig();
      expect(cfg1.llm.apiKey).toBe('first-key');

      resetConfig();
      process.env.LLM_API_KEY = 'second-key';

      const cfg2 = getConfig();
      expect(cfg2.llm.apiKey).toBe('second-key');
    });
  });
});
