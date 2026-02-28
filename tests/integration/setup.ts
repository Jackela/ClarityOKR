import nock from 'nock';

// Mock browser globals for Node test environment
(global as any).window = {
  clarifyOkr: undefined,
};

(global as any).performance = {
  now: () => Date.now(),
};

(global as any).crypto = {
  randomUUID: () => 'mock-uuid-1234',
};

nock.disableNetConnect();

beforeAll(() => {
  process.env.LLM_API_KEY = 'test-api-key';
  process.env.LLM_BASE_URL = 'http://127.0.0.1:7777';
  process.env.LLM_MODEL = 'test-model';
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});
