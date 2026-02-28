import type { ClarifyOkrApi } from './window';

export function getClarityBridge(): ClarifyOkrApi {
  const win = window as unknown as Window & { clarifyOkr?: ClarifyOkrApi };
  const bridge = win.clarifyOkr;
  if (!bridge) {
    throw new Error('ClarityOKR IPC bridge is not available. Ensure preload script is loaded.');
  }
  return bridge;
}

export function getClarityBridgeOrUndefined(): ClarifyOkrApi | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const win = window as unknown as Window & { clarifyOkr?: ClarifyOkrApi };
  return win.clarifyOkr;
}
