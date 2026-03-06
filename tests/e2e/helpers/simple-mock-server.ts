import http from 'node:http';
import type { MockResponseConfig } from '@clarityokr/contracts';

/**
 * Simple HTTP Mock Server for E2E tests
 * Replaces the complex ReliableMockServer with a minimal implementation
 */
export class SimpleMockServer {
  private server: http.Server | null = null;
  private port: number = 0;
  private callCounter = 0;
  private responseConfig: MockResponseConfig = {};
  private requestLog: Array<{ method: string; url: string; body: unknown; timestamp: number }> = [];

  async start(port?: number): Promise<number> {
    this.port = port || 7777;

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, '127.0.0.1', () => {
        console.log(`[mock-server] Started on http://127.0.0.1:${this.port}`);
        resolve(this.port);
      });

      this.server!.on('error', (err) => {
        console.error('[mock-server] Failed to start:', err);
        reject(err);
      });
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      let parsedBody: unknown;
      try {
        parsedBody = body ? JSON.parse(body) : null;
      } catch {
        parsedBody = body;
      }

      this.requestLog.push({
        method: req.method ?? 'UNKNOWN',
        url: req.url ?? '/',
        body: parsedBody,
        timestamp: Date.now(),
      });

      // Increased delay to ensure loading indicator is visible in E2E tests
      // 1500ms ensures loading state is clearly visible before response
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.method === 'POST' && req.url?.includes('/v1/responses')) {
        this.callCounter++;

        const requestBody = parsedBody as Record<string, unknown> | null;
        const isDraftRequest =
          requestBody?.intent === 'draft' || (requestBody?.type as string) === 'okr-draft';

        // Handle global error
        if (this.responseConfig.error) {
          res.writeHead(this.responseConfig.error.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: this.responseConfig.error.message }));
          return;
        }

        // Handle draft
        if (isDraftRequest) {
          if (this.responseConfig.draft) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.responseConfig.draft));
            return;
          }
          // Default draft response
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
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
            }),
          );
          return;
        }

        // Handle raw response
        if (this.responseConfig.rawResponse !== undefined) {
          const raw =
            typeof this.responseConfig.rawResponse === 'function'
              ? this.responseConfig.rawResponse()
              : this.responseConfig.rawResponse;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(raw);
          return;
        }

        // Handle next question
        if (this.responseConfig.nextQuestion) {
          const response = this.responseConfig.nextQuestion(this.callCounter);
          if (response === null) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Service Unavailable' }));
            return;
          }
          if (response !== undefined) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(response));
            return;
          }
        }

        // Default next question
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            question: {
              id: `q${this.callCounter + 1}`,
              text: '再补充一个细节',
              options: [
                { id: 'a', label: 'A', value: 'a' },
                { id: 'b', label: 'B', value: 'b' },
              ],
            },
          }),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  }

  setResponses(config: MockResponseConfig): void {
    this.responseConfig = config;
    this.callCounter = 0;
    this.requestLog = [];
  }

  getRequestLog(): Array<{ method: string; url: string; body: unknown; timestamp: number }> {
    return [...this.requestLog];
  }

  getUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log(`[mock-server] Stopped on port ${this.port}`);
          this.server = null;
          resolve();
        });
      });
    }
  }
}
