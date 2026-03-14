import type { ElectronApplication, Page, Route, Request } from '@playwright/test';
import type { MockResponseConfig } from '@clarityokr/contracts';

export type MockLLMConfig = MockResponseConfig;

export interface MockLLMFixture {
  setResponses: (config: MockLLMConfig) => void;
  getRequestLog: () => Array<{ method: string; url: string; body: unknown; timestamp: number }>;
  getCallCount: () => number;
}

export class ElectronMockManager {
  private electronApp: ElectronApplication;
  private config: MockLLMConfig = {};
  private callCounter = 0;
  private requestLog: Array<{
    method: string;
    url: string;
    body: unknown;
    timestamp: number;
  }> = [];

  constructor(electronApp: ElectronApplication) {
    this.electronApp = electronApp;
  }

  setConfig(config: MockLLMConfig): void {
    this.config = config;
    this.callCounter = 0;
    this.requestLog = [];
  }

  async setupRouteInterception(pages: Page[]): Promise<void> {
    // Intercept at page level for any renderer-initiated requests
    for (const page of pages) {
      await page.route('**/v1/responses', async (route, request) => {
        await this.handleRequest(route, request);
      });

      await page.route('**/v1/chat/completions', async (route, request) => {
        await this.handleRequest(route, request);
      });
    }
  }

  private async handleRequest(route: any, request: any): Promise<void> {
    this.callCounter++;

    const postData = request.postDataJSON();
    this.requestLog.push({
      method: request.method(),
      url: request.url(),
      body: postData,
      timestamp: Date.now(),
    });

    if (process.env.E2E_DEBUG === 'true') {
      console.log(`[mock-manager] Request #${this.callCounter}:`, postData);
    }

    // Apply delay if configured
    if (this.config.delay && this.config.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.delay));
    }

    const response = this.generateResponse(postData);

    await route.fulfill({
      status: response.status,
      headers: response.headers,
      body: response.body,
    });
  }

  private generateResponse(requestBody: unknown): {
    status: number;
    headers: Record<string, string>;
    body: string;
  } {
    const body = requestBody as Record<string, unknown> | null;
    const isDraftRequest = body?.intent === 'draft' || (body?.tool as string)?.includes?.('draft');

    // Handle draft requests
    if (isDraftRequest && this.config.draft) {
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: this.config.draft }),
      };
    }

    // Handle raw response
    if (this.config.rawResponse !== undefined) {
      const raw =
        typeof this.config.rawResponse === 'function'
          ? this.config.rawResponse()
          : this.config.rawResponse;
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: raw,
      };
    }

    // Handle nextQuestion with error signaling
    const nextQuestionFn = this.config.nextQuestion;
    if (nextQuestionFn) {
      const questionResponse = nextQuestionFn(this.callCounter);
      if (questionResponse === null) {
        return {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Service Unavailable' }),
        };
      }
      if (questionResponse !== undefined) {
        return {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(questionResponse),
        };
      }
    }

    // Handle global error config
    if (this.config.error) {
      return {
        status: this.config.error.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: this.config.error.message }),
      };
    }

    // Default response
    const defaultQuestion = {
      question: {
        id: `q${this.callCounter + 1}`,
        text: '再补充一个细节',
        options: [
          { id: 'a', label: 'A', value: 'a' },
          { id: 'b', label: 'B', value: 'b' },
        ],
      },
    };

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(defaultQuestion),
    };
  }

  getRequestLog(): Array<{ method: string; url: string; body: unknown; timestamp: number }> {
    return [...this.requestLog];
  }

  getCallCount(): number {
    return this.callCounter;
  }
}
