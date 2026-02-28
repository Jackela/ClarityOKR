import type { ClarifyOkrApi } from './window';

export function getClarityBridge(): ClarifyOkrApi {
  if (typeof window === 'undefined') {
    throw new Error('Window is not available');
  }

  const win = window as Window & { clarifyOkr?: ClarifyOkrApi };
  if (!win.clarifyOkr) {
    throw new Error('ClarityOKR IPC bridge is not available. Ensure preload script is loaded.');
  }
  return win.clarifyOkr;
}

export function getClarityBridgeOrUndefined(): ClarifyOkrApi | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const win = window as Window & { clarifyOkr?: ClarifyOkrApi };
  return win.clarifyOkr;
}
