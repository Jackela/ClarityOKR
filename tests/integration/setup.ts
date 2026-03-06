import nock from 'nock';
import fetch from 'node-fetch';

beforeAll(() => {
  // Route global fetch through node-fetch so nock can intercept
  // @ts-ignore
  globalThis.fetch = fetch as any;
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
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});
