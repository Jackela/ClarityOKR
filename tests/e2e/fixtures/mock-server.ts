import http from 'node:http';
import net from 'node:net';

export interface MockResponseConfig {
  nextQuestion?: (callNumber: number) => object | null;
  draft?: object;
  error?: { status: number; message: string } | null;
  rawResponse?: string | (() => string);
}

interface MockServer {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  getUrl: () => string;
  getPort: () => number;
  setResponses: (config: MockResponseConfig) => void;
  getRequestLog: () => Array<{ method: string; url: string; body: unknown }>;
}

function waitForPortReady(port: number, timeout = 5000): Promise<void> {
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() < deadline) {
          setTimeout(tryConnect, 100);
        } else {
          reject(new Error(`Port ${port} not ready after ${timeout}ms`));
        }
      });
      socket.connect(port, '127.0.0.1');
    };
    setTimeout(tryConnect, 50);
  });
}

export function createMockServer({ port }: { port: number }): MockServer {
  let callCounter = 0;
  let responseConfig: MockResponseConfig = {};
  const requestLog: Array<{ method: string; url: string; body: unknown }> = [];

  const server = http.createServer(async (req, res) => {
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

      requestLog.push({
        method: req.method ?? 'UNKNOWN',
        url: req.url ?? '/',
        body: parsedBody,
      });

      if (process.env.E2E_DEBUG === 'true') {
        console.log('[mock-server] Request:', req.method, req.url, parsedBody);
      }

      if (req.method === 'POST' && req.url?.includes('/v1/responses')) {
        callCounter += 1;

        if (responseConfig.rawResponse !== undefined) {
          const raw =
            typeof responseConfig.rawResponse === 'function'
              ? responseConfig.rawResponse()
              : responseConfig.rawResponse;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(raw);
          return;
        }

        if (responseConfig.error) {
          const errorResponse = JSON.stringify({ error: responseConfig.error.message });
          res.writeHead(responseConfig.error.status, { 'Content-Type': 'application/json' });
          res.end(errorResponse);
          return;
        }

        const nextQuestionFn = responseConfig.nextQuestion;
        if (nextQuestionFn) {
          const questionResponse = nextQuestionFn(callCounter);
          if (questionResponse) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(questionResponse));
            return;
          }
        }

        if (responseConfig.draft) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ draft: responseConfig.draft }));
          return;
        }

        const defaultQuestion = {
          question: {
            id: `q${callCounter + 1}`,
            text: '再补充一个细节',
            options: [
              { id: 'a', label: 'A', value: 'a' },
              { id: 'b', label: 'B', value: 'b' },
            ],
          },
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(defaultQuestion));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  });

  return {
    start: async () => {
      await new Promise<void>((resolve, reject) => {
        server.listen(port, '127.0.0.1', async () => {
          try {
            await waitForPortReady(port);
            console.log(`[mock-server] Listening on http://127.0.0.1:${port}`);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
        server.on('error', reject);
      });
    },
    stop: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          console.log(`[mock-server] Stopped on port ${port}`);
          resolve();
        });
      });
    },
    getUrl: () => `http://127.0.0.1:${port}`,
    getPort: () => port,
    setResponses: (config: MockResponseConfig) => {
      responseConfig = config;
      callCounter = 0;
    },
    getRequestLog: () => [...requestLog],
  };
}
