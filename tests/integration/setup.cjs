/**
 * Jest setup file for integration tests
 * This file runs before each test file
 */

// Use dynamic import for ESM-only modules
let nock;
let fetch;

beforeAll(async () => {
  // Dynamic import for ESM-only modules
  const nockModule = await import('nock');
  nock = nockModule.default || nockModule;

  const fetchModule = await import('node-fetch');
  fetch = fetchModule.default || fetchModule;

  // Route global fetch through node-fetch so nock can intercept
  // @ts-expect-error - node-fetch and native fetch have different types
  globalThis.fetch = fetch;
  nock.disableNetConnect();
  // Allow localhost for any internal runtime interactions if needed
  nock.enableNetConnect('127.0.0.1');
  nock.enableNetConnect('localhost');

  // Set required environment variables for main process OkrAgentService
  process.env.LLM_API_KEY = 'test-api-key-for-integration-tests';
  process.env.LLM_BASE_URL = 'https://llm.example.test';
  process.env.LLM_MODEL = 'gpt-4o-mini';
});

afterEach(() => {
  nock?.cleanAll();
});

afterAll(() => {
  nock?.enableNetConnect();
});
