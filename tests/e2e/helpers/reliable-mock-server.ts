import http from 'node:http';
import getPort from 'get-port';

export interface MockResponseConfig {
  nextQuestion?: (callNumber: number) => object | null | undefined;
  draft?: object;
  error?: { status: number; message: string } | null;
  rawResponse?: string | (() => string);
}

interface RequestLogEntry {
  method: string;
  url: string;
  body: unknown;
  timestamp: number;
}

export class ReliableMockServer {
  private server: http.Server | null = null;
  private port: number = 0;
  private callCounter = 0;
  private responseConfig: MockResponseConfig = {};
  private requestLog: RequestLogEntry[] = [];
  private pendingRequests = new Map<string, Promise<void>>();

  async start(port?: number): Promise<number> {
    // Use provided port or get a random available port
    this.port = port ?? (await getPort());

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

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

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

      // Log request
      this.requestLog.push({
        method: req.method ?? 'UNKNOWN',
        url: req.url ?? '/',
        body: parsedBody,
        timestamp: Date.now(),
      });

      if (process.env.E2E_DEBUG === 'true') {
        console.log(`[mock-server] Request #${this.callCounter + 1}:`, {
          method: req.method,
          url: req.url,
          body: parsedBody,
        });
      }

      // Handle request
      await this.processRequest(req, res, parsedBody, requestId);
    });

    req.on('error', (err) => {
      console.error('[mock-server] Request error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  }

  private async processRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    parsedBody: unknown,
    requestId: string,
  ): Promise<void> {
    // Add small delay to ensure loading indicator is visible for tests
    await new Promise((resolve) => setTimeout(resolve, 200));

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

      // Determine request type
      const body = parsedBody as Record<string, unknown> | null;
      const isDraftRequest =
        body?.intent === 'draft' || (body?.tool as string)?.includes?.('draft');

      // Handle draft requests - responseConfig.draft should already be { objectives: [...] }
      if (isDraftRequest && this.responseConfig.draft) {
        this.sendResponse(res, 200, { draft: this.responseConfig.draft });
        return;
      }

      // Handle raw response
      if (this.responseConfig.rawResponse !== undefined) {
        const raw =
          typeof this.responseConfig.rawResponse === 'function'
            ? this.responseConfig.rawResponse()
            : this.responseConfig.rawResponse;
        this.sendResponse(res, 200, null, raw);
        return;
      }

      // Handle nextQuestion with error signaling
      const nextQuestionFn = this.responseConfig.nextQuestion;
      if (nextQuestionFn) {
        const questionResponse = nextQuestionFn(this.callCounter);
        if (questionResponse === null) {
          this.sendResponse(res, 503, { error: 'Service Unavailable' });
          return;
        }
        if (questionResponse !== undefined) {
          // Return the response directly - it should match nextQuestionResponseSchema
          this.sendResponse(res, 200, questionResponse);
          return;
        }
      }

      // Handle global error config
      if (this.responseConfig.error) {
        this.sendResponse(res, this.responseConfig.error.status, {
          error: this.responseConfig.error.message,
        });
        return;
      }

      // Default response - must match nextQuestionResponseSchema
      const defaultResponse = {
        question: {
          id: `q${this.callCounter + 1}`,
          text: '再补充一个细节',
          options: [
            { id: 'a', label: 'A', value: 'a' },
            { id: 'b', label: 'B', value: 'b' },
          ],
        },
      };
      this.sendResponse(res, 200, defaultResponse);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private sendResponse(
    res: http.ServerResponse,
    status: number,
    body: object | null,
    rawBody?: string,
  ): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(rawBody ?? JSON.stringify(body));
  }

  setResponses(config: MockResponseConfig): void {
    this.responseConfig = config;
    this.callCounter = 0;
    this.requestLog = [];
  }

  getRequestLog(): RequestLogEntry[] {
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
