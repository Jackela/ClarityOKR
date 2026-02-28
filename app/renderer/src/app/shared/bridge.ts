import type { ClarifyOkrApi } from './window';

export function getClarityBridge(): ClarifyOkrApi {
  const bridge = (window as Window & { clarifyOkr?: ClarifyOkrApi }).clarifyOkr;
  if (!bridge) {
    throw new Error('ClarityOKR IPC bridge is not available. Ensure preload script is loaded.');
  }
  return bridge;
}

export function getClarityBridgeOrUndefined(): ClarifyOkrApi | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return window.clarifyOkr;
}
