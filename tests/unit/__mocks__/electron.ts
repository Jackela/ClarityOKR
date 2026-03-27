// Mock for Electron modules
import { jest } from '@jest/globals';

// Track created windows for test assertions
export const createdWindows: MockBrowserWindow[] = [];

export interface MockBrowserWindow {
  id: number;
  options: Record<string, unknown>;
  isDestroyed: ReturnType<typeof jest.fn>;
  isAlwaysOnTop: ReturnType<typeof jest.fn>;
  focus: ReturnType<typeof jest.fn>;
  show: ReturnType<typeof jest.fn>;
  loadFile: ReturnType<typeof jest.fn>;
  setTitle: ReturnType<typeof jest.fn>;
  setAlwaysOnTop: ReturnType<typeof jest.fn>;
  setFullScreenable: ReturnType<typeof jest.fn>;
  setVisibleOnAllWorkspaces: ReturnType<typeof jest.fn>;
  on: ReturnType<typeof jest.fn>;
  webContents: {
    send: ReturnType<typeof jest.fn>;
    on: ReturnType<typeof jest.fn>;
  };
  _eventHandlers: Map<string, Function[]>;
  _triggerEvent: (event: string, ...args: unknown[]) => void;
}

const createMockBrowserWindow = (options: Record<string, unknown>): MockBrowserWindow => {
  const eventHandlers = new Map<string, Function[]>();
  
  const mockWindow: MockBrowserWindow = {
    id: Math.random(),
    options,
    isDestroyed: jest.fn().mockReturnValue(false),
    isAlwaysOnTop: jest.fn().mockReturnValue(true),
    focus: jest.fn(),
    show: jest.fn(),
    loadFile: jest.fn().mockResolvedValue(undefined),
    setTitle: jest.fn(),
    setAlwaysOnTop: jest.fn(),
    setFullScreenable: jest.fn(),
    setVisibleOnAllWorkspaces: jest.fn(),
    on: jest.fn().mockImplementation((event: string, handler: Function) => {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, []);
      }
      eventHandlers.get(event)!.push(handler);
      return mockWindow;
    }),
    webContents: {
      send: jest.fn(),
      on: jest.fn().mockImplementation((event: string, handler: Function) => {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, []);
        }
        eventHandlers.get(event)!.push(handler);
        return mockWindow.webContents;
      }),
    },
    _eventHandlers: eventHandlers,
    _triggerEvent: (event: string, ...args: unknown[]) => {
      const handlers = eventHandlers.get(event) || [];
      handlers.forEach(handler => handler(...args));
    },
  };
  
  createdWindows.push(mockWindow);
  return mockWindow;
};

export const BrowserWindow = jest.fn().mockImplementation((options: Record<string, unknown>) => createMockBrowserWindow(options));

export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (text: string) => Buffer.from(text),
  decryptString: (buffer: Buffer) => buffer.toString(),
};

export default { BrowserWindow, safeStorage };
