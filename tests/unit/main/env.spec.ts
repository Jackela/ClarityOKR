import { getConfig, loadConfig, resetConfig } from '../../../app/main/src/config/app-config.js';

describe('AppConfig (getConfig, loadConfig)', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('throws if LLM_API_KEY is missing', () => {
    delete process.env.LLM_API_KEY;
    expect(() => loadConfig()).toThrow(/llm.apiKey: Required/);
  });

  it('returns config with defaults when only API key is present', () => {
    process.env.LLM_API_KEY = 'test-key';
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_TIMEOUT_MS;

    const cfg = loadConfig();
    expect(cfg.llm.apiKey).toBe('test-key');
    expect(cfg.llm.baseUrl).toBe('https://api.openai.com');
    expect(cfg.llm.model).toBe('gpt-4o-mini');
    expect(cfg.llm.timeoutMs).toBe(5000);
  });

  it('returns config with custom values when all env vars are set', () => {
    process.env.LLM_API_KEY = 'custom-key';
    process.env.LLM_BASE_URL = 'https://llm.example.test/';
    process.env.LLM_MODEL = 'gpt-4o';
    process.env.LLM_TIMEOUT_MS = '10000';

    const cfg = loadConfig();
    expect(cfg.llm.apiKey).toBe('custom-key');
    expect(cfg.llm.baseUrl).toBe('https://llm.example.test');
    expect(cfg.llm.model).toBe('gpt-4o');
    expect(cfg.llm.timeoutMs).toBe(10000);
  });

  it('getConfig returns singleton and strips trailing slash from baseUrl', () => {
    process.env.LLM_API_KEY = 'singleton-key';
    process.env.LLM_BASE_URL = 'https://api.example.com/';

    const cfg1 = getConfig();
    const cfg2 = getConfig();
    expect(cfg1).toBe(cfg2);
    expect(cfg1.llm.baseUrl).toBe('https://api.example.com');
  });
});
