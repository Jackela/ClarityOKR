import type { z } from 'zod';

import type {
  nextQuestionResponseSchema,
  okrDraftResponseSchema,
} from './validators/llm.schemas.js';

/**
 * E2E Testing Contracts
 *
 * This module defines the contracts between E2E tests and the mock server.
 * All types are derived from Zod schemas to ensure consistency.
 */

// Derive types from Zod schemas with Mock prefix to avoid conflicts
export type MockNextQuestionResponse = z.infer<typeof nextQuestionResponseSchema>;
export type MockOkrDraftResponse = z.infer<typeof okrDraftResponseSchema>;

/**
 * Mock response configuration for E2E tests
 * Used to configure the mock server's behavior
 */
export interface MockResponseConfig {
  /**
   * Configure next question responses
   * @param callNumber - The number of times this endpoint has been called (1-based)
   * @returns The response object, null for error, or undefined to use default
   */
  nextQuestion?: (callNumber: number) => MockNextQuestionResponse | null | undefined;

  /**
   * Configure draft responses
   * Provide the full response object or undefined to use default
   */
  draft?: MockOkrDraftResponse | null;

  /**
   * Configure error responses for all endpoints
   * When set, all requests will return this error
   */
  error?: {
    status: number;
    message: string;
  } | null;

  /**
   * Configure raw response (for testing malformed responses)
   * When set, returns this raw string directly without validation
   */
  rawResponse?: string | (() => string);
}

/**
 * Mock server interface exposed to tests
 */
export interface MockServer {
  /** The URL of the mock server */
  url: string;

  /** Configure response behavior */
  setResponses: (config: MockResponseConfig) => void;

  /** Get the log of all requests made to the server */
  getRequestLog: () => Array<{
    method: string;
    url: string;
    body: unknown;
    timestamp: number;
  }>;
}

/**
 * Request log entry type
 */
export interface RequestLogEntry {
  method: string;
  url: string;
  body: unknown;
  timestamp: number;
}
