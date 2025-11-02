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
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(() => {
  nock.enableNetConnect();
});
