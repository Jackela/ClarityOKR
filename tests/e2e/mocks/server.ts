import { setupServer, SetupServerApi } from 'msw/node';
import { handlers } from './handlers.js';

/**
 * MSW Server instance for E2E tests
 */
let server: SetupServerApi | null = null;

/**
 * Start the MSW server
 */
export function startMSWServer(): void {
  if (server) {
    console.warn('[MSW] Server already running');
    return;
  }

  server = setupServer(...handlers);
  server.listen({ onUnhandledRequest: 'bypass' });
  console.log('[MSW] Server started');
}

/**
 * Stop the MSW server
 */
export function stopMSWServer(): void {
  if (!server) {
    console.warn('[MSW] Server not running');
    return;
  }

  server.close();
  server = null;
  console.log('[MSW] Server stopped');
}

/**
 * Reset handlers (useful between tests)
 */
export function resetMSWServer(): void {
  if (!server) {
    console.warn('[MSW] Server not running');
    return;
  }

  server.resetHandlers(...handlers);
  console.log('[MSW] Server reset');
}

// Re-export handler utilities
export { handlers };
export { setMockResponses, getRequestLog } from './handlers.js';
