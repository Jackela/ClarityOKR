import { getLlmConfig } from '../../../app/main/src/env.js';
import { resetConfig } from '../../../app/main/src/config/app-config.js';

describe('Main env loader (LLM config)', () => {
  beforeEach(() => {
    resetConfig();
  });

  afterEach(() => {
    resetConfig();
  });

  it('throws if LLM_API_KEY is missing', async () => {
    delete process.env.LLM_API_KEY;
    await expect(async () => getLlmConfig()).rejects.toThrow();
  });

  it('returns config when env is present', async () => {
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = 'https://llm.example.test';
    process.env.LLM_MODEL = 'gpt-4o-mini';
    const cfg = getLlmConfig();
    expect(cfg.apiKey).toBe('test-key');
    expect(cfg.baseUrl).toContain('http');
    expect(cfg.model).toBeTruthy();
  });
});
