import { http, HttpResponse } from 'msw';
import type { MockResponseConfig, MockNextQuestionResponse } from '@clarityokr/contracts';

/**
 * MSW Request Log Entry
 */
interface RequestLogEntry {
  method: string;
  url: string;
  body: unknown;
  timestamp: number;
}

/**
 * Global state for mock responses
 * MSW handlers are static, so we use module-level state
 */
let responseConfig: MockResponseConfig = {};
let callCounter = 0;
const requestLog: RequestLogEntry[] = [];

/**
 * Configure mock responses
 */
export function setMockResponses(config: MockResponseConfig): void {
  responseConfig = config;
  callCounter = 0;
  requestLog.length = 0;
}

/**
 * Get request log
 */
export function getRequestLog(): RequestLogEntry[] {
  return [...requestLog];
}

/**
 * Create default next question response
 */
function createDefaultNextQuestion(): MockNextQuestionResponse {
  return {
    question: {
      id: `q${callCounter + 1}`,
      text: '再补充一个细节',
      options: [
        { id: 'a', label: 'A', value: 'a' },
        { id: 'b', label: 'B', value: 'b' },
      ],
    },
  };
}

/**
 * MSW Handlers for LLM API mocking
 */
export const handlers = [
  http.post('*/v1/responses', async ({ request }) => {
    const url = request.url;
    const body = (await request.json()) as Record<string, unknown>;

    callCounter++;
    requestLog.push({
      method: request.method,
      url,
      body,
      timestamp: Date.now(),
    });

    // Small delay to simulate network and ensure loading states are visible
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Check for global error config first
    if (responseConfig.error) {
      return new HttpResponse(JSON.stringify({ error: responseConfig.error.message }), {
        status: responseConfig.error.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Determine request type
    const isDraftRequest =
      body?.intent === 'draft' ||
      (body?.type as string) === 'okr-draft' ||
      ((body?.tool as string)?.includes?.('draft') ?? false);

    // Handle draft requests
    if (isDraftRequest) {
      if (responseConfig.draft) {
        return HttpResponse.json(responseConfig.draft);
      }
      // Return default draft
      return HttpResponse.json({
        draft: {
          objectives: [
            {
              id: 'o1',
              title: '提高执行力',
              keyResults: [
                { id: 'kr1', statement: '完成目标1', target: '100%', measurement: 'percent' },
                { id: 'kr2', statement: '完成目标2', target: '100%', measurement: 'percent' },
                { id: 'kr3', statement: '完成目标3', target: '100%', measurement: 'percent' },
              ],
            },
          ],
        },
      });
    }

    // Handle raw response (for malformed response testing)
    if (responseConfig.rawResponse !== undefined) {
      const raw =
        typeof responseConfig.rawResponse === 'function'
          ? responseConfig.rawResponse()
          : responseConfig.rawResponse;
      return new HttpResponse(raw, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle next question
    if (responseConfig.nextQuestion) {
      const response = responseConfig.nextQuestion(callCounter);
      if (response === null) {
        return new HttpResponse(JSON.stringify({ error: 'Service Unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (response !== undefined) {
        return HttpResponse.json(response);
      }
    }

    // Return default next question
    return HttpResponse.json(createDefaultNextQuestion());
  }),
];
