describe('Main env loader (LLM config)', () => {
  it('throws if LLM_API_KEY is missing', async () => {
    // @ts-ignore - TDD import; to be implemented in app/main/src/env.ts
    const { getLlmConfig } = await import('../../../app/main/src/env.ts');
    delete process.env.LLM_API_KEY;
    await expect(async () => getLlmConfig()).rejects.toThrow();
  });

  it('returns config when env is present', async () => {
    // @ts-ignore - TDD import; to be implemented in app/main/src/env.ts
    const { getLlmConfig } = await import('../../../app/main/src/env.ts');
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = 'https://llm.example.test';
    process.env.LLM_MODEL = 'gpt-4o-mini';
    const cfg = getLlmConfig();
    expect(cfg.apiKey).toBe('test-key');
    expect(cfg.baseUrl).toContain('http');
    expect(cfg.model).toBeTruthy();
  });
});

