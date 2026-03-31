// Jest setup file for integration tests
// This file runs before each test file

// Set required environment variables for main process OkrAgentService
process.env.LLM_API_KEY = 'test-api-key-for-integration-tests';
process.env.LLM_BASE_URL = 'https://llm.example.test';
process.env.LLM_MODEL = 'gpt-4o-mini';
process.env.NODE_ENV = 'test';
