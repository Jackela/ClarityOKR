// Mock for Electron modules
export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text: string) => Buffer.from(text),
  decryptString: (buffer: Buffer) => buffer.toString(),
};

// Mock BrowserWindow class
export class BrowserWindow {
  private eventHandlers: Map<string, Function[]> = new Map();
  
  constructor(public options: unknown) {}
  
  isDestroyed = jest.fn().mockReturnValue(false);
  isAlwaysOnTop = jest.fn().mockReturnValue(true);
  focus = jest.fn();
  show = jest.fn();
  loadFile = jest.fn().mockResolvedValue(undefined);
  setTitle = jest.fn();
  setAlwaysOnTop = jest.fn();
  setFullScreenable = jest.fn();
  setVisibleOnAllWorkspaces = jest.fn();
  
  on(event: string, handler: Function): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
    return this;
  }
  
  webContents = {
    send: jest.fn(),
    on: (event: string, handler: Function) => {
      if (!this.eventHandlers.has(event)) {
        this.eventHandlers.set(event, []);
      }
      this.eventHandlers.get(event)!.push(handler);
      return this.webContents;
    },
  };
  
  // Test helper to trigger events
  _triggerEvent(event: string, ...args: unknown[]): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.forEach(handler => handler(...args));
  }
}

export default { safeStorage, BrowserWindow };
