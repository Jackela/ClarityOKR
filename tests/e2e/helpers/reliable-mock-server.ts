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

  // 🔴 FIX: Add pending request tracking properties
  private pendingRequests = 0;
  private pendingRequestsPromise: Promise<void> = Promise.resolve();
  private resolvePending!: () => void;

  async start(): Promise<number> {
    // Get a random available port
    this.port = await getPort();

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
      // 🔴 FIX: Track pending request
      this.pendingRequests++;
      if (this.pendingRequests === 1) {
        this.pendingRequestsPromise = new Promise(resolve => {
          this.resolvePending = resolve;
        });
      }

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
      try {
        await this.processRequest(req, res, parsedBody, requestId);
      } finally {
        // 🔴 FIX: Decrement pending and resolve if all done
        this.pendingRequests--;
        if (this.pendingRequests === 0) {
          this.resolvePending();
        }
      }
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
    // 🔴 FIX: Use shorter delay in CI
    const delay = process.env.CI ? 500 : 200;
    await new Promise((resolve) => setTimeout(resolve, delay));

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

      // Handle draft requests
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
          // Wrap response in ClarificationPromptResponse format if needed
          const response = questionResponse as Record<string, unknown>;
          if (response.question && !response.prompt) {
            // Old format - wrap it
            const wrappedResponse = {
              prompt: {
                id: (response.question as Record<string, unknown>).id ?? `q${this.callCounter}`,
                question: (response.question as Record<string, unknown>).text ?? 'Question',
                sequence: this.callCounter - 1,
                context: 'LLM generated',
                options: ((response.question as Record<string, unknown>).options as Array<Record<string, unknown>>)?.map((opt: Record<string, unknown>) => ({
                  id: opt.id,
                  label: opt.label,
                  scopeTag: opt.scopeTag ?? 'llm',
                  description: opt.description,
                })) ?? [],
              },
            };
            this.sendResponse(res, 200, wrappedResponse);
          } else {
            this.sendResponse(res, 200, questionResponse);
          }
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

      // Default response - must match ClarificationPromptResponse schema
      const defaultResponse = {
        prompt: {
          id: `q${this.callCounter + 1}`,
          question: '再补充一个细节',
          sequence: this.callCounter - 1,
          context: 'LLM generated',
          options: [
            { id: 'a', label: 'A', scopeTag: 'llm' },
            { id: 'b', label: 'B', scopeTag: 'llm' },
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

  // 🔴 FIX: Add wait method for pending requests
  async waitForPendingRequests(timeout = 5000): Promise<void> {
    if (this.pendingRequests === 0) return;

    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('waitForPendingRequests timeout')), timeout)
    );

    await Promise.race([this.pendingRequestsPromise, timeoutPromise]);
  }

  setResponses(config: MockResponseConfig): void {
    // 🔴 FIX: Now setResponses just sets config without waiting
    // Callers should call waitForPendingRequests first if needed
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
