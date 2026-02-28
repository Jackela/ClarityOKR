import nock from 'nock';

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
