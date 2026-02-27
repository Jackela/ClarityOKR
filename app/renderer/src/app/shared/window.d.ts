export interface ClarifyOkrApi {
  send: (channel: string, payload?: unknown) => void;
  invoke: (channel: string, payload?: unknown) => Promise<unknown>;
  on: (channel: string, listener: (event: unknown, payload: unknown) => void) => void;
}

declare global {
  interface Window {
    clarifyOkr?: ClarifyOkrApi;
  }
}

export {};
