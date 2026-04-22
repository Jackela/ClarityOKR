import { ClarityOkrError } from './base.js';

/**
 * Error thrown when the Electron IPC bridge (window.clarifyOkr) is unavailable.
 *
 * Typically indicates the app is not running inside Electron or the preload
 * script failed to inject the bridge.
 */
export class BridgeUnavailableError extends ClarityOkrError {
  constructor() {
    super('ClarifyOKR bridge is unavailable.', {
      code: 'BRIDGE_UNAVAILABLE',
      statusCode: 503,
    });
  }
}
