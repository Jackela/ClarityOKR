/**
 * Test data factory for creating consistent test data.
 * Centralizes test data creation to ensure consistency across tests.
 */

/**
 * Configuration for LLM mock responses
 */
export interface MockResponseConfig {
  /** Next question response function or static response */
  nextQuestion?: (callNumber: number) => QuestionResponse | null | undefined;
  /** Draft generation response */
  draft?: DraftResponse;
  /** Error response */
  error?: { status: number; message: string } | null;
  /** Raw response string for testing malformed responses */
  rawResponse?: string | (() => string);
}

/**
 * Question response structure
 */
export interface QuestionResponse {
  question: {
    id: string;
    text: string;
    options: Array<{
      id: string;
      label: string;
      value: string;
    }>;
  };
}

/**
 * Draft response structure
 */
export interface DraftResponse {
  objectives: Array<{
    id: string;
    title: string;
    description: string;
    keyResults: Array<{
      id: string;
      statement: string;
      target: string | number;
      measurement: string;
    }>;
  }>;
}

/**
 * Default test intents for clarification flow
 */
export const TestIntents = {
  /** Standard test intent */
  standard: '提高效率',
  /** Alternative test intent */
  alternative: '提高执行力',
  /** Network error test intent */
  networkError: 'Test network error',
  /** Retry test intent */
  retry: 'Test retry recovery',
  /** Invalid response test intent */
  invalidResponse: 'Test invalid response',
} as const;

/**
 * Default mock responses for common test scenarios
 */
export const DefaultMockResponses = {
  /**
   * Standard question sequence (2 questions then null)
   */
  standardQuestionSequence: (callNumber: number): QuestionResponse | null => {
    if (callNumber <= 2) {
      return {
        question: {
          id: `q${callNumber + 1}`,
          text: '请选择下一步',
          options: [
            { id: 'a', label: 'A', value: 'a' },
            { id: 'b', label: 'B', value: 'b' },
          ],
        },
      };
    }
    return null;
  },

  /**
   * Alternative question with different text
   */
  alternativeQuestion: (): QuestionResponse => ({
    question: {
      id: 'q2',
      text: '再补充一个细节',
      options: [
        { id: 'a', label: 'A', value: 'a' },
        { id: 'b', label: 'B', value: 'b' },
      ],
    },
  }),

  /**
   * Standard draft response
   */
  standardDraft: (): DraftResponse => ({
    objectives: [
      {
        id: 'o1',
        title: '提高效率',
        description: '自动生成',
        keyResults: [
          { id: 'kr1', statement: 'KR1', target: '10%', measurement: 'rate' },
          { id: 'kr2', statement: 'KR2', target: 5, measurement: 'count' },
          { id: 'kr3', statement: 'KR3', target: '2s', measurement: 'latency' },
        ],
      },
    ],
  }),

  /**
   * Alternative draft response with different objective
   */
  alternativeDraft: (): DraftResponse => ({
    objectives: [
      {
        id: 'o1',
        title: '提高执行力',
        description: '自动生成',
        keyResults: [
          { id: 'kr1', statement: 'KR1', target: '10%', measurement: 'rate' },
          { id: 'kr2', statement: 'KR2', target: 5, measurement: 'count' },
          { id: 'kr3', statement: 'KR3', target: '2s', measurement: 'latency' },
        ],
      },
    ],
  }),
} as const;

/**
 * Create a mock response configuration for a complete clarification flow
 * @param options - Configuration options
 * @returns Mock response configuration
 */
export function createCompleteFlowConfig(options?: {
  questionCount?: number;
  objectiveTitle?: string;
  keyResultCount?: number;
}): MockResponseConfig {
  const questionCount = options?.questionCount ?? 2;
  const objectiveTitle = options?.objectiveTitle ?? '提高效率';
  const keyResultCount = options?.keyResultCount ?? 3;

  return {
    nextQuestion: (callNumber: number): QuestionResponse | null => {
      if (callNumber < questionCount) {
        return {
          question: {
            id: `q${callNumber + 1}`,
            text: '请选择下一步',
            options: [
              { id: 'a', label: 'A', value: 'a' },
              { id: 'b', label: 'B', value: 'b' },
            ],
          },
        };
      }
      return null;
    },
    draft: {
      objectives: [
        {
          id: 'o1',
          title: objectiveTitle,
          description: '自动生成',
          keyResults: Array.from({ length: keyResultCount }, (_, i) => ({
            id: `kr${i + 1}`,
            statement: `KR${i + 1}`,
            target: i === 0 ? '10%' : i === 1 ? 5 : '2s',
            measurement: i === 0 ? 'rate' : i === 1 ? 'count' : 'latency',
          })),
        },
      ],
    },
  };
}

/**
 * Create a mock response configuration for network error scenarios
 * @returns Mock response configuration with error
 */
export function createNetworkErrorConfig(): MockResponseConfig {
  return {
    error: { status: 503, message: 'Service Unavailable' },
  };
}

/**
 * Create a mock response configuration for retry success scenarios
 * @returns Mock response configuration that fails once then succeeds
 */
export function createRetrySuccessConfig(): MockResponseConfig {
  let failCount = 0;

  return {
    nextQuestion: (): QuestionResponse | null => {
      failCount += 1;
      if (failCount <= 1) {
        return null; // Signal error for first call
      }
      return {
        question: {
          id: 'q1',
          text: 'Test question',
          options: [
            { id: 'a', label: 'Option A', value: 'a' },
            { id: 'b', label: 'Option B', value: 'b' },
          ],
        },
      };
    },
  };
}

/**
 * Create a mock response configuration for malformed JSON scenarios
 * @returns Mock response configuration with invalid JSON
 */
export function createMalformedJsonConfig(): MockResponseConfig {
  return {
    rawResponse: '{ invalid json }',
  };
}

/**
 * Create a mock response configuration for missing fields scenarios
 * @returns Mock response configuration with incomplete data
 */
export function createMissingFieldsConfig(): MockResponseConfig {
  return {
    rawResponse: JSON.stringify({ question: { id: 'q1' } }),
  };
}

/**
 * Create a mock response configuration for empty response scenarios
 * @returns Mock response configuration with empty response
 */
export function createEmptyResponseConfig(): MockResponseConfig {
  return {
    rawResponse: '',
  };
}

/**
 * Expected OKR structure for verification
 */
export interface ExpectedOKR {
  objective: string;
  keyResults: string[];
}

/**
 * Create expected OKR data for verification
 * @param options - Configuration options
 * @returns Expected OKR structure
 */
export function createExpectedOKR(options?: {
  objective?: string;
  keyResultCount?: number;
}): ExpectedOKR {
  const objective = options?.objective ?? '提高效率';
  const keyResultCount = options?.keyResultCount ?? 3;

  return {
    objective,
    keyResults: Array.from({ length: keyResultCount }, (_, i) => `KR${i + 1}`),
  };
}
